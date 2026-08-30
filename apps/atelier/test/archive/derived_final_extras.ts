// Final extras: (1) chest-width silhouette geometry (shirt vs source verts —
// the +6-8 mm anti-armour number), (2) cloth-mode roundtrip still boots and
// probes, (3) /avatars gallery untouched (0 console errors).
const PORT = 9474;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-final', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
const ev = async (expression: string, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description ?? 'eval error').slice(0, 500));
  return r?.result?.result?.value;
};

// ── 1. chest width at bind: shirt verts vs their SOURCE verts (geometry truth)
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
await waitFor('window.__atelier?.ready');
await new Promise((r) => setTimeout(r, 800));
// chest band = top 45% of the shirt's own bind-space verts; width = lateral
// extent of garment verts vs the SAME source verts (the anti-armour number).
const chestOut = await ev(`(() => {
  const A = window.__atelier, av = A.avatar;
  av.root.updateMatrixWorld(true);
  const s = av.root.scale.x || 1;
  const cmPU = 175 / (s * av.H);
  const shirt = A.outfit.derived.meshes[0];
  const d = shirt.userData.rwfDerived;
  const BP = d.body.geometry.attributes.position;
  const GP = shirt.geometry.attributes.position;
  const src = d.srcIndex;
  // CHEST = torso only (arms excluded: |source x| below the shoulder-joint
  // lateral offset), upper half of the shirt's bind-space extent
  let xs = [];
  for (let k = 0; k < src.length; k++) xs.push(Math.abs(BP.getX(src[k])));
  xs.sort((a, b) => a - b);
  const torsoXMax = xs[Math.floor(xs.length * 0.55)]; // arms start above this |x|
  let ys = [];
  for (let k = 0; k < src.length; k++) if (Math.abs(BP.getX(src[k])) < torsoXMax) ys.push(GP.getY(k));
  ys.sort((a, b) => a - b);
  const yTop = ys[ys.length - 1], yLo = ys[Math.floor(ys.length * 0.4)];
  const inBand = (k) => {
    const y = GP.getY(k);
    return y >= yLo && y <= yTop && Math.abs(BP.getX(src[k])) < torsoXMax;
  };
  let gMax = 0, bMax = 0, gMin = 0, bMin = 0, n = 0;
  for (let k = 0; k < src.length; k++) {
    if (!inBand(k)) continue;
    n++;
    const gx = GP.getX(k), bx = BP.getX(src[k]);
    gMax = Math.max(gMax, gx); gMin = Math.min(gMin, gx);
    bMax = Math.max(bMax, bx); bMin = Math.min(bMin, bx);
  }
  const widthCm = (v) => +(v * cmPU).toFixed(2);
  return {
    bandVerts: n,
    shirtChestWidthCm: widthCm(gMax - gMin),
    bodyChestWidthCm: widthCm(bMax - bMin),
    excessCm: +((gMax - gMin - (bMax - bMin)) * cmPU).toFixed(2),
    perSideCm: +(((gMax - bMax)) * cmPU).toFixed(2),
  };
})()`);
console.log('CHEST WIDTH (bind, geometry):', JSON.stringify(chestOut));

// ── 2. cloth-mode roundtrip
const cloth = await ev(`(async () => {
  const A = window.__atelier;
  await A.setMode('cloth');
  await new Promise((r) => setTimeout(r, 300));
  const stats = A.clothStats();
  const asciiOK = typeof A.asciiView(14) === 'string';
  const regions = await A.regionChecks();
  await A.setMode('derived');
  await new Promise((r) => setTimeout(r, 300));
  return {
    modeAfterSwitch: A.mode,
    clothParticles: stats?.particles ?? null,
    asciiRendered: asciiOK,
    clothRegionsPass: regions.pass,
    derivedStatsBack: !!A.derivedStats(),
  };
})()`);
console.log('CLOTH ROUNDTRIP:', JSON.stringify(cloth));

// ── 3. /avatars gallery untouched
errors.length = 0;
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await new Promise((r) => setTimeout(r, 4000));
const avCheck = await ev(`(() => ({
  cards: document.querySelectorAll('.style-card--model, #modelGrid .style-card').length,
  genoWardrobeCard: !!window.__rwfModels?.some?.((e) => e.M?.id === 'geno-wardrobe') || document.body.innerHTML.includes('geno'),
}))()`, false);
console.log('AVATARS GALLERY:', JSON.stringify(avCheck), 'consoleErrors:', JSON.stringify(errors.slice(0, 5)));
await send('Browser.close', {}).catch(() => {});
