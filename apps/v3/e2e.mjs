/* ═══════════════════════════════════════════════════════════════════════
   RWF V3 BATTLE COURSE — e2e (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The full battle, on the real app:
     home → setup → create (fast battle) → THE 3D COURSE with the
     draft-from-3 sheet over it → runners at the start line → keep a
     card → LOG REPS (≤3-tap quick-log) → world positions advance
     MATCHING progress % → mates + daily drop → play a card (CSS-3D
     flight + 3D billboard burst + engine effect) → DANGER ZONE ramp →
     close on the reps target → 3D PODIUM + confetti + charity →
     rematch → close on the CLOCK (the other deadline) → language
     sweep (battle words only) → desktop 1280×800 → frame-ms budget.
   Zero console errors is a hard gate. Shots land in apps/v3/shots/
   with the _v3 suffix (390×844 @2x + one desktop).
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9229;

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: apps/v3 at / + the real /design, /site, /models ─── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".bvh": "text/plain",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    let fsPath = null;
    if (p.startsWith("/design/")) {
      fsPath = join(ROOT, p); // index.html references /design/{fonts,tokens}.css absolutely
    } else if (p.startsWith("/site/")) {
      fsPath = join(ROOT, p); // three.js r177 + model-avatars.js + recolor
    } else if (p.startsWith("/models/")) {
      fsPath = join(ROOT, "site/models", p.replace(/^\/models\//, "")); // Geno + Soldier GLBs
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
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v3-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v3-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  // SwiftShader GL — the 3D course must run headless (same as the avatars gallery)
  "--use-gl=angle", "--use-angle=swiftshader",
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
  await sleep(360); // render + wire + first transitions
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(260);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_v3.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const call = (expr) => evalJs(`(window.__rwfV3 ? window.__rwfV3.${expr} : null)`);

/* battle language sweep — the founder's rule, enforced */
const BANNED = /kitty|poker|\blaps?\b|race.?night|\btable\b|\bfelt\b/i;
const langClean = (where) =>
  evalJs(`(() => { const t = document.body.innerText || ''; return !${BANNED.toString()}.test(t); })()`)
    .then((clean) => ok(clean === true, `battle language clean on ${where} (no kitty/poker/lap/race-night/table/felt)`));

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V3 BATTLE COURSE E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/index.html#/home` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfV3?.ready === true && document.querySelector('.v3-h1') !== null`).catch(() => false),
  { label: "v3 app load", timeout: 20000 }
);
await sleep(600);

console.log("— HOME");
ok(await exists(".v3-h1"), "home hero renders");
ok(await exists("#newBattle"), "fast battle CTA shown");
ok((await text(".v3-h1")).includes("course"), "hero speaks the course language");
await shot("home");
await langClean("home");

console.log("— SETUP (identity)");
await goto("#/setup");
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = 'Alexei'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await evalJs(`document.querySelector('[data-tier="couch"]').click(); true`);
await sleep(150);
await shot("setup");
await click("#setupGo");
const st1 = await evalJs(`JSON.parse(localStorage.getItem('rwf.v3') ?? 'null')`);
ok(st1?.player?.name === "Alexei" && st1?.player?.tier === "couch", "player persisted to rwf.v3");
ok((await evalJs(`localStorage.getItem('rwf.figma.v1')`)) === null, "v1 save key NOT written (independence)");
ok((await evalJs(`localStorage.getItem('rwf.board.v2')`)) === null, "v2 save key NOT written (independence)");

console.log("— CREATE (fast battle)");
await goto("#/create");
ok((await evalJs(`document.querySelector('#bName')?.value`)) === "The 300 Club", "battle name prefilled");
ok((await evalJs(`document.querySelectorAll('#dayRow .v3-pick.is-on').length`)) === 3, "3 default battle days on");
ok((await evalJs(`document.querySelectorAll('#tgtRow .v3-pick.is-on').length`)) === 1, "one target selected");
await shot("create");
await click("#startBattle");

console.log("— THE COURSE (draft-from-3 sheet OVER the 3D course)");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "draft sheet over the course" });
await waitFor(() => evalJs(`!!document.querySelector('#gl canvas')`).catch(() => false), { label: "WebGL canvas mounted" });
ok((await evalJs(`document.querySelectorAll('#draftFan .bd-card--deal').length`)) === 3, "3 cards dealt with deal-in animation");
await shot("battle-draft");

