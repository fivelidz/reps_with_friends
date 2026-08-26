// RWF Hub — concierge ops console. Vanilla ES module, no build step.
// Polls /api/state every 3s, renders stats + matches table + activity feed
// (feed events derived by diffing successive polls). Degrades gracefully
// when fields are missing, the Qalarc hub is null, or matches are empty.

const POLL_MS = 3000;
const FEED_MAX = 60;

// ── Tiny DOM helpers (textContent only — never inject raw strings) ──
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

// ── Module state ─────────────────────────────────────────────────
let pollTimer = null;      // poll interval handle
let clockTimer = null;     // 1s ticker for "synced Ns ago"
let inFlight = false;      // guard against overlapping fetches
let serverOk = null;       // null = unknown, true/false = last poll result
let lastSyncAt = null;     // Date.now() of last successful poll
let lastState = null;      // last normalized state (for rendering)
let baseline = null;       // Map chatId -> snapshot, for feed diffing
let feedItems = [];        // [{ts, kind, text}] newest last
let expanded = new Set();  // chatIds with player rows shown
let feedPinnedToBottom = true;

// ── Formatting ───────────────────────────────────────────────────
function fmtNum(n) {
  return typeof n === "number" && isFinite(n) ? n.toLocaleString("en-AU") : "—";
}

