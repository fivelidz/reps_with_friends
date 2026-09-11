/* ═══════════════════════════════════════════════════════════════════════
   RWF · V3 THE BATTLE COURSE — app.js (UX2 — the 3-click entry)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   UX2 (founder's first-play feedback: "a million clicks just to make a
   team — less clicks to buy a car"):
     · THREE CLICKS TO PLAYING — type your name → tap a tier → tap
       START THE BATTLE. You land ON THE 3D COURSE in a LIVE battle vs
       the seeded demo crew (varied tiers). Everything else is auto-set:
       target 200 · every day active · bodyweight pack · weekly season ·
       giving OFF · power-ups auto-dealt (strongest of your dealt three).
     · ZERO WIZARD — the old setup/create screens are archived
       (apps/v3/archive/2026-09-11_wizard-entry); #/setup and #/create
       redirect to #/play.
     · ⚙︎ HOUSE RULES — the quick-bar gear opens the full config ON the
       course, framed as rule cards ("Target 200 ↔ 150/250"): config
       changes take effect next battle, or immediately where safe
       (species head → frog!, giving UI).
     · THE COURSE IS THE EXPERIENCE — after START every screen IS the
       course (TABLE camera default, drag-to-look hint fading on first
       touch). The hub (home) shows START A BATTLE / JOIN WITH CODE /
       your battles with one-tap resume.

   Views (hash router): #/home (hub) · #/play (3-click entry) · #/battle
   · #/result · #/squad · legacy #/setup + #/create → #/play
   The 3D course renders ONCE per visit; state changes PATCH in place —
   runners lerp forward (never a re-mount mid-battle), cards float in
   sync with the hand, the charity pot grows. Card choreography is the
   v2 CSS-3D rig (classes reused verbatim); the 3D layer mirrors every
   play with a billboard flight + burst.

   LANGUAGE: battle language only — battle · battle live · fast battle ·
   danger zone · RUF · log reps · charity pot. The founder's rule: no
   poker / board-game words in UI copy (kitty, table, lap, race night
   never appear).

   Sound: apps/v3/sfx.js (a defensive copy of the sfx-demo module) IS loaded
   by index.html and sets window.rwfSfx — every event still calls it with ?.
   (silence is fine if the module ever fails). Full cue set: tap · primary ·
   log (combo pitch climbs) · deal · flip · play · win · lose (you didn't
   take the pot) · pot · tick (final minute) · dz (heartbeat on each
   danger-zone step up) · swipe (screen changes) · error. Mute: the 🔊/🔇
   button in the quick bar, persisted at localStorage rwf.sfx.muted — the
   key shared with v1, v2 and /sfx (mute anywhere, muted everywhere).
   ═══════════════════════════════════════════════════════════════════════ */

import * as E from "./engine.js";
import * as S from "./state.js";
import * as D from "./daily.js";
import { Course3D, COURSE_LEN, START_Z } from "./course.js";

const $app = document.getElementById("app");
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── sound (defensive — the SFX module may not be loaded) ─────────────── */
function sfx(name) {
  try { window.rwfSfx?.play?.(name); } catch { /* module absent — fine */ }
}

/* ── the top-bar mute toggle (drives window.rwfSfx; shared rwf.sfx.muted) */
function muteBtnHtml() {
  let muted = false;
  try { muted = !!window.rwfSfx?.isMuted?.(); } catch {}
  return `<button class="v3-mute" aria-pressed="${muted}" aria-label="${muted ? "Sound off — tap to unmute" : "Sound on — tap to mute"}" title="${muted ? "Unmute" : "Mute"}"><span>${muted ? "🔇" : "🔊"}</span></button>`;
}
function paintMute(root = document) {
  root.querySelectorAll(".v3-mute").forEach((b) => {
    let muted = false;
    try { muted = !!window.rwfSfx?.isMuted?.(); } catch {}
    b.setAttribute("aria-pressed", String(muted));
    b.setAttribute("aria-label", muted ? "Sound off — tap to unmute" : "Sound on — tap to mute");
    b.setAttribute("title", muted ? "Unmute" : "Mute");
    b.querySelector("span").textContent = muted ? "🔇" : "🔊";
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".v3-mute");
  if (!b) return;
  const api = window.rwfSfx;
  if (!api?.toggle) return;
  const muted = api.toggle();
  paintMute();
  if (!muted) sfx("tap"); // audible confirmation the sound is back
});

/* ═════════════════════════ THE QUICK BAR — persistent top nav ══════════
   The founder: "navigation of the options and back to the dashboard should
   be easier too." One slim bar, fixed, on EVERY screen (mid-battle too):
     ⌂ DASHBOARD (home) · ◉ camera cycle (battle) · ⚙ house rules ·
     ◐ theme · 🔊 sound
   One tap from anywhere. The per-screen HUD underneath is untouched.
   UX2: the gear is the ONLY settings surface — the 3-click entry auto-sets
   everything, and this is where you change it later. */
const THEMES = [
  { id: "night", label: "Night" },   // the default stadium night (tokens.css)
  { id: "court", label: "Court" },   // amber court sport
  { id: "ice", label: "Ice" },       // glacier blue
];
let themeIdx = Math.max(0, THEMES.findIndex((t) => t.id === (localStorage.getItem("rwf.v3.theme") ?? "night")));
function applyTheme() {
  document.body.dataset.rwfTheme = THEMES[themeIdx].id;
  const btn = document.getElementById("qTheme");
  if (btn) {
    btn.setAttribute("aria-label", `Theme — ${THEMES[themeIdx].label} (tap to change)`);
    btn.title = `Theme — ${THEMES[themeIdx].label}`;
  }
}
function buildQuickbar() {
  const bar = document.createElement("nav");
  bar.className = "v3-quick";
  bar.id = "v3quick";
  bar.innerHTML = `
    <button class="v3-quick__btn v3-quick__home" id="qHome" aria-label="Dashboard — back to home" title="Dashboard">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.2 12 4l8 7.2v8.3a1 1 0 0 1-1 1h-4.6v-5.7h-4.8v5.7H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      <span>DASHBOARD</span>
    </button>
    <button class="v3-quick__btn v3-quick__cam v3-cam" id="qCam" data-mode="table" hidden aria-label="Cycle camera view (table, stadium, leader cam)" title="Camera view">
      <span class="v3-cam__dot"></span><span id="qCamLbl">CAM · TABLE</span>
    </button>
    <span class="v3-quick__spring" aria-hidden="true"></span>
    <button class="v3-quick__btn v3-quick__icon" id="qSettings" aria-label="House rules — settings" title="House rules">⚙︎</button>
    <button class="v3-quick__btn v3-quick__icon" id="qTheme" aria-label="Theme" title="Theme">◐</button>
    ${muteBtnHtml()}`;
  document.body.prepend(bar);
  $("#qHome").onclick = () => { sfx("tap"); go("home"); };
  $("#qSettings").onclick = () => { sfx("tap"); openSettingsSheet(); };
  $("#qTheme").onclick = () => {
    sfx("tap");
    themeIdx = (themeIdx + 1) % THEMES.length;
    localStorage.setItem("rwf.v3.theme", THEMES[themeIdx].id);
    applyTheme();
    toast(`Theme — ${THEMES[themeIdx].label}`, "ok");
  };
  $("#qCam").onclick = () => {
    if (!course) return;
    sfx("tap");
    paintCamChrome(course.cycleCamera());
  };
  applyTheme();
  paintMute(bar);
}

/* camera chrome (quick bar label + in-course hint) — safe from any view */
const CAM_LABEL = { table: "CAM · TABLE", stadium: "CAM · STADIUM", follow: "CAM · FOLLOW" };
const CAM_HINT = {
  table: "DRAG TO LOOK · PINCH TO ZOOM · C TO CYCLE",
  stadium: "HIGH SWEEP — THE SPECTACLE · C TO CYCLE",
  follow: "LEADER CAM · C TO CYCLE",
};
function paintCamChrome(mode) {
  const btn = document.getElementById("qCam");
  if (btn) {
    btn.dataset.mode = mode;
    btn.setAttribute("aria-label", `Camera — ${CAM_LABEL[mode] ?? mode} (tap to cycle)`);
  }
  const lbl = document.getElementById("qCamLbl");
  if (lbl) lbl.textContent = CAM_LABEL[mode] ?? mode;
  const hint = document.getElementById("camHint");
  if (hint) hint.textContent = CAM_HINT[mode] ?? "";
}
/* keyboard C — cycle the POV from anywhere on the battle course */
addEventListener("keydown", (e) => {
  if (e.key !== "c" && e.key !== "C") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (route() !== "battle" || !course) return;
  e.preventDefault();
  paintCamChrome(course.cycleCamera());
});

