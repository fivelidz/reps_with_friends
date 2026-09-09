/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — CLOUD E2E (M1): THE TWO-PHONE TEST
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder question this answers: "why do the bots have to run on my
   system? Surely the reads should come from the app for each user."

   Two REAL browser contexts (two headless chromiums, two storages):
     · phone A creates a CLOUD group (Sync: Cloud on) → shared API group
     · phone B joins by code (not on-device — found on the API)
     · A logs reps → B's standings update from the 5s poll, B does NOTHING
     · B logs → A sees it
     · a "bot" (raw API client, the chat-brain path) logs → both see it
     · A wins the day → B's poll shows the winner; day closes for both;
       both see the SAME season result
   ZERO console errors in BOTH contexts. Screenshots: apps/sot/shots/*_cloud.
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PORT = 4195;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. the API (the shared game-state authority) — in-process ─────────── */
process.env.RWF_API_DB = `/tmp/rwf-cloud-e2e-crews-${Date.now()}.json`;
process.env.RWF_SOT_DB = `/tmp/rwf-cloud-e2e-sot-${Date.now()}.json`;
const { startServer } = await import("../api/src/main.ts");
const api = startServer(0);
const API_BASE = `http://127.0.0.1:${api.port}`;

/* ── 2. the app's static server (same harness as e2e.mjs) ──────────────── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = Bun.serve({
  port: APP_PORT,
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

/* ── 3. two headless phones = two chromiums (isolated storage) ─────────── */
const procs = [];
function launchPhone(tag, cdpPort) {
  const PROFILE = `/tmp/rwf-cloud-e2e-${tag}-${Date.now()}`;
  const proc = spawn(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${cdpPort}`, "--window-size=390,844",
    `--user-data-dir=${PROFILE}`,
    "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
  procs.push(proc);
  return proc;
}
process.on("exit", () => { for (const p of procs) { try { p.kill("SIGKILL"); } catch {} } });

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition", dbg } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) {
      if (dbg) { try { console.log(`    [dbg ${label}] ${await dbg()}`); } catch (e) { console.log(`    [dbg failed] ${e.message}`); } }
      throw new Error(`timeout waiting for ${label}`);
    }
    await Bun.sleep(every);
  }
}

/* minimal CDP client per phone */
function makeClient(ws) {
  let msgId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener("message", (ev) => {
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
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return {
    ws, send, consoleErrors,
    async evalJs(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
  };
}

async function connectPhone(tag, cdpPort) {
  const proc = launchPhone(tag, cdpPort);
  await waitFor(async () => {
    try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); return r.ok; } catch { return false; }
  }, { label: `${tag} devtools endpoint`, timeout: 20000 });
  const tab = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const c = makeClient(ws);
  await c.send("Runtime.enable");
  await c.send("Log.enable");
  await c.send("Page.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  c.proc = proc;
  return c;
}

const sleep = (ms) => Bun.sleep(ms);
mkdirSync(SHOTS, { recursive: true });

const A = await connectPhone("phoneA", 9331);
const B = await connectPhone("phoneB", 9332);

/* per-phone helpers bound to a client */
const boot = (c) => async (url) => {
  await c.send("Page.navigate", { url });
  await waitFor(() => c.evalJs(`document.readyState === 'complete' && window.RWFSoT && window.RWFCloud && document.querySelector('.screen') !== null`).catch(() => false), { label: "v4 app + cloud module load", timeout: 20000 });
  await sleep(600);
};
const click = (c) => async (sel) => {
  const r = await c.evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`[${c === A ? "A" : "B"}] click target missing: ${sel}`);
  await sleep(240);
};
const clickText = (c) => async (text, scope = "button, .pick, .ex-pill, .preset, .pu-card") => {
  const r = await c.evalJs(`(() => {
    const want = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll('${scope}')];
    let hit = els.find(el => (el.textContent || '').trim() === want)
           || els.find(el => (el.textContent || '').trim().startsWith(want));
    if (!hit) hit = els.find(el => (el.textContent || '').includes(want));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 30); }
    return null;
  })()`);
  if (r === null) {
    const screen = await c.evalJs(`(document.body.innerText || '').replace(/\\n/g, ' | ').slice(0, 180)`).catch(() => "?");
    throw new Error(`[${c === A ? "A" : "B"}] clickText target missing: ${text} — screen: ${screen}`);
  }
  await sleep(240);
  return r;
};
const exists = (c) => (sel) => c.evalJs(`!!document.querySelector('${sel}')`);
const bodyHas = (c) => (s) => c.evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
const shot = (c) => async (name) => {
  const r = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_cloud.png`), Buffer.from(r.data, "base64"));
};
const boardOf = (c) => c.evalJs(`(() => {
  try {
  const s = RWFSoT.snapshot();
  return s ? { code: s.group.cloud ? s.group.cloud.code : null,
    battle: s.battle ? { status: s.battle.status, winnerId: s.battle.winnerId || null } : null,
    board: s.board.map(r => ({ name: r.member.name, adjusted: r.adjusted, dayTarget: r.dayTarget, completed: r.completed, isWinner: r.isWinner })),
    battles: (s.season ? s.season.battles : []).map(b => ({ idx: b.idx, status: b.status, winnerId: b.winnerId || null })),
    season: s.season ? { status: s.season.status, points: (s.season.core && s.season.core.points) || {} } : null,
    members: s.group.members.map(m => m.name) } : null;
  } catch (e) { return { snapError: String(e && e.message || e) }; }
})()`);

