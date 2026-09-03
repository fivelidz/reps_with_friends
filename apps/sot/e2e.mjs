/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — e2e (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The Source-of-Truth product journey, on the real app:
     onboard (welcome → 3 explainers → name → badge → tone) →
     create wizard (individual · Mon+Tue · 200 · 2-min sprints · weekly ·
     CHARITY stake $10+5% · canon+post-launch cards) → start season →
     DAILY BATTLE: house rival logs 100 → Rep Steal (PURE GAIN asserted in
     state) → quick log (preset → success/remaining → UNDO → keypad to 200)
     → FIRST PLAYER DAILY WIN moment (confetti + share card) →
     rival completes (BANKS the day, streak) → deadline →
     FAILED DAY recorded for the third player → battle recap →
     season hub (standings 1:0, pot math) → DAY 2 →
     Surprise Bomb HIT (defused) + MISS (target grows to 220) →
     Lightning ×3 verified on a real log → second Daily Win →
     deadline → SEASON ENDS → winner-chooses CHARITY flow (fee + receipt) →
     join flow as a second player (code → preview → stake agreement) →
     language sweep · desktop 1280 · reduced-motion · ZERO console errors.
   Shots land in apps/sot/shots/ with the _sot suffix (390×844 @2x + one
   desktop). Battle language: reps / battle / day / Daily Win / banked.
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9231 + Math.floor(Math.random() * 400); // unique per run — never
// collide with a previous run's still-dying chromium devtools endpoint

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: apps/sot at / (self-contained) + engine stub ────── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/sot-engine.js") {
      // the REAL shared daily-battle engine (same file serve.ts mounts at /v4)
      const f2 = Bun.file(join(HERE, "..", "sot-engine.js"));
      if (await f2.exists()) return new Response(f2, { headers: { "content-type": "text/javascript" } });
      return new Response("not found", { status: 404 });
    }
    const fsPath = p === "/" ? join(HERE, "index.html") : join(HERE, p.replace(/^\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      const ext = fsPath.slice(fsPath.lastIndexOf("."));
      return new Response(f, {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless ─────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v4-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v4-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
// never orphan the headless chromium — even on a thrown failure, kill it on exit
process.on("exit", () => { try { proc.kill("SIGKILL"); } catch {} });

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}
await waitFor(async () => {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; }
  catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

/* ── 3. minimal CDP client ───────────────────────────────────────────── */
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 300));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 300));
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(240);
}
async function clickText(text, scope = "button, .pick, .ex-pill, .preset, .pu-card, .card") {
  const r = await evalJs(`(() => {
    const want = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll('${scope}')];
    let hit = els.find(el => (el.textContent || '').trim() === want)
           || els.find(el => (el.textContent || '').trim().startsWith(want));
    if (!hit) hit = els.find(el => (el.textContent || '').includes(want));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 30); }
    return null;
  })()`);
  if (r === null) { try { console.log(`    [clickText miss "${text}" — screen: ${await dump()}]`); } catch {} throw new Error(`clickText target missing: ${text}`); }
  await sleep(240);
  return r;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_sot.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
const dump = () => evalJs(`document.querySelector('.chip')?.textContent + ' :: ' + (document.body.innerText || '').replace(/\\n/g, ' | ').slice(0, 160)`);
const okBody = async (s, label) => { const r = await bodyHas(s); if (!r) console.log(`    [miss "${s}" — screen: ${await dump()}]`); ok(r, label); };
const snapState = () => evalJs(`(() => { const s = RWFSoT.snapshot(); return JSON.parse(JSON.stringify({ gid: s.group.id, code: s.group.code, battle: s.battle ? { idx: s.battle.idx, status: s.battle.status, winnerId: s.battle.winnerId, deadlineMs: s.battle.deadlineMs, failures: s.battle.failures, bombs: (s.battle.bombs || []).map(b => ({ target: b.targetId, status: b.status, reps: b.reps })) } : null, season: s.season ? { idx: s.season.idx, status: s.season.status, points: (s.season.core && s.season.core.points) || s.season.points || {}, winnerId: s.season.winnerId, res: s.season.stakeResolution } : null, board: s.board.map(r => ({ id: r.member.id, name: r.member.name, adjusted: r.adjusted, dayTarget: r.dayTarget, completed: r.completed, isWinner: r.isWinner })), me: s.me ? { id: s.me.id, streak: s.me.streak, inventory: s.me.inventory } : null, members: s.group.members.map(m => ({ id: m.id, name: m.name, streak: m.streak, completions: m.completions, stakeAgreed: m.stakeAgreed })) })); })()`);
const driveLog = (memberId, ex, physical) =>
  evalJs(`RWFSoT.logRepsAs(RWFSoT.state.activeGroupId, ${JSON.stringify(memberId)}, ${JSON.stringify(ex)}, ${physical})`);
const waitBattleStatus = (idx, status, timeout = 150_000) => waitFor(async () => {
  const s = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const se = g.seasons.find(x => x.status === 'active') || g.seasons[g.seasons.length-1]; const b = se.battles.find(x => x.idx === ${idx}); return b ? b.status : 'gone'; })()`);
  return s === status;
}, { timeout, every: 400, label: `battle ${idx} → ${status}` });

/* the founder's language rule, enforced */
const BANNED = /\bmatch(?:es|ed|ing)?\b|kitty|poker|\bruf\b|\b300\b/i;
const langClean = (where) =>
  evalJs(`(() => { const t = document.body.innerText || ''; return !${BANNED.toString()}.test(t); })()`)
    .then((clean) => ok(clean === true, `language clean on ${where} (no match/kitty/poker/RUF/300)`));

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V4 SoT APP E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
try {
  await waitFor(
    () => evalJs(`document.readyState === 'complete' && window.RWFSoT && document.querySelector('.screen') !== null`).catch(() => false),
    { label: "v4 app load", timeout: 20000 }
  );
} catch (e) {
  // flake forensics: what does the page actually look like, is the server up
  const srv = await fetch(`${BASE}/`).then((r) => `html ${r.status}`).catch((err) => `fetch failed: ${err.message}`);
  const dbg = await evalJs(`JSON.stringify({ rs: document.readyState, url: location.href, rwfSoT: !!window.RWFSoT, screen: !!document.querySelector('.screen'), scripts: [...document.scripts].map(s => s.src).join(','), body: (document.body.innerText || '').slice(0, 100) })`).catch((err) => `eval failed: ${err.message}`);
  console.log(`load diagnostics — server: ${srv}`);
  console.log(`load diagnostics — page: ${dbg}`);
  console.log(`load diagnostics — console errors: ${JSON.stringify(consoleErrors)}`);
  throw e;
}
await sleep(700);

console.log("— ONBOARD");
ok(await exists("h1.display"), "welcome hero renders");
ok((await text("h1.display")).includes("REPS WITH"), "brand present");
okBody("JOIN THE BATTLE", "slogan present");
await shot("welcome");
await click("button.btn");                                    // Let's go
await clickText("Next");                                      // → explainer 2 (seasons)
okBody("SEASONS", "explainers cover seasons");
await clickText("Next");                                      // → explainer 3 (app + chat)
okBody("CHAT", "explainer 3 covers the app+chat dual surface");
await clickText("Create profile");                            // → name
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = 'Alexei'; return true; })()`);
await clickText("Next");                                      // → avatar
await click(".grid3 .pick");                                  // badge colour
await clickText("Next");                                      // → tone
await clickText("Cheeky");
await clickText("Done");                                      // → start
okBody("Create a group", "start screen reached");
await shot("start");
await langClean("onboarding");