/* ── tier colours (lanes, tints, chips) + card faces ──────────────────── */
const TIER_COL = { couch: "#ffb03a", casual: "#6ec1ff", fit: "#c6f32e", athlete: "#b78cff" };
const tierHex = (tier, isYou) => (isYou ? "#c6f32e" : TIER_COL[tier] ?? "#34d399");
const initials = (name) =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const CARD_ICONS = {
  lightning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13.5h5L8.5 22 19 10.5h-6L13 2z" fill="currentColor"/></svg>`,
  steal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13l-3-3 2-2 6 6-6 6-2-2 3-3H3V8zm18 6H8l3 3-2 2-6-6 6-6 2 2-3 3h13v2z" fill="currentColor" transform="scale(0.92) translate(1,1)"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5.2-3.4 8.8-8 11-4.6-2.2-8-5.8-8-11V5l8-3z" fill="currentColor" opacity="0.9"/><path d="M12 2l8 3v6c0 5.2-3.4 8.8-8 11-4.6-2.2-8-5.8-8-11V5l8-3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  freeze: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22M2 6l20 12M22 6L2 18M12 1l-2.5 2.5M12 1l2.5 2.5M12 23l-2.5-2.5M12 23l2.5-2.5M2 6l3.4.4M2 6l.4 3.4M22 18l-3.4-.4M22 18l-.4-3.4M22 6l-3.4.4M22 6l-.4 3.4M2 18l3.4-.4M2 18l.4-3.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`,
};
/* glyph for the 3D card faces (canvas-safe) — the SoT CARD_ICONS set:
   all 21 deck kinds, matching site/models/cards3d.js's DECK art */
const CARD_GLYPHS = {
  lightning: "⚡", steal: "🥷", shield: "🛡", freeze: "❄",
  combo_boost: "🔥", double_down: "🎲", assist_boost: "🤝",
  surprise_bomb: "💣", rescue_rope: "🪢", shield_bash: "🔨",
  double_exercise: "🏋️", specialist: "🎯", wildcard_workout: "🃏",
  rivalry: "⚔️", training_partners: "🤜", pack_bond: "🐺",
  prove_it: "📋", spot_check: "🔍",
  second_wind: "💨", mulligan: "🔄", underdog: "🐕",
};
const RAR_COL = { common: "#9aa7a0", rare: "#6ec1ff", epic: "#b78cff", legendary: "#ffc941" };

/* ═══════════════════════ commentary feed (in-memory, per battle) ══════ */
const feeds = new Map(); // matchId → [{html}]
function feedPush(matchId, html) {
  const arr = feeds.get(matchId) ?? [];
  arr.unshift({ html });
  feeds.set(matchId, arr.slice(0, 30));
}
function feedSeed(match) {
  if (feeds.has(match.config.id)) return;
  const lines = [];
  for (const e of match.entries.slice(-6)) {
    if (e.steal) continue;
    const p = match.players.find((x) => x.id === e.playerId);
    if (p) lines.push({ html: `<b>${esc(p.name)}</b> logs ${e.reps} ${esc(exName(match, e.exerciseId))}` });
  }
  for (const l of (match.powerLog ?? []).slice(-3)) lines.push({ html: powerLine(match, l) });
  if (match.status === "complete") {
    const w = E.winner(match);
    const p = match.players.find((x) => x.id === w?.playerId);
    lines.push({ html: `<b>BATTLE COMPLETE</b> — ${esc(p?.name ?? "the clock")} takes the charity pot` });
  }
  feeds.set(match.config.id, lines.slice(0, 10));
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
const nameOf = (m, id) => (S.me()?.id === id ? S.me().name : m.players.find((p) => p.id === id)?.name ?? id);

/* ═══════════════════════ router + 3D lifecycle ════════════════════════ */
let ticker = null;
let course = null; // the ONE live Course3D (lazy context — disposed on route change)
let dzLevel = 0;   // last danger level seen — sfx("dz") fires only on a rise

function stopCourse() {
  stopTicker();
  if (course) { course.dispose(); course = null; }
}
const route = () => {
  const h = location.hash.replace(/^#\/?/, "") || "home";
  return h.split("?")[0];
};
function go(view) { location.hash = `#/${view}`; }

addEventListener("hashchange", render);

function render() {
  stopCourse();
  closeSheet(true);
  const view = route();
  syncQuickbar(view);
  dzLevel = 0;           // fresh screen — the DZ heartbeat only fires on a RISE
  sfx("swipe");          // nav whoosh on every screen change (no-op pre-gesture)
  const state = S.load();
  const match = view === "battle" || view === "result"
    ? S.matchById(new URLSearchParams(location.hash.split("?")[1] ?? "").get("m") ?? "") ?? S.currentMatch(state)
    : null;

  /* UX2 ROUTING — the course is the experience. A fresh visitor (no
     identity) lands on the 3-click entry, never a hub or wizard; the
     archived setup/create screens redirect; a battle-less #/battle
     returns to the hub whose hero makes a battle instantly. */
  if (view === "home") return state.player ? renderHome(state) : go("play");
  if (view === "play") return renderEntry(state);
  if (view === "setup") return go("play"); // archived wizard → the 3-click entry
  if (view === "create") return go(state.player ? "home" : "play"); // archived
  if (view === "battle") {
    if (!state.player) return go("play");
    const m = match ?? S.currentMatch(state);
    if (!m) return go("home");
    if (m.status === "complete") return go(`result?m=${m.config.id}`);
    return renderBattle(S.load(), m);
  }
  if (view === "result") return renderResult(state, match ?? S.currentMatch(state));
  if (view === "squad") return renderSquad(state);
  return renderHome(state);
}
function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

/* ── shared chrome ────────────────────────────────────────────────────── */
function topBar({ back = "home", kicker = "", name = "", right = "" }) {
  // (sound lives in the persistent quick bar above — one toggle, every screen)
  return `
  <header class="v3-top">
    ${back ? `<button class="v3-top__back" data-go="${back}" aria-label="back">‹</button>` : `<span class="v3-top__spacer" aria-hidden="true"></span>`}
    <div class="v3-top__title">
      <p class="v3-top__kicker">${esc(kicker)}</p>
      <h2 class="v3-top__name">${esc(name)}</h2>
    </div>
    ${right}
  </header>`;
}

/* quick bar sync — the camera cycle only exists on the battle course */
function syncQuickbar(view) {
  const cam = document.getElementById("qCam");
  if (cam) cam.hidden = view !== "battle";
}

/* ═══════════════════════ HOME — THE HUB (UX2) ════════════════════════
   The founder: "unsure how the game hub display works." Now it is
   self-evident — exactly three things, nothing else:
     1 · START A BATTLE — the hero (→ the 3-click entry, then live).
     2 · JOIN WITH CODE — the secondary (bots bridge `link <CODE>`).
     3 · YOUR BATTLES — LIVE first, ONE TAP resumes on the course. */
function renderHome(state) {
  const me = S.me(state);
  const rank = { live: 0, open: 1, complete: 2 };
  const matches = [...state.matches]
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      String(b.config.id).localeCompare(String(a.config.id)))
    .slice(0, 8);
  const liveCount = state.matches.filter((m) => m.status === "live").length;
  $app.innerHTML = `
  <div class="v3-screen">
    ${topBar({ back: null, kicker: "Reps With Friends", name: me ? `Battle day · ${me.name}` : "The Battle Course" })}
    <div class="v3-pad">
      <h1 class="v3-h1">Run the course.<br><em>Hold your cards.</em></h1>
      <button class="pop-btn pop-btn--big pop-btn--full" id="newBattle" data-sfx="primary">START A BATTLE</button>
      <p class="v3-hub__sub">You <b>+ the demo crew</b> · target <b>200</b> unless you say otherwise · live in seconds${liveCount ? ` · <b>${liveCount} live</b> now` : ""}</p>
      <button class="pop-btn pop-btn--ghost pop-btn--full" id="joinBtn" data-sfx="tap">JOIN WITH CODE</button>

      <p class="v3-kicker" style="margin-top:22px">Your battles — tap to resume</p>
      <div class="v3-battles" id="battles">
        ${matches.length ? matches.map(battleCard).join("") : `
          <p class="v3-sub" style="margin:6px 0 0">No battles yet — the hero above makes one instantly.</p>`}
      </div>
    </div>
  </div>`;

  $("#newBattle").onclick = () => { sfx("primary"); go("play"); }; // hero → 3-click entry
  $("#joinBtn").onclick = () => { sfx("tap"); openJoinSheet(); };
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));
  $app.querySelectorAll("[data-open]").forEach((b) =>
    (b.onclick = () => {
      sfx("tap");
      const m = state.matches.find((x) => x.config.id === b.dataset.open);
      if (!m) return;
      if (m.status === "complete") return go(`result?m=${m.config.id}`);
      go(`battle?m=${m.config.id}`); // ONE TAP resumes
    }));
}

