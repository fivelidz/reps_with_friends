/* ═══════════════════════════════════════════════════════════════════════
   RWF · V2 THE TABLE — board.js
   The poker-table × track-and-field battle, on the forked engine.

   Views (hash router): #/home · #/setup · #/create · #/draft · #/table
                        · #/result · #/squad
   The table renders ONCE per visit; state changes PATCH in place so the
   token transitions (CSS transform along the track) are never interrupted
   by a re-render. Cards, kitty chips, bursts, and the race clock are all
   pure CSS animations (3D perspective flips — no libraries).

   Sound: another agent's SFX module exposes window.rwfSfx.play(name) —
   every button + event calls it DEFENSIVELY (?. + try/catch); silence is
   fine when the module isn't loaded.
   ═══════════════════════════════════════════════════════════════════════ */

import * as E from "./engine.js";
import * as S from "./state.js";
import * as D from "./daily.js";

const $app = document.getElementById("app");
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── sound (defensive — the SFX module may not exist yet) ─────────────── */
function sfx(name) {
  try { window.rwfSfx?.play?.(name); } catch { /* module absent — fine */ }
}

/* ── tier colours + initials (token chips, position rows) ─────────────── */
const TIER_COL = { couch: "#ffb03a", casual: "#6ec1ff", fit: "#34d399", athlete: "#b78cff" };
const tierCol = (t) => TIER_COL[t] ?? "var(--lime)";
const initials = (name) =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const FROG_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <ellipse cx="12" cy="14" rx="9" ry="7" fill="#5cb85c"/>
  <circle cx="7.5" cy="7.5" r="3.2" fill="#5cb85c"/>
  <circle cx="16.5" cy="7.5" r="3.2" fill="#5cb85c"/>
  <circle cx="7.5" cy="7.2" r="1.7" fill="#fff"/><circle cx="16.5" cy="7.2" r="1.7" fill="#fff"/>
  <circle cx="7.7" cy="7.4" r="0.8" fill="#111"/><circle cx="16.3" cy="7.4" r="0.8" fill="#111"/>
  <path d="M8 14.5q4 3 8 0" stroke="#1c3a1c" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <circle cx="9" cy="12.5" r="0.9" fill="#a5d6a5"/><circle cx="15" cy="12.5" r="0.9" fill="#a5d6a5"/>
</svg>`;

const CARD_ICONS = {
  lightning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13.5h5L8.5 22 19 10.5h-6L13 2z" fill="currentColor"/></svg>`,
  steal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13l-3-3 2-2 6 6-6 6-2-2 3-3H3V8zm18 6H8l3 3-2 2-6-6 6-6 2 2-3 3h13v2z" fill="currentColor" transform="scale(0.92) translate(1,1)"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5.2-3.4 8.8-8 11-4.6-2.2-8-5.8-8-11V5l8-3z" fill="currentColor" opacity="0.9"/><path d="M12 2l8 3v6c0 5.2-3.4 8.8-8 11-4.6-2.2-8-5.8-8-11V5l8-3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  freeze: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22M2 6l20 12M22 6L2 18M12 1l-2.5 2.5M12 1l2.5 2.5M12 23l-2.5-2.5M12 23l2.5-2.5M2 6l3.4.4M2 6l.4 3.4M22 18l-3.4-.4M22 18l-.4-3.4M22 6l-3.4.4M22 6l-.4 3.4M2 18l3.4-.4M2 18l.4-3.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`,
};
const RAR_COL = { common: "var(--rar-common)", rare: "var(--rar-rare)", epic: "var(--rar-epic)", legendary: "var(--rar-legendary)" };
const THEMES = [
  { id: "board",     name: "Board",          sw: "#0d1f16" },
  { id: "lime",      name: "Lime",           sw: "#0a0b0d" },
  { id: "gold",      name: "Gold Arcade",    sw: "#0b0a12" },
  { id: "sunset",    name: "Sunset",         sw: "#f6f1e5" },
  { id: "neon",      name: "Neon",           sw: "#070b14" },
  { id: "forest",    name: "Forest",         sw: "#1a120a" },
  { id: "mycelial",  name: "Mycelial",       sw: "#150f0a" },
  { id: "techy",     name: "Techy",          sw: "#0b1015" },
  { id: "track",     name: "Track",          sw: "#260d0f" },
  { id: "poker",     name: "Poker",          sw: "#241017" },
  { id: "caveman",   name: "Caveman",        sw: "#1a1410" },
  { id: "n64",       name: "N64",            sw: "#202a4d" },
  { id: "goldeneye", name: "GoldenEye",      sw: "#14181d" },
];

/* ═══════════════════════ track geometry (rounded-rect) ═════════════════
   Each lane is its own rounded rectangle inset into the felt. t∈[0,1) is
   the fraction of raw/target — the token walks the lane's perimeter
   counter-clockwise from the start/finish line at the bottom centre. */
function lanePoint(t, lane, geo) {
  const w = geo.w - 2 * (geo.pad + lane * geo.laneW);
  const h = geo.h - 2 * (geo.pad + lane * geo.laneW);
  if (w <= 8 || h <= 8) return { x: geo.w / 2, y: geo.h / 2 };
  const r = Math.min(geo.r, w / 2 - 1, h / 2 - 1);
  const cx = geo.w / 2, cy = geo.h / 2;
  const sw = w - 2 * r, sh = h - 2 * r;          // straight lengths
  const arc = (Math.PI / 2) * r;                  // quarter-arc length
  const P = 2 * sw + 2 * sh + 4 * arc;
  let d = ((t % 1) + 1) % 1 * P;
  const pt = (x, y) => ({ x, y });
  const onArc = (ccx, ccy, a0) => {
    const a = a0 + Math.PI / 2 * (d / arc);
    return pt(ccx + r * Math.cos(a), ccy + r * Math.sin(a));
  };
  // counter-clockwise from bottom-centre: bottom-left → left-up → top → right-down → home
  if (d < sw / 2) return pt(cx - d, cy + h / 2);                    d -= sw / 2;
  if (d < arc) return onArc(cx - sw / 2, cy + sh / 2, Math.PI / 2);  d -= arc;
  if (d < sh) return pt(cx - w / 2, cy + sh / 2 - d);                d -= sh;
  if (d < arc) return onArc(cx - sw / 2, cy - sh / 2, Math.PI);      d -= arc;
  if (d < sw) return pt(cx - sw / 2 + d, cy - h / 2);                d -= sw;
  if (d < arc) return onArc(cx + sw / 2, cy - sh / 2, -Math.PI / 2); d -= arc;
  if (d < sh) return pt(cx + w / 2, cy - sh / 2 + d);                d -= sh;
  if (d < arc) return onArc(cx + sw / 2, cy + sh / 2, 0);            d -= arc;
  return pt(cx + sw / 2 - (d - 0), cy + h / 2);
}
function trackGeo(trackEl, nLanes) {
  const w = trackEl.clientWidth, h = trackEl.clientHeight;
  const laneW = Math.max(11, Math.min(16, Math.min(w, h) * 0.045));
  return {
    w, h, laneW, pad: 2,
    r: Math.min(w, h) * 0.42,
    nLanes,
  };
}

