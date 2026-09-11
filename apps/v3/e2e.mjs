/* ═══════════════════════════════════════════════════════════════════════
   RWF V3 BATTLE COURSE — e2e (headless chromium + CDP, no deps)
   UX2 — THE 3-CLICK ENTRY EDITION
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder's walk, verbatim ("3 clicks to playing"):
     fresh visit → THE ENTRY (type your name → tap a tier → tap START
     THE BATTLE) → ON THE 3D COURSE in a LIVE battle vs the seeded demo
     crew (varied tiers, auto-seated) — no wizard, no draft screen, no
     other page. Auto-dealt power-up in hand, TABLE camera, drag-to-look
     hint, everything auto-set (target 200 · every day · bodyweight ·
     weekly season · giving OFF). Then the deep game: LOG REPS → the
     runner advances matching progress % → mates + daily drop → real 3D
     card meshes + hover → play a card (CSS flight + 3D burst + engine
     effect) → ⚙︎ HOUSE RULES (11 rule cards: target 200 ↔ 150/250, pack,
     auto-deal, giving, FROG heads — live) → the POV trio → dashboard +
     back-gesture → DANGER ZONE ramp → close on the REPS TARGET → result
     (giving OFF → the house-rules nudge, no charity row) → flip giving
     ON + auto-deal OFF in ⚙︎ → REMATCH → draft-from-3 (the manual path
     returns) → close on the CLOCK → result (charity row back, pot
     designated) → JOIN WITH CODE → the hub (START A BATTLE · JOIN ·
     battles with LIVE pills) → desktop 1280×800 → frame-ms budget.
   Plus the 390×844 DISPLAY AUDIT (founder: "text cutoff, buttons
   covered, need to scroll"): zero horizontal overflow, no vertical
   scroll on the entry or the battle, the hand on-screen, the feed never
   under-running the buttons, long names truncated with full-name-on-tap.
   Zero console errors is a hard gate. Shots land in apps/v3/shots/
   with the _ux2 suffix (390×844 @2x + desktop legs).
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
      fsPath = join(ROOT, "site/models", p.replace(/^\/models\//, "")); // meshy trio + Geno GLBs
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
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_ux2.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const call = (expr) => evalJs(`(window.__rwfV3 ? window.__rwfV3.${expr} : null)`);

/* battle language sweep — the founder's rule, enforced on page COPY.
   (The quick bar's camera label "CAM · TABLE" is the founder's own term
   for the POV — chrome, not copy — so the sweep reads #app, not body.) */
const BANNED = /kitty|poker|\blaps?\b|race.?night|\btable\b|\bfelt\b/i;
const langClean = (where) =>
  evalJs(`(() => { const t = document.querySelector('#app')?.innerText || ''; return !${BANNED.toString()}.test(t); })()`)
    .then((clean) => ok(clean === true, `battle language clean on ${where} (no kitty/poker/lap/race-night/table/felt)`));

/* ── display-audit helpers (the founder: "text cutoff, buttons covered,
   need to scroll" — every check runs at 390×844) ── */
const audit = {
  noHScroll: () => evalJs(`document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth`),
  viewFits: (sel) => evalJs(`(() => { const v = document.querySelector('${sel}'); return v ? v.scrollHeight - v.clientHeight : -999; })()`),
  withinViewport: (sel) => evalJs(`(() => { const r = document.querySelector('${sel}')?.getBoundingClientRect(); return r ? (r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1) : null; })()`),
  feedAboveButtons: () => evalJs(`(() => { const f = document.querySelector('#feed')?.getBoundingClientRect(), b = document.querySelector('#logBtn')?.getBoundingClientRect(); return f && b ? f.bottom <= b.top + 1 : null; })()`),
  handOnScreen: () => evalJs(`document.querySelector('#hand').getBoundingClientRect().bottom <= innerHeight + 1`),
  noOverlap: (a, b) => evalJs(`(() => { const r1 = document.querySelector('${a}')?.getBoundingClientRect(), r2 = document.querySelector('${b}')?.getBoundingClientRect(); return (r1 && r2) ? !(r1.top < r2.bottom && r2.top < r1.bottom && r1.left < r2.right && r2.left < r1.right) : null; })()`),
};

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V3 BATTLE COURSE E2E (UX2) — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/index.html#/home` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfV3?.ready === true && document.querySelector('#entry') !== null`).catch(() => false),
  { label: "v3 app load → fresh visitor lands on the 3-click entry", timeout: 20000 }
);
await sleep(600);

