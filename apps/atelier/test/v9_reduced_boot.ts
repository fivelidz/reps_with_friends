// v9 REDUCED-MOTION BOOT — prefers-reduced-motion: reduce must boot the
// outfit with the fabric-physics layer DISABLED (pure skinned, zero
// displacement, zero rAF cost). Complements derived_v9_verify.ts (which
// needs physics ON for its lag gates and only tests setEnabled(false)
// manually).
// Usage: bun apps/atelier/test/v9_reduced_boot.ts
const PORT = 9579;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v9-reduced', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? '').slice(0, 300));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
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
await new Promise((r) => setTimeout(r, 800));
const r = await send('Runtime.evaluate', { expression: `(async () => {
  const A = window.__atelier;
  const stats = A.derivedStats();
  const FP = A.fabricPhysics();
  const shirt = A.outfit.slots.tshirt[0];
  // walk a beat with the layer present — displacement must stay EXACTLY 0
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(A.avatar, res);
  p.time = p.duration * 0.5; p.update(0); A.avatar.root.updateMatrixWorld(true);
  A.outfit.updateFabric(1 / 30);
  const pd = FP.dispOf(shirt);
  let mx = 0;
  for (let k = 0; k < pd.idx.length; k++) mx = Math.max(mx, Math.hypot(pd.disp[k*3], pd.disp[k*3+1], pd.disp[k*3+2]));
  p.stop(); A.avatar.pose('stand', 0.35); A.avatar.root.updateMatrixWorld(true);
  return {
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    layerEnabled: FP.state.enabled,
    statsSay: stats.physics?.reducedMotion,
    maxDispWhileWalking: mx,
  };
})()`, awaitPromise: true, returnByValue: true }, sessionId);
const v = r?.result?.result?.value ?? {};
const pass = v.mediaMatches === true && v.layerEnabled === false && v.statsSay === true && v.maxDispWhileWalking === 0;
console.log(`${pass ? 'PASS' : 'FAIL'}  prefers-reduced-motion boots physics disabled (pure skinned, 0 displacement)`, JSON.stringify(v));
if (errors.length) console.log('ERRORS:', errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(pass ? 0 : 1);
