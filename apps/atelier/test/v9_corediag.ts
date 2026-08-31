// v9 core-class diagnosis: WHERE does the core Δsource (4.39) and strain−body
// (5.05) come from? Runs the full probe once, dumps the worst rows + per-garment
// breakdown, then zooms the worst case: per-vert worst offenders (garment,
// strip, ring, k, live-vs-bind) for delta and worst strain edges.
// Usage: bun apps/atelier/test/v9_corediag.ts
const PORT = 9574;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v9-corediag', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? '').slice(0, 800));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 900));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? '').slice(0, 1200) };
  return r?.result?.result?.value;
};

console.log('── running the full probe (minutes)…');
const summary = await ev(`(async () => {
  const A = window.__atelier;
  const v = await A.runVerify();
  const byDelta = [...v.rows].sort((a, b) => b.deltaCm - a.deltaCm).slice(0, 6)
    .map((r) => ({ label: r.label, deltaCm: r.deltaCm, worstDelta: r.worstDelta, per: r.perGarment }));
  const byStrain = [...v.rows].sort((a, b) => b.strainExcessCm - a.strainExcessCm).slice(0, 6)
    .map((r) => ({ label: r.label, strainExcessCm: r.strainExcessCm, per: r.perGarment }));
  return { byDelta, byStrain, bars: v.bars, nRows: v.rows.length };
})()`);
console.log(JSON.stringify(summary, null, 1));
if (errors.length) console.log('ERRORS:', errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
