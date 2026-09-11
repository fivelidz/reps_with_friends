/* ═══════════════════════════════════════════════════════════════════════
   RWF V3 — CARDS3D VERIFY (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The 3D power-up card system end-to-end, on the real app:
     · 4 runners × 3 cards on screen (the hand-cap scene, dealTo driver)
     · fan layout + mesh counts via cards3d()
     · hover raycast → lifted card + name label
     · PLAY → card flight (position delta) + rarity burst particles
     · PERF: median frame ms during a play burst (budget <8ms headless)
     · screenshots: TABLE + FOLLOW at 390px AND desktop, suffix _cards3d
       → apps/v3/shots/
   Zero console errors is a hard gate.
   Run: bun apps/v3/cards3d_verify.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9231;

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── temp server: apps/v3 at / + the real /design, /site, /models ─────── */
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
    if (p.startsWith("/design/") || p.startsWith("/site/")) fsPath = join(ROOT, p);
    else if (p.startsWith("/models/")) fsPath = join(ROOT, "site/models", p.replace(/^\/models\//, ""));
    else if (p === "/" || p.endsWith("/")) fsPath = join(HERE, p === "/" ? "index.html" : join(p.replace(/^\//, ""), "index.html"));
    else fsPath = join(HERE, p.replace(/^\//, ""));
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

/* ── chromium headless ────────────────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-c3d-verify"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-c3d-verify-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "--use-gl=angle", "--use-angle=swiftshader",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });

async function waitFor(fn, { timeout = 20000, every = 150, label = "condition" } = {}) {
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
const call = (expr) => evalJs(`(window.__rwfV3 ? window.__rwfV3.${expr} : null)`);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}_cards3d.png`), Buffer.from(r.data, "base64"));
}

mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V3 CARDS3D VERIFY — ${BASE} (headless chromium)\n`);

await send("Page.navigate", { url: `${BASE}/index.html#/home` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfV3?.ready === true`).catch(() => false),
  { label: "v3 app load", timeout: 20000 }
);

console.log("— BATTLE BOOT");
await evalJs(`(() => { const i = document.querySelector('#nameIn'); return !!i; })()`);
await evalJs(`location.hash = '#/setup'`);
await sleep(400);
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = 'Alexei'; i.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('[data-tier="fit"]').click(); return true; })()`);
await evalJs(`document.querySelector('#setupGo').click()`);
await sleep(400);
await evalJs(`location.hash = '#/create'`);
await waitFor(() => evalJs(`!!document.querySelector('#startBattle')`).catch(() => false), { label: "create screen" });
await evalJs(`document.querySelector('#startBattle').click()`);
await waitFor(() => evalJs(`!!document.querySelector('#draftFan .bd-card')`).catch(() => false), { label: "draft sheet" });
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[1].click()`);
await sleep(200);
await evalJs(`document.querySelector('#keepBtn').click()`);
await sleep(1000);
await waitFor(() => call("modelsReady()").catch(() => false), { label: "Geno + mocap loaded", timeout: 30000 });
ok(await evalJs(`!!document.querySelector('#gl canvas')`), "battle live with the 3D course");

console.log("— THE HAND-CAP SCENE (4 runners × 3 cards)");
for (const pid of ["sam", "alex", "jordan"]) {
  const r = await call(`dealTo('${pid}', 2)`); // mates hold 1 draft + 2 = 3
  ok(r?.ok === true, `dealt up ${pid} (now ${r?.granted?.length ?? 0} more cards)`);
}
const r0 = await call("dealTo('you', 2)"); // you hold 1 draft + 2 = 3
ok(r0?.ok === true, "dealt you up to the 3-card cap");
await sleep(1600); // deal arcs settle
const c3 = await call("cards3d()");
ok(c3.total === 12 && c3.meshes === 36, `4 runners × 3 cards on screen (${c3.total} cards · ${c3.meshes} meshes)`);
ok(Object.values(c3.byRunner).every((r) => r.n === 3), "every runner fans a full 3-card hand");
ok(Object.values(c3.byRunner).every((r) => new Set(r.xs).size === 3), "fan slots distinct per runner");
ok(Object.values(c3.byRunner).every((r) => Math.abs(r.xs.reduce((a, b) => a + b, 0) / 3) < 0.05), "fans centred on their runners");
ok(c3.hurdles >= 1, `meshy hurdle props on the infield (${c3.hurdles})`);
await sleep(900); // let the frame sampler fill with the full scene
const fIdle = await call("frameMs()");
ok(fIdle > 0 && fIdle < 8, `frame budget with 12 idle cards (median ${fIdle.toFixed(2)}ms < 8ms)`);

console.log("— HOVER (raycast → lift + name label)");
// under CPU starvation the just-dealt cards can still be mid-deal (the
// raycast only targets idle cards) — retry the pointer until it lands
let hov = null;
for (let i = 0; i < 10; i++) {
  const sp = await call("cardScreen('you', 1)");
  if (!sp) { await sleep(500); continue; }
  const rect = JSON.parse(await evalJs(`(() => { const r = document.querySelector('#gl canvas').getBoundingClientRect(); return JSON.stringify({ l: r.left, t: r.top, w: r.width, h: r.height }); })()`));
  const cx = rect.l + ((sp.x + 1) / 2) * rect.w, cy = rect.t + (1 - (sp.y + 1) / 2) * rect.h;
  await evalJs(`document.querySelector('#gl canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: ${cx.toFixed(1)}, clientY: ${cy.toFixed(1)}, bubbles: true })); true`);
  await sleep(500);
  hov = await call("cards3d()");
  if (hov.hover?.lifted === true) break;
}
ok(hov?.hover?.lifted === true, `mid-hand card lifts under the pointer (${hov?.hover?.id})`);
ok(hov?.hoverLabelVisible === true, "name label floats above the card");
await shot("hover-table-390");
await evalJs(`document.querySelector('#gl canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4, bubbles: true })); true`);
await sleep(400);

console.log("— SHOTS (TABLE + FOLLOW, 390 + desktop)");
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);
ok((await call("camMode()")) === "stadium", "cycled to STADIUM");
await shot("stadium-390");
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);
ok((await call("camMode()")) === "follow", "cycled to FOLLOW");
await shot("follow-390");
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(900);
await shot("table-desktop");
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);
ok((await call("camMode()")) === "follow", "desktop FOLLOW");
await shot("follow-desktop");
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); true`);
await sleep(1600);

console.log("— PLAY + BURST PERF (frame ms DURING the burst)");
const fx0 = await call("fxPlayed()");
// try each hand card until one actually plays: affordability is the only
// gate on the sheet, but the engine can still refuse at activation
// (e.g. steal with no rival reps on the board) — retry like the real UI does
let played = false, fBurst = -1, c3b = null;
const trace = [];
for (const idx of [0, 1, 2]) {
  await evalJs(`(() => { const el = document.querySelectorAll('#hand .bd-card')[${idx}]; if (el) el.click(); return !!el; })()`);
  let open = false;
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    open = await evalJs(`!!document.querySelector('#playIt')`).catch(() => false);
    if (open) break;
  }
  const kind = (await call("handKinds()"))?.[idx];
  const disabled = open ? await evalJs(`document.querySelector('#playIt').disabled`).catch(() => "gone") : "no-sheet";
  trace.push(`[${idx} ${kind} open=${open} disabled=${disabled}]`);
  if (!open) continue;
  if (disabled !== false) {
    await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`);
    await sleep(300);
    continue;
  }
  if (!played) {
    await send("Page.captureScreenshot", { format: "png" }).then((r) => {
      writeFileSync(join(SHOTS, "cardsheet_cards3d.png"), Buffer.from(r.data, "base64"));
    });
  }
  await evalJs(`document.querySelector('#playIt').click(); true`);
  const clickInfo = await evalJs(`JSON.stringify({ btnConnected: document.querySelector('#playIt')?.isConnected ?? null, sheetKind: document.querySelector('.bd-cdetail__name')?.textContent ?? null, onclickType: typeof document.querySelector('#playIt')?.onclick, sheets: document.querySelectorAll('.bd-sheet').length })`);
  const toast0 = await evalJs(`document.querySelector('.v3-toast')?.textContent ?? null`);
  await sleep(700); // arrival + burst window (flight 0.5s, sparks live 0.65s)
  fBurst = await call("frameMs()");
  c3b = null;
  for (let i = 0; i < 15 && !(c3b?.lastPlay); i++) { c3b = await call("cards3d()"); if (!c3b?.lastPlay) await sleep(200); }
  const fxNow = await call("fxPlayed()");
  trace.push(`[click ${clickInfo} toast="${toast0}" fx=${fxNow}]`);
  if (fxNow > fx0) { played = true; break; }
  await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`);
  await sleep(300);
}
console.log(`  · trace: ${trace.join(" ")}`);
if (played) {
  ok(true, "a card played through the RUF economy");
  ok(c3b.lastPlay && c3b.lastPlay.rise > 0.3, `flight covered real distance (rise ${c3b.lastPlay?.rise ?? "?"})`);
  ok(c3b.bursts >= 16, `burst particles exist (${c3b.bursts} rarity sparks)`);
  ok(fBurst > 0 && fBurst < 8, `frame budget DURING the play burst (median ${fBurst.toFixed(2)}ms < 8ms — 4 runners × 3 cards pre-play)`);
  await shot("afterplay-table-desktop");
} else {
  const dbg = await evalJs(`JSON.stringify({
    hand: window.__rwfV3.handKinds(),
    pts: window.__rwfV3.state().matches[0]?.board?.points?.you,
    status: window.__rwfV3.state().matches[0]?.status,
    sheets: document.querySelectorAll('.bd-sheet').length,
    toasts: [...document.querySelectorAll('.v3-toast')].map((t) => t.textContent),
    fx: window.__rwfV3.fxPlayed(),
  })`).catch((e) => "dbg-fail: " + e.message);
  console.log(`  · debug: ${dbg}`);
  ok(false, "a card played through the RUF economy (every hand card refused — unexpected)");
}

console.log("— CONSOLE");
const errSample = consoleErrors.slice(0, 5);
ok(consoleErrors.length === 0, `zero console errors${errSample.length ? ` — ${errSample.join(" | ")}` : ""}`);

console.log(`\n${passed}/${step} cards3d checks passed`);
server.stop(true);
try { proc.kill("SIGKILL"); } catch {}
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-c3d-verify"]); } catch {}
if (failures.length || consoleErrors.length) {
  console.error(`FAILURES: ${failures.length ? failures.join(" · ") : "none"}${consoleErrors.length ? ` (+${consoleErrors.length} console errors)` : ""}`);
  process.exit(1);
}
console.log("ALL GREEN — CARDS3D verified.");
process.exit(0);
