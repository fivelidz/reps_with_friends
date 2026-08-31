// v9 HANG DEBUG — repro + stack capture for the full-case probe freeze.
// The v8/v7/v6 suites froze mid `window.__atelier.runVerify()` with the
// renderer at 0% CPU and an unresponsive main thread (even `1+1` evaluate
// timed out). This fires runVerify WITHOUT awaiting it, polls liveness,
// and when frozen requests a Debugger.pause stack (the definitive "where
// is the main thread" answer).
// Usage: bun apps/atelier/test/v9_hangdbg.ts
const PORT = 9566;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-hang-dbg', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Debugger.paused') {
    console.log('PAUSED — stack (top 14 frames):');
    for (const f of m.params.callFrames.slice(0, 14)) {
      console.log(`  ${f.functionName || '(anon)'} @ ${(f.url || 'inline').split('/').pop()}:${f.location.lineNumber + 1}`);
    }
    process.exit(0);
  }
  if (m.method?.startsWith('Runtime.')) console.log('EVT:', m.method, String(JSON.stringify(m.params)).slice(0, 160));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Debugger.enable', {}, sessionId);
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED'); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
console.log('firing runVerify (fire-and-forget)...');
await send('Runtime.evaluate', { expression: 'window.__atelier.runVerify(); "fired"', returnByValue: true }, sessionId);
let frozen = false;
for (let i = 0; i < 60 && !frozen; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: '1', returnByValue: true }, sessionId),
    new Promise((res) => setTimeout(() => res({ T: 1 }), 3000)),
  ]);
  if ((r as any)?.T) frozen = true;
}
console.log(frozen ? 'FROZEN — requesting stack...' : 'never froze in 120 s — no pause needed');
if (frozen) {
  await send('Debugger.pause', {}, sessionId);
  await new Promise((r) => setTimeout(r, 8000));
  console.log('no pause event arrived');
}
process.exit(0);