console.log("— RUNNERS AT THE START LINE");
await waitFor(() => call("runnerPos('you')").then((p) => !!p).catch(() => false), { label: "runner probe live" });
const p0 = await call("runnerPos('you')");
const laneXs = await call("laneXs()");
const COURSE = await call("courseLen()");
const START_Z = await call("startZ()");
ok(Math.abs(p0.z - START_Z) < 0.05, `your runner starts at the line (z=${p0.z})`);
ok(p0.t < 0.01, "progress t = 0 before any reps");
ok(laneXs.length === 4 && new Set(laneXs).size === 4, "4 distinct lanes (one per runner)");
const spread = Math.max(...laneXs) - Math.min(...laneXs);
ok(spread > 4 && spread < 6.5, `lanes spread across the course (Δ=${spread.toFixed(2)} ≈ 3×1.7)`);
ok(Math.abs(laneXs.reduce((a, b) => a + b, 0)) < 0.01, "lanes centred on x=0");
ok((await evalJs(`document.querySelectorAll('.v3-srow').length`)) === 4, "4 standings rows in the HUD");
ok(await exists("#battleClock"), "battle clock present");
ok((await text("#clockTag")) === "BATTLE CLOCK", "clock label reads BATTLE CLOCK (battle language)");

console.log("— KEEP A CARD (draft → live)");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[1].click(); true`);
await sleep(180);
ok(await evalJs(`document.querySelectorAll('#draftFan .bd-card.is-sel').length === 1`), "card selectable");
await shot("draft-pick");
await click("#keepBtn");
await sleep(900); // pick-fly → keep → start
ok(await evalJs(`!document.querySelector('#draftFan')`), "draft sheet closed after the pick");
const mid = await call("matchId()");
ok(!!mid, "match id resolves");
const st2 = await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`);
const m0 = st2.matches.find((m) => m.config.id === mid);
ok(m0?.status === "live", "battle live after the draft");
ok((await evalJs(`document.querySelectorAll('#hand .bd-card--deal').length`)) === 1, "kept card dealt into hand (deal-in anim)");
await shot("battle-live");

console.log("— LOG REPS (≤3-tap quick-log → runner advances matching progress %)");
const posBefore = await call("runnerPos('you')");
const laneOfYou = posBefore.x;
await click("#logBtn");
ok(await exists("#exRow"), "log sheet opens (exercise chips)");
await evalJs(`document.querySelector('[data-step="25"]').click(); true`);
await sleep(150);
await shot("logsheet");
await click("#logGo");
await sleep(1600); // runner lerp (~0.95s) + settle
const posAfter = await call("runnerPos('you')");
const prog = await call("progressOf('you')");
const expectedZ = START_Z - prog * COURSE;
ok(Math.abs(posAfter.z - expectedZ) < COURSE * 0.03,
   `world z matches progress % (z=${posAfter.z.toFixed(2)} vs expected ${expectedZ.toFixed(2)} · ${(prog * 100).toFixed(1)}%)`);
ok(Math.abs(posAfter.z - posBefore.z) > 3, `runner visibly advanced down the course (Δz=${(posAfter.z - posBefore.z).toFixed(2)})`);
ok(Math.abs(posAfter.x - laneOfYou) < 0.15, "runner stays in its lane");
ok(await call("potTotal()") === 85, "charity pot grew +5 (log tip)");
ok((await evalJs(`document.querySelectorAll('.v3-feed > div, .v3-feed div').length`)) >= 1, "commentary feed live");
await shot("battle-logged");

console.log("— MATES + DAILY DROP");
await click("#simBtn");
await sleep(1400);
ok((await evalJs(`document.querySelectorAll('.v3-srow').length`)) === 4, "standings still patched in place");
const hand0 = await call("handKinds()");
await click("#dealDrop");
await sleep(320);
const hand1 = await call("handKinds()");
ok(hand1.length === hand0.length + 1, `daily drop dealt (${hand0.length} → ${hand1.length})`);
await shot("battle-dealt");

