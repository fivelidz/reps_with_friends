// apps/avatars/test/fullkit_bugs_diag6.ts — inspect the constant worst verts:
// tank s0r4 col13 + shorts s0r0 col13: bind pos, live pos, nearest cloud point,
// hips height per frac (confirms re-posing).
const PORT = 9466;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fk6-prof', '--no-first-run', '--no-sandbox',
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
await waitFor(`!!(window.__rwfModels[${IDX}] && window.__rwfModels[${IDX}].bvh)`, 120000);
await new Promise(r => setTimeout(r, 1500));

const r = await send('Runtime.evaluate', {
  // run across fracs INSIDE one evaluate (rAF can't interfere mid-evaluate)
  expression: `
(async () => {
  const e = window.__rwfModels[${IDX}];
  const av = e.avatar, THREE = window.__T, bvh = e.bvh;
  const scene = av.prone.children[0];
  let body = null, tank = null, shorts = null;
  scene.traverse(o => {
    if (o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o;
    if (o.isSkinnedMesh && o.userData?.rwfWardrobe === 'tank') tank = o;
    if (o.isSkinnedMesh && o.userData?.rwfWardrobe === 'shorts') shorts = o;
  });
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  const v = new THREE.Vector3();
  const probe = [];
  for (const frac of [0.15, 0.35, 0.55, 0.75]) {
    bvh.time = frac * bvh.duration;
    bvh.update(0.016);
    e.wardrobe.updateFabric(0.016, false);
    av.root.updateMatrixWorld(true);
    // body cloud
    const P = body.geometry.attributes.position;
    const cloud = [];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      body.applyBoneTransform(i, v).applyMatrix4(body.matrixWorld);
      cloud.push(v.x, v.y, v.z);
    }
    const hipsY = av.bones.hips.getWorldPosition(new THREE.Vector3()).y;
    // tank s0 r4 col13, shorts s0 r0 col13
    const examine = (g, sIdx, rIdx, col) => {
      const { radial, layout } = g.userData.rwfLayout;
      const vi = layout[sIdx].start + rIdx * radial + col;
      const bind = new THREE.Vector3().fromBufferAttribute(g.geometry.attributes.position, vi);
      const live = bind.clone(); g.applyBoneTransform(vi, live); live.applyMatrix4(g.matrixWorld);
      let bd = Infinity, bp = null;
      for (let i = 0; i < cloud.length; i += 3) {
        const dx = cloud[i] - live.x, dy = cloud[i + 1] - live.y, dz = cloud[i + 2] - live.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; bp = [cloud[i], cloud[i + 1], cloud[i + 2]]; }
      }
      return {
        bind: bind.toArray().map(x => +(x * cm).toFixed(1)),
        live: live.toArray().map(x => +(x * cm).toFixed(1)),
        nearest: bp.map(x => +(x * cm).toFixed(1)),
        distCm: +(Math.sqrt(bd) * cm).toFixed(1),
      };
    };
    probe.push({
      frac, hipsYcm: +(hipsY * cm).toFixed(1),
      tank_s0r4c13: examine(tank, 0, 4, 13),
      shorts_s0r0c13: examine(shorts, 0, 0, 13),
    });
  }
  return probe;
})()`, returnByValue: true, awaitPromise: true,
}, sessionId);
console.log(JSON.stringify(r.result.result.value, null, 1));
ws.close(); process.exit(0);
