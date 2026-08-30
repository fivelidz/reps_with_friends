// v8 SHOE REGION PROBE — which body verts join the shoe region, and what
// are they (bone, bind pos)? Debug the 10cm-behind-the-heel verts.
const PORT = 9552;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v8-regionprobe', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
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

const res = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  // the shoe upper meshes: inspect srcIndex verts — which bones, where?
  const shoes = A.outfit.softGarments.filter((m) => m.userData.rwfWardrobe === 'sneakers' && !m.userData.rwfDerived?.fabric);
  const upper = shoes[0];   // left
  const der = upper.userData.rwfDerived;
  const body = der.body;
  const P = body.geometry.attributes.position;
  const SI = body.geometry.attributes.skinIndex;
  const bones = body.skeleton.bones;
  const byBone = {};
  let worstBack = null;
  for (let k = 0; k < der.srcIndex.length; k++) {
    const i = der.srcIndex[k];
    const n = bones[SI.getComponent ? dominant(i) : 0];
    function dominant(vi) {
      let d = 0, dw = -1;
      for (let j = 0; j < 4; j++) {
        const w = body.geometry.attributes.skinWeight.getComponent(vi, j);
        if (w > dw) { dw = w; d = body.geometry.attributes.skinIndex.getComponent(vi, j); }
      }
      return d;
    }
    const bn = bones[dominant(i)].name.replace(/^mixamorig:/, '');
    byBone[bn] = (byBone[bn] ?? 0) + 1;
    const z = P.getZ(i), x = P.getX(i), y = P.getY(i);
    if (z < -0.18) {
      if (!worstBack || z < worstBack.z) worstBack = { z: +z.toFixed(3), x: +x.toFixed(3), y: +y.toFixed(3), bone: bn };
    }
  }
  // foot bind joints in geometry frame
  const bind = {};
  for (const [k, b] of [['footL', av.bones.footL], ['toeL', av.bones.toeL], ['legL', av.prone.children[0].getObjectByName('mixamorig:LeftLeg') ?? av.bones.legL]]) {
    if (!b) continue;
    const bi = body.skeleton.bones.indexOf(b);
    if (bi < 0) continue;
    const m = new THREE.Matrix4().copy(body.skeleton.boneInverses[bi]).invert();
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    bind[k] = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
  }
  return { byBone, worstBack, bind };
})()`);
console.log(JSON.stringify(res, null, 1));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
