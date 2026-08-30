// First boot check of the derived-mode atelier: console errors, contexts,
// construction stats, idle perf after the dirty-flag loop.
const PORT = 9469;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-derived1', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const waitFor = async (expr: string, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const ok = await waitFor('window.__atelier?.ready');
await new Promise((r) => setTimeout(r, 1000));
const ev = async (expression: string, awaitPromise = true) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId))?.result?.result?.value;

if (!ok) { console.error('BOOT FAILED'); console.error(errors.join('\n')); process.exit(1); }
const boot = await ev(`(() => ({
  mode: window.__atelier.mode,
  contexts: window.__atelier.stats.contexts,
  derived: window.__atelier.derivedStats(),
  perf: window.__atelier.stats.perf,
}))()`);
await ev(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); return true; })()`);
await new Promise((r) => setTimeout(r, 1500));
const idle = await ev('window.__atelier.perfProbe(2000)');
await ev(`(() => { const A = window.__atelier; A.play(); A.setTurntable(true); return true; })()`);
await new Promise((r) => setTimeout(r, 800));
const anim = await ev('window.__atelier.perfProbe(2000)');
console.log(JSON.stringify({ boot, idle, anim, consoleErrors: errors }, null, 1));
await send('Browser.close', {}).catch(() => {});