console.log("— THE ENTRY (3 clicks to playing — no wizard, no hub first)");
ok((await call("view()")) === "play", "fresh visit lands on THE ENTRY (#/play) — never a hub or wizard");
ok(await exists("#nameIn"), "step 1 — the name field, front and centre");
ok(await exists("#tiers"), "step 2 — the tier grid is on the same screen");
ok(await exists("#startBattle"), "step 3 — START THE BATTLE is on the same screen");
ok((await text("#startBattle")) === "START THE BATTLE", "the button says START THE BATTLE");
ok((await evalJs(`document.querySelector('#startBattle').disabled`)) === true, "START is gated until name + tier");
{
  const tierFaces = await evalJs(`[...document.querySelectorAll('.v3-tier')].map(b => b.dataset.tier + ':' + b.querySelector('.v3-tier__x').textContent)`);
  ok(tierFaces.length === 4 && tierFaces.every((f) => f.startsWith("couch:×") || f.startsWith("casual:×") || f.startsWith("fit:×") || f.startsWith("athlete:×")), `4 big tier targets, the ×multiplier on the face (${tierFaces.join(" · ")})`);
}
ok((await audit.noHScroll()) <= 1, "no horizontal overflow on the entry");
ok((await audit.viewFits(".v3-screen")) <= 2, "the entry fits 390×844 with NO scrolling");
await shot("entry");
await langClean("entry");

/* CLICK 1 — type your name (auto-advances) */
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.focus(); i.value = 'Alexei'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(350);
ok((await evalJs(`document.querySelector('[data-tier="couch"]').disabled`)) === false, "CLICK 1 (typing) auto-advances — the tier grid wakes up");
await shot("entry-name");

/* CLICK 2 — tap your tier (auto-advances) */
await evalJs(`document.querySelector('[data-tier="couch"]').click(); true`);
await sleep(350);
ok((await evalJs(`document.querySelector('#startBattle').disabled`)) === false, "CLICK 2 (tier tap) auto-advances — START THE BATTLE lights up");
await shot("entry-tier");

/* CLICK 3 — START → ON THE COURSE */
await click("#startBattle");
await waitFor(() => exists("#gl canvas").catch(() => false), { label: "the 3D course after three clicks" });
await waitFor(() => call("runnerPos('you')").then((p) => !!p).catch(() => false), { label: "runner probe live" });
await sleep(400);

