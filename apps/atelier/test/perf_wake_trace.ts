// Trace what wakes the idle loop: log wake() sources + rAF schedule times.
const PORT = 9475;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-wake', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => { ws.onopen = () => r(null); });
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
await waitFor('window.__atelier?.ready');
await new Promise((r) => setTimeout(r, 800));
const out = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const A = window.__atelier;
    A.pause(); A.setTurntable(false); A.setXray(false); A.setHeat(false);
    // instrument wake: monkey-patch requestAnimationFrame + rAF-triggering events
    const log = [];
    const t0 = performance.now();
    const origRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      log.push(['raf', +(performance.now() - t0).toFixed(0)]);
      return origRAF(cb);
    };
    window.addEventListener('resize', () => log.push(['resize', +(performance.now() - t0).toFixed(0)]));
    // observe ResizeObserver callbacks indirectly: watch stage size
    const st = document.getElementById('stage');
    let w = st.clientWidth, h = st.clientHeight;
    const iv = setInterval(() => {
      if (st.clientWidth !== w || st.clientHeight !== h) { w = st.clientWidth; h = st.clientHeight; log.push(['stage-size', +(performance.now() - t0).toFixed(0), w + 'x' + h]); }
    }, 100);
    await new Promise((r) => setTimeout(r, 2600));
    clearInterval(iv);
    window.requestAnimationFrame = origRAF;
    return { perf: A.stats.perf, log: log.slice(0, 40) };
  })()`,
}, sessionId);
console.log(JSON.stringify(out.result?.result?.value, null, 1));
await send('Browser.close', {}).catch(() => {});
