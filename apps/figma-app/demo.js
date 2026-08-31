/* ═══════════════════════════════════════════════════════════════════════
   RWF DEMO MODE (v1.0.0) — a self-playing tour of the REAL app.
   Not a video, not a mock: a DemoDriver that drives the actual state
   layer (state.js → engine.js) through the actual screens, via the
   actual UI clicks, with an elegant bottom-sheet narrator. The script
   mirrors the e2e walk: onboard → create → live battle → comeback →
   lightning → danger zone → close → result → rematch → day recap →
   season → end card.

   SAFETY: the demo never touches the user's real save. state.useKey()
   swaps persistence to the shadow key (rwf.figma.demo) for the whole
   run; on exit the clock override clears, the key restores, the shadow
   is discarded (or kept, if offered and chosen). The user can also keep
   their real progress and just watch.

   Entry: "▶ WATCH THE DEMO" buttons (home screens + index + About),
   or the deep link  /figma-app/?demo=1  (+ &speed=2 for double time).

   Reduced-motion safe: it's app state, not animation — the narrator
   sheet's one slide-in is disabled under prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════ */

import * as S from "./state.js";
import * as E from "./engine.js";
import * as D from "./daily.js";

const TICK = 100; // driver heartbeat (ms of real time per step)
const qs = (sel, root = document) => root.querySelector(sel);

/* ── the script ──────────────────────────────────────────────────────────
   dwell = caption read-time at 1× (ms). The driver scales it by speed.
   run() executes real app actions BEFORE the dwell so the caption
   narrates what is already on screen. */
