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

// ══════════════════════════════════════════════════════════════════
// CORPORATE TAB — org leagues, employer-funded pots, aggregate
// wellbeing, renewal outlook. Informed by the founder's background
// building company wellness systems & EAPs at Sahha: aggregate-only
// reporting (k-anonymity), HR-friendly framing, employer-funded
// incentives. No employee money, no individual health data.
// ══════════════════════════════════════════════════════════════════

// ── Tab shell (Operations ↔ Corporate) ──────────────────────────
// Both <main> panels stay in the DOM; switching toggles `hidden`
// only, so each tab's state (expanded rows, scroll) is preserved.
const TAB_IDS = ["ops", "corporate"];
let activeTab = "ops";

function switchTab(name) {
  if (!TAB_IDS.includes(name) || name === activeTab) return;
  activeTab = name;
  for (const t of TAB_IDS) {
    const panel = $("tab-" + t);
    if (panel) {
      if (t === name) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }
    const btn = $("tabbtn-" + t);
    if (btn) {
      btn.classList.toggle("tabbtn--active", t === name);
      btn.setAttribute("aria-selected", t === name ? "true" : "false");
    }
  }
}

function wireTabs() {
  for (const btn of document.querySelectorAll(".tabbtn")) {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }
}

// ── SEED DATA — replace with org API ────────────────────────────
// Static demo seed for the Corporate tab. Crew `code` values are
// joined against live /api/state matches (by crewCode) so real match
// activity augments these standings; every other field is mock until
// an org API exists. Do not treat as source of truth.
const ORG_SEED = [
  {
    slug: "kalarc-group", name: "Kalarc Group",
    slackInstalled: true, headcount: 46, participationPct: 78,
    crews: [
      { code: "KX4T9C", name: "Finance floor", seasonPoints: 148 },
      { code: "7PQM2D", name: "Ops crew",      seasonPoints: 132 },
      { code: "VB8N1R", name: "Sales pit",     seasonPoints: 121 },
      { code: "QW3E9L", name: "Dev den",       seasonPoints: 96 },
    ],
    pot: { monthlyBudgetCents: 150000, contributedCents: 97500, matchesSponsored: 11 },
    renewalDate: "2026-11-24",
  },
  {
    slug: "wollongong-steel", name: "Wollongong Steel",
    slackInstalled: true, headcount: 22, participationPct: 64,
    crews: [
      { code: "ST8L4M", name: "Fabrication", seasonPoints: 117 },
      { code: "R2D9WX", name: "Yard crew",   seasonPoints: 88 },
    ],
    pot: { monthlyBudgetCents: 80000, contributedCents: 52000, matchesSponsored: 6 },
    renewalDate: "2026-10-15",
  },
  {
    slug: "test-corp", name: "Test Corp",
    slackInstalled: false, headcount: 9, participationPct: 41,
    crews: [
      { code: "TZ1X0B", name: "Pilot crew", seasonPoints: 34 },
    ],
    pot: { monthlyBudgetCents: 25000, contributedCents: 8000, matchesSponsored: 2 },
    renewalDate: "2026-09-12",
  },
];

const EFFORT_TREND_SEED = [212, 228, 219, 241, 236, 252, 248, 261]; // avg adjusted score / player / week, oldest → newest
const CHARITY_BASELINE_CENTS = 124000; // seeded donations paid out to date
const WEEKLY_ACTIVE_CREWS_SEED = 5;    // crews active this week (seed)
const K_ANON = 5;                      // k-anonymity floor: aggregates of 5+ only

let corpModel = null;      // last corporate model (for org-row re-expand)
let expandedOrgs = new Set(); // org slugs with crew rows shown

// ── Corporate helpers ───────────────────────────────────────────
function fmtMoneyShort(cents) {
  if (typeof cents !== "number" || !isFinite(cents)) return "—";
  return "$" + Math.round(cents / 100).toLocaleString("en-AU");
}

function daysUntil(dateStr) {
  const t = Date.parse(dateStr);
  if (!isFinite(t)) return null;
  return Math.max(0, Math.round((t - Date.now()) / 86400000));
}

