// apps/avatars/test/fullkit_bugs_diag3.ts — pin the exact construction numbers:
//  • wristbands: limbFrame len, band local pos, bone children, live dist from fore segment
//  • belt: torus radius params vs live pelvis extent
//  • shorts shell: bind-space ring radii (waistband giant?)
//  • tank ring r4: which column is furthest off
//  • jump the BVH to real stride phases (0.15/0.3/0.45/0.6 of clip) — earlier
//    probes only sampled the first 4% of the capture
// Usage: bun apps/avatars/test/fullkit_bugs_diag3.ts
const PORT = 9463;
const OUT = '/tmp/fullkit_diag3';
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

// one-shot internals dump (pose-independent construction facts)
const INTERNALS = (idx: number) => `
(() => {
  const e = window.__rwfModels[${idx}];
  const av = e.avatar, THREE = window.__T;
  const out = {};
  av.root.updateMatrixWorld(true);
  const scene = av.prone.children[0];
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  out.H = +av.H.toFixed(3);

  // wristband construction facts
  const wb = [];
  scene.traverse(o => {
    if (o.userData?.rwfWardrobe !== 'wristbands' || !o.parent?.isBone) return;
    const bone = o.parent;
    const kids = bone.children.filter(c => c.isBone).map(c => c.name);
    const band = o.children[0];
    const A = bone.getWorldPosition(new THREE.Vector3());
    const hand = av.bones[bone.name === 'LeftForeArm' ? 'handL' : 'handR'];
    const B = hand ? hand.getWorldPosition(new THREE.Vector3()) : null;
    const bb = new THREE.Box3().setFromObject(o);
    const c = bb.getCenter(new THREE.Vector3());
    // distance of band centre from the infinite elbow→hand LINE and from the segment
    const AB = B.clone().sub(A); const L = AB.length();
    const t = c.clone().sub(A).dot(AB) / L ** 2;
    const perp = c.clone().sub(A).addScaledVector(AB, -t).length();
    wb.push({
      bone: bone.name, kids,
      foreLenCm: +(L * cm).toFixed(1),
      bandLocalY: +band.position.y.toFixed(3),
      bandH: +band.geometry.parameters.height.toFixed(3),
      alongT: +t.toFixed(2), perpCm: +(perp * cm).toFixed(1),
      segDistCm: +((t >= 0 && t <= 1 ? perp : c.distanceTo(t < 0 ? A : B)) * cm).toFixed(1),
    });
  });
  out.wristbands = wb;

  // belt construction facts
  let belt = null;
  scene.traverse(o => { if (o.userData?.rwfWardrobe === 'belt' && o.isMesh && o.geometry.parameters?.radius !== undefined) belt = o; });
  if (belt) out.belt = {
    torusR: +belt.geometry.parameters.radius.toFixed(3),
    torusRCm: +(belt.geometry.parameters.radius * cm).toFixed(1),
    tubeRCm: +(belt.geometry.parameters.tube * cm).toFixed(1),
    scaleY: +belt.scale.z.toFixed(2),
  };

  // shorts shell bind radii: strip0 rings, distance of ring verts (bind space =
  // geometry positions) from ring centre
  let shorts = null;
  scene.traverse(o => { if (o.isSkinnedMesh && o.userData?.rwfWardrobe === 'shorts') shorts = o; });
  if (shorts) {
    const { radial, layout } = shorts.userData.rwfLayout;
    const gp = shorts.geometry.attributes.position;
    const rings = [];
    for (let ri = 0; ri < layout[0].ringCount; ri++) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < radial; k++) {
        cx += gp.getX(layout[0].start + ri * radial + k);
        cy += gp.getY(layout[0].start + ri * radial + k);
        cz += gp.getZ(layout[0].start + ri * radial + k);
      }
      cx /= radial; cy /= radial; cz /= radial;
      let rmax = 0;
      for (let k = 0; k < radial; k++) {
        const vi = layout[0].start + ri * radial + k;
        rmax = Math.max(rmax, Math.hypot(gp.getX(vi) - cx, gp.getZ(vi) - cz));
      }
      rings.push({ r: ri, ctrY: +cy.toFixed(3), bindRmaxCm: +(rmax * cm).toFixed(1) });
    }
    out.shortsShellRings = rings;
  }
  return out;
})()`;

// per-phase geometry at REAL strides: jump bvh time forward
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
  const step = Math.max(1, Math.floor(P.count / 6000));
  const cloud = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i += step) {
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
  // per-slot max/avg over ALL wardrobe meshes (group tags inherited)
  const slots = {};
  const tagOf = (o) => { let n = o; while (n) { if (n.userData?.rwfWardrobe) return n.userData.rwfWardrobe; n = n.parent; } return null; };
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const tag = tagOf(o);
    if (!tag) return;
    const gp = o.geometry.attributes.position;
    const st = Math.max(1, Math.floor(gp.count / 200));
    let mx = 0, sm = 0, c = 0;
    for (let i = 0; i < gp.count; i += st) {
      v.fromBufferAttribute(gp, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      const d = minD(v.x, v.y, v.z);
      if (d > mx) mx = d; sm += d; c++;
    }
    const key = tag;
    if (!slots[key]) slots[key] = { max: 0, avg: 0, c: 0 };
    if (mx > slots[key].max) slots[key].max = mx;
    slots[key].avg += sm; slots[key].c += c;
    slots[key].avgAll = slots[key].avg / slots[key].c;
  });
  for (const k of Object.keys(slots)) slots[k] = { maxCm: +(slots[k].max * cm).toFixed(1), avgCm: +(slots[k].avgAll * cm).toFixed(1) };
  out.slots = slots;
  // wristbands + belt live
  const seg = (a, b, p) => {
    const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3());
    const AB = B.clone().sub(A); const t = Math.max(0, Math.min(1, p.clone().sub(A).dot(AB) / AB.lengthSq()));
    return p.distanceTo(A.clone().addScaledVector(AB, t));
  };
  out.bands = [];
  scene.traverse(o => {
    if (o.userData?.rwfWardrobe !== 'wristbands' || !o.parent?.isBone) return;
    const bone = o.parent;
    const hand = av.bones[bone.name === 'LeftForeArm' ? 'handL' : 'handR'];
    const bb = new THREE.Box3().setFromObject(o);
    const c = bb.getCenter(new THREE.Vector3());
    out.bands.push({ bone: bone.name.replace('Fore', ''), segCm: +(seg(bone, hand, c) * cm).toFixed(1) });
  });
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
await new Promise(r => setTimeout(r, 2000));

const ir = await send('Runtime.evaluate', { expression: INTERNALS(IDX), returnByValue: true }, sessionId);
console.log('═══ CONSTRUCTION FACTS ═══');
console.log(JSON.stringify(ir.result.result.value, null, 1));

console.log('\n═══ LIVE per-phase (real strides) ═══');
for (const frac of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
  const r = await send('Runtime.evaluate', { expression: PHASE(IDX, frac), returnByValue: true, awaitPromise: true }, sessionId);
  const v = r.result.result.value;
  if (v.err) { console.log(frac, v.err); continue; }
  const slots = Object.entries(v.slots).map(([k, s]) => `${k}:${(s as any).maxCm}/${(s as any).avgCm}`).join('  ');
  console.log(`frac=${frac}  ${slots}   bands=${JSON.stringify(v.bands)}`);
}
ws.close(); process.exit(0);
