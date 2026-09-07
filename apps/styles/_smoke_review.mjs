/* fast smoke of the new /styles review layer — not part of the repo e2e */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const CDP_PORT = 9231;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/favicon.ico") return new Response("", { status: 204 });
    const map = (rel) => {
      const f = Bun.file(join(ROOT, rel));
      return f.exists() ? new Response(f, {
        headers: { "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-store" } }) : null;
    };
    if (p === "/styles" || p === "/styles/") p = "/styles/index.html";
    if (p.startsWith("/styles/")) return map(`apps/styles${p.replace(/^\/styles/, "")}`);
    if (p.startsWith("/design/")) return map(`design${p.replace(/^\/design/, "")}`);
    if (p === "/v2" || p.startsWith("/v2/")) { if (p === "/v2" || p === "/v2/") p = "/v2/index.html"; return map(`apps/board${p.replace(/^\/v2/, "")}`); }
    return new Response("not found", { status: 404 });
  },
});
const proc = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=1480,1100",
  `--user-data-dir=/tmp/rwf-smoke-${Date.now()}`, "--no-first-run", "--disable-extensions", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch {} await Bun.sleep(250); }
const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map(); let errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
  else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text + " @ " + (m.params.entry.url ?? "?"));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : fail++; console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`); };

/* ── desktop pass ── */
await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/styles/` });
for (let i = 0; i < 60; i++) { if (await evalJs("window.__rwfReviewReady === true").catch(() => false)) break; await Bun.sleep(250); }
await Bun.sleep(1500);
ok(await evalJs(`document.querySelector('.st-bar').getBoundingClientRect().height <= 64`), "compact bar ≤ 64px");
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'none'`), "preview bar hidden at rest");
await evalJs(`window.__rwfStyles.enterPreview('neon'); true`); await Bun.sleep(400);
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'flex'`), "preview bar shows in preview");
await evalJs(`document.getElementById('previewExit').click(); true`); await Bun.sleep(400);
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'none' && document.documentElement.dataset.theme === 'lime'`), "✕ exits preview");
await evalJs(`document.getElementById('stHelp').click(); true`); await Bun.sleep(200);
ok(await evalJs(`!document.getElementById('stSheet').hidden && document.getElementById('stSheet').textContent.includes('mined from your own pages')`), "sheet opens");
await evalJs(`document.querySelector('.st-sheet__x').click(); true`); await Bun.sleep(150);
ok(await evalJs(`document.getElementById('stSheet').hidden === true`), "sheet closes");
await evalJs(`document.getElementById('reviewOpen').click(); true`); await Bun.sleep(600);
ok(await evalJs(`window.__rwfReview.isOpen() === true`), "review mode opens via button");
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); true`); await Bun.sleep(500);
ok(await evalJs(`window.__rwfReview.cur() === 1 && document.getElementById('swName').textContent === 'Gold Arcade'`), "arrow cycles in review mode");
await evalJs(`document.getElementById('swPick').click(); true`); await Bun.sleep(150);
ok(await evalJs(`localStorage.getItem('rwf.styles.shortlist') === '["gold"]'`), "pick stored");
await evalJs(`document.getElementById("swExit").click(); true`); await Bun.sleep(250);
ok(await evalJs(`window.__rwfReview.isOpen() === false`), "⊞ exits");
ok(await evalJs(`!document.getElementById('shortlist').hidden && document.getElementById('shortlistList').textContent.includes('Gold Arcade')`), "shortlist row shows");
const txt = await evalJs(`window.__rwfReview.shortlistText()`);
ok(txt.includes("Gold Arcade") && txt.includes("arcade cabinet"), "summary text");
ok(errors.length === 0, `zero console errors (desktop) ${errors[0] ?? ""}`);

/* ── phone pass: touch emulation + auto-open + swipes ── */
errors = [];
await evalJs(`sessionStorage.removeItem('rwf.styles.switcher'); true`);   /* the desktop ⊞ exit set it */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url: `${BASE}/styles/` });
for (let i = 0; i < 60; i++) { if (await evalJs("window.__rwfReviewReady === true").catch(() => false)) break; await Bun.sleep(250); }
await Bun.sleep(2000);
ok(await evalJs(`window.__rwfReview.autoWanted() === true`), "phone wants review mode");
ok(await evalJs(`window.__rwfReview.isOpen() === true`), "auto-opened");
ok(await evalJs(`document.getElementById('swName').textContent === 'Gold Arcade'`), "resumes at the first picked theme (Gold Arcade)");
const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y), id: 1 });
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(330, 420)] });
await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(180, 420)] });
await Bun.sleep(100);
const dragT = await evalJs(`(() => { const l = [...document.querySelectorAll('.sw__slide')].find(x => x.classList.contains('is-cur')); return (l?.style.transform || ''); })()`);
ok(dragT.includes("-"), `slide drags with finger (${dragT})`);
await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(100, 420)] });
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await Bun.sleep(600);
ok(await evalJs(`window.__rwfReview.cur() === 2 && document.getElementById('swName').textContent === 'Sunset Swiss'`), `left swipe advances (cur=${await evalJs("window.__rwfReview.cur()")})`);
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(195, 660)] });
for (const y of [560, 460, 360, 260]) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(195, y)] }); await Bun.sleep(25); }
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await Bun.sleep(400);
ok(await evalJs(`window.__rwfReview.isOpen() === false`), "up-swipe exits");
ok(errors.length === 0, `zero console errors (phone) ${errors[0] ?? ""}`);

console.log(`\nSMOKE: ${pass} pass, ${fail} fail`);
try { proc.kill("SIGTERM"); } catch {}
server.stop(true);
process.exit(fail === 0 ? 0 : 1);