const SCRIPT = [
  {
    id: "welcome",
    cap: "THIS IS THE REAL APP. ONE BATTLE, START TO FINISH.",
    sub: "Your saves are safe — the demo runs on a shadow copy.",
    dwell: 3000,
    run: () => nav("home-002", ".fx-statewrap, .fx-board"),
  },
  {
    id: "onboard-name",
    cap: "FIRST — A NAME. YOUR MATES SEE IT ON EVERY BOARD.",
    dwell: 3500,
    run: async () => {
      await nav("auth-008", "#obName");
      const inp = qs("#obName");
      if (inp) {
        inp.value = "Demo Dan";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  },
  {
    id: "onboard-tier",
    cap: "THIS IS YOU — PICK YOUR TIER.",
    sub: "Couch reps count ×1.5, athlete ×0.85. Effort competes, not raw fitness.",
    dwell: 4500,
    run: async () => {
      await nav("auth-010", "#tierOpts");
      qs("#tierOpts .fx-option")?.click(); // couch — the engine carries you
      qs("#tierNext")?.click(); // persists the player (draft.name + couch)
    },
  },
  {
    id: "create",
    cap: "CREATE A BATTLE — ANY EXERCISES, ANY MIX, ANY DAYS.",
    sub: "First to the target closes it. Light = 150 reps.",
    dwell: 4500,
    run: async () => {
      await nav("create-002", "#cbCreate");
      qs('[data-target="light"]')?.click();
      qs('[data-day="2"]')?.click(); // add a Tuesday
      qs("#cbCreate")?.click(); // creates + invites (data-go → waiting room)
    },
  },
  {
    id: "invite",
    cap: "SHARE THE CODE — YOUR MATES JOIN FROM WHATSAPP OR SLACK.",
    sub: "No second app to install. The chat IS the arena.",
    dwell: 3500,
    run: async () => {
      await nav("create-014", ".fx-sharecard");
      await waitSel("#startEarly", 1200);
      qs("#startEarly")?.click();
    },
  },
  {
    id: "battle-live",
    cap: "LIVE. THE CLOCK RUNS TO 9PM GROUP TIME — YOURS UNDERNEATH.",
    dwell: 3500,
    run: () => nav("battle-001", "[data-dz-root]"),
  },
  {
    id: "mates-log",
    cap: "YOUR CREW PLAYS FROM THEIR CHATS — STANDINGS MOVE LIVE.",
    sub: "Sam, Alex and Jordan just logged.",
    dwell: 3500,
    run: async () => {
      const m = live();
      if (!m) return;
      S.simMates(m.config.id, 0.77); // deterministic: every mate +38
      await nav("battle-001", "[data-dz-root]");
    },
  },
  {
    id: "behind",
    cap: "THREE SETS EACH AND YOU'RE AT ZERO.",
    sub: "In a real battle, this is where you get off the couch.",
    dwell: 3500,
    run: async () => {
      const m = live();
      if (!m) return;
      S.simMates(m.config.id, 0.31);
      S.simMates(m.config.id, 0.55);
      await nav("battle-001", "[data-dz-root]");
    },
  },
  {
    id: "comeback-armed",
    cap: "⚡ BEHIND BY 30%+? COMEBACK ×1.2 ARMS.",
    sub: "The engine wants a contest — your next set counts extra.",
    dwell: 3500,
    run: () => nav("battle-001", "[data-dz-root]"),
  },
  {
    id: "comeback-log",
    cap: "LOG IT — ×1.5 COUCH ×1.2 COMEBACK. THE MATH IS THE DRAMA.",
    dwell: 3000,
    run: async () => {
      await nav("battle-001", "#logBtn");
      await quickLog(20);
    },
  },
  {
    id: "powerups",
    cap: "POWER-UPS. EVERY BATTLE DEALS A FREE CARD.",
    sub: "Grab the full deck — dev grant stands in for the store.",
    dwell: 4500,
    run: async () => {
      await nav("pwr-001", "#devGrant");
      qs("#devGrant")?.click();
    },
  },
  {
    id: "lightning",
    cap: "LIGHTNING ROUND — TRIPLE REPS FOR 10 MINUTES.",
    sub: "Start the clock, then spend it well.",
    dwell: 4000,
    run: async () => {
      await nav("battle-001", "#pwrBtn");
      qs("#pwrBtn")?.click();
      await waitSel("#pwrSheet [data-pwr='lightning']", 1500);
      qs("[data-pwr='lightning']")?.click(); // activation toast + banner
    },
  },
  {
    id: "lightning-log",
    cap: "INSIDE THE WINDOW — THAT SET COUNTED ×3.",
    dwell: 2500,
    run: async () => {
      await nav("battle-001", "#logBtn");
      await quickLog(20);
    },
  },
  {
    id: "danger-zone",
    cap: "THE DANGER ZONE — 29 MINUTES LEFT.",
    sub: "The last half hour turns the heat up. The deadline pressure is the fun.",
    dwell: 4000,
    run: async () => {
      const m = live();
      if (!m) return;
      D.setNowOverride(m.deadlineAt - 29 * 60_000); // time-travel: DZ3
      await nav("battle-001", "[data-dz-root]");
    },
  },
  {
    id: "close",
    cap: "GO TIME — FIRST TO 150 CLOSES IT. CLOSER BANKS +15.",
    dwell: 4000,
    run: async () => {
      await quickLog(50); // 90
      await sleep(500);
      await quickLog(50); // 140
      await sleep(500);
      await quickLog(50); // 190 → closed, app routes to the result
      await sleep(300);
    },
  },
  {
    id: "result",
    cap: "EFFORT-ADJUSTED — THE COUCH PLAYER TOOK IT.",
    sub: "×1.5 handicap + comeback + lightning. The ledger doesn't lie.",
    dwell: 4000,
    run: () => nav("result-005", ".fx-podium"),
  },
  {
    id: "rematch",
    cap: "REMATCH — SAME CREW, FRESH BOARD, ONE TAP.",
    dwell: 4500,
    run: async () => {
      await nav("result-005", "#rematchBtn");
      qs("#rematchBtn")?.click();
      await sleep(250);
      await nav("battle-001", "[data-dz-root]");
    },
  },
  {
    id: "day-winner",
    cap: "EVERY DAY CROWNS A WINNER.",
    sub: "9PM group time — settled, scored, remembered.",
    dwell: 4000,
    run: async () => {
      const m = live();
      if (!m) return;
      // your set goes in JUST before the deadline — inside the day bucket
      // (logRepsAt is the timestamped seam the temporal loop owns)
      const ex = m.config.exercises[0];
      D.logRepsAt(m.config.id, { exerciseId: ex.id, reps: 20 }, m.deadlineAt - 5 * 60_000);
      const dayKey = D.dayKeyOf(m.deadlineAt);
      D.setNowOverride(m.deadlineAt + 2 * 60_000); // past the deadline
      // the app ticker settles due days every second — give it a beat,
      // then make sure it landed (belt + braces: settle directly)
      await sleep(1600);
      const st = S.load();
      const mm = st.matches.find((x) => x.config.id === m.config.id);
      if (mm && !mm.dailyHistory?.[dayKey]) {
        try { D.settleDay(m.config.id, dayKey, { pot: st.pots?.[m.config.id] ?? null, youId: st.player?.id }); } catch {}
      }
      await nav("daily-001", ".fx-winnercard");
    },
  },
  {
    id: "season",
    cap: "AND EVERY BATTLE FEEDS THE SEASON LADDER.",
    sub: "3/2/1 points + MVP. Four weeks to a champion.",
    dwell: 3500,
    run: () => nav("season-001", ".fx-ladderow"),
  },
];

/* ── helpers over the real app ─────────────────────────────────────────── */

const live = () => {
  const m = S.currentMatch(S.load());
  return m && m.status !== "complete" ? m : null;
};
/** Navigate to a screen and WAIT until its signature element is wired
 *  (hashchange is async; rAF alone is not a render guarantee headless). */
function nav(id, sel, timeout = 2500) {
  const h = `#/${id}`;
  if (location.hash === h) dispatchEvent(new Event("hashchange"));
  else location.hash = h;
  return waitSel(sel, timeout);
}
function waitSel(sel, timeout = 2500) {
  return new Promise((res) => {
    const t0 = Date.now();
    const poll = () => {
      if (!sel || qs(sel)) return res(true);
      if (Date.now() - t0 > timeout) return res(false);
      setTimeout(poll, 50);
    };
    setTimeout(poll, 60);
  });
}
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

/** Real quick-log: the sheet, a rep chip, the CTA — three taps, one thumb. */
async function quickLog(n) {
  qs("#logBtn")?.click();
  await waitSel("#qlCta", 1500);
  qs(`#qlPre [data-n="${n}"]`)?.click();
  qs("#qlCta")?.click();
  await sleep(180); // logToMatch persists + route re-renders
}

/* ── the driver ────────────────────────────────────────────────────────── */

let phase = "off"; // off → running → endcard → off
let paused = false;
let skipFlag = false;
let speed = 1;
let killed = false;
let sceneIndex = -1;
let startedAt = 0;
let elapsedMs = 0;
let narratorEl = null;
let shieldEl = null;
let realSnapshot = null; // raw real-key JSON, for the "keep?" offer

const total1x = () => SCRIPT.reduce((s, x) => s + (x.dwell ?? 0), 0);

/** Pausable, speed-scaled, skippable dwell. Returns 'skip' if skipped. */
function dwell(ms) {
  return new Promise((res) => {
    let done = 0;
    const step = () => {
      if (killed) return res("killed");
      if (skipFlag) { skipFlag = false; return res("skip"); }
      if (!paused) done += TICK * speed;
      if (done >= ms) return res("done");
      setTimeout(step, TICK);
    };
    step();
  });
}

function renderNarrator() {
  const sc = SCRIPT[sceneIndex];
  if (!sc) return;
  const dots = SCRIPT.map((_, i) => `<i class="${i === sceneIndex ? "on" : i < sceneIndex ? "done" : ""}"></i>`).join("");
  narratorEl.innerHTML = `
    <div class="fx-narr__grab"></div>
    <div class="fx-narr__cap">${sc.cap}</div>
    ${sc.sub ? `<div class="fx-narr__sub">${sc.sub}</div>` : ""}
    <div class="fx-narr__dots">${dots}</div>
    <div class="fx-narr__ctl">
      <button class="fx-narr__btn" data-narr="skip" title="Skip scene">⏭</button>
      <button class="fx-narr__btn" data-narr="pause" title="Pause/resume">${paused ? "▶" : "⏸"}</button>
      <button class="fx-narr__btn ${speed === 2 ? "fx-narr__btn--on" : ""}" data-narr="speed" title="Speed">${speed}×</button>
      <span class="fx-narr__tag">DEMO</span>
      <button class="fx-narr__btn fx-narr__btn--exit" data-narr="exit" title="Exit demo">✕</button>
    </div>`;
}

function narratorControls(e) {
  const b = e.target.closest("[data-narr]");
  if (!b) return;
  const act = b.dataset.narr;
  if (act === "skip") { skipFlag = true; paused = false; renderNarrator(); }
  else if (act === "pause") { paused = !paused; renderNarrator(); }
  else if (act === "speed") { speed = speed === 1 ? 2 : 1; renderNarrator(); }
  else if (act === "exit") { exitDemo({ keep: false }); }
}

function teardownUI() {
  narratorEl?.remove(); narratorEl = null;
  shieldEl?.remove(); shieldEl = null;
  document.querySelectorAll(".fx-demo-endcard").forEach((n) => n.remove());
  document.body.classList.remove("fx-demo-on");
}

/** Restore the real app: clock, storage key, UI, route. Callable from the
 *  narrator (mid-tour) or the end card — but never twice. */
function exitDemo({ keep = false } = {}) {
  if (phase === "off") return;
  const wasEndCard = phase === "endcard";
  phase = "off";
  killed = true;
  try { D.clearNowOverride(); } catch {}
  if (keep) {
    // adopt the shadow crew as the real save (only offered when the real
    // save has no player — never clobbers a real history)
    const src = realSnapshot ?? (() => { try { return localStorage.getItem(S.DEMO_KEY); } catch { return null; } })();
    if (src != null) { try { localStorage.setItem(S.REAL_KEY, src); } catch {} }
  } else {
    try { localStorage.removeItem(S.DEMO_KEY); } catch {}
  }
  S.useKey(null); // back to rwf.figma.v1
  teardownUI();
  try { history.replaceState(null, "", location.pathname); } catch {}
  location.hash = "#/home-002";
  if (location.hash === "#/home-002") dispatchEvent(new Event("hashchange"));
}

/** The end card: real CTAs + the honest keep/discard choice. */
function showEndCard() {
  if (phase !== "running") return;
  phase = "endcard";
  try { D.clearNowOverride(); } catch {}
  teardownUI();
  const canKeep = (() => {
    try {
      if (realSnapshot == null) return true; // no real save at all — free to adopt
      const r = JSON.parse(realSnapshot);
      return !r?.player; // has a save but never onboarded — still free
    } catch { return false; }
  })();
  const el = document.createElement("div");
  el.className = "fx-scrim fx-scrim--center fx-demo-endcard";
  el.innerHTML = `
    <div class="fx-sheet">
      <div class="fx-sheet__grab"></div>
      <div class="fx-demo-endcard__wordmark">REPS<i>·</i>WF</div>
      <h2 class="fx-sheet__h">THAT'S THE GAME.</h2>
      <p class="fx-demo-endcard__sub">One battle, real engine: handicaps, comeback, lightning, the deadline. Your real save was never touched${canKeep ? " — this crew was a shadow copy" : ""}.</p>
      <button class="fg-sheet__cta" data-end="play">PLAY FOR REAL</button>
      <div class="fx-demo-endcard__row">
        <a class="fx-demo-endcard__link" href="/wiki" target="_blank" rel="noopener">EXPLORE THE SYSTEM — THE WIKI →</a>
      </div>
      ${canKeep ? `
        <div class="fx-demo-endcard__row">
          <button class="fx-demo-endcard__keep" data-end="keep">KEEP THE DEMO CREW — START FROM HERE</button>
        </div>` : ""}
      <p class="fg-sheet__note">${canKeep ? "or discard it — " : ""}v1.0.0 · demo ran on a shadow copy of the app state</p>
    </div>`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-end]");
    if (!b) return;
    if (b.dataset.end === "play") exitDemo({ keep: false });
    if (b.dataset.end === "keep") exitDemo({ keep: true });
  });
  document.body.appendChild(el);
  // reflect the final scene on the public status surface
  sceneIndex = SCRIPT.length;
  publish();
}

