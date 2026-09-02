/* ═══════════════════════════════════════════════════════════════════════
   RWF · V3 THE BATTLE COURSE — app.js
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Views (hash router): #/home · #/setup · #/create · #/battle · #/result
                         · #/squad
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
   button in the top bar, persisted at localStorage rwf.sfx.muted — the key
   shared with v1, v2 and /sfx (mute anywhere, muted everywhere).
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
/* glyph for the 3D billboard faces (canvas-safe) */
const CARD_GLYPHS = { lightning: "⚡", steal: "💅", shield: "🛡", freeze: "❄" };
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
  dzLevel = 0;           // fresh screen — the DZ heartbeat only fires on a RISE
  sfx("swipe");          // nav whoosh on every screen change (no-op pre-gesture)
  const state = S.load();
  const match = view === "battle" || view === "result"
    ? S.matchById(new URLSearchParams(location.hash.split("?")[1] ?? "").get("m") ?? "") ?? S.currentMatch(state)
    : null;

  if (view === "home") return renderHome(state);
  if (view === "setup") return renderSetup();
  if (view === "create") return state.player ? renderCreate() : go("setup");
  if (view === "battle") {
    if (!state.player) return go("setup");
    const m = match ?? S.currentMatch(state);
    if (!m) return go("create");
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
  return `
  <header class="v3-top">
    <button class="v3-top__back" data-go="${back}" aria-label="back">‹</button>
    <div class="v3-top__title">
      <p class="v3-top__kicker">${esc(kicker)}</p>
      <h2 class="v3-top__name">${esc(name)}</h2>
    </div>
    ${right}
    ${muteBtnHtml()}
  </header>`;
}

/* ═══════════════════════ HOME — your battles ══════════════════════════ */
function renderHome(state) {
  const me = S.me(state);
  const matches = [...state.matches].reverse().slice(0, 8);
  $app.innerHTML = `
  <div class="v3-screen">
    ${topBar({ back: "squad", kicker: "Reps With Friends", name: me ? `Battle day · ${me.name}` : "The Battle Course" })}
    <div class="v3-pad">
      <p class="v3-kicker">V3 · the founder's course</p>
      <h1 class="v3-h1">Run the course.<br><em>Hold your cards.</em></h1>
      <p class="v3-sub">A 3D battle — your avatar runs the course as reps land, your
        power-up cards float overhead, and the charity pot waits at the finish.
        Close on the reps target or the clock, whichever comes first.</p>
      <button class="pop-btn pop-btn--big pop-btn--full" id="newBattle" data-sfx="primary">Start a fast battle</button>
      ${me ? "" : `<button class="pop-btn pop-btn--ghost pop-btn--full" id="setupBtn" style="margin-top:8px" data-sfx="tap">Set up your runner</button>`}

      <p class="v3-kicker" style="margin-top:22px">Your battles</p>
      <div class="v3-battles" id="battles">
        ${matches.length ? matches.map(battleCard).join("") : `
          <p class="v3-sub" style="margin:6px 0 0">No battles yet — start one and call the crew in.</p>`}
      </div>
    </div>
  </div>`;

  $("#newBattle").onclick = () => { sfx("primary"); go("create"); }; // the hero CTA gets the primary thunk
  $("#setupBtn")?.addEventListener("click", () => { sfx("tap"); go("setup"); });
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));
  $app.querySelectorAll("[data-open]").forEach((b) =>
    (b.onclick = () => {
      sfx("tap");
      const m = state.matches.find((x) => x.config.id === b.dataset.open);
      if (!m) return;
      if (m.status === "complete") return go(`result?m=${m.config.id}`);
      go(`battle?m=${m.config.id}`);
    }));
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

