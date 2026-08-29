/* ═══════════════════════════════════════════════════════════════════════
   WIKI SHOOTER — take the screenshots the wiki needs that don't exist yet:
   live pages only reachable with the dev server up (serve.ts :4173).

     1. /hub    — ops console, desktop size (the E2E walk shot is 390px)
     2. /debug  — bot simulator MID-MATCH (state set up via /api/sim first)
     3. /system — the elements/design dissemination page, desktop
     4. /avatars— the avatar gallery (procedural + model sections)

   Pattern: apps/avatars/test/shot.ts (headless chromium over CDP, zero deps).
   Outputs → apps/wiki/shots/{ops-hub,ops-debug,design-system,avatars-gallery}.png
   Run: bun apps/wiki/test/shoot.mjs    (serve.ts must be up on :4173)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "..", "shots");
const BASE = "http://127.0.0.1:4173";
const CDP_PORT = 9231;
const CHROMIUM = "/usr/bin/chromium";

/* ── health ─────────────────────────────────────────────────────────── */
const health = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
if (!health?.ok) { console.error("serve.ts not up on :4173 — start it first"); process.exit(1); }

/* ── seed a mid-match bot state via /api/sim (isolated scratch store) ── */
const CHAT = "wiki-demo";
async function sim(user, userId, text) {
  const r = await fetch(`${BASE}/api/sim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chatId: CHAT, user, userId, text }),
  }).then(r => r.json());
  console.log(`  sim ${user}: ${text}  →  ${String(r.reply).split("\n")[0].slice(0, 90)}`);
  return r;
}
// fresh chat each run: nuke by finishing? Simplest: unique chatId per run.
const chatId = `${CHAT}-${Date.now().toString(36)}`;
await sim("Ben", "u-ben", "new 200");
await sim("Ben", "u-ben", "join couch");
await sim("Nico", "u-nico", "join athlete");
await sim("Alexei", "u-alexei", "join casual");
await sim("Ben", "u-ben", "start");
await sim("Ben", "u-ben", "log pushups 45");
await sim("Nico", "u-nico", "log squats 60");
await sim("Alexei", "u-alexei", "log pushups 30");
await sim("Ben", "u-ben", "pot 500");
await sim("Nico", "u-nico", "pot 500");
await sim("Ben", "u-ben", "s");

/* ── headless chromium over CDP ─────────────────────────────────────── */
async function ver() { try { return await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  spawn(CHROMIUM, [
    "--headless=new", `--remote-debugging-port=${CDP_PORT}`,
    "--window-size=1440,900", `--user-data-dir=/tmp/rwf-wiki-prof-${Date.now()}`,
    "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--use-gl=angle", "--use-angle=vulkan", "--enable-unsafe-swiftshader",
    "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 40 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error("chromium never came up"); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(res => { ws.onopen = () => res(null); ws.onerror = () => { console.error("CDP ws failed"); process.exit(1); }; });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send("Target.createTarget", { url: "about:blank" })).result;
const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true })).result;
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(url, name, settle = 3500, clip = null) {
  await send("Page.navigate", { url }, sessionId);
  await sleep(settle);
  const params = { format: "png" };
  if (clip) Object.assign(params, { clip: { x: 0, y: 0, width: clip[0], height: clip[1], scale: 1 } });
  const r = await send("Page.captureScreenshot", params, sessionId);
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
  console.log(`  ✓ ${name}.png  ← ${url}`);
}

console.log("\nWIKI SHOOTER — live pages (1440×900 headless chromium)\n");
await shot(`${BASE}/hub`, "ops-hub", 5000);
await shot(`${BASE}/system`, "design-system", 4500);
// /debug: set the sim console to our seeded chat so the console shows a live match
await send("Page.navigate", { url: `${BASE}/debug` }, sessionId);
await sleep(2500);
await send("Runtime.evaluate", { expression: `
  (() => {
    const inp = document.querySelector('#simIn, input[type="text"], textarea');
    if (inp) { inp.value = "s"; }
    return 'ok';
  })()`, returnByValue: true }, sessionId);
await sleep(300);
const dbgShot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
writeFileSync(join(SHOTS, "ops-debug.png"), Buffer.from(dbgShot.result.data, "base64"));
console.log("  ✓ ops-debug.png  ← /debug (bot sim console, mid-match)");
await shot(`${BASE}/avatars`, "avatars-gallery", 12000);
ws.close(); process.exit(0);
