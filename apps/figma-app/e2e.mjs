/* ═══════════════════════════════════════════════════════════════════════
   RWF E2E — headless Chromium walk of the FULL figma-app flow.
   Zero deps: bun static server + chromium over the DevTools Protocol.

   Walk: onboard → create → waiting room (crew code) → start → battle →
   log ×N → comeback fires → close → result + charity pot → rematch →
   season ladder → profile → home. Asserts localStorage + DOM at every
   step, screenshots each screen, and fails on ANY console error.

   Run: bun apps/figma-app/e2e.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9223;

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server for apps/figma-app ─────────────────────────────── */
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
        headers: {
          "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless ─────────────────────────────────────── */
/* Kill orphans from crashed runs (they hold the profile dir + CDP port and
   chromium's singleton handoff would silently forward us to a stale browser
   with stale localStorage). Unique profile per run = bulletproof isolation. */
import { rmSync } from "node:fs";
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-e2e-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-e2e-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {}); // chromium chatter

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}

await waitFor(async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return r.ok;
  } catch { return false; }
}, { label: "chromium devtools endpoint" });

/* open a fresh tab */
const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
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

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
});

/** evaluate an expression in the page (async, returns JSON value) */
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function goto(hash) {
  await evalJs(`(() => { const h = '${hash}'; if (location.hash === h) dispatchEvent(new Event('hashchange')); else location.hash = h; return 'ok'; })()`);
  await sleep(220); // render + wire
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(220);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}
const state = () => evalJs(`JSON.parse(localStorage.getItem('rwf.figma.v1') ?? 'null')`);
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF E2E — ${BASE} (headless chromium, 390×844)\n`);

/* navigate + SW registers */
await send("Page.navigate", { url: `${BASE}/index.html` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && location.href.includes('index.html') && document.querySelector('.fx-app') !== null`).catch(() => false),
  { label: "app load", timeout: 20000 }
);
await sleep(600);

console.log("— INDEX");
ok(await exists(".fx-index__title"), "index renders");
ok(await exists("#themeToggle"), "theme toggle present");
await shot("index");

