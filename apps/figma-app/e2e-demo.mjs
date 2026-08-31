/* ═══════════════════════════════════════════════════════════════════════
   RWF E2E-DEMO — the self-playing app demo, verified headless (v1.0.0).
   Zero deps: bun static server + chromium over CDP (same harness as
   e2e.mjs).

   Run 1 (protect mode — real save has a player, ?demo=1&speed=2):
     · the full tour runs: every scene in order, driving REAL state on the
       shadow key (rwf.figma.demo) — onboard → create → live → mates →
       comeback → lightning → danger zone → close → result → rematch →
       daily winner → season
     · the REAL key (rwf.figma.v1) is byte-identical the whole way through
     · end card → PLAY FOR REAL exits cleanly (shadow discarded)
   Run 2 (adopt mode — empty real save, skip-stormed):
     · end card offers KEEP THE DEMO CREW → the crew lands in the real key
   Timeline: the scripted 1× duration must sit in the 60–90s window.
   Screenshots: 5 demo moments + the About entry (suffix _demo).

   Run: bun apps/figma-app/e2e-demo.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4184;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9227;

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server ────────────────────────────────────────────────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const file = Bun.file(join(HERE, p.replace(/^\//, "")));
    if (await file.exists()) {
      return new Response(file, {
        headers: { "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. chromium headless ────────────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-demoe2e-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-demoe2e-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, { timeout = 30000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}

await waitFor(async () => {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; } catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
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
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, "base64"));
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

const demoState = () => evalJs(`localStorage.getItem('rwf.figma.demo')`);
const realState = () => evalJs(`localStorage.getItem('rwf.figma.v1')`);
const sceneNow = () => evalJs(`window.__rwfDemo?.sceneId ?? null`);
const pub = () => evalJs(`window.__rwfDemo ? { ...window.__rwfDemo, elapsedMs: undefined } : null`);

/** wait until the demo reaches a scene id (or the end card) */
async function atScene(id, { timeout = 45000 } = {}) {
  await waitFor(() => sceneNow().then((s) => s === id), { label: `scene ${id}`, timeout });
}
/** wait for a predicate over the SHADOW state (scenes run async of their start) */
async function demoStateHas(pred, label, timeout = 10000) {
  await waitFor(
    () => evalJs(`(JSON.parse(localStorage.getItem('rwf.figma.demo') ?? 'null'))`).then((s) => { try { return !!pred(s); } catch { return false; } }),
    { label, timeout },
  ).then(
    () => ok(true, label),
    () => ok(false, label),
  );
}

mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF E2E-DEMO — ${BASE} (self-playing tour, headless)\n`);

/* ═══ RUN 1 — protect mode (real save has a player) ═══════════════════ */
console.log("— RUN 1: ?demo=1&speed=2 with a real save present");
await send("Page.navigate", { url: `${BASE}/index.html` });
await waitFor(() => evalJs(`document.readyState === 'complete' && document.querySelector('.fx-app') !== null`).catch(() => false), { label: "app load" });
await evalJs(`(async () => { const S = await import('${BASE}/state.js'); S.setPlayer({ name: 'Real Rach', tier: 'fit' }); return 'ok'; })()`);
const REAL_BEFORE = await realState();
ok((await evalJs(`(async () => { const s = JSON.parse(localStorage.getItem('rwf.figma.v1')); return s?.player?.name; })()`)) === "Real Rach", "real save seeded (Real Rach, fit)");
ok(await evalJs(`!!document.querySelector('[data-demo-start]')`), "home screen carries the ▶ WATCH THE DEMO button");

/* background tracker: record the exact scene order (starts polling before
   the demo exists; nulls are skipped) */
const seen = [];
let last = null;
const watch = (async () => {
  for (;;) {
    const s = await sceneNow().catch(() => null);
    if (s && s !== last) { last = s; if (!seen.includes(s)) seen.push(s); }
    if (s === "end") break;
    await sleep(120);
  }
})();

/* deep link restarts the app with the demo */
await send("Page.navigate", { url: `${BASE}/index.html?demo=1&speed=2` });
await waitFor(() => sceneNow().then((s) => s !== null), { label: "demo autostart from ?demo=1", timeout: 20000 });
const p0 = await pub();
ok(p0?.speed === 2, "deep link honoured &speed=2");
ok(p0?.scriptTotal1xMs >= 60000 && p0?.scriptTotal1xMs <= 90000, `scripted 1× duration in the 60–90s window (${Math.round(p0.scriptTotal1xMs / 1000)}s)`);

console.log("  · scenes: onboard → create → live");
await atScene("welcome");
ok(await evalJs(`!!document.querySelector('.fx-narr')`), "narrator sheet renders");
ok(await evalJs(`!!document.querySelector('.fx-demo-shield')`), "click shield isolates the app");
ok(await evalJs(`document.querySelector('.fx-narr__cap')?.textContent.length > 0`), "caption present (Ben's copy tone)");
await atScene("onboard-name");
await atScene("onboard-tier");
await atScene("create");
await atScene("invite");
await demoStateHas((s) => s?.player?.name === "Demo Dan" && s?.player?.tier === "couch", "shadow player onboarded (Demo Dan, couch ×1.5)");
await demoStateHas((s) => s?.matches?.length === 1 && s?.matches?.[0]?.status === "live", "battle created + started live (shadow key)");
ok((await realState()) === REAL_BEFORE, "REAL key untouched after onboard+create");

console.log("  · scenes: mates → comeback");
await atScene("battle-live");
await atScene("mates-log");
await atScene("behind");
await demoStateHas((s) => (s?.matches?.[0]?.entries ?? []).filter(e => e.playerId !== "you").length === 9, "crew logged from their chats (9 mate sets)");
await atScene("comeback-armed");
ok(await evalJs(`!!document.querySelector('.fx-cbbanner')`), "comeback banner armed on screen");
await shot("60-demo1-comeback_demo");
ok(await evalJs(`(async () => { const E = await import('${BASE}/engine.js'); const s = JSON.parse(localStorage.getItem('rwf.figma.demo')); return E.comebackEligible(s.matches[0], 'you'); })()`), "engine verifies >30% behind");
await atScene("comeback-log");
await demoStateHas((s) => s?.matches?.[0]?.entries?.some(e => e.playerId === "you" && e.comeback), "comeback entry logged ×1.2 (shadow state)");

console.log("  · scenes: power-ups → danger zone");
await atScene("powerups");
await atScene("lightning");
await demoStateHas((s) => (s?.matches?.[0]?.lightning?.you ?? 0) > Date.now() - 5000, "lightning window live (10 min)");
await waitFor(() => evalJs(`!!document.querySelector('.fx-activebanner')`).catch(() => false), { label: "lightning banner", timeout: 6000 })
  .then(() => ok(true, "lightning banner on screen"), () => ok(false, "lightning banner on screen"));
await shot("61-demo2-lightning_demo");
await atScene("lightning-log");
await demoStateHas((s) => s?.matches?.[0]?.entries?.some(e => e.playerId === "you" && e.lightning), "log inside the window tagged ×3");
await atScene("danger-zone");
await waitFor(() => evalJs(`!!document.querySelector('.fx-app--dz')`).catch(() => false), { label: "DZ3 red wash", timeout: 6000 });
ok(true, "danger zone level 3 wash + banner (time-travelled)");
ok(await evalJs(`!!document.querySelector('[data-dz-banner]') && document.querySelector('[data-dz-banner]').style.display !== 'none'`), "DANGER ZONE banner visible");
await shot("62-demo3-dangerzone_demo");

console.log("  · scenes: close → result → rematch → day → season");
await atScene("close");
await demoStateHas((s) => s?.matches?.[0]?.status === "complete" && s?.matches?.[0]?.closedBy === "you", "first to target closed it (you)");
await atScene("result");
await waitFor(() => evalJs(`document.querySelector('.fx-h1')?.textContent.toUpperCase().includes('YOU WIN') ?? false`).catch(() => false), { label: "result headline", timeout: 8000 })
  .then(() => ok(true, "result screen: effort-adjusted, the couch player took it"), () => ok(false, "result screen: effort-adjusted, the couch player took it"));
await atScene("rematch");
await demoStateHas((s) => s?.matches?.length === 2 && s?.matches?.[1]?.status === "live", "rematch live — same crew, fresh board");
await atScene("day-winner");
await demoStateHas((s) => Object.keys(s?.matches?.[1]?.dailyHistory ?? {}).length >= 1, "the play day settled");
await demoStateHas((s) => Object.values(s?.matches?.[1]?.dailyHistory ?? {}).some(r => r.youWon), "daily winner crowned — you won the day");
await waitFor(() => evalJs(`document.querySelector('.fx-winnercard .fx-h1')?.textContent.toUpperCase().includes('YOU WON') ?? false`).catch(() => false), { label: "recap headline", timeout: 8000 })
  .then(() => ok(true, "daily recap shows YOU WON"), () => ok(false, "daily recap shows YOU WON"));
await atScene("season");
ok(await evalJs(`document.querySelectorAll('.fx-ladderow').length === 6`), "season ladder full roster (6)");
await shot("63-demo4-season_demo");
ok((await realState()) === REAL_BEFORE, "REAL key still byte-identical after the whole tour");

console.log("  · end card + exit");
await waitFor(() => evalJs(`!!document.querySelector('.fx-demo-endcard')`).catch(() => false), { label: "end card", timeout: 30000 });
ok(true, "end card reached");
ok(await evalJs(`!!document.querySelector('[data-end="play"]')`), "PLAY FOR REAL CTA present");
ok(!(await evalJs(`!!document.querySelector('[data-end="keep"]')`)), "keep offer suppressed (real save has a player)");
ok(await evalJs(`document.querySelector('.fx-demo-endcard')?.textContent.includes('/wiki') || !!document.querySelector('.fx-demo-endcard a[href="/wiki"]')`), "EXPLORE THE SYSTEM → /wiki CTA present");
await shot("64-demo5-endcard_demo");
await evalJs(`document.querySelector('[data-end="play"]').click(); true`);
await sleep(600);
ok(!(await evalJs(`!!document.querySelector('.fx-narr')`)), "narrator gone after exit");
ok(!(await evalJs(`!!document.querySelector('.fx-demo-shield')`)), "shield gone after exit");
ok((await evalJs(`location.hash`)).includes("home-002"), "returned to home on the real save");
ok((await demoState()) === null, "shadow state discarded");
ok((await realState()) === REAL_BEFORE, "real save intact on exit");
ok(!(await evalJs(`location.search.includes('demo=')`)), "?demo=1 stripped from the URL (no reboot loop)");
await watch.catch(() => {});
const EXPECTED = ["welcome", "onboard-name", "onboard-tier", "create", "invite", "battle-live", "mates-log", "behind", "comeback-armed", "comeback-log", "powerups", "lightning", "lightning-log", "danger-zone", "close", "result", "rematch", "day-winner", "season", "end"];
ok(JSON.stringify(seen) === JSON.stringify(EXPECTED), `caption sequence exact (${seen.length} scenes, in order)`);

/* ═══ RUN 2 — adopt mode (empty real save → keep the crew) ════════════ */
console.log("— RUN 2: empty save → KEEP THE DEMO CREW");
await evalJs(`localStorage.clear(); 'ok'`);
await send("Page.navigate", { url: `${BASE}/index.html?demo=1&speed=2` });
await waitFor(() => sceneNow().then((s) => s !== null), { label: "demo autostart (run 2)", timeout: 20000 });
// skip-storm: advance through every scene quickly (runs still execute)
const storm = (async () => {
  for (let i = 0; i < 400; i++) {
    const s = await sceneNow().catch(() => null);
    if (s === "end") break;
    await evalJs(`window.__rwfDemo?.skip(); true`);
    await sleep(140);
  }
})();
await waitFor(() => evalJs(`!!document.querySelector('.fx-demo-endcard')`).catch(() => false), { label: "end card (run 2)", timeout: 60000 });
await storm.catch(() => {});
ok(await evalJs(`!!document.querySelector('[data-end="keep"]')`), "KEEP THE DEMO CREW offered (no real player)");
await evalJs(`document.querySelector('[data-end="keep"]').click(); true`);
await sleep(700);
const adopted = JSON.parse(await realState() ?? "null");
ok(adopted?.player?.name === "Demo Dan", "demo crew adopted into the real save (Demo Dan)");
ok(Array.isArray(adopted?.matches) && adopted.matches.length >= 1, "adopted save carries the battles");
ok((await evalJs(`location.hash`)).includes("home-002"), "landed on home with the adopted crew");

/* ═══ About entry ═════════════════════════════════════════════════════ */
console.log("— ABOUT (version surface)");
await evalJs(`location.hash = '#/about-001'; true`);
await sleep(400);
const aboutTxt = await evalJs(`document.querySelector('.fx-content').textContent`);
ok(/v1\.0\.0/.test(aboutTxt ?? ""), "About shows v1.0.0");
ok(/build [0-9a-f]{6,}/i.test(aboutTxt ?? ""), "About shows the build hash");
ok((aboutTxt ?? "").includes("Reps With Friends"), "About names the prototype");
ok(await evalJs(`!!document.querySelector('a[href="/wiki"]')`), "About links the wiki");
await evalJs(`location.hash = '#/set-001'; true`);
await sleep(300);
ok(/About this app · v1\.0\.0/.test((await evalJs(`document.querySelector('.fx-content').textContent`)) ?? ""), "Settings → About row with version");
await evalJs(`location.hash = '#/profile-001'; true`);
await sleep(300);
ok(/ℹ️ About · v1\.0\.0/.test((await evalJs(`document.querySelector('.fx-content').textContent`)) ?? ""), "Profile ℹ️ About row with version");
await shot("65-demo6-about_demo");

/* ── verdict ─────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step + failures.length} assertions passed`);
if (consoleErrors.length) {
  console.log(`\n✗ CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e}`);
} else {
  console.log("✓ zero console errors");
}
if (failures.length || consoleErrors.length) {
  console.log(`\nE2E-DEMO FAILED: ${failures.length} assertion(s), ${consoleErrors.length} console error(s)`);
  process.exitCode = 1;
} else {
  console.log("\nE2E-DEMO PASSED — the tour plays clean, shadow-isolated, both exits honest");
}

function cleanup() {
  try { ws.close(); } catch {}
  try { proc.kill(9); } catch {}
  try { server.stop(true); } catch {}
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
process.on("exit", () => { cleanup(); Bun.sleepSync(150); });
await Bun.sleep(200);
process.exit(process.exitCode ?? 0);