/* ═══════════════════════ THE WALK ═══════════════════════════════════ */
console.log(`\nRWF V4 CLOUD E2E — app ${BASE} · api ${API_BASE} · two phones\n`);

async function onboard(c, name) {
  await boot(c)(`${BASE}/`);
  await click(c)("button.btn");                    // Let's go
  await clickText(c)("Next");                      // explainer 2
  await clickText(c)("Next");                      // explainer 3
  await clickText(c)("Create profile");            // → name
  await c.evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = ${JSON.stringify(name)}; return true; })()`);
  await clickText(c)("Next");                      // → avatar
  await click(c)(".grid3 .pick");
  await clickText(c)("Next");                      // → tone
  await clickText(c)("Done");                      // → start
  await waitFor(() => c.evalJs(`(document.body.innerText || '').includes('Create a group')`).catch(() => false), { label: `${name} start screen` });
}

async function enableCloud(c) {
  // the Settings-on-start-screen row: point this phone at the shared API
  await c.evalJs(`(() => {
    const sel = document.getElementById('sync-mode-start');
    sel.value = 'cloud';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await c.evalJs(`RWFCloud.setApiBase(${JSON.stringify(API_BASE)})`);
  await sleep(300);
  return c.evalJs(`RWFCloud.mode()`);
}

console.log("— PHONE A: onboard → Sync: Cloud → create the shared group");
await onboard(A, "Alexei");
ok(await bodyHas(A)("JOIN THE BATTLE"), "A onboarded to the start screen");
ok((await enableCloud(A)) === "cloud", "A switched Sync → Cloud (pilot)");
await shot(A)("a-start-cloud");

// the wizard (individual · Mon+Tue · 200 · 60-min sprint · cards on)
await clickText(A)("⚔️ Create a group");
await clickText(A)("Next");                        // mode
await A.evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = 'Cloud Crew'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await clickText(A)("Next");                        // identity
await clickText(A)("Next");                        // invite (house crew on)
await clickText(A)("Next");                        // days
await clickText(A)("Sprint");                      // battle clock
await A.evalJs(`(() => { const i = document.querySelector('input[type=number]'); i.value = '60'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await clickText(A)("Next");                        // target+clock
for (let i = 0; i < 8; i++) {                      // handicap → exercises → season → stake → power-ups → review
  const onReview = await A.evalJs(`(document.body.innerText || '').includes('REVIEW & CREATE')`);
  if (onReview) break;
  await clickText(A)("Next");
}
await clickText(A)("⚔️ Create the group");          // → created overlay
ok(await exists(A)(".oval"), "created overlay shows");

// the cloud twin: finishWizard fired createForLocalGroup — wait for the code
let CODE = null;
await waitFor(async () => {
  CODE = await A.evalJs(`(() => { const s = RWFSoT.state; const g = s.groups[s.activeGroupId]; return g && g.cloud ? g.cloud.code : null; })()`);
  return !!CODE;
}, { timeout: 15000, every: 250, label: "cloud group created on the API" });
ok(/^[A-Z2-9]{5}$/.test(CODE), `cloud group ${CODE} registered on apps/api (join code works on any phone)`);
const apiMeta = await fetch(`${API_BASE}/sot/groups/${CODE}`).then((r) => r.json());
ok(apiMeta.players.length === 4, `API group roster = 4 (Alexei + 3 house bots registered as players)`);

await clickText(A)("Start the season");            // local mirror goes live
await waitFor(async () => {
  const s = await boardOf(A);
  return s && s.battle && s.battle.status === "live" && s.board.length >= 4;
}, { timeout: 12000, every: 300, label: "A battle live with the shared roster" });
ok(true, "A's battle is live — server truth merged into the local mirror");
await sleep(800);
await shot(A)("a-battle-cloud");

console.log("— PHONE B: onboard → cloud → JOIN BY CODE (group is not on B's device)");
await onboard(B, "Bea");
ok(await bodyHas(B)("JOIN THE BATTLE"), "B onboarded to the start screen");
ok((await enableCloud(B)) === "cloud", "B switched Sync → Cloud (pilot)");
await clickText(B)("🎟️ Join with a code");
await B.evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = ${JSON.stringify(CODE)}; return true; })()`);
await clickText(B)("Preview group");               // local lookup misses → cloud lookup
await waitFor(async () => bodyHas(B)("Live on the crew server"), { timeout: 8000, every: 200, label: "cloud preview" });
ok(await bodyHas(B)("CLOUD CREW"), "cloud preview shows the crew name from the API");
await shot(B)("b-cloud-preview");
await clickText(B)("I'm in — join the shared game");
await waitFor(async () => bodyHas(B)("YOU'RE IN"), { timeout: 10000, every: 200, label: "B joined" });
await clickText(B)("To the battle");
await waitFor(async () => {
  const s = await boardOf(B);
  return s && s.battle && s.battle.status === "live" && s.board.length >= 4;
}, { timeout: 12000, every: 300, label: "B battle live (shared day)",
  dbg: async () => JSON.stringify(await boardOf(B)) });
ok(true, "B is in the SAME battle — same target, same roster");
await sleep(800);
await shot(B)("b-battle-cloud");

console.log("— A LOGS → B's board updates FROM THE POLL (B does nothing)");
await A.evalJs(`window.__rwfTabTo('log')`);
await sleep(300);
await click(A)(".preset");                          // first quick-log preset
await clickText(A)("Log it");                       // optimistic local log + API post
await waitFor(async () => {
  const s = await boardOf(A);
  const me = s.board.find((r) => r.name === "Alexei");
  return me && me.adjusted > 0;
}, { timeout: 8000, every: 200, label: "A's own log lands" });
const aBoard1 = await boardOf(A);
const aLog = aBoard1.board.find((r) => r.name === "Alexei").adjusted;
ok(aLog > 0, `A logged ${aLog} adjusted reps (UI → engine → API)`);

// B is IDLE — only the 5s poll runs
const bBefore = await boardOf(B);
await waitFor(async () => {
  const s = await boardOf(B);
  const alexei = s.board.find((r) => r.name === "Alexei");
  return alexei && alexei.adjusted >= aLog;
}, { timeout: 9000, every: 250, label: "B's poll picks up A's log" });
const bBoard1 = await boardOf(B);
ok(bBoard1.board.find((r) => r.name === "Alexei").adjusted === aLog,
  `B's standings show Alexei at ${aLog} — updated by the poll alone (no B action)`);
await shot(B)("b-sees-a_cloud");

console.log("— B LOGS → A's board updates FROM THE POLL");
await B.evalJs(`window.__rwfTabTo('log')`);
await sleep(300);
await click(B)(".preset");
await clickText(B)("Log it");
const bLog = await waitFor(async () => {
  const s = await boardOf(B);
  const bea = s.board.find((r) => r.name === "Bea");
  return bea && bea.adjusted > 0 ? bea.adjusted : false;
}, { timeout: 8000, every: 200, label: "B's own log lands" });
await waitFor(async () => {
  const s = await boardOf(A);
  const bea = s.board.find((r) => r.name === "Bea");
  return bea && bea.adjusted >= bLog;
}, { timeout: 9000, every: 250, label: "A's poll picks up B's log" });
ok(true, `A's standings show Bea at ${bLog} — poll-only again`);
await sleep(600);

console.log("— THE BOT (same API, chat-brain path) LOGS → BOTH PHONES SEE IT");
const botJoin = await fetch(`${API_BASE}/sot/groups/${CODE}/players`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Coach", tier: "fit" }),
}).then((r) => r.json());
const botLog = await fetch(`${API_BASE}/sot/groups/${CODE}/cmd`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ playerToken: botJoin.playerToken, text: "log pushups 80" }),
}).then((r) => r.json());
ok(botLog.ok && botLog.reply.includes("Coach"), `bot logged via /cmd: ${botLog.reply.split("\n")[0]}`);
await waitFor(async () => {
  const sa = await boardOf(A);
  const sb = await boardOf(B);
  const ca = sa.board.find((r) => r.name === "Coach");
  const cb = sb.board.find((r) => r.name === "Coach");
  return ca && cb && ca.adjusted >= 80 && cb.adjusted >= 80;
}, { timeout: 9000, every: 250, label: "both phones see the bot's reps via their polls" });
ok(true, "bot reps visible on BOTH phones — no bot code on either device");