/* ═══════════════════════ commentary feed (in-memory, per match) ════════ */
const feeds = new Map(); // matchId → [{lap, html}]
function feedPush(matchId, lap, html) {
  const arr = feeds.get(matchId) ?? [];
  arr.unshift({ lap, html });
  feeds.set(matchId, arr.slice(0, 30));
}
function feedSeed(match) {
  if (feeds.has(match.config.id)) return;
  const lap = lapOf(match);
  const lines = [];
  for (const e of match.entries.slice(-8)) {
    if (e.steal) continue;
    const p = match.players.find((x) => x.id === e.playerId);
    if (p) lines.push({ lap, html: `<b>${esc(p.name)}</b> logs ${e.reps} ${esc(exName(match, e.exerciseId))}` });
  }
  for (const l of (match.powerLog ?? []).slice(-4)) {
    lines.push({ lap, html: powerLine(match, l) });
  }
  if (match.status === "complete") {
    const w = E.winner(match);
    const p = match.players.find((x) => x.id === w?.playerId);
    if (p) lines.push({ lap, html: `<b>RACE COMPLETE</b> — ${esc(p.name)} takes the kitty` });
  }
  feeds.set(match.config.id, lines.slice(0, 12));
}
function powerLine(match, l) {
  const p = match.players.find((x) => x.id === l.playerId);
  const who = esc(p?.name ?? "Someone");
  if (l.kind === "lightning") return `<b>⚡ LIGHTNING</b> — ${who} is ×3 for 10:00`;
  if (l.kind === "shield") return `<b>🛡 SHIELD</b> — ${who} is protected`;
  if (l.kind === "freeze") return `<b>❄ FREEZE</b> — ${who} extends the clock +30:00`;
  if (l.blocked) return `<b>🛡 BLOCKED</b> — ${who}'s steal bounced off a shield`;
  if (l.stolen > 0) {
    const v = match.players.find((x) => x.id === l.victimId);
    return `<b>💅 STEAL</b> — ${who} takes ${l.stolen} reps from ${esc(v?.name ?? "?")}`;
  }
  return `<b>CARD</b> — ${who} plays ${l.kind}`;
}
const exName = (m, id) => m.config.exercises.find((e) => e.id === id)?.name ?? id;

/* ═══════════════════════ race clock + lap counter ══════════════════════ */
function lapOf(match) {
  const pd = (match.config.playDays?.length ? match.config.playDays : [1, 3, 5]).slice().sort((a, b) => a - b);
  const today = new Date().getDay();
  let idx = pd.indexOf(today);
  if (idx < 0) { // between play days → next lap number
    idx = pd.findIndex((d) => d > today);
    if (idx < 0) idx = 0;
  }
  return { n: idx + 1, total: pd.length, dayName: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][pd[idx]] };
}

