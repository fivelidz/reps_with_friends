/* ═══════════════════════════════════════════════════════════════════════
   RWF E2E DAILY — the temporal game loop (FLOW-06/07) under headless
   Chromium with TIME TRAVEL. daily.js is built for injectable time: the
   harness pins daily.setNowOverride() from inside the page (same module
   instance the app runs), so the whole danger-zone ramp + nightly close
   is exercised in seconds instead of hours.

   Scenario: onboard → create battle (all 7 play days) → start →
   log day 1 → T-2h (DZ1 chip) → T-45m (DZ2 banner pulse) →
   T-20m (DZ3 + heartbeat + screen wash + LOG NOW) → past deadline
   (day auto-closes ONCE: winner recorded, toast, recap renders, battle
   shows DAY 2) → log day 2 → close day 2 → multi-day dailyHistory
   verified, both winners, recap day-chips switch. Zero console errors.

   Run: bun apps/figma-app/e2e-daily.mjs        (own ports — no collisions)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4181;          // own static port (e2e.mjs uses 4180)
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9224;      // own CDP port (e2e.mjs uses 9223)

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server ─────────────────────────────────────────────────── */
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

/* ── 2. launch chromium headless (unique profile per run) ────────────── */
import { rmSync } from "node:fs";
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-e2e-daily-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-e2e-daily-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

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

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

/* ── 3. minimal CDP client (same pattern as e2e.mjs) ─────────────────── */
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
  await sleep(220);
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(220);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `d${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}
const state = () => evalJs(`JSON.parse(localStorage.getItem('rwf.figma.v1') ?? 'null')`);
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);

/** pin the app's clock (same daily.js module instance the app uses) */
const setNow = (ts) => evalJs(`import('${BASE}/daily.js').then(D => { D.setNowOverride(${ts}); return D.now(); })`);
/** D_ takes a single EXPRESSION over D (the daily module) — value is returned */
const D_ = (expr) => evalJs(`import('${BASE}/daily.js').then(D => (${expr}))`);

/* ═════════════════════════ THE TIME-TRAVEL WALK ════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF E2E DAILY — ${BASE} (headless chromium, 390×844, injectable clock)\n`);

