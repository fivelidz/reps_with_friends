// NECK ANATOMY MEASURE (FIX 1 pre-work): where is the neck base in the FLESH?
// Radii profile (horizontal distance from the spine axis) per y-bin from the
// head joint down through the neck to the chest; dominant-bone composition per
// bin; the neck joint's y. Reports everything in cm (1.75 m human scale).
// Usage: bun apps/atelier/test/neck_measure_v7.ts
const PORT = 9546;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-neck', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED'); process.exit(1); }
await new Promise((r) => setTimeout(r, 700));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

const prof = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const body = A.outfit.derived.body, geo = body.geometry, P = geo.attributes.position;
  const skel = body.skeleton;
  const bindJoint = new Map();
  skel.bones.forEach((b, i) => bindJoint.set(b.name.replace(/^mixamorig:/, ''),
    new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skel.boneInverses[i]).invert())));
  const neck = bindJoint.get('Neck'), head = bindJoint.get('Head'), sp3 = bindJoint.get('Spine3'), sp2 = bindJoint.get('Spine2');
  const hips = bindJoint.get('Hips');
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const H = body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y;
  const cmPerUnit = 175 / (H * (av.root.scale.x || 1)) * (av.root.scale.x || 1); // model units → cm
  const cm = (u) => u * 175 / H;
  // spine axis: hips→neck line; radius = horizontal (xz) distance from it
  const axisAt = (y) => {
    const t = (y - hips.y) / ((neck.y - hips.y) || 1);
    return { x: hips.x + (neck.x - hips.x) * t, z: hips.z + (neck.z - hips.z) * t };
  };
  // dominant bone per vert (4-way max weight)
  const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const boneName = (i) => {
    let bi = 0, bw = -1;
    for (let j = 0; j < 4; j++) { const w = SW.getComponent(i, j); if (w > bw) { bw = w; bi = SI.getComponent(i, j); } }
    return skel.bones[bi].name.replace(/^mixamorig:/, '');
  };
  const upper = new Set(['Neck', 'Neck1', 'Head', 'HeadTop_End', 'Spine3', 'Spine2', 'LeftShoulder', 'RightShoulder']);
  const yLo = sp2 ? sp2.y : neck.y - 0.12 * H, yHi = neck.y + 0.09 * H;
  const bins = [];
  const NB = 46, bh = (yHi - yLo) / NB;
  for (let b = 0; b < NB; b++) bins.push({ y: yLo + (b + 0.5) * bh, r: 0, n: 0, neckN: 0 });
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    const bn = boneName(i);
    if (!upper.has(bn)) continue;
    v.fromBufferAttribute(P, i);
    const bi = Math.min(NB - 1, Math.max(0, Math.floor((v.y - yLo) / bh)));
    const ax = axisAt(v.y);
    const r = Math.hypot(v.x - ax.x, v.z - ax.z);
    if (r > bins[bi].r) bins[bi].r = r;
    bins[bi].n++;
    if (bn === 'Neck') bins[bi].neckN++;
  }
  return {
    Hunits: +H.toFixed(3), cmPerUnit: +cm(1).toFixed(2),
    joints: { neckY_cm_above_floor: +cm(neck.y).toFixed(1), headY: +cm(head.y).toFixed(1),
              sp3Y: sp3 ? +cm(sp3.y).toFixed(1) : null, sp2Y: sp2 ? +cm(sp2.y).toFixed(1) : null },
    bins: bins.map((b2) => ({ y: +cm(b2.y).toFixed(1), r: +cm(b2.r).toFixed(1), n: b2.n, neck: b2.neckN })),
  };
})()`);
const j: any = (prof as any)?.joints;
console.log('joints (cm, floor=0):', JSON.stringify(j));
console.log('bin profile  y(cm)  maxRadius(cm)  neckVertShare');
for (const b of ((prof as any)?.bins ?? [])) {
  const bar = '#'.repeat(Math.round(b.r / 0.6));
  console.log(`${String(b.y).padStart(6)}  ${String(b.r).padStart(6)}  ${(100 * b.neck / Math.max(1, b.n)).toFixed(0).padStart(3)}%  ${bar}`);
}
await send('Browser.close', {}).catch(() => {});
process.exit(0);
