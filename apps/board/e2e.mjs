/* ═══════════════════════════════════════════════════════════════════════
   RWF V2 BOARD E2E — headless Chromium walk of the /v2 table app.
   Zero deps: bun static server + chromium over the DevTools Protocol
   (same harness pattern as apps/figma-app/e2e.mjs).

   Walk: home → setup (identity) → create table → DRAFT (deal-in cards)
   → table (felt + lanes + tokens + kitty) → LOG REPS (token moves along
   the track, kitty grows, chip flies) → MATES sim (rival tokens race)
   → DEAL (daily drop) → PLAY CARD (flip→fly→burst animation) → closure
   → RESULT podium on the table → charity designation → rematch → squad
   → theme switch. Asserts computed STYLES (transforms for the card/
   token animations, box-shadows for the popping buttons), 390px AND
   desktop clean, and ZERO console errors. Screenshots → shots/*_board.png

   Run: bun apps/board/e2e.mjs   (server: http://127.0.0.1:4190)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9227;

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server: apps/board at / + /design from the repo ───────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    let fsPath;
    if (p.startsWith("/design/")) {
      fsPath = join(ROOT, p); // board.html references /design/{fonts,tokens,themes}.css absolutely
    } else if (p === "/" || p.endsWith("/")) {
      fsPath = join(HERE, p === "/" ? "index.html" : join(p.replace(/^\//, ""), "index.html"));
    } else {
      fsPath = join(HERE, p.replace(/^\//, ""));
    }
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      return new Response(f, {
        headers: {
          "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless (unique profile per run) ────────────── */
import { rmSync } from "node:fs";
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-board-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-board-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });

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

/* ── 3. minimal CDP client ────────────────────────────────────────────── */
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
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function goto(hash) {
  await evalJs(`location.hash = '${hash}'`);
  await sleep(320); // render + wire + first transitions
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(260);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_board.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const call = (expr) => evalJs(`(window.__rwfBoard ? window.__rwfBoard.${expr} : null)`);

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V2 BOARD E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/index.html#/home` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfBoard?.ready === true && document.querySelector('.bd-h1') !== null`).catch(() => false),
  { label: "board app load", timeout: 20000 }
);
await sleep(500);

console.log("— HOME");
ok(await exists(".bd-h1"), "home hero renders");
ok(await exists("#themeRow"), "theme picker present");
ok((await evalJs(`document.querySelectorAll('#themeRow .bd-thbtn').length`)) === 13, "13 themes offered");
ok(await exists("#setupBtn"), "setup CTA shown (no identity yet)");
await shot("home");

console.log("— SETUP (identity)");
await goto("#/setup");
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = 'Alexei'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await evalJs(`document.querySelector('[data-tier="couch"]').click(); true`);
await sleep(150);
await shot("setup");
await click("#setupGo");
const st1 = await evalJs(`JSON.parse(localStorage.getItem('rwf.board.v2') ?? 'null')`);
ok(st1?.player?.name === "Alexei" && st1?.player?.tier === "couch", "player persisted to rwf.board.v2 (v1 key untouched)");
ok((await evalJs(`localStorage.getItem('rwf.figma.v1')`)) === null, "v1 save key NOT written (independence)");

console.log("— CREATE TABLE");
await goto("#/create");
ok((await evalJs(`document.querySelector('#tName')?.value`)) === "The 300 Club", "table name prefilled");
ok((await evalJs(`document.querySelectorAll('#dayRow .bd-pick.is-on').length`)) === 3, "3 default play-day laps on");
ok((await evalJs(`document.querySelectorAll('#tgtRow .bd-pick.is-on').length`)) === 1, "one target selected");
await shot("create");
await click("#deal");