function renewalRec(o) {
  if (o.participationPct >= 70) return { text: "expand to 2 more teams", short: "expand +2 teams", tone: "good" };
  if (o.participationPct >= 45) return { text: "hold — re-engage lapsed crews", short: "hold · re-engage", tone: "hold" };
  return { text: "at-risk — schedule retention review", short: "retention review", tone: "risk" };
}

// Join ORG_SEED with live /api/state matches (crewCode → crew).
function buildCorporateModel(st) {
  const seededCodes = new Set(ORG_SEED.flatMap((o) => o.crews.map((c) => c.code)));

  const orgs = ORG_SEED.map((o) => {
    const crews = o.crews.map((c) => ({
      ...c,
      liveMatch: st.matches.find((m) => m.crewCode === c.code && m.status === "live") ?? null,
    }));
    const liveMatches = st.matches.filter((m) => o.crews.some((c) => c.code === m.crewCode));
    return {
      ...o, crews, liveMatches,
      points: crews.reduce((s, c) => s + c.seasonPoints, 0),
      liveCrews: crews.filter((c) => c.liveMatch).length,
      livePlayers: liveMatches.reduce((s, m) => s + m.players.length, 0),
      livePotCents: liveMatches.reduce((s, m) => s + (m.potCents || 0), 0),
      daysToRenewal: daysUntil(o.renewalDate),
      rec: renewalRec(o),
    };
  }).sort((a, b) => b.points - a.points); // standings by aggregate season points

  // Wellbeing aggregates — player-derived numbers only when ≥ K_ANON players.
  const totalHead = orgs.reduce((s, o) => s + o.headcount, 0);
  const participationPct = totalHead
    ? Math.round(orgs.reduce((s, o) => s + o.participationPct * o.headcount, 0) / totalHead)
    : 0;
  const totalCrews = orgs.reduce((s, o) => s + o.crews.length, 0);

  const unseededLiveCrews = new Set(
    st.matches
      .filter((m) => m.status === "live" && m.crewCode && !seededCodes.has(m.crewCode))
      .map((m) => m.crewCode));
  const weeklyActiveCrews = WEEKLY_ACTIVE_CREWS_SEED + unseededLiveCrews.size;

  const livePlayersAll = st.matches.filter((m) => m.status === "live").flatMap((m) => m.players);
  const trend = EFFORT_TREND_SEED.slice();
  let trendLive = false;
  if (livePlayersAll.length >= K_ANON) {
    trend[trend.length - 1] = Math.round(
      livePlayersAll.reduce((s, p) => s + (p.adjustedScore || 0), 0) / livePlayersAll.length);
    trendLive = true;
  }
  const trendDelta = trend.length > 1 ? trend[trend.length - 1] - trend[trend.length - 2] : 0;

  const charityCents = CHARITY_BASELINE_CENTS
    + st.matches.reduce((s, m) => s + (m.potCents || 0), 0);

  const byRenewal = orgs
    .filter((o) => o.daysToRenewal !== null)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);

  return {
    orgs,
    wb: { participationPct, totalHead, totalCrews, weeklyActiveCrews, trend, trendDelta, trendLive, charityCents },
    renewal: { nearest: byRenewal[0] ?? null, orgs: byRenewal },
  };
}

// Pure-SVG sparkline (no libs). Returns an <svg> element.
function sparkline(values, w, h) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("spark");

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (w - 6) + 3,
    h - 4 - ((v - min) / span) * (h - 10),
  ]);

  const poly = document.createElementNS(NS, "polyline");
  poly.setAttribute("points", pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" "));
  poly.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(poly);

  const last = pts[pts.length - 1];
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("cx", last[0].toFixed(1));
  dot.setAttribute("cy", last[1].toFixed(1));
  dot.setAttribute("r", "2.4");
  svg.append(dot);
  return svg;
}

