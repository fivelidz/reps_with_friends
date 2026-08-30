// Idle-performance probe for /atelier — measures the founder's complaint:
// "performing so badly when just stationary".
//
//   idle rAF callbacks over 2 s (paused, turntable OFF)  → target ≈ 0 after fix
//   time spent inside rAF callbacks (ms / 2 s)           → CPU-ish proxy
//   animating frame ms (EMA exposed by the page, if any)  → should be < 2 ms
//
// Works on the OLD page (before) and the NEW one (after) identically:
// it injects its own rAF wrapper — no page cooperation required.
const PORT = 9466;
const urlArg = process.argv.find((a) => a.startsWith('--url='));
const URL = urlArg ? urlArg.slice(6) : 'http://localhost:4173/atelier';
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-perf-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
const errors: string[] = [];
send('Runtime.consoleAPICalled', {}, sessionId); // noop keeps types happy
ws.addEventListener('message', (e) => {
  try { const m = JSON.parse(String(e.data)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' ')); } catch { /* ignore */ }
});
await send('Page.navigate', { url: URL }, sessionId);
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor('window.__atelier?.ready');
await new Promise(r => setTimeout(r, 1500));

const ev = async (expression: string, awaitPromise = true) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId))?.result?.result?.value;

// settle the page: paused, turntable off, no heatmap/xray
await ev(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); A.setXray(false); A.setHeat(false); return true; })()`);
// 2.5 s: past the one-shot post-load transient (late font/layout swap fires
// the stage ResizeObserver once → a single 350 ms wake burst ~1–2 s after
// load). Steady-state idle after that is 0 rAF — verified separately over 3 s.
await new Promise(r => setTimeout(r, 2500));

const idle = await ev(`new Promise((res) => {
  const origRAF = window.requestAnimationFrame.bind(window);
  let count = 0, busy = 0, last = 0;
  window.requestAnimationFrame = (cb) => origRAF((t) => { count++; const t0 = performance.now(); cb(t); busy += performance.now() - t0; last = t; });
  setTimeout(() => { window.requestAnimationFrame = origRAF; res({ rafOver2s: count, msInRAF: +busy.toFixed(1), displayHz: +(count > 1 ? 1000 * (last - 0) / (2000) : 0).toFixed(0) }); }, 2000);
})`);

// animating frame cost (page is playing idle anim): measure rAF rate + busy during play
await ev(`(() => { const A = window.__atelier; A.play(); A.setTurntable(false); return true; })()`);
await new Promise(r => setTimeout(r, 600));
const anim = await ev(`new Promise((res) => {
  const origRAF = window.requestAnimationFrame.bind(window);
  let count = 0, busy = 0;
  window.requestAnimationFrame = (cb) => origRAF((t) => { count++; const t0 = performance.now(); cb(t); busy += performance.now() - t0; });
  setTimeout(() => { window.requestAnimationFrame = origRAF; res({ rafOver2s: count, fps: +(count / 2).toFixed(0), msPerFrameAvg: +(busy / Math.max(1, count)).toFixed(2) }); }, 2000);
})`);

const pageStats = await ev('window.__atelier?.stats ? { fps: window.__atelier.stats.fps, contexts: window.__atelier.stats.contexts, perf: window.__atelier.stats.perf ?? null } : null', false);
console.log(JSON.stringify({ url: URL, idle, animating: anim, pageStats, consoleErrors: errors }, null, 1));
await send('Browser.close', {}).catch(() => {});
