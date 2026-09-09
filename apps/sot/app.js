/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 — SoT APP (the Source of Truth app, served at /v4)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   5-tab nav per SOT: Battle / Feed / [central LOG] / Power-Ups / Profile.
   Screens (CORE set, §2): welcome + 3 explainers + profile/avatar/tone →
   create-group wizard (§4.1 condensed) · join flow (§4.2) · Battle Home
   (#91: adjusted target hero, progress ring, battle clock with final-
   period urgency ramp, live leaderboard, close-call + Danger Zone) ·
   Quick Log (#106-118) · winners family (#171-183) · Feed (#205) ·
   Power-Ups (#138-145 hidden loot cards) · Season Hub (#184-204) ·
   Profile (#245-248 + settings).

   Engine: window.RWFSoT (apps/sot/engine.js local model, or the shared
   apps/sot-engine.js when installed — same facade). SFX: window.rwfSfx,
   defensive. No framework, no build step.
   ═══════════════════════════════════════════════════════════════════════ */
(async function () {
  "use strict";
  // Wait (defensively) for engine.js to set window.RWFSoT. Module execution
  // order SHOULD guarantee it, but a slow module fetch once raced app.js
  // ahead in headless chromium — dynamic import re-joins the in-flight load.
  let SoT = window.RWFSoT;
  for (let i = 0; !SoT && i < 100; i++) {
    try { await import("./engine.js"); } catch (e) { /* surfaced by the fallback below */ }
    if (window.RWFSoT) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  SoT = window.RWFSoT;
  if (!SoT) { document.body.innerHTML = "<div style='padding:40px;color:#f5c445;font-family:sans-serif'>engine failed to load</div>"; return; }

  /* ── tiny DOM helper ─────────────────────────────────────────────── */
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(3)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const sfx = (name) => { try { window.rwfSfx && window.rwfSfx.play && window.rwfSfx.play(name); } catch (e) { /* defensive by design */ } };
  const fmtMs = (ms) => {
    if (ms <= 0) return "00:00";
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };
  const money = (c) => "$" + (c / 100).toFixed(2);
  const timeAgo = (ms) => {
    const d = Date.now() - ms;
    if (d < 60_000) return "just now";
    if (d < 3600_000) return Math.floor(d / 60_000) + "m ago";
    if (d < 86_400_000) return Math.floor(d / 3600_000) + "h ago";
    return Math.floor(d / 86_400_000) + "d ago";
  };
  const REDUCED = null; // reduced-motion is handled purely in CSS (animations
  // and confetti are gated by the prefers-reduced-motion media block)

  /* ── canvas share card (win card → PNG, Gold Arcade skin) ────────── */
  function winCardPng(snap, b) {
    try {
      const W = 780, H = 936;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d"); if (!x) return null;
      const cardPath = (px) => { x.beginPath(); x.roundRect ? x.roundRect(px, px, W - px * 2, H - px * 2, 44) : x.rect(px, px, W - px * 2, H - px * 2); };
      x.fillStyle = "#07070c"; cardPath(0); x.fill();
      x.strokeStyle = "rgba(245,196,69,.5)"; x.lineWidth = 3; cardPath(16); x.stroke();
      x.strokeStyle = "rgba(245,196,69,.16)"; x.lineWidth = 2; cardPath(30); x.stroke();
      x.textAlign = "center";
      x.fillStyle = "#f5c445";
      x.font = "600 26px system-ui, sans-serif";
      x.fillText("R E P S   W I T H   F R I E N D S", W / 2, 128);
      x.font = "112px Anton, 'Arial Black', system-ui, sans-serif";
      x.fillText("YOU WON", W / 2, 300);
      x.fillStyle = "#b79bff";
      x.fillText("THE DAY", W / 2, 416);
      const target = (snap.myRow && snap.myRow.dayTarget) || snap.group.target;
      x.fillStyle = "#f5c445";
      x.font = "84px Anton, 'Arial Black', system-ui, sans-serif";
      x.fillText(String(target), W / 2, 560);
      x.font = "600 24px system-ui, sans-serif";
      x.fillText("REPS · FIRST TO TARGET", W / 2, 604);
      x.fillStyle = "rgba(255,255,255,.85)";
      x.font = "600 28px system-ui, sans-serif";
      x.fillText((snap.me ? snap.me.name : "You").toUpperCase(), W / 2, 700);
      x.fillStyle = "rgba(255,255,255,.55)";
      x.font = "24px system-ui, sans-serif";
      x.fillText(`${snap.group.name} · battle ${b ? b.idx : ""}`, W / 2, 740);
      x.fillStyle = "#f5c445";
      x.font = "24px system-ui, sans-serif";
      x.fillText("Join the battle. Win the day.", W / 2, 828);
      x.fillStyle = "rgba(255,255,255,.4)";
      x.fillText("rwf.qalarc.com/v4", W / 2, 866);
      return c.toDataURL("image/png");
    } catch (e) { return null; }
  }

  /* ── tone-aware copy (cheeky / neutral / corporate-safe) ──────────── */
  const TONE = {
    winTitle: { cheeky: "YOU WON THE DAY", neutral: "YOU WON THE DAY", corporate: "DAILY WIN SECURED" },
    winSub: { cheeky: "First to the target. Absolute unit behaviour.", neutral: "First to reach the target today.", corporate: "First to reach today's target — well done." },
    otherWon: { cheeky: "beaten to the punch — bank your own day instead", neutral: "the Daily Win is taken — bank your own day", corporate: "the Daily Win is claimed — you can still complete your day" },
    failed: { cheeky: "the day got away — tomorrow's a fresh battle", neutral: "today slipped — tomorrow resets the board", corporate: "today wasn't completed — tomorrow is a fresh start" },
    bank: { cheeky: "day BANKED — streak intact, legend status rising", neutral: "day banked — streak intact", corporate: "day completed — streak maintained" },
    nudge: { cheeky: "go on, one more set", neutral: "one more set closes the gap", corporate: "one more set would help today's total" },
  };
  const tone = (key) => {
    const t = (SoT.state.me && SoT.state.me.tone) || "cheeky";
    return (TONE[key] && (TONE[key][t] || TONE[key].cheeky)) || "";
  };

  /* ── app state (view only — data lives in the engine store) ──────── */
  const App = {
    view: "welcome",           // welcome|explain|name|avatar|tone|start|join|create|app
    tab: "battle",             // battle|feed|log|powerups|profile
    explainIdx: 0,
    wiz: null, join: null,
    logFlow: null,             // {step, exerciseId, amount, secs, timerStart, fromRecents}
    overlay: null, overlayShown: {},
    seenEventId: null,
    seasonView: false,
  };
  const appEl = document.getElementById("app");
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  /* ── connection shim (SOT #103 · #104 · #120 — simulated realtime) ──
     The app is local-first; this shim models the hero-app ↔ server link
     the SOT describes: an offline banner, a queued-log badge on the LOG
     button, and replay-on-reconnect with duplicate/sync-conflict
     resolution (#105 + #119 sheets). Demo-toggleable from Settings — the
     app never touches a real socket, so the whole surface is testable. */
  const CONN_KEY = "rwf.sot.conn.v1";
  const Conn = {
    mode: "online",            // online | offline | reconnecting
    queue: [],                 // [{id, exerciseId, amount, queuedAt}]
    load() {
      try { const j = JSON.parse(localStorage.getItem(CONN_KEY) || "null"); if (j && Array.isArray(j.queue)) this.queue = j.queue; } catch (e) { /* fresh device */ }
      this.save();
    },
    save() { try { localStorage.setItem(CONN_KEY, JSON.stringify({ v: 1, queue: this.queue })); } catch (e) { /* private mode */ } },
    enqueue(exerciseId, amount) {
      const entry = { id: "q_" + Math.random().toString(36).slice(2, 9), exerciseId, amount, queuedAt: Date.now() };
      this.queue.push(entry); this.save(); return entry;
    },
    remove(id) { this.queue = this.queue.filter((e) => e.id !== id); this.save(); },
    byId(id) { return this.queue.find((e) => e.id === id) || null; },
  };
  function setSimulateOffline(v) {
    if (v) { Conn.mode = "offline"; render(); return; }
    // back online → visible reconnect beat, then replay the queue (#103)
    Conn.mode = "reconnecting"; render();
    setTimeout(() => replayQueuedLogs(), 1100);
  }
  function replayQueuedLogs() {
    let synced = 0, dropped = 0, conflicts = [];
    const snap = SoT.snapshot();
    if (snap && Conn.queue.length) {
      for (const q of Conn.queue.slice()) {
        const dup = duplicateLogOf(q.exerciseId, q.amount);
        if (dup) { conflicts.push({ q, dup }); continue; }   // #105 — resolve by hand
        const r = SoT.logReps(snap.group.id, snap.me.id, q.exerciseId, q.amount);
        if (r.error) { Conn.remove(q.id); dropped++; continue; }
        Conn.remove(q.id); synced++;
      }
    }
    Conn.mode = "online";
    render();
    if (conflicts.length) {
      App.overlay = { kind: "syncConflict", conflicts, synced, dropped }; render();
    } else if (synced || dropped) {
      toast(`Back online — ${synced} queued set${synced === 1 ? "" : "s"} synced${dropped ? `, ${dropped} dropped` : ""}`);
    } else {
      toast("Back online");
    }
  }
  /* duplicate detection (#119): same exercise + same reps (post-conversion)
     by me within 60s → warn before it lands. Reads FRESH state so replay
     sequences see their own earlier entries. Returns the engine entry. */
  function duplicateLogOf(exerciseId, physical) {
    const snap = SoT.snapshot();
    const b = snap && snap.battle;
    if (!b || !b.core || !snap.me) return null;
    const ex = SoT.exerciseById(exerciseId);
    if (!ex) return null;
    const ruf = ex.secsPerRep ? Math.round((physical / ex.secsPerRep) * ex.value) : Math.round(physical * ex.value);
    const meId = snap.me.id;
    const now = Date.now();
    for (const e of b.core.entries) {
      if (e.playerId !== meId || e.exerciseId !== exerciseId || e.powerUps) continue;
      if (e.reps === ruf && now - e.at <= 60_000) return e;
    }
    return null;
  }

  /* ── routing / render ─────────────────────────────────────────────── */
  function go(view) { App.view = view; render(); }
  function tab(name) { sfx(name === "log" ? "primary" : "tap"); App.tab = name; if (name === "log") openLog(); else { App.logFlow = null; App.seasonView = false; } render(); }

  function render() {
    clear(appEl);
    const st = SoT.state;
    if (App.view === "app") detectMoments();
    if (App.overlay) { appEl.append(renderOverlay(App.overlay)); }
    switch (App.view) {
      case "welcome": appEl.append(scrWelcome()); break;
      case "explain": appEl.append(scrExplain()); break;
      case "name": appEl.append(scrName()); break;
      case "avatar": appEl.append(scrAvatar()); break;
      case "tone": appEl.append(scrTone()); break;
      case "start": appEl.append(scrStart()); break;
      case "join": appEl.append(scrJoin()); break;
      case "create": appEl.append(scrCreate()); break;
      case "howitworks": appEl.append(scrHowItWorks()); break;
      case "cardsheet": appEl.append(scrCardSheet()); break;
      default:
        if (!st.onboarded || !st.me || !st.me.name) { App.view = "welcome"; return render(); }
        if (!st.activeGroupId || !st.groups[st.activeGroupId]) { App.view = "start"; return render(); }
        if (App.seasonView) { appEl.append(navShellWrap(scrSeasonHub())); break; }
        if (App.tab === "battle") appEl.append(navShellWrap(scrBattle()));
        else if (App.tab === "feed") appEl.append(navShellWrap(scrFeed()));
        else if (App.tab === "log") appEl.append(navShellWrap(scrLog()));
        else if (App.tab === "powerups") appEl.append(navShellWrap(scrPowerUps()));
        else appEl.append(navShellWrap(scrProfile()));
    }
  }

  /* ══ ONBOARDING ═══════════════════════════════════════════════════ */
  function scrWelcome() {
    return el("div", { class: "screen on" },
      el("div", { style: "text-align:center;padding-top:60px" },
        el("div", { style: "font-size:64px;filter:drop-shadow(0 10px 30px rgba(245,196,69,.35))" }, "🏆"),
        el("h1", { class: "display", style: "font-size:46px;margin-top:18px" }, "REPS WITH", el("br"), el("span", { class: "gold-t" }, "FRIENDS")),
        el("p", { class: "display sub", style: "font-size:19px;color:var(--gold);letter-spacing:.08em;margin-top:6px" }, "JOIN THE BATTLE. WIN THE DAY."),
        el("p", { class: "sub", style: "max-width:280px;margin:14px auto 0" }, "The daily rep battle for you and your crew. Not a tracker — a game."),
      ),
      el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
        el("button", { class: "btn", onclick: () => { sfx("primary"); App.explainIdx = 0; go("explain"); } }, "Let's go"),
        el("button", { class: "btn ghost", style: "margin-top:10px", id: "tut-watch", onclick: () => { sfx("deal"); if (window.RWFTutorial) window.RWFTutorial.startDemo(); } }, `▶ Watch how it works — ${window.RWFTutorial ? Math.round(window.RWFTutorial.scriptTotal1xMs / 1000 / 5) * 5 : 90} seconds`),
        el("div", { class: "btn-row", style: "margin-top:10px" },
          el("button", { class: "btn ghost sm", style: "flex:1", id: "tut-howto", onclick: () => { sfx("tap"); go("howitworks"); } }, "📖 How it works"),
          el("button", { class: "btn ghost sm", style: "flex:1", id: "tut-cards", onclick: () => { sfx("tap"); go("cardsheet"); } }, "🃏 The card sheet")),
        el("button", { class: "btn ghost sm", style: "margin-top:10px", onclick: () => { sfx("deal"); jumpToDemo(); } }, "⚡ Jump into a live demo battle"),
        el("p", { class: "tiny", style: "text-align:center;margin-top:12px" }, "V4 · Source of Truth build · local demo")));
  }

  /* demo seeder entry — the founder sees a live mid-battle instantly */
  function jumpToDemo() {
    const g = SoT.seedDemo();
    if (!g || g.error) { toast("Demo seed failed"); return; }
    App.view = "app"; App.tab = "battle"; App.overlay = null; App.wiz = null; App.join = null;
    toast("Demo battle live — the crew is already moving");
    render();
  }

  const EXPLAINS = [
    { ico: "⚔️", t: "THE DAILY BATTLE", s: "Each battle day you get a target — 200 adjusted reps to start. Everyone races. First to target takes the Daily Win." },
    { ico: "📅", t: "SEASONS & STAKES", s: "Daily Wins stack into a weekly season. Season ends, stakes settle — a dinner, a dare, or a charity pot." },
    { ico: "💬", t: "APP + CHAT", s: "The app is home base. The battle also lives in your group chat — updates, warnings and winner calls." },
  ];
  function scrExplain() {
    const i = App.explainIdx, x = EXPLAINS[i];
    return el("div", { class: "screen on" },
      el("div", { class: "ex-ill" }, x.ico),
      el("h1", { class: "display", style: "text-align:center" }, x.t),
      el("p", { class: "sub", style: "text-align:center;max-width:290px;margin:10px auto 0;font-size:16px" }, x.s),
      el("div", { class: "dots" }, EXPLAINS.map((_, k) => el("i", { class: k === i ? "on" : "" }))),
      el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
        el("div", { class: "btn-row" },
          i > 0 ? el("button", { class: "btn ghost", onclick: () => { sfx("tap"); App.explainIdx--; render(); } }, "Back")
            : el("button", { class: "btn ghost", onclick: () => { sfx("tap"); go("welcome"); } }, "Back"),
          el("button", { class: "btn", onclick: () => { sfx("primary"); if (i < 2) { App.explainIdx++; render(); } else go("name"); } }, i < 2 ? "Next" : "Create profile")),
      ));
  }

  function scrName() {
    const inp = el("input", { type: "text", placeholder: "e.g. Alexei", maxlength: "24", value: (SoT.state.me && SoT.state.me.name) || "" });
    setTimeout(() => inp.focus(), 60);
    return el("div", { class: "screen on" },
      el("h1", { class: "display" }, "WHAT DO THEY", el("br"), "CALL YOU?"),
      el("p", { class: "sub" }, "Your name on the leaderboard."),
      el("div", { class: "card" }, el("label", { class: "f" }, "Display name"), inp),
      el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
        el("button", { class: "btn", onclick: () => {
          const v = inp.value.trim();
          if (!v) { sfx("error"); toast("Give us a name to put on the board"); return; }
          sfx("primary"); SoT.setMe({ name: v, initials: v.slice(0, 2).toUpperCase() }); go("avatar");
        } }, "Next")));
  }

  function scrAvatar() {
    const me = SoT.state.me;
    const colors = SoT.COLORS;
    const wrap = el("div", { class: "screen on" },
      el("h1", { class: "display" }, "YOUR BADGE"),
      el("p", { class: "sub" }, "Initials badge for now — photo booth busts plug in later from /booth."),
      el("div", { class: "card gold", style: "text-align:center" },
        el("div", { class: "avatar lg", id: "av-prev", style: "margin:6px auto 10px;background:" + me.color }, me.initials || "??"),
        el("div", { class: "display", style: "font-size:22px" }, me.name || ""),
        el("p", { class: "tiny" }, "initials badge · colour pick below")),
      el("label", { class: "f" }, "Badge colour"),
      el("div", { class: "grid3", id: "av-colors" }, colors.map((c) =>
        el("div", { class: "pick", style: "padding:10px", onclick: () => { sfx("tap"); SoT.setMe({ color: c }); render(); } },
          el("div", { class: "avatar sm", style: "background:" + c + ";margin:0 auto" }, "A")))),
      el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
        el("button", { class: "btn", onclick: () => { sfx("primary"); go("tone"); } }, "Next")));
    return wrap;
  }

  function scrTone() {
    const tones = [
      { id: "cheeky", ico: "😏", t: "Cheeky", s: "Full banter. Winner screens go loud." },
      { id: "neutral", ico: "🙂", t: "Neutral", s: "Friendly, no sass." },
      { id: "corporate", ico: "💼", t: "Corporate-safe", s: "Workplace-friendly copy." },
    ];
    return el("div", { class: "screen on" },
      el("h1", { class: "display" }, "PICK A TONE"),
      el("p", { class: "sub" }, "How the app talks to you and the crew. Change anytime in Profile."),
      el("div", { class: "grid2" }, tones.map((t) => el("div", {
        class: "pick" + ((SoT.state.me.tone || "cheeky") === t.id ? " on" : ""),
        onclick: () => { sfx("tap"); SoT.setMe({ tone: t.id }); render(); },
      }, el("div", { class: "p-ico" }, t.ico), el("div", { class: "p-name" }, t.t), el("div", { class: "p-sub" }, t.s)))),
      el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
        el("button", { class: "btn", onclick: () => {
          sfx("primary");
          SoT.setMe({ onboarded: true });
          SoT.state.onboarded = true; SoT.save();
          const h = (location.hash || "").startsWith("#join=") ? location.hash.slice(6) : null;
          if (h) { App.join = { code: h.toUpperCase(), step: "enter" }; go("join"); }
          else go("start");
        } }, "Done")));
  }

  function scrStart() {
    const groups = Object.values(SoT.state.groups);
    const list = groups.length
      ? el("div", null,
          el("h3", { class: "row" }, "Your groups"),
          groups.map((g) => el("div", {
            class: "card tight", style: "cursor:pointer",
            onclick: () => { sfx("tap"); SoT.state.activeGroupId = g.id; SoT.save(); App.tab = "battle"; render(); },
          },
            el("div", { style: "display:flex;align-items:center;gap:10px" },
              el("div", { class: "avatar sm", style: "background:" + g.color }, g.icon),
              el("div", { style: "flex:1" },
                el("div", { style: "font-weight:700" }, g.name),
                el("div", { class: "tiny" }, SoT.curSeasonOf(g) ? SoT.curSeasonOf(g).label + " · live" : "season ended")),
              el("span", { class: "chip" }, g.members.length + " players")))))
      : null;
    return el("div", { class: "screen on" },
      el("h1", { class: "display" }, "JOIN THE BATTLE.", el("br"), el("span", { class: "gold-t" }, "WIN THE DAY.")),
      el("p", { class: "sub" }, "Start a crew or jump into one with a code."),
      el("button", { class: "btn", style: "margin-bottom:12px", onclick: () => { sfx("primary"); startWizard(); } }, "⚔️ Create a group"),
      el("button", { class: "btn purple", onclick: () => { sfx("primary"); App.join = { code: "", step: "enter" }; go("join"); } }, "🎟️ Join with a code"),
      el("button", { class: "btn ghost", style: "margin-top:10px", onclick: () => { sfx("deal"); jumpToDemo(); } }, "⚡ Watch a live demo battle", el("span", { class: "demo-chip" }, "demo")),
      list);
  }

  /* ══ JOIN FLOW (§4.2) ═════════════════════════════════════════════ */
  function scrJoin() {
    const J = App.join;
    if (J.step === "enter") {
      const inp = el("input", { type: "text", placeholder: "6-letter code", maxlength: "6", value: J.code || "", style: "text-transform:uppercase;text-align:center;font-family:var(--display);font-size:28px;letter-spacing:.2em" });
      setTimeout(() => inp.focus(), 60);
      return el("div", { class: "screen on" },
        el("h1", { class: "display" }, "ENTER INVITE CODE"),
        el("p", { class: "sub" }, "Got a code or deep link from the creator? Drop it in."),
        el("div", { class: "card" }, inp),
        el("button", { class: "btn", onclick: () => {
          const code = inp.value.trim().toUpperCase();
          const g = SoT.groupByCode(code);
          if (!g) { sfx("error"); toast("No group with that code on this device"); return; }
          sfx("primary"); J.code = code; J.step = "preview"; render();
        } }, "Preview group"),
        el("button", { class: "btn ghost", style: "margin-top:10px", onclick: () => { sfx("tap"); go("start"); } }, "Back"));
    }
    if (J.step === "preview") {
      const g = SoT.groupByCode(J.code);
      if (!g) { J.step = "enter"; return scrJoin(); }
      const s = SoT.curSeasonOf(g);
      const days = g.activeDays.map((d) => SoT.DAY_NAMES[d]).join(" · ");
      const rows = [
        ["Mode", g.mode === "team" ? "Team battle" : "Individual"],
        ["Battle days", days],
        ["Daily target", g.target + " adjusted reps"],
        ["Season", s ? s.label + " (weekly)" : "Weekly"],
        ["Players", g.members.length + " in the crew"],
      ];
      return el("div", { class: "screen on" },
        el("h1", { class: "display" }, g.name.toUpperCase()),
        el("p", { class: "sub" }, "Check the rules before you commit."),
        el("div", { class: "card" }, rows.map((r) => el("div", { class: "toggle-row" },
          el("span", { class: "t-sub", style: "text-transform:uppercase;letter-spacing:.12em" }, r[0]),
          el("span", { class: "t-name" }, r[1])))),
        g.stake.type !== "none" ? el("div", { class: "card purple" },
          el("h2", { class: "display", style: "font-size:18px" }, "STAKE — " + stakeName(g.stake.type).toUpperCase()),
          el("p", { class: "sub", style: "margin:6px 0 0" }, stakeBlurb(g))) : null,
        el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
          g.stake.type === "charity" ? el("button", { class: "btn purple", onclick: () => { sfx("primary"); J.step = "stake"; render(); } }, "Review stake →") :
            el("button", { class: "btn", onclick: () => { sfx("primary"); acceptJoin(); } }, "I'm in — accept rules")));
    }
    if (J.step === "stake") {
      const g = SoT.groupByCode(J.code);
      const fee = Math.round(g.stake.perPersonCents * (g.stake.feePct / 100));
      return el("div", { class: "screen on" },
        el("h1", { class: "display" }, "CHARITY POT"),
        el("div", { class: "card purple" },
          el("div", { class: "stat-grid" },
            el("div", { class: "stat-box" }, el("div", { class: "v" }, money(g.stake.perPersonCents)), el("div", { class: "l" }, "Your contribution")),
            el("div", { class: "stat-box" }, el("div", { class: "v" }, g.stake.feePct + "%"), el("div", { class: "l" }, "Disclosed platform fee"))),
          el("p", { class: "sub", style: "margin:12px 2px 0" }, `You contribute ${money(g.stake.perPersonCents)} to the season pot (plus ${money(fee)} disclosed platform fee). No cash to the winner — the winner directs the pot to an eligible charity of their choice.`)),
        el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
          el("button", { class: "btn purple", onclick: () => { sfx("pot"); acceptJoin(); } }, `Agree & contribute ${money(g.stake.perPersonCents + fee)}`)));
    }
    if (J.step === "done") {
      const g = SoT.groupByCode(J.code);
      return el("div", { class: "screen on", style: "text-align:center;padding-top:80px" },
        el("div", { class: "ex-ill" }, "⚔️"),
        el("h1", { class: "display" }, "YOU'RE IN"),
        el("p", { class: "sub" }, "Welcome to " + (g ? g.name : "the crew") + ". The battle is on Home."),
        el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
          el("button", { class: "btn", onclick: () => { sfx("primary"); App.tab = "battle"; go("app"); } }, "To the battle")));
    }
    function acceptJoin() {
      const r = SoT.joinByCode(App.join.code);
      if (r.error) { sfx("error"); toast(r.error); return; }
      const g = r.group;
      if (g.stake.type === "charity") SoT.agreeStake(g.id, SoT.state.me.id);
      App.join.step = "done"; render();
    }
    return el("div", { class: "screen on" });
  }

  function stakeName(t) { return { none: "No stake", dinner: "Dinner", dare: "Dare", deliverable: "Deliverable", charity: "Charity pot" }[t] || t; }
  function stakeBlurb(g) {
    const s = g.stake;
    if (s.type === "dinner") return `Loser shouts the meal${s.description ? " — " + s.description : ""}. Cap ${money(s.capCents)}.`;
    if (s.type === "dare") return `The dare is locked before the season: "${s.dareText}". No negotiating after losing.`;
    if (s.type === "deliverable") return `Loser owes a favour: ${s.description}.`;
    if (s.type === "charity") return `Everyone contributes ${money(s.perPersonCents)}; the winner directs the whole pot to charity (${s.feePct}% disclosed platform fee).`;
    return "Nothing on the line but pride.";
  }

  /* ══ CREATE WIZARD (§4.1 condensed) ═══════════════════════════════ */
  const WIZ_STEPS = ["mode", "identity", "invite", "days", "target", "handicap", "exercises", "season", "stake", "powerups", "review"];
  function startWizard() {
    App.wiz = {
      step: 0, mode: "individual", name: "", icon: "⚡", color: SoT.COLORS[0],
      houseCrew: true, activeDays: [1, 2], target: 200, clockMode: "duration", durationMin: 1,
      tiers: {}, exercises: SoT.EXERCISES.map((e) => e.id),
      seasonLength: "weekly", stake: { type: "charity", perPersonCents: 1000, feePct: 5, description: "", dareText: "", capCents: 8000 },
      // the full card stack is on by default; shield_bash stays opt-in
      powerUps: Object.fromEntries(Object.values(SoT.CARDS).map((c) => [c.id, c.id !== "shield_bash"])),
    };
    go("create");
  }

  function scrCreate() {
    const w = App.wiz;
    const step = WIZ_STEPS[w.step];
    const bodies = {
      mode: () => [
        el("h1", { class: "display" }, "CHOOSE YOUR", el("br"), "BATTLE MODE"),
        el("p", { class: "sub" }, "Daily play feels identical either way — this changes who you're measured against."),
        el("div", { class: "grid2" },
          pickCard(w.mode === "individual", "💪", "Individual", "Every player for themselves", () => { w.mode = "individual"; rerender(); }),
          pickCard(w.mode === "team", "🤝", "Team", "2+ a side, personal targets stay", () => { w.mode = "team"; rerender(); })),
        el("div", { class: "pick", style: "opacity:.45;margin-top:10px;text-align:center" },
          el("div", { class: "p-name" }, "🏢 Corporate"), el("div", { class: "p-sub" }, "Team engine + safe tone — via the ops console, soon")),
      ],
      identity: () => {
        const inp = el("input", { type: "text", placeholder: "e.g. Lunchtime Legends", maxlength: "26", value: w.name, oninput: (e) => { w.name = e.target.value; } });
        return [el("h1", { class: "display" }, "NAME THE CREW"),
          el("div", { class: "card" }, el("label", { class: "f" }, "Group name"), inp),
          el("label", { class: "f" }, "Badge"),
          el("div", { class: "grid3" }, ["⚡", "🔥", "🐺", "🦈", "🏔️", "👑"].map((ic) =>
            el("div", { class: "pick" + (w.icon === ic ? " on" : ""), style: "padding:12px", onclick: () => { w.icon = ic; rerender(); } }, el("div", { class: "p-ico" }, ic)))),
          el("label", { class: "f" }, "Colour"),
          el("div", { class: "grid3" }, SoT.COLORS.map((c) =>
            el("div", { class: "pick", style: "padding:10px", onclick: () => { w.color = c; rerender(); } },
              el("div", { class: "avatar sm", style: "background:" + c + ";margin:0 auto" }, ic0()))))];
        function ic0() { return w.icon; }
      },
      invite: () => [
        el("h1", { class: "display" }, "INVITE THE CREW"),
        el("p", { class: "sub" }, "Share the code after setup — or add the house crew now so the board is alive from day one."),
        el("div", { class: "card gold" },
          el("div", { class: "toggle-row" },
            el("div", null, el("div", { class: "t-name" }, "Add demo house crew"),
              el("div", { class: "t-sub" }, "Three practice rivals — Marco, Priya, Jack")),
            switchEl(w.houseCrew, (v) => { w.houseCrew = v; }))),
        el("p", { class: "tiny" }, "A deep link + QR join card lands on the lobby screen once the group is created."),
      ],
      days: () => [
        el("h1", { class: "display" }, "BATTLE DAYS"),
        el("p", { class: "sub" }, "Which days does the crew battle? Missed days are safe — no penalty on rest days."),
        el("div", { class: "grid3" }, [1, 2, 3, 4, 5, 6, 0].map((d) =>
          el("div", { class: "pick" + (w.activeDays.includes(d) ? " on" : ""), onclick: () => {
            const i = w.activeDays.indexOf(d);
            if (i >= 0) { if (w.activeDays.length > 1) w.activeDays.splice(i, 1); }
            else w.activeDays.push(d);
            sfx("tap"); rerender();
          } }, el("div", { class: "p-name" }, SoT.DAY_NAMES[d])))),
        el("p", { class: "tiny", style: "margin-top:10px" }, `${w.activeDays.length} battle day${w.activeDays.length === 1 ? "" : "s"} per week · ${w.activeDays.length} battles per season`),
      ],
      target: () => [
        el("h1", { class: "display" }, "DAILY TARGET"),
        el("p", { class: "sub" }, "Working baseline is 200 adjusted reps — first eligible player to target takes the Daily Win."),
        el("div", { class: "card gold", style: "text-align:center" },
          el("div", { class: "hero-target", style: "font-size:64px" }, String(w.target)),
          el("div", { class: "tiny" }, "adjusted reps to win the day"),
          el("div", { class: "btn-row", style: "margin-top:14px" },
            el("button", { class: "btn ghost sm", onclick: () => { w.target = Math.max(50, w.target - 25); sfx("tap"); rerender(); } }, "−25"),
            el("button", { class: "btn ghost sm", onclick: () => { w.target = Math.min(500, w.target + 25); sfx("tap"); rerender(); } }, "+25"),
            w.target !== 200 ? el("button", { class: "btn sm", onclick: () => { w.target = 200; sfx("tap"); rerender(); } }, "Reset 200") : null)),
        el("h3", { class: "row" }, "Battle clock"),
        el("div", { class: "seg" },
          el("button", { class: w.clockMode === "window" ? "on" : "", onclick: () => { w.clockMode = "window"; rerender(); } }, "All day → 10pm"),
          el("button", { class: w.clockMode === "duration" ? "on" : "", onclick: () => { w.clockMode = "duration"; rerender(); } }, "Sprint")),
        w.clockMode === "duration" ? el("div", { class: "card tight", style: "margin-top:10px" },
          el("div", { class: "toggle-row" },
            el("div", null, el("div", { class: "t-name" }, "Sprint length"), el("div", { class: "t-sub" }, "minutes per battle day — next day starts when one ends")),
            el("input", { type: "number", min: "1", max: "720", value: String(w.durationMin), style: "width:86px;text-align:center", onchange: (e) => { w.durationMin = Math.max(1, Math.min(720, parseInt(e.target.value) || 1)); } }))) : null,
      ],
      handicap: () => {
        const me = SoT.state.me;
        const house = w.houseCrew ? [{ name: "Marco", tier: "casual" }, { name: "Priya", tier: "fit" }, { name: "Jack", tier: "couch" }] : [];
        const roster = [{ name: me.name, tier: w.tiers[me.id] || me.tier || "fit", me: true }].concat(house);
        return [el("h1", { class: "display" }, "HANDICAP REVIEW"),
          el("p", { class: "sub" }, "The multiplier changes what a rep is WORTH — fitter players' reps count for less, so effort is comparable."),
          el("div", { class: "card" }, roster.map((r, i) => {
            const cur = SoT.tierOf(r.tier);
            const need = Math.round(w.target / cur.mult);
            return el("div", { class: "toggle-row", style: r.me ? "background:rgba(245,196,69,.05);border-radius:12px;padding-left:8px" : "" },
              el("div", { style: "flex:1" },
                el("div", { class: "t-name" }, r.name + (r.me ? " (you)" : "")),
                el("div", { class: "t-sub" }, `×${cur.mult} — needs ~${need} physical reps for ${w.target}`)),
              r.me ? el("select", { style: "width:112px", onchange: (e) => { w.tiers[me.id] = e.target.value; SoT.setMe({ tier: e.target.value }); rerender(); } },
                SoT.TIERS.map((t) => el("option", { value: t.id, selected: t.id === r.tier ? "" : null }, t.label + " ×" + t.mult))) :
                el("span", { class: "chip" }, cur.label));
          })),
          el("p", { class: "tiny" }, "Exact calibration formula is still open (SOT Q217-221) — tiers ship now, calibrate later.")];
      },
      exercises: () => [
        el("h1", { class: "display" }, "EXERCISE LIBRARY"),
        el("p", { class: "sub" }, "The stock dozen + timed holds, with variants. Toggle what's allowed."),
        el("div", { class: "card" }, SoT.EXERCISES.map((ex) => el("div", { class: "toggle-row" },
          el("div", { style: "flex:1" }, el("div", { class: "t-name" }, ex.icon + " " + ex.name),
            el("div", { class: "t-sub" }, ex.variants)),
          switchEl(w.exercises.includes(ex.id), (v) => {
            const i = w.exercises.indexOf(ex.id);
            if (v && i < 0) w.exercises.push(ex.id);
            if (!v && i >= 0 && w.exercises.length > 1) w.exercises.splice(i, 1);
          }, ex.id + "-ex")))),
      ],
      season: () => [
        el("h1", { class: "display" }, "SEASON LENGTH"),
        el("div", { class: "grid2" },
          pickCard(w.seasonLength === "weekly", "📅", "Weekly", "Rapid resets — the default", () => { w.seasonLength = "weekly"; rerender(); }),
          pickCard(w.seasonLength === "monthly", "🗓️", "Monthly", "Longer war for settled crews", () => { w.seasonLength = "monthly"; rerender(); })),
        el("p", { class: "tiny" }, `A weekly season = ${w.activeDays.length} battles. 1 Daily Win = 1 season point.`),
        el("h3", { class: "row" }, "Stake — what's on the line at season end"),
        el("div", { class: "seg", style: "flex-wrap:wrap" },
          ["none", "dinner", "dare", "deliverable", "charity"].map((t) =>
            el("button", { class: w.stake.type === t ? "on" : "", onclick: () => { w.stake.type = t; sfx("tap"); rerender(); } }, stakeName(t)))),
      ],
      stake: () => {
        const s = w.stake;
        if (s.type === "none") return [el("h1", { class: "display" }, "NO STAKE"), el("p", { class: "sub" }, "Pride only. You can add a stake when the next season starts."),];
        if (s.type === "dinner") { const inp = el("input", { type: "text", value: s.description || "Loser shouts the post-season dinner", oninput: (e) => { s.description = e.target.value; } });
          return [el("h1", { class: "display" }, "DINNER STAKE"),
            el("p", { class: "sub" }, "Season loser pays for the agreed meal."),
            el("div", { class: "card" }, el("label", { class: "f" }, "Meal description"), inp,
              el("label", { class: "f" }, "Spend cap"), el("input", { type: "number", value: String(s.capCents / 100), oninput: (e) => { s.capCents = Math.max(0, (parseFloat(e.target.value) || 0) * 100); } }))]; }
        if (s.type === "dare") { const inp = el("textarea", { rows: "3", oninput: (e) => { s.dareText = e.target.value; } }, s.dareText || "");
          return [el("h1", { class: "display" }, "THE DARE"),
            el("p", { class: "sub" }, "Locked in BEFORE the season. It cannot be negotiated after losing."),
            el("div", { class: "card" }, el("label", { class: "f" }, "Dare — write it down"), inp),
            el("p", { class: "tiny" }, "Keep it safe and legal — silly, not savage.")]; }
        if (s.type === "deliverable") { const inp = el("input", { type: "text", value: s.description || "Car wash + coffee run for the whole crew", oninput: (e) => { s.description = e.target.value; } });
          return [el("h1", { class: "display" }, "DELIVERABLE"),
            el("p", { class: "sub" }, "A practical favour the loser owes."),
            el("div", { class: "card" }, el("label", { class: "f" }, "The favour"), inp)]; }
        // charity
        return [el("h1", { class: "display" }, "CHARITY POT"),
          el("p", { class: "sub" }, "The preferred money mechanic: everyone contributes, the winner directs the pot to charity. No cash to the winner."),
          el("div", { class: "card purple" },
            el("label", { class: "f" }, "Contribution per player"),
            el("div", { class: "seg", style: "margin-bottom:12px" }, [500, 1000, 2000].map((c) =>
              el("button", { class: s.perPersonCents === c ? "on" : "", onclick: () => { s.perPersonCents = c; sfx("tap"); rerender(); } }, money(c)))),
            el("div", { class: "toggle-row" },
              el("div", null, el("div", { class: "t-name" }, "Disclosed platform fee"), el("div", { class: "t-sub" }, "covers payment processing")),
              el("span", { class: "chip gold" }, s.feePct + "%"))),
          el("p", { class: "tiny" }, "Contributions are agreed up-front; the pot resolves at season end (SOT §4.15).")];
      },
      powerups: () => [
        el("h1", { class: "display" }, "CARD SETTINGS"),
        el("p", { class: "sub" }, "The canon four are on by default. Every other card in the stack is yours to toggle — the deal only deals what's on."),
        el("div", { class: "card" }, Object.values(SoT.CARDS).map((c) => el("div", { class: "toggle-row" },
          el("div", { style: "flex:1" },
            el("div", { class: "t-name" }, (c.icon || "🃏") + " " + c.name + (c.canon ? el("span", { class: "chip gold", style: "margin-left:7px" }, "canon") : "")),
            el("div", { class: "t-sub" }, c.blurb)),
          switchEl(w.powerUps[c.id], (v) => { w.powerUps[c.id] = v; }, c.id + "-pu")))),
        el("p", { class: "tiny" }, "Each battle day opens with a deal — three cards face-down, pick one. Cross 50% of target and you earn a bonus deal. Hold up to 3."),
      ],
      review: () => [
        el("h1", { class: "display" }, "REVIEW & CREATE"),
        el("div", { class: "card" }, [
          ["Crew", (w.name || "Untitled") + " " + w.icon],
          ["Mode", w.mode === "team" ? "Team" : "Individual"],
          ["Battle days", w.activeDays.map((d) => SoT.DAY_NAMES[d]).join(" · ")],
          ["Daily target", w.target + " adjusted reps · " + (w.clockMode === "window" ? "all day → 10pm" : w.durationMin + "-minute sprints")],
          ["Season", w.seasonLength + " · " + w.activeDays.length + " battles"],
          ["Stake", stakeName(w.stake.type)],
          ["Power-ups", Object.keys(w.powerUps).filter((k) => w.powerUps[k]).length + " cards enabled"],
          ["Crew size", (w.houseCrew ? 4 : 1) + " players"],
        ].map((r) => el("div", { class: "toggle-row" },
          el("span", { class: "t-sub", style: "text-transform:uppercase;letter-spacing:.12em" }, r[0]),
          el("span", { class: "t-name", style: "text-align:right" }, r[1])))),
        el("button", { class: "btn", onclick: () => { finishWizard(); } }, "⚔️ Create the group"),
      ],
    };
    const isStakeSub = step === "stake" && w.stake.type !== "none";
    const title = { stake: isStakeSub ? null : null }[step];
    const kids = bodies[step]();
    const footer = el("div", { style: "position:absolute;bottom:34px;left:16px;right:16px" },
      el("div", { class: "btn-row" },
        el("button", { class: "btn ghost", onclick: () => { sfx("tap"); if (w.step === 0) go("start"); else { w.step--; render(); } } }, "Back"),
        step === "review" ? el("div", { style: "flex:1" }) : el("button", { class: "btn", onclick: () => {
          sfx("primary");
          if (step === "identity" && !w.name.trim()) { toast("Name the crew first"); sfx("error"); return; }
          w.step++; render();
        } }, "Next")));
    return el("div", { class: "screen on" },
      el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px" },
        el("span", { class: "chip gold" }, `STEP ${w.step + 1}/${WIZ_STEPS.length}`), el("span", { class: "tiny" }, step.toUpperCase())),
      kids, footer);
    function rerender() { render(); }
  }

  function pickCard(on, ico, name, sub, onclick) {
    return el("div", { class: "pick" + (on ? " on" : ""), onclick }, el("div", { class: "p-ico" }, ico), el("div", { class: "p-name" }, name), el("div", { class: "p-sub" }, sub));
  }
  function switchEl(onVal, onChange, id) {
    const i = el("i");
    const inp = el("input", { type: "checkbox" });
    if (id) inp.id = id;
    inp.checked = !!onVal;
    inp.addEventListener("change", () => { sfx("tap"); onChange(inp.checked); });
    return el("label", { class: "switch" }, inp, i);
  }

  function finishWizard() {
    const w = App.wiz;
    sfx("deal");
    const g = SoT.createGroup({
      mode: w.mode, name: w.name.trim() || "The Crew", icon: w.icon, color: w.color,
      activeDays: w.activeDays, seasonLength: w.seasonLength, target: w.target, clockMode: w.clockMode, durationMin: w.durationMin,
      exerciseIds: w.exercises, stake: w.stake, powerUps: w.powerUps,
      housePlayers: w.houseCrew ? [{ name: "Marco", tier: "casual" }, { name: "Priya", tier: "fit" }, { name: "Jack", tier: "couch" }] : [],
      teams: w.mode === "team" ? [
        { id: "t1", name: "Gold Coasters", color: "#f5c445", memberIds: [] },
        { id: "t2", name: "Purple Rain", color: "#a06bff", memberIds: [] },
      ] : [],
    });
    if (g.stake.type === "charity") SoT.agreeStake(g.id, SoT.state.me.id);
    App.wiz = null;
    App.overlay = { kind: "created", groupId: g.id };
    App.view = "app"; App.tab = "battle";
    render();
  }

  /* ══ NAV SHELL ════════════════════════════════════════════════════ */
  function navShellWrap(content) {
    const snap = SoT.snapshot();
    const wrap = el("div", null);
    // connection shim surface (#103/#104): banner leads the page, queued
    // count rides the central LOG button
    if (Conn.mode !== "online") {
      wrap.append(el("div", { class: "banner " + (Conn.mode === "offline" ? "offline" : "info reconn"), id: "conn-banner", role: "status" },
        el("span", { style: "font-size:18px;flex:none" }, Conn.mode === "offline" ? "📴" : "🛰️"),
        el("span", null, Conn.mode === "offline"
          ? [el("b", null, "OFFLINE — you can keep logging."), " Sets queue on this device and sync the moment you're back.",
            Conn.queue.length ? el("span", { class: "conn-n" }, ` ${Conn.queue.length} queued`) : null]
          : [el("b", null, "RECONNECTING…"), " picking up where you left off."])));
    }
    wrap.append(content);
    const logBtn = el("button", { class: "log-btn", onclick: () => tab("log"), "aria-label": "Log reps" }, "LOG");
    if (Conn.queue.length) logBtn.append(el("span", { class: "queue-badge", id: "queue-badge", title: "queued sets waiting to sync" }, String(Conn.queue.length)));
    wrap.append(el("nav", { class: "nav" },
      navTab("battle", "⚔️", "Battle"),
      navTab("feed", "📻", "Feed"),
      logBtn,
      navTab("powerups", "🃏", "Power-Ups"),
      navTab("profile", "👤", "Profile")));
    return wrap;
    function navTab(id, ico, label) {
      return el("button", { class: "tab" + (App.tab === id ? " on" : ""), onclick: () => tab(id) },
        el("span", { class: "t-ico" }, ico), label);
    }
  }

  /* ══ BATTLE HOME (#91) ════════════════════════════════════════════ */
  function scrBattle() {
    const snap = SoT.snapshot();
    if (!snap) return el("div", { class: "screen on" }, el("p", { class: "sub" }, "No group."));
    const { group: g, season: s, battle: b, board, myRow, clock, me } = snap;
    const scr = el("div", { class: "screen on" });

    // top bar
    scr.append(el("div", { class: "topbar" },
      el("div", { class: "avatar sm", style: "background:" + g.color }, g.icon),
      el("div", { style: "flex:1;min-width:0" },
        el("div", { class: "g-name", style: "white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, g.name),
        el("div", { class: "g-sub" }, s ? `${s.label} · battle ${b ? b.idx : "?"}/${s.battles.length} · ${b ? b.dayName : ""}` : "no active season")),
      el("button", { class: "icon-btn", title: "Season hub", onclick: () => { sfx("tap"); App.seasonView = true; render(); } }, "🏆"),
      el("button", { class: "icon-btn", title: "Mute", onclick: () => { try { window.rwfSfx && window.rwfSfx.toggle && window.rwfSfx.toggle(); } catch (e) {} toast(window.rwfSfx && window.rwfSfx.isMuted && window.rwfSfx.isMuted() ? "Sound off" : "Sound on"); render(); } }, (() => { try { return window.rwfSfx && window.rwfSfx.isMuted && window.rwfSfx.isMuted() ? "🔇" : "🔊"; } catch (e) { return "🔊"; } })())));

    if (!s) {
      // no active season — offer the next one
      const last = g.seasons[g.seasons.length - 1];
      scr.append(el("div", { class: "card gold", style: "text-align:center" },
        el("div", { class: "ex-ill", style: "margin:10px 0" }, last ? "🏁" : "⚔️"),
        el("h2", { class: "display" }, last ? "SEASON OVER" : "NO SEASON YET"),
        el("p", { class: "sub" }, last ? `${last.label} is in the books.` : "Start the first season when the crew is ready."),
        el("button", { class: "btn", onclick: () => { sfx("deal"); SoT.startNextSeason(g.id); render(); } }, "Start next season")));
      scr.append(recapList(snap));
      return scr;
    }

    if (b && b.status === "scheduled") {
      const wait = Math.max(0, (b.startMs || 0) - Date.now());
      const rest = wait > 3 * 3600_000; // a real gap → today is a rest day (#101)
      if (rest) {
        // REST-DAY HOME (#29) — no battle today: streak-safe messaging,
        // the next battle day, and the season still one tap away
        const streak = me ? me.streak : 0;
        const doneSoFar = s.battles.filter((x) => x.status === "ended").length;
        scr.append(el("div", { class: "card gold rest-home", id: "rest-day" },
          el("div", { class: "ex-ill", style: "margin:14px 0 6px" }, "🛌"),
          el("h2", { class: "display", style: "text-align:center" }, "REST DAY"),
          el("p", { class: "sub", style: "text-align:center" },
            `No battle today — ${streak > 0 ? `your 🔥 ${streak}-day streak is SAFE on rest days.` : "rest days never touch your streak."}`),
          el("div", { class: "card tight", style: "background:var(--card2);margin:14px 0" },
            el("div", { class: "toggle-row" },
              el("span", { class: "t-sub" }, "Next battle"),
              el("span", { class: "t-name gold-t" }, `${b.dayName} · battle ${b.idx}`)),
            el("div", { class: "toggle-row" },
              el("span", { class: "t-sub" }, "Opens in"),
              el("span", { class: "t-name" }, fmtMs(wait))),
            el("div", { class: "toggle-row" },
              el("span", { class: "t-sub" }, "Season"),
              el("span", { class: "t-name" }, `${s.label} · ${doneSoFar}/${s.battles.length} battles done`))),
          el("div", { style: "display:flex;gap:8px;justify-content:center;flex-wrap:wrap" },
            el("span", { class: "chip gold" }, "🔥 streak " + streak),
            el("span", { class: "chip" }, SoT.tierOf(me ? me.tier : "fit").label + " ×" + SoT.tierOf(me ? me.tier : "fit").mult)),
          el("button", { class: "btn ghost sm", style: "margin-top:12px", onclick: () => { sfx("tap"); App.seasonView = true; render(); } }, "Season hub →"),
          el("p", { class: "tiny", style: "text-align:center;margin:10px 0 0" }, "Recovery is part of the game. See you " + b.dayName + ".")));
        // a just-finished battle stays framed against the season (#102)
        const lastEnded0 = s.battles.filter((x) => x.status === "ended").slice(-1)[0];
        if (lastEnded0) scr.append(battleCompleteCard(snap, lastEnded0, b));
        scr.append(recapList(snap));
        return scr;
      }
      scr.append(el("div", { class: "card purple", style: "text-align:center" },
        el("div", { class: "ex-ill", style: "margin:10px 0" }, "⏳"),
        el("h2", { class: "display" }, "BATTLE " + b.idx + " STARTS SOON"),
        el("p", { class: "sub" }, `Target ${g.target} adjusted reps · opens in ${fmtMs(wait)}`)));
      const lastEnded1 = s.battles.filter((x) => x.status === "ended").slice(-1)[0];
      if (lastEnded1) scr.append(battleCompleteCard(snap, lastEnded1, b));
      scr.append(leaderboardCard(snap));
      return scr;
    }

    // hero
    const my = myRow || { adjusted: 0, dayTarget: g.target, pct: 0, remaining: g.target };
    const ringSize = 116, r = 48, circ = 2 * Math.PI * r;
    const dash = (Math.min(1, my.pct) * circ).toFixed(1);
    const bombAdd = my.dayTarget - g.target;
    scr.append(el("div", { class: "card gold" },
      el("div", { class: "hero" },
        el("div", { class: "ring" },
          el("svg", { width: ringSize, height: ringSize, viewBox: "0 0 116 116" },
            el("circle", { cx: 58, cy: 58, r: String(r), fill: "none", stroke: "#1d1d2c", "stroke-width": "10" }),
            el("circle", { id: "hero-ring", cx: 58, cy: 58, r: String(r), fill: "none", stroke: "url(#goldgrad)", "stroke-width": "10", "stroke-linecap": "round", "stroke-dasharray": dash + " " + circ }),
            el("defs", null, el("linearGradient", { id: "goldgrad" },
              el("stop", { offset: "0%", "stop-color": "#f5c445" }), el("stop", { offset: "100%", "stop-color": "#fbe08a" })))),
          el("div", { class: "num" }, el("div", { class: "big", id: "hero-adj" }, String(my.adjusted)), el("div", { class: "pct" }, "REPS"))),
        el("div", { class: "hero-info" },
          el("div", { class: "hero-target" }, String(my.dayTarget), el("small", null, " TO WIN")),
          el("div", { class: "hero-remaining" }, my.completed
            ? el("span", { class: "gold-t" }, b.winnerId === me.id ? "🏆 DAILY WIN secured" : "✓ day banked")
            : el("span", null, "You need ", el("b", null, String(my.remaining)), " more reps")),
          el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-top:9px" },
            el("span", { class: "chip gold" }, "🔥 streak " + (me ? me.streak : 0)),
            el("span", { class: "chip" }, SoT.tierOf(me ? me.tier : "fit").label + " ×" + SoT.tierOf(me ? me.tier : "fit").mult),
            bombAdd > 0 ? el("span", { class: "chip bad" }, "💣 +" + bombAdd + " bombed") : null)))));

    // MY HAND (v4.1): the cards I'm holding, small poster glyphs
    const myHand = (snap.me && snap.me.inventory) || [];
    if (myHand.length) {
      scr.append(el("div", { class: "hand-strip", id: "my-hand" },
        el("span", { class: "tiny", style: "align-self:center" }, "HAND"),
        myHand.map((k) => {
          const c = SoT.CARDS[k];
          return el("span", { class: "hand-chip rarity-" + (c ? c.rarity : "common"), title: c ? c.name : k, onclick: () => { sfx("tap"); App.overlay = { kind: "card", cardId: k }; render(); } },
            (c && c.icon) + " " + (c ? c.name : k));
        })));
    }

    // a pending deal of mine — one tap to the sheet (reopen after "Later")
    if (snap.myDraft && !App.overlay) {
      scr.append(el("div", { class: "card gold tight deal-waiting", style: "cursor:pointer", onclick: () => { sfx("deal"); App.overlay = { kind: "deal" }; render(); } },
        el("div", { style: "display:flex;align-items:center;gap:10px" },
          el("span", { style: "font-size:22px" }, "🃏"),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700" }, "Your deal is waiting"),
            el("div", { class: "tiny" }, snap.myDraft.reason === "halfway" ? "Bonus deal earned — halfway there" : "Three cards on the table — pick one")),
          el("span", { class: "chip gold" }, "Pick 1 of 3"))));
    }

    // WINNER-KNOWN TRANSITION (#102, live half): the Daily Win is decided,
    // the battle rolls on — tomorrow framing + bank-your-day push
    if (b.winnerId && b.status === "live") {
      const w = g.members.find((m) => m.id === b.winnerId);
      const isMe = w && me && w.id === me.id;
      const nxt = s.battles.find((x) => x.status === "scheduled");
      scr.append(el("div", { class: "card purple tight", id: "win-known" },
        el("div", { style: "display:flex;align-items:center;gap:10px" },
          el("span", { style: "font-size:22px" }, isMe ? "🏆" : "🎖️"),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700" }, isMe ? "You took the Daily Win" : (w ? w.name.split(" ")[0] : "Someone") + " took the Daily Win"),
            el("div", { class: "tiny" }, my.completed ? "Your day is banked — streak safe." : "The battle rolls on — bank your own day."),
            el("div", { class: "tiny", style: "color:var(--purple-hi)" }, nxt
              ? `Tomorrow's angle: battle ${nxt.idx} (${nxt.dayName}) is next — season points still live.`
              : "That was the final battle — the season resolves at the close."))),
        !my.completed ? el("button", { class: "btn sm", style: "margin-top:10px", onclick: () => tab("log") }, "Bank my day") : null));
    }

    // clock — Danger Zone ramp: final 3h (warn) → final hour (banner) →
    // final 30m + 10m (dz). Freeze overlays everything while it runs.
    if (clock) {
      const lvl = clock.urgency.level;
      const cb = el("div", { class: "clockbar" + (clock.frozen ? " frozen" : lvl >= 3 ? " dz" : lvl >= 1 ? " warn" : ""), id: "clockbar" },
        el("div", null, el("div", { class: "c-label" }, clock.frozen ? "❄️ CLOCK FROZEN" : "BATTLE CLOCK"),
          el("div", { class: "tiny", id: "clock-urg" }, clock.urgency.label)),
        el("div", { class: "c-time", id: "clock-time" }, clock.frozen ? fmtMs(clock.frozenRemainingMs) : fmtMs(clock.remainingMs)));
      scr.append(cb);
      if (lvl >= 3 && !clock.frozen && !my.completed) {
        scr.append(el("div", { class: "banner dz" }, "🚨", el("span", null, "DANGER ZONE — " + clock.urgency.label.toUpperCase() + ". " + tone("nudge"))));
      } else if (lvl === 2 && !clock.frozen && !my.completed) {
        scr.append(el("div", { class: "banner finalhour" }, "⏳", el("span", null, "FINAL HOUR — " + fmtMs(clock.remainingMs) + " to the target. " + tone("nudge"))));
      } else if (snap.closeCall && !b.winnerId) {
        scr.append(el("div", { class: "banner close-call" }, "⚡", el("span", null, "CLOSE CALL — the lead is under 5%. Anything can happen.")));
      }
      if (snap.streakAtRisk) scr.append(el("div", { class: "banner risk" }, "🔥", el("span", null, `Streak at risk — ${me.streak} on the line today.`)));
      // Surprise Bombs addressed to ME — live fuse (#152)
      const E = SoT.engine;
      for (const bb of (b.core ? b.core.bombs : [])) {
        if (bb.targetId !== me.id || bb.resolved || Date.now() > bb.deadline) continue;
        scr.append(el("div", { class: "banner bomb" }, "💣",
          el("span", null, "BOMB INBOUND — log " + E.SURPRISE_BOMB_RUF + " reps in ",
            el("b", { id: "bomb-t", "data-until": String(bb.deadline) }, fmtMs(bb.deadline - Date.now())),
            " to defuse. Defuse it and the bomb pays YOU +" + E.SURPRISE_BOMB_BONUS_RUF + ".")));
      }
      // a Prove It watching MY next set (v4.1 proof lane)
      for (const p of snap.openProofs || []) {
        if (!p.iAmTarget || p.status !== "awaiting_log") continue;
        scr.append(el("div", { class: "banner proof" }, "📋",
          el("span", null, "PROVE IT — your next set gets checked. Log it and mark ",
            el("b", null, "verified"), ` (camera or timer): honest effort pays YOU +${E.PROVE_IT_BONUS_RUF}. Skip it and the crew accepts or contests.`)));
      }
      // (winner-known banner lives in the #102 card above the clock)
      // active effects
      const fx = activeEffects(snap);
      if (fx.length) scr.append(el("div", { class: "active-fx", style: "margin:10px 0" }, fx));
    }

    // team strip
    if (snap.teams) {
      scr.append(el("div", { class: "card tight" },
        el("h3", { class: "row", style: "margin:2px 2px 8px" }, "TEAM BATTLE"),
        el("div", { class: "grid2" }, snap.teams.map((t) =>
          el("div", { class: "pick" + (t.complete ? " on" : ""), style: "padding:10px" },
            el("div", { class: "p-name", style: "color:" + t.team.color }, t.team.name),
            el("div", { class: "p-sub" }, `${Math.round(t.adjusted)} / ${t.target} · ${t.complete ? "COMPLETE" : Math.round(t.pct * 100) + "%"}`))))));
    }

    scr.append(leaderboardCard(snap));

    // BATTLE COMPLETE, SEASON LIVE (#102): the last finished battle stays
    // framed against the living season while the next one runs — winner +
    // tomorrow transition + the recap. (Replaces the old recap-only strip;
    // the card itself opens the recap.)
    const lastEnded = s.battles.filter((x) => x.status === "ended").slice(-1)[0];
    if (lastEnded && b.idx !== lastEnded.idx) {
      scr.append(battleCompleteCard(snap, lastEnded, b));
    }

    // battle ended → recap + next
    if (b.status === "ended") {
      scr.append(battleCompleteCard(snap, b, null));
    } else {
      scr.append(el("button", { class: "btn", style: "margin-top:4px", onclick: () => tab("log") }, "＋ Log reps"));
    }

    // recent activity strip
    const recent = snap.feed.filter((e) => ["log", "win", "bank", "card", "steal", "bomb", "bomb_defused", "bomb_detonated", "milestone"].includes(e.type)).slice(0, 5);
    if (recent.length) {
      scr.append(el("h3", { class: "row" }, "Recent activity"));
      scr.append(el("div", { class: "strip" }, recent.map((e) => el("div", { class: "s-item" }, e.text))));
    }
    return scr;

    /* #102 card: ended battle vs living season. `ended` = the finished
       battle; `next` = what's on now/next (null on the season finale). */
    function battleCompleteCard(snap2, ended, next) {
      const w = ended.winnerId ? g.members.find((m) => m.id === ended.winnerId) : null;
      const nextLine = next
        ? (next.status === "live"
          ? `Battle ${next.idx} (${next.dayName}) is LIVE now — season points still on the line.`
          : `Tomorrow's angle: battle ${next.idx} (${next.dayName}) opens next — season points still on the line.`)
        : "That was the final day — the season resolves now.";
      return el("div", { class: "card purple tight", id: "battle-complete", style: "cursor:pointer", onclick: () => { sfx("flip"); App.overlay = { kind: "recap", battleIdx: ended.idx }; render(); } },
        el("div", { style: "display:flex;align-items:center;gap:10px" },
          el("span", { style: "font-size:22px" }, w ? "🏆" : "📊"),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700" }, `Battle ${ended.idx} complete — season live`),
            w ? el("div", { class: "tiny", style: "color:var(--gold-hi)" }, `${w.name.split(" ")[0]} won the day · ${Object.keys(ended.completions).length} banked · ${ended.failures.length} missed`) : null,
            el("div", { class: "tiny" }, nextLine)),
          el("span", { class: "chip gold" }, `Battle ${ended.idx} recap`)));
    }
  }

  function activeEffects(snap) {
    const fx = [];
    const b = snap.battle;
    if (!b) return fx;
    const now = Date.now();
    const boltUntil = b.core && b.core.lightning ? b.core.lightning[snap.me.id] || 0 : 0;
    if (boltUntil > now) fx.push(el("span", { class: "fx-pill lightning" }, "⚡ ×3 — ", el("span", { class: "fx-t", "data-until": boltUntil }, fmtMs(boltUntil - now))));
    if (b.frozenUntilMs && now < b.frozenUntilMs) fx.push(el("span", { class: "fx-pill frozen" }, "❄️ frozen ", el("span", { class: "fx-t", "data-until": b.frozenUntilMs }, fmtMs(b.frozenUntilMs - now))));
    if (b.core && b.core.groupShield && b.core.groupShield.consumedAt == null) fx.push(el("span", { class: "fx-pill shield" }, "🛡️ shield up"));
    // card-stack modifiers (v4.1) — all end-of-day unless windowed
    const mods = b.core && b.core.modifiers ? b.core.modifiers[snap.me.id] : null;
    if (mods) {
      if (mods.doubleExerciseId) {
        const ex = SoT.exerciseById(mods.doubleExerciseId);
        fx.push(el("span", { class: "fx-pill stack" }, "🏋️ ×2 " + (ex ? ex.name.toLowerCase() : "exercise") + " · today"));
      }
      if (mods.specialistIds && mods.specialistIds.length) {
        fx.push(el("span", { class: "fx-pill stack" }, "🎯 ×1.5 specialist · today"));
      }
      if (mods.wildcard) fx.push(el("span", { class: "fx-pill stack" }, "🃏 wildcard · today"));
      if (mods.underdog) fx.push(el("span", { class: "fx-pill stack" }, "🐕 ×1.25 underdog · today"));
    }
    const sw = b.core && b.core.secondWinds ? b.core.secondWinds[snap.me.id] : null;
    if (sw && now < sw.until) fx.push(el("span", { class: "fx-pill stack" }, "💨 ×1.5 second wind — ", el("span", { class: "fx-t", "data-until": sw.until }, fmtMs(sw.until - now))));
    return fx;
  }

  function leaderboardCard(snap) {
    const { group: g, battle: b, board } = snap;
    if (!b) return el("div");
    return el("div", { class: "card" },
      el("h3", { class: "row", style: "margin:2px 2px 10px" }, "LIVE LEADERBOARD"),
      el("p", { class: "tiny", style: "margin:-4px 2px 8px" }, b.status === "ended" ? "Final standings — battle " + b.idx : `First to their adjusted target takes the Daily Win. Later finishers still bank the day.`),
      board.map((row, i) => {
        const m = row.member;
        const isMe = snap.me && m.id === snap.me.id;
        return el("div", { class: "lb-row" + (isMe ? " me" : ""), onclick: () => { sfx("tap"); App.overlay = { kind: "player", memberId: m.id }; render(); }, style: "cursor:pointer" },
          el("div", { class: "rank" }, i === 0 && row.isWinner ? el("span", { class: "crown" }, "👑") : String(i + 1)),
          el("div", { class: "avatar sm", style: "background:" + m.color }, m.initials || m.name.slice(0, 2)),
          el("div", { class: "lb-body" },
            el("div", { class: "lb-top" }, el("span", { class: "lb-name" }, m.name + (isMe ? " (you)" : "")),
              el("span", { class: "lb-adj" }, row.adjusted + " / " + row.dayTarget)),
            el("div", { class: "lb-bar" }, el("i", { style: "width:" + Math.min(100, Math.round(row.pct * 100)) + "%" + (isMe ? "" : "") })),
            (row.hand && row.hand.length) ? el("div", { class: "lb-hand" }, row.hand.map((k) => {
              const c = SoT.CARDS[k];
              return el("span", { class: "lb-card rarity-" + (c ? c.rarity : "common"), title: c ? c.name : k }, (c && c.icon) || "🃏");
            })) : null),
          el("div", { class: "lb-right" },
            row.isWinner ? el("div", { class: "win-flag" }, "DAILY WIN") :
              row.completed ? el("div", { class: "bank-flag" }, "✓ BANKED") :
                b.status === "ended" ? el("div", { class: "fail-flag" }, "✗ MISSED") : null));
      }));
  }

  function recapList(snap) {
    const g = snap.group;
    return el("div", null, el("h3", { class: "row" }, "Past battles"),
      el("div", { class: "card tight" }, g.seasons.flatMap((s) => s.battles.map((b) =>
        el("div", { class: "toggle-row" },
          el("span", { class: "t-sub" }, `${s.label} · battle ${b.idx} (${b.dayName})`),
          el("span", { class: "t-name" }, b.winnerId ? "🏆 " + (g.members.find((m) => m.id === b.winnerId) || { name: "?" }).name.split(" ")[0] : "no winner"))))));
  }

  /* ══ FEED ════════════════════════════════════════════════════════ */
  const FEED_ICO = { log: "📝", win: "🏆", bank: "✅", card: "🃏", steal: "🥷", bomb: "💣", bomb_defused: "✂️", bomb_detonated: "💥", milestone: "📈", join: "➕", season_start: "🏁", season_end: "🏁", stake_due: "⚖️", charity_donated: "❤️", recap: "📊", group_created: "⚔️", battle_start: "🔔", undo: "↩️", shield_used: "🛡️", deal: "🎴", deal_pick: "🃏", deal_reroll: "🔄", proof_request: "📋", proof_verified: "📋", proof_review: "⚖️", proof_accepted: "✅", proof_contested: "❌", proof_vote: "🗳️" };
  function scrFeed() {
    const snap = SoT.snapshot();
    const scr = el("div", { class: "screen on" },
      el("h1", { class: "display", style: "font-size:30px" }, "THE FEED"),
      el("p", { class: "sub" }, "Every rep, win, card and proof call in the crew."));
    // GROUP REVIEW CARDS (v4.1): open Prove It / Spot Check reviews ride the
    // top of the feed — the crew accepts or contests, right here
    for (const p of (snap.openProofs || []).filter((x) => x.status === "review")) {
      const tgt = p.targetName;
      const entry = snap.battle && snap.battle.core && snap.battle.core.entries[p.entryIndex];
      const canVote = snap.me && !p.iAmTarget && !p.myVote && snap.battle && snap.battle.status === "live";
      scr.append(el("div", { class: "proof-card", id: "proof-" + p.id },
        el("div", { class: "proof-head" },
          el("span", { class: "p-ico" }, "⚖️"),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700" }, `${tgt}'s set is under review`),
            el("div", { class: "tiny" }, (p.spot ? "Spot check on the leader's biggest set" : "Prove It — unverified set") + (entry ? ` · ${entry.ruf} reps at stake` : "")))),
        el("div", { class: "proof-votes" },
          el("span", { class: "chip live" }, "👍 " + p.accepts + " accept"),
          el("span", { class: "chip bad" }, "👎 " + p.contests + " contest")),
        canVote ? el("div", { class: "proof-actions" },
          el("button", { class: "btn sm", onclick: () => voteOn(p.id, "accept") }, "👍 Accept"),
          el("button", { class: "btn danger sm", onclick: () => voteOn(p.id, "contest") }, "👎 Contest")) :
          el("div", { class: "tiny", style: "margin-top:8px" }, p.iAmTarget ? "Your set — the crew decides." : p.myVote ? "You voted to " + p.myVote + "." : "Settles when the crew has voted (majority) or the day closes."),
        el("div", { class: "tiny", style: "margin-top:6px;color:var(--ink-faint)" }, "Contested sets score 0 — but the day still banks. Never shame; just honesty.")));
    }
    if (!snap.feed.length) scr.append(el("div", { class: "card tight", style: "text-align:center" }, el("p", { class: "sub", style: "margin:6px" }, "Quiet… for now. Log the first set and wake them up.")));
    for (const e of snap.feed) {
      scr.append(el("div", { class: "feed-item" },
        el("div", { class: "f-ico" }, FEED_ICO[e.type] || "•"),
        el("div", { style: "flex:1" },
          el("div", { class: "f-txt" }, e.text),
          el("div", { class: "f-time" }, timeAgo(e.atMs) + (e.battle ? " · battle " + e.battle : "")),
          el("div", { class: "react-row" }, ["🔥", "😂", "👊"].map((emo) =>
            el("button", { class: (e.reactions[emo] ? "tapped" : ""), onclick: () => { sfx("tap"); SoT.react(snap.group.id, e.id, emo); render(); } }, emo + (e.reactions[emo] ? " " + e.reactions[emo] : "")))))));
    }
    return scr;
    function voteOn(proofId, vote) {
      sfx("tap");
      const r = SoT.voteProof(snap.group.id, proofId, snap.me.id, vote);
      if (r.error) { sfx("error"); toast(r.error); return; }
      toast(r.settled ? (r.outcome === "contested" ? "Contested — the set scores 0" : "Accepted — the reps stand") : "Vote in");
      render();
    }
  }

  /* ══ QUICK LOG (#106-118) ════════════════════════════════════════ */
  function openLog() {
    App.logFlow = { step: "sheet", exerciseId: null, amount: 0, buf: "", timerStart: null, secs: 0, verified: null, timerAttested: false };
    App.tab = "log";
  }

  function scrLog() {
    const snap = SoT.snapshot();
    if (!App.logFlow) App.logFlow = { step: "sheet", exerciseId: null, amount: 0, buf: "", timerStart: null, secs: 0, verified: null, timerAttested: false };
    const F = App.logFlow;
    const scr = el("div", { class: "screen on qlog-open" });

    // header context: my progress mini
    const my = snap.myRow || { adjusted: 0, dayTarget: snap.group.target, remaining: snap.group.target };
    scr.append(el("div", { class: "card tight gold" },
      el("div", { style: "display:flex;justify-content:space-between;align-items:center" },
        el("div", null, el("div", { class: "tiny" }, "TODAY"),
          el("div", { class: "display", style: "font-size:22px" }, [String(my.adjusted), el("span", { class: "tiny" }, " / " + my.dayTarget)])),
        el("div", { class: "tiny", style: "text-align:right" }, my.remaining > 0 ? my.remaining + " reps to go" : "target done ✓"))));

    if (F.step === "sheet") {
      const meId = snap.me.id;
      // recents = my last REAL exercises (pseudo-logs like steals/rescues don't count)
      const myLogs = snap.battle && snap.battle.core ? snap.battle.core.entries.filter((l) => l.playerId === meId && SoT.exerciseById(l.exerciseId) && !l.powerUps) : [];
      const recents = [];
      for (const l of myLogs.slice().reverse()) { if (!recents.includes(l.exerciseId)) recents.push(l.exerciseId); if (recents.length >= 3) break; }
      const favs = (SoT.state.me.favourites || []).filter((id) => snap.group.exerciseIds.includes(id));
      if (recents.length) {
        scr.append(el("h3", { class: "row" }, "Recents"));
        scr.append(el("div", { class: "grid3" }, recents.map((id) => { const ex = SoT.exerciseById(id); return exPill(ex, () => pickExercise(id)); })));
      }
      if (favs.length) {
        scr.append(el("h3", { class: "row" }, "Favourites"));
        scr.append(el("div", { class: "grid3" }, favs.map((id) => { const ex = SoT.exerciseById(id); return exPill(ex, () => pickExercise(id)); })));
      }
      scr.append(el("h3", { class: "row" }, "Quick sets"));
      scr.append(el("div", { class: "grid3" }, presetsFor(snap).map((p) =>
        el("div", { class: "preset", onclick: () => { sfx("tap"); F.exerciseId = p.ex; F.amount = p.v; F.step = "confirm"; render(); } },
          el("div", { class: "v" }, String(p.v)), el("div", { class: "l" }, p.label)))));
      scr.append(el("h3", { class: "row" }, "All exercises"));
      scr.append(el("div", { class: "grid2" }, snap.exerciseList.map((ex) => exPill(ex, () => pickExercise(ex.id)))));
    } else if (F.step === "exercise") {
      const ex = SoT.exerciseById(F.exerciseId);
      const tier = SoT.tierOf(snap.me.tier);
      const favs = SoT.state.me.favourites || [];
      scr.append(el("div", { class: "ex-ill" }, ex.icon),
        el("h1", { class: "display", style: "text-align:center;font-size:32px" }, ex.name.toUpperCase()),
        el("p", { class: "sub", style: "text-align:center" }, ex.cues),
        el("div", { class: "card" },
          el("div", { class: "toggle-row" }, el("span", { class: "t-sub" }, "Category"), el("span", { class: "t-name" }, ex.cat)),
          el("div", { class: "toggle-row" }, el("span", { class: "t-sub" }, "Conversion (working)"), el("span", { class: "t-name" }, ex.secsPerRep ? `10 secs = 1 rep × ${ex.value}` : `1 rep × ${ex.value}`)),
          el("div", { class: "toggle-row" }, el("span", { class: "t-sub" }, "Your handicap"), el("span", { class: "t-name gold-t" }, tier.label + " ×" + tier.mult)),
          el("div", { class: "toggle-row" }, el("span", { class: "t-sub" }, "Variations"), el("span", { class: "t-name", style: "text-align:right;font-size:13px" }, ex.variants)),
          el("div", { class: "toggle-row" },
            el("span", { class: "t-sub" }, "Favourite"),
            el("button", { class: "btn sm " + (favs.includes(ex.id) ? "" : "ghost"), onclick: () => {
              sfx("tap");
              const f = SoT.state.me.favourites || [];
              const i = f.indexOf(ex.id);
              if (i >= 0) f.splice(i, 1); else f.push(ex.id);
              SoT.setMe({ favourites: f }); render();
            } }, favs.includes(ex.id) ? "★ Favourited" : "☆ Favourite"))));
      scr.append(el("button", { class: "btn", onclick: () => { sfx("primary"); F.step = "entry"; F.amount = ex.secsPerRep ? 30 : 20; F.buf = ""; render(); } }, "Log a set"));
    } else if (F.step === "entry") {
      const ex = SoT.exerciseById(F.exerciseId);
      if (ex.secsPerRep) {
        // timed movement
        const tEl = el("div", { class: "timer-big", id: "hold-timer" }, F.timerStart ? fmtMs(Date.now() - F.timerStart) : "00:00");
        const running = !!F.timerStart;
        scr.append(el("h1", { class: "display", style: "text-align:center" }, ex.name.toUpperCase()),
          el("p", { class: "sub", style: "text-align:center" }, `Hold it. Every ${ex.secsPerRep} seconds = 1 rep.`),
          el("div", { class: "card gold", style: "text-align:center" }, tEl,
            el("div", { class: "btn-row", style: "margin-top:14px" },
              el("button", { class: "btn " + (running ? "danger" : ""), onclick: () => {
                if (!F.timerStart) { sfx("primary"); F.timerStart = Date.now(); startHoldTicker(); render(); }
                else { sfx("tap"); F.secs = Math.max(1, Math.round((Date.now() - F.timerStart) / 1000)); F.amount = F.secs; F.timerStart = null; F.timerAttested = true; F.step = "confirm"; render(); }
              } }, running ? "STOP" : "START HOLD"),
              !running && F.secs ? el("button", { class: "btn ghost", onclick: () => { sfx("tap"); F.step = "confirm"; render(); } }, "Use " + F.secs + "s") : null)));
        const presets2 = [30, 45, 60, 90];
        scr.append(el("h3", { class: "row" }, "Or pick a duration (secs)"));
        scr.append(el("div", { class: "grid3" }, presets2.map((v) => el("div", { class: "preset", onclick: () => { sfx("tap"); F.amount = v; F.secs = v; F.step = "confirm"; render(); } }, el("div", { class: "v" }, String(v)), el("div", { class: "l" }, "SECS")))));
      } else {
        scr.append(el("h1", { class: "display", style: "text-align:center" }, ex.name.toUpperCase()),
          el("p", { class: "sub", style: "text-align:center" }, "How many?"),
          el("div", { class: "entry-big" }, (F.buf || "0"), el("small", null, " " + (ex.unit || "reps"))),
          el("div", { class: "keypad" },
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) =>
              el("button", { class: k === "C" || k === "⌫" ? "dim" : "", onclick: () => {
                sfx("tap");
                if (k === "C") F.buf = "";
                else if (k === "⌫") F.buf = F.buf.slice(0, -1);
                else if ((F.buf + k).length <= 4) F.buf = F.buf === "0" ? k : F.buf + k;
                F.amount = parseInt(F.buf || "0") || 0; render();
              } }, k))),
          F.amount > 0 ? el("button", { class: "btn", style: "margin-top:12px", onclick: () => { sfx("primary"); F.step = "confirm"; render(); } }, "Next") : null);
      }
    } else if (F.step === "confirm") {
      const ex = SoT.exerciseById(F.exerciseId);
      const tier = SoT.tierOf(snap.me.tier);
      const bolt = snap.battle && snap.battle.core && (snap.battle.core.lightning[snap.me.id] || 0) > Date.now();
      const E = SoT.engine;
      const mods = snap.battle && snap.battle.core && snap.battle.core.modifiers ? snap.battle.core.modifiers[snap.me.id] : null;
      const sw = snap.battle && snap.battle.core && snap.battle.core.secondWinds ? snap.battle.core.secondWinds[snap.me.id] : null;
      const stackFx = [];
      let stackMult = 1;
      if (mods && mods.doubleExerciseId === ex.id) { stackMult *= E.DOUBLE_EXERCISE_MULTIPLIER; stackFx.push("🏋️ ×2 double " + ex.name.toLowerCase()); }
      if (mods && mods.specialistIds && mods.specialistIds.includes(ex.id)) { stackMult *= E.SPECIALIST_MULTIPLIER; stackFx.push("🎯 ×1.5 specialist"); }
      if (mods && mods.underdog) { stackMult *= E.UNDERDOG_MULTIPLIER; stackFx.push("🐕 ×1.25 underdog"); }
      if (sw && Date.now() < sw.until) { stackMult *= E.SECOND_WIND_MULTIPLIER; stackFx.push("💨 ×1.5 second wind"); }
      const wildOn = !!(mods && mods.wildcard);
      if (wildOn) stackFx.push("🃏 wildcard — best-value conversion");
      const mult = (bolt ? 3 : 1) * stackMult;
      const gain = previewGain(ex, F.amount, tier.mult, mult, wildOn);
      const my = snap.myRow || { remaining: snap.group.target };
      const awaitingProof = (snap.openProofs || []).some((p) => p.iAmTarget && p.status === "awaiting_log");
      if (awaitingProof && F.verified == null) F.verified = !!F.timerAttested;
      scr.append(el("h1", { class: "display", style: "text-align:center" }, "CONFIRM SET"),
        awaitingProof ? el("div", { class: "banner proof", id: "prove-banner" }, "📋",
          el("span", null, "PROVE IT is on this set — mark it verified for +15 reps, or the crew reviews it.")) : null,
        el("div", { class: "card gold", style: "text-align:center" },
          el("div", { class: "ex-ill", style: "margin:6px 0" }, ex.icon),
          el("div", { class: "display", style: "font-size:34px" }, F.amount + " " + (ex.unit || "reps")),
          el("div", { class: "tiny" }, ex.name),
          el("div", { style: "margin-top:12px" },
            el("span", { class: "chip gold", style: "font-size:14px" }, "+ " + gain + " reps"),
            bolt ? el("span", { class: "chip purple", style: "margin-left:6px" }, "⚡ ×3 active") : null,
            stackFx.map((t) => el("span", { class: "chip purple", style: "margin-left:6px" }, t))),
          el("p", { class: "sub", style: "margin:12px 0 0" }, gain >= my.remaining ? "This set takes you to TARGET." : my.remaining - gain + " reps still to go after this set."),
          awaitingProof ? el("div", { class: "verify-row", id: "verify-row" },
            el("button", { class: "btn sm " + (F.verified ? "" : "ghost"), onclick: () => { sfx("tap"); F.verified = !F.verified; render(); } },
              F.verified ? "🎥 VERIFIED — honesty pays +15" : "🎥 Mark verified (camera / timer)"),
            F.timerAttested && F.verified ? el("span", { class: "tiny", style: "margin-left:8px" }, "timer-attested") : null) : null),
        el("button", { class: "btn", onclick: () => submitSet() }, "Log it"));
    } else if (F.step === "success") {
      const S = F.result || {};
      const isWin = S.completion && S.completion.kind === "win";
      const isBank = S.completion && S.completion.kind === "bank";
      const subline = isWin || isBank ? "" : (S.remaining || 0) > 0 ? `${S.remaining} reps between you and the target.` : "";
      const undoBtn = isWin || isBank ? null : el("button", {
        class: "btn ghost sm",
        onclick: () => {
          const r = SoT.undoLast(snap.group.id, snap.me.id);
          if (r.error) toast(r.error); else toast("Set undone");
          F.step = "sheet"; render();
        },
      }, "↩ Undo set");
      const againBtn = el("button", { class: "btn", onclick: () => { sfx("tap"); F.step = "sheet"; render(); } }, "Log another");
      scr.append(
        el("div", { class: "ex-ill" }, "💪"),
        el("h1", { class: "display", style: "text-align:center" }, "+" + S.gained + " REPS"),
        el("p", { class: "sub", style: "text-align:center" }, subline),
        undoBtn,
        el("div", { style: "margin-top:16px" }, againBtn),
      );
    } else if (F.step === "queued") {
      // OFFLINE QUEUE (#104/#120): the set is safe on-device, syncs later
      const S = F.result || {};
      scr.append(
        el("div", { class: "ex-ill" }, "📴"),
        el("h1", { class: "display", style: "text-align:center" }, "QUEUED — SAVED OFFLINE"),
        el("p", { class: "sub", style: "text-align:center" },
          `${S.qn || 1} set${(S.qn || 1) === 1 ? "" : "s"} waiting to sync. They land the moment the connection returns — nothing is lost.`),
        el("div", { style: "display:flex;gap:8px;justify-content:center;margin-top:6px" },
          el("span", { class: "chip bad" }, "📶 offline"),
          el("span", { class: "chip gold" }, `${Conn.queue.length} in queue`)),
        el("div", { style: "margin-top:16px" },
          el("button", { class: "btn", onclick: () => { sfx("tap"); F.step = "sheet"; render(); } }, "Log another"),
          el("button", { class: "btn ghost sm", style: "margin-left:8px", onclick: () => {
            const last = Conn.queue[Conn.queue.length - 1];
            if (last) { Conn.remove(last.id); toast("Removed from the sync queue"); }
            F.step = "sheet"; render();
          } }, "↩ Remove from queue")));
    }
    return scr;
    function pickExercise(id) { sfx("tap"); F.exerciseId = id; F.step = "exercise"; render(); }
    function exPill(ex, onclick) {
      return el("div", { class: "ex-pill", onclick }, el("div", { class: "e-name" }, ex.icon + " " + ex.name), el("div", { class: "e-sub" }, ex.secsPerRep ? "timed · " + ex.cat : ex.cat + " · ×" + ex.value));
    }
    function presetsFor(snap2) {
      const list = snap2.exerciseList;
      const pu = list.find((e) => e.id === "pushups") || list[0];
      const sq = list.find((e) => e.id === "squats") || list[1];
      const bu = list.find((e) => e.id === "burpees");
      const jp = list.find((e) => e.id === "jumpingjacks");
      const out = [
        { ex: pu.id, v: 20, label: pu.name.toUpperCase() },
        { ex: pu.id, v: 40, label: pu.name.toUpperCase() },
        { ex: sq.id, v: 30, label: sq.name.toUpperCase() },
        { ex: sq.id, v: 50, label: sq.name.toUpperCase() },
      ];
      if (bu) out.push({ ex: bu.id, v: 10, label: bu.name.toUpperCase() });
      if (jp) out.push({ ex: jp.id, v: 50, label: jp.name.toUpperCase() });
      return out;
    }
    function previewGain(ex, amount, tierMult, mult, wildOn) {
      const conv = wildOn ? bestWildExercise() : ex;
      if (conv.secsPerRep) return Math.round((amount / conv.secsPerRep) * conv.value * tierMult * mult);
      return Math.round(amount * conv.value * tierMult * mult);
    }
    function bestWildExercise() {
      const list = snap.exerciseList;
      if (!list || !list.length) return ex;
      return list.reduce((best, e) => (e.value / (e.secsPerRep || 1)) > (best.value / (best.secsPerRep || 1)) ? e : best, list[0]);
    }
    function submitSet() {
      // OFFLINE (#104/#120): sets queue locally and replay on reconnect
      if (Conn.mode !== "online") {
        Conn.enqueue(F.exerciseId, F.amount);
        sfx("tap");
        F.result = { queued: true, qn: Conn.queue.length };
        F.step = "queued"; render(); return;
      }
      // DUPLICATE WARNING (#119): same exercise + same reps inside 60s
      const dup = duplicateLogOf(F.exerciseId, F.amount);
      if (dup) {
        sfx("error");
        App.overlay = { kind: "dupWarn", exerciseId: F.exerciseId, amount: F.amount, dupAt: dup.at, fromQueue: false };
        render(); return;
      }
      applySet();
    }
    function applySet() {
      const verified = !!F.verified;
      const r = SoT.logReps(snap.group.id, snap.me.id, F.exerciseId, F.amount, verified ? { verified: true } : {});
      if (r.error) { sfx("error"); toast(r.error); return; }
      F.result = r;
      if (r.completion && r.completion.kind === "win") {
        sfx("win");
        App.overlay = { kind: "youWon" }; App.tab = "battle"; App.logFlow = null;
        render(); return;
      }
      if (r.completion && r.completion.kind === "bank") {
        sfx("win");
        App.overlay = { kind: "banked" }; App.tab = "battle"; App.logFlow = null;
        render(); return;
      }
      sfx("log");
      if (r.proof && r.proof.status === "review") toast("📋 the crew reviews this set — accept or contest in the Feed");
      if (r.proof && r.proof.status === "verified") toast("📋 verified — +15 reps for the honesty");
      F.step = "success"; render();
    }
    function startHoldTicker() {
      const iv = setInterval(() => {
        const t = document.getElementById("hold-timer");
        if (!t || !F.timerStart) { clearInterval(iv); return; }
        t.textContent = fmtMs(Date.now() - F.timerStart);
      }, 250);
    }
  }

  /* ══ POWER-UPS TAB (#138+) ═══════════════════════════════════════ */
  function scrPowerUps() {
    const snap = SoT.snapshot();
    const cap = SoT.engine.HAND_CAP;
    const scr = el("div", { class: "screen on" },
      el("h1", { class: "display", style: "font-size:30px" }, "THE STACK"),
      el("p", { class: "sub" }, `Each battle day opens with a deal — three face-down, pick one. Halfway earns a bonus deal. Hold up to ${cap}.`),
      el("button", { class: "btn ghost sm", style: "width:100%;margin:-4px 0 12px", id: "tut-cardsheet-link", onclick: () => { sfx("tap"); go("cardsheet"); } }, "📖 The full card sheet — all 21 cards →"));
    if (snap.myDraft) {
      scr.append(el("div", { class: "card gold tight", style: "cursor:pointer", id: "deal-waiting", onclick: () => { sfx("deal"); App.overlay = { kind: "deal" }; render(); } },
        el("div", { style: "display:flex;align-items:center;gap:10px" },
          el("span", { style: "font-size:22px" }, "🎴"),
          el("div", { style: "flex:1" },
            el("div", { style: "font-weight:700" }, "A deal is on the table"),
            el("div", { class: "tiny" }, snap.myDraft.reason === "halfway" ? "Bonus deal — halfway earned" : "Pick 1 of 3 before the day closes")),
          el("span", { class: "chip gold" }, "Open"))));
    }
    const fx = activeEffects(snap);
    if (fx.length) { scr.append(el("h3", { class: "row" }, "Active")); scr.append(el("div", { class: "active-fx", style: "margin-bottom:8px" }, fx)); }
    const inv = (snap.me && snap.me.inventory) || [];
    scr.append(el("h3", { class: "row" }, "Your hand — " + inv.length + " of " + cap));
    const grid = el("div", { class: "pu-grid" });
    const counts = {};
    for (const c of inv) counts[c] = (counts[c] || 0) + 1;
    const revealed = App.revealed || (App.revealed = {});
    Object.entries(counts).forEach(([cid, n], i) => {
      const card = SoT.CARDS[cid];
      if (!card) return;
      const isRev = !!revealed[cid];
      const c = el("div", { class: "pu-card" + (isRev ? " revealed rarity-" + card.rarity : ""), onclick: () => {
        sfx("flip");
        if (!isRev) { revealed[cid] = true; render(); return; }
        App.overlay = { kind: "card", cardId: cid }; render();
      } },
        n > 1 ? el("div", { class: "qty" }, "×" + n) : null,
        isRev ? el("div", { class: "face" },
          el("div", { class: "f-rar" }, card.rarity + " · " + (card.family || "card")),
          el("div", { class: "f-ico" }, card.icon || cardIcon(card.id)),
          el("div", { class: "f-name" }, card.name.toUpperCase()),
          el("div", { class: "f-exp" }, "⏳ " + (card.expiry || "today"))) :
          el("div", { class: "back" }, el("div", { class: "logo" }, "RWF"), el("div", { class: "tiny" }, "tap to flip")));
      grid.append(c);
    });
    for (let i = inv.length; i < cap; i++) grid.append(el("div", { class: "pu-empty" }, "+"));
    scr.append(grid);
    scr.append(el("div", { class: "deal-points", style: "margin-top:10px" },
      el("span", { class: "chip gold" }, "💰 " + snap.points + " pts"),
      el("span", { class: "chip" }, "🪙 pot " + snap.pot),
      el("span", { class: "chip" }, "🔄 reroll " + (snap.battle && snap.battle.core ? SoT.engine.rerollCostFor(snap.battle.core, snap.me.id) : 50) + " pts")));
    const cardEvents = snap.feed.filter((e) => ["card", "steal", "bomb", "bomb_defused", "bomb_detonated", "deal", "deal_pick", "deal_reroll", "proof_request", "proof_verified", "proof_accepted", "proof_contested"].includes(e.type)).slice(0, 8);
    if (cardEvents.length) {
      scr.append(el("h3", { class: "row" }, "Card history"));
      scr.append(el("div", { class: "card tight" }, cardEvents.map((e) =>
        el("div", { class: "toggle-row" }, el("span", { class: "t-sub", style: "flex:1" }, e.text), el("span", { class: "tiny" }, timeAgo(e.atMs))))));
    }
    return scr;
  }
  function cardIcon(id) { const c = SoT.CARDS[id]; return (c && c.icon) || { lightning: "⚡", steal: "🥷", shield: "🛡️", freeze: "❄️", surprise_bomb: "💣", rescue_rope: "🪢", combo_boost: "🔥", double_down: "🎲", assist_boost: "🤝", shield_bash: "🔨" }[id] || "🃏"; }

  /* ══ HOW IT WORKS (the one-scroll spec overview) ═══════════════════
     Phone-first visual tour of the Source of Truth: the loop as a styled
     diagram · the handicap with worked numbers · the four stakes · modes
     + the dual-surface rule. Two-to-three sentences + one visual each,
     all in "reps" language. Lives at App.view "howitworks" — reached from
     the welcome screen and Profile. */
  const FAMILIES = [
    { id: "canon", label: "Launch Four", ico: "⚔️", blurb: "SOT canon — the cards the spec launches with." },
    { id: "post-launch", label: "Post-Launch", ico: "🚀", blurb: "Specced in the same breath — bombs, ropes, boosts." },
    { id: "exercise", label: "Exercise", ico: "🏋️", blurb: "Making an exercise worth more — the founder's own lane." },
    { id: "rivalry", label: "Rivalry", ico: "🤜", blurb: "Making a relationship worth more — rivals and mates." },
    { id: "proof", label: "Proof", ico: "📋", blurb: "Integrity cards — trust is the game (SOT §2.11)." },
    { id: "catch-up", label: "Catch-Up", ico: "💨", blurb: "The comeback lane — never shame, always a route back." },
  ];
  function tutBack() {
    const st = SoT.state;
    if (st.onboarded && st.me && st.activeGroupId && st.groups[st.activeGroupId]) { App.tab = "profile"; App.seasonView = false; go("app"); }
    else go("welcome");
  }
  function tutTopbar(title) {
    return el("div", { class: "topbar" },
      el("button", { class: "icon-btn", title: "Back", onclick: () => { sfx("tap"); tutBack(); } }, "←"),
      el("div", { style: "flex:1;min-width:0" },
        el("div", { class: "g-name" }, title),
        el("div", { class: "g-sub" }, "the source-of-truth walkthrough")),
      el("div", { class: "avatar sm", style: "background:var(--gold-dim)" }, "📖"));
  }
  function scrHowItWorks() {
    const E = SoT.engine;
    const target = E.DEFAULT_DAILY_TARGET_RUF;
    const adjusted = (m) => E.dailyTargetAdjusted(target, m);
    // THE LOOP — the daily→weekly cycle as a styled vertical diagram
    const LOOP = [
      { ico: "🏋️", t: "LOG REPS", s: "Any mix, any time before the clock — the log is one thumb, three taps." },
      { ico: "⚔️", t: "DAILY BATTLE — " + target + " ADJUSTED", s: "Each battle day the crew races the same " + target + "-adjusted target. Handicap-set, not fitness-set." },
      { ico: "👑", t: "FIRST TO TARGET = DAILY WIN", s: "The first player across takes the Daily Win — one season point, crown on the board." },
      { ico: "✅", t: "EVERYONE ELSE BANKS THE DAY", s: "The battle keeps going: finish the target later and the day BANKS — streak safe, history kept." },
      { ico: "🏁", t: "WINS STACK INTO THE WEEK", s: "One week, one standings board. Banked days keep your streak alive; only wins score points." },
      { ico: "⚖️", t: "THE STAKE SETTLES AT SEASON END", s: "Terms are locked before the season — nothing is owed until the final day is played out." },
      { ico: "🧬", t: "YOUR REPS BECOME YOUR NAME", s: "Streaks, wins and lifetime reps — the leaderboard remembers what the couch never could." },
    ];
    const scr = el("div", { class: "screen on", id: "howitworks" },
      tutTopbar("HOW IT WORKS"),
      el("p", { class: "sub", style: "margin-top:2px" }, "The whole game on one scroll — what a rep is worth, what a day is, and what a week decides."));
    // 1 · THE LOOP
    scr.append(el("h3", { class: "row" }, "1 · THE LOOP"));
    scr.append(el("div", { class: "card gold" },
      el("div", { class: "tut-loop", id: "tut-loop" }, LOOP.map((n, i) =>
        el("div", { class: "tut-loop__node" + (i === 2 ? " hot" : "") },
          el("div", { class: "tut-loop__ico" }, n.ico),
          el("div", { class: "tut-loop__body" },
            el("div", { class: "tut-loop__t" }, n.t),
            el("div", { class: "tut-loop__s" }, n.s)),
          i < LOOP.length - 1 ? el("div", { class: "tut-loop__arrow" }, "↓") : null))),
      el("p", { class: "tiny", style: "margin-top:10px" }, "One rep → one day → one week → one name. That's the whole shape of the game.")));
    // 2 · THE HANDICAP
    scr.append(el("h3", { class: "row" }, "2 · THE HANDICAP"));
    scr.append(el("div", { class: "card" },
      el("p", { class: "sub", style: "margin-bottom:10px" }, `The tier changes what a rep is WORTH, not the target. Everyone chases ${target} adjusted reps — the couch gets there in fewer, the athlete earns every one.`),
      el("div", { class: "tut-tiers", id: "tut-tiers" },
        el("div", { class: "tut-tier tut-tier--head" },
          el("div", null, "TIER"), el("div", null, "WORTH"), el("div", null, "PHYSICAL REPS TO " + target)),
        SoT.TIERS.map((t, i) => el("div", { class: "tut-tier" + (i === 0 ? " hot" : "") },
          el("div", null, el("b", null, t.label)),
          el("div", { class: "gold-t" }, "×" + t.mult),
          el("div", { class: "tut-tier__n" }, String(adjusted(t.mult)) + " reps")))),
      el("p", { class: "tiny", style: "margin-top:10px" }, `Worked example: Jack from the couch logs ${adjusted(1.5)} reps for the same ${target} that costs Priya the athlete-buster ${adjusted(0.85)}. Fair is not the same as identical.`)));
    // 3 · THE FOUR STAKES
    scr.append(el("h3", { class: "row" }, "3 · THE FOUR STAKES"));
    const STAKES = [
      { ico: "🍽️", t: "Dinner", s: "Loser shouts the winner a meal — capped, agreed, delicious motivation." },
      { ico: "🎭", t: "Dare", s: "The dare is locked before the season — no negotiating after losing." },
      { ico: "🧾", t: "Deliverable", s: "Loser owes something real: a favour, a chore, a hand-delivered coffee." },
      { ico: "❤️", t: "Charity Pot", s: `Everyone chips in; the winner directs the pot — disclosed platform fee, receipt in the feed.` },
    ];
    scr.append(el("div", { class: "grid2", id: "tut-stakes" }, STAKES.map((x) =>
      el("div", { class: "pick", style: "cursor:default" },
        el("div", { class: "p-ico" }, x.ico),
        el("div", { class: "p-name" }, x.t),
        el("div", { class: "p-sub" }, x.s)))));
    scr.append(el("p", { class: "tiny", style: "margin-top:8px" }, "One stake per season, agreed before battle one. Pride settles daily; stakes settle weekly."));
    // 4 · MODES + DUAL SURFACE
    scr.append(el("h3", { class: "row" }, "4 · MODES & WHERE IT LIVES"));
    scr.append(el("div", { class: "card" },
      el("div", { class: "chip-row", id: "tut-modes" },
        el("span", { class: "chip gold" }, "Individual"),
        el("span", { class: "chip" }, "Team — min 2 a side, 3v2 fine"),
        el("span", { class: "chip" }, "Corporate")),
      el("p", { class: "sub", style: "margin:10px 0 8px" }, "The app is home base and the rulebook — it's authoritative. The battle ALSO lives in your group chat: updates, warnings, winner calls. No second app to install; the chat is where it lives, the app is where it's decided."),
      el("div", { class: "share-card" },
        el("div", { class: "sc-k" }, "💬 ⚔️"),
        el("div", { class: "sc-s" }, "Chat = the arena noise. App = the ledger. Same battle, both surfaces, one truth."))));
    // footer — into the card sheet + back
    scr.append(el("div", { class: "card gold", style: "text-align:center", id: "tut-to-cards" },
      el("div", { class: "display", style: "font-size:20px" }, "21 CARDS. ONE STACK."),
      el("p", { class: "sub", style: "margin:6px 0 12px" }, "Every deal, every family, every expiry — the full card sheet."),
      el("button", { class: "btn", onclick: () => { sfx("deal"); go("cardsheet"); } }, "Open the card sheet →")),
      el("button", { class: "btn ghost", style: "margin-top:12px", onclick: () => { sfx("tap"); tutBack(); } }, "Back"));
    return scr;
  }

  /* ══ THE CARD SHEET (all 21, grouped by family) ════════════════════
     Every face readable: name, rarity chip, one-line effect, target,
     expiry. Draft rules + the proof flow below. Family filter chips.
     Reached from Power-Ups, the How-It-Works screen and the tutorial. */
  function scrCardSheet() {
    const rarChip = { legendary: "gold", epic: "purple", rare: "blue", common: "" };
    const fam = App.cardFilter || "all";
    const scr = el("div", { class: "screen on", id: "cardsheet" },
      tutTopbar("THE CARD SHEET"),
      el("p", { class: "sub", style: "margin-top:2px" }, `${Object.keys(SoT.CARDS).length} cards, six families. Dealt 3, pick 1 — the deck leans toward whoever's behind.`));
    // family filter chips
    scr.append(el("div", { class: "strip tut-filters", id: "card-filters" },
      [{ id: "all", label: "All 21", ico: "🃏" }].concat(FAMILIES).map((f) =>
        el("button", { class: "chip tut-filter" + (fam === f.id ? " on" : ""), "data-fam": f.id, onclick: () => { sfx("tap"); App.cardFilter = f.id; render(); } },
          f.ico + " " + f.label))));
    // the cards, grouped by family (skip filtered-out families)
    for (const f of FAMILIES) {
      if (fam !== "all" && fam !== f.id) continue;
      const cards = Object.values(SoT.CARDS).filter((c) => c.family === f.id);
      if (!cards.length) continue;
      scr.append(el("h3", { class: "row", style: "margin-top:16px" }, f.ico + " " + f.label.toUpperCase() + ` · ${cards.length}`));
      scr.append(el("p", { class: "tiny", style: "margin:-4px 0 8px" }, f.blurb));
      const grid = el("div", { class: "tut-cards" });
      for (const c of cards) {
        grid.append(el("div", { class: "tut-cardface rarity-" + c.rarity },
          el("div", { class: "tut-cardface__ico" }, c.icon || cardIcon(c.id)),
          el("div", { class: "tut-cardface__body" },
            el("div", { class: "tut-cardface__top" },
              el("div", { class: "tut-cardface__name" }, c.name.toUpperCase()),
              el("span", { class: "chip rar-" + c.rarity + " tut-rarchip" }, c.rarity)),
            el("div", { class: "tut-cardface__blurb" }, c.blurb),
            el("div", { class: "chip-row" },
              el("span", { class: "chip" }, "🎯 " + (c.target || "self")),
              el("span", { class: "chip" }, "⏳ " + (c.expiry || "today"))))));
      }
      scr.append(grid);
    }
    // THE DRAFT RULES
    scr.append(el("h3", { class: "row" }, "THE DRAFT RULES"));
    scr.append(el("div", { class: "card gold", id: "tut-draft-rules" },
      el("div", { class: "tut-rule" }, el("b", null, "🃏 Deal 3, pick 1"), el("span", null, "Every battle day opens with three face-down cards. Take one into your hand.")),
      el("div", { class: "tut-rule" }, el("b", null, "🙌 Hand cap 3"), el("span", null, `Hold up to ${SoT.engine.HAND_CAP} cards — play one before the next deal lands.`)),
      el("div", { class: "tut-rule" }, el("b", null, "📈 Catch-up weighting"), el("span", null, "Deals run 50/30/15/5 common→legendary. Fully behind? Your odds shift to 10/50/27/13 — the comeback is dealt, not gifted.")),
      el("div", { class: "tut-rule" }, el("b", null, "🔄 Reroll to the pot"), el("span", null, "Don't like the three? Reroll — 50, then 100, then 200 points, all paid INTO the crew pot.")),
      el("div", { class: "tut-rule" }, el("b", null, "🏃 The halfway bonus"), el("span", null, "Hit 50% of target and a bonus deal lands — earned, once a day.")),
      el("p", { class: "tiny", style: "margin-top:8px" }, "Expired cards sweep at the close. Nothing hoards, everything matters.")));
    // THE PROOF FLOW
    scr.append(el("h3", { class: "row" }, "THE PROOF FLOW"));
    scr.append(el("div", { class: "card", id: "tut-proof-flow" },
      el("div", { class: "tut-rule" }, el("b", null, "📋 Prove It / Spot Check"), el("span", null, "Proof cards put a set in front of the crew — flag it before or after the log.")),
      el("div", { class: "tut-rule" }, el("b", null, "✅ Verify = +15"), el("span", null, "Camera or timer evidence pays the TARGET +15 reps — honesty is a stat, not a tax.")),
      el("div", { class: "tut-rule" }, el("b", null, "⚖️ Contested = 0, but banks"), el("span", null, "The crew votes. A contested set scores zero — yet the day still banks. One rep never sinks your week.")),
      el("p", { class: "tiny", style: "margin-top:8px" }, "Verified sets are immune to Spot Check. Trust is the game.")));
    scr.append(el("button", { class: "btn ghost", style: "margin:12px 0 4px", onclick: () => { sfx("tap"); tutBack(); } }, "Back"));
    return scr;
  }

  /* ══ PROFILE (#245+) ═════════════════════════════════════════════ */
  function scrProfile() {
    const st = SoT.state;
    const me = st.me;
    const snap = SoT.snapshot();
    const g = snap ? snap.group : null;
    const wins = me && g ? g.members.find((m) => m.id === me.id) : null;
    const scr = el("div", { class: "screen on" },
      el("h1", { class: "display", style: "font-size:30px" }, "PROFILE"));
    if (me) {
      scr.append(el("div", { class: "card gold", style: "display:flex;gap:12px;align-items:center" },
        el("div", { class: "avatar lg", style: "background:" + me.color }, me.initials || "??"),
        el("div", null, el("div", { class: "display", style: "font-size:22px" }, me.name),
          el("div", { class: "tiny" }, SoT.tierOf(me.tier).label + " · ×" + SoT.tierOf(me.tier).mult + " handicap · " + me.tone + " tone"))));
      if (wins) {
        const totalBattles = g.seasons.reduce((n, s) => n + s.battles.length, 0);
        scr.append(el("div", { class: "stat-grid" },
          el("div", { class: "stat-box" }, el("div", { class: "v" }, String(wins.dailyWins)), el("div", { class: "l" }, "Daily Wins")),
          el("div", { class: "stat-box" }, el("div", { class: "v" }, String(wins.completions)), el("div", { class: "l" }, "Days banked")),
          el("div", { class: "stat-box" }, el("div", { class: "v" }, "🔥 " + wins.streak), el("div", { class: "l" }, "Streak (best " + wins.bestStreak + ")")),
          el("div", { class: "stat-box" }, el("div", { class: "v" }, String(wins.lifetimeReps)), el("div", { class: "l" }, "Lifetime reps")),
          el("div", { class: "stat-box" }, el("div", { class: "v" }, totalBattles ? Math.round((wins.completions / totalBattles) * 100) + "%" : "–"), el("div", { class: "l" }, "Completion rate")),
          el("div", { class: "stat-box" }, el("div", { class: "v" }, String(wins.failedDays)), el("div", { class: "l" }, "Days missed"))));
        // streak history dots
        const hist = [];
        for (const s of g.seasons) for (const b of s.battles) {
          if (b.completions[me.id] != null) hist.push(b.winnerId === me.id ? "w" : "b");
          else if (b.status === "ended") hist.push("f");
          else hist.push("-");
        }
        scr.append(el("h3", { class: "row" }, "Battle history"));
        scr.append(el("div", { class: "card tight" }, el("div", { class: "streak-dots" },
          hist.map((h, i) => el("div", { class: "dot " + (h === "w" ? "w" : h === "b" ? "b" : h === "f" ? "f" : ""), title: "battle " + (i + 1) }, h === "w" ? "👑" : h === "b" ? "✓" : h === "f" ? "✗" : "·"))),
          el("div", { class: "tiny", style: "margin-top:10px" }, "👑 Daily Win · ✓ banked · ✗ missed")));
      }
      // settings
      scr.append(el("h3", { class: "row" }, "Settings"));
      scr.append(el("div", { class: "card" },
        el("div", { class: "toggle-row", id: "profile-howto", style: "cursor:pointer", onclick: () => { sfx("tap"); go("howitworks"); } },
          el("div", null, el("div", { class: "t-name" }, "How the game works"), el("div", { class: "t-sub" }, "the loop, the handicap, the stakes — one scroll")),
          el("span", { class: "tiny" }, "→")),
        el("div", { class: "toggle-row" },
          el("div", null, el("div", { class: "t-name" }, "Tone"), el("div", { class: "t-sub" }, "how the app talks to the crew")),
          el("select", { style: "width:150px", onchange: (e) => { SoT.setMe({ tone: e.target.value }); render(); } },
            [["cheeky", "Cheeky"], ["neutral", "Neutral"], ["corporate", "Corporate-safe"]].map((o) => el("option", { value: o[0], selected: me.tone === o[0] ? "" : null }, o[1])))),
        el("div", { class: "toggle-row" },
          el("div", null, el("div", { class: "t-name" }, "Quiet hours"), el("div", { class: "t-sub" }, "no battle pings inside the window")),
          el("div", { style: "display:flex;gap:6px" },
            el("input", { type: "text", value: me.quietFrom || "21:00", style: "width:64px;padding:8px", onchange: (e) => SoT.setMe({ quietFrom: e.target.value }) }),
            el("input", { type: "text", value: me.quietTo || "07:00", style: "width:64px;padding:8px", onchange: (e) => SoT.setMe({ quietTo: e.target.value }) }))),
        el("div", { class: "toggle-row" },
          el("div", null, el("div", { class: "t-name" }, "Sound effects"), el("div", { class: "t-sub" }, "taps, cards, the win fanfare")),
          switchEl(!(window.rwfSfx && window.rwfSfx.isMuted && window.rwfSfx.isMuted()), (v) => {
            try { window.rwfSfx.setMuted(!v); } catch (e) {}
          }, "sfx-toggle")),
        el("div", { class: "toggle-row" },
          el("div", null, el("div", { class: "t-name" }, "Simulate offline"), el("div", { class: "t-sub" }, "demo the offline banner, queued logs + sync states")),
          switchEl(Conn.mode !== "online" && Conn.mode !== "reconnecting", (v) => setSimulateOffline(v), "offline-toggle")),
        el("div", { class: "toggle-row" },
          el("div", null, el("div", { class: "t-name" }, "Handicap tier"), el("div", { class: "t-sub" }, "changes what your reps are worth")),
          el("select", { style: "width:130px", onchange: (e) => { SoT.setMe({ tier: e.target.value }); render(); } },
            SoT.TIERS.map((t) => el("option", { value: t.id, selected: me.tier === t.id ? "" : null }, t.label + " ×" + t.mult))))));
      scr.append(el("h3", { class: "row" }, "Demo data"));
      scr.append(el("div", { class: "card" },
        el("button", { class: "btn ghost sm", style: "margin-right:8px", id: "profile-tour", onclick: () => { sfx("deal"); if (window.RWFTutorial) window.RWFTutorial.startDemo(); else toast("Demo module not loaded"); } }, "▶ Watch the tour"),
        el("button", { class: "btn ghost sm", style: "margin-right:8px", onclick: () => { sfx("tap"); SoT.resetProfile(); App.tab = "battle"; App.view = "welcome"; render(); } }, "Switch player"),
        el("button", { class: "btn ghost sm", style: "color:var(--bad);border-color:rgba(255,107,122,.4)", onclick: () => { sfx("tap"); SoT.resetAll(); App.tab = "battle"; App.view = "welcome"; render(); } }, "Reset demo"),
        el("p", { class: "tiny", style: "margin:10px 2px 0" }, "The tour runs on a shadow copy — your real save is untouched.")));
    }
    return scr;
  }

  /* ══ SEASON HUB (#184-204) ═══════════════════════════════════════ */
  function scrSeasonHub() {
    const snap = SoT.snapshot();
    const { group: g, season: s } = snap;
    const scr = el("div", { class: "screen on" },
      el("div", { class: "topbar" },
        el("button", { class: "icon-btn", onclick: () => { sfx("tap"); App.seasonView = false; render(); } }, "←"),
        el("div", { class: "g-name" }, "SEASON HUB"),
        el("div", { class: "spacer" })));
    if (!s) {
      const last = g.seasons[g.seasons.length - 1];
      scr.append(el("p", { class: "sub" }, last ? last.label + " is finished." : "No seasons yet."));
      if (last) scr.append(seasonCard(snap, last));
      scr.append(stakeCard(snap));                            // stake outcome stays visible post-season
      scr.append(el("button", { class: "btn", onclick: () => { sfx("deal"); SoT.startNextSeason(g.id); App.seasonView = false; render(); } }, "Start next season"));
      return scr;
    }
    // standings
    scr.append(el("div", { class: "card" },
      el("h3", { class: "row", style: "margin:2px 2px 10px" }, s.label + " — weekly standings"),
      el("p", { class: "tiny", style: "margin:-6px 2px 10px" }, "1 Daily Win = 1 season point."),
      standingsRows(s, g, snap)));
    // calendar
    scr.append(el("h3", { class: "row" }, "Season calendar"));
    scr.append(el("div", { class: "card" }, el("div", { class: "cal" },
      s.battles.map((b) => {
        let cls = "cal-d";
        if (b.status === "ended") {
          if (b.winnerId && snap.me && b.winnerId === snap.me.id) cls += " won";
          else if (snap.me && b.completions[snap.me.id] != null) cls += " banked";
          else if (snap.me && b.failures.includes(snap.me.id)) cls += " failed";
          else cls += " rest";
        } else cls += " today";
        return el("div", { class: cls, title: "battle " + b.idx },
          el("div", { style: "font-weight:700" }, b.dayName), el("div", { style: "font-size:10px" }, b.status === "ended" ? (b.winnerId ? "W" : "–") : "live"));
      }),
      el("div", { class: "tiny", style: "grid-column:" + Math.min(7, s.battles.length) + "/-1;margin-top:6px" }, "🏆 won · ✓ banked · ✗ missed"))));
    // stake status
    scr.append(el("h3", { class: "row" }, "Season stake"));
    scr.append(stakeCard(snap));
    // past seasons
    const past = g.seasons.filter((x) => x.status === "ended");
    if (past.length) {
      scr.append(el("h3", { class: "row" }, "Past seasons"));
      for (const p of past) scr.append(seasonCard(snap, p));
    }
    return scr;
  }

  function standingsRows(s, g, snap) {
    const ptsOf = (id) => (s.core && s.core.points ? s.core.points[id] || 0 : s.points ? s.points[id] || 0 : 0);
    const rows = g.members.map((m) => ({ m, pts: ptsOf(m.id) })).sort((a, b) => b.pts - a.pts);
    return rows.map((r, i) => el("div", { class: "stand-row" },
      el("div", { class: "s-rank" }, i === 0 ? "👑" : String(i + 1)),
      el("div", { class: "avatar sm", style: "background:" + r.m.color }, r.m.initials || "??"),
      el("div", { style: "flex:1" }, el("div", { style: "font-weight:700" }, r.m.name + (snap.me && r.m.id === snap.me.id ? " (you)" : "")),
        el("div", { class: "tiny" }, r.m.completions + " banked · " + r.m.streak + " streak")),
      el("div", { class: "s-wins" }, String(r.pts))));
  }

  function stakeCard(snap) {
    const { group: g } = snap;
    // stake + resolution ride the LATEST season (current if live, last if ended)
    const s = snap.season || (g.seasons.length ? g.seasons[g.seasons.length - 1] : null);
    const stake = s ? s.stake : g.stake;
    const res = s ? s.stakeResolution : null;
    const box = el("div", { class: "card purple" },
      el("h2", { class: "display", style: "font-size:18px" }, "STAKE — " + stakeName(stake.type).toUpperCase()),
      el("p", { class: "sub", style: "margin:6px 0 10px" }, stakeBlurb(g)));
    if (stake.type === "charity") {
      // pot maths live all season (contributions agree up-front); resolution
      // states only apply once the season has actually ended
      const contributors = g.members.filter((m) => m.stakeAgreed).length;
      const potCents = res && res.potCents != null ? res.potCents : contributors * stake.perPersonCents;
      const feeCents = res && res.feeCents != null ? res.feeCents : Math.round(potCents * (stake.feePct / 100));
      const status = res ? res.status : "pending";
      box.append(el("div", { class: "stat-grid" },
        el("div", { class: "stat-box" }, el("div", { class: "v" }, money(potCents)), el("div", { class: "l" }, "Pot (" + contributors + " in)")),
        el("div", { class: "stat-box" }, el("div", { class: "v" }, money(feeCents)), el("div", { class: "l" }, "Platform fee " + stake.feePct + "%"))));
      if (status === "awaiting_choice") {
        const winner = s.winnerId && g.members.find((m) => m.id === s.winnerId);
        const iAmWinner = snap.me && s.winnerId === snap.me.id;
        box.append(el("div", { class: "banner info", style: "margin:12px 0 0" }, "⏳",
          el("span", null, iAmWinner ? "Season won — choose where the pot goes." : `Awaiting ${winner ? winner.name.split(" ")[0] : "the winner"}'s charity choice.`)));
        if (iAmWinner) box.append(el("button", { class: "btn purple", style: "margin-top:12px", onclick: () => { sfx("pot"); App.overlay = { kind: "charity" }; render(); } }, "Choose the charity"));
      } else if (status === "donated") {
        box.append(el("div", { class: "share-card" },
          el("div", { class: "sc-k" }, "❤️ " + money(res.donateCents) + " → " + res.charityName),
          el("div", { class: "sc-s" }, `after ${money(res.feeCents)} disclosed fee · receipt ${res.receipt}`)));
      } else if (status !== "none") {
        box.append(el("div", { class: "banner info", style: "margin:12px 0 0" }, "⏳",
          el("span", null, `Pot locks at season end — ${money(potCents - feeCents)} goes to the winner's chosen charity.`)));
      }
    } else if (res && res.status === "obligation") {
      const loser = g.members.find((m) => m.id === res.loserId);
      box.append(el("div", { class: "banner info" }, "⚖️",
        el("span", null, loser ? `${loser.name} owes: ${stakeLabelFor(stake)}` : stakeLabelFor(stake))));
      box.append(el("button", { class: "btn sm purple", style: "margin-top:12px", onclick: () => { sfx("tap"); SoT.markObligationFulfilled(g.id); toast("Obligation marked fulfilled"); render(); } }, "Mark fulfilled"));
    } else if (res && res.status === "fulfilled") {
      box.append(el("div", { class: "banner info" }, "✅", el("span", null, "Stake settled — debt paid.")));
    }
    return box;
  }
  function stakeLabelFor(stake) {
    if (stake.type === "dinner") return stake.description || "the dinner";
    if (stake.type === "dare") return "the dare — " + (stake.dareText || "");
    if (stake.type === "deliverable") return stake.description || "the favour";
    return "";
  }

  function seasonCard(snap, s) {
    const g = snap.group;
    const w = s.winnerId && g.members.find((m) => m.id === s.winnerId);
    return el("div", { class: "card tight" },
      el("div", { class: "toggle-row" },
        el("div", null, el("div", { class: "t-name" }, s.label + " 🏆 " + (w ? w.name : "no winner")),
          el("div", { class: "t-sub" }, s.battles.length + " battles · " + ((s.core && s.core.points && s.winnerId ? s.core.points[s.winnerId] : 0) || 0) + " winning points"),
          el("button", { class: "btn sm ghost", style: "margin-top:8px", onclick: () => { sfx("flip"); App.overlay = { kind: "recap", seasonIdx: s.idx }; render(); } }, "Recap")),
        el("span", { class: "chip" }, s.status === "ended" ? "ended" : "live")));
  }

  /* ══ OVERLAYS (winners family #171-183 + cards + recap) ═══════════ */
  function confetti(n) {
    const bits = []; // CSS hides these under prefers-reduced-motion (see sot.css)
    for (let i = 0; i < n; i++) {
      bits.push(el("div", { class: "confetti", style:
        `left:${Math.round(Math.random() * 100)}%;background:${["#f5c445", "#a06bff", "#fbe08a", "#ff7a90", "#55e08a"][i % 5]};animation-duration:${(1.2 + Math.random() * 1.4).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s` }));
    }
    return bits;
  }

  function renderOverlay(ov) {
    const layer = el("div", { class: "overlay on" });
    if (ov.kind === "created") {
      const g = SoT.state.groups[ov.groupId];
      const link = "rwf.qalarc.com/v4#join=" + g.code;
      layer.append(el("div", { class: "oval" },
        confetti(26),
        el("div", { class: "o-kicker" }, "GROUP CREATED"),
        el("div", { class: "o-title" }, g.name.toUpperCase()),
        el("p", { class: "o-sub" }, "Share the invite — the season starts when you say go."),
        el("div", { class: "share-card" },
          el("div", { class: "sc-k display", style: "font-size:30px;letter-spacing:.18em" }, g.code),
          el("div", { class: "sc-s" }, link),
          el("button", { class: "btn ghost sm", style: "margin-top:10px", onclick: () => {
            sfx("tap");
            try { navigator.clipboard && navigator.clipboard.writeText(link); } catch (e) {}
            toast("Invite link copied");
          } }, "Copy invite")),
        el("div", { class: "o-stats" }, el("span", { class: "chip gold" }, g.members.length + " players"), el("span", { class: "chip" }, stakeName(g.stake.type))),
        btnRow(() => { App.overlay = null; render(); }, "Save invite", () => {
          App.overlay = null; sfx("deal"); SoT.startSeason(g.id); render();
        }, "Start the season")));
      return layer;
    }
    if (ov.kind === "youWon") {
      const snap = SoT.snapshot(); const b = snap.battle;
      sfx("win");
      const winPng = winCardPng(snap, b);            // canvas → PNG share card
      window.rwfLastSharePng = winPng || "";         // demo/e2e affordance
      layer.append(el("div", { class: "oval" },
        confetti(60),
        el("div", { class: "o-kicker" }, "FIRST TO " + ((snap.myRow && snap.myRow.dayTarget) || snap.group.target)),
        el("div", { class: "o-title" }, tone("winTitle")),
        el("p", { class: "o-sub" }, tone("winSub")),
        el("div", { class: "share-card" },
          el("div", { class: "sc-k" }, "🏆 " + (snap.me ? snap.me.name : "You") + " · Daily Win"),
          el("div", { class: "sc-s" }, `${snap.group.name} · battle ${b ? b.idx : ""} · first to target · ${fmtMs(Date.now() - (b ? b.startedAtMs || b.startMs : Date.now()))} flat`),
          el("div", { class: "btn-row", style: "margin-top:10px" },
            el("button", { class: "btn ghost sm", onclick: () => { sfx("tap"); try { navigator.clipboard && navigator.clipboard.writeText(`I took the Daily Win on Reps With Friends — first to ${snap.group.target} reps. Join the battle: rwf.qalarc.com/v4#join=${snap.group.code}`); } catch (e) {} toast("Win card copied — paste it in the chat"); } }, "Share the win"),
            el("button", { class: "btn ghost sm", onclick: () => {
              sfx("tap");
              if (!winPng) { toast("Couldn't render the card here"); return; }
              try {
                const a = document.createElement("a");
                a.href = winPng; a.download = "rwf-daily-win.png";
                document.body.append(a); a.click(); a.remove();
                toast("Win card saved — PNG ready to post");
              } catch (e) { toast("Couldn't save the card here"); }
            } }, "Save PNG"))),
        el("p", { class: "tiny" }, "The battle rolls on — your crew can still bank their days."),
        btnRow(() => { App.overlay = null; render(); }, "Back to battle", () => { App.overlay = { kind: "recap" }; render(); }, "Battle recap")));
      return layer;
    }
    if (ov.kind === "otherWon") {
      layer.append(el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, "DAILY WIN TAKEN"),
        el("div", { class: "o-title purple" }, (ov.name || "SOMEONE").toUpperCase() + " WON"),
        el("p", { class: "o-sub" }, `${ov.name} got there first. ${tone("otherWon")}.`),
        el("button", { class: "btn", onclick: () => { App.overlay = null; tab("log"); } }, "Bank my day")));
      return layer;
    }
    if (ov.kind === "banked") {
      const snap = SoT.snapshot();
      layer.append(el("div", { class: "oval" },
        confetti(20),
        el("div", { class: "o-kicker" }, "TARGET COMPLETED"),
        el("div", { class: "o-title" }, "DAY BANKED"),
        el("p", { class: "o-sub" }, tone("bank") + " — streak " + (snap.me ? snap.me.streak : 1) + "."),
        btnRow(() => { App.overlay = null; render(); }, "Nice", () => { App.overlay = { kind: "recap" }; render(); }, "Battle recap")));
      return layer;
    }
    if (ov.kind === "failed") {
      layer.append(el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, "BATTLE " + (ov.battleIdx || "") + " DONE"),
        el("div", { class: "o-title bad" }, "DAY MISSED"),
        el("p", { class: "o-sub" }, tone("failed") + (ov.shielded ? " The Group Shield kept your streak alive." : "")),
        el("div", { class: "share-card" }, el("div", { class: "sc-k" }, "🥊 Comeback plan"), el("div", { class: "sc-s" }, "One set now beats zero — open the log and start tomorrow's streak tonight.")),
        btnRow(() => { App.overlay = null; render(); }, "Close", () => { App.overlay = { kind: "recap" }; render(); }, "See recap")));
      return layer;
    }
    if (ov.kind === "recap") {
      const snap = SoT.snapshot();
      const g = snap.group;
      const sIdx = ov.seasonIdx;
      const s = sIdx ? g.seasons.find((x) => x.idx === sIdx) : snap.season;
      const ended = s ? s.battles.filter((x) => x.status === "ended") : [];
      const b = s ? (ended.find((x) => x.idx === ov.battleIdx) || ended[ended.length - 1]) : null;
      if (!s || !b) { setTimeout(() => { App.overlay = null; render(); }, 0); return layer; }
      const moments = g.events.filter((e) => e.battle === b.idx && ["win", "steal", "bomb_defused", "bomb_detonated", "card", "bank"].includes(e.type)).slice(-6);
      layer.append(el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, s.label + " · BATTLE " + b.idx + " (" + b.dayName + ")"),
        el("div", { class: "o-title" }, "BATTLE RECAP"),
        el("div", { style: "text-align:left;margin:12px 0" },
          Object.entries(b.completions).sort((a, c) => a[1].order - c[1].order).map(([mid, c]) => {
            const m = g.members.find((x) => x.id === mid) || { name: "?" };
            return el("div", { class: "stand-row" },
              el("div", { class: "s-rank" }, c.order === 1 ? "👑" : String(c.order)),
              el("div", { class: "avatar sm" }, (m.initials || "?")),
              el("div", { style: "flex:1" }, m.name, el("div", { class: "tiny" }, b.winnerId === mid ? "Daily Win" : "banked")),
              el("div", { class: "tiny" }, fmtMs(c.atMs - (b.startMs || b.startedAtMs || 0)) + " in"));
          }),
          b.failures.map((mid) => { const m = g.members.find((x) => x.id === mid) || { name: "?" }; return el("div", { class: "stand-row", style: "opacity:.7" }, el("div", { class: "s-rank" }, "✗"), el("div", { style: "flex:1" }, m.name, el("div", { class: "tiny" }, "missed the target"))); })),
        moments.length ? el("div", { class: "share-card", style: "text-align:left" },
          el("div", { class: "sc-s", style: "color:var(--gold)" }, "KEY MOMENTS"),
          moments.map((mm) => el("div", { class: "tiny", style: "margin-top:5px" }, FEED_ICO[mm.type] + " " + mm.text))) : null,
        btnRow(() => { App.overlay = null; render(); }, "Close", () => { App.overlay = null; App.seasonView = true; render(); }, "Season hub")));
      return layer;
    }
    if (ov.kind === "player") {
      const snap = SoT.snapshot();
      const m = snap.group.members.find((x) => x.id === ov.memberId);
      if (!m) return layer;
      const row = snap.board.find((r) => r.member.id === m.id);
      layer.append(el("div", { class: "oval" },
        el("div", { class: "avatar lg", style: "background:" + m.color + ";margin:0 auto 10px" }, m.initials || "??"),
        el("div", { class: "o-title", style: "font-size:30px" }, m.name.toUpperCase()),
        el("p", { class: "o-sub" }, SoT.tierOf(m.tier).label + " · ×" + SoT.tierOf(m.tier).mult + " handicap"),
        el("div", { class: "o-stats" },
          el("span", { class: "chip gold" }, "🔥 " + m.streak + " streak"),
          el("span", { class: "chip" }, "🏆 " + m.dailyWins + " wins"),
          el("span", { class: "chip" }, "✓ " + m.completions + " banked")),
        row ? el("p", { class: "o-sub" }, `${row.adjusted} / ${row.dayTarget} reps today — ${row.remaining > 0 ? row.remaining + " to go" : "target done"}`) : null,
        el("button", { class: "btn ghost", onclick: () => { App.overlay = null; render(); } }, "Close")));
      return layer;
    }
    if (ov.kind === "deal") {
      // THE DEAL (v4.1): three cards face-down → flip → pick one. The
      // founder's directive: "players should have the option of which card
      // to pick out of three dealt." Rerolls pay points to the pot.
      const snap = SoT.snapshot();
      const draft = snap.myDraft;
      if (!draft) { setTimeout(() => { App.overlay = null; render(); }, 0); return layer; }
      const b = snap.battle;
      const kicker = draft.reason === "halfway" ? "BONUS DEAL — HALFWAY EARNED" : draft.reason === "mulligan" ? "MULLIGAN DEAL" : `THE DEAL — BATTLE ${b ? b.idx : ""}`;
      const cost = SoT.engine.rerollCostFor(b.core, snap.me.id);
      const box = el("div", { class: "oval deal-oval" },
        el("div", { class: "o-kicker" }, kicker),
        el("div", { class: "o-title", style: "font-size:34px" }, "PICK 1 OF 3"),
        el("p", { class: "o-sub" }, ov.flipped ? "Tap your card." : "Three cards on the table. Tap to flip them."),
        el("div", { class: "deal-cards" + (ov.flipped ? " flipped" : ""), id: "deal-cards" },
          draft.options.map((kind, i) => {
            const card = SoT.CARDS[kind] || { name: kind, rarity: "common", blurb: "" };
            return el("div", {
              class: "rwcard rarity-" + card.rarity + (ov.picked === kind ? " picked" : ""),
              style: `--i:${i}`,
              onclick: () => {
                if (!ov.flipped) { sfx("flip"); ov.flipped = true; render(); return; }
                sfx("play");
                ov.picked = kind;
                const r = SoT.pickDraft(snap.group.id, snap.me.id, kind);
                if (r.error) { sfx("error"); toast(r.error); ov.picked = null; render(); return; }
                setTimeout(() => { App.overlay = null; toast(`🃏 ${r.name} — ${r.rarity}`); render(); }, 260);
                render();
              },
            },
              el("div", { class: "rw-inner" },
                el("div", { class: "rw-face rw-back" },
                  el("div", { class: "rw-logo" }, "RWF"),
                  el("div", { class: "rw-mini" }, "REPS WITH FRIENDS")),
                el("div", { class: "rw-face rw-front rarity-" + card.rarity },
                  el("div", { class: "rw-rar" }, card.rarity),
                  el("div", { class: "rw-ico" }, card.icon || "🃏"),
                  el("div", { class: "rw-name" }, card.name.toUpperCase()),
                  el("div", { class: "rw-fam" }, (card.family || "card") + " · " + (card.expiry || "")),
                  el("div", { class: "rw-blurb" }, card.blurb))));
          })),
        el("div", { class: "deal-points" },
          el("span", { class: "chip gold" }, "💰 " + snap.points + " pts"),
          el("span", { class: "chip" }, "🪙 pot " + snap.pot)),
        el("div", { class: "btn-row", style: "margin-top:12px" },
          el("button", { class: "btn ghost sm", style: "flex:1", onclick: () => {
            sfx("pot");
            const r = SoT.rerollDeal(snap.group.id, snap.me.id);
            if (r.error) { sfx("error"); toast(r.error); return; }
            ov.flipped = false; ov.picked = null;
            render();
          } }, "🔄 Reroll — " + cost + " pts to the pot"),
          el("button", { class: "btn ghost sm", style: "flex:1", onclick: () => {
            sfx("tap");
            App.dealDismissed = draft.openedAt;   // stays waiting — reopen from the chip
            App.overlay = null; render();
          } }, "Later")),
        el("p", { class: "tiny", style: "margin-top:10px" }, "Rerolls grow the pot for everyone. Behind the pack? The deal leans your way."));
      layer.append(box);
      return layer;
    }
    if (ov.kind === "card") {
      const snap = SoT.snapshot();
      const card = SoT.CARDS[ov.cardId];
      const TARGET_RIVALS = ["steal", "surprise_bomb", "rivalry", "prove_it"];
      const TARGET_MATES = ["rescue_rope", "assist_boost", "training_partners"];
      const needsTarget = TARGET_RIVALS.includes(card.id) || TARGET_MATES.includes(card.id);
      const needsExercise = card.id === "double_exercise";
      const box = el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, card.rarity.toUpperCase() + " · " + (card.family || "CARD").toUpperCase()),
        el("div", { style: "font-size:52px;margin:8px 0" }, card.icon || cardIcon(card.id)),
        el("div", { class: "o-title", style: "font-size:30px" }, card.name.toUpperCase()),
        el("p", { class: "o-sub" }, card.detail),
        el("div", { class: "chip-row" },
          el("span", { class: "chip gold" }, "target: " + (card.target || "self")),
          el("span", { class: "chip" }, "⏳ " + (card.expiry || "today"))),
        el("div", { id: "card-act" }));
      const act = box.querySelector("#card-act");
      const live = snap.battle && snap.battle.status === "live";
      const held = (snap.me.inventory || []).includes(card.id);
      if (!held) act.append(el("p", { class: "tiny" }, "You don't hold this card right now."));
      else if (!live) act.append(el("p", { class: "tiny" }, "Cards play during a live battle."));
      else if (card.id === "pack_bond") {
        // team card: bond MY team (team mode groups only)
        const myTeam = (snap.group.teams || []).find((t) => snap.me.teamId === t.id);
        if (!myTeam) act.append(el("p", { class: "tiny" }, "Team card — it needs a team battle."));
        else {
          const names = snap.group.members.filter((mm) => mm.teamId === myTeam.id).map((mm) => mm.name.split(" ")[0]);
          act.append(el("p", { class: "tiny", style: "margin-bottom:6px" }, `Bond ${myTeam.name} (${names.join(", ")}):`),
            el("button", { class: "btn", style: "margin-top:6px", onclick: () => confirmUse(card.id, null, myTeam.name, { memberIds: snap.group.members.filter((mm) => mm.teamId === myTeam.id).map((mm) => mm.id) }) }, "🐺 Bond the pack"));
        }
      } else if (needsExercise) {
        act.append(el("p", { class: "tiny", style: "margin-bottom:6px" }, "Name your exercise — it counts ×2 today:"),
          el("div", { class: "chip-row" }, snap.exerciseList.map((ex) =>
            el("button", { class: "btn ghost sm", style: "margin:4px 3px 0 0", onclick: () => confirmUse(card.id, null, ex.name, { exerciseId: ex.id }) },
              ex.icon + " " + ex.name))));
      } else if (needsTarget) {
        const proofBusy = new Set((snap.battle.core.proofs || []).filter((p) => p.status === "awaiting_log" || p.status === "review").map((p) => p.targetId));
        const partnered = new Set();
        for (const p of snap.battle.core.partnerships || []) { partnered.add(p.a); partnered.add(p.b); }
        const rivals = snap.board.filter((r) => {
          if (r.member.id === snap.me.id) return false;
          // mates + rivalries + proofs reach anyone; effect cards only reach
          // players still mid-battle (the engine refuses finished targets)
          const anyTarget = TARGET_MATES.includes(card.id) || card.id === "rivalry" || card.id === "prove_it";
          if (anyTarget) return true;
          if (card.id === "prove_it" && proofBusy.has(r.member.id)) return false;
          return !r.completed;
        }).filter((r) => !(card.id === "training_partners" && partnered.has(r.member.id)));
        act.append(el("p", { class: "tiny", style: "margin-bottom:6px" }, card.id === "prove_it" ? "Who has to prove it?" : card.id === "training_partners" ? "Pick your partner:" : "Pick a target:"));
        for (const r of rivals.slice(0, 6)) {
          act.append(el("button", { class: "btn ghost sm", style: "margin:4px 3px 0 0", onclick: () => confirmUse(card.id, r.member.id, r.member.name) },
            r.member.name.split(" ")[0] + " (" + r.adjusted + ")"));
        }
        if (!rivals.length) act.append(el("p", { class: "tiny" }, "No eligible targets right now."));
      } else {
        act.append(el("button", { class: "btn", style: "margin-top:10px", onclick: () => confirmUse(card.id, null, null) }, "Play " + card.name));
      }
      function confirmUse(cid, targetId, targetName, extra = {}) {
        App.overlay = { kind: "confirmCard", cardId: cid, targetId, targetName, ...extra };
        render();
      }
      act.append(el("button", { class: "btn ghost sm", style: "margin-top:12px", onclick: () => { App.overlay = null; render(); } }, "Close"));
      layer.append(box);
      return layer;
    }
    if (ov.kind === "confirmCard") {
      const card = SoT.CARDS[ov.cardId];
      layer.append(el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, "PLAY CARD"),
        el("div", { class: "o-title", style: "font-size:28px" }, (card.icon || cardIcon(card.id)) + " " + card.name.toUpperCase()),
        el("p", { class: "o-sub" }, ov.targetName ? "Target: " + ov.targetName : card.blurb),
        el("p", { class: "tiny" }, "No take-backs — the whole crew sees it."),
        btnRow(() => { App.overlay = { kind: "card", cardId: ov.cardId }; render(); }, "Cancel", () => {
          const snap = SoT.snapshot();
          const r = SoT.activateCard(snap.group.id, snap.me.id, ov.cardId, ov.targetId, {
            ...(ov.exerciseId ? { exerciseId: ov.exerciseId } : {}),
            ...(ov.memberIds ? { memberIds: ov.memberIds } : {}),
          });
          if (r.error) { sfx("error"); toast(r.error); return; }
          sfx("play");
          // Lightning earns the full-screen 10-minute moment (#142); the
          // Mulligan chains straight into its fresh deal
          App.overlay = ov.cardId === "lightning"
            ? { kind: "lightning", untilMs: r.untilMs || (Date.now() + (SoT.engine ? SoT.engine.LIGHTNING_MS : 600_000)) }
            : ov.cardId === "mulligan"
              ? { kind: "deal" }
              : { kind: "cardResult", result: r, cardId: ov.cardId };
          render();
        }, "Confirm")));
      return layer;
    }
    if (ov.kind === "lightning") {
      // FULL-SCREEN 10-MINUTE MOMENT (#142) — storm front, ×3, live fuse
      sfx("win");
      layer.append(el("div", { class: "oval storm" },
        el("div", { class: "bolt", style: "left:14%" }, "⚡"), el("div", { class: "bolt b2", style: "left:78%" }, "⚡"),
        el("div", { class: "o-kicker", style: "color:var(--purple-hi)" }, "LIGHTNING ROUND"),
        el("div", { class: "o-title storm-x" }, "×3"),
        el("p", { class: "o-sub" }, "Every rep you log in the next 10 minutes counts TRIPLE. The whole crew sees the storm."),
        el("div", { class: "storm-clock", id: "storm-t", "data-until": String(ov.untilMs) }, fmtMs(ov.untilMs - Date.now())),
        el("p", { class: "tiny" }, "Once per day · logs inside the window score ×3 automatically"),
        btnRow(() => { App.overlay = null; render(); }, "Back", () => { App.overlay = null; tab("log"); }, "⚡ LOG NOW")));
      return layer;
    }
    if (ov.kind === "cardResult") {
      const r = ov.result;
      const card = SoT.CARDS[ov.cardId];
      let headline = "CARD PLAYED", line = card.name + " is live.";
      if (r.gain != null) { headline = "+" + r.gain + " REPS"; line = `Skimmed off ${r.targetName} — they keep their ${r.targetKept}. Pure gain.`; }
      if (r.bomb) { headline = "BOMB OUT"; line = `Fuse burning for ${fmtMs(r.bomb.fuseEndMs - Date.now())}. They deliver +${r.bomb.reps} reps in time to defuse — miss it and the bomb fizzles.`; }
      if (ov.cardId === "freeze") { headline = "CLOCK FROZEN"; line = "30 minutes added to the battle. Everyone sees the ice."; }
      if (ov.cardId === "lightning") { headline = "×3 STORM LIVE"; line = "Your reps count triple while the lightning runs."; }
      if (ov.cardId === "shield") { headline = "SHIELD UP"; line = "The crew's streaks are protected for today."; }
      if (ov.cardId === "double_exercise") { headline = "×2 ON " + (r.exerciseName || "IT").toUpperCase(); line = `Every ${r.exerciseName || "rep"} you log counts double for the rest of the day.`; }
      if (ov.cardId === "specialist") { headline = "×1.5 SPECIALIST"; line = `Locked in: ${(r.exerciseNames || []).join(", ")} — those count ×1.5 today.`; }
      if (ov.cardId === "wildcard_workout") { headline = "WILDCARD LIVE"; line = "Any exercise counts as any other for you today. Mix it up."; }
      if (ov.cardId === "rivalry") { headline = "RIVALRY LIVE"; line = `vs ${r.rivalName} — more reps by the close takes +${r.bonusRuf}.`; }
      if (ov.cardId === "training_partners") { headline = "PARTNERS LOCKED"; line = `You and ${r.partnerName} — both bank today and both pocket +${r.bonusRufEach}.`; }
      if (ov.cardId === "pack_bond") { headline = "PACK BONDED"; line = `Everyone who logs ${r.thresholdRuf || 20}+ reps banks +10% at the close.`; }
      if (ov.cardId === "prove_it") { headline = "PROOF OUT"; line = `${r.targetName}'s next set gets checked — verify and THEY bank +15. Skip it and the crew decides.`; }
      if (ov.cardId === "spot_check") { headline = "SPOT CHECK"; line = `${r.targetName}'s biggest set (${r.entryRuf} reps) is under group review — the crew accepts or contests.`; }
      if (ov.cardId === "second_wind") { headline = "×1.5 SECOND WIND"; line = "15 minutes of comeback fuel. Go."; }
      if (ov.cardId === "mulligan") { headline = "HAND SCRAPPED"; line = `${r.discarded} card${r.discarded === 1 ? "" : "s"} gone — three fresh cards are on the table.`; }
      if (ov.cardId === "underdog") { headline = "×1.25 UNDERDOG"; line = "You're riding at the back — every rep counts extra today. Comeback lane open."; }
      const layer2 = el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, card.name.toUpperCase()),
        el("div", { class: "o-title", style: "font-size:34px" }, headline),
        el("p", { class: "o-sub" }, line));
      layer2.append(btnRow(() => { App.overlay = null; render(); }, "Done", null, null));
      layer.append(layer2);
      return layer;
    }
    if (ov.kind === "charity") {
      const snap = SoT.snapshot();
      const s = snap.season || snap.group.seasons[snap.group.seasons.length - 1];
      const res = s.stakeResolution;
      const box = el("div", { class: "oval" },
        el("div", { class: "o-kicker" }, "SEASON WINNER — DIRECT THE POT"),
        el("div", { class: "o-title", style: "font-size:30px" }, "CHOOSE THE CHARITY"),
        el("p", { class: "o-sub" }, `Pot ${money(res.potCents)} → charity ${money(res.donateCents)} after ${money(res.feeCents)} disclosed fee (${s.stake.feePct}%).`),
        el("div", { class: "grid2", style: "margin-top:8px" }, SoT.CHARITIES.map((c) =>
          el("div", { class: "pick", onclick: () => {
            const r = SoT.resolveCharity(snap.group.id, c.id);
            if (r.error) { sfx("error"); toast(r.error); return; }
            sfx("pot"); App.overlay = { kind: "charityDone", charity: c, res: r.resolution }; render();
          } },
            el("div", { class: "p-ico" }, c.icon), el("div", { class: "p-name" }, c.name), el("div", { class: "p-sub" }, c.note)))),
        el("button", { class: "btn ghost sm", style: "margin-top:12px", onclick: () => { App.overlay = null; render(); } }, "Decide later"));
      layer.append(box);
      return layer;
    }
    if (ov.kind === "charityDone") {
      const c = ov.charity, res = ov.res;
      layer.append(el("div", { class: "oval" },
        confetti(40),
        el("div", { class: "o-kicker" }, "DONATION CONFIRMED"),
        el("div", { class: "o-title", style: "font-size:30px" }, c.name.toUpperCase()),
        el("p", { class: "o-sub" }, `${money(res.donateCents)} directed to ${c.name} — receipt ${res.receipt}.`),
        el("div", { class: "share-card" },
          el("div", { class: "sc-k" }, c.icon + " " + money(res.donateCents) + " → " + c.name),
          el("div", { class: "sc-s" }, `${snapName()} won the season · the crew's reps turned into a donation`),
          el("button", { class: "btn ghost sm", style: "margin-top:10px", onclick: () => {
            sfx("tap");
            try { navigator.clipboard && navigator.clipboard.writeText(`Our Reps With Friends season put ${money(res.donateCents)} behind ${c.name}. Join the battle: rwf.qalarc.com/v4`); } catch (e) {}
            toast("Impact card copied");
          } }, "Share the impact")),
        btnRow(() => { App.overlay = null; render(); }, "Done", () => { App.overlay = null; App.seasonView = true; render(); }, "Season hub")));
      return layer;
    }
    if (ov.kind === "dupWarn") {
      // DUPLICATE LOG WARNING (#119): same exercise + reps inside 60s —
      // confirm it's real or undo before it lands
      const ex = SoT.exerciseById(ov.exerciseId);
      const mins = Math.max(1, Math.round((Date.now() - (ov.dupAt || Date.now())) / 60_000));
      layer.append(el("div", { class: "oval", id: "dup-warn" },
        el("div", { class: "o-kicker" }, "POSSIBLE DUPLICATE"),
        el("div", { style: "font-size:52px;margin:8px 0" }, "🤔"),
        el("div", { class: "o-title", style: "font-size:28px" }, "DID THAT SET COUNT?"),
        el("p", { class: "o-sub" },
          `You logged ${ov.amount} ${(ex && (ex.unit === "secs" ? "sec " : "")) || ""}${(ex && ex.name.toLowerCase()) || "reps"} ${mins === 1 ? "less than a minute" : mins + " minutes"} ago.`),
        el("div", { class: "share-card" },
          el("div", { class: "sc-k" }, `${(ex && ex.icon) || "📝"} ${ov.amount} × ${(ex && ex.name) || ""}`),
          el("div", { class: "sc-s" }, "Double-tapped buttons and offline retries often log sets twice. Duplicates still count — only you know the truth.")),
        btnRow(() => {
          // Undo — back to the confirm step, nothing logged (#119 → #118)
          App.overlay = null; FBackToConfirm(); render();
        }, "↩ Undo — not a double", () => {
          // Confirm — it was a real second set; let it land
          App.overlay = null; applyQueuedOrCurrent(); render();
        }, "Yes — log it anyway")));
      return layer;
    }
    if (ov.kind === "syncConflict") {
      // SYNC CONFLICT (#105): a queued offline set raced a log that already
      // landed — resolve each conflict by hand, keep or drop
      const c = ov.conflicts[0];
      const ex = c ? SoT.exerciseById(c.q.exerciseId) : null;
      const remaining = ov.conflicts.length;
      const snap = SoT.snapshot();
      layer.append(el("div", { class: "oval", id: "sync-conflict" },
        el("div", { class: "o-kicker" }, "SYNC CONFLICT"),
        el("div", { style: "font-size:52px;margin:8px 0" }, "⚡"),
        el("div", { class: "o-title", style: "font-size:28px" }, "A SET LANDED TWICE?"),
        el("p", { class: "o-sub" },
          `While you were offline you queued ${c.q.amount} ${(ex && ex.unit === "secs" ? "sec " : "")}${(ex && ex.name.toLowerCase()) || "reps"} — and the same set is already on the board (synced from another device or an earlier retry).`),
        el("div", { class: "share-card" },
          el("div", { class: "sc-k" }, `${(ex && ex.icon) || "📝"} ${c.q.amount} × ${(ex && ex.name) || ""} · queued ${timeAgo(c.q.queuedAt)}`),
          el("div", { class: "sc-s" }, `${remaining} conflict${remaining === 1 ? "" : "s"} to resolve${ov.synced ? ` · ${ov.synced} other set${ov.synced === 1 ? "" : "s"} already synced` : ""}`)),
        btnRow(() => {
          // Undo — drop my queued copy, keep the landed one
          Conn.remove(c.q.id);
          finishOrNextConflict(ov, 0, 1);
        }, "↩ Drop mine — it's a double", () => {
          // Confirm — keep both: apply the queued set too
          const r = SoT.logReps(snap.group.id, snap.me.id, c.q.exerciseId, c.q.amount);
          Conn.remove(c.q.id);
          if (r.error) toast(r.error);
          finishOrNextConflict(ov, 1, 0);
        }, "Keep both sets")));
      return layer;
    }
    function FBackToConfirm() {
      // return the log flow to its confirm step (nothing was logged)
      if (App.logFlow) App.logFlow.step = "confirm";
    }
    function applyQueuedOrCurrent() {
      // the confirmed duplicate: apply the set sitting in the log flow
      // (carrying the verified mark if the proof lane armed it)
      if (App.logFlow) {
        const F = App.logFlow;
        const r = SoT.logReps(SoT.state.activeGroupId, SoT.state.me.id, F.exerciseId, F.amount, F.verified ? { verified: true } : {});
        if (r.error) { toast(r.error); return; }
        F.result = r;
        if (r.completion && (r.completion.kind === "win" || r.completion.kind === "bank")) {
          App.overlay = r.completion.kind === "win" ? { kind: "youWon" } : { kind: "banked" };
          App.tab = "battle"; App.logFlow = null; return;
        }
        if (r.proof && r.proof.status === "review") toast("📋 the crew reviews this set — accept or contest in the Feed");
        if (r.proof && r.proof.status === "verified") toast("📋 verified — +15 reps for the honesty");
        F.step = "success";
      }
    }
    function finishOrNextConflict(ov2, kept, dropped2) {
      const rest = ov2.conflicts.slice(1);
      if (rest.length) {
        App.overlay = { kind: "syncConflict", conflicts: rest, synced: (ov2.synced || 0) + kept, dropped: (ov2.dropped || 0) + dropped2 };
      } else {
        App.overlay = null;
        const k = (ov2.synced || 0) + kept, d = (ov2.dropped || 0) + dropped2;
        toast(`Sync complete — ${k} kept${d ? `, ${d} dropped as duplicates` : ""}`);
      }
      render();
    }
    if (ov.kind === "seasonWinner") {
      const snap = SoT.snapshot();
      const s = snap.group.seasons[snap.group.seasons.length - 1];
      layer.append(el("div", { class: "oval" },
        confetti(70),
        el("div", { class: "o-kicker" }, s.label + " COMPLETE"),
        el("div", { class: "o-title" }, ov.me ? "SEASON CHAMPION" : "SEASON DECIDED"),
        el("p", { class: "o-sub" }, ov.me ? `You took ${s.label} with ${(s.core && s.core.points && s.winnerId ? s.core.points[s.winnerId] : 0) || 0} Daily Wins.` : `${ov.name || "Someone"} took the season.`),
        btnRow(() => { App.overlay = null; render(); }, "Close", () => { App.overlay = { kind: "charity" }; render(); }, "Resolve the stake")));
      return layer;
    }
    return layer;
    function snapName() { const me = SoT.state.me; return me ? me.name : "The crew"; }
  }

  function btnRow(onLeft, leftLabel, onRight, rightLabel) {
    const row = el("div", { class: "btn-row", style: "margin-top:14px" });
    if (onLeft) row.append(el("button", { class: "btn ghost", onclick: onLeft }, leftLabel || "Close"));
    if (onRight) row.append(el("button", { class: "btn", onclick: onRight }, rightLabel || "Continue"));
    return row;
  }

  /* ── moment detection (deals, other players' wins, deadline fallout) ─ */
  function detectMoments(prevFeedLen) {
    const snap = SoT.snapshot();
    if (!snap || !snap.me) return;
    const g = snap.group, me = snap.me;
    // one-time moments may bump a waiting deal sheet (the deal re-claims
    // focus after the moment closes — it's still on the table)
    const claimable = () => !App.overlay || App.overlay.kind === "deal";
    for (const e of snap.feed) {
      if (e._seen) continue;
      e._seen = true;
      if (e.type === "win" && App.view === "app" && claimable()) {
        if (e.memberId !== me.id) {
          const w = g.members.find((m) => m.id === e.memberId);
          App.overlay = { kind: "otherWon", name: w ? w.name.split(" ")[0] : "Someone" };
        }
      }
    }
    // failed-day / season-end detection for me
    const s = snap.season || g.seasons[g.seasons.length - 1];
    if (s) {
      for (const b of s.battles) {
        const key = "fail" + b.idx;
        if (b.status === "ended" && !App.overlayShown[key] && b.failures.includes(me.id)) {
          App.overlayShown[key] = true;
          if (claimable() && App.view === "app") {
            App.overlay = { kind: "failed", battleIdx: b.idx, shielded: b.shields.some((sh) => sh.consumedAtMs) };
          }
        }
      }
      if (s.status === "ended" && !App.overlayShown["season" + s.idx]) {
        App.overlayShown["season" + s.idx] = true;
        if (claimable() && App.view === "app") {
          App.overlay = { kind: "seasonWinner", me: s.winnerId === me.id, name: (g.members.find((m) => m.id === s.winnerId) || { name: "" }).name.split(" ")[0] };
        }
      }
    }
    // THE DEAL claims whatever's left: a pending draft of mine claims the
    // screen until dismissed ("Later") or picked. A win moment may briefly
    // sit on top of it — the deal re-claims when that moment closes.
    if (snap.myDraft && !App.overlay && App.view === "app" && App.dealDismissed !== snap.myDraft.openedAt) {
      sfx("deal");
      App.overlay = { kind: "deal" };
    }
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  SoT.subscribe(() => {
    detectMoments();
    render();
  });

  // per-second tick: engine deadlines (which save() → render via subscribe),
  // plus in-place clock updates so the timer never waits on a state change.
  setInterval(() => {
    const st = SoT.state;
    if (st && st.activeGroupId && st.groups[st.activeGroupId]) {
      SoT.tick(st.activeGroupId);
    }
    const snap = SoT.snapshot();
    if (snap && snap.clock && App.view === "app" && App.tab === "battle" && !App.overlay) {
      const t = document.getElementById("clock-time");
      if (t) {
        if (snap.clock.frozen) { t.textContent = fmtMs(snap.clock.frozenRemainingMs); }
        else t.textContent = fmtMs(snap.clock.remainingMs);
        const bar = document.getElementById("clockbar");
        if (bar) {
          bar.classList.toggle("frozen", !!snap.clock.frozen);
          bar.classList.toggle("dz", !snap.clock.frozen && snap.clock.urgency.level >= 3);
        }
        const u = document.getElementById("clock-urg");
        if (u) u.textContent = snap.clock.frozen ? "❄️ FROZEN" : snap.clock.urgency.label;
      }
      for (const fxT of document.querySelectorAll(".fx-t")) {
        const until = parseInt(fxT.getAttribute("data-until") || "0");
        if (until) fxT.textContent = fmtMs(until - Date.now());
      }
    }
  }, 1000);

  // deep link support (#join=CODE)
  if ((location.hash || "").startsWith("#join=") && SoT.state.onboarded) {
    App.join = { code: location.hash.slice(6).toUpperCase(), step: "enter" };
    App.view = "join";
  }
  // connection shim boot: restore any queued offline sets; if we came back
  // online since last visit, replay them now (#120 → #103 replay-on-reconnect)
  Conn.load();
  window.__rwfConn = Conn; // test/drive handle (read-only by convention)
  window.__rwfV4 = App; // test/drive handle (e2e + page-driving; read-only by convention)
  // tutorial/demo drive handles (window.RWFTutorial in tutorial.js + e2e-tutorial.mjs)
  window.__rwfGo = (v) => { App.view = v; App.seasonView = false; render(); };
  window.__rwfTabTo = (t) => { App.view = "app"; App.seasonView = false; tab(t); };
  window.__rwfOverlay = (ov) => { App.overlay = ov; render(); };
  window.__rwfSeason = (v) => { App.seasonView = !!v; render(); };
  detectMoments();
  render();
  if (Conn.queue.length && Conn.mode === "online") {
    Conn.mode = "reconnecting"; render();
    setTimeout(() => replayQueuedLogs(), 1100);
  }
})();