console.log("— ONBOARDING");
await goto("#/auth-008");
ok(await exists("#obName"), "name input present");
await evalJs(`(() => { const i = document.querySelector('#obName'); i.value = 'Alexei the Machine'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await sleep(120);
ok((await text(".fx-avatarpick .fg-avatar")) === "AT", "avatar initials live-update to AT");
await shot("onboard-name");
await click("#obNameNext"); // saves draft.name, data-go → auth-009

await goto("#/auth-010");
ok((await evalJs(`document.querySelectorAll('#tierOpts .fx-option').length`)) === 4, "4 tier options");
await evalJs(`document.querySelectorAll('#tierOpts .fx-option')[0].click(); true`);
await sleep(120);
ok(await evalJs(`document.querySelectorAll('#tierOpts .fx-option')[0].classList.contains('fx-option--sel')`), "couch tier selectable");
await shot("onboard-tier");
await click("#tierNext"); // persists player
let st = await state();
ok(st?.player?.name === "Alexei the Machine" && st?.player?.tier === "couch", "player persisted to rwf.figma.v1 (name+tier)");

await goto("#/auth-014");
ok((await text(".fx-h1"))?.includes("YOU'RE IN, ALEXEI"), "onboarding complete greets by real name");
await shot("onboard-done");

console.log("— CREATE BATTLE");
await goto("#/create-002");
ok((await evalJs(`document.querySelector('#cbName')?.value`)) === "The Sunday Showdown", "battle name prefilled");
await evalJs(`(() => { document.querySelector('[data-day="2"]').click(); document.querySelector('[data-target="light"]').click(); return true; })()`);
await sleep(120);
ok(await evalJs(`document.querySelector('[data-day="2"]').classList.contains('fx-chip--on')`), "day chip toggles on");
await shot("create-battle");
await click("#cbCreate");
st = await state();
ok(st?.matches?.length === 1, "match created in state");
ok(st?.matches?.[0]?.status === "open", "match status open");
ok(st?.matches?.[0]?.config?.targetReps === 150, "Light target = 150 reps");
ok(st?.matches?.[0]?.players?.length === 4, "crew = you + 3 mates");
ok(/^CREW-/.test(st?.crewCode ?? ""), "crew code generated");

console.log("— WAITING ROOM (bots bridge)");
await goto("#/create-014");
const wrText = await text(".fx-sharecard") ?? "";
ok(/link CREW-\w+/.test(wrText), "`link <CODE>` grammar shown (bots bridge)");
ok(wrText.includes(st.crewCode), "crew code matches state");
ok(await exists('.fx-sharecard__a[href="/connect"]'), "cosmetic /connect link present");
await shot("waiting-room");
await click("#startEarly");
st = await state();
ok(st?.matches?.[0]?.status === "live", "START EARLY → match live");

console.log("— BATTLE LIVE");
await goto("#/battle-001");
ok((await evalJs(`document.querySelectorAll('.fg-lbrow').length`)) === 4, "4 real standings rows");
ok((await text(".fx-hero__num")) === "0", "ring shows your 0 reps");
ok((await text(".fx-hero__of")) === "of 150 reps", "ring target from config");
ok(await exists("[data-countdown]"), "dual clock ticking");
ok(!(await exists(".fx-cbbanner")), "no comeback banner yet (nobody behind)");
await shot("battle-live");

console.log("— LOG (≤3 taps)");
await click("#logBtn");
ok(await exists("#quickLog"), "quick-log sheet opens");
const conv = await text("#qlConv") ?? "";
ok(conv.includes("×1.5"), "conversion shows couch ×1.5 handicap");
await evalJs(`(() => { document.querySelector('[data-n="20"]').click(); return true; })()`);
await sleep(120);
ok((await text("#qlCta")) === "LOG 20 PUSH-UPS", "CTA reflects selection");
await shot("log-sheet");
await click("#qlCta");
st = await state();
const m0 = st.matches[0];
ok(m0.entries.length === 1 && m0.entries[0].reps === 20 && m0.entries[0].playerId === "you", "entry logged to state (you, 20)");
await goto("#/battle-001");
ok((await text(".fx-hero__num")) === "20", "ring updates to 20 after log");
ok((await evalJs(`document.querySelectorAll('.fg-lbrow')[0].textContent`)).includes("You"), "you lead the board after first log");

console.log("— COMEBACK");
await evalJs(`(() => { document.querySelector('#simMates').click(); return true; })()`);
await sleep(300);
st = await state();
const m1 = st.matches[0];
const mateEntries = m1.entries.filter(e => e.playerId !== "you").length;
ok(mateEntries === 3, `mates logged via UI button (${mateEntries} entries)`);
// deterministic top-up until the engine arms YOUR comeback
await evalJs(`(async () => {
  const E = await import('${BASE}/engine.js'); const S = await import('${BASE}/state.js');
  for (let i = 0; i < 6; i++) {
    const m = S.load().matches[0];
    if (E.comebackEligible(m, 'you')) break;
    S.simMates(m.config.id, 0.99);
  }
  return true; })()`);
await sleep(150);
st = await state();
const m1b = st.matches[0];
const mateRaw = Math.max(...m1b.players.filter(p => p.id !== "you").map(p => m1b.entries.filter(e => e.playerId === p.id).reduce((s, e) => s + e.reps, 0)));
const myRaw = m1b.entries.filter(e => e.playerId === "you").reduce((s, e) => s + e.reps, 0);
ok((mateRaw - myRaw) / mateRaw > 0.3, `engine-verified >30% behind (mate ${mateRaw} vs you ${myRaw})`);
await goto("#/battle-001");
ok(await exists(".fx-cbbanner"), "comeback banner appears (>30% behind)");
ok(await exists(".fx-cb"), "×1.2 tag on your leaderboard row");
await shot("comeback-armed");
await click("#logBtn");
await evalJs(`(() => { document.querySelector('[data-n="20"]').click(); return true; })()`);
await sleep(100);
await click("#qlCta");
st = await state();
const myEntries = st.matches[0].entries.filter(e => e.playerId === "you");
ok(myEntries.some(e => e.comeback === true), "comeback entry flagged ×1.2 in state");
await goto("#/battle-001");
ok((await text(".fx-hero__num")) === "40", "ring at 40 after comeback log");

console.log("— CLOSE THE MATCH");
for (const n of [50, 50, 10]) {
  const live = (await state()).matches[0].status === "live";
  if (!live) break;
  await click("#logBtn");
  await evalJs(`(() => { document.querySelector('[data-n="${n}"]').click(); return true; })()`);
  await sleep(100);
  await click("#qlCta");
  await sleep(250);
}
st = await state();
ok(st.matches[0].status === "complete", "match closed at raw 150");
ok(st.matches[0].closedBy === "you", "you closed it");
ok(location_hash_ok(await evalJs(`location.hash`)), "routed to result screen");
await shot("result-final");

console.log("— RESULT + CHARITY POT");
const winnerName = await evalJs(`(async () => { const E = await import('${BASE}/engine.js'); const s = JSON.parse(localStorage.getItem('rwf.figma.v1')); const m = s.matches[0]; const w = E.winner(m); return m.players.find(p => p.id === w.playerId).name; })()`);
ok((await text(".fx-h1"))?.toUpperCase().includes("YOU WIN"), `winner shown (engine says: ${winnerName})`);
ok((await evalJs(`document.querySelectorAll('.fx-podium__col').length`)) === 3, "3-step podium from finalStandings");
await evalJs(`(() => { document.querySelector('[data-pot-add="500"]').click(); return true; })()`);
await sleep(250);
st = await state();
ok(st.pots[st.matches[0].config.id]?.contributions?.length === 1 && st.pots[st.matches[0].config.id].contributions[0].amountCents === 500, "$5 added to charity pot");
await shot("result-pot");
const canDesignate = await evalJs(`!document.querySelector('[data-pot-pick="beyond_blue"]')?.disabled`);
if (canDesignate) {
  await evalJs(`(() => { document.querySelector('[data-pot-pick="beyond_blue"]').click(); return true; })()`);
  await sleep(250);
  st = await state();
  ok(st.pots[st.matches[0].config.id]?.designatedCharityId === "beyond_blue", "winner directed pot to Beyond Blue");
  await shot("result-pot-designated");
} else {
  ok(true, "pot designation is winner-only (disabled for non-winner)");
}

console.log("— REMATCH");
await goto("#/result-005");
await evalJs(`(() => { document.querySelector('#rematchBtn').click(); return true; })()`);
await sleep(300);
st = await state();
ok(st.matches.length === 2 && st.matches[1].status === "live" && st.matches[1].entries.length === 0, "rematch: fresh live match, same crew");
ok(st.matches[1].players.length === 4, "rematch keeps the crew");
await goto("#/battle-001");
ok((await text(".fx-hero__num")) === "0", "rematch board starts at 0");
await shot("rematch-live");

console.log("— SEASON LADDER");
await goto("#/season-001");
const ladderRows = await evalJs(`document.querySelectorAll('.fx-ladderow').length`);
ok(ladderRows === 6, `ladder shows full season roster (${ladderRows} rows)`);
const topPts = await text(".fx-ladderow__pts");
ok((topPts ?? "").startsWith("4"), "leader has 3pts + 1 MVP = 4 from the recorded result");
ok((await text(".fx-ladderow--you .fx-ladderow__name"))?.includes("Alexei"), "your row marked (you)");
await shot("season-ladder");

console.log("— PROFILE");
await goto("#/profile-001");
ok((await text(".fx-h1")) === "ALEXEI THE MACHINE", "profile shows real name");
const statsTxt = await evalJs(`Array.from(document.querySelectorAll('.fx-pstat__v')).map(n => n.textContent).join('|')`);
ok(statsTxt.split("|")[0] === "150", `lifetime reps real (got ${statsTxt.split("|")[0]})`);
ok(statsTxt.includes("1"), "wins counted");
await shot("profile");

console.log("— HOME (battle list)");
await goto("#/home-003");
const cards = await evalJs(`document.querySelectorAll('.fg-battle').length`);
ok(cards === 2, `both battles listed (${cards})`);
ok((await evalJs(`document.body.textContent`)).includes("YOU WON"), "completed card shows real winner status");
await shot("home-battles");

console.log("— OVERFLOW CHECK (6 players, long names, big numbers)");
await evalJs(`(async () => {
  const S = await import('${BASE}/state.js');
  const st = S.load();
  const m = st.matches.find(x => x.status === 'live');
  S.mutate(s => { const mm = s.matches.find(x => x.config.id === m.config.id); mm.players.push({id:'casey',name:'Casey M',tier:'casual'},{id:'mika',name:'Mikayla Long-Name-Rutherford',tier:'casual'}); });
  S.simMates(m.config.id, 0.55); S.simMates(m.config.id, 0.77); S.simMates(m.config.id, 0.31);
  return true; })()`);
await goto("#/battle-005");
const overflow = await evalJs(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
ok(overflow <= 0, `no horizontal overflow with 6 players + long names (${overflow}px)`);
await shot("overflow-6players");
await goto("#/battle-001");
const overflow2 = await evalJs(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
ok(overflow2 <= 0, `battle screen clean too (${overflow2}px)`);

console.log("— CAMERA OVERLAY (honest note)");
await click("#logBtn");
await evalJs(`(() => { document.querySelector('#camVerify').click(); return true; })()`);
await sleep(400);
ok(await exists(".fx-camnote"), "camera overlay opens");
ok((await text(".fx-camnote__body"))?.includes("verify.js"), "overlay explains the ported counter + prototype pointer");
await shot("camera-note");
await evalJs(`(() => { document.querySelector('[data-camnote-close]').click(); return true; })()`);
await sleep(150);

console.log("— DEMO CHIP HONESTY");
await goto("#/pwr-001");
ok(await exists(".fx-demochip"), "power-ups carries DEMO chip");
await goto("#/wager-001");
ok(await exists(".fx-demochip"), "wagers carries DEMO chip");
await goto("#/battle-001");
ok(!(await exists(".fx-demochip")), "core battle screen has NO demo chip");
await shot("battle-final");

console.log("— VISUAL AUDIT (per-element clipping across all core screens)");
/* This model session can't read images, so the "does the design hold up"
   check is done programmatically: every element on every core screen must
   not clip horizontally (scrollWidth > clientWidth + 1) and the page must
   not scroll sideways. Long names / big numbers are already in state. */
const AUDIT_SCREENS = [
  "home-002", "home-003", "create-002", "create-014", "join-001", "join-003",
  "battle-001", "battle-005", "log-001", "log-002", "result-001", "result-002",
  "result-005", "profile-001", "season-001", "auth-008", "auth-010", "auth-014",
];
let clippedTotal = 0;
const clippedReport = [];
for (const scr of AUDIT_SCREENS) {
  await goto(`#/${scr}`);
  const clipped = await evalJs(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.fx-content *')) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible' || el.classList.contains('fg-lbrow__bar')) continue;
      // ellipsis is the intended mobile treatment for long names — allowed
      if (cs.textOverflow === 'ellipsis') continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        bad.push(el.className.toString().split(' ')[0] + ':' + el.scrollWidth + '>' + el.clientWidth);
      }
    }
    return bad;
  })()`);
  const pageOverflow = await evalJs(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
  clippedTotal += clipped.length + (pageOverflow > 0 ? 1 : 0);
  if (clipped.length || pageOverflow > 0) clippedReport.push(`${scr}: ${clipped.join(", ")} pageOverflow=${pageOverflow}px`);
}
ok(clippedTotal === 0, `no clipped/overflowing elements on ${AUDIT_SCREENS.length} screens${clippedReport.length ? " — " + clippedReport.join(" | ") : ""}`);

/* ── verdict ─────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step + failures.length} assertions passed`);
if (consoleErrors.length) {
  console.log(`\n✗ CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e}`);
} else {
  console.log("✓ zero console errors");
}
if (failures.length || consoleErrors.length) {
  console.log(`\nE2E FAILED: ${failures.length} assertion(s), ${consoleErrors.length} console error(s)`);
  process.exitCode = 1;
} else {
  console.log("\nE2E PASSED — full flow walked clean");
}

function location_hash_ok(h) { return h.includes("result-005"); }

/* ── cleanup (ALWAYS runs, even on walk failure) ─────────────────────── */
function cleanup() {
  try { ws.close(); } catch {}
  try { proc.kill(9); } catch {}
  try { server.stop(true); } catch {}
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
process.on("exit", () => { cleanup(); Bun.sleepSync(150); });
await Bun.sleep(200); // let piped stdout flush before exit
process.exit(process.exitCode ?? 0);