// ── Corporate renderers ─────────────────────────────────────────
function renderWellbeing(model) {
  const root = $("wb-stats");
  if (!root) return;
  const wb = model.wb;
  root.replaceChildren();

  const sub = $("wellbeing-sub");
  if (sub) sub.textContent = `k ≥ ${K_ANON} · ${model.orgs.length} orgs · seed + live`;

  const trendNow = wb.trend[wb.trend.length - 1] ?? "—";
  const cards = [
    { label: "Participation rate", value: wb.participationPct + "%", accent: true,
      sub: `${fmtNum(wb.totalHead)} people · ${model.orgs.length} orgs` },
    { label: "Weekly active crews", value: fmtNum(wb.weeklyActiveCrews), accent: false,
      sub: `of ${wb.totalCrews} crews · seed + live` },
    { label: "Effort trend", value: fmtNum(trendNow), accent: false,
      sub: `${wb.trendDelta >= 0 ? "+" : ""}${wb.trendDelta} vs prior week${wb.trendLive ? " · live" : ""}`,
      subCls: "trend-delta trend-delta--" + (wb.trendDelta >= 0 ? "up" : "down"),
      spark: wb.trend },
    { label: "Charity total", value: fmtMoneyShort(wb.charityCents), accent: false,
      sub: "seed payouts + live pots" },
  ];

  for (const c of cards) {
    const card = el("div", "stat");
    card.append(
      el("div", "stat-label", c.label),
      el("div", "stat-value" + (c.accent ? " stat-value--accent" : ""), c.value),
      el("div", c.subCls ?? "stat-sub", c.sub),
    );
    if (c.spark) {
      card.append(sparkline(c.spark, 220, 44));
      const lbl = el("div", "spark-labels");
      lbl.append(el("span", null, "8 wks ago"), el("span", null, "now"));
      card.append(lbl);
    }
    root.append(card);
  }
}

function installPill(o) {
  if (o.slackInstalled) {
    const p = el("span", "opill opill--slack");
    p.append(el("i", "sdot"), "SLACK ✓");
    return p;
  }
  const p = el("span", "opill opill--pending");
  p.append(el("i", "sdot"), "INSTALL PENDING");
  p.title = "Slack workspace not yet connected — matches stay on WhatsApp";
  return p;
}

function crewRow(c) {
  const row = el("div", "orow crow");
  row.setAttribute("role", "row");
  row.append(el("span", "o-indent", "·"));

  const crew = el("span", "o-crew");
  crew.append(el("span", "o-crewcode", c.code), el("span", "o-crewname", c.name));
  row.append(crew);

  row.append(el("span", "o-num o-dim", "—"));
  row.append(el("span", "o-num o-pts", fmtNum(c.seasonPoints)));

  if (c.liveMatch) {
    const p = el("span", "opill opill--live");
    p.append(el("i", "sdot"), `LIVE · ${c.liveMatch.players.length}`);
    p.title = `live now · pot ${fmtMoneyShort(c.liveMatch.potCents)}`;
    row.append(p);
  } else {
    row.append(el("span", "o-num o-dim", "—"));
  }

  row.append(el("span", "o-num o-dim", "—"));
  row.append(el("span"));
  return row;
}

