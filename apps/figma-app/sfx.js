/* ═══════════════════════════════════════════════════════════════════════
   RWF SFX — local audio generator (WebAudio synthesis, zero files).
   Every button in the app gets a sound: a delegated document listener maps
   clicks → catalogue entries by id/class/context, plus specific hooks
   (log combos, power-up deal/flip/play, battle deadline ticks + DZ states).

   - Lazy AudioContext: created on the FIRST user gesture (autoplay policy),
     resumed if suspended. play() before any gesture is a safe no-op.
   - Master gain ≈ 0.3 (quiet by default — it's a phone app).
   - Mute persisted at localStorage `rwf.sfx.muted` ("1"/"0"), surfaced as
     the header SFX tool + a Settings row (both painted by MutationObserver
     so screens that re-render stay honest without app.js knowing about us).
   - Export: window.rwfSfx = { play, setMuted, isMuted, toggle, names }.
     Other surfaces (apps/board) call window.rwfSfx?.play(name) — always
     defensive, never throws, never blocks.

   MANUAL LISTEN (founder): sounds are synthesized per-interaction — open the
   app and tap around: log a rep (pitch climbs with your combo), deal/flip a
   power-up, let a battle run into the danger zone (tick + heartbeat),
   win/lose a day. There are no audio files anywhere in the repo.
   ═══════════════════════════════════════════════════════════════════════ */

const MUTE_KEY = "rwf.sfx.muted";
const MASTER = 0.3;

/* ── catalogue (names are the API — apps/board uses the same strings) ─── */
const NAMES = [
  "tap", "primary", "log", "deal", "flip", "play",
  "win", "lose", "pot", "tick", "dz", "error", "swipe",
];

/* ── module state ────────────────────────────────────────────────────── */
let ctx = null;          // AudioContext (lazy, first gesture)
let master = null;       // master GainNode
let muted = loadMuted(); // persisted
let unlocked = false;    // a gesture has happened
let noiseBuf = null;     // cached 1s white-noise buffer

/* log-combo: consecutive log sounds within COMBO_WINDOWms raise the pitch */
const COMBO_WINDOW = 4000;
let combo = 0, lastLogAt = 0;

function loadMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
function persistMuted() {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch {}
}

/* ── lazy context (autoplay policy: only after a real gesture) ────────── */
function ensureCtx() {
  if (ctx) return ctx;
  if (!unlocked || typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}
function armGesture() {
  unlocked = true;
  const c = ensureCtx();
  if (c && c.state === "suspended") { try { c.resume().catch(() => {}); } catch {} }
}
if (typeof document !== "undefined") {
  /* a click IS a gesture (covers keyboard/synthetic activation too) */
  for (const ev of ["pointerdown", "keydown", "click"]) {
    document.addEventListener(ev, armGesture, { capture: true });
  }
}

/* ── synth primitives ────────────────────────────────────────────────── */

/** One oscillator voice with an exponential-ish envelope. All params safe. */
function tone({ type = "sine", from = 440, to = null, at = 0, dur = 0.1, vol = 0.3, attack = 0.004 } = {}) {
  const c = ctx; if (!c || !master) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  try {
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), t0);
    if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch { try { osc.disconnect(); g.disconnect(); } catch {} }
}

/** Filtered white-noise burst (deal whisper / flip snap / swipe whoosh). */
function noise({ at = 0, dur = 0.15, vol = 0.3, type = "bandpass", from = 1000, to = null, q = 1 } = {}) {
  const c = ctx; if (!c || !master) return;
  try {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(1, from), t0);
    if (to != null) f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  } catch {}
}