console.log("— CREATE WIZARD (individual · Mon+Tue · 200 · sprint clock · weekly · charity)");
await clickText("⚔️ Create a group");
okBody("STEP 1/11", "wizard opened (11 condensed steps)");
await clickText("Next");                                      // mode (individual default)
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = 'Gold Squad'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await clickText("Next");                                      // identity
okBody("demo house crew", "invite step offers the house crew (on)");
await clickText("Next");                                      // invite
okBody("2 battle days per week", "Mon+Tue default battle days");
await clickText("Next");                                      // days
ok((await text(".hero-target")).startsWith("200"), "target default is 200");
await clickText("Sprint");                                    // battle clock → sprint
await evalJs(`(() => { const i = document.querySelector('input[type=number]'); i.value = '2'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await clickText("Next");                                      // target+clock
okBody("Handicap review".toUpperCase().slice(0, 7), "handicap review shown");
await clickText("Next");                                      // handicap (fit) → exercises
okBody("Push-ups", "stock library includes the core 12");
await clickText("Next");                                      // exercises → season step
await clickText("Charity pot");                               // stake = charity
await shot("stake-setup");
await clickText("Next");                                      // → charity stake setup
okBody("$10.00", "charity contribution $10 default");
okBody("5%", "platform fee disclosed");
await clickText("Next");                                      // → power-up settings
okBody("canon", "power-up settings mark the canon 4");
await clickText("Next");                                      // → review
await shot("review");
await clickText("⚔️ Create the group");                        // → created overlay
ok(await exists(".oval"), "created celebration overlay");
okBody("GROUP CREATED", "group created");
let CODE = null;
await waitFor(() => evalJs(`!!RWFSoT.state.activeGroupId`).catch(() => false), { label: "group persisted" });
CODE = (await snapState()).code;
ok(/^[A-Z0-9]{6}$/.test(CODE), `invite code generated (${CODE})`);
await clickText("Start the season");                          // lobby → season 1 live
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons.length === 1 && g.seasons[0].battles[0].status === 'live'; })()`).catch(() => false), { label: "season 1 battle 1 live" });

