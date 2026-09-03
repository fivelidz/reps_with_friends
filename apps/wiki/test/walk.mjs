/* ═══════════════════════════════════════════════════════════════════════
   WIKI WALK — verification for apps/wiki (mirrors the e2e.mjs pattern).
     1. HTTP: every wiki page 200s; every src/href asset referenced by the
        pages 200s (and images are non-empty).
     2. Browser: headless Chromium walks all 9 pages, fails on ANY console
        error or thrown exception; spot-checks that screenshots render with
        real pixel sizes.
   Run: bun apps/wiki/test/walk.mjs      (serve.ts must be up on :4173)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIKI = join(HERE, "..");
const BASE = "http://127.0.0.1:4173";
const PAGES = ["index", "game", "app", "versions", "bots", "verification", "avatars", "ops", "design", "status"];

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. HTTP: pages + every referenced asset ─────────────────────────── */
console.log(`\nWIKI WALK 1/2 — HTTP link check (${PAGES.length} pages)\n`);
const refs = new Set();
for (const p of PAGES) {
  const url = `${BASE}/wiki/${p === "index" ? "" : p + ".html"}`;
  const r = await fetch(url);
  ok(r.status === 200, `/wiki/${p} → 200`);
  const html = await r.text();
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    let v = m[1];
    if (v.startsWith("http") || v.startsWith("mailto")) continue; // none expected, but skip safely
    if (v.endsWith(".html") && !v.includes("/")) continue;         // nav links walked as pages
    refs.add(v);
  }
}
ok(true, `collected ${refs.size} distinct asset references`);
let assetOk = 0, assetBad = [];
for (const v of refs) {
  const r = await fetch(v.startsWith("/") ? `${BASE}${v}` : `${BASE}/wiki/${v}`);
  if (r.status !== 200) assetBad.push(`${v} → ${r.status}`);
  else assetOk++;
}
ok(assetBad.length === 0, `all ${assetOk} asset references resolve (bad: ${assetBad.join(", ") || "none"})`);

/* images on disk: non-empty + sane dimensions via PNG header */
const shots = readdirSync(join(WIKI, "shots")).filter(f => f.endsWith(".png"));
let empty = [];
for (const f of shots) {
  const p = join(WIKI, "shots", f);
  const size = statSync(p).size;
  const hdr = readFileSync(p).subarray(16, 24);
  const w = hdr.readUInt32BE(0), h = hdr.readUInt32BE(4);
  if (size < 8000 || w < 100 || h < 100) empty.push(`${f} (${size}B ${w}x${h})`);
}
ok(empty.length === 0, `all ${shots.length} PNGs on disk non-empty + sane (bad: ${empty.join(", ") || "none"})`);

/* ── 2. Browser: walk pages, collect console errors ──────────────────── */
console.log(`\nWIKI WALK 2/2 — headless browser walk\n`);
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9232;
const PROFILE = `/tmp/rwf-wiki-walk-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=1280,900",
  `--user-data-dir=${PROFILE}`, "--no-first-run", "--disable-extensions", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, label, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}`);
    await Bun.sleep(200);
  }
}
await waitFor(async () => {
  try { return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { return false; }
}, "chromium devtools");

const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map(); const consoleErrors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 200));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 200));
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

/* collect all broken-image events across the walk (browser-side truth) */
for (const p of PAGES) {
  await send("Page.navigate", { url: `${BASE}/wiki/${p === "index" ? "index.html" : p + ".html"}` });
  await Bun.sleep(700);
  // scroll through to trigger lazy anything + verify images decoded
  const stats = await evalJs(`(async () => {
    const imgs = [...document.images].filter(i => i.getAttribute('src')); // exclude the src-less lightbox placeholder
    let loaded = 0, broken = [];
    for (const i of imgs) { if (i.complete && i.naturalWidth > 0) loaded++; else if (i.complete) broken.push(i.getAttribute('src')); }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
    return { title: document.title, imgs: imgs.length, loaded, broken, nav: document.querySelectorAll('.wnav__link').length };
  })()`);
  ok(stats.imgs > 0 && stats.broken.length === 0 && stats.imgs === stats.loaded,
     `${p}.html — ${stats.imgs} images, ${stats.loaded} decoded, 0 broken`);
}
ok(consoleErrors.length === 0, `zero console errors across all pages (${consoleErrors.length ? consoleErrors.join(" | ") : "clean"})`);

/* spot-check 5 screenshots render with real dimensions inside the page */
await send("Page.navigate", { url: `${BASE}/wiki/app.html` });
await Bun.sleep(800);
const dims = await evalJs(`(() => {
  const picks = [...document.querySelectorAll('.shot img')].slice(0, 5);
  return picks.map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight }));
})()`);
ok(dims.length === 5 && dims.every(d => d.w >= 300 && d.h >= 600),
   `5 spot-checked screenshots decode at real size (${dims.map(d => `${(d.src || "").split("/").pop()} ${d.w}×${d.h}`).join(", ")})`);

ws.close();
try { proc.kill("SIGTERM"); } catch {}
console.log(`\n═══ ${passed}/${step} checks passed ${failures.length ? "— FAILURES:\n  " + failures.join("\n  ") : "— ALL GREEN"} ═══\n`);
process.exit(failures.length ? 1 : 0);