/* mid-sync shot: both frames side by side */
await shot(A)("a-midsync");
await shot(B)("b-midsync");

console.log("— A WINS THE DAY → the day closes for BOTH, same winner");
// A's big set crosses the 200 adjusted target — page-driver seam (the same
// engine + cloud calls the UI's applySet makes), big reps so it's decisive
const bigLog = await A.evalJs(`(async () => {
  const s = RWFSoT.state;
  const r = RWFSoT.logRepsAs(s.activeGroupId, s.me.id, 'pushups', 250);
  await window.RWFCloud.afterLocalLog(s.activeGroupId, 'pushups', 250);
  return r;
})()`);
ok(bigLog && !bigLog.error && bigLog.completion && bigLog.completion.kind === "win",
  `A banked the Daily Win (250 pushups → ${bigLog && bigLog.adjustedTotal} adjusted)`);
// force-close settles the shared day (ops/demo verb through the same API)
const close = await A.evalJs(`RWFCloud.closeDay(RWFSoT.state.activeGroupId)`);
ok(!close.error, "day close force accepted by the API");
const seasonWinner = (s) => {
  const done = (s.battles || []).find((b) => b.status !== "live" && b.winnerId);
  return done ? done.winnerId : null;
};
await waitFor(async () => {
  const sb = await boardOf(B);
  return !!seasonWinner(sb);
}, { timeout: 12000, every: 250, label: "B's poll sees the closed day + winner",
  dbg: async () => JSON.stringify(await boardOf(B)) });
