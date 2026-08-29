// apps/avatars/test/fullkit_bugs_diag.ts — reproduce + measure the 3 founder-reported
// Full Kit card bugs (black ring / helical waist fabric / floating wrist cylinders).
//
// Method: scroll the "Geno Full Kit — crowned frog, BVH" card into view, let the
// walk BVH play, then at several phases:
//   • world-space GEOMETRIC ATTACHMENT: every wardrobe mesh vertex's min distance
//     to the CPU-skinned body surface (cm at human scale, 175cm = H)
//   • per-hem ring structure: bottom-ring planarity + helicity (height-vs-angle
//     monotonic progression) + radius spread
//   • rigid attachments (wristbands/belt/headband/sneakers): distance of mesh
//     bbox center from its owning bone segment
//   • screenshots at 3 phases
// Usage: bun apps/avatars/test/fullkit_bugs_diag.ts
const PORT = 9461;
const OUT = '/tmp/fullkit_diag';
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
await send('Log.enable', {}, sessionId);
const consoleErrs: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
      consoleErrs.push(`[${m.params.type}] ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 180)}`);
    if (m.method === 'Runtime.exceptionThrown')
      consoleErrs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 180));
  } catch {}
});

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

// ── the analysis payload, evaluated IN PAGE ──────────────────────────────────
// Everything below runs inside the page against the live fullkit entry.
const ANALYSE = (idx: number, phase: number) => `
(() => {
  const e = window.__rwfModels[${idx}];
  const av = e.avatar, THREE = window.__T;
  const out = { phase: ${phase} };
  if (!THREE) return { err: 'no THREE on window' };
  if (!av) return { err: 'no avatar' };
  av.root.updateMatrixWorld(true);

  // ── body cloud: CPU-skinned sample of the BODY mesh (not wardrobe) ──
  const scene = av.prone.children[0];
  let body = null, bodyVerts = 0;
  scene.traverse(o => { if (!body && o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o; });
  if (!body) return { err: 'no body skinnedmesh' };
  const P = body.geometry.attributes.position;
  bodyVerts = P.count;
  const step = Math.max(1, Math.floor(P.count / 4000));
  const cloud = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i += step) {
    v.fromBufferAttribute(P, i);
    body.applyBoneTransform(i, v).applyMatrix4(body.matrixWorld);
    cloud.push(v.x, v.y, v.z);
  }
  out.bodyVerts = bodyVerts; out.cloudN = cloud.length / 3;

  // cm-per-world-unit: figure is H model-units tall, root-scaled, 175cm human
  const s = av.root.scale.x || 1;
  const cmPerUnit = 175 / (av.H * s);
  out.cmPerUnit = +cmPerUnit.toFixed(1);

  const minDist2 = (x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < cloud.length; i += 3) {
      const dx = cloud[i] - x, dy = cloud[i + 1] - y, dz = cloud[i + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };

  // ── every wardrobe mesh: attachment to body surface ──
  const meshes = [];
  scene.traverse(o => {
    const tag = o.userData?.rwfWardrobe;
    if (!tag || !o.isMesh || !o.geometry?.attributes?.position) return;
    const gp = o.geometry.attributes.position;
    const n = Math.min(gp.count, 260);
    const st = Math.max(1, Math.floor(gp.count / n));
    const w = new THREE.Vector3();
    let max = 0, sum = 0, cnt = 0, mx = 0, my = 0, mz = 0;
    for (let i = 0; i < gp.count; i += st) {
      w.fromBufferAttribute(gp, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, w);
      w.applyMatrix4(o.matrixWorld);
      const d = minDist2(w.x, w.y, w.z);
      if (d > max) max = d;
      sum += d; cnt++; mx += w.x; my += w.y; mz += w.z;
    }
    meshes.push({
      tag, verts: gp.count, skinned: !!o.isSkinnedMesh, visible: o.visible,
      maxCm: +(max * cmPerUnit).toFixed(1), avgCm: +((sum / cnt) * cmPerUnit).toFixed(1),
      ctr: [mx / cnt, my / cnt, mz / cnt].map(x => +x.toFixed(3)),
    });
  });
  out.meshes = meshes;

  // ── hem rings: helicity of the bottom free ring ──
  const hems = [];
  const w = e.wardrobe;
  if (w && w.hems) for (const h of w.hems) {
    const C = h.C, R = h.R, p = h.p;
    // bottom ring = row R
    const ring = [];
    for (let k = 0; k < C; k++) {
      const o = (R * C + k) * 3;
      ring.push([p[o], p[o + 1], p[o + 2]]);
    }
    // centroid + best-fit plane (normal ≈ least-variance axis)
    let cx = 0, cy = 0, cz = 0;
    for (const q of ring) { cx += q[0]; cy += q[1]; cz += q[2]; }
    cx /= C; cy /= C; cz /= C;
    // height spread + helicity: fit y = a + b*sin(t) + c*cos(t); residual = out-of-plane
    // simpler & robust: variance of y around mean; and per-column angle from centroid
    let ys = ring.map(q => q[1]);
    const yMean = ys.reduce((a, b) => a + b, 0) / C;
    const ySpread = Math.max(...ys) - Math.min(...ys);
    const radii = ring.map(q => Math.hypot(q[0] - cx, q[2] - cz));
    const rMean = radii.reduce((a, b) => a + b, 0) / C;
    const rSpread = Math.max(...radii) - Math.min(...radii);
    // helicity: sort columns by angle atan2(z-cz, x-cx); correlate angle rank vs y
    const order = ring.map((q, k) => ({ k, ang: Math.atan2(q[2] - cz, q[0] - cx), y: q[1] }))
      .sort((a, b) => a.ang - b.ang);
    // unwrap: after sorting by angle, a helix has monotonic-ish y progression that
    // wraps once; measure |Pearson r| between (angle-unwrapped index) and y
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    order.forEach((q, i) => { sa += i; sb += q.y; saa += i * i; sbb += q.y * q.y; sab += i * q.y; });
    const n = C;
    const r = (n * sab - sa * sb) / Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb) || 1e-9);
    // anchor ring (row 0) centroid for reference
    let ay = 0; for (let k = 0; k < C; k++) ay += p[k * 3 + 1]; ay /= C;
    hems.push({
      dead: h.dead, seeded: h.seeded, frozen: h.frozen,
      ySpreadCm: +(ySpread * cmPerUnit).toFixed(1),
      rSpreadCm: +(rSpread * cmPerUnit).toFixed(1),
      rMeanCm: +(rMean * cmPerUnit).toFixed(1),
      helicityR: +r.toFixed(2),
      dropCm: +((yMean - ay) * cmPerUnit).toFixed(1),
    });
  }
  out.hems = hems;

  // ── rigid bones: wristband centres vs forearm segments ──
  const seg = (a, b, p) => { // dist from p to segment ab (world)
    const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3());
    const AB = B.clone().sub(A); const t = Math.max(0, Math.min(1, p.clone().sub(A).dot(AB) / AB.lengthSq()));
    return p.distanceTo(A.clone().addScaledVector(AB, t));
  };
  const bands = [];
  scene.traverse(o => {
    if (o.userData?.rwfWardrobe !== 'wristbands' || !o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const bb = new THREE.Box3().setFromObject(o);
    const c = bb.getCenter(new THREE.Vector3());
    for (const side of ['foreL', 'foreR']) {
      const d = seg(av.bones[side], av.bones[side === 'foreL' ? 'handL' : 'handR'], c);
      if (d < 0.5) bands.push({ side, distCm: +(d * cmPerUnit).toFixed(1), ctr: [c.x, c.y, c.z].map(x => +x.toFixed(3)) });
    }
  });
  out.wristbands = bands;
  out.bvhTime = e.bvh ? +(e.bvh.time / e.bvh.duration).toFixed(3) : null;
  return out;
})()`;