console.log("— DAY 1 BATTLE HOME");
await sleep(400);
ok((await text(".hero-target")).startsWith("200"), "adjusted target hero numeral 200");
ok(await exists("#clock-time"), "battle clock ticking");
ok((await evalJs(`document.querySelectorAll('.lb-row').length`)) === 4, "leaderboard shows 4 players");
okBody("First to their adjusted target takes the Daily Win", "first-to-target framing on leaderboard");
ok(await exists(".clockbar.dz") || await bodyHas("DANGER ZONE") || await bodyHas("DO OR DIE"), "final-period urgency state visible (sprint clock)");
okBody("streak", "streak chip present");
await shot("battle");
await langClean("battle home");

console.log("— REP STEAL (pure gain, target keeps their score)");
let st = await snapState();
const priya = st.members.find((m) => m.name === "Priya");
const jack = st.members.find((m) => m.name === "Jack");
const marco = st.members.find((m) => m.name === "Marco");
const me = st.me.id;
ok(!!priya && !!jack && !!marco, "house crew Marco/Priya/Jack on roster");
await driveLog(priya.id, "pushups", 100);                     // Priya to 100
await sleep(300);
await clickText("Power-Ups");                                     // → Power-Ups tab
ok(await exists(".pu-grid"), "power-up inventory grid");
for (let i = 0; i < 10; i++) {                                 // reveal hidden cards one at a
  const more = await evalJs(`(() => { const c = document.querySelector('.pu-card:not(.revealed)'); if (c) { c.click(); return true; } return false; })()`);
  if (!more) break;
  await sleep(140);
}
await sleep(300);
await shot("powerups");
ok(await evalJs(`(() => { for (const c of document.querySelectorAll('.pu-card.revealed')) { if (c.textContent.toUpperCase().includes('REP STEAL')) { c.click(); return true; } } return false; })()`), "Rep Steal card revealed from hidden stack");
await sleep(300);
ok((await bodyHas("Pure gain")) || (await bodyHas("keep every rep")), "card detail explains pure-gain steal");
await clickText("Priya (");                                   // target selection
okBody("ACTIVATE CARD", "activation confirm shown");
await clickText("Confirm");
okBody("+10 REPS", "steal result: +10 reps gained");
ok((await bodyHas("keeps their 100")) || (await bodyHas("keep their 100")), "steal result shows target kept their score");
await clickText("Done");
st = await snapState();
const myRow = st.board.find((r) => r.id === me);
const priyaRow = st.board.find((r) => r.id === priya.id);
ok(myRow.adjusted === 10, `my adjusted = ${myRow.adjusted} (stolen 10% of 100)`);
ok(priyaRow.adjusted === 100, `Priya unchanged at ${priyaRow.adjusted} — PURE GAIN verified in state`);
ok((await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const s = g.seasons[0]; const b = s.battles[0]; return b.steals[0] && b.steals[0].gained === 10 && b.steals[0].targetKept === 100; })()`)) === true, "steal recorded in engine state (gain 10, target kept 100)");

console.log("— QUICK LOG (recents/presets → confirm → success/remaining → undo → keypad)");
await clickText("LOG");                                       // central log tab
if (!(await exists(".qlog-open"))) console.log(`    [log sheet missing — screen: ${await dump()}]`);
ok(await exists(".qlog-open"), "quick log sheet opened");
ok(await exists(".preset"), "quick presets offered");
await shot("log");
await clickText("40", ".preset");                             // 40 push-ups preset
okBody("CONFIRM SET", "log confirmation screen");
okBody("+ 40 reps", "adjusted gain preview shown");
await clickText("Log it");
okBody("+40 REPS", "log success screen");
okBody("150 reps between you and the target", "remaining reps after the set (150)");
await clickText("↩ Undo set");                                // undo (#118)
st = await snapState();
ok(st.board.find((r) => r.id === me).adjusted === 10, "undo removed the set (back to 10)");

console.log("— TIMED ENTRY (plank hold — every 10 secs = 1 rep)");
await clickText("Plank Hold", ".ex-pill");                    // timed movement (not Plank Jacks)
okBody("10 secs = 1 rep", "timed conversion shown on exercise detail");
await clickText("Log a set");
okBody("Every 10 seconds = 1 rep", "timed movement conversion explained");
ok(await exists("#hold-timer"), "hold timer ready");
await shot("log-timed");
await clickText("START HOLD");
await sleep(11_000);                                           // a real hold — ≥10s scores 1 rep
const heldFor = await text("#hold-timer");
ok(!!heldFor && heldFor.trim() !== "00:00", `hold timer ran (${heldFor})`);
await clickText("STOP");                                       // stop drops onto confirm
okBody("CONFIRM SET", "stopped hold lands on the confirm screen");
ok(await evalJs("/\\bsecs\\b/i.test(document.body.innerText || '')"), "amount shown in seconds (timed unit)");
await clickText("Log it");
await sleep(250);
ok(await bodyHas("REPS") || (await bodyHas("logged")), "timed set logged (secs → reps conversion)");
await clickText("Log another");
await clickText("Push-ups", ".ex-pill");                      // exercise detail path
okBody("Conversion", "exercise detail shows conversion + variations");
await clickText("Log a set");
for (const k of ["1", "9", "5"]) await clickText(k, ".keypad button"); // keypad entry
await clickText("Next");
okBody("195", "keypad amount carried to confirm");
await clickText("Log it");

console.log("— FIRST PLAYER DAILY WIN MOMENT");
await sleep(400);
ok(await exists(".oval"), "winner overlay appeared");
ok((await text(".o-title")) === "YOU WON THE DAY", "YOU WON THE DAY — the dopamine moment");
okBody("first to", "win framed as first-to-target");
ok(await exists(".confetti"), "confetti fired");
const png = await evalJs("(window.rwfLastSharePng || '').slice(0, 22)");
ok(png.startsWith("data:image/png") && (await evalJs("(window.rwfLastSharePng || '').length")) > 5000, "canvas share card rendered (win card → PNG)");
ok(await bodyHas("Save PNG"), "PNG share button offered");
await shot("you-won");
const w1 = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[0]; return JSON.stringify({ winnerId: b.winnerId, points: g.seasons[0].core.points[b.winnerId], completions: Object.keys(b.completions).length, status: b.status }); })()`);
const w1o = JSON.parse(w1);
ok(w1o.winnerId === me, "Daily Win awarded to me in engine state");
ok(w1o.winnerId === me, "Daily Win flag on the battle (season point accrues at day close)");
ok(w1o.status === "live", "battle CONTINUES after the Daily Win (bank-day model)");
await clickText("Back to battle");
okBody("took the Daily Win", "battle home shows the win banner");