/* JOIN WITH CODE — a warm seat, never a dead end: the bots bridge links
   real friends via `link <CODE>`; until they arrive a code opens a live
   battle vs the demo crew branded with the code. */
function openJoinSheet() {
  openSheet(`
    <div class="bd-sheet__grab"></div>
    <h3 class="bd-sheet__h">Join with a code</h3>
    <p class="v3-sub" style="margin:0 0 12px">Your crew's battle code comes from their chat bot
      (<b>link &lt;CODE&gt;</b>). Until a friend links in, the code opens a live
      battle vs the demo crew so nothing stalls.</p>
    <input class="v3-input" id="codeIn" maxlength="12" placeholder="e.g. CREW-0QXZ" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase">
    <button class="pop-btn pop-btn--big pop-btn--full" id="joinGo" style="margin-top:12px" data-sfx="deal" disabled>Join the battle</button>`);
  const inp = sheetEl.querySelector("#codeIn");
  const goBtn = sheetEl.querySelector("#joinGo");
  inp.oninput = () => { goBtn.disabled = !inp.value.trim(); };
  inp.onkeydown = (e) => { if (e.key === "Enter" && !goBtn.disabled) goBtn.click(); };
  setTimeout(() => inp.focus(), 120);
  goBtn.onclick = () => {
    sfx("deal");
    const r = S.joinByCode(inp.value);
    if (!r.ok) { sfx("error"); toast(r.reason ?? "That code won't work", "warn"); return; }
    closeSheet(true);
    toast(`Joined ${r.match.config.name} — battle live`, "ok");
    go(`battle?m=${r.match.config.id}`);
  };
}

function battleCard(m) {
  const you = S.me();
  const st = m.status;
  const statusCls = st === "live" ? "live" : st === "open" ? "open" : "done";
  const statusTxt = st === "live" ? "BATTLE LIVE" : st === "open" ? "DRAFTING" : "SETTLED";
  const lead = E.standings(m)[0];
  const rawOf = (id) => E.playerRawReps(id, m.entries);
  const dots = m.players.slice(0, 4).map((p) => {
    const t = Math.min(0.96, m.config.targetReps ? rawOf(p.id) / m.config.targetReps : 0);
    return `<i style="left:${6 + t * 76}%;color:${tierHex(p.tier, p.id === you?.id)};background:${tierHex(p.tier, p.id === you?.id)}"></i>`;
  }).join("");
  return `
    <button class="v3-bcard" data-open="${m.config.id}" data-sfx="tap">
      <span class="v3-bcard__track">${dots}</span>
      <span style="min-width:0">
        <p class="v3-bcard__name">${esc(m.config.name)}</p>
        <p class="v3-bcard__meta">${m.players.length} runners · ${m.config.targetReps} reps · pot ${m.board?.pot ?? 0}</p>
        <p class="v3-bcard__meta">${st === "complete" ? `won by ${esc(lead?.player?.name ?? "?")}` : `lead: ${esc(lead?.player?.name ?? "—")} · ${lead?.rawReps ?? 0}`}</p>
      </span>
      <span class="v3-bcard__status v3-bcard__status--${statusCls}">${statusTxt}</span>
    </button>`;
}

/* ═══════════════════════ PLAY — THE 3-CLICK ENTRY (UX2) ══════════════
   The founder: "a million clicks just to make a team. Less clicks to buy
   a car." Three interactions, then you are ON the course:
     1 · TYPE your name        — the first keystroke auto-advances to…
     2 · TAP your tier         — 4 big targets, the ×multiplier on the
                                 face (handicaps your score)…
     3 · TAP START THE BATTLE  — a LIVE battle vs the seeded demo crew
                                 (varied tiers), every default auto-set:
                                 target 200 · every day active · bodyweight
                                 pack · weekly season · giving OFF ·
                                 power-ups auto-dealt (strongest card).
   No wizard, no battle-name form, no days/pack/target triage, no draft
   screen. Returning runners land prefilled — one tap on START re-enters.
   Everything adjustable later via ⚙︎ HOUSE RULES on the course. */
