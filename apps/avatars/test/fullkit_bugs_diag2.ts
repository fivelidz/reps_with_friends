// apps/avatars/test/fullkit_bugs_diag2.ts — deep dive: WHERE do the garment verts
// go, and WHAT are they weighted to?
//  • shorts + tank skinned meshes: per-strip/per-ring max dist to body + top
//    skin weights (bone names)
//  • belt torus: live world radius vs pelvis extent (the "black ring" suspect)
//  • wristbands: centre distance from forearm bone segment (floating cylinders)
//  • hem pin-ring anchors: do anchors match the garment bottom rings?
// Usage: bun apps/avatars/test/fullkit_bugs_diag2.ts
const PORT = 9462;
const OUT = '/tmp/fullkit_diag2';
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

const ANALYSE = (idx: number) => `
(() => {
  const e = window.__rwfModels[${idx}];
  const av = e.avatar, THREE = window.__T;
  const out = {};
  av.root.updateMatrixWorld(true);
  const scene = av.prone.children[0];

  // body cloud
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
  const s = av.root.scale.x || 1;
  const cm = 175 / (av.H * s);
  const minD = (x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < cloud.length; i += 3) {
      const dx = cloud[i] - x, dy = cloud[i + 1] - y, dz = cloud[i + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };

  // ── skinned garments per ring ──
  const garments = [];
  scene.traverse(o => {
    if (!o.isSkinnedMesh || !o.userData?.rwfWardrobe || !o.userData?.rwfLayout) return;
    const { radial, layout } = o.userData.rwfLayout;
    const gp = o.geometry.attributes.position;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const boneName = (bi) => o.skeleton.bones[bi]?.name ?? bi;
    const rings = [];
    for (let li = 0; li < layout.length; li++) {
      const L = layout[li];
      if (!L) continue;
      for (let ri = 0; ri < L.ringCount; ri++) {
        let max = 0, cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < radial; k++) {
          const vi = L.start + ri * radial + k;
          v.fromBufferAttribute(gp, vi);
          o.applyBoneTransform(vi, v).applyMatrix4(o.matrixWorld);
          const d = minD(v.x, v.y, v.z);
          if (d > max) max = d;
          cx += v.x; cy += v.y; cz += v.z;
        }
        cx /= radial; cy /= radial; cz /= radial;
        // top weights of column 0 (representative)
        const vi0 = L.start + ri * radial;
        const wts = [];
        for (let b = 0; b < 4; b++) {
          const bi = si.getComponent ? si.getComponent(vi0, b) : 0;
          const ww = sw.getComponent ? sw.getComponent(vi0, b) : 0;
          if (ww > 0.05) wts.push(boneName(bi) + ':' + ww.toFixed(2));
        }
        rings.push({ s: li, r: ri, maxCm: +(max * cm).toFixed(1), ctr: [cx, cy, cz].map(x => +x.toFixed(3)), w: wts });
      }
    }
    garments.push({ tag: o.userData.rwfWardrobe, rings });
  });
  out.garments = garments;

  // ── rigid groups (tag on ancestor group) ──
  const rigids = [];
  const seg = (a, b, p) => {
    const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3());
    const AB = B.clone().sub(A); const t = Math.max(0, Math.min(1, p.clone().sub(A).dot(AB) / AB.lengthSq()));
    return p.distanceTo(A.clone().addScaledVector(AB, t));
  };
  scene.traverse(o => {
    if (!o.userData?.rwfWardrobe) return;
    if (o.isMesh) return; // measured via skinned/hem paths or below via group
    // a tagged GROUP: measure its descendant meshes
    const meshes = [];
    o.traverse(c => { if (c.isMesh && c.geometry?.attributes?.position) meshes.push(c); });
    if (!meshes.length) return;
    let max = 0, all = [];
    const bb = new THREE.Box3().setFromObject(o);
    const ctr = bb.getCenter(new THREE.Vector3());
    for (const m of meshes) {
      const mp = m.geometry.attributes.position;
      const w2 = new THREE.Vector3();
      const st = Math.max(1, Math.floor(mp.count / 80));
      for (let i = 0; i < mp.count; i += st) {
        w2.fromBufferAttribute(mp, i).applyMatrix4(m.matrixWorld);
        const d = minD(w2.x, w2.y, w2.z);
        if (d > max) max = d; all.push(d);
      }
    }
    const entry = {
      tag: o.userData.rwfWardrobe,
      parent: o.parent?.name ?? o.parent?.type,
      parentIsBone: !!o.parent?.isBone,
      maxCm: +(max * cm).toFixed(1), ctr: [ctr.x, ctr.y, ctr.z].map(x => +x.toFixed(3)),
      meshes: meshes.map(m => m.type + ':' + (m.geometry.type ?? '?')),
    };
    if (o.userData.rwfWardrobe === 'wristbands') {
      for (const side of ['foreL', 'foreR']) {
        const d = seg(av.bones[side], av.bones[side === 'foreL' ? 'handL' : 'handR'], ctr);
        if (d < 1) entry.foreDistCm = +(d * cm).toFixed(1);
      }
    }
    rigids.push(entry);
  });
  out.rigids = rigids;

  // ── belt torus live radius vs pelvis ──
  let belt = null;
  scene.traverse(o => { if (o.userData?.rwfWardrobe === 'belt' && o.isMesh && o.geometry.type === 'TorusGeometry') belt = o; });
  if (belt) {
    const bb = new THREE.Box3().setFromObject(belt);
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    out.belt = { radiusXCm: +(sz.x / 2 * cm).toFixed(1), radiusZCm: +(sz.z / 2 * cm).toFixed(1), y: +c.y.toFixed(3) };
  }

  // ── hips/pelvis world extent for reference ──
  const hips = av.bones.hips.getWorldPosition(new THREE.Vector3());
  const spine = av.bones.spine.getWorldPosition(new THREE.Vector3());
  let px = 0;
  for (let i = 0; i < cloud.length; i += 3) {
    const dy = Math.abs(cloud[i + 1] - (hips.y + spine.y) / 2);
    if (dy < 0.03 && Math.abs(cloud[i] - hips.x) > px) px = Math.abs(cloud[i] - hips.x);
  }
  out.pelvisHalfXCm = +(px * cm).toFixed(1);
  out.bvhT = e.bvh ? +(e.bvh.time / e.bvh.duration).toFixed(4) : null;
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
await new Promise(r => setTimeout(r, 3000));

for (let rep = 0; rep < 3; rep++) {
  const r = await send('Runtime.evaluate', { expression: ANALYSE(IDX), returnByValue: true }, sessionId);
  const v = r.result.result.value;
  console.log(`\n════ rep ${rep}  bvhT=${v.bvhT} ════`);
  console.log(`belt torus: ${JSON.stringify(v.belt)}   pelvis half-extent X: ${v.pelvisHalfXCm}cm`);
  for (const g of v.garments ?? []) {
    console.log(`── ${g.tag} per-ring (strip,ring → max dist, weights of col0):`);
    for (const ring of g.rings) console.log(`   s${ring.s} r${ring.r}: max=${String(ring.maxCm).padStart(6)}cm  w=[${ring.w.join(', ')}]  ctr=${ring.ctr}`);
  }
  for (const rg of v.rigids ?? [])
    console.log(`RIGID ${rg.tag.padEnd(14)} parent=${rg.parent}(bone=${rg.parentIsBone}) maxOff=${String(rg.maxCm).padStart(6)}cm${rg.foreDistCm !== undefined ? '  fromForeSeg=' + rg.foreDistCm + 'cm' : ''} meshes=${rg.meshes.length}`);
  await new Promise(r2 => setTimeout(r2, 900));
}
await Bun.write(`${OUT}.json`, JSON.stringify({ note: 'saved inline above' }));
ws.close(); process.exit(0);