const aFinal = await boardOf(A);
const bFinal = await boardOf(B);
const winnerA = seasonWinner(aFinal);
const winnerB = seasonWinner(bFinal);
ok(!!winnerA && !!winnerB, "the closed day shows a winner on both phones");
ok(winnerA === winnerB, `BOTH phones see the same winner (player ${winnerA})`);
ok((aFinal.season.points || {})[winnerA] === 1 && (bFinal.season.points || {})[winnerB] === 1,
  "the Daily Win is 1 season point on BOTH phones (server season truth)");
ok((aFinal.battles || []).some((b) => b.idx === 1 && b.status !== "live")
  && (bFinal.battles || []).some((b) => b.idx === 1 && b.status !== "live"), "the day is closed on both phones");
await shot(A)("a-recap_cloud");
await shot(B)("b-recap_cloud");

console.log("— SIDE-BY-SIDE SHOT (mid-sync, both frames)");
try {
  const a = join(SHOTS, "zz-a.png"), b = join(SHOTS, "zz-b.png");
  const ra = await A.send("Page.captureScreenshot", { format: "png" });
  const rb = await B.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(a, Buffer.from(ra.data, "base64"));
  writeFileSync(b, Buffer.from(rb.data, "base64"));
  const sideBySide = join(SHOTS, "99-two-phones-sync_cloud.png");
  const im = spawnSync(["convert", a, b, "+append", sideBySide].join(" "), { shell: true });
  if (im.status !== 0) {
    const pil = spawnSync(`python3 -c "from PIL import Image; a=Image.open('${a}'); b=Image.open('${b}'); c=Image.new('RGB',(a.width+b.width+12,max(a.height,b.height)),(7,7,12)); c.paste(a,(0,0)); c.paste(b,(a.width+12,0)); c.save('${sideBySide}')"`, { shell: true });
    if (pil.status !== 0) throw new Error("no compositor");
  }
  ok(true, "two-phone side-by-side saved → shots/99-two-phones-sync_cloud.png");
} catch (e) {
  ok(false, `side-by-side composite failed (${e.message})`);
}

console.log("— CONSOLE GATES (both phones)");
ok(A.consoleErrors.length === 0, `phone A: zero console errors (got ${A.consoleErrors.length}${A.consoleErrors.length ? ": " + A.consoleErrors[0] : ""})`);
ok(B.consoleErrors.length === 0, `phone B: zero console errors (got ${B.consoleErrors.length}${B.consoleErrors.length ? ": " + B.consoleErrors[0] : ""})`);
A.consoleErrors.slice(0, 5).forEach((e) => console.log("    A ·", e));
B.consoleErrors.slice(0, 5).forEach((e) => console.log("    B ·", e));

/* ── teardown ────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step} checks passed`);
server.stop(true);
api.stop(true);
for (const p of procs) { try { p.kill("SIGTERM"); } catch {} }
await sleep(400);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗", f));
  process.exit(1);
} else {
  console.log("ALL GREEN — two phones, one shared game, bots beside the API. The founder's question is answered.");
  process.exit(0);
}