function fmtMoney(cents) {
  if (typeof cents !== "number" || !isFinite(cents)) return "—";
  return "$" + (cents / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtUptime(sec) {
  if (typeof sec !== "number" || !isFinite(sec) || sec < 0) return "up —";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (x) => String(x).padStart(2, "0");
  return h > 0 ? `up ${h}:${pad(m)}:${pad(s)}` : `up ${pad(m)}:${pad(s)}`;
}

function fmtClock(ts) {
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtRel(ts) {
  if (typeof ts !== "number" || !isFinite(ts) || ts <= 0) return null;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Normalization (tolerate missing / null / malformed fields) ───
function normalize(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const matches = Array.isArray(src.matches) ? src.matches : [];

  const norm = matches
    .filter((m) => m && typeof m === "object" && typeof m.chatId === "string")
    .map((m) => ({
      chatId: m.chatId,
      platform: typeof m.platform === "string" ? m.platform : "unknown",
      crewCode: typeof m.crewCode === "string" ? m.crewCode : null,
      status: typeof m.status === "string" ? m.status : "unknown",
      targetReps: typeof m.targetReps === "number" ? m.targetReps : null,
      potCents: typeof m.potCents === "number" ? m.potCents : 0,
      leader: typeof m.leader === "string" ? m.leader : null,
      updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : null,
      players: (Array.isArray(m.players) ? m.players : [])
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          id: String(p.id ?? p.name ?? "?"),
          name: typeof p.name === "string" ? p.name : String(p.id ?? "?"),
          tier: typeof p.tier === "string" ? p.tier : "—",
          rawReps: typeof p.rawReps === "number" ? p.rawReps : 0,
          adjustedScore: typeof p.adjustedScore === "number" ? p.adjustedScore : 0,
          progressPct: typeof p.progressPct === "number" ? p.progressPct : 0,
          verifiedPct: typeof p.verifiedPct === "number" ? p.verifiedPct : 0,
        })),
    }));

  // Sort: live first, then open, then complete, then anything else; newest update first within group.
  const rank = { live: 0, open: 1, complete: 2 };
  norm.sort((a, b) =>
    (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
    (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );

  return {
    server: src.server && typeof src.server === "object" ? src.server : {},
    qalarcHub: src.qalarcHub && typeof src.qalarcHub === "object" ? src.qalarcHub : null,
    bots: {
      whatsapp: normBot(src.bots?.whatsapp),
      slack: normBot(src.bots?.slack),
    },
    matches: norm,
  };
}

function normBot(b) {
  return {
    running: b?.running === true,
    lastSeen: typeof b?.lastSeen === "number" ? b.lastSeen : null,
  };
}

// ── Feed diffing ─────────────────────────────────────────────────
function snapshotOf(m) {
  return {
    crewCode: m.crewCode,
    platform: m.platform,
    status: m.status,
    leader: m.leader,
    playerIds: new Set(m.players.map((p) => p.id)),
  };
}

function diffEvents(prevMap, matches) {
  const events = [];
  const nextMap = new Map();

  for (const m of matches) {
    const snap = snapshotOf(m);
    nextMap.set(m.chatId, snap);
    const label = m.crewCode ?? m.chatId;
    const prev = prevMap ? prevMap.get(m.chatId) : undefined;

    if (!prev) {
      events.push({ kind: "created", text: `Match ${label} created · ${m.platform}` });
      if (m.status === "live") {
        events.push({ kind: "started", text: `Match ${label} started` });
      } else if (m.status === "complete") {
        events.push({ kind: "completed", text: `Match ${label} completed` });
      }
      continue;
    }

    if (prev.status !== m.status) {
      if (m.status === "live") events.push({ kind: "started", text: `Match ${label} started` });
      else if (m.status === "complete") events.push({ kind: "completed", text: `Match ${label} completed` });
      else events.push({ kind: "status", text: `Match ${label} status → ${m.status}` });
    }

    if (prev.leader && m.leader && prev.leader !== m.leader) {
      events.push({ kind: "leader", text: `${m.leader} takes the lead in ${label} (was ${prev.leader})` });
    }

    for (const p of m.players) {
      if (!prev.playerIds.has(p.id)) {
        events.push({ kind: "joined", text: `${p.name} joined ${label}` });
      }
    }
    for (const id of prev.playerIds) {
      if (!snap.playerIds.has(id)) {
        const name = m.players.find((p) => p.id === id)?.name ?? id;
        events.push({ kind: "left", text: `${name} left ${label}` });
      }
    }
  }

  if (prevMap) {
    for (const [chatId, snap] of prevMap) {
      if (!nextMap.has(chatId)) {
        events.push({ kind: "removed", text: `Match ${snap.crewCode ?? chatId} removed from store` });
      }
    }
  }

  return { events, nextMap };
}

function pushEvents(events) {
  const ts = Date.now();
  for (const e of events) feedItems.push({ ts, kind: e.kind, text: e.text });
  if (feedItems.length > FEED_MAX) feedItems = feedItems.slice(-FEED_MAX);
}

// ── Renderers ────────────────────────────────────────────────────
function setDot(id, state, title) {
  const node = $(id);
  if (!node) return;
  const dot = node.querySelector(".rwf-dot");
  if (!dot) return;
  dot.className = "rwf-dot " + (state === "ok" ? "rwf-dot--ok" : state === "down" ? "rwf-dot--down" : "rwf-dot--idle");
  node.title = title ?? "";
}

function renderTopbar(st) {
  // Server dot reflects OUR fetch result (serverOk), not the payload.
  setDot("dot-server", serverOk === null ? "idle" : serverOk ? "ok" : "down",
    serverOk === null ? "connecting…" : serverOk
      ? `serving on :${st.server?.port ?? "?"}`
      : "/api/state unreachable");

  const hub = st.qalarcHub;
  if (hub && hub.ok === true) {
    const sig = hub.signal === true ? "signal ✓" : "signal ✗";
    const wa = hub.whatsapp === true ? "whatsapp ✓" : "whatsapp ✗";
    setDot("dot-hub", "ok", `Qalarc Hub healthy · ${sig} · ${wa}`);
  } else if (hub) {
    setDot("dot-hub", "down", "Qalarc Hub reporting unhealthy");
  } else {
    setDot("dot-hub", "down", "Qalarc Hub unreachable (:8769)");
  }

  for (const [key, id] of [["whatsapp", "dot-whatsapp"], ["slack", "dot-slack"]]) {
    const b = st.bots[key];
    if (b.running) {
      setDot(id, "ok", `${key} bot running · last seen ${fmtRel(b.lastSeen) ?? "—"}`);
    } else if (b.lastSeen) {
      setDot(id, "down", `${key} bot stale · last seen ${fmtRel(b.lastSeen) ?? "—"}`);
    } else {
      setDot(id, "idle", `${key} bot never seen`);
    }
  }

  $("uptime").textContent = serverOk ? fmtUptime(st.server?.uptimeSec) : "up —";
}

function renderSync() {
  const node = $("sync");
  if (!node) return;
  if (serverOk === null) { node.textContent = "connecting…"; node.className = "sync mono"; return; }
  if (!serverOk) {
    node.textContent = "SYNC LOST";
    node.className = "sync mono sync--err";
    return;
  }
  const rel = fmtRel(lastSyncAt) ?? "—";
  node.textContent = `synced ${rel}`;
  node.className = "sync mono";
}

function renderStats(st) {
  const live = st.matches.filter((m) => m.status === "live");
  const livePlayers = live.reduce((s, m) => s + m.players.length, 0);
  const allPlayers = st.matches.reduce((s, m) => s + m.players.length, 0);
  const repsToday = live.reduce(
    (s, m) => s + m.players.reduce((x, p) => x + (p.rawReps || 0), 0), 0);
  const adjToday = live.reduce(
    (s, m) => s + m.players.reduce((x, p) => x + (p.adjustedScore || 0), 0), 0);
  const potsTotal = st.matches.reduce((s, m) => s + (m.potCents || 0), 0);

  const root = $("stats");
  if (!root) return;
  root.replaceChildren();

  const cards = [
    { label: "Live matches", value: fmtNum(live.length), accent: true,
      sub: `${st.matches.length} total in store` },
    { label: "Players active", value: fmtNum(livePlayers), accent: false,
      sub: `${fmtNum(allPlayers)} across all matches` },
    { label: "Total reps today", value: fmtNum(Math.round(repsToday)), accent: false,
      sub: `adjusted ${fmtNum(Math.round(adjToday))}` },
    { label: "Charity pots", value: fmtMoney(potsTotal), accent: false,
      sub: `${st.matches.length} pot${st.matches.length === 1 ? "" : "s"}` },
  ];

  for (const c of cards) {
    const card = el("div", "stat");
    card.append(
      el("div", "stat-label", c.label),
      el("div", "stat-value" + (c.accent ? " stat-value--accent" : ""), c.value),
      el("div", "stat-sub", c.sub),
    );
    root.append(card);
  }
}

function statusPill(status) {
  const known = ["live", "open", "complete"].includes(status);
  const pill = el("span", "m-status m-status--" + (known ? status : "unknown"));
  pill.append(el("i", "sdot"));
  pill.append(status.toUpperCase());
  return pill;
}

function platformCell(platform) {
  const wrap = el("span", "m-platform");
  const dot = el("i", "plat-dot plat-dot--" + (["whatsapp", "slack"].includes(platform) ? platform : "unknown"));
  wrap.append(dot, platform === "whatsapp" ? "WhatsApp" : platform === "slack" ? "Slack" : platform);
  return wrap;
}

function renderMatches(st) {
  const root = $("matches");
  if (!root) return;
  root.replaceChildren();

  $("matches-sub").textContent = st.matches.length
    ? `${st.matches.filter((m) => m.status === "live").length} live / ${st.matches.length}`
    : "—";

  if (!st.matches.length) {
    const empty = el("div", "empty");
    empty.append(
      el("div", "empty-glyph", "◇"),
      el("div", null, "No matches in the store yet."),
      el("div", "empty-hint", "Crews appear here the moment bots create a match."),
    );
    root.append(empty);
    return;
  }

  // Header row
  const head = el("div", "mrow-head");
  for (const [label, cls] of [
    ["Crew", ""], ["Platform", ""], ["Status", ""], ["Leader", ""],
    ["Players", "num"], ["Pot", "num"], ["Updated", "num"], ["", ""],
  ]) {
    head.append(el("span", cls, label));
  }
  root.append(head);

  for (const m of st.matches) {
    root.append(matchRow(m));
    if (expanded.has(m.chatId)) {
      for (const p of m.players) root.append(playerRow(p, m));
      if (!m.players.length) {
        const none = el("div", "prow");
        const cell = el("span", "p-name", "No players yet.");
        cell.style.color = "var(--faint)";
        none.append(cell, el("span"), el("span"), el("span"), el("span"));
        root.append(none);
      }
    }
  }
}

function matchRow(m) {
  const row = el("div", "mrow" + (expanded.has(m.chatId) ? " expanded" : ""));
  row.setAttribute("role", "row");
  row.setAttribute("tabindex", "0");
  row.dataset.chatId = m.chatId;

  const crew = el("span", "m-crew" + (m.crewCode ? "" : " m-crew--none"), m.crewCode ?? "—");
  crew.title = m.chatId;
  row.append(crew);

  row.append(platformCell(m.platform));
  row.append(statusPill(m.status));

  // Leader + progress bar (leader = top adjusted scorer, per /api/state)
  const leaderCell = el("div", "m-leader");
  const nameLine = el("div", "m-leader-name");
  if (m.leader) {
    const lead = m.players[0];
    nameLine.append(m.leader);
    if (lead && m.targetReps) {
      nameLine.append(` · ${fmtNum(Math.round(lead.rawReps))}/${fmtNum(m.targetReps)}`);
    }
  } else {
    nameLine.append(el("span", "none", m.players.length ? "—" : "no players"));
  }
  const bar = el("div", "m-bar");
  const pct = Math.max(0, Math.min(100, m.players[0]?.progressPct ?? 0));
  const fill = el("div", "m-bar-fill" + (m.status === "complete" ? " m-bar-fill--done" : ""));
  fill.style.width = pct + "%";
  bar.append(fill);
  leaderCell.append(nameLine, bar);
  row.append(leaderCell);

  row.append(el("span", "m-players", String(m.players.length)));
  row.append(el("span", "m-pot", fmtMoney(m.potCents)));
  row.append(el("span", "m-updated", fmtRel(m.updatedAt) ?? "—"));
  row.append(el("span", "m-chev", "▶"));

  const toggle = () => {
    if (expanded.has(m.chatId)) expanded.delete(m.chatId);
    else expanded.add(m.chatId);
    if (lastState) renderMatches(lastState);
  };
  row.addEventListener("click", toggle);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  return row;
}

function playerRow(p, m) {
  const row = el("div", "prow");
  row.setAttribute("role", "row");

  const name = el("span", "p-name");
  if (m.leader && p.name === m.leader) name.append(el("span", "lead-mark", "★"));
  name.append(p.name);
  name.title = `id ${p.id}`;
  row.append(name);

  const tier = el("span", "p-tier", p.tier);
  const mult = { couch: "×1.50", casual: "×1.25", fit: "×1.00", athlete: "×0.85" }[p.tier];
  if (mult) tier.title = `multiplier ${mult}`;
  row.append(tier);

  row.append(el("span", "p-raw", fmtNum(Math.round(p.rawReps))));
  row.append(el("span", "p-adj", fmtNum(Math.round(p.adjustedScore))));

  const ver = el("span",
    "p-ver" + (p.verifiedPct >= 100 ? " p-ver--full" : p.verifiedPct < 50 ? " p-ver--low" : ""),
    p.verifiedPct + "%");
  ver.title = "verified share of raw reps";
  row.append(ver);
  return row;
}

function renderFeed() {
  const root = $("feed");
  if (!root) return;

  const scroll = root.parentElement;
  if (scroll) {
    feedPinnedToBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
  }

  root.replaceChildren();
  if (!feedItems.length) {
    root.append(el("div", "feed-empty", "No activity yet — events appear as state changes between polls."));
    return;
  }

  // Newest first.
  for (let i = feedItems.length - 1; i >= 0; i--) {
    const it = feedItems[i];
    const item = el("div", "fitem");
    item.append(
      el("span", "f-ts", fmtClock(it.ts)),
      el("span", "f-kind f-kind--" + it.kind, it.kind),
      el("span", "f-text", it.text),
    );
    root.append(item);
  }

  if (feedPinnedToBottom && scroll) scroll.scrollTop = 0; // newest is at top
}

// ── Poll loop ────────────────────────────────────────────────────
async function poll() {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const raw = await res.json();

    const st = normalize(raw);
    const wasOk = serverOk;
    serverOk = true;
    lastSyncAt = Date.now();

    const { events, nextMap } = diffEvents(baseline, st.matches);
    if (baseline !== null) pushEvents(events); // first poll = baseline, no noise
    baseline = nextMap;

    if (!wasOk && wasOk !== null) {
      feedItems.push({ ts: Date.now(), kind: "restored", text: "Sync restored — connection to /api/state back online" });
    }

    lastState = st;
    renderTopbar(st);
    renderStats(st);
    renderMatches(st);
    renderFeed();
    renderSync();

    const liveCount = st.matches.filter((m) => m.status === "live").length;
    document.title = liveCount > 0
      ? `RWF Hub — ${liveCount} live`
      : "RWF Hub — Ops Console";
  } catch (err) {
    const wasOk = serverOk;
    serverOk = false;
    if (wasOk === true) {
      feedItems.push({ ts: Date.now(), kind: "error", text: "Sync lost — /api/state unreachable (" + (err?.message ?? "network error") + ")" });
    }
    if (lastState) renderTopbar(lastState); // keep data, flip dots
    renderFeed(); // show the sync-lost event immediately
    renderSync();
  } finally {
    inFlight = false;
  }
}

function start() {
  poll();
  pollTimer = setInterval(poll, POLL_MS);
  clockTimer = setInterval(renderSync, 1000); // age the "synced Ns ago" label
}

function stop() {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
  if (clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
}

// Clean up intervals when the page goes away (no leaked poll loop).
addEventListener("pagehide", stop);
addEventListener("beforeunload", stop);

start();