function renderOrgs(model) {
  const root = $("orgs");
  if (!root) return;
  root.replaceChildren();

  const sub = $("orgs-sub");
  if (sub) sub.textContent = `${model.orgs.length} orgs · ${model.wb.totalCrews} crews · seed + live`;

  const head = el("div", "orow orow-head");
  for (const [label, cls] of [
    ["#", ""], ["Org", ""], ["Crews", "num"], ["Season pts", "num"],
    ["Live", "num"], ["Install", ""], ["", ""],
  ]) {
    head.append(el("span", cls, label));
  }
  root.append(head);

  model.orgs.forEach((o, i) => {
    const isOpen = expandedOrgs.has(o.slug);
    const row = el("div", "orow" + (isOpen ? " expanded" : ""));
    row.setAttribute("role", "row");
    row.setAttribute("tabindex", "0");
    row.append(
      el("span", "o-rank mono", String(i + 1)),
      el("span", "o-name", o.name),
      el("span", "o-num", String(o.crews.length)),
      el("span", "o-num o-pts", fmtNum(o.points)),
      el("span", "o-num", `${o.liveCrews}/${o.crews.length}`),
      installPill(o),
      el("span", "m-chev", "▶"),
    );

    const toggle = () => {
      if (expandedOrgs.has(o.slug)) expandedOrgs.delete(o.slug);
      else expandedOrgs.add(o.slug);
      if (corpModel) renderOrgs(corpModel);
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    root.append(row);

    if (isOpen) {
      const crews = o.crews.slice().sort((a, b) => b.seasonPoints - a.seasonPoints);
      for (const c of crews) root.append(crewRow(c));
    }
  });
}

function renderPots(model) {
  const root = $("pots");
  if (!root) return;
  root.replaceChildren();

  for (const o of model.orgs) {
    const block = el("div", "pot-org");

    const line1 = el("div", "pot-line1");
    line1.append(el("span", "pot-name", o.name));
    const amt = el("span", "pot-amt mono");
    amt.append(el("strong", null, fmtMoneyShort(o.pot.contributedCents)));
    amt.append(` / ${fmtMoneyShort(o.pot.monthlyBudgetCents)}`);
    line1.append(amt);
    block.append(line1);

    const pct = Math.max(0, Math.min(100,
      Math.round((o.pot.contributedCents / o.pot.monthlyBudgetCents) * 100)));
    const bar = el("div", "pot-bar");
    const fill = el("div", "pot-bar-fill");
    fill.style.width = pct + "%";
    bar.append(fill);
    block.append(bar);

    const meta = el("div", "pot-meta");
    meta.append(el("span", null,
      `${o.pot.matchesSponsored} matches sponsored${o.liveMatches.length ? ` · ${o.liveMatches.length} live now` : ""}`));
    meta.append(el("span", "mono", pct + "%"));
    block.append(meta);

    root.append(block);
  }

  const totBudget = model.orgs.reduce((s, o) => s + o.pot.monthlyBudgetCents, 0);
  const totContrib = model.orgs.reduce((s, o) => s + o.pot.contributedCents, 0);
  const totMatches = model.orgs.reduce((s, o) => s + o.pot.matchesSponsored, 0);
  const total = el("div", "pot-total");
  total.append(
    el("span", null, "All orgs"),
    el("span", "mono", `${fmtMoneyShort(totContrib)} / ${fmtMoneyShort(totBudget)} · ${totMatches} matches`),
  );
  root.append(total);
}

function renderRenewal(model) {
  const root = $("renewal");
  if (!root) return;
  root.replaceChildren();

  const head = el("div", "renewal-headline");
  const near = model.renewal.nearest;
  if (near) {
    head.append(
      el("span", null, "Next renewal: "),
      el("strong", "mono", `${near.daysToRenewal} days`),
      el("span", null, ` (${near.name}) · participation `),
      el("strong", "mono", near.participationPct + "%"),
      el("span", null, " · recommendation: "),
      el("span", "rec rec--" + near.rec.tone, near.rec.text),
    );
  } else {
    head.append(el("span", null, "No renewals scheduled."));
  }
  root.append(head);

  for (const o of model.renewal.orgs) {
    const row = el("div", "rrow");
    const days = o.daysToRenewal;
    const cls = days <= 30 ? "soon" : days <= 60 ? "mid" : "ok";
    row.append(
      el("span", "r-name", o.name),
      el("span", "days-pill days-pill--" + cls, `${days}d`),
      el("span", "r-pct mono", o.participationPct + "%"),
      el("span", "r-rec r-rec--" + o.rec.tone, o.rec.short),
    );
    root.append(row);
  }
}

function renderCorporate(st) {
  corpModel = buildCorporateModel(st);
  renderWellbeing(corpModel);
  renderOrgs(corpModel);
  renderPots(corpModel);
  renderRenewal(corpModel);
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
    renderCorporate(st); // corporate tab stays fresh even while hidden
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
  wireTabs();
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

// Exposed for smoke-testing the corporate model/renderers without a browser.
export { buildCorporateModel, renderCorporate, normalize };
