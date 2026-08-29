// apps/avatars/test/fullkit_bugs_diag7.ts — sleeve ring forensics: bind-fit
// (stand pose ≈ bind) vs pose-follow. Prints per-ring per-side spans.
const PORT = 9467;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fk7-prof', '--no-first-run', '--no-sandbox',
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
await new Promise(r => setTimeout(r, 1200));

const r = await send('Runtime.evaluate', {
  expression: `
(async () => {
  const e = window.__rwfModels[${IDX}];
  const av = e.avatar, THREE = window.__T;
  const out = {};
  const scene = av.prone.children[0];
  let body = null, tank = null;
  scene.traverse(o => {
    if (o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o;
    if (o.isSkinnedMesh && o.userData?.rwfWardrobe === 'tank') tank = o;
  });
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  const v = new THREE.Vector3();
  const buildCloud = () => {
    const P = body.geometry.attributes.position;
    const cloud = [];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      body.applyBoneTransform(i, v).applyMatrix4(body.matrixWorld);
      cloud.push(v.x, v.y, v.z);
    }
    return cloud;
  };
  const minD = (cloud, x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < cloud.length; i += 3) {
      const dx = cloud[i] - x, dy = cloud[i + 1] - y, dz = cloud[i + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
  const sleeves = (cloud) => {
    const { radial, layout } = tank.userData.rwfLayout;
    const gp = tank.geometry.attributes.position;
    const rows = [];
    for (const li of [1, 2]) {
      const L = layout[li];
      for (let ri = 0; ri < L.ringCount; ri++) {
        let mx = 0, col = -1;
        const cols = [];
        for (let k = 0; k < radial; k++) {
          const vi = L.start + ri * radial + k;
          v.fromBufferAttribute(gp, vi);
          tank.applyBoneTransform(vi, v).applyMatrix4(tank.matrixWorld);
          const d = minD(cloud, v.x, v.y, v.z);
          cols.push(+(d * cm).toFixed(1));
          if (d > mx) { mx = d; col = k; }
        }
        rows.push({ s: li, r: ri, maxCm: +(mx * cm).toFixed(1), col, cols });
      }
    }
    return rows;
  };
  // 1) stand ≈ bind
  e.bvh.stop(); e.bvh = null;
  av.pose('stand', 0);
  av.root.updateMatrixWorld(true);
  out.stand = sleeves(buildCloud()).map(r => ({ s: r.s, r: r.r, max: r.maxCm, col: r.col, cols: r.cols }));
  return out;
})()`, returnByValue: true, awaitPromise: true,
}, sessionId);
const v = r.result.result.value;
for (const row of v.stand) {
  console.log(`s${row.s} r${row.r}  max=${row.max}cm @col${row.col}   per-col: ${row.cols.join(' ')}`);
}
ws.close(); process.exit(0);