console.log("— THE COURSE LANDING (you are IN a live battle — nothing else first)");
ok((await call("view()")) === "battle", "after START the view IS the battle course");
const st1 = await evalJs(`JSON.parse(localStorage.getItem('rwf.v3') ?? 'null')`);
ok(st1?.player?.name === "Alexei" && st1?.player?.tier === "couch", "player persisted to rwf.v3 (name + tier)");
const mid = await call("matchId()");
const m0 = st1.matches.find((m) => m.config.id === mid);
ok(m0?.status === "live", "the battle is already LIVE (auto-deal — no draft screen, no start ceremony)");
ok(m0?.config.targetReps === 200, "target auto-set to 200 (the founder's default)");
ok((m0?.config.playDays ?? []).length === 7 && m0.config.playDays.includes(new Date().getDay()), "battle days auto-set — today active, every day");
ok(m0?.players.length === 4 && m0.players.filter((p) => p.id !== "you").length === 3, "demo crew auto-seated — 3 instant opponents");
ok(new Set(m0.players.map((p) => p.tier)).size >= 3, "crew tiers varied (a real ladder, not clones)");
ok(m0?.players.some((p) => p.name.length > 12), "long-name runner seated (Mikayla) — the HUD must earn its ellipsis");
ok((await evalJs(`localStorage.getItem('rwf.figma.v1')`)) === null, "v1 save key NOT written (independence)");
ok((await evalJs(`localStorage.getItem('rwf.board.v2')`)) === null, "v2 save key NOT written (independence)");
ok(await exists("#orbitHint"), "drag-to-look affordance shows on landing");
ok((await call("camState()"))?.mode === "table", "TABLE camera is the default POV on landing");
ok((await evalJs(`document.querySelectorAll('.v3-srow').length`)) === 4, "4 standings rows in the HUD");
ok((await evalJs(`document.querySelector('#qCam')?.hidden`)) === false, "camera cycle live in the quick bar");
ok(await exists("#battleClock"), "battle clock present");
ok((await text("#clockTag")) === "BATTLE CLOCK", "clock label reads BATTLE CLOCK (battle language)");
ok((await call("handKinds()")).length === 1, "power-up auto-dealt — 1 card in hand at START (no draft sheet)");
ok(await evalJs(`!!document.querySelector('#hand .bd-card--deal')`), "the dealt card arrives with the deal-in animation");
const p0 = await call("runnerPos('you')");
const laneXs = await call("laneXs()");
const COURSE = await call("courseLen()");
const START_Z = await call("startZ()");
ok(Math.abs(p0.z - START_Z) < 0.05, `your runner starts at the line (z=${p0.z})`);
ok(p0.t < 0.01, "progress t = 0 before any reps");
ok(laneXs.length === 4 && new Set(laneXs).size === 4, "4 distinct lanes (one per runner)");
const spread = Math.max(...laneXs) - Math.min(...laneXs);
ok(spread > 5.5 && spread < 7, `lanes spread across the course (Δ=${spread.toFixed(2)} ≈ 3×2.1)`);
ok(Math.abs(laneXs.reduce((a, b) => a + b, 0)) < 0.01, "lanes centred on x=0");
ok((await call("potTotal()")) === 80, "charity pot seeded — 4 × 20-pt entries");
await shot("course-landing");
await langClean("battle (landing)");

console.log("— 390×844 DISPLAY AUDIT (the course landing)");
ok((await audit.noHScroll()) <= 1, "no horizontal overflow mid-battle");
ok((await audit.viewFits(".v3-battle")) <= 2, "the battle screen never scrolls vertically");
ok(await audit.handOnScreen(), "the card hand sits fully on-screen");
ok(await audit.feedAboveButtons(), "the feed stacks ABOVE the buttons — nothing covered");
ok(await audit.noOverlap("#feed", "#logBtn"), "feed and LOG REPS never overlap");
ok(await audit.noOverlap("#fxdock", ".v3-strip"), "fx chips never cover the standings strip");
ok(await audit.noOverlap("#orbitHint span", ".v3-strip"), "orbit-hint pill clears the standings strip (the container is the full-course listener)");

console.log("— LONG NAMES (truncated + full name on tap)");
const mikaName = "Mikayla Long-Name-Rutherford";
const mikaTrunc = await evalJs(`(() => {
  const el = [...document.querySelectorAll('.v3-srow__name')].find(n => n.dataset.fullname === '${mikaName}');
  if (!el) return null;
  return { ellipsis: getComputedStyle(el).textOverflow === 'ellipsis', clipped: el.scrollWidth > el.clientWidth, w: el.clientWidth };
})()`);
ok(mikaTrunc?.ellipsis === true && mikaTrunc?.clipped === true, `long name truncates with ellipsis (row width ${mikaTrunc?.w}px)`);
await evalJs(`[...document.querySelectorAll('.v3-srow__name')].find(n => n.dataset.fullname === '${mikaName}')?.click(); true`);
await sleep(350);
ok(((await evalJs(`document.querySelector('.bd-toast')?.textContent`)) ?? "") === mikaName, "tap the truncated name → the FULL name in a toast (nothing covers anything)");
await shot("longname-toast");

