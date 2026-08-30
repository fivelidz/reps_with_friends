// Full 32-case verify of the derived outfit + chest-width geometry probe.
const PORT = 9472;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-verify', '--no-first-run', '--no-sandbox',
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
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};
if (!(await waitFor('window.__atelier?.ready'))) { console.error('boot failed', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
const ev = async (expression: string, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description ?? 'eval error').slice(0, 600));
  return r?.result?.result?.value;
};

// chest-width geometry truth comes from the verify report + a separate probe
// (derived_delta in derived_check.ts); here: the 32-case verify.
console.log('running 32-case verify (this takes a few minutes)…');
const report = await ev('window.__atelier.runVerify()');
const summary = {
  cases: report.rows.length,
  attachPass: report.attachPass,
  stretchPass: report.stretchPass,
  globalMaxCm: report.globalMaxCm,
  insideVerts: report.insideVerts,
  insideWorstCm: report.insideWorstCm,
  limbCrossVerts: report.limbCrossVerts,
  globalStretchCm: report.globalStretchCm,
  maxDeltaCm: Math.max(...report.rows.map((r: any) => r.deltaCm)),
  maxStrainExcessCm: Math.max(...report.rows.map((r: any) => r.strainExcessCm)),
  nan: report.rows.reduce((a: number, r: any) => a + r.nan, 0),
  bulk: report.bulk,
  drape: report.drape,
  mode: report.mode,
  bars: report.bars,
  worstCases: report.rows.filter((r: any) => r.overBar || r.overDelta || r.overStrain || r.insideVerts > 0 || r.nan > 0).map((r: any) => ({ label: r.label, maxCm: r.maxCm, deltaCm: r.deltaCm, strainExcessCm: r.strainExcessCm, inside: r.insideVerts, nan: r.nan })),
  perGarmentMax: {},
};
const perG: any = {};
for (const r of report.rows) for (const [tag, v] of Object.entries<any>(r.perGarment ?? {})) {
  perG[tag] = perG[tag] ?? { maxCm: 0, deltaCm: 0, strainCm: 0, bodyStrainCm: 0 };
  perG[tag].maxCm = Math.max(perG[tag].maxCm, v.maxCm ?? 0);
  perG[tag].deltaCm = Math.max(perG[tag].deltaCm, v.deltaCm ?? 0);
  perG[tag].strainCm = Math.max(perG[tag].strainCm, v.strainCm ?? 0);
  perG[tag].bodyStrainCm = Math.max(perG[tag].bodyStrainCm, v.bodyStrainCm ?? 0);
}
summary.perGarmentMax = perG;
console.log(JSON.stringify(summary, null, 1));
console.log('consoleErrors:', JSON.stringify(errors));
await send('Browser.close', {}).catch(() => {});
