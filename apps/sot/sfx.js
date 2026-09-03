/* ═══════════════════════════════════════════════════════════════════════
   RWF SFX — V3 BATTLE COURSE COPY of apps/sfx-demo/sfx.js (which is itself
   a defensive copy of apps/figma-app/sfx.js). One file, no deps.

   Same synthesis engine the live apps play: lazy AudioContext, master gain
   0.3, mute persisted at localStorage `rwf.sfx.muted` (SHARED with v1/v2
   and /sfx — mute anywhere mutes everywhere), combo-climbing log pitch,
   identical CATALOGUE. Export: window.rwfSfx = { play, setMuted, isMuted,
   toggle, names } — the global apps/v3/app.js already calls defensively
   (`window.rwfSfx?.play?.(name)`), so loading this file lights up every
   cue: taps · log combos · card deal/flip/play · DZ heartbeat · ticks ·
   win/lose · pot. The mute button in v3's top bar (app.js topBar) drives
   `toggle()`; this module paints nothing itself.

   DIVERGED FROM THE DEMO COPY (marked): exactly one addition — a re-trigger
   guard in play(). v3 wires some buttons twice (a `data-sfx` attribute for
   the delegated listener AND an explicit `sfx()` call in the onclick), so a
   single click could fire the same name twice in the same tick. The guard
   drops an identical name played within 45ms of the previous one; real
   repeated taps (>45ms apart, like the quick-log combo) are unaffected.

   Re-sync rule: if a sound changes in apps/figma-app/sfx.js, change the
   CATALOGUE + synth primitives here (and in apps/sfx-demo/sfx.js), aimed to mirror
   — byte-identical where marked.
   ═══════════════════════════════════════════════════════════════════════ */

const MUTE_KEY = "rwf.sfx.muted";
const MASTER = 0.3;

/* ── catalogue (names are the API — apps/board + apps/v3 use the same strings) */
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

/* v3-only: identical name re-fired within RETRIGGER_MS is a duplicate wire */
const RETRIGGER_MS = 45;
let lastName = "", lastPlayAt = 0;

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
  if (unlocked) { const c = ensureCtx(); if (c && c.state === "suspended") { try { c.resume().catch(() => {}); } catch {} } return; }
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

/* ── synth primitives (byte-identical to apps/sfx-demo/sfx.js) ───────── */

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

/* ── the catalogue (byte-identical to apps/sfx-demo/sfx.js) ───────────── */
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
    noise({ type: "highpass", from: 2350, dur: 0.045, vol: 0.4 });
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
    /* v3 divergence: drop an identical name re-fired within RETRIGGER_MS
       (data-sfx delegation + explicit onclick can both fire on one click) */
    const now = Date.now();
    if (name === lastName && now - lastPlayAt < RETRIGGER_MS) return false;
    lastName = name; lastPlayAt = now;
    if (!ensureCtx()) return false; // no gesture yet — silent no-op
    if (ctx.state === "suspended") { try { ctx.resume().catch(() => {}); } catch {} }
    if (name === "log") {
      const t = Date.now();
      combo = t - lastLogAt < COMBO_WINDOW ? combo + 1 : 0;
      lastLogAt = t;
      fn(combo);
    } else {
      fn(opts);
    }
    return true;
  } catch { return false; }
}

/* ── mute state + persistence ─────────────────────────────────────────── */
/* (v3 copy: the top-bar mute button lives in app.js's topBar and calls
   toggle(); nothing here paints the DOM) */
function setMuted(v) {
  muted = !!v;
  persistMuted();
  return muted;
}
const isMuted = () => muted;
function toggleMute() { return setMuted(!muted); }

/* ── the global other surfaces call: window.rwfSfx?.play(name) ───────── */
if (typeof window !== "undefined") {
  try {
    window.rwfSfx = { play, setMuted, isMuted, toggle: toggleMute, names: [...NAMES] };
  } catch {}
}

/* export for module consumers (tests) — the window global is the API */
export { play, setMuted, isMuted, toggleMute, NAMES as names };