console.log("— LOG REPS (≤3-tap quick-log → runner advances matching progress %)");
const posBefore = await call("runnerPos('you')");
const laneOfYou = posBefore.x;
await click("#logBtn");
ok(await exists("#exRow"), "log sheet opens (exercise chips)");
await evalJs(`document.querySelector('[data-step="25"]').click(); true`);
await sleep(150);
await shot("logsheet");
await click("#logGo");
// the runner lerp is dt-clamped: under CPU starvation sim-time runs slower
// than wall-time — settle by POLLING to the expected position (same physics
// assertion, load-tolerant wait; idle machines pass on the first sample)
let posAfter = null, prog = null;
for (let i = 0; i < 24; i++) {
  await sleep(250);
  posAfter = await call("runnerPos('you')");
  prog = await call("progressOf('you')");
  const expectedZ = START_Z - prog * COURSE;
  if (Math.abs(posAfter.z - expectedZ) < COURSE * 0.03 && Math.abs(posAfter.z - posBefore.z) > 2) break;
}
const expectedZ = START_Z - prog * COURSE;
ok(Math.abs(posAfter.z - expectedZ) < COURSE * 0.03,
   `world z matches progress % (z=${posAfter.z.toFixed(2)} vs expected ${expectedZ.toFixed(2)} · ${(prog * 100).toFixed(1)}%)`);
ok(Math.abs(posAfter.z - posBefore.z) > 2, `runner visibly advanced down the course (Δz=${(posAfter.z - posBefore.z).toFixed(2)} on the 28-unit course)`);
ok(Math.abs(posAfter.x - laneOfYou) < 0.15, "runner stays in its lane");
ok((await call("potTotal()")) === 85, "charity pot grew +5 (log tip)");
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

console.log("— 3D POWER-UP CARDS (real card meshes — site/models/cards3d.js)");
const c3 = await call("cards3d()");
ok(c3 && c3.total >= 2 && c3.total === c3.byRunner.you.n + Object.entries(c3.byRunner).filter(([pid]) => pid !== "you").reduce((a, [, r]) => a + r.n, 0),
   `real card meshes fanned over the runners (${c3?.total} cards · ${c3?.meshes} meshes — your 2-card hand + mates' auto-drafts; mates may have played cards in the sim)`);