console.log("— PLAY A CARD (CSS-3D flight + 3D billboard burst + engine effect)");
// play the cheapest affordable card (shield 10 → freeze 15 → steal 30 → lightning 50)
let played = null;
for (const kind of ["shield", "freeze", "steal", "lightning"]) {
  const kinds = await call("handKinds()");
  const idx = kinds.indexOf(kind);
  if (idx < 0) continue;
  await evalJs(`document.querySelectorAll('#hand .bd-card')[${idx}].click(); true`);
  await sleep(240);
  if (await evalJs(`!document.querySelector('#playIt')?.disabled`)) {
    const fx0 = await call("fxPlayed()");
    await evalJs(`(() => { window.__playSeen = false; const iv = setInterval(() => { if (document.querySelector('.bd-card.is-playing')) window.__playSeen = true; }, 25); setTimeout(() => clearInterval(iv), 1600); return true; })()`);
    await shot("cardsheet");
    await click("#playIt");
    await sleep(300);
    ok(await evalJs(`window.__playSeen === true`), "CSS card play animation fires (.is-playing flip+fly)");
    await sleep(1100);
    ok((await call("fxPlayed()")) > fx0, "3D billboard play fx fired (card flies up + bursts over the runner)");
    played = kind;
    break;
  }
  await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`); // unaffordable — next
  await sleep(260);
}
ok(!!played, `a card was played through the RUF economy (${played})`);
const hand2 = await call("handKinds()");
ok(hand2.length === hand1.length - 1, "card left the hand after playing");
const m1 = (await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`)).matches.find((m) => m.config.id === mid);
ok((m1.powerLog ?? []).length >= 1, "engine power log recorded the play (real effect)");
await shot("battle-played");

console.log("— MOCAP + PERF (Geno runners under Soldier clips)");
await waitFor(() => call("modelsReady()").catch(() => false), { label: "Geno + Soldier mocap loaded", timeout: 30000 });
const pGeno = await call("runnerPos('you')");
ok(pGeno.avatarReady === true, "your runner is a real Geno avatar (mocap-driven)");
ok((await evalJs(`window.__rwfV3.runnerPos('sam')?.avatarReady`)) === true, "mates' runners are Geno avatars too");
// walking frame budget: log 10 more so a runner is mid-lerp, sample the median frame
await evalJs(`window.__rwfV3.driveLog(10); true`);
await sleep(2200);
const fms = await call("frameMs()");
ok(fms > 0 && fms < 8, `frame render cost under the 8ms budget while walking (median ${fms.toFixed(2)}ms)`);

console.log("— DANGER ZONE (clock ramp)");
await evalJs(`window.__rwfV3.driveDeadline(20 * 60 * 1000); true`);
await sleep(300);
ok(await exists("#dzBar:not([hidden])"), "danger zone banner shows at 20 min");
ok(/^DANGER ZONE/.test((await text("#dzBar")) ?? ""), `banner copy is v1 battle language ("${await text("#dzBar")}")`);
ok((await evalJs(`document.querySelector('#battleClock').dataset.dz`)) === "3", "clock ramps to DZ3 (≤30 min)");
await shot("battle-dz");
await evalJs(`window.__rwfV3.driveDeadline(6 * 60 * 60 * 1000); true`); // unwind — battle still live
await sleep(200);

console.log("— CLOSE ON THE REPS TARGET (deadline #1)");
let closed = false, guard = 0;
while (!closed && guard++ < 14) {
  const r = await evalJs(`window.__rwfV3.driveLog(50)`);
  closed = !!r?.closed;
  await sleep(240);
}
ok(closed, "someone crossed the battle distance — battle complete");
await sleep(1100); // → result route
ok(await call("view()") === "result", "routed to the result view");
await shot("result");

