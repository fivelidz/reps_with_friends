/* ═══════════════════════════════════════════════════════════════════════
   RWF /POWERUPS — e2e (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The review surface, walked on the real page at phone size (390×844@2x):
     boot       21 card tiles · 6 family sections · 7 style chips
     styles     ← → cycles the kits; every <img> reloads and DECODES
                (all 21×7 art files must exist — 404s are failures)
     detail     engine data on the sheet: blurb · target · expiry ·
                counters (read from CARD_CATALOG, never restated)
     feedback   💛 like + 💬 note persist across a full reload
                (localStorage rwf.powerups.feedback.v1)
     review     fullscreen deck: ← advances, dots track, flip works
     deck sheet 21 minis + print/download chrome
     draft      the rules block renders the ENGINE's numbers (3 dealt,
                hand cap 3, rerolls 50→100→200, the catch-up curve)
     console    zero errors is a hard gate
   Shots land in apps/powerups/shots/ (390×844 @2x + one desktop).
   Run: bun apps/powerups/test/e2e.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const ROOT = join(APP, "..", "..");
const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(APP, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9810 + Math.floor(Math.random() * 60);

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: the app + engine + gen assets + design fonts ───── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/powerups/sot-engine.js") {
      const f = Bun.file(join(ROOT, "apps", "sot-engine.js"));
      if (await f.exists()) return new Response(f, { headers: { "content-type": MIME[".js"], "cache-control": "no-store" } });
      return new Response("not found", { status: 404 });
    }
    let fsPath = null;
    if (p.startsWith("/site/")) fsPath = join(ROOT, p);
    else if (p.startsWith("/design/")) fsPath = join(ROOT, p);
    else if (p === "/" || p === "/powerups" || p === "/powerups/") fsPath = join(APP, "index.html");
    // strip only the real /powerups/ mount (a bare "/powerups.js" is an app file!)
    else fsPath = join(APP, p.replace(/^\/powerups\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      return new Response(f, {
        headers: { "content-type": MIME[fsPath.slice(fsPath.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-powerups-e2e"]); } catch {}
await Bun.sleep(250);
const PROFILE = `/tmp/rwf-powerups-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on("exit", () => { try { proc.kill("SIGKILL"); server.stop(true); } catch {} });

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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function key(keyStr) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyStr, code: keyStr === "ArrowRight" ? "ArrowRight" : "ArrowLeft", windowsVirtualKeyCode: keyStr === "ArrowRight" ? 39 : 37 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyStr, code: keyStr === "ArrowRight" ? "ArrowRight" : "ArrowLeft", windowsVirtualKeyCode: keyStr === "ArrowRight" ? 39 : 37 });
  await sleep(320);
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(260);
}
async function shot(name, w = 390, h = 844) {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}
const count = (sel) => evalJs(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const exists = (sel) => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);

const BANNED = /\bmatch(?:es|ed|ing)?\b|kitty|poker|\bruf\b/i;

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF POWERUPS E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && document.querySelectorAll('.pcard').length > 0`).catch(() => false),
  { label: "powerups page load", timeout: 20000 }
);
await sleep(700);

console.log("— BOOT");
ok((await count(".pcard")) === 21, "21 card tiles render (from CARD_CATALOG)");
ok((await count(".pu-family")) === 6, "6 family sections");
ok((await count(".pu-chip")) === 7, "7 style chips");
ok((await evalJs(`document.querySelector('.pu-chip.is-on')?.dataset.style`)) === "poster", "poster is the default kit");
ok(await exists("#puDraft table"), "draft rules render (engine curve table)");
ok((await count("#puCurve tbody tr")) === 5, "catch-up curve has 5 positions");
ok(await bodyHas("3 cards") && await bodyHas("50 → 100 → 200"), "engine numbers shown (deal/hand/rerolls)");
await shot("gallery-poster");

console.log("— STYLE SWITCHER (every kit must fully load)");
// fire every lazy <img> first: walk the page, then return to top
await evalJs(`(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); return true; })()`);
await sleep(700);
const kits = ["poster", "varsity", "risograph", "gold-etch", "halftone", "neon", "boxing"];
let allLoaded = true, order = [];
for (let i = 0; i < 7; i++) {
  const active = await evalJs(`document.querySelector('.pu-chip.is-on')?.dataset.style`);
  order.push(active);
  const imgsOk = await evalJs(`[...document.querySelectorAll('img[data-art]')].every(im => im.complete && im.naturalWidth > 0)`);
  if (!imgsOk) allLoaded = false;
  await key("ArrowRight");
}
ok(JSON.stringify(order) === JSON.stringify(kits), `arrow-key cycles all 7 kits in order (${order.join(" → ")})`);
ok(allLoaded, "every kit's 21 art files decode (naturalWidth > 0)");
// land back on poster, then one forward → varsity, shoot it
await key("ArrowRight");
const activeNow = await evalJs(`document.querySelector('.pu-chip.is-on')?.dataset.style`);
ok(activeNow === "varsity", "style persists in the rail after wrap (→ varsity)");
const srcSample = await evalJs(`document.querySelector('img[data-art]')?.src`);
ok(srcSample.includes("/varsity/"), "tile art follows the kit (varsity URL)");
await shot("gallery-varsity");
await key("ArrowLeft"); // varsity → poster (one step; the walk continues below)

console.log("— CARD DETAIL (engine data, not restated)");
await click(`.pcard[data-card="shield"] .pcard__art`);
ok(await exists(".pu-ov__panel .pu-detail__name"), "detail sheet opens");
ok(await bodyHas("Protect everyone's streak"), "engine blurb verbatim (shield)");
ok(await bodyHas("Shield Bash"), "engine counters verbatim (shield)");
ok(await bodyHas("consumed at the close it saves"), "engine expiry verbatim");
await shot("detail-shield");

console.log("— FEEDBACK (💛 + 💬 persisted)");
await click(".pu-fb__like");
const fbAfterLike = await evalJs(`JSON.parse(localStorage.getItem('rwf.powerups.feedback.v1') || '{}')?.shield?.like`);
ok(fbAfterLike === true, "like lands in localStorage");
await evalJs(`(() => { const ta = document.querySelector('.pu-fb__note textarea'); ta.value = 'shield reads great at chip size'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(200);
const noteSaved = await evalJs(`JSON.parse(localStorage.getItem('rwf.powerups.feedback.v1') || '{}')?.shield?.note`);
ok(noteSaved === "shield reads great at chip size", "note lands in localStorage");
ok(await evalJs(`!!document.querySelector('.pcard[data-card="shield"] .pcard__note-ico')`), "tile gains the 💬 marker");
await send("Page.navigate", { url: `${BASE}/` });
await waitFor(() => evalJs(`document.querySelectorAll('.pcard').length === 21`).catch(() => false), { label: "reload" });
await sleep(500);
ok(await evalJs(`document.querySelector('.pcard[data-card="shield"] .pcard__like')?.classList.contains('is-on')`), "like survives reload");
ok(await bodyHas("1 💛 · 1 💬"), "feedback bar counts survive reload");

console.log("— REVIEW MODE (fullscreen swipe deck)");
await click("#btnReview");
ok(await exists("#puReview .rv-card img"), "review opens with the deck");
ok((await evalJs(`document.querySelector('#rvCount')?.textContent`)) === "1 / 21", "counter starts 1 / 21");
await key("ArrowRight");
ok((await evalJs(`document.querySelector('#rvCount')?.textContent`)) === "2 / 21", "arrow-key advances to 2 / 21");
await evalJs(`(() => { const st = document.querySelector('#rvStage'); st.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, bubbles: true })); st.dispatchEvent(new PointerEvent('pointerup', { clientX: 80, bubbles: true })); return true; })()`);
await sleep(350);
ok((await evalJs(`document.querySelector('#rvCount')?.textContent`)) === "3 / 21", "swipe advances to 3 / 21");
ok(await evalJs(`document.querySelectorAll('#rvDots span.is-on').length === 1`), "dots track position");
await shot("review");
await click("#btnReviewExit");

console.log("— DECK SHEET (print + download chrome)");
await click("#btnSheet");
ok((await count(".pu-deckgrid__cell")) === 21, "deck sheet shows all 21 minis");
ok(await exists("#btnDeckPrint") && await exists("#btnDeckPng"), "print + download buttons present");
await shot("deck-sheet");
await click("#btnDeckClose");

console.log("— LANGUAGE + CONSOLE GATES");
const lang = await evalJs(`document.body.innerText`);
ok(!BANNED.test(lang), "battle language clean (no poker/kitty/matching/ruf)");
if (consoleErrors.length) {
  console.log("  console errors:");
  for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log(`    · ${e}`);
}
ok(consoleErrors.length === 0, "zero console errors");

/* desktop shot for the handover */
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(400);
await shot("desktop-gallery", 1280, 860);

console.log(`\n${passed}/${step} passed${failures.length ? ` — FAILURES: ${failures.join(" · ")}` : " — ALL GREEN ✓"}`);
process.exit(failures.length ? 1 : 0);
