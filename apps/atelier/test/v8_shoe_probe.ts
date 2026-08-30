// v8 SHOE PROBE — where are the shoes on screen, and what reads there?
const PORT = 9551;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v8-shoeprobe', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? '').slice(0, 300));
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
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 500) };
  return r?.result?.result?.value;
};

const probe = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  // ground outline of the shoe meshes (world space, live)
  const shoes = A.outfit.softGarments.filter((m) => m.userData.rwfWardrobe === 'sneakers');
  const info = shoes.map((m) => {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    const v = new THREE.Vector3();
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    const P = m.geometry.attributes.position;
    const M = m.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, m.skeleton.boneInverses[i]));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      // world = skinned (boneMatrices) — no root transform (bind=identity at stand)
      let px = 0, py = 0, pz = 0;
      for (let j = 0; j < 4; j++) {
        const w = m.geometry.attributes.skinWeight.getComponent(i, j);
        if (w <= 0) continue;
        const mm = M[m.geometry.attributes.skinIndex.getComponent(i, j)];
        px += w * (mm.elements[0] * v.x + mm.elements[4] * v.y + mm.elements[8] * v.z + mm.elements[12]);
        py += w * (mm.elements[1] * v.x + mm.elements[5] * v.y + mm.elements[9] * v.z + mm.elements[13]);
        pz += w * (mm.elements[2] * v.x + mm.elements[6] * v.y + mm.elements[10] * v.z + mm.elements[14]);
      }
      lo[0] = Math.min(lo[0], px); lo[1] = Math.min(lo[1], py); lo[2] = Math.min(lo[2], pz);
      hi[0] = Math.max(hi[0], px); hi[1] = Math.max(hi[1], py); hi[2] = Math.max(hi[2], pz);
    }
    return { verts: P.count, min: lo.map((x) => +x.toFixed(3)), max: hi.map((x) => +x.toFixed(3)) };
  });
  // feet + ground reference
  const fp = {}, tp = {};
  for (const [k, b] of [['L', av.bones.footL], ['R', av.bones.footR], ['toeL', av.bones.toeL], ['toeR', av.bones.toeR]]) {
    if (b) { b.updateWorldMatrix(true, false); const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); fp[k] = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; }
  }
  // what's under the avatar? ground plane y?
  const groundY = (() => { let gy = null; A.avatar.root.parent.traverse((o) => { if (o.isMesh && o.geometry?.type === 'RingGeometry') gy = o.getWorldPosition(new THREE.Vector3()).y; }); return gy; })();
  return { shoes: info, feet: fp, groundY,
    rootPos: av.root.position.toArray().map((x) => +x.toFixed(3)), rootScale: av.root.scale.x };
})()`);
console.log(JSON.stringify(probe, null, 1));
console.log('console errors:', errors.length, errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