console.log("— RIVAL COMPLETES (banks the day) · THIRD PLAYER FAILS AT DEADLINE");
await driveLog(priya.id, "pushups", 100);                     // Priya → 200 = banked
await sleep(300);
okBody("BANKED", "leaderboard flags Priya as banked");
st = await snapState();
ok(st.members.find((m) => m.id === priya.id).streak === 1, "Priya's bank streak = 1");
await waitBattleStatus(1, "ended", 150_000);                  // real 2-minute sprint deadline
st = await snapState();
ok(st.battle && st.battle.idx === 2 && st.battle.status === "live", "deadline resolved → battle 2 (Tue) live");
{
  const pts1 = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons[0].core.points[${JSON.stringify(me)}] || 0; })()`);
  ok(pts1 === 1, "1 Daily Win = 1 season point (recorded at day close by the shared engine)");
}
const b1 = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[0]; return JSON.stringify({ failures: b.failures, jackIn: b.failures.includes(${JSON.stringify(jack.id)}), marcoIn: b.failures.includes(${JSON.stringify(marco.id)}) }); })()`);
const b1o = JSON.parse(b1);
ok(b1o.jackIn && b1o.marcoIn, "FAILED DAY recorded for the third (and fourth) player");
okBody("Battle 1 recap", "battle 1 recap reachable while battle 2 runs");
await clickText("Battle 1 recap");
okBody("BATTLE RECAP", "recap overlay");
okBody("KEY MOMENTS", "recap key moments (steal + win)");
await shot("recap");
await clickText("Close");
await langClean("recap");