/* ── the catalogue ────────────────────────────────────────────────────── */
const CATALOGUE = {
  /* soft click — generic taps, chips, menu rows */
  tap: () => tone({ type: "sine", from: 1900, to: 1350, dur: 0.035, vol: 0.11 }),
  /* thunk + pitch pop — primary CTAs */
  primary: () => {
    tone({ type: "triangle", from: 150, to: 88, dur: 0.09, vol: 0.5 });
    tone({ type: "sine", from: 320, to: 560, at: 0.045, dur: 0.08, vol: 0.22 });
  },
  /* rep tick — pitch rises with consecutive logs (the combo) */
  log: (comboN = 0) => {
    const step = Math.min(comboN, 10);
    const base = 620 * Math.pow(1.059, step); // +1 semitone per combo
    tone({ type: "square", from: base, to: base * 1.12, dur: 0.05, vol: 0.22 });
    tone({ type: "sine", from: base * 2, dur: 0.03, at: 0.01, vol: 0.1 });
  },
  /* filtered noise whisper — a card being dealt */
  deal: () => noise({ type: "bandpass", from: 1100, to: 650, dur: 0.18, vol: 0.35, q: 3 }),
  /* snap — card flip / reveal */
  flip: () => {
    noise({ type: "highpass", from: 2300, dur: 0.045, vol: 0.4 });
    tone({ type: "sine", from: 260, to: 180, at: 0.008, dur: 0.05, vol: 0.28 });
  },
  /* rising arpeggio — power-up ACTIVATE */
  play: () => [440, 554, 659].forEach((f, i) => tone({ type: "triangle", from: f, at: i * 0.07, dur: 0.1, vol: 0.26 })),
  /* 3-note fanfare — wins */
  win: () => {
    [523, 659].forEach((f, i) => tone({ type: "triangle", from: f, at: i * 0.12, dur: 0.14, vol: 0.3 }));
    tone({ type: "triangle", from: 784, at: 0.24, dur: 0.34, vol: 0.36 });
    tone({ type: "sine", from: 1568, at: 0.24, dur: 0.3, vol: 0.12 });
  },
  /* gentle descend — losses (never a buzz, never mean) */
  lose: () => [440, 349, 262].forEach((f, i) => tone({ type: "sine", from: f, to: f * 0.96, at: i * 0.14, dur: 0.17, vol: 0.22 })),
  /* chip clink ×2 — pot money moves */
  pot: () => {
    tone({ type: "sine", from: 2093, to: 2093, dur: 0.05, vol: 0.26 });
    tone({ type: "sine", from: 2637, to: 2637, at: 0.09, dur: 0.06, vol: 0.2 });
  },
  /* deadline second — final-minute countdown */
  tick: () => tone({ type: "square", from: 1568, dur: 0.025, vol: 0.13 }),
  /* low heartbeat thump (lub-dub) — danger-zone state change */
  dz: () => {
    tone({ type: "sine", from: 68, to: 40, dur: 0.12, vol: 0.8 });
    tone({ type: "sine", from: 62, to: 36, at: 0.18, dur: 0.14, vol: 0.7 });
  },
  /* dull buzz — refusals and errors */
  error: () => tone({ type: "sawtooth", from: 130, to: 72, dur: 0.13, vol: 0.24 }),
  /* nav whoosh — screen changes */
  swipe: () => noise({ type: "lowpass", from: 500, to: 3200, dur: 0.16, vol: 0.2 }),
};

/** Play a catalogue entry. Safe on unknown names, when muted, or before
 *  any gesture. Returns true if a sound actually fired. */
function play(name, opts = {}) {
  try {
    if (muted) return false;
    const fn = CATALOGUE[name];
    if (!fn) return false;
    if (!ensureCtx()) return false; // no gesture yet — silent no-op
    if (ctx.state === "suspended") { try { ctx.resume().catch(() => {}); } catch {} }
    if (name === "log") {
      const now = Date.now();
      combo = now - lastLogAt < COMBO_WINDOW ? combo + 1 : 0;
      lastLogAt = now;
      fn(combo);
    } else {
      fn(opts);
    }
    return true;
  } catch { return false; }
}

/* ── mute state + persistence ─────────────────────────────────────────── */
function setMuted(v) {
  muted = !!v;
  persistMuted();
  paintControls();
  return muted;
}
const isMuted = () => muted;
function toggleMute() { return setMuted(!muted); }

/* ── paint the header SFX tool + the Settings toggle (idempotent — runs
      after every render via MutationObserver, so no app.js hooks needed) */
function paintControls() {
  try {
    document.querySelectorAll("[data-sfx-paint]").forEach((el) => {
      if (el.id === "sfxToggle") {
        el.classList.toggle("fx-tool--off", muted);
        el.setAttribute("aria-pressed", String(!muted));
        el.title = muted ? "Sound effects OFF — tap to unmute" : "Sound effects ON — tap to mute";
      } else {
        el.classList.toggle("fx-toggle--off", muted);
        el.setAttribute("aria-pressed", String(!muted));
      }
    });
  } catch {}
}
if (typeof document !== "undefined") {
  const mo = new MutationObserver(() => paintControls());
  const start = () => { try { mo.observe(document.body, { childList: true, subtree: true }); paintControls(); } catch {} };
  document.body ? start() : addEventListener("DOMContentLoaded", start, { once: true });
}