/* public surface: the e2e + curious engineers read this */
function publish(extra = {}) {
  const sc = SCRIPT[sceneIndex] ?? null;
  window.__rwfDemo = {
    startedAt,
    sceneIndex,
    sceneId: sc?.id ?? "end",
    caption: sc?.cap ?? null,
    totalScenes: SCRIPT.length,
    paused,
    speed,
    running: phase === "running",
    ...(phase === "running" ? { elapsedMs: () => elapsedMs } : {}),
    setSpeed: (n) => { if (n === 1 || n === 2) speed = n; },
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    skip: () => { skipFlag = true; },
    exit: () => exitDemo({ keep: false }),
    scriptTotal1xMs: total1x(),
    ...extra,
  };
}

/* ── start ─────────────────────────────────────────────────────────────── */
export async function startDemo({ speed: sp = 1 } = {}) {
  if (phase !== "off") return;
  phase = "running";
  speed = sp === 2 ? 2 : 1;
  killed = false;
  paused = false;
  skipFlag = false;
  sceneIndex = -1;
  startedAt = Date.now();
  elapsedMs = 0;

  // snapshot the real save, then switch to the shadow key
  try { realSnapshot = localStorage.getItem(S.REAL_KEY); } catch { realSnapshot = null; }
  S.useKey(S.DEMO_KEY);
  try { localStorage.removeItem(S.DEMO_KEY); } catch {}
  S.save(S.blank());

  // UI: click shield (the script owns the screen) + narrator
  document.body.classList.add("fx-demo-on");
  shieldEl = document.createElement("div");
  shieldEl.className = "fx-demo-shield";
  document.body.appendChild(shieldEl);
  narratorEl = document.createElement("div");
  narratorEl.className = "fx-narr";
  narratorEl.addEventListener("click", narratorControls);
  document.body.appendChild(narratorEl);

  const t0 = Date.now();
  for (let i = 0; i < SCRIPT.length; i++) {
    if (killed) return;
    sceneIndex = i;
    elapsedMs = Date.now() - t0;
    publish();
    renderNarrator();
    try { await SCRIPT[i].run(); } catch (err) {
      // a scene step missing its target (screen not wired yet) must not
      // kill the tour — log and move on
      console.warn(`[demo] scene ${SCRIPT[i].id} hiccup:`, err?.message ?? err);
    }
    if (killed) return;
    const r = await dwell(SCRIPT[i].dwell ?? 0);
    if (r === "killed") return;
    elapsedMs = Date.now() - t0;
  }
  showEndCard();
}