console.log("— SEASON HUB (weekly standings · calendar · stake)");
await click(".topbar .icon-btn");                             // trophy → season hub
okBody("WEEKLY STANDINGS", "season hub standings");
okBody("SEASON CALENDAR", "season calendar");
st = await snapState();
ok(st.season.points[me] === 1, "standings: me 1 Daily Win");
okBody("$40.00", "charity pot = 4 × $10 contributions");
okBody("$2.00", "5% fee shown ($2.00)");
await shot("season");
await langClean("season hub");
await click(".topbar .icon-btn");                             // back → battle

console.log("— DAY 2 · SURPRISE BOMB HIT + MISS · LIGHTNING ×3 · SECOND DAILY WIN");
await clickText("Power-Ups");
for (let i = 0; i < 10; i++) {
  const more = await evalJs(`(() => { const c = document.querySelector('.pu-card:not(.revealed)'); if (c) { c.click(); return true; } return false; })()`);
  if (!more) break;
  await sleep(140);
}
await sleep(250);
ok(await evalJs(`(() => { for (const c of document.querySelectorAll('.pu-card.revealed')) { if (c.textContent.toUpperCase().includes('SURPRISE BOMB')) { c.click(); return true; } } return false; })()`), "Surprise Bomb card in stack");
await sleep(300);
await clickText("Jack (");                                    // bomb on Jack
await clickText("Confirm");
okBody("BOMB OUT", "bomb activation moment");
await clickText("Done");
// HIT: Jack clears the +20 inside the fuse (couch ×1.5 → 14 physical = 21 adjusted)
await driveLog(jack.id, "pushups", 14);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[1]; return b.bombs[0] && b.bombs[0].status === 'defused'; })()`).catch(() => false), { label: "bomb defused", timeout: 10_000 });
ok(true, "bomb HIT — defused inside the fuse (victim banks the +20 bonus)");
await driveLog(marco.id, "squats", 5);                        // Marco on the board (small)
await sleep(150);
// MISS run: Jack drops his Surprise Bomb on Marco through the same engine API
// the UI drives (house cards came from the same founder pack). The daily card
// drop is RNG, so Jack is GRANTED the card first via the exposed core engine
// (RWFSoT.engine === apps/sot-engine.js — the same API the app drives).
await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[1]; b.core = RWFSoT.engine.grantPowerUp(b.core, ${JSON.stringify(jack.id)}, 'surprise_bomb'); return true; })()`);
const bomb2 = await evalJs(`RWFSoT.activateCard(RWFSoT.state.activeGroupId, ${JSON.stringify(jack.id)}, 'surprise_bomb', ${JSON.stringify(marco.id)})`);
ok(bomb2 && bomb2.ok, `second bomb thrown (Jack → Marco, via engine)${bomb2 && bomb2.error ? ` — engine said: ${bomb2.error}` : ""}`);
// the fuse is a real 10-minute engine window; demo time-travel pulls THIS
// bomb's deadline into the past so the per-second tick resolves the fizzle
// through the genuine Core.resolveExpiredBombs path (nothing sticks).
await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[1]; const core = b.core.bombs[b.core.bombs.length - 1]; core.deadline = Date.now() - 1000; return core.id; })()`);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[1]; return b.bombs.some(x => x.status === 'fizzled'); })()`).catch(() => false), { label: "bomb fizzled (fuse expired)", timeout: 20_000 });
st = await snapState();
const marcoRow = st.board.find((r) => r.id === marco.id);
ok(marcoRow.dayTarget === 200, `bomb MISS — it fizzled, Marco's target stays ${marcoRow.dayTarget} (shared-engine semantics)`);
// LIGHTNING ×3 on a real log
await clickText("Power-Ups");
await sleep(200);
ok(await evalJs(`(() => { for (const c of document.querySelectorAll('.pu-card.revealed')) { if (c.textContent.toUpperCase().includes('LIGHTNING')) { c.click(); return true; } } return false; })()`), "Lightning Round card");
await sleep(300);
await clickText("Activate Lightning");
await clickText("Confirm");
// lightning gets the FULL-SCREEN 10-minute storm moment (#142), not a cardResult
ok((await exists(".oval.storm")) && (await bodyHas("counts TRIPLE")), "lightning full-screen storm moment");
ok(await exists("#storm-t"), "storm fuse clock live (10-minute window)");
await clickText("Back");
ok(await exists(".fx-pill.lightning") || await bodyHas("×3"), "lightning active state visible");
await clickText("LOG");
await clickText("Push-ups", ".ex-pill");
await clickText("Log a set");
for (const k of ["1", "0"]) await clickText(k, ".keypad button");
await clickText("Next");
okBody("⚡ ×3 active", "confirm shows the ×3 multiplier");
await clickText("Log it");
okBody("+30 REPS", "10 push-ups scored 30 reps under Lightning ×3");
await clickText("Log another");
// second Daily Win: read current adjusted, keypad the rest
st = await snapState();
const need = Math.max(0, st.board.find((r) => r.id === me).dayTarget - st.board.find((r) => r.id === me).adjusted + 5);
await clickText("Push-ups", ".ex-pill");
await clickText("Log a set");
for (const ch of String(need).split("")) await clickText(ch, ".keypad button");
await clickText("Next");
await clickText("Log it");
await sleep(400);
ok((await text(".o-title")) === "YOU WON THE DAY", "second Daily Win moment");
await clickText("Back to battle");
await driveLog(priya.id, "pushups", 200);                     // Priya banks day 2 (streak 2)
await sleep(300);

