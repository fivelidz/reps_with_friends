// Minimal boot probe: load /atelier, capture console errors, report readiness timing.
const PORT = 9541;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v7-diag', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 300));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
const t0 = Date.now();
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const r = await send('Runtime.evaluate', { expression: 'window.__atelier?.ready === true', returnByValue: true }, sessionId);
  if (r?.result?.result?.value) { console.log(`READY after ${((Date.now() - t0) / 1000).toFixed(1)}s`); break; }
  if (i === 59) console.log('NOT READY after 30s');
}
const state = await send('Runtime.evaluate', { expression: `(() => {
  const A = window.__atelier;
  return { hasA: !!A, ready: A?.ready, stage: A?.state?.bootStage ?? null, anim: A?.state?.anim ?? null,
    slots: A?.outfit?.slots ? Object.keys(A.outfit.slots) : null,
    derivedStats: !!A?.derivedStats, consoleErrCount: ${JSON.stringify(0)} };
})()`, returnByValue: true }, sessionId);
console.log('state:', JSON.stringify(state?.result?.result?.value ?? state));
console.log('errors:', errors.slice(0, 8));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
