// idle-only debug probe — prints CDP exception details this time.
const PORT = 9467;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-perf2', '--no-first-run', '--no-sandbox',
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
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};
await waitFor('window.__atelier?.ready');
await new Promise((r) => setTimeout(r, 1500));
const raw = async (expression: string) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
const prep = await raw(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); A.setXray(false); A.setHeat(false); return 'ok'; })()`);
console.log('prep:', JSON.stringify(prep.result));
await new Promise((r) => setTimeout(r, 1200));
const r1 = await raw(`new Promise((res) => {
  const origRAF = window.requestAnimationFrame.bind(window);
  let count = 0, busy = 0, last = 0;
  window.requestAnimationFrame = (cb) => origRAF((t) => { count++; const t0 = performance.now(); cb(t); busy += performance.now() - t0; last = t; });
  setTimeout(() => { window.requestAnimationFrame = origRAF; res({ rafOver2s: count, msInRAF: +busy.toFixed(1) }); }, 2000);
})()`);
console.log('idle:', JSON.stringify(r1.result?.result ?? r1.result, null, 1));
await send('Browser.close', {}).catch(() => {});