const TIER_LINES = {
  couch: "starting fresh — every rep counts more",
  casual: "in the rhythm",
  fit: "training regularly",
  athlete: "competitor — reps count less, fairly",
};
function renderEntry(state) {
  const me = S.me(state);
  const P = S.prefs(state);
  const name0 = me?.name ?? "";
  const tier0 = me?.tier ?? null;
  $app.innerHTML = `
  <div class="v3-screen v3-entry" id="entry">
    <div class="v3-entry__brand">
      <p class="v3-kicker">REPS WITH FRIENDS · THE BATTLE COURSE</p>
      <h1 class="v3-h1">Take your lane.<br><em>Three taps to the battle.</em></h1>
    </div>
    <div class="v3-pad v3-entry__pad">
      <div class="v3-entry__step ${name0 ? "is-done" : "is-now"}" id="stepName">
        <p class="v3-entry__label"><i>1</i> Your name</p>
        <input class="v3-input v3-input--big" id="nameIn" maxlength="40" placeholder="Type it — the crew's waiting" value="${esc(name0)}" autocomplete="name" enterkeyhint="next">
      </div>
      <div class="v3-entry__step ${tier0 ? "is-done" : name0 ? "is-now" : "is-wait"}" id="stepTier">
        <p class="v3-entry__label"><i>2</i> Your tier — handicaps your score</p>
        <div class="v3-tiers" id="tiers">
          ${Object.entries(E.TIER_MULTIPLIERS).map(([k, v]) => `
            <button class="v3-tier ${tier0 === k ? "is-on" : ""}" data-tier="${k}" data-sfx="tap" ${name0 ? "" : "disabled"}>
              <span class="v3-tier__x">×${v}</span>
              <span class="v3-tier__t">${k[0].toUpperCase() + k.slice(1)}</span>
              <span class="v3-tier__s">${TIER_LINES[k]}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="v3-entry__step ${name0 && tier0 ? "is-now" : "is-wait"}" id="stepGo">
        <button class="pop-btn pop-btn--big pop-btn--full" id="startBattle" data-sfx="primary" ${name0 && tier0 ? "" : "disabled"}>START THE BATTLE</button>
        <p class="v3-entry__note">Demo crew takes the other lanes · target <b>${S.targetById(P.target).reps}</b> reps ·
          today active · power-ups auto-dealt. Everything's adjustable later —
          <b>⚙︎ house rules</b>, on the course.</p>
      </div>
    </div>
  </div>`;

  let tier = tier0;
  const nameIn = $("#nameIn");
  const stepTier = $("#stepTier");
  const stepGo = $("#stepGo");
  const sync = () => {
    const ready = !!nameIn.value.trim() && !!tier;
    $("#startBattle").disabled = !ready;
    $$("#tiers .v3-tier").forEach((b) => (b.disabled = !nameIn.value.trim()));
  };
  // CLICK 1 → auto-proceed: the first keystroke wakes the tier grid.
  nameIn.oninput = () => {
    const has = !!nameIn.value.trim();
    $("#stepName").className = `v3-entry__step ${has ? "is-done" : "is-now"}`;
    stepTier.className = `v3-entry__step ${tier ? "is-done" : has ? "is-now" : "is-wait"}`;
    sync();
  };
  nameIn.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!nameIn.value.trim()) return;
    (stepTier.querySelector(".v3-tier:not(.is-on)") ?? stepTier.querySelector(".v3-tier"))?.click();
  };
  // CLICK 2 → auto-proceed: the tier tap lights START THE BATTLE.
  $$("#tiers .v3-tier").forEach((b) =>
    (b.onclick = () => {
      sfx("tap");
      tier = b.dataset.tier;
      $$("#tiers .v3-tier").forEach((x) => x.classList.toggle("is-on", x === b));
      stepTier.classList.add("is-done");
      stepGo.className = "v3-entry__step is-now";
      sync();
    }));
  // CLICK 3 → ON THE COURSE, live, instantly (demo crew auto-seated).
  $("#startBattle").onclick = () => {
    if ($("#startBattle").disabled) return;
    sfx("primary");
    S.setPlayer({ name: nameIn.value.trim() || "You", tier: tier ?? "casual" });
    const m = S.createFastBattle({}); // every default from the HOUSE-RULES prefs
    go(`battle?m=${m.config.id}`);
  };
  if (!name0) setTimeout(() => nameIn.focus(), 350); // keyboard up, step 1 lit
}

/* ═══════════════════════ THE BATTLE COURSE (flagship) ═════════════════ */
let handSig = ""; // kinds+awardedAt → rebuild the hand only on change

function renderBattle(state, matchIn) {
  const match = matchIn ?? S.currentMatch(state);
  const you = state.player;
  const youId = you.id;
  feedSeed(match);
  handSig = "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  $app.innerHTML = `
  <div class="v3-screen v3-battle">
    ${topBar({
      back: "home", kicker: "Battle live · day " + dayLabelOf(match),
      name: match.config.name,
      right: `<div class="v3-clock" id="battleClock" data-dz="0">
                <div class="v3-clock__tag" id="clockTag">BATTLE CLOCK</div>
                <div class="v3-clock__time" id="clockTime">0:00:00</div>
              </div>`,
    })}
    <div class="v3-dz" id="dzBar" data-dz="0" hidden></div>

    <div class="v3-course" id="course">
      <div class="v3-course__gl" id="gl"></div>
      <div class="v3-cam__hint" id="camHint">DRAG TO LOOK · PINCH TO ZOOM · C TO CYCLE</div>
      <div class="v3-orbit" id="orbitHint" aria-hidden="true"><span>↔ DRAG TO LOOK AROUND</span></div>
      <div class="v3-veil" id="veil"><span class="v3-veil__tag">RUNNERS WARMING UP</span></div>

      <div class="v3-hud">
        <div class="v3-strip" id="strip"></div>
        <div class="v3-feed" id="feed"></div>
        <div class="v3-fxdockwrap"><div class="bd-fxdock" id="fxdock"></div></div>
        <div class="v3-actions">
          <button class="pop-btn pop-btn--big" id="logBtn" data-sfx="tap">Log reps</button>
          <button class="pop-btn pop-btn--ghost" id="simBtn" data-sfx="tap" title="Mates log their sets">Mates</button>
          <button class="pop-btn pop-btn--ghost" id="dealDrop" data-sfx="deal" title="Daily drop — a free card">Deal</button>
        </div>
      </div>
    </div>

    <div class="v3-dock">
      <div class="bd-hand" id="hand"></div>
    </div>
  </div>`;

  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));

  /* ── the 3D course (one lazy context for the whole screen) ─────────── */
  course = new Course3D($("#gl"), {
    tierHex,
    rarHex: (r) => RAR_COL[r] ?? "#c6f32e",
    reducedMotion: reduced,
    onModelsReady: () => { $("#veil")?.remove(); },
  });
  course.setRunners(
    match.players.map((p) => ({ id: p.id, name: p.name, tier: p.tier, isYou: p.id === youId })),
    { targetReps: match.config.targetReps }
  );
  course.buildTrack(
    match.players.map((p) => ({ tier: p.tier, isYou: p.id === youId })),
    tierHex
  );
  course.start();
  course.loadAvatars();
  // species heads restore with the course (the ⚙︎ toggle persists in prefs)
  course.setHeads(S.prefs(S.load()).heads);

  /* UX2 drag-to-look affordance: a subtle centred hint that fades on the
     FIRST canvas interaction (or after 6s) — the course is touch-first. */
  {
    const orbitHint = $("#orbitHint");
    if (orbitHint) {
      const drop = () => orbitHint.classList.add("is-gone");
      $("#gl canvas")?.addEventListener("pointerdown", drop, { once: true });
      $("#gl canvas")?.addEventListener("wheel", drop, { once: true, passive: true });
      setTimeout(drop, 6000);
    }
  }

  /* the camera cycle lives in the quick bar (+ keyboard C) — TABLE is the
     founder's oblique POV and the default; paint the chrome to match */
  paintCamChrome(course.mode);

  /* ── actions ────────────────────────────────────────────────────────── */
  $("#logBtn").onclick = () => { sfx("tap"); openLogSheet(match.config.id); };
  $("#simBtn").onclick = () => {
    sfx("tap");
    const r = S.simMates(match.config.id);
    const m2 = S.matchById(match.config.id);
    r.logged.forEach((l) => {
      feedPush(match.config.id, `<b>${esc(nameOf(m2, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`);
      const p = m2?.players.find((x) => x.id === l.playerId);
      course?.repsBurst(l.playerId, l.reps, tierHex(p?.tier, false));
    });
    r.played?.forEach((p) => feedPush(match.config.id, powerLine(m2, p)));
    if (r.logged.length) course?.potBump();
    afterAction(match.config.id);
  };
  $("#dealDrop").onclick = () => {
    sfx("deal");
    const g = S.grantRandomTo(match.config.id);
    if (g) {
      toast(`Dealt: ${E.POWER_UPS[g.kind].name} (${g.rarity})`, "ok");
      feedPush(match.config.id, `<b>DEALT</b> — you draw ${esc(E.POWER_UPS[g.kind].name)}`);
      course?.dailyWinFx();
    }
    afterAction(match.config.id, { newCard: g?.kind });
  };

  updateBattle(match, { full: true });
  ticker = setInterval(() => tickClock(match.config.id), 1000);
  tickClock(match.config.id);

  /* draft pending → draft-from-3 sheet OVER the course (runners wait at
     the start). UX2: only when HOUSE RULES turns AUTO-DEAL off — the
     default 3-click path dealt your strongest card at START. */
  if (S.myDraft(match.config.id, state)) openDraftSheet(match.config.id);
}

function dayLabelOf(match) {
  const pd = (match.config.playDays?.length ? match.config.playDays : [1, 3, 5]).slice().sort((a, b) => a - b);
  const today = new Date().getDay();
  const idx = pd.indexOf(today) >= 0 ? pd.indexOf(today) : Math.max(0, pd.findIndex((d) => d > today));
  return `${idx + 1}/${pd.length}`;
}

/* per-state patch: runners, pot, cards, standings, feed, hand, fx */
function updateBattle(match, { full = false, newCard = null } = {}) {
  if (!course) return;
  const you = S.load().player;
  const rows = E.standings(match);

  /* the 3D layer */
  course.setProgress(rows);
  course.setStatus(match, {
    armed: (pid) => E.comebackEligible(match, pid),
    shielded: (pid) => !!match.shields?.[pid],
    lit: (pid) => E.lightningActive(match, pid),
  });
  course.setPot(match.board?.pot ?? 0, E.chipMix(match.board?.pot ?? 0));
  for (const p of match.players) {
    course.setCards(p.id, E.inventoryOf(match, p.id).map((c) => ({
      kind: c.kind, name: E.POWER_UPS[c.kind].name, glyph: CARD_GLYPHS[c.kind], rarity: E.POWER_UPS[c.kind].rarity,
    })));
  }

  /* standings strip (2D HUD) */
  $("#strip") && ($("#strip").innerHTML = rows.map((r, i) => {
    const tags = [
      E.comebackEligible(match, r.player.id) ? `<span class="v3-tag v3-tag--armed">⚡ ARMED</span>` : "",
      E.lightningActive(match, r.player.id) ? `<span class="v3-tag v3-tag--lit">×3</span>` : "",
      match.shields?.[r.player.id] ? `<span class="v3-tag v3-tag--shield">🛡</span>` : "",
    ].join("");
    return `
      <div class="v3-srow ${r.player.id === you?.id ? "v3-srow--you" : ""}">
        <span class="v3-srow__pos">P${i + 1}</span>
        <span class="v3-srow__chip" style="--tier:${tierHex(r.player.tier, r.player.id === you?.id)}">${initials(r.player.name)}</span>
        <span class="v3-srow__name" data-fullname="${esc(r.player.name)}" title="${esc(r.player.name)}">${esc(r.player.name)}</span>
        ${tags}
        <span class="v3-srow__pct">${Math.round(r.progressPct)}%</span>
        <span class="v3-srow__ruf">◈${E.boardPoints(match, r.player.id)}</span>
      </div>`;
  }).join(""));

  /* UX2 display fix: long names truncate with ellipsis — tap for the full
     name (a toast, so nothing covers anything). */
  $("#strip")?.querySelectorAll(".v3-srow__name").forEach((el) =>
    (el.onclick = () => { sfx("tap"); toast(el.dataset.fullname, "ok"); }));

  /* commentary feed */
  const feed = feeds.get(match.config.id) ?? [];
  $("#feed") && ($("#feed").innerHTML = feed.slice(0, 3).map((l) => `<div>${l.html}</div>`).join(""));

  /* hand — rebuild only when the cards actually changed */
  const inv = E.inventoryOf(match, you?.id);
  const sig = inv.map((c) => `${c.kind}:${c.awardedAt}`).join("|");
  if (sig !== handSig) {
    const freshSet = new Set((handSig ? handSig.split("|").map((s) => s.split(":").slice(0, -1).join(":")) : []));
    handSig = sig;
    const hand = $("#hand");
    if (hand) {
      hand.innerHTML = inv.length
        ? inv.map((c, i) => {
            const newCardFlag = newCard ? c.kind === newCard : !freshSet.has(`${c.kind}`);
            return `<div class="bd-hand__slot">${cardHTML(E.POWER_UPS[c.kind], { deal: newCardFlag, delay: i * 0.08 })}</div>`;
          }).join("")
        : `<p class="v3-sub" style="margin:auto;text-align:center">No cards in hand — hit <b>DEAL</b> for the daily drop.</p>`;
      wireHand(match);
    }
  }

  updateFx(match);
}

/* card interactions: tap → detail sheet → PLAY (CSS fly + 3D burst) */
function wireHand(match) {
  $$("#hand .bd-card").forEach((cardEl) => {
    cardEl.onclick = () => { sfx("tap"); openCardSheet(match.config.id, cardEl); };
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
  const ruf = E.boardPoints(match, you.id);
  const stealPrev = kind === "steal" ? E.stealPreview(match, you.id) : null;

  openSheet(`
    <div class="bd-sheet__grab"></div>
    <div class="bd-cdetail">
      <div class="bd-cdetail__mini">${cardHTML(def, { cost: false })}</div>
      <div class="bd-cdetail__body">
        <p class="v3-kicker">${def.rarity} card</p>
        <h3 class="bd-cdetail__name">${esc(def.name)}</h3>
        <p class="bd-cdetail__blurb">${esc(def.blurb)}${stealPrev ? ` — would take <b>${stealPrev.amount}</b> reps from ${esc(stealPrev.victim.name)}${stealPrev.blocked ? " (🛡 shielded)" : ""}` : ""}</p>
        <div class="bd-cdetail__meta">
          <span class="bd-cdetail__rp">◈ ${ruf} RUF · costs ${cost} RUF</span>
          <button class="pop-btn pop-btn--sm" id="playIt" data-sfx="play" ${ruf < cost || match.status !== "live" ? "disabled" : ""}>Play card</button>
        </div>
      </div>
    </div>`);

  // scoped to THIS sheet — a global #playIt query could catch a stale one
  sheetEl.querySelector("#playIt").onclick = () => {
    closeSheet();
    playCard(matchId, kind, cardEl);
  };
}

function playCard(matchId, kind, cardEl) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  const res = S.boardPlayInMatch(matchId, { kind });
  if (!res.result.ok) {
    sfx("error");
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
  feedPush(matchId, lines[kind] ?? `<b>CARD</b> — you play ${esc(E.POWER_UPS[kind].name)}`);
  toast(`${E.POWER_UPS[kind].name} played${res.spent ? ` · −${res.spent} RUF` : ""}`, "ok");

  /* CSS rig: the card flips face-down and flies up out of the hand */
  const slot = cardEl.closest(".bd-hand__slot") ?? cardEl;
  const rect = cardEl.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.className = "bd-card is-playing";
  fly.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:70;--fly-dx:0px;--fly-dy:-42vh;`;
  fly.innerHTML = cardEl.querySelector(".bd-card__inner").outerHTML;
  document.body.appendChild(fly);
  fly.addEventListener("animationend", () => fly.remove(), { once: true });
  setTimeout(() => fly.remove(), 1400); // safety net — animationend can stall (0.95s anim)

  /* 3D mirror: the real card lifts out of the fan, flies to your runner's
     head and bursts (rarity-coloured — CARDS3D + the confetti language) */
  course?.playCardFx(state.player.id, {
    kind, name: E.POWER_UPS[kind].name, glyph: CARD_GLYPHS[kind], rarity: E.POWER_UPS[kind].rarity,
  });

  afterAction(matchId);
}

/* active-effects dock: lightning countdown ring + shield */
let litWasActive = false;
let fxBurning = false;
function updateFx(match) {
  const dock = $("#fxdock");
  if (!dock) return;
  const you = S.load().player?.id;
  const lit = E.lightningActive(match, you);
  const shield = !!match.shields?.[you];
  const rem = E.lightningRemainingMs(match, you);

  if (lit && !litWasActive) sfx("deal");
  const justExpired = !lit && litWasActive;
  litWasActive = lit;

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
  if (fxBurning) return;

  const chips = [];
  if (lit) {
    const p = rem / E.LIGHTNING_MS;
    const m = Math.floor(rem / 60e3), s = Math.floor((rem % 60e3) / 1e3);
    chips.push(`<span class="bd-fx" data-fx="lightning"><span class="bd-fx__ring" style="--p:${p.toFixed(3)}"><span>⚡</span></span>×3 · ${m}:${String(s).padStart(2, "0")}</span>`);
  }
  if (shield) chips.push(`<span class="bd-fx" data-fx="shield"><span class="bd-fx__ring" style="background:var(--sky)"><span>🛡</span></span>shielded</span>`);
  dock.innerHTML = chips.join("");
}

/* battle clock + danger zone + the OTHER deadline (the clock) */
function tickClock(matchId) {
  const match = S.matchById(matchId);
  if (!match) return stopTicker();
  const clock = $("#battleClock");
  if (!clock) return stopTicker();
  const now = Date.now();
  const rem = Math.max(0, (match.deadlineAt ?? now) - now);
  $("#clockTime").textContent = D.fmtClock(rem);
  const dz = D.dangerLevel(match);
  clock.dataset.dz = String(dz);
  const bar = $("#dzBar");
  if (bar) {
    bar.hidden = dz === 0;
    if (dz > 0) { bar.dataset.dz = String(dz); bar.textContent = D.dzCopy(dz, rem); }
  }
  if (dz > dzLevel) sfx("dz");  // heartbeat thump on each danger-zone step UP
  dzLevel = dz;
  if (rem <= 60e3 && rem > 0) sfx("tick"); // deadline seconds — final minute

  /* dual deadline, other half: the clock closes a live battle */
  if (match.status === "live" && (match.deadlineAt ?? Infinity) <= now) {
    const r = S.closeByDeadline(matchId);
    if (r.closed) {
      feedPush(matchId, `<b>BATTLE COMPLETE</b> — the clock closed it`);
      go(`result?m=${matchId}`); // the result screen owns the win/lose chime
      return;
    }
  }
  const m2 = S.matchById(matchId);
  if (m2) updateFx(m2);
}

/* one state mutation happened → patch the battle (no re-render) */
function afterAction(matchId, opts = {}) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  if (!match) return;
  if (match.status === "complete") {
    feedPush(matchId, `<b>BATTLE COMPLETE</b> — ${esc(nameOf(match, E.winner(match)?.playerId))} takes the charity pot`);
    setTimeout(() => go(`result?m=${matchId}`), 700); // result screen chimes win/lose
    return;
  }
  updateBattle(match, opts);
  tickClock(matchId);
}

/* ═══════════════════════ SHEETS ═══════════════════════════════════════ */
let sheetEl = null;
const closingSheets = new Set(); // animated closers — linger ~400ms mid-fade
function openSheet(inner) {
  closeSheet(true);
  // purge lingering closers BEFORE building the new sheet: a stale sheet's
  // #playIt would shadow the fresh one (querySelector finds the first) and
  // the new sheet's Play button would be born unbound. Seen headless; also
  // reachable on a phone when tapping card B while card A's sheet fades.
  for (const el of closingSheets) el.remove();
  closingSheets.clear();
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
  closingSheets.add(el);
  el.addEventListener("animationend", () => { el.remove(); closingSheets.delete(el); }, { once: true });
  // safety net: animationend stalls on starved GPUs / frozen tabs — never
  // let a closing sheet linger past its welcome (seen headless)
  setTimeout(() => { el.remove(); closingSheets.delete(el); }, 500);
}

/* LOG REPS — ≤3 taps: exercise, step, LOG IT (both pre-selected) */
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
    <h3 class="bd-sheet__h">${runnerId === you.id ? "Log reps" : `Log reps for ${esc(runner.name)}`}</h3>
    <div class="bd-exrow" id="exRow">
      ${match.config.exercises.map((e) => `
        <button class="bd-exchip ${e.id === exercise ? "is-on" : ""}" data-ex="${e.id}" data-sfx="tap">${esc(e.name)}</button>`).join("")}
    </div>
    <div class="bd-steprow" id="stepRow">
      ${[5, 10, 25, 50].map((n) => `
        <button class="bd-step ${n === step ? "is-on" : ""}" data-step="${n}" data-sfx="tap">+${n}</button>`).join("")}
    </div>
    <p class="v3-sub" style="margin:0 0 10px">
      ${runnerId === you.id
        ? `◈ ${E.boardPoints(match, runnerId)} RUF · ${mine.length} card${mine.length === 1 ? "" : "s"} held · every log tips ${E.POT_TIP} pts into the charity pot`
        : `${esc(runner.name)} · ◈ ${E.boardPoints(match, runnerId)} RUF`}
    </p>
    <button class="pop-btn pop-btn--big pop-btn--full" id="logGo" data-sfx="log">Log it</button>`);

  $$("#exRow .bd-exchip").forEach((b) => (b.onclick = () => {
    sfx("tap"); exercise = b.dataset.ex;
    $$("#exRow .bd-exchip").forEach((x) => x.classList.toggle("is-on", x === b));
  }));
  $$("#stepRow .bd-step").forEach((b) => (b.onclick = () => {
    sfx("tap"); step = +b.dataset.step;
    $$("#stepRow .bd-step").forEach((x) => x.classList.toggle("is-on", x === b));
  }));
  $("#logGo").onclick = () => {
    sfx("log");
    try {
      const r = S.logToMatch(matchId, { exerciseId: exercise, reps: step, playerId: runnerId });
      feedPush(matchId,
        `<b>${esc(runner.name)}</b> logs ${step} ${esc(exName(match, exercise))}` +
        (r.comeback ? ` · <b>⚡ comeback ×1.2</b>` : "") +
        (r.lightning ? ` · <b>⚡×3 lightning</b>` : ""));
      course?.repsBurst(runnerId, step, tierHex(runner.tier, runnerId === you.id));
      course?.potBump();
      closeSheet();
      afterAction(matchId);
    } catch (err) {
      toast(String(err.message ?? err), "warn");
    }
  };
}

/* DRAFT-FROM-3 — the dealt three, keep ONE (sheet over the course) */
function openDraftSheet(matchId) {
  const state = S.load();
  const match = S.matchById(matchId, state);
  const choices = S.myDraft(matchId, state);
  if (!match || !choices) return;
  const you = state.player;
  const mates = match.players.filter((p) => p.id !== you.id);

  openSheet(`
    <div class="bd-sheet__grab"></div>
    <h3 class="bd-sheet__h">Draft — keep one card</h3>
    <p class="v3-sub" style="margin:0">Dealt three, keep one — it floats over your runner on the course.
      Cards cost RUF to play; reps earn RUF.</p>
    <div class="bd-draft" id="draftFan">
      ${choices.map((k, i) => cardHTML(E.POWER_UPS[k], { deal: true, delay: i * 0.12 })).join("")}
    </div>
    <button class="pop-btn pop-btn--big pop-btn--full" id="keepBtn" data-sfx="deal" disabled>Keep it</button>
    <div class="v3-draftmates">
      ${mates.map((p) => `<span class="v3-dm"><i></i>${esc(p.name)} picked</span>`).join("")}
    </div>`);

  let pickedKind = null;
  const cards = $$("#draftFan .bd-card");
  cards.forEach((c) => {
    c.onclick = () => {
      sfx("flip");
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
        S.pickMyDraft(matchId, pickedKind);
        S.startById(matchId);
        toast(`Kept ${E.POWER_UPS[pickedKind].name} — battle is live`, "ok");
      } catch (err) { toast(String(err.message ?? err), "warn"); }
      closeSheet(true);
      handSig = ""; // force hand rebuild — the kept card deals in
      updateBattle(S.matchById(matchId) ?? match, { full: true, newCard: pickedKind });
      tickClock(matchId);
    }, 520);
  };
}

/* ═══════════════════════ ⚙︎ SETTINGS — HOUSE RULES (UX2) ════════════
   The founder: "should all be pretty default unless people want to change
   things later" + "settings changes could basically be powerups." So the
   config is framed as RULE CARDS — swappable, chunky, game pieces:
     · TARGET 200 ↔ 150/250 · exercise pack · power-up AUTO-DEAL · GIVING
       → apply from the NEXT battle (mid-battle economy never shifts).
     · SPECIES HEAD — FROG! → IMMEDIATE (visual, safe mid-battle).
     · Season card links the squad standings.
   One sheet, reachable from ⚙︎ in the quick bar — on the course, on the
   hub, anywhere. */
function openSettingsSheet() {
  const P = S.prefs(S.load());
  const me = S.me();
  const season = S.load().season;
  const ruleCard = (group, val, label, sub) => `
    <button class="rule-card ${String(P[group]) === String(val) ? "is-on" : ""}" data-rule="${group}" data-val="${val}" data-sfx="tap">
      <span class="rule-card__t">${label}</span>
      <span class="rule-card__s">${sub}</span>
    </button>`;
  openSheet(`
    <div class="bd-sheet__grab"></div>
    <h3 class="bd-sheet__h">House rules</h3>
    <p class="v3-sub" style="margin:0 0 4px">Your battle, your rules — tap a card to swap it.</p>

    <p class="v3-kicker" style="margin-top:12px">THE TARGET</p>
    <div class="rule-row" id="ruleTarget">
      ${["breezy", "standard", "bravo"].map((id) => {
        const t = S.TARGETS.find((x) => x.id === id);
        return ruleCard("target", id, `${t.reps} REPS`, id === "standard" ? "the default battle distance" : "swap the target", {});
      }).join("")}
      <span class="rule-card__note">next battle</span>
    </div>

    <p class="v3-kicker" style="margin-top:14px">THE SET</p>
    <div class="rule-row" id="rulePack">
      ${ruleCard("pack", "bodyweight", "BODYWEIGHT", "pushup · squat · situp · lunge · plank")}
      ${ruleCard("pack", "fullbody", "+ BURPEES", "the full-body pack")}
      <span class="rule-card__note">next battle</span>
    </div>

    <p class="v3-kicker" style="margin-top:14px">POWER-UPS</p>
    <div class="rule-row" id="ruleDeal">
      ${ruleCard("autoDeal", "true", "AUTO-DEAL", "cards dealt at START — no draft screen")}
      ${ruleCard("autoDeal", "false", "DRAFT FROM 3", "dealt three — you keep one")}
      <span class="rule-card__note">next battle</span>
    </div>

    <p class="v3-kicker" style="margin-top:14px">GIVING</p>
    <div class="rule-row" id="ruleGiving">
      ${ruleCard("giving", "false", "OFF", "no charity stop at the result")}
      ${ruleCard("giving", "true", "ON", "the winner directs the pot")}
      <span class="rule-card__note">next result</span>
    </div>

    <p class="v3-kicker" style="margin-top:14px">YOUR RUNNER</p>
    <div class="rule-row" id="ruleHeads">
      ${ruleCard("heads", "none", "RUNNER", "the atelier athlete trio")}
      ${ruleCard("heads", "frog", "🐸 FROG HEAD", "species head — ribbit")}
      <span class="rule-card__note">live now</span>
    </div>
    ${me ? `<p class="v3-sub" style="margin:10px 0 0">${esc(me.name)} · ${me.tier.toUpperCase()} tier · season ${season ? `week ${Math.min(season.week ?? 1, season.config?.weeks ?? 4)}/${season.config?.weeks ?? 4}` : "—"} · <button class="v3-link" id="squadLink" data-sfx="tap">squad standings →</button></p>` : ""}
  `);

  sheetEl.querySelectorAll(".rule-card").forEach((b) =>
    (b.onclick = () => {
      sfx("flip");
      const group = b.dataset.rule;
      let val = b.dataset.val;
      if (val === "true") val = true;
      else if (val === "false") val = false;
      S.setPrefs({ [group]: val });
      b.parentElement.querySelectorAll(".rule-card").forEach((x) => x.classList.toggle("is-on", x === b));
      const live = group === "heads";
      if (group === "heads" && course) course.setHeads(val);
      toast(live
        ? (val === "frog" ? "🐸 Frog heads — live" : "Runner heads back")
        : `House rule saved — ${group === "target" ? `next battle runs ${S.targetById(val).reps} reps` : group === "pack" ? "next battle swaps the set" : group === "autoDeal" ? (val ? "cards auto-deal next battle" : "draft screen returns next battle") : "giving shows at the next result"}`, "ok");
    }));
  sheetEl.querySelector("#squadLink")?.addEventListener("click", () => { closeSheet(true); go("squad"); });
}

/* ═══════════════════════ RESULT — the 3D podium ═══════════════════════ */
function renderResult(state, match) {
  if (!match) return go("home");
  if (match.status !== "complete") return go(`battle?m=${match.config.id}`);
  feedSeed(match);
  const you = state.player;
  const rows = E.finalStandings(match);
  const win = rows[0];
  const pot = match.board?.pot ?? 0;
  const designated = S.potFor(match.config.id, state).designatedCharityId;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  $app.innerHTML = `
  <div class="v3-screen v3-result">
    ${topBar({ back: "home", kicker: "Battle settled", name: match.config.name })}
    <div class="v3-course" id="course">
      <div class="v3-course__gl" id="gl"></div>
      <div class="v3-result__confetti" aria-hidden="true">
        ${Array.from({ length: 22 }, (_, i) =>
          `<i style="left:${(i * 4.6 + 3) % 97}%;--c:${["var(--lime)", "var(--rar-legendary)", "var(--sky)", "var(--coral)"][i % 4]};--dur:${2.2 + (i % 5) * 0.4}s;--delay:${(i % 7) * 0.28}s"></i>`).join("")}
      </div>
      <div class="v3-veil" id="veil"><span class="v3-veil__tag">PODIUM RISING</span></div>
      <div class="v3-resultbar">
        <span class="v3-resultbar__crown">🏆</span>
        <span class="v3-resultbar__name">
          <p class="v3-resultbar__t">${esc(win.player.name)} wins</p>
          <p class="v3-resultbar__s">${Math.round(win.adjustedScore)} RUF adjusted${match.closedBy ? ` · closed the battle` : ` · the clock closed it`}</p>
        </span>
        <span class="v3-resultbar__pot">◈ ${pot} charity pot</span>
      </div>
    </div>
    <div class="v3-pad">
      <p class="v3-kicker">Final standings — handicapped scores${match.closedBy ? " + closure bonus" : ""}</p>
      <div class="v3-battles" style="margin-top:8px">
        ${rows.map((r, i) => `
          <div class="v3-srow ${r.player.id === you?.id ? "v3-srow--you" : ""}" style="width:100%">
            <span class="v3-srow__pos">P${i + 1}</span>
            <span class="v3-srow__chip" style="--tier:${tierHex(r.player.tier, r.player.id === you?.id)}">${initials(r.player.name)}</span>
            <span class="v3-srow__name">${esc(r.player.name)}${r.player.id === match.closedBy ? " · closed" : ""}${r.player.id === you?.id ? " · YOU" : ""}</span>
            <span class="v3-srow__pct">${r.adjustedScore} RUF</span>
            <span class="v3-srow__ruf">${r.rawReps} raw</span>
          </div>`).join("")}
      </div>
      ${S.prefs(state).giving ? `
        <p class="v3-kicker" style="margin-top:18px">${esc(win.player.name)} directs the ${pot}-pt charity pot</p>
        <div class="v3-chiprow" style="margin-top:8px" id="charRow">
          ${S.CHARITIES.map((c) => `
            <button class="v3-pick ${designated === c.id ? "is-on" : ""}" data-charity="${c.id}" data-sfx="pot">
              <span class="v3-pick__t">${esc(c.name)}</span>
            </button>`).join("")}
        </div>`
      : `<p class="v3-sub" style="margin-top:18px">The ${pot}-pt pot rides to the next battle · giving is <b>OFF</b> — flip it in <b>⚙︎ house rules</b>.</p>`}
      <div style="display:flex;gap:8px;margin-top:18px">
        <button class="pop-btn pop-btn--big" style="flex:1" id="rematchBtn" data-sfx="deal">Rematch</button>
        <button class="pop-btn pop-btn--ghost pop-btn--big" data-go="squad" data-sfx="tap">Squad</button>
      </div>
    </div>
  </div>`;

  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));
  /* the settle chime: fanfare if YOU take the pot, gentle descend if not
     (never a buzz — cheeky never mean) */
  sfx(win.player.id === you?.id ? "win" : "lose");

  /* the 3D podium — avatars on blocks by the charity pot */
  course = new Course3D($("#gl"), {
    tierHex,
    rarHex: (r) => RAR_COL[r] ?? "#c6f32e",
    reducedMotion: reduced,
    onModelsReady: () => { $("#veil")?.remove(); },
  });
  course.setRunners(
    match.players.map((p) => ({ id: p.id, name: p.name, tier: p.tier, isYou: p.id === you?.id })),
    { targetReps: match.config.targetReps }
  );
  course.buildTrack(
    match.players.map((p) => ({ tier: p.tier, isYou: p.id === you?.id })),
    tierHex
  );
  course.setPot(pot, E.chipMix(pot));
  course.showPodium(rows);
  course.start();
  course.loadAvatars();

  $$("#charRow .v3-pick").forEach((b) => (b.onclick = () => {
    sfx("pot");
    S.designatePot(match.config.id, b.dataset.charity);
    $$("#charRow .v3-pick").forEach((x) => x.classList.toggle("is-on", x === b));
    toast(`Charity pot → ${S.CHARITIES.find((c) => c.id === b.dataset.charity).name}`, "ok");
  }));
  $("#rematchBtn").onclick = () => {
    sfx("deal");
    const m = S.rematch(match.config.id);
    go(`battle?m=${m.config.id}`);
  };
}

/* ═══════════════════════ SQUAD — season standings ═════════════════════ */
function renderSquad(state) {
  const you = S.me(state);
  const ladder = S.ladder(state);
  const stats = S.stats(state);
  $app.innerHTML = `
  <div class="v3-screen">
    ${topBar({ back: "home", kicker: "Season 1", name: "Squad standings" })}
    <div class="v3-pad">
      <div class="v3-chiprow">
        <span class="v3-dm">◈ ${stats.lifetimeReps} lifetime reps</span>
        <span class="v3-dm">🏆 ${stats.wins} wins</span>
        <span class="v3-dm">⚡ ${stats.comebacks} comebacks</span>
        <span class="v3-dm">🔥 ${stats.streak}-battle-day streak</span>
      </div>
      <table class="v3-lad">
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
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));
}