ok(c3.byRunner.you.n === 2 && c3.meshes === c3.total * 3, `your hand renders as 2 real card meshes (${c3.byRunner.you.kinds.join(", ")}) — 3 meshes per card`);
ok(Object.values(c3?.byRunner ?? {}).every((r) => r.n === 0 || r.xs.length === r.n), "every held card is a positioned mesh in its runner's fan");
{
  // fan geometry: cards symmetric about the runner axis, distinct slots
  const youFan = c3.byRunner.you;
  const mean = youFan.xs.reduce((a, b) => a + b, 0) / youFan.xs.length;
  ok(Math.abs(mean) < 0.05, `your fan is centred on the runner (mean Δx=${mean.toFixed(3)})`);
  ok(new Set(youFan.xs).size === youFan.xs.length, "fan slots are distinct (no stacked cards)");
  ok(c3.deals >= 1, `the DEAL moment ran (auto-deal + daily drop → ${c3.deals} deal arcs from the pot deck)`);
}
{
  // hover — raycast the pointer onto your first card
  const sp = await call("cardScreen('you', 0)");
  ok(!!sp && Math.abs(sp.x) <= 1 && Math.abs(sp.y) <= 1, `your first card is on-frame (NDC ${sp?.x},${sp?.y})`);
  const rect = await evalJs(`(() => { const r = document.querySelector('#gl canvas').getBoundingClientRect(); return JSON.stringify({ l: r.left, t: r.top, w: r.width, h: r.height }); })()`);
  const { l, t, w, h } = JSON.parse(rect);
  const cx = l + ((sp.x + 1) / 2) * w, cy = t + (1 - (sp.y + 1) / 2) * h;
  await evalJs(`document.querySelector('#gl canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: ${cx.toFixed(1)}, clientY: ${cy.toFixed(1)}, bubbles: true })); true`);
  await sleep(500); // lift tween (280ms) + label
  const hov = await call("cards3d()");
  ok(hov.hover && hov.hover.pid === "you" && hov.hover.lifted === true, `hover raycast lifts the card (${hov.hover ? `${hov.hover.id} lifted=${hov.hover.lifted}` : "no hover"})`);
  ok(hov.hoverLabelVisible === true, "hover floats the card name label");
  await evalJs(`document.querySelector('#gl canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4, bubbles: true })); true`);
  await sleep(400);
  ok((await call("cards3d()")).hover === null, "hover clears off-card");
}
await shot("battle-cards3d");

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
      await evalJs(`(() => { window.__playSeen = false; const iv = setInterval(() => { if (document.querySelector('.bd-card.is-playing')) window.__playSeen = true; }, 25); setTimeout(() => clearInterval(iv), 4000); return true; })()`);
      await shot("cardsheet");
      await click("#playIt");
      await sleep(300);
      ok(await evalJs(`window.__playSeen === true`), "CSS card play animation fires (.is-playing flip+fly)");
    await sleep(1100);
    ok((await call("fxPlayed()")) > fx0, "3D card play fx fired (the card flies from the fan to the runner's head + bursts)");
    // the flight completes whenever the frame clock gets CPU — poll, don't guess
    let played3d = null;
    for (let i = 0; i < 30 && !(played3d?.lastPlay); i++) { played3d = await call("cards3d()"); if (!played3d?.lastPlay) await sleep(200); }
    ok(played3d.lastPlay && played3d.lastPlay.rise > 0.3, `card flight covered real distance (rise ${played3d.lastPlay?.rise ?? "?"} units to the runner's head)`);
    ok(played3d.bursts >= 16, `rarity-coloured burst particles exist (${played3d.bursts} sparks spawned across the run)`);
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

console.log("— ATELIER AVATARS (the meshy trio drives the course; Geno on fallback)");
await waitFor(() => call("modelsReady()").catch(() => false), { label: "meshy trio + Soldier mocap loaded", timeout: 30000 });
const pMeshy = await call("runnerPos('you')");
ok(pMeshy.avatarReady === true, "your runner is a real rigged avatar (not the placeholder capsule)");
const kinds4 = {};
for (const pid of ["you", "sam", "alex", "mika"]) kinds4[pid] = (await call(`runnerPos('${pid}')`)).avatarKind;
ok(Object.values(kinds4).every((k) => String(k).startsWith("meshy")), `all four runners wear the atelier's meshy trio (${Object.entries(kinds4).map(([p, k]) => `${p}=${k}`).join(" · ")})`);
// walking frame budget: log 10 more so a runner is mid-lerp, sample the median frame
await evalJs(`window.__rwfV3.driveLog(10); true`);
await sleep(2200);
const fms = await call("frameMs()");
ok(fms > 0 && fms < 8, `frame render cost under the 8ms budget while walking (median ${fms.toFixed(2)}ms)`);