/* ═══════════════════════ SETUP — quick identity ═══════════════════════ */
function renderSetup() {
  $app.innerHTML = `
  <div class="v3-screen">
    ${topBar({ back: "home", kicker: "New runner", name: "Who's running?" })}
    <div class="v3-pad">
      <div class="v3-field">
        <p class="v3-kicker">Your name</p>
        <input class="v3-input" id="nameIn" maxlength="40" placeholder="e.g. Alexei" style="margin-top:8px">
      </div>
      <div class="v3-field">
        <p class="v3-kicker">Your tier — handicaps your score</p>
        <div class="v3-chiprow" id="tiers" style="margin-top:8px">
          ${Object.entries(E.TIER_MULTIPLIERS).map(([k, v]) => `
            <button class="v3-pick" data-tier="${k}" data-sfx="tap">
              <span class="v3-pick__t">${k[0].toUpperCase() + k.slice(1)}</span>
              <span class="v3-pick__s">reps ×${v}</span>
            </button>`).join("")}
        </div>
      </div>
      <button class="pop-btn pop-btn--big pop-btn--full" id="setupGo" style="margin-top:18px" data-sfx="tap" disabled>Take your lane</button>
    </div>
  </div>`;
  let tier = null;
  const sync = () => { $("#setupGo").disabled = !($("#nameIn").value.trim() && tier); };
  $("#nameIn").oninput = sync;
  $$("#tiers .v3-pick").forEach((b) =>
    (b.onclick = () => {
      sfx("tap");
      tier = b.dataset.tier;
      $$("#tiers .v3-pick").forEach((x) => x.classList.toggle("is-on", x === b));
      sync();
    }));
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));
  $("#setupGo").onclick = () => {
    sfx("win");
    S.setPlayer({ name: $("#nameIn").value.trim() || "You", tier });
    toast(`Lane taken — ${$("#nameIn").value.trim() || "You"} (${tier})`, "ok");
    go("home");
  };
}

