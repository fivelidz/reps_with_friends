// v7 VERIFICATION SUITE — the founder's four fixes + the full v6-style probe.
//   FIX 1  collar at neck base: collarY vs neckBaseY numbers + neckline pixel
//          check (collar reads ABOVE the shoulder line)
//   FIX 2  waistband charcoal: band/skin/shorts sampled colours + contrast bar
//   FIX 3  loose hang: chest/hem silhouette numbers + wrinkle radial variance
//          + hem regularity + region/containment/Δsource through the probe
//   FIX 4  poses animate: per-pose bone deltas, clip→pose round trips, the
//          setAnim race regression, deferred selection during verify
//   + idle rAF silence, instruments alive, zero console errors.
// Usage: bun apps/atelier/test/derived_v7_verify.ts
const PORT = 9549;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v7-verify', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 200));
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
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

const results: any = { steps: [] };
const step = (name: string, pass: boolean, detail: any = null) => {
  results.steps.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== null ? '  ' + JSON.stringify(detail).slice(0, 240) : ''}`);
};

// ═══ FIX 4 (first — the regression) ═════════════════════════════════════════
// 4a. per-pose animation numerics through the LIVE tick loop (not just the
//     sweep): select each pose, measure bone motion over 0.6 s of real time.
const poseLive = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const probe = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); const o = {};
    for (const n of ['hips', 'head', 'armL', 'foreL', 'handL', 'upLegL', 'footL']) if (B[n]) o[n] = B[n].getWorldPosition(v).clone();
    return o; };
  const delta = (a, b) => { let m = 0; for (const k in a) m = Math.max(m, a[k].distanceTo(b[k])); return m; };
  A.setTurntable(false); A.play();
  const out = {};
  for (const id of ['squat', 'pushup', 'jumpingjack', 'curl', 'idle']) {
    await A.setAnim(id);
    await new Promise((r) => setTimeout(r, 400));
    const s0 = probe();
    await new Promise((r) => setTimeout(r, 620));
    out[id] = { units: +delta(s0, probe()).toFixed(4) };
  }
  await A.setAnim('idle');
  return out;
})()`);
const pl: any = poseLive ?? {};
step('FIX4 poses visibly animate (live tick, Δ over 0.62 s)',
  ['squat', 'pushup', 'jumpingjack', 'curl'].every((p) => (pl[p]?.units ?? 0) > 0.05) && (pl.idle?.units ?? 1) > 0.0002,
  pl);

// 4b. clip → pose → clip round trips (dropdown path)
const roundtrip = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const probe = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); const o = {};
    for (const n of ['hips', 'head', 'handL']) if (B[n]) o[n] = B[n].getWorldPosition(v).clone(); return o; };
  const d = (a, b) => Math.max(...Object.keys(a).map((k) => a[k].distanceTo(b[k])));
  const out = {};
  for (const [clip, pose] of [['clip:walk', 'squat'], ['clip:sprint', 'jumpingjack'], ['clip:sad', 'curl'], ['clip:goblin_combat', 'pushup']]) {
    await A.setAnim(clip); await new Promise((r) => setTimeout(r, 650));
    const clipSnap = probe();
    await A.setAnim(pose); await new Promise((r) => setTimeout(r, 420));
    const poseA = probe();
    await new Promise((r) => setTimeout(r, 620));
    const poseB = probe();
    out[clip + '→' + pose] = {
      poseDiffersFromClip: +d(clipSnap, poseA).toFixed(3),
      poseAnimating: +d(poseA, poseB).toFixed(3),
      yaw: +av.root.rotation.y.toFixed(3),
    };
  }
  await A.setAnim('idle');
  return out;
})()`);
const rt: any = roundtrip ?? {};
const rtKeys = Object.keys(rt);
step('FIX4 clip→pose round trips (pose differs from clip AND animates)',
  rtKeys.length === 4 && rtKeys.every((k) => rt[k].poseDiffersFromClip > 0.05 && rt[k].poseAnimating > 0.05),
  rt);

// 4c. the setAnim RACE regression: clip + pose selected in the same JS task —
//     the late-arriving player must NOT clobber the pose or yaw it.
const race = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.setTurntable(false); A.play();
  const p1 = A.setAnim('clip:run');
  A.setAnim('squat');                 // lands first; clip resolves later
  await p1;
  await new Promise((r) => setTimeout(r, 700));
  av.root.updateMatrixWorld(true); const v = new THREE.Vector3();
  const a = { h: av.bones.head.getWorldPosition(v).clone() };
  await new Promise((r) => setTimeout(r, 620));
  av.root.updateMatrixWorld(true);
  const b = { h: av.bones.head.getWorldPosition(v).clone() };
  return { stillSquat: +a.h.distanceTo(b.h).toFixed(4), yaw: +av.root.rotation.y.toFixed(4), animId: A.state.animId };
})()`);
step('FIX4 stale clip install cancelled (race: no yaw slam, pose keeps animating)',
  (race as any)?.yaw === 0 && (race as any)?.stillSquat > 0.05 && (race as any)?.animId === 'squat', race);

