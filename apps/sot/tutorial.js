/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 — THE GUIDED DEMO (~90s narrator-driven walk, v1 demo pattern)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Borrows apps/figma-app/demo.js wholesale: a SCRIPT of scenes (caption +
   dwell + a run() that performs REAL app actions), a bottom-sheet narrator
   (dots · prev/pause/speed/skip/exit), and a SHADOW STATE so the user's
   real save is never touched (engine useKey → DEMO_KEY, snapshot restored
   on exit).

   The walk: meet the crew (tiers) → the day opens → THE DEAL (3 flip,
   pick explained) → log reps (adjusted math live) → a rival takes the
   Daily Win → you BANK your day (streak) → a proof card fires → the feed
   accepts → day recap → weekly standings → the stake → end card.

   e2e drive surface: window.__rwfSotDemo (sceneIndex/sceneId/caption/
   running/pause/resume/skip/exit/scriptTotal1xMs) — mirrors v1's
   __rwfDemo contract. Everything else stays inside this IIFE.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const TICK = 100; // driver heartbeat (ms of real time per step)
  const qs = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SoT = () => window.RWFSoT;
  const App = () => window.__rwfV4;

  /* tiny drive helpers (app.js exposes __rwfGo/__rwfTabTo/__rwfOverlay/
     __rwfSeason for the demo + e2e; fall back to state-only paths here) */
  function go(view) {
    if (window.__rwfGo) return window.__rwfGo(view);
    if (App()) { App().view = view; }
  }
  function tabTo(name) {
    if (window.__rwfTabTo) return window.__rwfTabTo(name);
    if (App()) { App().tab = name; }
  }
  function showOverlay(ov) {
    if (window.__rwfOverlay) return window.__rwfOverlay(ov);
    if (App()) { App().overlay = ov; }
  }
  function seasonView(v) {
    if (window.__rwfSeason) return window.__rwfSeason(v);
    if (App()) { App().seasonView = v; }
  }
  const snap = () => SoT().snapshot();
  const member = (g, name) => g.members.find((m) => m.name === name);
  const logAs = (gid, memberId, ex, phys, verified) =>
    SoT().logRepsAs(gid, memberId, ex, phys, verified);
  async function waitSel(sel, timeout = 2500) {
    const t0 = Date.now();
    for (;;) {
      if (qs(sel)) return true;
      if (Date.now() - t0 > timeout) return false;
      await sleep(50);
    }
  }

  /* ── the script ──────────────────────────────────────────────────────────
     dwell = caption read-time at 1× (ms). run() executes real app actions
     BEFORE the dwell so the caption narrates what is already on screen.
     `re: true` scenes are safe to re-run via ◀ prev; mutating scenes only
     rewind their caption. */
  const SCRIPT = [
    {
      id: "welcome",
      cap: "THIS IS THE WHOLE GAME — 90 SECONDS.",
      sub: "The demo runs on a shadow copy. Your real save is never touched.",
      dwell: 4200,
      re: true,
      run: async () => { go("welcome"); await sleep(220); },
    },
    {
      id: "crew",
      cap: "MEET THE CREW — GOLD SQUAD.",
      sub: "Marco trains casual (×1.25), Priya is fit (×1.0), Jack starts from the couch (×1.5). Effort competes — not raw fitness.",
      dwell: 6500,
      re: false, // seeding twice would double the logs
      run: async () => {
        SoT().seedDemo(); // real engine: group + season + live battle + house crew
        go("app");
        tabTo("battle");
        await sleep(260);
        const s = snap();
        if (s.myDraft && App()) App().dealDismissed = s.myDraft.openedAt; // the deal gets its own scene
        showOverlay(null);
      },
    },
    {
      id: "deal",
      cap: "EVERY BATTLE DAY OPENS WITH THE DEAL.",
      sub: "Three cards face-down, pick one. Behind on the day? The deck quietly leans your way.",
      dwell: 6500,
      re: true,
      run: async () => {
        if (!snap().myDraft) return; // already picked on a ◀ rewind
        showOverlay({ kind: "deal" });
        await waitSel(".rwcard", 2000);
        qs(".rwcard")?.click(); // flip the three
        await sleep(420);
      },
    },
    {
      id: "deal-pick",
      cap: "TAKE ONE INTO YOUR HAND — HOLD UP TO THREE.",
      sub: "Play them the moment they matter. Don't like the three? Reroll — the price feeds the crew pot.",
      dwell: 6000,
      re: false,
      run: async () => {
        if (!snap().myDraft) return;
        qs(".rwcard")?.click(); // tap your card → into the hand
        await sleep(500);
      },
    },
    {
      id: "log",
      cap: "NOW LOG REPS — THE HANDICAP SCORES THEM.",
      sub: "20 push-ups score 20 for a Fit. Jack's 40 squats score 60 — couch reps count ×1.5. Same 200 target for everyone.",
      dwell: 7000,
      re: false,
      run: async () => {
        const s = snap();
        logAs(s.group.id, s.me.id, "pushups", 20); // fit ×1.0 → +20
        tabTo("battle");
        await sleep(420);
      },
    },
    {
      id: "rival-win",
      cap: "MARCO TAKES THE DAILY WIN.",
      sub: "First to the 200-adjusted target closes it — but the battle keeps going. Everyone else can still bank the day.",
      dwell: 6500,
      re: false,
      run: async () => {
        const s = snap();
        const marco = member(s.group, "Marco");
        logAs(s.group.id, marco.id, "pushups", 112); // casual ×1.25 → +140 → 200 total
        await sleep(500); // the otherWon moment claims the screen
      },
    },
    {
      id: "bank",
      cap: "SO YOU BANK YOUR DAY INSTEAD.",
      sub: "Win or not — hit the target, keep the streak, log another day of history.",
      dwell: 6500,
      re: false,
      run: async () => {
        showOverlay(null); // clear the win moment
        await sleep(160);
        const s = snap();
        logAs(s.group.id, s.me.id, "pushups", 180); // 20 + 180 = 200 → banked
        await sleep(220);
        showOverlay({ kind: "banked" });
      },
    },
    {
      id: "proof",
      cap: "BIG CLAIMS GET CHECKED — PROOF IS THE GAME.",
      sub: "Marco plays Prove It on Jack's next set. The crew reviews: accept and the reps stand — contest and it scores 0 but the day still banks.",
      dwell: 7500,
      re: false,
      run: async () => {
        showOverlay(null);
        await sleep(160);
        const s0 = snap();
        const gid = s0.group.id;
        const marco = member(s0.group, "Marco");
        const jack = member(s0.group, "Jack");
        SoT().debugGrant(gid, marco.id, "prove_it");
        const r = SoT().activateCard(gid, marco.id, "prove_it", jack.id);
        if (!r || r.error) return;
        logAs(gid, jack.id, "pushups", 15); // Jack's next set — under group review
        await sleep(300);
        const s1 = snap();
        const proof = s1.openProofs && s1.openProofs[0];
        if (proof) {
          SoT().voteProofAs(gid, proof.id, s0.me.id, "accept");
          const priya = member(s0.group, "Priya");
          SoT().voteProofAs(gid, proof.id, priya.id, "accept"); // majority settles it
        }
        tabTo("feed");
        await sleep(420);
      },
    },
    {
      id: "recap",
      cap: "THE CLOCK RUNS OUT — THE DAY SETTLES.",
      sub: "Wins, banks, misses, the pot — one recap card the whole crew shares.",
      dwell: 6000,
      re: true,
      run: async () => {
        const st = SoT().state;
        const g = st.groups[st.activeGroupId];
        const s = g.seasons.find((x) => x.status === "active") || g.seasons[g.seasons.length - 1];
        const b = s.battles.find((x) => x.status === "live");
        if (b) {
          // the RULES deadline lives in the core day's config (deadlineAt);
          // the app record mirrors it. Pull both — the engine closes on the core.
          if (b.core && b.core.config) b.core.config.deadlineAt = Date.now() - 10;
          b.deadlineMs = Date.now() - 10;
          SoT().tick(g.id);
          await sleep(200);
          const draft = snap().myDraft; // battle 2 may already be live — park its deal
          if (draft && App()) App().dealDismissed = draft.openedAt;
        }
        tabTo("battle");
        showOverlay({ kind: "recap" });
        await sleep(300);
      },
    },
    {
      id: "season",
      cap: "ONE WEEK. EVERY DAILY WIN IS A POINT.",
      sub: "Banked days count for history and streaks — consistency beats one hero day.",
      dwell: 6000,
      re: true,
      run: async () => {
        showOverlay(null);
        seasonView(true);
        await sleep(320);
      },
    },
    {
      id: "stake",
      cap: "THE STAKE SETTLES AT SEASON END — NEVER DAILY.",
      sub: "Dinner, a dare, a deliverable — or Crew Giving, the crew's monthly pool. Terms locked before the season — nothing owed till it's over.",
      dwell: 7000,
      re: true,
      run: async () => { seasonView(true); await sleep(200); },
    },
  ];

  const total1x = () => SCRIPT.reduce((n, s) => n + (s.dwell || 0), 0);

  /* ── the driver ─────────────────────────────────────────────────────────── */

  let phase = "off"; // off → running → endcard → off
  let paused = false;
  let skipFlag = false;
  let rewindTo = null; // prev's rewind request (consumed by the loop)
  let speed = 1;
  let killed = false;
  let sceneIndex = -1;
  let realSnapshot = null;
  let narratorEl = null;
  let shieldEl = null;

  /** Pausable, speed-scaled, skippable dwell. Resolves "skip"|"killed"|"done". */
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
    if (!narratorEl) return;
    if (!sc) return;
    const dots = SCRIPT.map((_, i) => `<i class="${i === sceneIndex ? "on" : i < sceneIndex ? "done" : ""}"></i>`).join("");
    narratorEl.innerHTML = `
      <div class="tut-narr__grab"></div>
      <div class="tut-narr__cap">${sc.cap}</div>
      ${sc.sub ? `<div class="tut-narr__sub">${sc.sub}</div>` : ""}
      <div class="tut-narr__dots">${dots}</div>
      <div class="tut-narr__ctl">
        <button class="tut-narr__btn" data-narr="prev" title="Back a beat" ${sceneIndex <= 0 ? "disabled" : ""}>◀</button>
        <button class="tut-narr__btn" data-narr="skip" title="Next beat">⏭</button>
        <button class="tut-narr__btn" data-narr="pause" title="Pause/resume">${paused ? "▶" : "⏸"}</button>
        <button class="tut-narr__btn ${speed === 2 ? "tut-narr__btn--on" : ""}" data-narr="speed" title="Speed">${speed}×</button>
        <span class="tut-narr__tag">DEMO</span>
        <button class="tut-narr__btn tut-narr__btn--exit" data-narr="exit" title="Exit demo">✕</button>
      </div>`;
  }

  function narratorControls(e) {
    const b = e.target.closest("[data-narr]");
    if (!b) return;
    const act = b.dataset.narr;
    if (act === "skip") { skipFlag = true; paused = false; }
    else if (act === "prev" && phase === "running" && sceneIndex > 0) {
      // rewind the narration one beat; the loop re-runs the scene when
      // it's side-effect free (re: true), otherwise the caption rewinds
      // and playback resumes from there
      rewindTo = Math.max(0, sceneIndex - 1);
      skipFlag = true;
      paused = false;
      renderNarrator();
    }
    else if (act === "pause") { paused = !paused; renderNarrator(); }
    else if (act === "speed") { speed = speed === 1 ? 2 : 1; renderNarrator(); }
    else if (act === "exit") { exitDemo({ keep: false }); }
  }

  function teardownUI() {
    if (narratorEl) { narratorEl.remove(); narratorEl = null; }
    if (shieldEl) { shieldEl.remove(); shieldEl = null; }
    document.querySelectorAll(".tut-demo-endcard").forEach((n) => n.remove());
    document.body.classList.remove("tut-demo-on");
  }

  /** Restore the real save + UI. Callable from the narrator (mid-tour) or
   *  the end card — but never twice. */
  function exitDemo() {
    if (phase === "off") return;
    phase = "off";
    killed = true;
    try {
      if (realSnapshot != null) localStorage.setItem(window.RWFSoT.REAL_KEY, realSnapshot);
      else localStorage.removeItem(window.RWFSoT.REAL_KEY);
    } catch (e) { /* storage full/blocked — the shadow key still releases */ }
    SoT().useKey(null); // back to the real key (this persists the demo state to the demo key first)
    try { localStorage.removeItem(window.RWFSoT.DEMO_KEY); } catch (e) { /* now clean it for good */ }
    teardownUI();
    go("welcome");
    publish();
  }

  /** The end card: the founder's line + real CTAs. */
  function showEndCard() {
    if (phase !== "running") return;
    phase = "endcard";
    teardownUI();
    const el = document.createElement("div");
    el.className = "tut-scrim tut-demo-endcard";
    el.innerHTML = `
      <div class="tut-endcard">
        <div class="tut-endcard__wordmark">REPS<i>·</i>WITH<i>·</i>FRIENDS</div>
        <h2 class="tut-endcard__h">THAT'S THE WHOLE GAME.</h2>
        <p class="tut-endcard__sub">A 200-adjusted target a day · first to target wins the day · everyone else banks · wins stack into the week · the stake settles at season end. <b>Join the Battle. Win the Day.</b></p>
        <button class="tut-endcard__cta" data-end="play">JOIN THE BATTLE</button>
        <div class="tut-endcard__row">
          <button class="tut-endcard__link" data-end="again">▶ WATCH IT AGAIN</button>
          <button class="tut-endcard__link" data-end="how">📖 HOW IT WORKS</button>
        </div>
        <p class="tut-endcard__note">Ran on a shadow copy — your real save was never touched.</p>
      </div>`;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-end]");
      if (!b) return;
      if (b.dataset.end === "play") { exitDemo(); }
      if (b.dataset.end === "again") { exitDemo(); setTimeout(() => startDemo({ speed }), 240); }
      if (b.dataset.end === "how") { exitDemo(); setTimeout(() => { if (window.__rwfGo) window.__rwfGo("howitworks"); }, 240); }
    });
    document.body.appendChild(el);
    sceneIndex = SCRIPT.length;
    publish();
  }

  /* public drive surface — the e2e + curious engineers read this */
  function publish(extra = {}) {
    const sc = SCRIPT[sceneIndex] ?? null;
    window.__rwfSotDemo = {
      sceneIndex,
      sceneId: sc ? sc.id : "end",
      caption: sc ? sc.cap : null,
      totalScenes: SCRIPT.length,
      paused,
      speed,
      running: phase === "running",
      endcard: phase === "endcard",
      scriptTotal1xMs: total1x(),
      pause: () => { paused = true; },
      resume: () => { paused = false; },
      skip: () => { skipFlag = true; },
      setSpeed: (n) => { if (n === 1 || n === 2) speed = n; },
      exit: () => exitDemo(),
      ...extra,
    };
  }

  /* ── start ──────────────────────────────────────────────────────────────── */
  async function startDemo({ speed: sp = 1 } = {}) {
    const S = SoT();
    if (!S || phase !== "off") return;
    phase = "running";
    speed = sp === 2 ? 2 : 1;
    killed = false;
    paused = false;
    skipFlag = false;
    rewindTo = null;
    sceneIndex = -1;
    realSnapshot = null;

    // snapshot the real save, then switch to the shadow key (v1 pattern)
    try { realSnapshot = localStorage.getItem(S.REAL_KEY); } catch (e) { realSnapshot = null; }
    S.useKey(S.DEMO_KEY);
    try { localStorage.removeItem(S.DEMO_KEY); } catch (e) { /* fresh shadow */ }
    S.useKey(null);        // step off the demo key…
    S.useKey(S.DEMO_KEY);  // …and back onto it — now it loads blank (cleared) state

    // UI: click shield (the script owns the screen) + the narrator sheet
    document.body.classList.add("tut-demo-on");
    shieldEl = document.createElement("div");
    shieldEl.className = "tut-demo-shield";
    document.body.appendChild(shieldEl);
    narratorEl = document.createElement("div");
    narratorEl.className = "tut-narr";
    narratorEl.addEventListener("click", narratorControls);
    document.body.appendChild(narratorEl);

    let cursor = 0;
    while (cursor < SCRIPT.length) {
      if (killed) return;
      sceneIndex = cursor;
      publish();
      renderNarrator();
      try { await SCRIPT[cursor].run(); } catch (err) {
        // a scene step missing its target must never kill the tour
        console.warn(`[tut-demo] scene ${SCRIPT[cursor].id} hiccup:`, err && err.message ? err.message : err);
      }
      if (killed) return;
      const r = await dwell(SCRIPT[cursor].dwell || 0);
      if (r === "killed") return;
      if (rewindTo != null) { cursor = rewindTo; rewindTo = null; continue; }
      cursor++;
    }
    showEndCard();
  }

  window.RWFTutorial = { startDemo, exitDemo, SCRIPT, scriptTotal1xMs: total1x() };
  publish();
})();