console.log("— THE 3D PODIUM");
await waitFor(() => call("modelsReady()").catch(() => false), { label: "podium avatars loaded", timeout: 30000 });
ok((await call("camMode()")) === "podium", "course switched to podium mode");
ok(await exists(".v3-resultbar"), "winner bar over the podium");
ok((await text(".v3-resultbar__pot")).includes("charity pot"), "charity pot shown at the podium");
ok(await exists(".v3-result__confetti"), "confetti celebration");
const stPod = await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`);
const mDone = stPod.matches.find((m) => m.config.id === mid);
const winRow = (await import("./engine.js")).finalStandings(mDone)[0];
const winPos = await call(`runnerPos('${winRow.player.id}')`);
ok(Math.abs(winPos.x) < 0.05, `winner's avatar stands on the centre (1st) block (x=${winPos.x})`);
ok((await call("chipCount()")) > 0, "chip stacks on the charity pot pedestal");
await shot("result-podium");
await langClean("result");

console.log("— CHARITY + REMATCH");
await evalJs(`document.querySelector('#charRow .v3-pick').click(); true`);
await sleep(300);
const potAfter = (await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`)).pots[mid];
ok(potAfter?.designatedCharityId != null, "pot designated to a charity (pot ledger)");
await shot("result-charity");
await click("#rematchBtn");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "rematch draft sheet" });
ok(true, "rematch → fresh draft-from-3 over a fresh course");
await shot("rematch-draft");

console.log("— CLOSE ON THE CLOCK (deadline #2 — the other half of the dual deadline)");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[0].click(); true`);
await sleep(160);
await click("#keepBtn");
await sleep(900);
const cc = await evalJs(`window.__rwfV3.driveClockClose()`);
ok(cc?.ok === true, "the clock closed the live battle");
await sleep(1100);
ok(await call("view()") === "result", "clock close routes to the result view");
ok((await text(".v3-resultbar__s")).includes("clock closed it"), "result copy credits the clock (no closure bonus)");
await shot("result-clockclose");
await langClean("result (clock close)");

console.log("— HOME AFTER THE WAR");
await goto("#/home");
ok((await evalJs(`document.querySelectorAll('.v3-bcard').length`)) >= 2, "battles list shows the settled battles");
ok(/SETTLED/.test((await evalJs(`document.querySelector('.v3-bcard__status')?.textContent`)) ?? ""), "settled battles carry the SETTLED status");
await langClean("home (settled)");
await shot("home-settled");

console.log("— DESKTOP (1280×800)");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
// one more live battle to check the desktop HUD rails
await goto("#/create");
await click("#startBattle");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "desktop draft" });
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[0].click(); true`);
await sleep(160);
await click("#keepBtn");
await sleep(900);
const overflow = await evalJs(`document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth`);
ok(overflow <= 1, `no horizontal overflow at 1280px (${overflow}px)`);
ok(await evalJs(`!!document.querySelector('#gl canvas')`), "course canvas mounted on desktop");
const stripTop = await evalJs(`parseFloat(getComputedStyle(document.querySelector('.v3-strip')).top)`);
ok(stripTop >= 50, `standings rail sits below the camera controls on desktop (top ${stripTop}px)`);
ok((await evalJs(`document.querySelectorAll('.v3-srow').length`)) === 4, "4 standings rows on the desktop rail");
await shot("desktop-battle");
await langClean("desktop battle");

console.log("— ISOLATION (v3 e2e server mounts only apps/v3)");
const v1 = await fetch(`${BASE}/figma-app/index.html`).catch(() => null);
ok(v1?.status === 404, "figma-app never mounted (v1 untouched)");
const v2 = await fetch(`${BASE}/v2/index.html`).catch(() => null);
ok(v2?.status === 404, "board app never mounted (v2 untouched)");

/* ── verdict ──────────────────────────────────────────────────────────── */
console.log("— CONSOLE");
const errSample = consoleErrors.slice(0, 5);
ok(consoleErrors.length === 0, `zero console errors${errSample.length ? ` — ${errSample.join(" | ")}` : ""}`);

console.log(`\n${passed}/${step} assertions passed`);
server.stop(true);
try { proc.kill("SIGKILL"); } catch {}
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v3-e2e"]); } catch {} // take the whole browser tree
if (failures.length || consoleErrors.length) {
  console.error(`FAILURES: ${failures.length ? failures.join(" · ") : "none"}${consoleErrors.length ? ` (+${consoleErrors.length} console errors)` : ""}`);
  process.exit(1);
}
console.log("ALL GREEN — /v3 battle course verified.");
process.exit(0);