// 4d. full-skeleton bind restore: after ANY clip, non-mapped joints (Spine3,
//     Neck1) return to their captured bind quaternions.
const bindRestore = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const pick = () => { const o = {};
    for (const n of ['Spine3', 'Neck1', 'LeftHandThumb1', 'RightHandMiddle1']) {
      const b = av.prone.children[0].getObjectByName(n);
      if (b) o[n] = b.quaternion.toArray().map((q) => +q.toFixed(4)).join(',');
    } return o; };
  await A.setAnim('idle');            // stand pose — Spine3 untouched by it
  const bindRef = pick();             // unmapped joints = bind here
  await A.setAnim('clip:swagger');
  await new Promise((r) => setTimeout(r, 650));
  const during = pick();
  await A.setAnim('squat');
  const after = pick();
  const clipPosed = Object.keys(during).filter((k) => during[k] !== bindRef[k]).length;
  const backAtBind = Object.keys(bindRef).filter((k) => after[k] === bindRef[k]).length;
  return { joints: Object.keys(bindRef).length, clipPosedThem: clipPosed, backAtBind };
})()`);
step('FIX4 unmapped joints restored to bind after clip→pose',
  (bindRestore as any)?.joints >= 3 && (bindRestore as any)?.backAtBind === (bindRestore as any)?.joints
  && (bindRestore as any)?.clipPosedThem >= 1, bindRestore);

// ═══ FIX 1 — collar at the neck base ═══════════════════════════════════════
const stats0 = await ev('window.__atelier.derivedStats()');
const hH = (stats0 as any)?.heightsH ?? {};
step('FIX1 collar cut at the measured neck base (|collarY − neckBaseY| ≤ 1 cm)',
  Math.abs((hH.collarY ?? 0) - (hH.neckBaseY ?? 1)) <= 0.006, hH);
// pixel: collar top reads ABOVE the shoulder-joint line (≥ 3 cm)
const collarPx = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  for (const h of A.outfit.slots.head ?? []) h.visible = false;
  A.setCam([0.55, 1.25, 2.0], [0, 1.15, 0]);
  const v = new THREE.Vector3();
  const mesh = A.outfit.derived.meshes[0];
  const d = mesh.userData.rwfDerived;
  const o = d.openings.find((x) => x.name === 'shirt-collar');
  // (a) WORLD-SPACE: rib-ring top vs the shoulder-joint line. A screen-row
  // comparison is perspective-broken from a 3/4 camera (points at the same
  // height but different depth invert their screen order — measured ring
  // top BELOW the shoulders on screen while 7 cm above them in world).
  av.bones.armL.getWorldPosition(v); const shL = v.clone();
  av.bones.armR.getWorldPosition(v); const shR = v.clone();
  const shoulderY = (shL.y + shR.y) / 2;
  let ringTopY = -1;
  const ringN = (o.rings ?? 4) * (o.samples ?? 64);
  for (let k = 0; k < ringN; k++) {
    v.fromBufferAttribute(mesh.geometry.attributes.position, o.ringStart + k).applyMatrix4(mesh.matrixWorld);
    if (v.y > ringTopY) ringTopY = v.y;
  }
  const sc = av.root.scale.x || 1;
  const bb = d.body.geometry.boundingBox; const Hu = bb.max.y - bb.min.y;
  const aboveCm = +((ringTopY - shoulderY) / sc * 175 / Hu).toFixed(1);   // model units → cm
  // (b) PIXEL: the rib reads as FABRIC at the neck — sample AT the projected
  // front ring verts (not a screen-row scan)
  const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
    if (dd < 10) return -1; return mx === g ? 60 * ((b - r) / dd + 2) : -1; };
  let limeReads = 0, reads = 0;
  for (const ring of [1, 2, 3]) {
    for (const smp of [6, 8, 10, 56, 58]) {
      const vi = o.ringStart + ring * 64 + smp;
      v.fromBufferAttribute(mesh.geometry.attributes.position, vi).applyMatrix4(mesh.matrixWorld);
      const ndc = v.clone().project(A.getCam());
      const c = A.readPx(ndc.x, ndc.y);
      reads++;
      const h2 = hue(c[0], c[1], c[2]);
      if (h2 >= 0 && Math.abs(h2 - 68) < 20) limeReads++;
    }
  }
  for (const h of A.outfit.slots.head ?? []) h.visible = true;
  return { shoulderYWorld: +shoulderY.toFixed(3), ringTopYWorld: +ringTopY.toFixed(3),
           collarAboveShoulderCm: aboveCm, limeAtRing: limeReads + '/' + reads };
})()`);
step('FIX1 collar rings the neck base (≥ 3 cm above shoulder line in world + lime at the ring)',
  (collarPx as any)?.collarAboveShoulderCm >= 3 && parseInt(String((collarPx as any)?.limeAtRing), 10) >= 10, collarPx);