console.log("— ⚙︎ HOUSE RULES (config as rule cards — the settings teaser)");
await click("#qSettings");
await waitFor(() => exists(".rule-card").catch(() => false), { label: "house-rules sheet" });
const ruleCount = await evalJs(`document.querySelectorAll('.rule-card').length`);
ok(ruleCount === 11, `11 rule cards on the sheet (target ×3 · set ×2 · auto-deal ×2 · giving ×2 · species head ×2) — got ${ruleCount}`);
ok(((await text(".bd-sheet__h")) ?? "").toUpperCase().includes("HOUSE RULES"), "the sheet is framed as HOUSE RULES");
ok(await exists(`.rule-card.is-on[data-rule="target"][data-val="standard"]`), "TARGET 200 (standard) is the selected rule card");
ok(await exists(`.rule-card.is-on[data-rule="heads"][data-val="none"]`), "species head defaults to the atelier runner");
await shot("settings-rules");
// swap the target — the founder's literal example: "Target 200 ↔ 150/250"
await evalJs(`document.querySelector('.rule-card[data-rule="target"][data-val="breezy"]').click(); true`);
await sleep(300);
ok((await call("prefs()")).target === "breezy", "TARGET 200 ↔ 150 — rule card swaps the stored house rule");
ok(await exists(`.rule-card.is-on[data-rule="target"][data-val="breezy"]`), "the swapped card shows selected");
// (giving + auto-deal stay at defaults here — the FIRST result must prove
// the giving-OFF branch; they flip in the rematch leg below.)
// THE FROG — species head, live right now
await evalJs(`document.querySelector('.rule-card[data-rule="heads"][data-val="frog"]').click(); true`);
await sleep(200);
ok((await call("prefs()")).heads === "frog", "🐸 FROG head rule saved");
let headsOn = false;
for (let i = 0; i < 30 && !headsOn; i++) {
  headsOn = true;
  for (const pid of ["you", "sam", "alex", "mika"]) {
    if ((await call(`runnerPos('${pid}')`)).headOn !== true) { headsOn = false; break; }
  }
  if (!headsOn) await sleep(300);
}
ok(headsOn, "frog heads attach LIVE on every runner (immediate where safe — no restart)");
await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`); // close — heads stay on for a look
await sleep(500);
await shot("battle-frogheads");
ok((await call("headMode()")) === "frog", "course headMode = frog");
// back to baseline runners for the POV shots
await click("#qSettings");
await waitFor(() => exists(".rule-card").catch(() => false), { label: "house-rules sheet again" });
await evalJs(`document.querySelector('.rule-card[data-rule="heads"][data-val="none"]').click(); true`);
await sleep(200);
let headsOff = false;
for (let i = 0; i < 30 && !headsOff; i++) {
  headsOff = true;
  for (const pid of ["you", "sam", "alex", "mika"]) {
    if ((await call(`runnerPos('${pid}')`)).headOn !== false) { headsOff = false; break; }
  }
  if (!headsOff) await sleep(300);
}
ok(headsOff, "species head OFF detaches cleanly (dispose, no orphans)");
await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`);
await sleep(300);
ok((await audit.viewFits(".v3-battle")) <= 2, "battle still fits after the settings detour (sheet closed clean)");

console.log("— THE POV (founder's oblique board-game view — three modes, same battle moment)");
const cam0 = await call("camState()");
ok(cam0?.mode === "table", "TABLE is the DEFAULT camera (the oblique board-game view)");
ok(cam0?.downDeg >= 50 && cam0?.downDeg <= 65,
   `TABLE looks down in the 50–65° oblique band (${cam0?.downDeg}° below horizon — perspective third person, not flat top-down)`);
let allVisible = true;
const screenPos = {};
for (const pid of ["you", "sam", "alex", "mika"]) {
  const sp = await call(`runnerScreen('${pid}')`);
  screenPos[pid] = sp;
  if (!sp || Math.abs(sp.x) > 1 || Math.abs(sp.y) > 1) allVisible = false;
}
ok(allVisible === true, `every runner on-frame AT ONCE in TABLE (${Object.values(screenPos).map((p) => p ? `${p.x},${p.y}` : "?").join(" · ")})`);
await shot("battle-table_pov");

await click("#qCam");
await sleep(1400); // eased transition settles
let cam1 = await call("camState()");
ok(cam1?.mode === "stadium", "cycle → STADIUM (higher, wider — the spectacle view)");
ok(cam1?.downDeg > 60, `STADIUM sits higher than TABLE (${cam1?.downDeg}° down)`);
await shot("battle-stadium_pov");

await click("#qCam");
await sleep(1400);
cam1 = await call("camState()");
ok(cam1?.mode === "follow", "cycle → FOLLOW (the leader cam, kept from v3.0)");
await shot("battle-follow_pov");