/* ═══════════════════════ router ════════════════════════════════════════ */
let ticker = null;
let route = () => {
  const h = location.hash.replace(/^#\/?/, "") || "home";
  return h.split("?")[0];
};
function go(view) { location.hash = `#/${view}`; }

addEventListener("hashchange", render);

function render() {
  stopTicker();
  closeSheet(true);
  const view = route();
  const state = S.load();
  const match = view === "table" || view === "result" || view === "draft"
    ? S.matchById(new URLSearchParams(location.hash.split("?")[1] ?? "").get("m") ?? "") ?? S.currentMatch(state)
    : null;

  if (view === "home") return renderHome(state);
  if (view === "setup") return renderSetup();
  if (view === "create") return state.player ? renderCreate() : go("setup");
  if (view === "draft") return renderDraft(state, match);
  if (view === "table") {
    if (!state.player) return go("setup");
    const m = match ?? S.currentMatch(state);
    if (!m) return go("create");
    if (m.status === "complete") return go(`result?m=${m.config.id}`);
    if (S.myDraft(m.config.id, state)) return go(`draft?m=${m.config.id}`);
    if (m.status === "open") S.startById(m.config.id);
    return renderTable(S.load(), m);
  }
  if (view === "result") return renderResult(state, match ?? S.currentMatch(state));
  if (view === "squad") return renderSquad(state);
  return renderHome(state);
}

function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

/* ── shared chrome ─────────────────────────────────────────────────────── */
function topBar({ back = "home", kicker = "V2 · THE TABLE", name = "", right = "" }) {
  return `
  <header class="bd-top">
    <button class="bd-top__back" data-go="${back}" aria-label="back">‹</button>
    <div class="bd-top__title">
      <p class="bd-top__kicker">${esc(kicker)}</p>
      <h2 class="bd-top__name">${esc(name)}</h2>
    </div>
    ${right}
  </header>`;
}

/* ═══════════════════════ HOME — tables list ════════════════════════════ */
function renderHome(state) {
  const me = S.me(state);
  const matches = [...state.matches].reverse().slice(0, 8);
  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "squad", kicker: "Reps With Friends", name: me ? `Table night · ${me.name}` : "The Table" })}
    <div class="bd-pad">
      <p class="bd-kicker">V2 · board battle</p>
      <h1 class="bd-h1">Cards. Lanes.<br><em>The kitty.</em></h1>
      <p class="bd-sub">A poker table that's also a track. Run your lane, hold your
        cards, take the pot — power-ups play as cards, progress runs as laps.</p>
      <button class="pop-btn pop-btn--big pop-btn--full" id="newTable" data-sfx="press">Set a new table</button>
      ${me ? "" : `<button class="pop-btn pop-btn--ghost pop-btn--full" id="setupBtn" style="margin-top:8px" data-sfx="press">Set up your runner</button>`}

      <p class="bd-kicker" style="margin-top:22px">Your tables</p>
      <div class="bd-tables" id="tables">
        ${matches.length ? matches.map(tableCard).join("") : `
          <p class="bd-sub" style="margin:6px 0 0">No tables yet — set one and deal the crew in.</p>`}
      </div>

      <p class="bd-kicker" style="margin-top:22px">Table felt <span style="opacity:.6">(theme)</span></p>
      <div class="bd-themes" id="themeRow">
        ${THEMES.map((t) => `<button class="bd-thbtn ${document.documentElement.dataset.theme === t.id ? "is-on" : ""}"
            data-theme-btn="${t.id}" title="${esc(t.name)}" style="--sw:${t.sw}" data-sfx="press"></button>`).join("")}
      </div>
    </div>
  </div>`;

  $("#newTable").onclick = () => { sfx("press"); go("create"); };
  $("#setupBtn")?.addEventListener("click", () => { sfx("press"); go("setup"); });
  $$("#themeRow [data-theme-btn]").forEach((b) => {
    b.onclick = () => {
      sfx("press");
      document.documentElement.dataset.theme = b.dataset.themeBtn;
      try { localStorage.setItem("rwf.board.theme", b.dataset.themeBtn); } catch {}
      $$("#themeRow [data-theme-btn]").forEach((x) => x.classList.toggle("is-on", x === b));
    };
  });
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));
  $app.querySelectorAll("[data-open]").forEach((b) =>
    (b.onclick = () => {
      sfx("press");
      const m = state.matches.find((x) => x.config.id === b.dataset.open);
      if (!m) return;
      if (m.status === "complete") return go(`result?m=${m.config.id}`);
      if (S.myDraft(m.config.id, state)) return go(`draft?m=${m.config.id}`);
      go(`table?m=${m.config.id}`);
    }));
}

function tableCard(m) {
  const you = S.me();
  const st = m.status;
  const statusCls = st === "live" ? "live" : st === "open" ? "open" : "done";
  const statusTxt = st === "live" ? "Racing" : st === "open" ? "Dealing" : "Podium";
  const lead = E.standings(m)[0];
  const rawOf = (id) => E.playerRawReps(id, m.entries);
  const dots = m.players.slice(0, 4).map((p, i) => {
    const t = Math.min(0.96, m.config.targetReps ? rawOf(p.id) / m.config.targetReps : 0);
    const ang = Math.PI * (1.25 - t); // mini felt: bottom-left → around
    return `<i style="left:${8 + t * 74}%;top:${40 - Math.sin(ang) * 18}%;background:${p.id === you?.id ? "var(--lime)" : tierCol(p.tier)}"></i>`;
  }).join("");
  return `
    <button class="bd-tcard" data-open="${m.config.id}" data-sfx="press">
      <span class="bd-tcard__felt">${dots}</span>
      <span style="min-width:0">
        <p class="bd-tcard__name">${esc(m.config.name)}</p>
        <p class="bd-tcard__meta">${m.players.length} runners · ${m.config.targetReps} reps · kitty ${m.board?.kitty ?? 0}</p>
        <p class="bd-tcard__meta">${st === "complete" ? `won by ${esc(lead?.player?.name ?? "?")}` : `lead: ${esc(lead?.player?.name ?? "—")} · ${lead?.rawReps ?? 0}`}</p>
      </span>
      <span class="bd-tcard__status bd-tcard__status--${statusCls}">${statusTxt}</span>
    </button>`;
}

/* ═══════════════════════ SETUP — quick identity ════════════════════════ */
function renderSetup() {
  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "home", kicker: "New runner", name: "Who's running?" })}
    <div class="bd-pad">
      <div class="bd-field">
        <p class="bd-kicker">Your name</p>
        <input class="bd-input" id="nameIn" maxlength="40" placeholder="e.g. Alexei" style="margin-top:8px">
      </div>
      <div class="bd-field">
        <p class="bd-kicker">Your tier — handicaps your score</p>
        <div class="bd-chiprow" id="tiers" style="margin-top:8px">
          ${Object.entries(E.TIER_MULTIPLIERS).map(([k, v]) => `
            <button class="bd-pick" data-tier="${k}" data-sfx="press">
              <span class="bd-pick__t">${k[0].toUpperCase() + k.slice(1)}</span>
              <span class="bd-pick__s">reps ×${v}</span>
            </button>`).join("")}
        </div>
      </div>
      <button class="pop-btn pop-btn--big pop-btn--full" id="setupGo" style="margin-top:18px" data-sfx="press" disabled>Take your seat</button>
    </div>
  </div>`;
  let tier = null;
  const sync = () => { $("#setupGo").disabled = !($("#nameIn").value.trim() && tier); };
  $("#nameIn").oninput = sync;
  $$("#tiers .bd-pick").forEach((b) =>
    (b.onclick = () => {
      sfx("press");
      tier = b.dataset.tier;
      $$("#tiers .bd-pick").forEach((x) => x.classList.toggle("is-on", x === b));
      sync();
    }));
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));
  $("#setupGo").onclick = () => {
    sfx("win");
    S.setPlayer({ name: $("#nameIn").value.trim() || "You", tier });
    toast(`Seat taken — ${$("#nameIn").value.trim() || "You"} (${tier})`, "ok");
    go("home");
  };
}

/* ═══════════════════════ CREATE — fast table setup ═════════════════════ */
function renderCreate() {
  const days = new Set([1, 3, 5]);
  let pack = "bodyweight", target = "solid";
  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "home", kicker: "Fast create", name: "Set the table" })}
    <div class="bd-pad">
      <div class="bd-field">
        <p class="bd-kicker">Table name</p>
        <input class="bd-input" id="tName" maxlength="40" value="The 300 Club" style="margin-top:8px">
      </div>
      <div class="bd-field">
        <p class="bd-kicker">Play days — the laps</p>
        <div class="bd-chiprow" id="dayRow" style="margin-top:8px">
          ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d, i) => `
            <button class="bd-pick" data-day="${i}" data-sfx="press"><span class="bd-pick__t">${d}</span></button>`).join("")}
        </div>
      </div>
      <div class="bd-field">
        <p class="bd-kicker">Exercise pack</p>
        <div class="bd-chiprow" id="packRow" style="margin-top:8px">
          <button class="bd-pick" data-pack="bodyweight" data-sfx="press"><span class="bd-pick__t">Bodyweight</span><span class="bd-pick__s">pushup·squat·situp·lunge·plank</span></button>
          <button class="bd-pick" data-pack="fullbody" data-sfx="press"><span class="bd-pick__t">Full body</span><span class="bd-pick__s">+ burpees</span></button>
        </div>
      </div>
      <div class="bd-field">
        <p class="bd-kicker">Race distance (raw reps to close)</p>
        <div class="bd-chiprow" id="tgtRow" style="margin-top:8px">
          ${S.TARGETS.map((t) => `
            <button class="bd-pick" data-target="${t.id}" data-sfx="press">
              <span class="bd-pick__t">${t.label}</span><span class="bd-pick__s">${esc(t.sub)}</span>
            </button>`).join("")}
        </div>
      </div>
      <p class="bd-sub" style="margin-top:16px">Every runner posts a <b>${E.ANTE}-point ante</b> into the kitty and
        starts with <b>${E.START_RP} RP</b> for cards. Sam, Alex &amp; Jordan take the other lanes.</p>
      <button class="pop-btn pop-btn--big pop-btn--full" id="deal" data-sfx="deal">Shuffle up &amp; deal</button>
    </div>
  </div>`;

  const syncDays = () => $$("#dayRow .bd-pick").forEach((b) =>
    b.classList.toggle("is-on", days.has(+b.dataset.day)));
  syncDays();
  $$("#dayRow .bd-pick").forEach((b) =>
    (b.onclick = () => {
      sfx("press");
      const d = +b.dataset.day;
      days.has(d) ? days.delete(d) : days.add(d);
      if (!days.size) days.add(d); // at least one lap
      syncDays();
    }));
  const sync = (row, attr, val) => $$(`#${row} .bd-pick`).forEach((b) =>
    b.classList.toggle("is-on", b.dataset[attr] === val));
  sync("packRow", "pack", pack); sync("tgtRow", "target", target);
  $$("#packRow .bd-pick").forEach((b) => (b.onclick = () => { sfx("press"); pack = b.dataset.pack; sync("packRow", "pack", pack); }));
  $$("#tgtRow .bd-pick").forEach((b) => (b.onclick = () => { sfx("press"); target = b.dataset.target; sync("tgtRow", "target", target); }));
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));

  $("#deal").onclick = () => {
    sfx("deal");
    const m = S.createFastBattle({
      name: $("#tName").value.trim() || "The Battle",
      days: [...days],
      pack, target,
    });
    go(`draft?m=${m.config.id}`);
  };
}

