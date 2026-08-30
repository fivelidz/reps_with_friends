// v7 DIAGNOSTICS — why: wrinkle σ low, sleeve hems torn, bulk +7.6cm,
// bandCheck empty. Single boot, surgical probes.
const PORT = 9550;
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
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 500) };
  return r?.result?.result?.value;
};

// 1. bandCheck error?
const band = await ev(`window.__atelier.bandCheck().then(r => ({ ok: true, r }), e => ({ ok: false, err: String(e) }))`);
console.log('\n── bandCheck:', JSON.stringify(band).slice(0, 400));

// 2. wrinkle presence: compare each garment vert's radial offset vs the
//    constructed grade; count verts deviating > 0.8mm (pleats) and report σ.
const wr = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const out = {};
  for (const mesh of A.outfit.derived.meshes) {
    const tag = mesh.userData.rwfWardrobe;
    const d = mesh.userData.rwfDerived;
    const bd = d.bindDelta;
    const bb = d.body.geometry.boundingBox; const Hu = bb.max.y - bb.min.y;
    const cmU = 175 / Hu;
    const P = d.body.geometry.attributes.position;
    let n = 0, dev = 0, maxDev = 0;
    const sds = [];
    for (let k = 0; k < d.srcIndex.length; k++) {
      const dx = bd[k*3], dy = bd[k*3+1], dz = bd[k*3+2];
      const off = Math.hypot(dx, dy, dz) * cmU * 10;   // mm total
      const rad = Math.hypot(dx, dz) * cmU * 10;       // mm radial
      const sag = -dy * cmU * 10;                      // mm downward
      if (rad > 0.8) n++;
      maxDev = Math.max(maxDev, sag);
      sds.push(rad);
    }
    const m = sds.reduce((a,b)=>a+b,0)/sds.length;
    const sd = Math.sqrt(sds.reduce((a,b)=>a+(b-m)**2,0)/sds.length);
    out[tag] = { verts: d.srcIndex.length, radialMmMean: +m.toFixed(2), radialMmSigma: +sd.toFixed(2), maxSagMm: +maxDev.toFixed(2) };
  }
  return out;
})()`);
console.log('\n── wrinkle geometry:', JSON.stringify(wr, null, 1));

// 3. sleeve rings: radial spread of ring-0 verts around the arm axis + the
//    per-opening wrinkle check (did ring verts get sin displacement?)
const sleeve = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const mesh = A.outfit.derived.meshes[0];
  const d = mesh.userData.rwfDerived;
  const g = mesh.geometry;
  const st = A.derivedStats();
  for (const o of d.openings.filter((o2) => o2.name.startsWith('sleeve'))) {
    const rs = [];
    for (let s = 0; s < 64; s++) rs.push(o.ringStart + s);
    const ys = rs.map((vi) => +g.attributes.position.getY(vi).toFixed(4));
    const offs = rs.map((vi) => vi * 3).map((k) => +Math.hypot(d.bindDelta[k], d.bindDelta[k+2]).toFixed(4));
    const uniq = [...new Set(ys)];
    console.log(o.name, 'ring0 y set:', uniq.length, 'radial offset min/max:', Math.min(...offs).toFixed(4), Math.max(...offs).toFixed(4));
  }
  return { done: true };
})()`);
console.log('\n── sleeve ring probe (console output above):', JSON.stringify(sleeve));

// 4. wrinkle applied to BASE verts? sample the torso band at 62% height:
const torso = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const mesh = A.outfit.derived.meshes[0];
  const d = mesh.userData.rwfDerived, bd = d.bindDelta;
  const g = mesh.geometry;
  const bb = d.body.geometry.boundingBox; const Hu = bb.max.y - bb.min.y;
  const cmU = 175 / Hu;
  const rads = [];
  for (let k = 0; k < d.srcIndex.length; k++) {
    const y = g.attributes.position.getY(k) / Hu;
    if (y > 0.615 && y < 0.625) rads.push(Math.hypot(bd[k*3], bd[k*3+2]) * cmU * 10);
  }
  rads.sort((a,b)=>a-b);
  const m = rads.reduce((a,b)=>a+b,0)/rads.length;
  return { n: rads.length, minMm: +rads[0].toFixed(2), maxMm: +rads[rads.length-1].toFixed(2),
           meanMm: +m.toFixed(2), sigmaMm: +Math.sqrt(rads.reduce((a,b)=>a+(b-m)**2,0)/rads.length).toFixed(2) };
})()`);
console.log('\n── torso 62%-band radial offsets (mm):', JSON.stringify(torso));

// 5. bulk detail at stand
await ev(`window.__atelier.pause(); window.__atelier.setTurntable(false)`);
const bulk = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  return A.bulkCheck ? 'has bulkCheck' : 'no bulkCheck';
})()`);
console.log('\n── bulk fn:', JSON.stringify(bulk));
console.log('\nconsole errors:', errors.length, errors.slice(0, 6));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