console.log("— SEASON END + CHARITY RESOLUTION (winner chooses)");
await waitBattleStatus(2, "ended", 150_000);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const s2 = g.seasons[0]; return s2.status === 'ended'; })()`).catch(() => false), { label: "season 1 ended" });
await sleep(600);                                             // detectMoments → season winner overlay
okBody("SEASON CHAMPION", "season winner moment (me, 2 Daily Wins)");
const endState = JSON.parse(await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const se = g.seasons[0]; return JSON.stringify({ status: se.status, winnerId: se.winnerId, points: se.core.points, res: se.stakeResolution }); })()`));
ok(endState.status === "ended" && endState.winnerId === me, "season resolved to me in state");
ok(endState.points[me] === 2, "weekly standings reflect: 2 Daily Wins = 2 points");
await clickText("Resolve the stake");                         // → charity chooser
okBody("CHOOSE THE CHARITY", "winner-chooses charity flow");
okBody("$38.00", "post-fee donation amount shown ($38 of $40)");
okBody("$2.00", "fee line item in chooser");
await shot("stake");
await clickText("Beyond Blue");
await sleep(300);
okBody("DONATION CONFIRMED", "donation confirmation + receipt");
okBody("Beyond Blue".toUpperCase(), "charity named");
const res = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return JSON.stringify(g.seasons[0].stakeResolution); })()`);
const resO = JSON.parse(res);
ok(resO.status === "donated" && resO.donateCents === 3800 && resO.feeCents === 200 && resO.charityName === "Beyond Blue", `stake resolved in state: $${resO.donateCents / 100} → ${resO.charityName}, fee $${resO.feeCents / 100}`);
await shot("stake-donated");
await clickText("Season hub");
await sleep(300);
if (!(await bodyHas("Beyond Blue"))) console.log(`    [season-hub miss — screen: ${await dump()}]`);
okBody("Beyond Blue", "season hub shows the donation outcome");

console.log("— FEED REACTIONS + PROFILE STATS");
await clickText("Feed");
ok((await evalJs(`document.querySelectorAll('.feed-item').length`)) >= 10, "feed carries the season's story");
await clickText("🔥", ".react-row button");
okBody("🔥 1", "reaction registered");
await clickText("Profile");
okBody("DAILY WINS", "profile stat grid");
okBody("🔥 2", "streak stat = 2 (two banked days)");
await shot("profile");
await langClean("profile");

console.log("— JOIN FLOW (second player: code → preview → stake agreement)");
await clickText("Switch player");                             // profile keeps groups, new identity
await sleep(300);
const vprint = (m) => evalJs(`window.__rwfV4 ? window.__rwfV4.view : "?"`).then((v) => console.log(`    [${m} → view: ${v}]`));
await click("button.btn");                                    // Let's go (welcome again)
await sleep(200); await vprint("letsgo");
await clickText("Next"); await sleep(150);
await clickText("Next"); await sleep(150);                    // explainers 2 + 3
await vprint("explainers");
await clickText("Create profile"); await sleep(260);
await vprint("create-profile");
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); if (!i) return "NO-INPUT"; i.value = 'Sam'; return "ok"; })()`).then((r) => { if (r !== "ok") console.log("    [name input missing!]"); });
await clickText("Next"); await sleep(200);
await vprint("name-next");
await clickText("Next"); await sleep(200);                    // avatar
await vprint("avatar-next");
await clickText("Done"); await sleep(260);                    // tone → start
await vprint("done");
await clickText("🎟️ Join with a code");
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = ${JSON.stringify(CODE)}; return true; })()`);
await shot("join-code");
await clickText("Preview group");
okBody("Gold Squad".toUpperCase(), "join preview shows the group");
okBody("Individual", "join preview: mode");
okBody("200 adjusted reps", "join preview: target");
okBody("Mon · Tue", "join preview: battle days");
okBody("STAKE — CHARITY", "join preview: stake disclosed up-front");
await clickText("Review stake");
okBody("winner directs", "stake acceptance explains winner-directs pot");
await clickText("Agree & contribute");
okBody("YOU'RE IN", "join successful");
await shot("joined");
await clickText("To the battle");
okBody("GOLD SQUAD", "battle appears on Home for the joiner");
ok((await bodyHas("SEASON OVER")) || (await bodyHas("Start next season")), "season-ended state honest for a mid-cycle joiner");
const joinedState = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const m = g.members.find(x => x.name === 'Sam'); return JSON.stringify({ joined: !!m, agreed: m ? m.stakeAgreed : false, players: g.members.length }); })()`);
const jO = JSON.parse(joinedState);
ok(jO.joined && jO.agreed && jO.players === 5, `Sam joined + agreed to the stake (crew now ${jO.players})`);
await langClean("join flow");