/* ── delegated click → sound (EVERY button; most-specific rule wins) ──── */
const TAP_SEL = [
  ".fx-btn", ".fg-chip", ".fx-chip", ".fx-nav__tab", ".fx-index__item",
  ".fx-tool", ".fx-seg__item", ".fx-menurow", ".fx-option", ".fx-daychip",
  ".fx-toggle", ".fg-sheet__cta",
].join(", ");

function soundFor(target) {
  const q = (sel) => !!target.closest(sel);
  /* mute controls are handled separately (confirmation sound on unmute) */
  if (q("#sfxToggle, [data-sfx-paint]")) return null;
  /* specific hooks first */
  if (q("#qlCta")) return ["log"];                      // rep log (combo pitch)
  if (q("[data-pwr]")) return ["play"];                 // power-up ACTIVATE
  if (q("#chest, [data-chest]")) return ["deal"];       // loot dealt
  if (q("#draftBtn, .fx-draftbadge")) return ["deal"];  // draft opens — 3 cards dealt
  if (q("#rerollBtn, [data-reroll]")) return ["deal"];  // reroll — 3 fresh cards
  if (q("[data-pick]")) return ["flip"];                // draft pick — card flips
  if (q(".fg-pwr")) return ["flip"];                    // card tap/flip
  if (q("[data-pot-add], [data-pot-pick]")) return ["pot"];
  /* primaries — a thunk+pop beats the generic tap */
  if (q(".fx-btn--primary, .fg-state__cta, .fg-sheet__cta, #cbCreate, #startEarly, #sqdCreate, #wagerPropose, #rematchBtn")) return ["primary"];
  /* the rest of the tappables */
  if (q(TAP_SEL)) return ["tap"];
  /* navigation without a tap-styled button (bare data-go anchors etc.) */
  if (q("[data-go], [data-back]")) return ["swipe"];
  /* any other button still clicks */
  if (q("button, [role=button]")) return ["tap"];
  return null;
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    try {
      const t = e.target;
      if (!t || !t.closest) return;
      /* mute toggles: flip state, then confirm with a tap when unmuting */
      const muteBtn = t.closest("#sfxToggle, #sfxRowToggle, [data-sfx-paint]");
      if (muteBtn && muteBtn.tagName === "BUTTON") {
        const was = muted;
        toggleMute();
        if (was && !muted) play("tap");
        return;
      }
      const pair = soundFor(t);
      if (pair) play(pair[0]);
    } catch {}
  }, true); // capture: fires before per-screen handlers, immune to stopPropagation
}

/* ── battle ticker + danger-zone watcher (reads the DOM daily.js paints;
      no engine/daily.js coupling — 1s interval, text + class parsing) ── */
const dzLevels = new WeakMap(); // countdown el → last level seen (never reassigned)
let lastTickAt = 0, lastDzAt = 0;
function watchBattle() {
  try {
    if (muted) return;
    const els = document.querySelectorAll("[data-dz-countdown]");
    let maxLevel = 0;
    for (const el of els) {
      /* DZ level from the class daily.js applies (fg-count--dz1/2/3) */
      let level = 0;
      for (let i = 1; i <= 3; i++) if (el.classList.contains(`fg-count--dz${i}`)) level = i;
      maxLevel = Math.max(maxLevel, level);
      const prev = dzLevels.get(el) ?? 0;
      if (level > prev && Date.now() - lastDzAt > 900) {
        dzLevels.set(el, level);
        lastDzAt = Date.now();
        play("dz"); // heartbeat as the zone deepens
      } else if (level !== prev) {
        dzLevels.set(el, level);
      }
      /* final minute: a tick per second */
      const tEl = el.querySelector(".fg-count__time");
      if (!tEl) continue;
      const m = /^(\d+):(\d{2}):(\d{2})$/.exec(tEl.textContent.trim());
      if (!m) continue;
      const secs = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      if (secs > 0 && secs <= 60 && Date.now() - lastTickAt >= 950) {
        lastTickAt = Date.now();
        play("tick");
      }
    }
    if (maxLevel === 0) {
      /* battle over — forget stale levels so a fresh countdown re-arms */
      try { for (const el of els) dzLevels.delete(el); } catch {}
    }
  } catch {}
}
if (typeof setInterval === "function") setInterval(watchBattle, 1000);

/* ── the global other surfaces call: window.rwfSfx?.play(name) ───────── */
if (typeof window !== "undefined") {
  try {
    window.rwfSfx = { play, setMuted, isMuted, toggle: toggleMute, names: [...NAMES] };
  } catch {}
}

/* export for module consumers (tests) — the window global is the API */
export { play, setMuted, isMuted, toggleMute, NAMES as names };