/* ═══════════════════════ DRAFT — pick 1 of the dealt 3 ═════════════════ */
function renderDraft(state, match) {
  if (!match) return go("create");
  if (!state.player) return go("setup");
  const choices = S.myDraft(match.config.id, state);
  if (!choices) return go(`table?m=${match.config.id}`);
  const you = state.player;
  const mates = match.players.filter((p) => p.id !== you.id);

  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "home", kicker: "The deal", name: esc(match.config.name) })}
    <div class="bd-pad">
      <p class="bd-kicker">Draft — keep ONE card</p>
      <h1 class="bd-h1" style="font-size:clamp(24px,7vw,34px)">Pick your <em>opener</em></h1>
      <p class="bd-sub">Dealt three, keep one. Cards cost RP to play — reps earn RP.</p>
      <div class="bd-draft" id="draftFan">
        ${choices.map((k, i) => cardHTML(E.POWER_UPS[k], { deal: true, delay: i * 0.12 })).join("")}
      </div>
      <button class="pop-btn pop-btn--big pop-btn--full" id="keepBtn" data-sfx="deal" disabled>Keep it</button>
      <div class="bd-draftmates">
        ${mates.map((p) => `<span class="bd-dm"><i></i>${esc(p.name)} picked</span>`).join("")}
      </div>
    </div>
  </div>`;
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));

  let pickedKind = null;
  const cards = $$("#draftFan .bd-card");
  cards.forEach((c) => {
    c.onclick = () => {
      sfx("press");
      pickedKind = c.dataset.kind;
      cards.forEach((x) => x.classList.toggle("is-sel", x === c));
      $("#keepBtn").disabled = false;
      $("#keepBtn").textContent = `Keep ${E.POWER_UPS[pickedKind].name}`;
    };
  });
  $("#keepBtn").onclick = () => {
    if (!pickedKind) return;
    sfx("deal");
    const sel = cards.find((c) => c.dataset.kind === pickedKind);
    sel?.classList.add("is-picking");
    setTimeout(() => {
      try {
        S.pickMyDraft(match.config.id, pickedKind);
        S.startById(match.config.id);
        toast(`Kept ${E.POWER_UPS[pickedKind].name} — race is live`, "ok");
      } catch (err) { toast(String(err.message ?? err), "warn"); }
      go(`table?m=${match.config.id}`);
    }, 520);
  };
}

/* ═══════════════════════ card markup ═══════════════════════════════════ */
function cardHTML(def, { deal = false, delay = 0, cost = true } = {}) {
  return `
  <div class="bd-card ${deal ? "bd-card--deal" : ""}" data-kind="${def.kind}" tabindex="0" role="button"
       aria-label="${esc(def.name)}" ${deal ? `style="animation-delay:${delay}s"` : ""}>
    <div class="bd-card__inner">
      <div class="bd-card__face bd-card__face--front" style="--rar:${RAR_COL[def.rarity]}">
        <span class="bd-card__rar">${def.rarity}</span>
        <span class="bd-card__icon" style="color:${RAR_COL[def.rarity]}">${CARD_ICONS[def.kind] ?? ""}</span>
        <p class="bd-card__name">${esc(def.name)}</p>
        <p class="bd-card__fx">${esc(def.blurb)}</p>
        ${cost ? `<span class="bd-card__cost">◈ ${E.CARD_COSTS[def.kind] ?? 0} RP</span>` : ""}
      </div>
      <div class="bd-card__face bd-card__face--back"></div>
    </div>
  </div>`;
}

/* ═══════════════════════ THE TABLE (flagship) ══════════════════════════ */
let handSig = ""; // kinds+grantedAt signature → only rebuild the hand when it changes

function renderTable(state, matchIn) {
  const match = matchIn ?? S.currentMatch(state);
  const you = state.player;
  const lap = lapOf(match);
  feedSeed(match);
  handSig = "";

  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({
      back: "home", kicker: `LAP ${lap.n}/${lap.total} · ${lap.dayName}`,
      name: match.config.name,
      right: `<div class="bd-clock" id="raceClock" data-dz="0">
                <div class="bd-clock__lap" id="lapTag">RACE CLOCK</div>
                <div class="bd-clock__time" id="clockTime">0:00:00</div>
              </div>`,
    })}
    <div class="bd-dz" id="dzBar" data-dz="0" hidden></div>

    <div class="bd-stage">
      <div class="bd-tablewrap">
        <div class="bd-table" id="felt">
          <div class="bd-track" id="track"></div>
          <div class="bd-kitty" id="kitty" title="The kitty — every log tips chips in">
            <span class="bd-kitty__label">KITTY</span>
            <span class="bd-kitty__total" id="kittyTotal">0</span>
            <span class="bd-kitty__pts" id="kittyPts">PTS</span>
            <div class="bd-stacks" id="stacks"></div>
          </div>
        </div>
      </div>
      <div class="bd-panels">
        <div class="bd-positions" id="positions"></div>
        <div class="bd-feed" id="feed"></div>
      </div>
    </div>

    <div class="bd-actions">
      <button class="pop-btn pop-btn--big" id="logBtn" data-sfx="press">Log reps</button>
      <button class="pop-btn pop-btn--ghost" id="simBtn" data-sfx="press" title="Mates log their sets">Mates</button>
      <button class="pop-btn pop-btn--ghost" id="dealDrop" data-sfx="deal" title="Daily drop — a free card">Deal</button>
    </div>

    <div class="bd-dock">
      <div class="bd-hand" id="hand"></div>
      <div class="bd-fxdock" id="fxdock"></div>
    </div>
  </div>`;

  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));
  $("#logBtn").onclick = () => { sfx("press"); openLogSheet(match.config.id); };
  $("#simBtn").onclick = () => {
    sfx("press");
    const r = S.simMates(match.config.id);
    r.logged.forEach((l) => feedPush(match.config.id, lapOf(S.matchById(match.config.id)).n,
      `<b>${esc(nameOf(match, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`));
    r.played?.forEach((p) => feedPush(match.config.id, lapOf(S.matchById(match.config.id)).n, powerLine(S.matchById(match.config.id), p)));
    if (r.logged.length) { sfx("chip"); chipFlyFrom(r.logged[r.logged.length - 1].playerId, match.config.id); }
    afterAction(match.config.id);
  };
  $("#dealDrop").onclick = () => {
    sfx("deal");
    const g = S.grantRandomTo(match.config.id);
    if (g) {
      toast(`Dealt: ${E.POWER_UPS[g.kind].name} (${g.rarity})`, "ok");
      feedPush(match.config.id, lap.n, `<b>DEALT</b> — you draw ${esc(E.POWER_UPS[g.kind].name)}`);
    }
    afterAction(match.config.id, { newCard: g?.kind });
  };

  buildLanes(match);
  updateTable(match, { full: true });

  // token tap → quick log for that runner (mates) — handy demo affordance
  $("#track").addEventListener("click", (e) => {
    const tok = e.target.closest(".bd-token");
    if (!tok) return;
    sfx("press");
    openLogSheet(match.config.id, tok.dataset.pid);
  });

  ticker = setInterval(() => tickClock(match.config.id), 1000);
  tickClock(match.config.id);
}