/* ═══════════════════════ CREATE — fast battle setup ═══════════════════ */
function renderCreate() {
  const days = new Set([1, 3, 5]);
  let pack = "bodyweight", target = "solid";
  $app.innerHTML = `
  <div class="v3-screen">
    ${topBar({ back: "home", kicker: "Fast battle", name: "Set the battle" })}
    <div class="v3-pad">
      <div class="v3-field">
        <p class="v3-kicker">Battle name</p>
        <input class="v3-input" id="bName" maxlength="40" value="The 300 Club" style="margin-top:8px">
      </div>
      <div class="v3-field">
        <p class="v3-kicker">Battle days — when the clock runs</p>
        <div class="v3-chiprow" id="dayRow" style="margin-top:8px">
          ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d, i) => `
            <button class="v3-pick" data-day="${i}" data-sfx="tap"><span class="v3-pick__t">${d}</span></button>`).join("")}
        </div>
      </div>
      <div class="v3-field">
        <p class="v3-kicker">Exercise pack</p>
        <div class="v3-chiprow" id="packRow" style="margin-top:8px">
          <button class="v3-pick" data-pack="bodyweight" data-sfx="tap"><span class="v3-pick__t">Bodyweight</span><span class="v3-pick__s">pushup·squat·situp·lunge·plank</span></button>
          <button class="v3-pick" data-pack="fullbody" data-sfx="tap"><span class="v3-pick__t">Full body</span><span class="v3-pick__s">+ burpees</span></button>
        </div>
      </div>
      <div class="v3-field">
        <p class="v3-kicker">Battle distance (raw reps to close)</p>
        <div class="v3-chiprow" id="tgtRow" style="margin-top:8px">
          ${S.TARGETS.map((t) => `
            <button class="v3-pick" data-target="${t.id}" data-sfx="tap">
              <span class="v3-pick__t">${t.label}</span><span class="v3-pick__s">${esc(t.sub)}</span>
            </button>`).join("")}
        </div>
      </div>
      <p class="v3-sub" style="margin-top:16px">Every runner posts a <b>${E.ENTRY}-point entry</b> into the charity pot and
        starts with <b>${E.START_RP} RUF</b> for cards. Sam, Alex &amp; Jordan take the other lanes.</p>
      <button class="pop-btn pop-btn--big pop-btn--full" id="startBattle" data-sfx="deal">Set the course</button>
    </div>
  </div>`;

  const syncDays = () => $$("#dayRow .v3-pick").forEach((b) =>
    b.classList.toggle("is-on", days.has(+b.dataset.day)));
  syncDays();
  $$("#dayRow .v3-pick").forEach((b) =>
    (b.onclick = () => {
      sfx("tap");
      const d = +b.dataset.day;
      days.has(d) ? days.delete(d) : days.add(d);
      if (!days.size) days.add(d); // at least one battle day
      syncDays();
    }));
  const sync = (row, attr, val) => $$(`#${row} .v3-pick`).forEach((b) =>
    b.classList.toggle("is-on", b.dataset[attr] === val));
  sync("packRow", "pack", pack); sync("tgtRow", "target", target);
  $$("#packRow .v3-pick").forEach((b) => (b.onclick = () => { sfx("tap"); pack = b.dataset.pack; sync("packRow", "pack", pack); }));
  $$("#tgtRow .v3-pick").forEach((b) => (b.onclick = () => { sfx("tap"); target = b.dataset.target; sync("tgtRow", "target", target); }));
  $app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { sfx("tap"); go(b.dataset.go); }));

  $("#startBattle").onclick = () => {
    sfx("deal");
    const m = S.createFastBattle({
      name: $("#bName").value.trim() || "The Battle",
      days: [...days],
      pack, target,
    });
    go(`battle?m=${m.config.id}`);
  };
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
      <button class="v3-cam" id="camBtn" data-mode="follow" data-sfx="tap">
        <span class="v3-cam__dot"></span><span id="camLbl">CAM · FOLLOW</span>
      </button>
      <div class="v3-cam__hint" id="camHint">TAP FOR FREE ORBIT</div>
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

  const camBtn = $("#camBtn");
  camBtn.onclick = () => {
    sfx("tap");
    const next = course.mode === "follow" ? "orbit" : "follow";
    course.setCameraMode(next);
    camBtn.dataset.mode = next;
    camBtn.querySelector("#camLbl").textContent = next === "follow" ? "CAM · FOLLOW" : "CAM · ORBIT";
    $("#camHint").textContent = next === "follow" ? "TAP FOR FREE ORBIT" : "DRAG TO ORBIT · PINCH TO ZOOM";
  };

  /* ── actions ────────────────────────────────────────────────────────── */
  $("#logBtn").onclick = () => { sfx("tap"); openLogSheet(match.config.id); };
  $("#simBtn").onclick = () => {
    sfx("tap");
    const r = S.simMates(match.config.id);
    const m2 = S.matchById(match.config.id);
    r.logged.forEach((l) =>
      feedPush(match.config.id, `<b>${esc(nameOf(m2, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`));
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
    }
    afterAction(match.config.id, { newCard: g?.kind });
  };

  updateBattle(match, { full: true });
  ticker = setInterval(() => tickClock(match.config.id), 1000);
  tickClock(match.config.id);

  /* draft pending → draft-from-3 sheet OVER the course (runners wait at the start) */
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
        <span class="v3-srow__name">${esc(r.player.name)}</span>
        ${tags}
        <span class="v3-srow__pct">${Math.round(r.progressPct)}%</span>
        <span class="v3-srow__ruf">◈${E.boardPoints(match, r.player.id)}</span>
      </div>`;
  }).join(""));

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
  slot.remove();
  fly.addEventListener("animationend", () => fly.remove(), { once: true });

  /* 3D mirror: the billboard card over your runner flies up + bursts */
  course?.playCardFx(state.player.id, {
    name: E.POWER_UPS[kind].name, glyph: CARD_GLYPHS[kind], rarity: E.POWER_UPS[kind].rarity,
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
      <p class="v3-kicker" style="margin-top:18px">${esc(win.player.name)} directs the ${pot}-pt charity pot</p>
      <div class="v3-chiprow" style="margin-top:8px" id="charRow">
        ${S.CHARITIES.map((c) => `
          <button class="v3-pick ${designated === c.id ? "is-on" : ""}" data-charity="${c.id}" data-sfx="pot">
            <span class="v3-pick__t">${esc(c.name)}</span>
          </button>`).join("")}
      </div>
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
  modelsReady: () => course?.modelsReady ?? false,
  frameMs: () => course?.frameMs() ?? -1,
  fxPlayed: () => course?.fxPlayed ?? 0,
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
    r.logged.forEach((l) => feedPush(m.config.id, `<b>${esc(nameOf(m2, l.playerId))}</b> logs ${l.reps} ${esc(l.exercise)}`));
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
render();