// find fullkit index
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`, 90000);
const idxR = await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => /Full Kit/.test(h.textContent))`,
  returnByValue: true,
}, sessionId);
const IDX = idxR.result.result.value;
console.log('fullkit index:', IDX);
if (IDX < 0) { console.error('fullkit card not found'); process.exit(1); }

// scroll into view; wait for model + BVH playing
await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('#modelGrid .style-card--model')[${IDX}].scrollIntoView({ block: 'center' }); true`,
  returnByValue: true,
}, sessionId);
await waitFor(`!!(window.__rwfModels[${IDX}] && window.__rwfModels[${IDX}].avatar && window.__rwfModels[${IDX}].renderer)`, 60000);
await waitFor(`!!window.__rwfModels[${IDX}].bvh`, 90000); // walk fetch is 33MB
await send('Runtime.evaluate', {
  expression: `import('/site/lib/three.module.js').then(m => { window.__T = m; return true; })`,
  returnByValue: true, awaitPromise: true,
}, sessionId);
await new Promise(r => setTimeout(r, 2500)); // let it settle past seed frame

const results = [];
for (let ph = 0; ph < 6; ph++) {
  await new Promise(r => setTimeout(r, 450)); // advance walk ~0.45s per sample
  const r = await send('Runtime.evaluate', { expression: ANALYSE(IDX, ph), returnByValue: true, awaitPromise: true }, sessionId);
  const v = r.result.result.value;
  results.push(v);
  console.log(`\n═══ phase ${ph} (bvh t=${v.bvhTime}) ═══`);
  if (v.err) { console.log('ERR', v.err); continue; }
  console.log(`bodyVerts=${v.bodyVerts} cloudN=${v.cloudN} cmPerUnit=${v.cmPerUnit}`);
  for (const m of v.meshes) console.log(`  ${m.skinned ? 'SKIN' : 'RIGD'} ${m.tag.padEnd(12)} v=${String(m.verts).padEnd(4)} vis=${m.visible ? 'Y' : 'N'} max=${String(m.maxCm).padStart(6)}cm avg=${String(m.avgCm).padStart(6)}cm`);
  for (const h of v.hems) console.log(`  HEM  ySpread=${h.ySpreadCm}cm rSpread=${h.rSpreadCm}cm rMean=${h.rMeanCm}cm helicity|r|=${h.helicityR} drop=${h.dropCm}cm${h.dead ? ' DEAD' : ''}${h.frozen ? ' frozen' : ''}`);
  for (const b of v.wristbands) console.log(`  BAND ${b.side} distFromForeSeg=${b.distCm}cm`);
  // screenshot at phases 0, 2, 4
  if (ph === 0 || ph === 2 || ph === 4) {
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await Bun.write(`${OUT}_ph${ph}.png`, Buffer.from(shot.result.data, 'base64'));
  }
}

await Bun.write(`${OUT}_results.json`, JSON.stringify(results, null, 2));
console.log('\nconsole errors/warnings:', consoleErrs.length);
for (const e of consoleErrs.slice(0, 12)) console.log('  ' + e);
console.log(`\nsaved ${OUT}_ph{0,2,4}.png + ${OUT}_results.json`);
ws.close(); process.exit(0);