const nameOf = (m, id) => (S.me()?.id === id ? S.me().name : m.players.find((p) => p.id === id)?.name ?? id);

/* lanes: nested rounded-rect stripes, one per player */
function buildLanes(match) {
  const track = $("#track");
  const n = match.players.length;
  const geo = trackGeo(track, n);
  track.innerHTML = Array.from({ length: n }, (_, i) =>
    `<div class="bd-lane" style="inset:${geo.pad + i * geo.laneW}px"></div>`).join("") +
    `<div class="bd-finish"></div>`;
  match.players.forEach((p, i) => {
    const el = document.createElement("button");
    el.className = "bd-token";
    el.dataset.pid = p.id;
    el.setAttribute("aria-label", `${p.name} token`);
    el.innerHTML = `<span class="bd-token__chip" style="--tier:${p.id === S.me()?.id ? "var(--lime)" : tierCol(p.tier)}">
        ${p.id === S.me()?.id ? initials(S.me().name) : FROG_SVG}
      </span><span class="bd-token__flag">${esc(p.name)}</span>`;
    track.appendChild(el);
  });
}

/* the per-state patch: tokens, kitty, positions, feed, hand, fx */
function updateTable(match, { full = false, newCard = null } = {}) {
  const you = S.load().player;
  const rows = E.standings(match);
  const target = match.config.targetReps;

  /* tokens on the track */
  const geo = trackGeo($("#track"), match.players.length);
  match.players.forEach((p, i) => {
    const el = $(`.bd-token[data-pid="${p.id}"]`);
    if (!el) return;
    const raw = Math.max(0, E.playerRawReps(p.id, match.entries));
    const t = Math.min(0.985, target ? raw / target : 0);
    const pos = lanePoint(t, i, geo);
    el.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) translate(-50%, -50%)`;
    el.classList.toggle("bd-token--armed", E.comebackEligible(match, p.id));
    el.classList.toggle("bd-token--lit", E.lightningActive(match, p.id));
    el.classList.toggle("bd-token--shield", !!match.shields?.[p.id]);
  });

  /* the kitty */
  const kitty = match.board?.kitty ?? 0;
  const total = $("#kittyTotal");
  if (total) {
    total.textContent = String(kitty);
    $("#kittyPts").textContent = kitty === 1 ? "PT" : "PTS";
    $("#stacks").innerHTML = E.chipMix(kitty).map((s) => `
      <span class="bd-stack bd-stack--${s.id}" title="${s.count} × ${s.value}pt">
        ${Array.from({ length: Math.min(5, s.count) }, () =>
          `<i class="bd-chip bd-chip--${s.id}"></i>`).join("")}
        ${s.count > 1 ? `<span class="bd-stack__n">×${s.count}</span>` : ""}
      </span>`).join("");
    if (!full) { $("#kitty").classList.remove("is-bump"); void $("#kitty").offsetWidth; $("#kitty").classList.add("is-bump"); }
  }

  /* race positions read */
  const lead = rows[0];
  $("#positions").innerHTML = rows.map((r, i) => {
    const gap = i === 0 ? "LEADING" : `${Math.max(0, lead.rawReps - r.rawReps)} BACK`;
    const tags = [
      i === 0 && r.rawReps > 0 ? `<span class="bd-tag bd-tag--lead">P1</span>` : "",
      E.comebackEligible(match, r.player.id) ? `<span class="bd-tag">⚡ ARMED</span>` : "",
      E.lightningActive(match, r.player.id) ? `<span class="bd-tag bd-tag--lit">×3</span>` : "",
      match.shields?.[r.player.id] ? `<span class="bd-tag bd-tag--shield">🛡</span>` : "",
    ].join("");
    return `
      <div class="bd-prow ${r.player.id === you?.id ? "bd-prow--you" : ""}">
        <span class="bd-prow__pos">P${i + 1}</span>
        <span class="bd-prow__chip" style="--tier:${r.player.id === you?.id ? "var(--lime)" : tierCol(r.player.tier)}">${initials(r.player.name)}</span>
        <span class="bd-prow__name">${esc(r.player.name)}${r.player.id === you?.id ? " · YOU" : ""}</span>
        <span class="bd-prow__tags">${tags}</span>
        <span class="bd-prow__gap">${gap}</span>
        <span class="bd-prow__rp">◈${E.boardPoints(match, r.player.id)}</span>
      </div>`;
  }).join("");

  /* commentary feed */
  const feed = feeds.get(match.config.id) ?? [];
  $("#feed").innerHTML = feed.slice(0, 3).map((l) =>
    `<div class="bd-feed__row"><span class="bd-feed__lap">L${l.lap}</span><span>${l.html}</span></div>`).join("");

  /* hand — rebuild only when the cards actually changed */
  const inv = E.inventoryOf(match, you?.id);
  const sig = inv.map((c) => `${c.kind}:${c.grantedAt}`).join("|");
  if (sig !== handSig) {
    const freshSet = new Set((handSig ? handSig.split("|").map((s) => s.split(":").slice(0, -1).join(":")) : []));
    handSig = sig;
    const hand = $("#hand");
    hand.innerHTML = inv.length
      ? inv.map((c, i) => {
          const newCardFlag = newCard ? c.kind === newCard : !freshSet.has(`${c.kind}`);
          return `<div class="bd-hand__slot">${cardHTML(E.POWER_UPS[c.kind], { deal: newCardFlag, delay: i * 0.08 })}</div>`;
        }).join("")
      : `<p class="bd-sub" style="margin:auto;text-align:center">No cards in hand — hit <b>DEAL</b> for the daily drop.</p>`;
    wireHand(match);
  }

  updateFx(match);
}

/* card interactions: tap → detail sheet → PLAY (flip + fly + burst) */
function wireHand(match) {
  $$("#hand .bd-card").forEach((cardEl) => {
    cardEl.onclick = () => { sfx("press"); openCardSheet(match.config.id, cardEl); };
    cardEl.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cardEl.click(); } };
  });
}

function openCardSheet(matchId, cardEl) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  const you = state.player;
  const kind = cardEl.dataset.kind;
  const def = E.POWER_UPS[kind];
  const cost = E.CARD_COSTS[kind] ?? 0;
  const rp = E.boardPoints(match, you.id);
  const stealPrev = kind === "steal" ? E.stealPreview(match, you.id) : null;

  openSheet(`
    <div class="bd-sheet__grab"></div>
    <div class="bd-cdetail">
      <div class="bd-cdetail__mini">${cardHTML(def, { cost: false })}</div>
      <div class="bd-cdetail__body">
        <p class="bd-kicker">${def.rarity} card</p>
        <h3 class="bd-cdetail__name">${esc(def.name)}</h3>
        <p class="bd-cdetail__blurb">${esc(def.blurb)}${stealPrev ? ` — would take <b>${stealPrev.amount}</b> from ${esc(stealPrev.victim.name)}${stealPrev.blocked ? " (🛡 shielded)" : ""}` : ""}</p>
        <div class="bd-cdetail__meta">
          <span class="bd-cdetail__rp">◈ ${rp} RP · costs ${cost} RP</span>
          <button class="pop-btn pop-btn--sm" id="playIt" data-sfx="play" ${rp < cost || match.status !== "live" ? "disabled" : ""}>Play card</button>
        </div>
      </div>
    </div>`);

  $("#playIt").onclick = () => {
    closeSheet();
    playCard(matchId, kind, cardEl);
  };
}

function playCard(matchId, kind, cardEl) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  const res = S.boardPlayInMatch(matchId, { kind });
  if (!res.result.ok) {
    sfx("err");
    toast(res.result.reason ?? "Can't play that", "warn");
    return;
  }
  sfx("play");
  const r = res.result;
  const lines = {
    lightning: `<b>⚡ LIGHTNING</b> — you're ×3 for 10:00`,
    shield: `<b>🛡 SHIELD</b> — armed`,
    freeze: `<b>❄ FREEZE</b> — clock +30:00`,
    steal: r.blocked ? `<b>🛡 BLOCKED</b> — the shield ate your steal` : `<b>💅 STEAL</b> — you take ${r.stolen} reps from ${esc(nameOf(match, r.victimId))}`,
  };
  feedPush(matchId, lapOf(res.match).n, lines[kind] ?? `<b>CARD</b> — you play ${esc(E.POWER_UPS[kind].name)}`);
  toast(`${E.POWER_UPS[kind].name} played${res.spent ? ` · −${res.spent} RP` : ""}`, "ok");

  /* flip → fly to the kitty → burst (CSS 3D; clone flies over the table) */
  const slot = cardEl.closest(".bd-hand__slot") ?? cardEl;
  const rect = cardEl.getBoundingClientRect();
  const felt = $("#felt");
  const fr = felt.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.className = "bd-card is-playing";
  fly.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:70;--fly-dx:${fr.left + fr.width / 2 - (rect.left + rect.width / 2)}px;--fly-dy:${fr.top + fr.height / 2 - (rect.top + rect.height / 2)}px;`;
  fly.innerHTML = cardEl.querySelector(".bd-card__inner").outerHTML;
  document.body.appendChild(fly);
  slot.remove();
  fly.addEventListener("animationend", () => {
    fly.remove();
    burst(E.POWER_UPS[kind].rarity);
  }, { once: true });

  afterAction(matchId);
}

function burst(rarity) {
  const felt = $("#felt");
  if (!felt) return;
  const el = document.createElement("div");
  el.className = "bd-burst";
  el.style.setProperty("--burst", RAR_COL[rarity] ?? "var(--lime)");
  felt.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

/* a chip flies from a token into the kitty on every log */
function chipFlyFrom(pid, matchId) {
  const tok = $(`.bd-token[data-pid="${pid}"]`);
  const kitty = $("#kitty");
  const felt = $("#felt");
  if (!tok || !kitty || !felt) return;
  const tr = tok.getBoundingClientRect(), kr = kitty.getBoundingClientRect(), fr = felt.getBoundingClientRect();
  const chip = document.createElement("i");
  chip.className = "bd-chipfly";
  chip.style.cssText = `left:${kr.left + kr.width / 2 - fr.left}px;top:${kr.top + kr.height / 2 - fr.top}px;`
    + `--fx:${tr.left + tr.width / 2 - (kr.left + kr.width / 2)}px;--fy:${tr.top + tr.height / 2 - (kr.top + kr.height / 2)}px;`;
  felt.appendChild(chip);
  chip.addEventListener("animationend", () => chip.remove(), { once: true });
}

/* active-effects dock: lightning ring + shield + expiry burn */
let litWasActive = false;
let fxBurning = false; // an expiry burn is playing — leave the dock alone
function updateFx(match) {
  const dock = $("#fxdock");
  if (!dock) return;
  const you = S.load().player?.id;
  const lit = E.lightningActive(match, you);
  const shield = !!match.shields?.[you];
  const rem = E.lightningRemainingMs(match, you);

  /* lightning window just opened → deal sound; just closed → burn chip */
  if (lit && !litWasActive) sfx("deal");
  const justExpired = !lit && litWasActive;
  litWasActive = lit;

  /* expiry: the ⚡ chip flips face-down and BURNS out (design: expiry =
     face-down fade + timer burn) — dock is frozen until the burn finishes */
  if (justExpired && !fxBurning) {
    const old = dock.querySelector('[data-fx="lightning"]');
    if (old) {
      fxBurning = true;
      old.classList.add("bd-fx-expire");
      old.addEventListener("animationend", () => {
        fxBurning = false;
        old.remove();
        const m = S.matchById(match.config.id);
        if (m && $("#fxdock")) updateFx(m);
      }, { once: true });
    }
    return;
  }
  if (fxBurning) return; // don't rebuild mid-burn

  const chips = [];
  if (lit) {
    const p = rem / E.LIGHTNING_MS;
    const m = Math.floor(rem / 60e3), s = Math.floor((rem % 60e3) / 1e3);
    chips.push(`<span class="bd-fx" data-fx="lightning"><span class="bd-fx__ring" style="--p:${p.toFixed(3)}"><span>⚡</span></span>×3 · ${m}:${String(s).padStart(2, "0")}</span>`);
  }
  if (shield) chips.push(`<span class="bd-fx" data-fx="shield"><span class="bd-fx__ring" style="background:var(--sky)"><span>🛡</span></span>shielded</span>`);
  dock.innerHTML = chips.join("");
}

/* race clock + danger zone + cheap live refresh */
function tickClock(matchId) {
  const match = S.matchById(matchId);
  if (!match) return stopTicker();
  const clock = $("#raceClock");
  if (!clock) return stopTicker();
  const rem = Math.max(0, D.deadlineFor(match) - Date.now());
  $("#clockTime").textContent = D.fmtClock(rem);
  const dz = D.dangerLevel(match);
  clock.dataset.dz = String(dz);
  const bar = $("#dzBar");
  bar.hidden = dz === 0;
  if (dz > 0) { bar.dataset.dz = String(dz); bar.textContent = D.dzCopy(dz, rem); }
  updateFx(match);
}

/* one state mutation happened → patch the table (no re-render) */
function afterAction(matchId, opts = {}) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  if (!match) return;
  if (match.status === "complete") {
    feedPush(matchId, lapOf(match).n, `<b>RACE COMPLETE</b> — ${esc(nameOf(match, E.winner(match)?.playerId))} takes the kitty`);
    sfx("win");
    setTimeout(() => go(`result?m=${matchId}`), 650);
    return;
  }
  updateTable(match, opts);
  tickClock(matchId);
}

/* ═══════════════════════ LOG SHEET ═════════════════════════════════════ */
let sheetEl = null;
function openSheet(inner) {
  closeSheet(true);
  sheetEl = document.createElement("div");
  sheetEl.className = "bd-sheet";
  sheetEl.innerHTML = `<div class="bd-sheet__veil"></div><div class="bd-sheet__panel">${inner}</div>`;
  document.body.appendChild(sheetEl);
  sheetEl.querySelector(".bd-sheet__veil").onclick = () => closeSheet();
}
function closeSheet(instant = false) {
  if (!sheetEl) return;
  const el = sheetEl; sheetEl = null;
  if (instant) return el.remove();
  el.classList.add("is-closing");
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

function openLogSheet(matchId, pid = null) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  const you = state.player;
  const runnerId = pid ?? you.id;
  const runner = match.players.find((p) => p.id === runnerId);
  const mine = E.inventoryOf(match, runnerId);
  let exercise = match.config.exercises[0].id, step = 10;

  openSheet(`
    <div class="bd-sheet__grab"></div>
    <h3 class="bd-sheet__h">${runnerId === you.id ? "Log your set" : `Log for ${esc(runner.name)}`}</h3>
    <div class="bd-exrow" id="exRow">
      ${match.config.exercises.map((e) => `
        <button class="bd-exchip ${e.id === exercise ? "is-on" : ""}" data-ex="${e.id}" data-sfx="press">${esc(e.name)}</button>`).join("")}
    </div>
    <div class="bd-steprow" id="stepRow">
      ${[5, 10, 25, 50].map((n) => `
        <button class="bd-step ${n === step ? "is-on" : ""}" data-step="${n}" data-sfx="press">+${n}</button>`).join("")}
    </div>
    <p class="bd-sub" style="margin:0 0 10px" id="logHint">
      ${runnerId === you.id
        ? `◈ ${E.boardPoints(match, runnerId)} RP · ${mine.length} card${mine.length === 1 ? "" : "s"} in hand · every log tips ${E.KITTY_TIP} pts into the kitty`
        : `${esc(runner.name)} · ◈ ${E.boardPoints(match, runnerId)} RP`}
    </p>
    <button class="pop-btn pop-btn--big pop-btn--full" id="logGo" data-sfx="chip">Log it</button>`);

  $$("#exRow .bd-exchip").forEach((b) => (b.onclick = () => {
    sfx("press"); exercise = b.dataset.ex;
    $$("#exRow .bd-exchip").forEach((x) => x.classList.toggle("is-on", x === b));
  }));
  $$("#stepRow .bd-step").forEach((b) => (b.onclick = () => {
    sfx("press"); step = +b.dataset.step;
    $$("#stepRow .bd-step").forEach((x) => x.classList.toggle("is-on", x === b));
  }));
  $("#logGo").onclick = () => {
    sfx("chip");
    try {
      const r = S.logToMatch(matchId, { exerciseId: exercise, reps: step, playerId: runnerId });
      feedPush(matchId, lapOf(r.match).n,
        `<b>${esc(runner.name)}</b> logs ${step} ${esc(exName(match, exercise))}` +
        (r.comeback ? ` · <b>⚡ comeback ×1.2</b>` : "") +
        (r.lightning ? ` · <b>⚡×3 lightning</b>` : ""));
      chipFlyFrom(runnerId, matchId);
      closeSheet();
      afterAction(matchId);
    } catch (err) {
      toast(String(err.message ?? err), "warn");
    }
  };
}

/* ═══════════════════════ RESULT — podium on the table ══════════════════ */
function renderResult(state, match) {
  if (!match) return go("home");
  if (match.status !== "complete") return go(`table?m=${match.config.id}`);
  feedSeed(match);
  const you = state.player;
  const rows = E.finalStandings(match);
  const win = rows[0];
  const kitty = match.board?.kitty ?? 0;
  const designated = S.potFor(match.config.id, state).designatedCharityId;
  const podium = rows.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean); // 2,1,3

  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "home", kicker: "Race complete", name: match.config.name })}
    <div class="bd-tablewrap">
      <div class="bd-table" id="felt">
        <div class="bd-track" id="track"></div>
        <div class="bd-confetti">
          ${Array.from({ length: 18 }, (_, i) =>
            `<i style="left:${(i * 5.4 + 4) % 96}%;--c:${["var(--lime)", "var(--rar-legendary)", "var(--sky)", "var(--coral)"][i % 4]};--dur:${2.2 + (i % 5) * 0.4}s;--delay:${(i % 7) * 0.3}s"></i>`).join("")}
        </div>
        <div class="bd-kitty" id="kitty">
          <span class="bd-kitty__label">KITTY</span>
          <span class="bd-kitty__total" id="kittyTotal">${kitty}</span>
          <span class="bd-kitty__pts">PTS</span>
          <div class="bd-stacks" id="stacks"></div>
        </div>
        <div class="bd-podium">
          ${order.map((r) => {
            const place = r === podium[0] ? 1 : r === podium[1] ? 2 : 3;
            return `
            <div class="bd-ped bd-ped--${place}">
              <span class="bd-ped__who">
                <span class="bd-ped__chip" style="--tier:${r.player.id === you?.id ? "var(--lime)" : tierCol(r.player.tier)}">${initials(r.player.name)}</span>
                ${esc(r.player.name)}
              </span>
              <span class="bd-ped__base">${place}</span>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>
    <div class="bd-pad">
      <p class="bd-kicker">Final placings — handicapped scores + closure bonus</p>
      <div class="bd-positions" style="margin-top:8px">
        ${rows.map((r, i) => `
          <div class="bd-prow ${r.player.id === you?.id ? "bd-prow--you" : ""}">
            <span class="bd-prow__pos">P${i + 1}</span>
            <span class="bd-prow__chip" style="--tier:${r.player.id === you?.id ? "var(--lime)" : tierCol(r.player.tier)}">${initials(r.player.name)}</span>
            <span class="bd-prow__name">${esc(r.player.name)}${r.player.id === match.closedBy ? " · closed" : ""}</span>
            <span class="bd-prow__gap">${r.adjustedScore}</span>
            <span class="bd-prow__rp">${r.rawReps}r</span>
          </div>`).join("")}
      </div>
      <p class="bd-kicker" style="margin-top:18px">${esc(win.player.name)} directs the ${kitty}-pt kitty</p>
      <div class="bd-chiprow" style="margin-top:8px" id="charRow">
        ${S.CHARITIES.map((c) => `
          <button class="bd-pick ${designated === c.id ? "is-on" : ""}" data-charity="${c.id}" data-sfx="press">
            <span class="bd-pick__t">${esc(c.name)}</span>
          </button>`).join("")}
      </div>
      <div style="display:flex;gap:8px;margin-top:18px">
        <button class="pop-btn pop-btn--big" style="flex:1" id="rematchBtn" data-sfx="deal">Rematch</button>
        <button class="pop-btn pop-btn--ghost pop-btn--big" data-go="squad" data-sfx="press">Squad</button>
      </div>
    </div>
  </div>`;

  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));
  $("#stacks").innerHTML = E.chipMix(kitty).map((s) => `
    <span class="bd-stack bd-stack--${s.id}">
      ${Array.from({ length: Math.min(5, s.count) }, () => `<i class="bd-chip bd-chip--${s.id}"></i>`).join("")}
      ${s.count > 1 ? `<span class="bd-stack__n">×${s.count}</span>` : ""}
    </span>`).join("");
  sfx("win");

  $$("#charRow .bd-pick").forEach((b) => (b.onclick = () => {
    sfx("chip");
    S.designatePot(match.config.id, b.dataset.charity);
    $$("#charRow .bd-pick").forEach((x) => x.classList.toggle("is-on", x === b));
    toast(`Kitty → ${S.CHARITIES.find((c) => c.id === b.dataset.charity).name}`, "ok");
  }));
  $("#rematchBtn").onclick = () => {
    sfx("deal");
    const m = S.rematch(match.config.id);
    go(`draft?m=${m.config.id}`);
  };
}

/* ═══════════════════════ SQUAD — season dashboard ══════════════════════ */
function renderSquad(state) {
  const you = S.me(state);
  const ladder = S.ladder(state);
  const stats = S.stats(state);
  $app.innerHTML = `
  <div class="bd-screen">
    ${topBar({ back: "home", kicker: "Season 1", name: "Squad standings" })}
    <div class="bd-pad">
      <div class="bd-chiprow">
        <span class="bd-dm">◈ ${stats.lifetimeReps} lifetime reps</span>
        <span class="bd-dm">🏆 ${stats.wins} wins</span>
        <span class="bd-dm">⚡ ${stats.comebacks} comebacks</span>
        <span class="bd-dm">🔥 ${stats.streak}-day streak</span>
      </div>
      <table class="bd-lad">
        <thead><tr><th>#</th><th>Runner</th><th>PTS</th><th>W</th><th>MVP</th></tr></thead>
        <tbody>
          ${ladder.map((r, i) => `
            <tr class="${r.playerId === you?.id ? "is-you" : ""}">
              <td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.points}</td><td>${r.wins}</td><td>${r.mvpCount}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>`;
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("press"); go(b.dataset.go); }));
}

