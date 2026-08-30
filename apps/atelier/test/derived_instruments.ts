// Instrument "eyes" for the derived outfit (no human image input available):
// asciiView pixel-classification maps + regionChecks + bulkCheck + band/sleeve
// probes at bind and walk@50%.
const PORT = 9471;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-inst', '--no-first-run', '--no-sandbox',
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('boot failed', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
const ev = async (expression: string, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
  return r?.result?.result?.value;
};

await ev(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); A.setAnim('idle'); return true; })()`);
await new Promise((r) => setTimeout(r, 400));

console.log('=== ASCII VIEW (front, full kit) — T=shirt(lime) S=shorts(coral) W=white(band) ===');
const ascii = await ev(`window.__atelier.asciiView(10)`);
console.log(ascii);
console.log('\n=== ASCII VIEW (back) ===');
await ev(`window.__atelier.setCam([0.55, 1.25, -2.9], [0, 0.92, 0])`);
console.log(await ev(`window.__atelier.asciiView(10)`));
await ev(`window.__atelier.homeCam()`);

console.log('\n=== REGION CHECKS (bind) ===');
console.log(JSON.stringify(await ev('window.__atelier.regionChecks()'), null, 1));
console.log('\n=== BULK CHECK (anti-armour silhouette) ===');
console.log(JSON.stringify(await ev('window.__atelier.bulkCheck()'), null, 1));
console.log('\n=== BAND CHECK (waistband pixel probe) ===');
console.log(JSON.stringify(await ev('window.__atelier.bandCheck()'), null, 1));
console.log('\n=== SLEEVE CHECK ===');
console.log(JSON.stringify(await ev('window.__atelier.sleeveCheck()'), null, 1));

console.log('\n=== REGION CHECKS (walk @50%) ===');
console.log(JSON.stringify(await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0);
  av.root.updateMatrixWorld(true);
  const r = await A.regionChecks();
  p.stop();
  return r;
})()`), null, 1));

console.log('\nconsoleErrors:', JSON.stringify(errors));
await send('Browser.close', {}).catch(() => {});
