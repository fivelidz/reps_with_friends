/* ═══════════════════════════════════════════════════════════════════════
   RWF E2E-SW — service worker verification (v1.0.0 stale-cache fix).
   Zero deps: bun static server + chromium over CDP (same harness as
   e2e.mjs). The server can rewrite version.js on demand to simulate a
   rebuild between phases.

   Walk:
     1. load the app → SW installs → cache = rwf-figma-app-<stamp A>
     2. OFFLINE (network blocked): navigate → app still renders from SW
     3. back online, "rebuild" (stamp A → B) + registration.update():
        new SW installs, activates, claims → the OLD tab gets the
        "APP UPDATED — RELOAD" toast (controllerchange listener)
     4. cache B exists, cache A evicted
     5. zero console errors

   Run: bun apps/figma-app/e2e-sw.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9226;

/* the mutable build stamp — flip it to simulate a deploy */
let STAMP = "1.0.0+aaaa1111.202608310000";
const versionJs = () =>
  `export const APP_VERSION = "1.0.0";\n` +
  `export const BUILD_HASH = "test";\n` +
  `export const BUILD_DATE = "2026-08-31";\n` +
  `export const BUILD_STAMP = "${STAMP}";\n`;

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server (version.js is served dynamically) ─────────────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/" || p.endsWith("/")) p += "index.html";
    if (p === "/version.js") {
      return new Response(versionJs(), {
        headers: { "content-type": "text/javascript", "cache-control": "no-store" },
      });
    }
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
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-sw-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-sw-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, { timeout = 20000, every = 150, label = "condition" } = {}) {
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
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

/* ═════════════════════════ THE WALK ═══════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF E2E-SW — ${BASE} (stale-cache fix verification)\n`);

console.log("— INSTALL (stamp A)");
await send("Page.navigate", { url: `${BASE}/index.html#/home-002` });
await waitFor(() => evalJs(`document.readyState === 'complete' && document.querySelector('.fx-app') !== null`).catch(() => false), { label: "app load" });
await waitFor(
  () => evalJs(`navigator.serviceWorker.ready.then(r => r.active !== null).catch(() => false)`),
  { label: "service worker active", timeout: 20000 }
);
await sleep(800);
const stampA = STAMP;
let caches1 = await evalJs(`caches.keys()`);
ok(caches1.includes(`rwf-figma-app-${stampA}`), `SW cache named from BUILD_STAMP (${stampA})`);
const coreHit = await evalJs(`caches.match('${BASE}/engine.js').then(r => !!r)`);
ok(coreHit, "CORE assets precached (engine.js)");
const swModule = await evalJs(`navigator.serviceWorker.ready.then(r => r.active.scriptURL)`);
ok(swModule.endsWith("sw.js"), "SW registered (module worker)");

console.log("— OFFLINE (network blocked)");
await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send("Page.navigate", { url: `${BASE}/index.html#/battle-001` });
await waitFor(() => evalJs(`document.querySelector('.fx-app') !== null && document.body.textContent.length > 100`).catch(() => false), { label: "offline render" });
await sleep(500);
ok(await evalJs(`document.querySelector('.fx-content') !== null`), "app renders fully OFFLINE (shell from SW cache)");
ok(await evalJs(`document.querySelector('.fx-narr') === null && !document.body.textContent.includes('failed')`), "no failure states offline");
await shot("sw-offline");
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await sleep(400);

console.log("— REBUILD (stamp A → B) + UPDATE");
const stampB = "1.0.0+bbbb2222.202608312359";
STAMP = stampB;
const oldHash = await evalJs(`location.hash`);
// the page's own update ping (load listener) won't re-fire — call it like a
// returning tab would (the 30-min interval, compressed)
await evalJs(`navigator.serviceWorker.ready.then(r => r.update()).then(() => 'pinged')`);
await waitFor(
  () => evalJs(`document.querySelector('.fx-toast--live')?.textContent ?? ''`).then(t => (t ?? "").includes("APP UPDATED")),
  { label: "old tab shows APP UPDATED toast (controllerchange)", timeout: 20000 }
);
ok(true, "old tab got the APP UPDATED — RELOAD toast");
ok((await evalJs(`location.hash`)) === oldHash, "old tab did NOT reload on its own (toast offers it)");
await shot("sw-update-toast");
await sleep(600);
const caches2 = await evalJs(`caches.keys()`);
ok(caches2.includes(`rwf-figma-app-${stampB}`), `new cache created for stamp B`);
await waitFor(
  () => evalJs(`caches.keys()`).then((k) => !k.includes(`rwf-figma-app-${stampA}`)),
  { label: "old cache A evicted on activate", timeout: 8000 }
).then(() => ok(true, "old cache A evicted on activate"), () => ok(false, "old cache A evicted on activate"));
const reloadBtn = await evalJs(`!!document.querySelector('[data-sw-reload]')`);
ok(reloadBtn, "toast carries a RELOAD button");

console.log("— RELOAD → running stamp B");
await evalJs(`location.reload()`);
await waitFor(() => evalJs(`document.readyState === 'complete'`).catch(() => false), { label: "reload" });
await sleep(600);
const servedStamp = await evalJs(`import('${BASE}/version.js').then(m => m.BUILD_STAMP)`);
ok(servedStamp === stampB, `page now serves stamp B (${servedStamp})`);

console.log("— MANIFEST");
const manifest = await evalJs(`fetch('${BASE}/manifest.webmanifest').then(r => r.json())`);
ok(manifest.name === "Reps With Friends" && manifest.version === "1.0.0", "manifest name + version aligned (v1.0.0)");
ok(Array.isArray(manifest.icons) && manifest.icons.length === 3, "manifest icons intact");

/* ── verdict ─────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step + failures.length} assertions passed`);
if (consoleErrors.length) {
  console.log(`\n✗ CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e}`);
} else {
  console.log("✓ zero console errors");
}
if (failures.length || consoleErrors.length) {
  console.log(`\nE2E-SW FAILED: ${failures.length} assertion(s), ${consoleErrors.length} console error(s)`);
  process.exitCode = 1;
} else {
  console.log("\nE2E-SW PASSED — SW busts on rebuild, updates old tabs, works offline");
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