await send("Page.navigate", { url: `${BASE}/index.html` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && location.href.includes('index.html') && document.querySelector('.fx-app') !== null`).catch(() => false),
  { label: "app load", timeout: 20000 }
);
await sleep(600);

console.log("— ONBOARD (fast)");
await goto("#/auth-008");
await evalJs(`(() => { const i = document.querySelector('#obName'); i.value = 'Alexei the Machine'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await click("#obNameNext");
await goto("#/auth-010");
await evalJs(`document.querySelectorAll('#tierOpts .fx-option')[0].click(); true`);
await click("#tierNext");
let st = await state();
ok(st?.player?.name === "Alexei the Machine" && st?.player?.tier === "couch", "player persisted (couch ×1.5)");

console.log("— CREATE BATTLE (all 7 play days — a play day every calendar day)");
await goto("#/create-002");
await evalJs(`(() => { for (const d of [0, 2, 4, 6]) document.querySelector('[data-day="' + d + '"]').click(); document.querySelector('[data-target="solid"]').click(); return true; })()`);
await sleep(150);
const onDays = await evalJs(`document.querySelectorAll('#cbDays .fx-chip--on').length`);
ok(onDays === 7, `all 7 days selected (got ${onDays}: ${await evalJs(`[...document.querySelectorAll('#cbDays .fx-chip--on')].map(c => c.dataset.day).join(",")`)})`);
await click("#cbCreate");
st = await state();
ok(st?.matches?.length === 1 && st?.matches?.[0]?.status === "open", "battle created");
ok((st?.matches?.[0]?.config?.playDays?.length) === 7, "playDays = every day");
ok(Number.isFinite(Number(st?.matches?.[0]?.deadlineAt)), "engine deadlineAt present (FLOW-05 field)");
const MID = st.matches[0].config.id;
const DL = st.matches[0].deadlineAt; // the play-day deadline: next 21:00 Australia/Sydney

await goto("#/create-014");
await click("#startEarly");
st = await state();
ok(st?.matches?.[0]?.status === "live", "START EARLY → live");

/* ── the timeline: everything relative to the match's own deadline ──────
   T0     = DL − 5h   (calm: level 0, day 1)
   T_DZ1  = DL − 2h   (gold)
   T_DZ2  = DL − 45m  (orange pulse)
   T_DZ3  = DL − 20m  (red heartbeat + wash + LOG NOW)
   T_PAST = DL + 800ms(day closes once; deadlineAt rolls to day 2)
   Day 2 logs at DL2 − 12h; close at DL2 + 800ms.                      */
const H = 3600e3, MIN = 60e3;
const T0 = DL - 5 * H;

console.log("— DAY 1 (calm) @ T0 = DL−5h");
await setNow(T0);
await D_(`D.logRepsAt('${MID}', { exerciseId: 'pushup', reps: 50, playerId: 'you' }, ${T0 + 60e3}).closed ?? false`);
await D_(`D.logRepsAt('${MID}', { exerciseId: 'pushup', reps: 40, playerId: 'sam' }, ${T0 + 2 * MIN}).closed ?? false`);
await D_(`D.logRepsAt('${MID}', { exerciseId: 'squat', reps: 20, playerId: 'jordan' }, ${T0 + 3 * MIN}).closed ?? false`);
st = await state();
const day1Key = await D_(`D.dayKeyOf(${DL})`);
const day1Lead = await evalJs(`import('${BASE}/daily.js').then((D) => {
  const s = JSON.parse(localStorage.getItem('rwf.figma.v1'));
  const m = s.matches.find((x) => x.config.id === '${MID}');
  return D.dailyStandings(m, D.dayKeyOf(${DL}))[0]?.playerId ?? null;
})`);
ok(day1Lead === "you", "day-1 standings: you lead on adjusted (75 vs 40 RUF)");
await goto("#/battle-001");
ok((await text(".fx-daylabel"))?.includes("DAY 1"), "day label shows DAY 1");
ok(await exists("[data-dz-countdown]"), "live countdown wired to the real deadline");
ok(!(await exists(".fg-count--dz1, .fg-count--dz2, .fg-count--dz3")), "no danger level at T−5h");
ok((await evalJs(`document.querySelector('[data-dz-banner]')?.style.display`)) === "none", "danger banner hidden at level 0");
const tick1 = await text("[data-dz-countdown] .fg-count__time");
await setNow(T0 + 1500); // advance the pinned clock — the ticker recomputes from the deadline
await sleep(1300);
const tick2 = await text("[data-dz-countdown] .fg-count__time");
ok(tick1 !== tick2 && /^\d+:\d{2}:\d{2}$/.test(tick2 ?? ""), `countdown really ticks (${tick1} → ${tick2})`);
await setNow(T0);
ok((await evalJs(`document.getElementById('app').classList.contains('fx-app--dz')`)) === false, "no DZ wash at level 0");
await shot("day1-calm");

console.log("— T−2h → DZ1 (gold chip + banner)");
await setNow(DL - 2 * H);
await goto("#/battle-001");
ok(await exists(".fg-count--dz1"), "countdown pill at DZ1");
ok((await evalJs(`document.querySelector('[data-dz-banner]').className`))?.includes("fg-dz--l1"), "danger banner at L1");
ok((await text("[data-dz-banner] .fg-dz__label"))?.includes("FINAL 3 HOURS"), "banner copy: FINAL 3 HOURS");
ok((await evalJs(`document.querySelector('[data-dz-log]')?.style.display`)) !== "none", "LOG NOW affordance visible at level ≥1");
await goto("#/home-003");
ok(await exists(".fg-status--dz1"), "home battles list shows DZ1 chip");
ok((await text(".fg-status--dz1"))?.includes("DZ1"), `chip reads DZ1 + time (${await text(".fg-status--dz1")})`);
await shot("dz1");

console.log("— T−45m → DZ2 (orange + pulse)");
await setNow(DL - 45 * MIN);
await goto("#/battle-001");
ok(await exists(".fg-count--dz2"), "countdown pill at DZ2");
ok((await evalJs(`document.querySelector('[data-dz-banner]').className`))?.includes("fg-dz--l2"), "banner at L2");
ok((await evalJs(`getComputedStyle(document.querySelector('[data-dz-banner]')).animationName`)) === "fg-dz-pulse", "banner pulses (fg-dz-pulse)");
ok((await text("[data-dz-banner] .fg-dz__label"))?.includes("UNDER AN HOUR"), "banner copy: UNDER AN HOUR LEFT");
await shot("dz2");

console.log("— T−20m → DZ3 (red heartbeat + wash + LOG NOW opens the sheet)");
await setNow(DL - 20 * MIN);
await goto("#/battle-001");
ok(await exists(".fg-count--dz3"), "countdown pill at DZ3");
ok((await text("[data-dz-banner] .fg-dz__label"))?.includes("MINUTES LEFT"), `banner counts minutes (${await text("[data-dz-banner] .fg-dz__label")})`);
ok((await evalJs(`getComputedStyle(document.querySelector('.fg-count--dz3 .fg-count__time')).animationName`)) === "fg-heartbeat", "heartbeat on the TIMER ONLY");
ok(await exists("#app.fx-app--dz"), "screen wash at level 3 (--dz-bg)");
ok(await exists(".fx-hero--dz3"), "hero glows at DZ3");
await click("[data-dz-log]");
ok(await exists("#quickLog"), "LOG NOW opens the quick-log sheet");
await evalJs(`(() => { document.querySelector('[data-n="10"]').click(); return true; })()`);
await sleep(120);
await click("#qlCta");
st = await state();
ok(st.matches[0].entries.some((e) => e.playerId === "you" && e.reps === 10 && e.exerciseId === "pushup"), "DZ3 log committed through the real UI path");
await goto("#/battle-001");
await shot("dz3");

console.log("— PAST DEADLINE → the day closes itself (ONCE)");
await setNow(DL + 800);
await waitFor(async () => Object.keys((await state())?.matches?.[0]?.dailyHistory ?? {}).length === 1, { label: "day-1 close", timeout: 6000 });
st = await state();
const hist1 = st.matches[0].dailyHistory ?? {};
ok(Object.keys(hist1).length === 1 && !!hist1[day1Key], `dailyHistory[day1] recorded (keys ${Object.keys(hist1)} / day1Key ${day1Key})`);
const day1Rec = hist1[day1Key] ?? {};
ok(day1Rec.winner?.playerId === "you" && day1Rec.youWon === true, "day-1 winner = you (adjusted, not raw)");
ok(day1Rec.entriesCount >= 3, `entries counted (${day1Rec.entriesCount})`);
ok(await exists(".fx-toast--live"), "daily winner toast fired");
ok((await text(".fx-toast--live"))?.includes("DAY CLOSED"), "toast says DAY CLOSED — winner");
const toastBtn = await evalJs(`!!document.querySelector('.fx-toast--live [data-go="daily-001"]')`);
ok(toastBtn, "toast carries a RECAP link");
// idempotence: let several ticks pass — still exactly one day recorded
await sleep(2600);
st = await state();
ok(Object.keys(st.matches[0].dailyHistory).length === 1, "close fires ONCE (no duplicate days)");
ok(Number(st.matches[0].deadlineAt) > DL, "deadlineAt rolled to day 2 (21:00 AEST convention)");
const DL2 = st.matches[0].deadlineAt;
await goto("#/battle-001");
ok((await text(".fx-daylabel"))?.includes("DAY 2"), "battle screen shows DAY 2 after close");
ok(!(await exists(".fg-count--dz1, .fg-count--dz2, .fg-count--dz3")), "danger reset for day 2");
ok((await text("[data-dz-countdown] .fg-count__time"))?.length >= 6, `day-2 countdown restarted (${await text("[data-dz-countdown] .fg-count__time")})`);
ok(await exists(".fx-recaplink"), "recap link row on battle screen");
await shot("close-day2-starts");

console.log("— RECAP (you won day 1)");
await goto("#/daily-001");
ok((await text(".fx-winnercard .fx-h1"))?.toUpperCase().includes("YOU WON"), `headline: YOU WON ${await text(".fx-winnercard .fx-h1")}`);
ok((await text(".fx-winnercard"))?.includes("RUF adjusted"), "winner card tells the adjusted-score story");
ok((await evalJs(`document.querySelectorAll('.fx-drow').length`)) >= 2, "daily standings rows (players who logged)");
ok((await text(".fx-moments"))?.includes("biggest of the day"), "MOMENTS strip from real entries");
ok((await text(".fx-nextday"))?.includes("NEXT BATTLE DAY"), "come-back-tomorrow strip");
ok(await exists(".fx-nemesis"), "nemesis tease (head-to-head that day)");
await shot("recap-you-won");

console.log("— DAY 2 (Sam takes it) + multi-day history");
await setNow(DL2 - 12 * H);
await D_(`D.logRepsAt('${MID}', { exerciseId: 'squat', reps: 60, playerId: 'sam' }, ${DL2 - 12 * H + 5 * MIN}).closed ?? false`);
await D_(`D.logRepsAt('${MID}', { exerciseId: 'pushup', reps: 10, playerId: 'you' }, ${DL2 - 12 * H + 10 * MIN}).closed ?? false`);
st = await state();
ok(st.matches[0].entries.length >= 6, `day-2 entries in state (${st.matches[0].entries.length} total: 4 day-1 + 2 day-2)`);
await goto("#/battle-001");
ok((await text(".fx-daylabel"))?.includes("DAY 2"), "still day 2 before its deadline");
await shot("day2-live");

console.log("— PAST DAY-2 DEADLINE → second close");
await setNow(DL2 + 800);
await waitFor(async () => Object.keys((await state())?.matches?.[0]?.dailyHistory ?? {}).length === 2, { label: "day-2 close", timeout: 6000 });
st = await state();
const hist2 = st.matches[0].dailyHistory;
const day2Key = await D_(`D.dayKeyOf(${DL2})`);
ok(Object.keys(hist2).length === 2, "multi-day dailyHistory (2 days)");
ok(hist2[day2Key]?.winner?.playerId === "sam" && hist2[day2Key]?.youWon === false, `day-2 winner = Sam (his day)`);
ok(hist2[day1Key]?.winner?.playerId === "you", "day-1 record untouched (history is append-only)");
await sleep(2400);
ok(Object.keys((await state()).matches[0].dailyHistory).length === 2, "day-2 close also fires exactly once");

console.log("— RECAP (Sam took day 2) + day chips switch days");
await goto("#/daily-001");
ok((await text(".fx-winnercard .fx-h1"))?.toUpperCase().includes("SAM TOOK"), `headline: SAM TOOK ${await text(".fx-winnercard .fx-h1")}`);
ok((await text(".fx-winnercard"))?.includes("2nd"), "your line: finished 2nd — X short");
ok((await text(".fx-winnercard"))?.includes("Tomorrow, finish the job."), "Ben's comeback line in his tone");
ok((await evalJs(`document.querySelectorAll('.fx-daychip').length`)) >= 2, "day chips for both closed days");
await evalJs(`(() => { const chips = document.querySelectorAll('.fx-daychip[data-day]'); chips[0].click(); return true; })()`);
await sleep(250);
ok((await text(".fx-winnercard .fx-h1"))?.toUpperCase().includes("YOU WON"), "day chip switches back to day 1 (you won)");
await shot("recap-sam-took");

console.log("— HOME reflects the temporal state");
await goto("#/home-003");
ok((await text(".fg-battle"))?.includes("Last day"), "battles list foot carries last daily winner");
await goto("#/home-002");
ok(await exists('[data-go="daily-001"]'), "home recap strip navigates to daily-001");
ok(await exists("[data-dz-countdown]"), "home countdown also ticks to the real deadline");
await shot("home-temporal");

/* ── verdict ──────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step + failures.length} assertions passed`);
if (consoleErrors.length) {
  console.log(`\n✗ CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e}`);
} else {
  console.log("✓ zero console errors");
}
if (failures.length || consoleErrors.length) {
  console.log(`\nE2E DAILY FAILED: ${failures.length} assertion(s), ${consoleErrors.length} console error(s)`);
  process.exitCode = 1;
} else {
  console.log("\nE2E DAILY PASSED — full temporal loop walked clean");
}

/* ── cleanup ──────────────────────────────────────────────────────────── */
function cleanup() {
  try { ws.close(); } catch {}
  try { proc.kill(9); } catch {}
  try { server.stop(true); } catch {}
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
process.on("exit", () => { cleanup(); Bun.sleepSync(150); });
await Bun.sleep(200);
process.exit(process.exitCode ?? 0);