console.log("— DESKTOP 1280 + REDUCED MOTION");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(400);
ok(await evalJs(`document.documentElement.scrollWidth <= window.innerWidth + 1`), "desktop 1280: no horizontal overflow");
await shot("desktop");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await sleep(300);
ok(await exists(".screen"), "reduced-motion emulation renders fine");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* ── gates ───────────────────────────────────────────────────────────── */
console.log("— LANGUAGE GATE (source files)");
// The product rule is about UI COPY ("reps", never the internal unit): scan
// quoted string literals (what the UI can print), with ${…} interpolations
// stripped — engine identifiers (e.ruf) and code comments are not UI strings.
{
  const { readFileSync } = await import("node:fs");
  const srcFiles = ["app.js", "engine.js", "index.html", "sot.css", "sfx.js"].map((f) => join(HERE, f));
  const uiStrings = [];
  for (const f of srcFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\n\\])*)\1/g)) {
      uiStrings.push(m[2].replace(/\$\{[^}]*\}/g, " "));
    }
  }
  const bad = uiStrings.filter((s) => /\bmatch(?:es|ed|ing)?\b|\bkitty\b|\bpoker\b|\bRUF\b|\b300\b/i.test(s));
  ok(bad.length === 0, `no banned words in app UI strings (match/kitty/poker/RUF/300)${bad.length ? ` — offenders: ${JSON.stringify(bad.slice(0, 4))}` : ""}`);
}
const needGrep = Bun.spawnSync(["bash", "-c",
  `for w in "Daily Win" "banked" "reps"; do rg -q "$w" ${HERE}/app.js && echo "$w:yes" || echo "$w:NO"; done`]);
const langRows = needGrep.stdout.toString().trim().split("\n");
ok(langRows.every((r) => r.endsWith(":yes")), `battle language present: ${langRows.join(" · ")}`);

console.log("— CONSOLE GATE");
ok(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length}${consoleErrors.length ? ": " + consoleErrors[0] : ""})`);
consoleErrors.slice(0, 5).forEach((e) => console.log("    ·", e));

/* ── teardown ────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step} checks passed`);
server.stop(true);
try { proc.kill("SIGTERM"); } catch {}
await sleep(400);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗", f));
  process.exit(1);
} else {
  console.log("ALL GREEN — the Source of Truth app walks its own spec end to end.");
  process.exit(0);
}
