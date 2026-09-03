/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — CRITICAL STATES e2e (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The SOT's designed critical states, on the real app (seeded demo crew):
     1 · OFFLINE / RECONNECTING (#103 + #104 + #120) — the connection
         shim: settings toggle "simulate offline" → banner → logs queue
         locally with a badge on the LOG button → toggle back →
         RECONNECTING beat → queued sets replay.
     2 · SYNC CONFLICT (#105 + #119) — a queued set that raced a log
         which already landed → the warning sheet → drop-mine resolution;
         plus the plain duplicate warning on a live submit (confirm/undo).
     3 · REST-DAY HOME (#29 + #101) — no battle today, streak-safe
         messaging, next battle day + countdown.
     4 · BATTLE COMPLETE BUT SEASON LIVE (#102) — winner-known
         transition with tomorrow framing (live + ended halves).
   Zero console errors. Shots → apps/sot/shots/*_states.png (390×844 @2x).
   Run: bun apps/sot/e2e-states.mjs      (self-contained temp server)
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4195;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9231 + Math.floor(Math.random() * 400);

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: apps/sot at / + shared engine ─────────────────── */
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
      const f2 = Bun.file(join(HERE, "..", "sot-engine.js"));
      if (await f2.exists()) return new Response(f2, { headers: { "content-type": "text/javascript" } });
      return new Response("not found", { status: 404 });
    }
    const fsPath = p === "/" ? join(HERE, "index.html") : join(HERE, p.replace(/^\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      const ext = fsPath.slice(fsPath.lastIndexOf("."));
      return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless ────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v4-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v4-states-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
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

/* ── 3. minimal CDP client ──────────────────────────────────────────── */
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
  if (r === null) throw new Error(`clickText target missing: ${text}`);
  await sleep(240);
  return r;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_states.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
const dump = () => evalJs(`(document.body.innerText || '').replace(/\\n/g, ' | ').slice(0, 200)`);
const okBody = async (s, label) => { const r = await bodyHas(s); if (!r) console.log(`    [miss "${s}" — screen: ${await dump()}]`); ok(r, label); };
const snapState = () => evalJs(`(() => { const s = RWFSoT.snapshot(); return JSON.parse(JSON.stringify({ gid: s.group.id, battle: s.battle ? { idx: s.battle.idx, status: s.battle.status, winnerId: s.battle.winnerId } : null, board: s.board.map(r => ({ id: r.member.id, name: r.member.name, adjusted: r.adjusted })), me: s.me ? { id: s.me.id } : null, members: s.group.members.map(m => ({ id: m.id, name: m.name })) })); })()`);
const driveLog = (memberId, ex, physical) =>
  evalJs(`RWFSoT.logRepsAs(RWFSoT.state.activeGroupId, ${JSON.stringify(memberId)}, ${JSON.stringify(ex)}, ${physical})`);
const myAdjusted = () => evalJs(`(() => { const s = RWFSoT.snapshot(); const r = s.board.find(x => x.member.id === s.me.id); return r ? r.adjusted : -1; })()`);

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V4 SoT STATES E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.RWFSoT && document.querySelector('.screen') !== null`).catch(() => false),
  { label: "v4 app load", timeout: 20000 }
);
await sleep(600);

/* seed the demo crew — a live mid-battle group with a bomb in flight */
await clickText("Jump into a live demo battle");
await sleep(700);
let st = await snapState();
const me = st.me.id;
const priya = st.members.find((m) => m.name === "Priya");
const demoGid = st.gid;
ok(st.battle && st.battle.status === "live", "demo battle live (seeded crew)");
ok(st.members.length === 4, "4 players on the roster");
// the seed throws a live Surprise Bomb at me — expire it up-front so the
// board arithmetic below is exactly the logged reps (no ±20 defusal bonus)
await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[0]; for (const c of b.core.bombs) c.deadline = Date.now() - 1000; return true; })()`);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[0]; return b.bombs.length > 0 && b.bombs.every(x => x.status !== 'live'); })()`).catch(() => false), { label: "seed bomb fizzled", timeout: 15000 });
ok(true, "seed bomb fizzled clean (no target growth, no defusal bonus)");
ok((await myAdjusted()) === 0, "board starts at zero for me");

/* ══ 1 · OFFLINE / RECONNECTING (#103/#104/#120) ═══════════════════ */
console.log("— OFFLINE / RECONNECTING (#103 + #104 + #120)");
await clickText("Profile");
ok(await exists("#offline-toggle"), "settings: 'Simulate offline' toggle present");
await click("#offline-toggle");                                // go offline
await sleep(300);
ok(await exists("#conn-banner"), "offline banner appears (#104)");
okBody("OFFLINE — you can keep logging", "banner says logging still works");
okBody("sync the moment you're back", "banner explains the queue behaviour");
await shot("offline-banner");

await clickText("LOG");                                        // central log tab
await clickText("40", ".preset");                              // 40 push-ups preset
await clickText("Log it");
okBody("QUEUED — SAVED OFFLINE", "offline log queues instead of submitting (#120)");
okBody("1 set waiting to sync", "queued screen explains the sync promise");
ok(await exists("#queue-badge"), "queued-log badge on the LOG button");
ok((await text("#queue-badge")) === "1", "badge counts 1 queued set");
await shot("offline-queued");
ok((await myAdjusted()) === 0, "queued set NOT applied to the board while offline");

await clickText("Log another");
await clickText("30", ".preset");                              // 30 squats preset → also queued
await clickText("Log it");
ok((await text("#queue-badge")) === "2", "badge counts 2 queued sets");

/* ══ 2a · SYNC CONFLICT on replay (#105) ═══════════════════════════ */
console.log("— SYNC CONFLICT (#105): queued set raced a landed log");
// the same push-up set lands engine-side while we're offline (another
// device / a retry that got through) — replay must now collide
await driveLog(me, "pushups", 40);
await sleep(200);
await clickText("Profile");
await click("#offline-toggle");                                // back online
await sleep(200);
ok(await exists("#conn-banner"), "reconnecting banner shows the retry beat (#103)");
okBody("RECONNECTING", "reconnecting state labelled");
await shot("reconnecting");
await waitFor(() => evalJs(`!!document.querySelector('#sync-conflict')`).catch(() => false), { label: "sync conflict sheet", timeout: 8000 });
ok(await exists("#sync-conflict"), "sync conflict sheet appears (#105)");
okBody("SYNC CONFLICT", "conflict titled");
okBody("queued", "conflict names the queued set");
okBody("already on the board", "conflict explains the collision");
await shot("sync-conflict");
// squats should have replayed clean while the conflict waits for a human
ok((await myAdjusted()) === 70, "non-conflicting set synced (40 landed + 30 replayed)");
ok((await evalJs(`window.__rwfConn.queue.length`)) === 1, "only the conflicting set still queued");
await clickText("Drop mine");                                  // undo the double
await sleep(300);
ok((await evalJs(`window.__rwfConn.queue.length`)) === 0, "conflict resolved — queue empty");
ok((await exists("#queue-badge")) === false, "badge clears after sync");
okBody("Sync complete — 1 kept, 1 dropped", "replay toast reports the outcome");
ok((await myAdjusted()) === 70, "board unchanged by the dropped duplicate");
ok((await exists("#conn-banner")) === false, "online again — banner gone");

/* ══ 2b · DUPLICATE WARNING on a live submit (#119) ════════════════ */
console.log("— DUPLICATE WARNING (#119): same exercise + reps inside 60s");
await clickText("LOG");
await clickText("40", ".preset");                              // push-ups 40 again, <60s later
await clickText("Log it");
await waitFor(() => evalJs(`!!document.querySelector('#dup-warn')`).catch(() => false), { label: "duplicate warning sheet", timeout: 6000 });
ok(await exists("#dup-warn"), "duplicate warning sheet appears (#119)");
okBody("POSSIBLE DUPLICATE", "warning titled");
okBody("40", "warning shows the amount in question");
okBody("Double-tapped buttons", "warning explains the likely cause");
await shot("dup-warn");
await clickText("Yes — log it anyway");                        // confirm: it was real
await sleep(300);
ok(await exists("#dup-warn") === false, "confirm dismisses the sheet");
ok((await myAdjusted()) === 110, "confirmed duplicate lands (+40 → 110)");
okBody("+40 REPS", "success screen after confirm");

await clickText("Log another");
await clickText("40", ".preset");                              // one more identical set
await clickText("Log it");
await waitFor(() => evalJs(`!!document.querySelector('#dup-warn')`).catch(() => false), { label: "duplicate warning again", timeout: 6000 });
ok(await exists("#dup-warn"), "warning fires again on the next identical set");
await clickText("Undo — not a double");                        // undo: nothing logged
await sleep(300);
ok(await exists("#dup-warn") === false, "undo dismisses the sheet");
okBody("CONFIRM SET", "undo returns to the confirm step (#118 semantics)");
ok((await myAdjusted()) === 110, "undo logged nothing (still 110)");
await clickText("LOG");                                        // leave the flow open on the sheet

/* ══ 3 · REST-DAY HOME (#29 + #101) ════════════════════════════════ */
console.log("— REST-DAY HOME (#29): no battle today, streak safe");
const restDay = await evalJs(`(() => {
  const d = (new Date().getDay() + 3) % 7; // always ≥3 days out → a real rest gap
  const g = RWFSoT.createGroup({ mode: "individual", name: "Rest Crew", icon: "🌙", activeDays: [d], clockMode: "window", stake: { type: "none" }, housePlayers: [{ name: "Ola", tier: "fit" }] });
  RWFSoT.startSeason(g.id);
  // a returning player with a live streak — the messaging that matters most
  g.members.find(m => m.id === RWFSoT.state.me.id).streak = 3;
  RWFSoT.state.activeGroupId = g.id; RWFSoT.save();
  return d;
})()`);
const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][restDay];
await clickText("Battle");                                     // re-render onto the new group
await sleep(300);
ok(await exists("#rest-day"), "rest-day home state renders (#29)");
okBody("REST DAY", "rest day titled");
okBody("3-day streak is SAFE on rest days", "streak-safe messaging (returning player)");
okBody("Next battle", "next battle day surfaced");
okBody(dayName, `next battle day named (${dayName})`);
okBody("Opens in", "countdown to the next battle");
okBody("🔥 streak 3", "streak chip carries onto the rest day");
await shot("rest-day");

/* ══ 4 · BATTLE COMPLETE BUT SEASON LIVE (#102) ════════════════════ */
console.log("— BATTLE COMPLETE, SEASON LIVE (#102): winner-known + tomorrow framing");
await evalJs(`(() => { RWFSoT.state.activeGroupId = ${JSON.stringify(demoGid)}; RWFSoT.save(); return true; })()`);
await clickText("Battle");
await sleep(300);
await driveLog(priya.id, "pushups", 160);                      // Priya → 204 = Daily Win
await waitFor(() => evalJs(`!!document.querySelector('.oval')`).catch(() => false), { label: "other-won moment", timeout: 8000 });
okBody("WON", "rival win moment interrupts (winners family)");
await shot("other-won");
await clickText("Bank my day");                                // close it → battle home
await sleep(200);
await clickText("Battle");
await waitFor(() => evalJs(`!!document.querySelector('#win-known')`).catch(() => false), { label: "winner-known card", timeout: 8000 });
ok(await exists("#win-known"), "winner-known transition card renders (#102, live half)");
okBody("Priya took the Daily Win", "winner named");
okBody("bank your own day", "bank-day continuation framing");
okBody("Tomorrow's angle", "tomorrow framing present");
okBody("season points still live", "season-alive context");
ok((await myAdjusted()) === 110, "my day is still open — battle continues after the win");
await shot("win-known");

/* ended half: time-travel the deadline → the engine resolves the day,
   next battle opens, the ended card frames tomorrow */
await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const b = g.seasons[0].battles[0]; b.core.config.deadlineAt = Date.now() - 1000; b.deadlineMs = Date.now() - 1000; return true; })()`);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons[0].battles[0].status === 'ended'; })()`).catch(() => false), { label: "battle 1 resolved", timeout: 15000 });
await sleep(800);                                              // detectMoments: my failed day pops
if (await exists(".oval")) {
  okBody("DAY MISSED", "failed-day moment for me (deadline passed at 110/200)");
  await clickText("Close");
  await sleep(200);
}
await clickText("Battle");
await waitFor(() => evalJs(`!!document.querySelector('#battle-complete')`).catch(() => false), { label: "battle-complete card", timeout: 8000 });
ok(await exists("#battle-complete"), "battle-complete card renders (#102, ended half)");
okBody("Battle 1 complete — season live", "ended battle framed against the living season");
okBody("Priya won the day", "winner restated on the ended card");
okBody("season points still on the line", "tomorrow framing carries the season stakes");
okBody("Battle 1 recap", "recap stays one tap from the ended card");
await shot("battle-complete");
st = await snapState();
ok(st.battle && st.battle.idx === 2 && st.battle.status === "live", "battle 2 opened — the season rolls on");

/* ── gates ──────────────────────────────────────────────────────────── */
console.log("— CONSOLE GATE");
ok(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length}${consoleErrors.length ? ": " + consoleErrors[0] : ""})`);
consoleErrors.slice(0, 5).forEach((e) => console.log("    ·", e));

/* ── teardown ───────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step} checks passed`);
server.stop(true);
try { proc.kill("SIGTERM"); } catch {}
await sleep(400);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗", f));
  process.exit(1);
} else {
  console.log("ALL GREEN — the SOT critical states walk their own spec.");
  process.exit(0);
}