await click("#qCam");
ok((await call("camState()"))?.mode === "table", "cycle wraps back to TABLE");

console.log("— NAV (keyboard C · dashboard one-tap · back gesture never dead-ends)");
await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })); true`);
await sleep(250);
ok((await call("camState()"))?.mode === "stadium", "keyboard C cycles the POV (→ stadium)");
await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })); true`);
await sleep(250);
ok((await call("camState()"))?.mode === "follow", "…and again (C → follow)");
await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" })); true`);
await sleep(250);
ok((await call("camState()"))?.mode === "table", "…and home (C → table)");

await click("#qHome");
ok(await call("view()") === "home", "dashboard button — ONE TAP from mid-battle → home");
ok(((await text("#newBattle")) ?? "") === "START A BATTLE", "the hub hero says START A BATTLE — self-evident");
ok(((await text("#joinBtn")) ?? "") === "JOIN WITH CODE", "JOIN WITH CODE is the secondary — self-evident");
ok((await evalJs(`document.querySelectorAll('.v3-bcard').length`)) >= 1, "your battles listed");
ok(await exists(`.v3-bcard__status--live`), "the live battle carries a LIVE pill — one-tap resume is obvious");
await shot("home-hub");
await langClean("hub");

// one-tap resume
await evalJs(`document.querySelector('.v3-bcard').click(); true`);
await waitFor(() => exists("#gl canvas").catch(() => false), { label: "one-tap resume → course" });
ok((await call("view()")) === "battle", "ONE TAP on the live battle resumes the course");
await evalJs(`history.back(); true`);
await sleep(450);
const backView = await call("view()");
ok(backView === "home", `browser/Android BACK gesture returns to the dashboard (view=${backView} — no dead-end)`);
await evalJs(`history.forward(); true`);
await sleep(450);
await waitFor(() => exists("#gl canvas").catch(() => false), { label: "forward returns to the battle" });
ok((await call("view()")) === "battle", "forward re-enters the battle course");

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
ok(!(await exists("#charRow")), "GIVING OFF (the default) — no charity row; the pot rides forward instead");
ok(((await evalJs(`document.querySelector('.v3-pad')?.innerText`)) ?? "").includes("house rules"), "the result nudges: giving is OFF — flip it in ⚙︎ house rules");
await shot("result-podium");
await langClean("result");

console.log("— FLIP THE HOUSE RULES (giving ON · auto-deal OFF) → REMATCH");
await click("#qSettings");
await waitFor(() => exists(".rule-card").catch(() => false), { label: "house rules over the result" });
await evalJs(`document.querySelector('.rule-card[data-rule="giving"][data-val="true"]').click(); true`);
await evalJs(`document.querySelector('.rule-card[data-rule="autoDeal"][data-val="false"]').click(); true`);
await sleep(250);
ok((await call("prefs()")).giving === true && (await call("prefs()")).autoDeal === false, "giving ON · auto-deal OFF — saved from the sheet");
await evalJs(`document.querySelector('.rule-card[data-rule="target"][data-val="standard"]').click(); true`);
await sleep(200);
ok((await call("prefs()")).target === "standard", "target back to 200 for the rematch (200 ↔ 150/250, the founder's example)");
await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`);
await sleep(300);
await click("#rematchBtn");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "rematch draft sheet (manual path returns)" });
ok((await evalJs(`document.querySelectorAll('#draftFan .bd-card--deal').length`)) === 3, "3 cards dealt with deal-in animation");
await shot("draft-pick");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[1].click(); true`);
await sleep(180);
await click("#keepBtn");
await sleep(900);
ok(await evalJs(`!document.querySelector('#draftFan')`), "draft sheet closed after the pick");
const mid2 = await call("matchId()");
ok(mid2 && mid2 !== mid, "rematch is a fresh battle");
const st2 = await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`);
const mRematch = st2.matches.find((m) => m.config.id === mid2);
ok(mRematch?.status === "live", "rematch live after the manual draft");
ok((await evalJs(`document.querySelectorAll('#hand .bd-card--deal').length`)) === 1, "kept card dealt into hand (deal-in anim)");
await shot("battle-live2");
ok(mRematch.config.targetReps === 200, "house rule applied — the rematch honors the current rule-card target (200)");

console.log("— CLOSE ON THE CLOCK (deadline #2 — the other half of the dual deadline)");
const cc = await evalJs(`window.__rwfV3.driveClockClose()`);
ok(cc?.ok === true, "the clock closed the live battle");
await sleep(1100);
ok(await call("view()") === "result", "clock close routes to the result view");
ok((await text(".v3-resultbar__s")).includes("clock closed it"), "result copy credits the clock (no closure bonus)");
ok(await exists("#charRow"), "GIVING ON — the charity row is back at the result");
await shot("result-charity");
await evalJs(`document.querySelector('#charRow .v3-pick').click(); true`);
await sleep(300);
const potAfter = (await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`)).pots[mid2];
ok(potAfter?.designatedCharityId != null, "pot designated to a charity (pot ledger)");
await shot("result-clockclose");
await langClean("result (clock close)");

