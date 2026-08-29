// apps/avatars/test/fullkit_bugs_diag5.ts — bind-pose cross-section geometry:
// is the trunk flesh centred on the spine JOINT line, or offset (belly fwd)?
// Dump, at several heights: spine-line z, pelvis-set vert z min/max/centroid.
const PORT = 9465;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fk5-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
const waitFor = async (expr, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`);
await send('Runtime.evaluate', {
  expression: `import('/site/lib/three.module.js').then(m => { window.__T = m; return true; })`,
  returnByValue: true, awaitPromise: true,
}, sessionId);
const idxR = await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => /Full Kit/.test(h.textContent))`,
  returnByValue: true,
}, sessionId);
const IDX = idxR.result.result.value;
await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('#modelGrid .style-card--model')[${IDX}].scrollIntoView({ block: 'center' }); true`,
  returnByValue: true,
}, sessionId);
await waitFor(`!!(window.__rwfModels[${IDX}] && window.__rwfModels[${IDX}].avatar)`, 60000);
await new Promise(r => setTimeout(r, 1200));

const r = await send('Runtime.evaluate', {
  expression: `
(() => {
  const e = window.__rwfModels[${IDX}];
  const av = e.avatar, THREE = window.__T;
  av.root.updateMatrixWorld(true);
  const scene = av.prone.children[0];
  let body = null;
  scene.traverse(o => { if (!body && o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o; });
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  // bind-space vert dump of the body with dominant bone
  const P = body.geometry.attributes.position;
  const SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight;
  const skel = body.skeleton;
  const boneIdx = {};
  for (const nm of ['Hips','Spine','Spine1','LeftUpLeg','RightUpLeg']) {
    const b = skel.bones.findIndex(x => x.name.replace(/^mixamorig:?/, '') === nm);
    boneIdx[nm] = b;
  }
  const pelvis = new Set([boneIdx.Hips, boneIdx.Spine, boneIdx.LeftUpLeg, boneIdx.RightUpLeg].filter(i => i >= 0));
  const rows = {};
  for (let i = 0; i < P.count; i++) {
    let dom = 0, dw = 0;
    for (let b = 0; b < 4; b++) {
      const w = SW.getComponent(i, b);
      if (w > dw) { dw = w; dom = SI.getComponent(i, b); }
    }
    if (!pelvis.has(dom)) continue;
    const y = P.getY(i), z = P.getZ(i), x = P.getX(i);
    const band = (Math.round(y * 20) / 20).toFixed(2);
    if (!rows[band]) rows[band] = { zs: [], xs: [] };
    rows[band].zs.push(z); rows[band].xs.push(x);
  }
  const out = [];
  for (const band of Object.keys(rows).sort()) {
    const r = rows[band];
    if (r.zs.length < 6) continue;
    const zc = r.zs.reduce((a, b) => a + b, 0) / r.zs.length;
    const xc = r.xs.reduce((a, b) => a + b, 0) / r.xs.length;
    out.push({
      y: band,
      n: r.zs.length,
      zMin: +(Math.min(...r.zs) * cm).toFixed(1), zMax: +(Math.max(...r.zs) * cm).toFixed(1),
      zCtr: +(zc * cm).toFixed(1),
      xHalf: +((Math.max(...r.xs) - Math.min(...r.xs)) / 2 * cm).toFixed(1),
      xCtr: +(xc * cm).toFixed(1),
    });
  }
  // spine joint bind z (model units → cm): hips, spine, spine1
  const jz = {};
  for (const b of av.root.children) {}
  const hips = skel.bones[boneIdx.Hips], spine = skel.bones[boneIdx.Spine], spine1 = skel.bones[boneIdx.Spine1];
  const local = (bone) => { const v = bone.getWorldPosition(new THREE.Vector3()); return [+(v.x*cm).toFixed(1), +(v.y*cm).toFixed(1), +(v.z*cm).toFixed(1)]; };
  return { bands: out.filter(o => +o.y > 0.7 && +o.y < 1.1), joints: { hips: local(hips), spine: local(spine), spine1: local(spine1) }, cm };
})()`, returnByValue: true, awaitPromise: true,
}, sessionId);
console.log(JSON.stringify(r.result.result.value, null, 1));
ws.close(); process.exit(0);