/* ═══════════════════════ card markup (v2 classes, reused) ═════════════ */
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
        ${cost ? `<span class="bd-card__cost">◈ ${E.CARD_COSTS[def.kind] ?? 0} RUF</span>` : ""}
      </div>
      <div class="bd-card__face bd-card__face--back"></div>
    </div>
  </div>`;
}

/* ═══════════════════════ toasts ═══════════════════════════════════════ */
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
  if (b) sfx(b.dataset.sfx);
}, true);

/* ═══════════════════════ e2e + probe hooks ════════════════════════════ */
window.__rwfV3 = {
  ready: true,
  view: () => route(),
  matchId: () => {
    const m = S.currentMatch(S.load());
    return m?.config.id ?? null;
  },
  state: () => S.load(),
  /* world-space probe — the geometry checks read this */
  runnerPos: (pid) => course?.runnerWorldPos(pid) ?? null,
  courseLen: () => COURSE_LEN,
  startZ: () => START_Z,
  laneXs: () => course?.laneXs() ?? null,
  potPos: () => course?.potPos() ?? null,
  trackStats: () => course?.trackStats() ?? null,
  progressOf: (pid) => {
    const m = S.currentMatch(S.load());
    const row = E.standings(m).find((r) => r.player.id === pid);
    return row ? row.rawReps / m.config.targetReps : null;
  },
  camMode: () => course?.mode ?? null,
  camState: () => course?.camState() ?? null,
  /* UX2 probes — prefs / house rules / species heads */
  prefs: () => S.prefs(S.load()),
  setPref: (k, v) => { S.setPrefs({ [k]: v }); return S.prefs(S.load()); },
  headMode: () => course?.headMode ?? null,
  avatarKind: (pid) => S.load() && (window.__rwfV3.runnerPos(pid)?.avatarKind ?? null),
  runnerScreen: (pid) => course?.runnerScreen(pid) ?? null,
  worldScreen: (x, y, z) => course?.worldScreen(x, y, z) ?? null,
  cycleCam: () => (course ? paintCamChrome(course.cycleCamera()) : null),
  modelsReady: () => course?.modelsReady ?? false,
  frameMs: () => course?.frameMs() ?? -1,
  fxPlayed: () => course?.fxPlayed ?? 0,
  /* CARDS3D probes — real card meshes over the runners */
  cards3d: () => course?.cards3dStats() ?? null,
  cardScreen: (pid, idx) => course?.cardScreen(pid, idx) ?? null,
  /* e2e driver: play a held card through the REAL state layer (what the
     sheet's Play button calls) — returns the engine verdict + reason */
  drivePlay: (kind) => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    const r = S.boardPlayInMatch(m.config.id, { kind });
    if (r.result.ok) {
      feedPush(m.config.id, `<b>CARD</b> — you play ${esc(E.POWER_UPS[kind].name)}`);
      course?.playCardFx(state.player.id, {
        kind, name: E.POWER_UPS[kind].name, glyph: CARD_GLYPHS[kind], rarity: E.POWER_UPS[kind].rarity,
      });
      afterAction(m.config.id);
    }
    return { ok: r.result.ok, reason: r.result.reason ?? null, spent: r.spent };
  },
  /* e2e driver: deal n random power-ups to any runner (hand-cap scenes) */
  dealTo: (pid, n = 1) => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    const granted = [];
    for (let i = 0; i < n; i++) {
      const g = S.grantRandomTo(m.config.id, pid);
      if (g) granted.push(g.kind);
    }
    afterAction(m.config.id);
    return { ok: granted.length > 0, granted };
  },
  potTotal: () => {
    const m = S.currentMatch(S.load());
    return m?.board?.pot ?? -1;
  },
  chipCount: () => course?.potChips?.children.length ?? 0,
  handKinds: () => [...document.querySelectorAll("#hand .bd-card")].map((c) => c.dataset.kind),
  cardTransform: (i = 0) => getComputedStyle(document.querySelectorAll("#hand .bd-card")[i] ?? document.body).transform,
  /* e2e driver: log reps through the REAL state layer (what the log sheet calls) */
  driveLog: (reps = 25, exerciseId = null) => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    const ex = exerciseId ?? m.config.exercises[0].id;
    const r = S.logToMatch(m.config.id, { exerciseId: ex, reps, playerId: state.player.id });
    feedPush(m.config.id,
      `<b>${esc(state.player.name)}</b> logs ${reps} ${esc(exName(m, ex))}` +
      (r.comeback ? ` · <b>⚡ comeback ×1.2</b>` : "") +
      (r.lightning ? ` · <b>⚡×3 lightning</b>` : ""));
    course?.repsBurst(state.player.id, reps, tierHex(state.player.tier, true));
    course?.potBump();
    afterAction(m.config.id);
    return { ok: true, closed: r.closed, comeback: r.comeback, lightning: r.lightning };
  },
  driveSim: () => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m) return { logged: [] };
    const r = S.simMates(m.config.id);
    const m2 = S.matchById(m.config.id);
    r.logged.forEach((l) => {
      feedPush(m.config.id, `<b>${esc(nameOf(m2, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`);
      const p = m2?.players.find((x) => x.id === l.playerId);
      course?.repsBurst(l.playerId, l.reps, tierHex(p?.tier, false));
    });
    if (r.logged.length) course?.potBump();
    afterAction(m.config.id);
    return r;
  },
  /* e2e driver: wind the battle clock (danger-zone ramp shots), then tick */
  driveDeadline: (msFromNow = 0) => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    S.mutate((s) => {
      const i = s.matches.findIndex((x) => x.config.id === m.config.id);
      if (i >= 0) s.matches[i] = { ...s.matches[i], deadlineAt: Date.now() + msFromNow };
    });
    tickClock(m.config.id);
    return { ok: true };
  },
  /* e2e driver: force the OTHER deadline — the clock closes the live battle */
  driveClockClose: () => {
    const state = S.load();
    const m = S.currentMatch(state);
    if (!m || m.status !== "live") return { ok: false, reason: "not live" };
    S.mutate((s) => {
      const i = s.matches.findIndex((x) => x.config.id === m.config.id);
      if (i >= 0) s.matches[i] = { ...s.matches[i], deadlineAt: Date.now() - 1000 };
    });
    tickClock(m.config.id);
    const after = S.matchById(m.config.id);
    return { ok: after?.status === "complete", closedByClock: after?.closedBy == null };
  },
};

/* boot */
buildQuickbar();
/* Back gesture never dead-ends: a deep link (#/battle, #/result…) gets a
   #/home entry planted beneath it, so the FIRST hardware/browser back from
   a deep-linked screen lands on the dashboard instead of leaving the app.
   In-app navigation (hash links) stacks history naturally — back walks the
   user home screen by screen. */
if (route() !== "home") {
  try {
    history.replaceState({ rwf: "home" }, "", `${location.pathname}${location.search}#/home`);
    history.pushState({ rwf: route() }, "", `${location.pathname}${location.search}${location.hash}`);
  } catch { /* file:// or such — plain hash nav still works */ }
}
render();
