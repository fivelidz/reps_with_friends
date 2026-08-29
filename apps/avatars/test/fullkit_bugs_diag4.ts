// apps/avatars/test/fullkit_bugs_diag4.ts — post-fix per-ring + per-column detail
// at REAL stride phases: which ring/column of tank/shorts is still far off, hem
// quality metrics, belt ring behaviour.
// Usage: bun apps/avatars/test/fullkit_bugs_diag4.ts
const PORT = 9464;
const OUT = '/tmp/fullkit_diag4';
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', `--user-data-dir=${OUT}-prof`, '--no-first-run', '--no-sandbox',
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

const PHASE = (idx: number, frac: number) => `
(async () => {
  const e = window.__rwfModels[${idx}];
  const av = e.avatar, THREE = window.__T;
  const bvh = e.bvh;
  if (!bvh) return { err: 'no bvh' };
  bvh.time = ${frac} * bvh.duration;
  bvh.update(0.016);
  e.wardrobe.updateFabric(0.016, false);
  av.root.updateMatrixWorld(true);
  const scene = av.prone.children[0];
  let body = null;
  scene.traverse(o => { if (!body && o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o; });
  const P = body.geometry.attributes.position;
  const cloud = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    body.applyBoneTransform(i, v).applyMatrix4(body.matrixWorld);
    cloud.push(v.x, v.y, v.z);
  }
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  const minD = (x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < cloud.length; i += 3) {
      const dx = cloud[i] - x, dy = cloud[i + 1] - y, dz = cloud[i + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
  const out = { frac: ${frac} };
  // per-ring per-column for tank + shorts: report worst ring with column angle
  for (const want of ['tank', 'shorts']) {
    let g = null;
    scene.traverse(o => { if (!g && o.isSkinnedMesh && o.userData?.rwfWardrobe === want) g = o; });
    if (!g) continue;
    const { radial, layout } = g.userData.rwfLayout;
    const gp = g.geometry.attributes.position;
    const worst = [];
    for (let li = 0; li < layout.length; li++) {
      const L = layout[li];
      if (!L) continue;
      for (let ri = 0; ri < L.ringCount; ri++) {
        let mx = 0, col = -1;
        for (let k = 0; k < radial; k++) {
          const vi = L.start + ri * radial + k;
          v.fromBufferAttribute(gp, vi);
          g.applyBoneTransform(vi, v).applyMatrix4(g.matrixWorld);
          const d = minD(v.x, v.y, v.z);
          if (d > mx) { mx = d; col = k; }
        }
        worst.push({ s: li, r: ri, mx: +(mx * cm).toFixed(1), col });
      }
    }
    worst.sort((a, b) => b.mx - a.mx);
    out[want] = { top5: worst.slice(0, 5), rings: worst.length };
  }
  // hem metrics
  const hems = [];
  for (const h of e.wardrobe.hems) {
    const C = h.C, R = h.R, p = h.p;
    const ys = [], rs = [];
    let cx = 0, cz = 0;
    for (let k = 0; k < C; k++) {
      const o = (R * C + k) * 3;
      cx += p[o]; cz += p[o + 2];
    }
    cx /= C; cz /= C;
    for (let k = 0; k < C; k++) {
      const o = (R * C + k) * 3;
      ys.push(p[o + 1]); rs.push(Math.hypot(p[o] - cx, p[o + 2] - cz));
    }
    const ySpread = Math.max(...ys) - Math.min(...ys);
    const rSpread = Math.max(...rs) - Math.min(...rs);
    // bottom ring max dist to body
    let mx = 0;
    for (let k = 0; k < C; k++) {
      const o = (R * C + k) * 3;
      mx = Math.max(mx, minD(p[o], p[o + 1], p[o + 2]));
    }
    hems.push({ ySpreadCm: +(ySpread * cm).toFixed(1), rSpreadCm: +(rSpread * cm).toFixed(1), maxOffCm: +(mx * cm).toFixed(1) });
  }
  out.hems = hems;
  // belt: worst vert + its angle around the ring
  let belt = null;
  scene.traverse(o => { if (o.userData?.rwfWardrobe === 'belt' && o.isMesh && o.geometry.parameters?.radius) belt = o; });
  if (belt) {
    belt.updateWorldMatrix(true, false);
    const gp = belt.geometry.attributes.position;
    const wp = new THREE.Vector3();
    let mx = 0, mvert = null;
    const st = Math.max(1, Math.floor(gp.count / 120));
    for (let i = 0; i < gp.count; i += st) {
      wp.fromBufferAttribute(gp, i).applyMatrix4(belt.matrixWorld);
      const d = minD(wp.x, wp.y, wp.z);
      if (d > mx) { mx = d; mvert = [wp.x, wp.y, wp.z]; }
    }
    out.belt = { maxCm: +(mx * cm).toFixed(1), worst: mvert.map(x => +x.toFixed(3)) };
  }
  return out;
})()`;

const idxR = await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => /Full Kit/.test(h.textContent))`,
  returnByValue: true,
}, sessionId);
const IDX = idxR.result.result.value;
await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('#modelGrid .style-card--model')[${IDX}].scrollIntoView({ block: 'center' }); true`,
  returnByValue: true,
}, sessionId);
await waitFor(`!!(window.__rwfModels[${IDX}] && window.__rwfModels[${IDX}].avatar && window.__rwfModels[${IDX}].renderer)`, 60000);
await waitFor(`!!window.__rwfModels[${IDX}].bvh`, 90000);
await new Promise(r => setTimeout(r, 1500));

for (const frac of [0.15, 0.3, 0.5, 0.7, 0.85]) {
  const r = await send('Runtime.evaluate', { expression: PHASE(IDX, frac), returnByValue: true, awaitPromise: true }, sessionId);
  const v = r.result.result.value;
  if (v.err) { console.log(frac, v.err); continue; }
  console.log(`\nfrac=${v.frac}`);
  console.log(`  tank   worst rings: ${v.tank.top5.map(w => `s${w.s}r${w.r}=${w.mx}(col${w.col})`).join('  ')}`);
  console.log(`  shorts worst rings: ${v.shorts.top5.map(w => `s${w.s}r${w.r}=${w.mx}(col${w.col})`).join('  ')}`);
  console.log(`  hems: ${JSON.stringify(v.hems)}`);
  if (v.belt) console.log(`  belt: max=${v.belt.maxCm}cm worst=${v.belt.worst}`);
}
ws.close(); process.exit(0);