/* ═══════════════════════ toasts ════════════════════════════════════════ */
function toast(msg, kind = "") {
  let host = $(".bd-toasts");
  if (!host) {
    host = document.createElement("div");
    host.className = "bd-toasts";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = `bd-toast ${kind ? `bd-toast--${kind}` : ""}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.classList.add("is-out"); t.addEventListener("animationend", () => t.remove(), { once: true }); }, 2400);
}

/* global click → sfx for every data-sfx button (defensive) */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sfx]");
  if (b) sfx(b.dataset.sfx === "press" ? "press" : b.dataset.sfx);
}, true);

/* ═══════════════════════ e2e hooks ═════════════════════════════════════ */
window.__rwfBoard = {
  ready: true,
  view: () => route(),
  matchId: () => {
    const m = S.currentMatch(S.load());
    return m?.config.id ?? null;
  },
  state: () => S.load(),
  tokenPos: (pid) => {
    const el = document.querySelector(`.bd-token[data-pid="${pid}"]`);
    if (!el) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: +m.e.toFixed(1), y: +m.f.toFixed(1) };
  },
  kittyTotal: () => +(document.querySelector("#kittyTotal")?.textContent ?? -1),
  chipCount: () => document.querySelectorAll("#stacks .bd-chip").length,
  handKinds: () => [...document.querySelectorAll("#hand .bd-card")].map((c) => c.dataset.kind),
  cardTransform: (i = 0) => getComputedStyle(document.querySelectorAll("#hand .bd-card")[i] ?? document.body).transform,
  btnShadow: (sel) => getComputedStyle(document.querySelector(sel) ?? document.body).boxShadow,
  btnPressedTransform: (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const prev = el.style.transition;
    el.style.transition = "none"; // skip the 120ms press transition — read the END state
    el.classList.add("is-pressed");
    const t = getComputedStyle(el).transform;
    el.classList.remove("is-pressed");
    el.style.transition = prev;
    return t;
  },
  /* e2e driver: log reps for YOU through the real state layer (the UI's
     own log sheet does exactly this + the chip-fly); returns engine result */
  driveLog: (reps = 25, exerciseId = null) => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    const ex = exerciseId ?? m.config.exercises[0].id;
    const r = S.logToMatch(m.config.id, { exerciseId: ex, reps, playerId: state.player.id });
    feedPush(m.config.id, lapOf(r.match).n,
      `<b>${esc(state.player.name)}</b> logs ${reps} ${esc(exName(m, ex))}` +
      (r.comeback ? ` · <b>⚡ comeback ×1.2</b>` : "") +
      (r.lightning ? ` · <b>⚡×3 lightning</b>` : ""));
    afterAction(m.config.id);
    return { ok: true, closed: r.closed, comeback: r.comeback, lightning: r.lightning };
  },
  driveSim: () => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m) return { logged: [] };
    const r = S.simMates(m.config.id);
    r.logged.forEach((l) => feedPush(m.config.id, lapOf(S.matchById(m.config.id)).n,
      `<b>${esc(nameOf(m, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`));
    if (r.logged.length) chipFlyFrom(r.logged[r.logged.length - 1].playerId, m.config.id);
    afterAction(m.config.id);
    return r;
  },
};

/* boot */
render();
