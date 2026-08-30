// Definitive wake-source trace: patch wake via Function.prototype? Instead:
// re-create the conditions and log every rAF with performance.now + a stack
// via Error().stack captured inside a wrapped rAF callback.
const PORT = 9476;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-wake2', '--no-first-run', '--no-sandbox',
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
    await new Promise((r) => setTimeout(r, 2000)); // fully settle past every hold
    const t0 = performance.now();
    const log = [];
    const origRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      const stack = (new Error().stack ?? '').split('\\n').slice(2, 5).join(' | ').replace(/\\s+/g, ' ').slice(0, 220);
      log.push([+(performance.now() - t0).toFixed(0), stack]);
      return origRAF(cb);
    };
    await new Promise((r) => setTimeout(r, 3000));
    window.requestAnimationFrame = origRAF;
    return { count: log.length, log };
  })()`,
}, sessionId);
console.log(JSON.stringify(out.result?.result?.value, null, 1));
await send('Browser.close', {}).catch(() => {});