// ═══ FIX 2 — waistband contrast ════════════════════════════════════════════
const band = await ev('window.__atelier.bandCheck()');
const col = (band as any)?.colours ?? {};
const lum = (c: any) => c ? 0.2126 * c[0] + 0.7152 * c[1] + +0.0722 * c[2] : -1;
const hex = (c: any) => c ? '#' + c.slice(0, 3).map((x: number) => x.toString(16).padStart(2, '0')).join('') : null;
const dContrast = (a: any, b: any) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : -1;
step('FIX2 waistband present (charcoal run between lime and coral)', (band as any)?.pass === true,
  { band: (band as any)?.band, runs: (band as any)?.bandRuns });
step('FIX2 band vs skin vs shorts contrast (ΔRGB ≥ 60 both)',
  dContrast(col.bandRgb, col.skinRgb) >= 60 && dContrast(col.bandRgb, col.shortsRgb) >= 60,
  { band: hex(col.bandRgb), skin: hex(col.skinRgb), shorts: hex(col.shortsRgb),
    dSkin: +dContrast(col.bandRgb, col.skinRgb).toFixed(0), dShorts: +dContrast(col.bandRgb, col.shortsRgb).toFixed(0) });

// ═══ FIX 3 — looseness + drape ═════════════════════════════════════════════
// silhouette at chest/hem: shirt surface radius vs body radius (measured,
// before = v6 spec 9 mm chest / 12+10 flare lip)
const sil = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const st = A.derivedStats();
  const Hcm = 175;
  const out = {};
  for (const [tag, mesh] of [['tshirt', A.outfit.derived.meshes[0]], ['shorts', A.outfit.derived.meshes[1]]]) {
    const d = mesh.userData.rwfDerived, g = mesh.geometry;
    const bd = d.bindDelta;
    const cmPerU = Hcm / 175 * (1 / 0.01) * 0.01; // model units→cm via H=1.75m per unit-height… use mesh bbox H
    // honest conversion: body height in units
    const bb = d.body.geometry.boundingBox; const Hu = bb.max.y - bb.min.y;
    const cmU = 175 / Hu;
    // radial (⊥Y) component of the bind offset, by y-band
    const byY = {};
    for (let k = 0; k < bd.length / 3; k++) {
      const y = g.attributes.position.getY(k);
      const dx = bd[k * 3], dy = bd[k * 3 + 1], dz = bd[k * 3 + 2];
      const rad = Math.hypot(dx, dz);
      const band = Math.round(y / Hu * 100); // % height
      (byY[band] ??= []).push(rad);
    }
    const pct = (p) => { const b = Math.round(p * 100); let best = null;
      for (let k = b - 1; k <= b + 1; k++) if (byY[k]) { for (const v2 of byY[k]) (best ??= []).push(v2); }
      return best; };
    const mx = (arr) => arr && arr.length ? Math.max(...arr) : null;
    const sd = (arr) => { if (!arr || arr.length < 8) return null; const m = arr.reduce((a2, b2) => a2 + b2, 0) / arr.length;
      return Math.sqrt(arr.reduce((a2, b2) => a2 + (b2 - m) ** 2, 0) / arr.length); };
    out[tag] = {
      chestBandCm: tag === 'tshirt' ? +(mx(pct(0.67)) * cmU).toFixed(2) : null,
      hemBandCm: +(mx(pct(tag === 'tshirt' ? 0.565 : 0.37)) * cmU).toFixed(2),
      wrinkleSigmaMm_mid: (() => { const arr = pct(0.62); return arr ? +(sd(arr) * cmU * 10).toFixed(2) : null; })(),
    };
  }
  return { sil: out, spec: st.gradedOffsetsMm };
})()`);
const so: any = (sil as any)?.sil ?? {};
const chestCm = so.tshirt?.chestBandCm ?? 0, hemCm = so.tshirt?.hemBandCm ?? 0;
step('FIX3 chest silhouette +9→~+13 mm (≤ +15 mm anti-armour incl. pleats)',
  chestCm >= 0.9 && chestCm <= 1.5, { chestCm, v6: 0.9, wrinkleSigmaMm: so.tshirt?.wrinkleSigmaMm_mid });
step('FIX3 hem stand-off grown (v6 lip ~2.2 cm → v7 ≥ 3.5 cm)',
  hemCm >= 3.5, { shirtHemLipCm: hemCm, shortsHemCm: so.shorts?.hemBandCm });
step('FIX3 wrinkle present (radial σ > 0.8 mm — smooth baseline ≈ 0.2)',
  (so.tshirt?.wrinkleSigmaMm_mid ?? 0) > 0.8, { sigmaMm: so.tshirt?.wrinkleSigmaMm_mid });

// ═══ the full v6-style probe (76 cases) ════════════════════════════════════
console.log('… running the full-case probe (this takes a while)');
const verify = await ev('window.__atelier.runVerify()');
if (!verify || (verify as any).__exc) {
  step('full-case probe', false, (verify as any)?.__exc ?? 'no result');
} else {
  step('full-case probe ran (16 clips × 4 + 4 poses × 3)', (verify as any).rows.length === 76, { cases: (verify as any).rows.length });
  step('inside-body verts = 0 across all cases', (verify as any).insideVerts === 0,
    { inside: (verify as any).insideVerts, worstCm: (verify as any).insideWorstCm, excused: (verify as any).limbCrossVerts });
  step('attachment/coverage bars', (verify as any).attachPass, { globalMaxCm: (verify as any).globalMaxCm });
  step('edge strain', (verify as any).stretchPass, { maxStretchCm: (verify as any).globalStretchCm });
  const worstDelta = Math.max(...(verify as any).rows.map((r: any) => r.deltaCm));
  step('Δsource < 2.5 cm (v7 bar — lips ~55% longer; vs CONSTRUCTED offsets, pleats included)', worstDelta < 2.5, { worstDeltaCm: +worstDelta.toFixed(2), v6bar: 2.0 });
  const worstStrain = Math.max(...(verify as any).rows.map((r: any) => r.strainExcessCm));
  step('strain−body ≤ 1.2 cm', worstStrain <= 1.2, { worstStrainExcessCm: +worstStrain.toFixed(2) });
  step('anti-armour silhouette: chest ≤ +1.5 cm per side (geometric grade + pleat crest)', (verify as any).bulk?.pass !== false && (verify as any).bulk?.excessTorsoCm <= 1.5,
    { shirtCm: (verify as any).bulk?.shirtCm, torsoCm: (verify as any).bulk?.torsoCm, excessTorsoCm: (verify as any).bulk?.excessTorsoCm });
  step('hem regularity (no torn ends)', (verify as any).hem?.pass !== false,
    ((verify as any).hem?.openings ?? []).map((o: any) => `${o.name}:${o.angVar}/${+o.edgeStdPx.toFixed(1)}px`));
  step('frog head tracks the walk clip', (verify as any).head?.pass !== false,
    ((verify as any).head?.frames ?? []).map((f: any) => `g${f.greenPx}/e${f.eyePx}`));
  step('FIX4 pose motion (probe-internal sweep ≥ 4 cm each + idle sway)',
    (verify as any).poseMotionPass === true, (verify as any).poseMotion);
}

// deferred-selection-during-verify honoured?
const deferred = await ev(`(async () => {
  const A = window.__atelier;
  A.setAnim('idle'); await new Promise((r) => setTimeout(r, 300));
  const run = A.runVerify();          // no await — runs in background
  await new Promise((r) => setTimeout(r, 600));
  A.setAnim('squat');                 // mid-probe selection
  const stashed = A.state.pendingAnim;
  await run;                          // probe finishes → finally restores
  await new Promise((r) => setTimeout(r, 400));
  const out = { stashed, animIdAfter: A.state.animId, pendingCleared: A.state.pendingAnim == null };
  await A.setAnim('idle');
  return out;
})()`);
step('FIX4 selection during verify is honoured (not silently discarded)',
  (deferred as any)?.stashed === 'squat' && (deferred as any)?.animIdAfter === 'squat', deferred);

// region checks at walk 50%
const walkRegions = await ev(`(async () => {
  const A = window.__atelier;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(A.avatar, res);
  p.time = p.duration * 0.5; p.update(0);
  A.avatar.root.updateMatrixWorld(true);
  const r = A.regionChecks();
  p.stop();
  return r;
})()`);
const walkGate = ((walkRegions as any)?.regions ?? []).filter((r: any) => !r.name.includes('sole'));
step('region checks @ walk 50%', !!walkRegions && (walkRegions as any).__exc === undefined && walkGate.every((r: any) => r.pass),
  (walkRegions as any)?.__exc ?? walkGate.map((r: any) => `${r.name}:${r.share}%${r.pass ? '' : '✗'}`));

// idle silence
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false); window.__atelier.homeCam()');
await new Promise((r) => setTimeout(r, 1600));
const perf = await ev('window.__atelier.perfProbe(2000)');
step('idle rAF = 0', (perf as any)?.rafCallbacks === 0 && (perf as any)?.renders === 0, perf);

// instruments alive + v7 offsets wired
const instr = await ev(`(async () => {
  const A = window.__atelier; const out = {};
  try {
    A.setXray(true); out.xray = A.outfit.softGarments[0].material.transparent === true; A.setXray(false);
    A.setHeat(true); out.heat = A.outfit.softGarments[0].material.vertexColors === true; A.setHeat(false);
    out.heatTintRestored = Array.from(A.outfit.softGarments[0].geometry.attributes.color.array).some((v) => v < 0.99);
    A.setBuildStep(3); out.buildStep = A.state.buildStep === 3;
    A.isolate('shorts'); out.iso = A.outfit.slots.tshirt[0].visible === false; A.isolate(null); A.setBuildStep(6);
    const snap = A.snapshot(); out.png = typeof snap === 'string' && snap.startsWith('data:image/png');
    out.offsets = A.derivedStats().gradedOffsetsMm;
    out.bandUntinted = A.outfit.derived.meshes[2].userData.baseColors.every((v) => v === 1);
    A.setAnim('idle');
  } catch (e) { out.err = String(e); }
  return out;
})()`);
const o7 = (instr as any)?.offsets ?? {};
step('instruments alive + v7 offsets wired',
  !(instr as any)?.err && (instr as any)?.xray && (instr as any)?.heat && (instr as any)?.heatTintRestored
  && (instr as any)?.buildStep && (instr as any)?.iso && (instr as any)?.png && (instr as any)?.bandUntinted
  && o7.shirt?.hemMm === 18 && o7.shorts?.hemMm === 16 && o7.band?.topMm === 12, instr);

step('zero console errors', errors.length === 0, errors.slice(0, 3));

const failed = results.steps.filter((s: any) => !s.pass);
console.log(`\n${results.steps.length - failed.length}/${results.steps.length} checks pass`);
if (failed.length) console.log('FAILED:', failed.map((s: any) => s.name).join(' · '));
await send('Browser.close', {}).catch(() => {});
process.exit(failed.length ? 1 : 0);