console.log("— DRAFT (deal from 3)");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "draft fan" });
ok((await evalJs(`document.querySelectorAll('#draftFan .bd-card--deal').length`)) === 3, "3 cards dealt with deal-in animation");
await shot("draft");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[1].click(); true`);
await sleep(180);
ok(await evalJs(`document.querySelectorAll('#draftFan .bd-card.is-sel').length === 1`), "card selectable");
await click("#keepBtn");
await sleep(700); // pick-fly animation → pick → start

console.log("— TABLE (the felt)");
await waitFor(() => exists("#felt").catch(() => false), { label: "table felt" });
await sleep(400);
const mid = await call("matchId()");
ok(!!mid, "match id resolves");
const st2 = await evalJs(`JSON.parse(localStorage.getItem('rwf.board.v2'))`);
const m0 = st2.matches.find((m) => m.config.id === mid);
ok(m0?.status === "live", "match live after draft");
ok((await evalJs(`document.querySelectorAll('.bd-token').length`)) === 4, "4 runner tokens on the track");
ok((await evalJs(`document.querySelectorAll('.bd-lane').length`)) === 4, "4 lanes drawn");
ok(await call("kittyTotal()") === 80, "kitty = 4 × 20 ante");
ok((await evalJs(`document.querySelectorAll('#stacks .bd-chip').length`)) >= 4, "ante chips stacked in the kitty");
ok((await evalJs(`document.querySelectorAll('#hand .bd-card--deal').length`)) === 1, "drafted card dealt into hand (deal-in anim)");
ok((await exists("#raceClock")), "race clock present");
ok((await text("#lapTag")) === "RACE CLOCK", "clock label present");
await shot("table");

console.log("— POPPING BUTTONS (shadow assertions)");
const shadow = await call(`btnShadow("#logBtn")`);
ok(typeof shadow === "string" && shadow !== "none" && shadow.includes("px"), `pop-btn has solid offset shadow (${shadow.split("),")[0]}…)`);
const pressedT = await call(`btnPressedTransform("#logBtn")`);
ok(pressedT === "matrix(1, 0, 0, 1, 0, 6)", `press translates 6px INTO the shadow → ${pressedT}`);

console.log("— CARD ANIMATION (computed transform)");
const cardT = await call("cardTransform(0)");
ok(typeof cardT === "string" && cardT !== "none", `card carries a computed transform (3D rig) → ${cardT.slice(0, 44)}…`);

console.log("— LOG REPS (token moves · kitty grows · chip flies)");
const pos0 = await call(`tokenPos("you")`);
const chipCount0 = await call("chipCount()");
await click("#logBtn");
ok(await exists("#exRow"), "log sheet opens (exercise chips)");
await evalJs(`document.querySelector('[data-step="25"]').click(); true`);
await sleep(150);
await shot("logsheet");
await evalJs(`(() => { window.__chipFlySeen = false; const t0 = Date.now(); const iv = setInterval(() => { if (document.querySelector('.bd-chipfly')) window.__chipFlySeen = true; if (Date.now() - t0 > 1800) clearInterval(iv); }, 30); return true; })()`);
await click("#logGo");
await sleep(1200); // token transition (0.9s) + chip fly (0.85s)
const pos1 = await call(`tokenPos("you")`);
ok(pos0 && pos1 && (Math.abs(pos1.x - pos0.x) > 4 || Math.abs(pos1.y - pos0.y) > 4),
   `your token moved along the track (${pos0?.x},${pos0?.y} → ${pos1?.x},${pos1?.y})`);
ok(await call("kittyTotal()") === 85, "kitty grew +5 (log tip)");
ok(await call("chipCount()") > chipCount0, "chip stack grew");
ok(await evalJs(`window.__chipFlySeen === true`), "chip fly-in animation fired (.bd-chipfly)");
const rpRow = await text(".bd-prow--you .bd-prow__rp");
ok(/^◈\d+/.test(rpRow ?? "") && +(rpRow.match(/\d+/)?.[0] ?? 0) > 40, `RP balance earned from the set (${rpRow})`);
await shot("table-logged");

console.log("— MATES RACE (rival tokens move)");
const sam0 = await call(`tokenPos("sam")`);
await click("#simBtn");
await sleep(1300);
const sam1 = await call(`tokenPos("sam")`);
ok(sam0 && sam1 && (Math.abs(sam1.x - sam0.x) > 4 || Math.abs(sam1.y - sam0.y) > 4), "mate token raced (sim)");
ok((await evalJs(`document.querySelectorAll('.bd-feed__row').length`)) >= 2, "commentary feed live");
await shot("table-mates");

console.log("— DAILY DROP (deal a card)");
const hand0 = await call("handKinds()");
await click("#dealDrop");
await sleep(300);
const hand1 = await call("handKinds()");
ok(hand1.length === hand0.length + 1, `hand grew (${hand0.length} → ${hand1.length})`);
ok((await evalJs(`document.querySelectorAll('#hand .bd-card--deal').length`)) >= 1, "new card deals in (animation class)");
await shot("table-dealt");

console.log("— PLAY A CARD (flip → fly to kitty → burst)");
// pick an affordable card: cheapest first (shield 10 / freeze 15) — RP starts 40 + earned
await evalJs(`(() => {
  const kinds = window.__rwfBoard.handKinds();
  const order = ['shield','freeze','steal','lightning'];
  const pick = order.find(k => kinds.includes(k));
  const idx = kinds.indexOf(pick);
  document.querySelectorAll('#hand .bd-card')[idx].click(); return true;
})()`);
await sleep(250);
ok(await exists("#playIt"), "card detail sheet opens");
ok((await evalJs(`!document.querySelector('#playIt')?.disabled`)) === true, "affordable card playable");
await evalJs(`(() => { window.__burstSeen = false; const iv = setInterval(() => { if (document.querySelector('.bd-burst')) window.__burstSeen = true; }, 30); setTimeout(() => clearInterval(iv), 1600); return true; })()`);
await shot("cardsheet");
await click("#playIt");
await sleep(300);
ok(await evalJs(`!!document.querySelector('.bd-card.is-playing')`), "play animation class fires (.is-playing flip+fly)");
await sleep(1000);
ok(await evalJs(`window.__burstSeen === true`), "kitty effect burst fired (.bd-burst)");
const hand2 = await call("handKinds()");
ok(hand2.length === hand1.length - 1, "card left the hand after playing");
ok((await evalJs(`document.querySelectorAll('.bd-fx').length`)) >= 0, "fx dock alive");
await shot("table-played");

console.log("— RACE TO THE FINISH (closure)");
let closed = false, guard = 0;
while (!closed && guard++ < 12) {
  const r = await evalJs(`window.__rwfBoard.driveLog(50)`);
  closed = !!r?.closed;
  await sleep(220);
}
ok(closed, "someone crossed the target — match complete");
await sleep(900); // → result route
ok(await call("view()") === "result", "routed to the result view");
ok(await exists(".bd-ped--1"), "podium on the table — 1st pedestal");
ok((await evalJs(`document.querySelectorAll('.bd-ped').length`)) === 3, "3 pedestals (2-1-3)");
ok(await exists(".bd-confetti"), "confetti celebration");
ok(await exists("#kittyTotal"), "kitty shown at the podium");
await shot("result");

console.log("— CHARITY + REMATCH");
await evalJs(`document.querySelector('#charRow .bd-pick').click(); true`);
await sleep(300);
const stPot = await evalJs(`JSON.parse(localStorage.getItem('rwf.board.v2'))`);
const pot = stPot.pots?.[mid];
ok(pot?.designatedCharityId != null, "kitty designated to a charity (pot ledger)");
await shot("result-charity");
await click("#rematchBtn");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "rematch draft" });
ok(true, "rematch → fresh draft (new deal)");
await shot("rematch-draft");

console.log("— SQUAD DASHBOARD");
await goto("#/home");
await click('[data-go="squad"]');
await sleep(200);
ok(await exists(".bd-lad"), "squad ladder renders");
await shot("squad");

console.log("— THEME SWITCH (re-skin live)");
await goto("#/home");
await evalJs(`document.querySelector('[data-theme-btn="poker"]').click(); true`);
await sleep(250);
ok((await evalJs(`document.documentElement.dataset.theme`)) === "poker", "felt theme switches (board → poker)");
const feltBg = await evalJs(`getComputedStyle(document.querySelector('.bd-tcard__felt')).backgroundImage`);
ok(typeof feltBg === "string" && feltBg.startsWith("radial-gradient"), `table felt re-skinned (${feltBg.slice(0, 46)}…)`);
await shot("theme-poker");
await evalJs(`document.querySelector('[data-theme-btn="board"]').click(); true`); // restore

console.log("— DESKTOP (1280×800) CLEAN");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
// finish the rematch draft so the table view is live, then check the grid
await goto("#/draft");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[0].click(); true`);
await sleep(160);
await click("#keepBtn");
await sleep(900);
await waitFor(() => exists(".bd-stage").catch(() => false), { label: "desktop stage" });
const overflow = await evalJs(`document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth`);
ok(overflow <= 1, `no horizontal overflow at 1280px (${overflow}px)`);
ok(await exists(".bd-stage"), "desktop grid layout active (.bd-stage)");
ok(await exists(".bd-hand"), "card hand docked on desktop");
ok((await evalJs(`document.querySelectorAll('.bd-token').length`)) === 4, "tokens on the desktop track");
await shot("desktop-table");
await send("Emulation.clearDeviceMetricsOverride");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

console.log("— V1 UNTOUCHED (board e2e server isolation)");
const v1 = await fetch(`${BASE}/figma-app/index.html`).catch(() => null);
ok(v1?.status === 404, "board e2e exposes ONLY apps/board (figma-app never mounted)");

/* ── verdict ──────────────────────────────────────────────────────────── */
console.log("— CONSOLE");
const errSample = consoleErrors.slice(0, 5);
ok(consoleErrors.length === 0, `zero console errors${errSample.length ? ` — ${errSample.join(" | ")}` : ""}`);

console.log(`\n${passed}/${step} assertions passed`);
server.stop(true);
try { proc.kill("SIGKILL"); } catch {}
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-board-e2e"]); } catch {} // take the whole browser tree
if (failures.length || consoleErrors.length) {
  console.error(`FAILURES: ${failures.length ? failures.join(" · ") : "none"}${consoleErrors.length ? ` (+${consoleErrors.length} console errors)` : ""}`);
  process.exit(1);
}
console.log("ALL GREEN — /v2 board app verified.");
process.exit(0);