console.log("— JOIN WITH CODE (the warm seat)");
await goto("#/home");
await click("#joinBtn");
await waitFor(() => exists("#codeIn").catch(() => false), { label: "join sheet" });
ok(((await text("#joinGo")) ?? "").includes("Join"), "the join sheet has a Join action");
await evalJs(`(() => { const i = document.querySelector('#codeIn'); i.value = 'CREW-0QXZ'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(150);
await click("#joinGo");
await waitFor(() => exists("#gl canvas").catch(() => false), { label: "joined battle on the course" });
const joinedId = await call("matchId()");
const mJoined = (await evalJs(`JSON.parse(localStorage.getItem('rwf.v3'))`)).matches.find((m) => m.config.id === joinedId);
ok(mJoined?.config.name === "Crew CREW-0QXZ" && mJoined?.status === "live", "the code opened a LIVE battle branded with the code (demo crew until friends link in)");
await shot("join-battle");

console.log("— HOME AFTER THE WAR");
await goto("#/home");
ok((await evalJs(`document.querySelectorAll('.v3-bcard').length`)) >= 3, "hub lists the battles (settled + live + joined)");
ok(await exists(`.v3-bcard__status--done`), "settled battles carry the SETTLED status");
ok(await exists(`.v3-bcard__status--live`), "live battles carry the LIVE status — resume is obvious");
await langClean("home (settled)");
await shot("home-settled");

console.log("— DESKTOP (1280×800) — same 3-click path");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await goto("#/play");
await waitFor(() => exists("#nameIn").catch(() => false), { label: "desktop entry" });
ok((await evalJs(`document.querySelector('#nameIn').value`)) === "Alexei", "returning runner lands PREFILLED (one tap to re-enter)");
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = 'Alexei'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await evalJs(`document.querySelector('[data-tier="fit"]').click(); true`);
await sleep(200);
await click("#startBattle");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "desktop draft (auto-deal still OFF)" });
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

console.log("— DESKTOP POV (same battle moment, three views at 1280×800)");
const dcam0 = await call("camState()");
ok(dcam0?.mode === "table" && dcam0?.downDeg >= 50 && dcam0?.downDeg <= 65,
   `desktop TABLE keeps the oblique band (${dcam0?.downDeg}° down)`);
await shot("desktop-table_pov");
await evalJs(`window.__rwfV3.cycleCam(); true`);
await sleep(1400);
ok((await call("camState()"))?.mode === "stadium", "desktop cycle → STADIUM");
await shot("desktop-stadium_pov");
await evalJs(`window.__rwfV3.cycleCam(); true`);
await sleep(1400);
ok((await call("camState()"))?.mode === "follow", "desktop cycle → FOLLOW");
await shot("desktop-follow_pov");
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
console.log("ALL GREEN — /v3 battle course verified (UX2: three clicks to playing).");
process.exit(0);
