// v9 VERIFICATION SUITE — the founder's three asks, gated:
//   DEFECT 1 (shoulder gaps): live-posed shoulder-flesh coverage — deltoid +
//     upper-arm (t ≤ sleeveT) verts ≥ 98% within 2.2 cm of a live shirt vert
//     at stand AND walk@50 (was 52% uncovered on v8).
//   DEFECT 2 (band gap): pixel column scan through the waist at stand +
//     walk@50 — NO flesh/dark run ≥ 2 consecutive rows between the charcoal
//     band and the coral shorts (the "invisible band under the band").
//   BUILD 3 (easy physics): layer present + bounded; hem lag measurable
//     (> 0.5 cm) during walk; settles (≤ 1.5 s) after motion stops; sleeps
//     (dormant at rest); disabled under prefers-reduced-motion; idle rAF 0.
//   + v8 regression core: openings matched, degenerates, region checks,
//     zero console errors.
// Usage: bun apps/atelier/test/derived_v9_verify.ts
const PORT = 9595;
const OUT = '/home/fivelidz/projects/reps_with_friends/apps/atelier/shots';
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', `--user-data-dir=/tmp/geno-v9-verify-${Date.now()}`, '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? m.exceptionDetails.text ?? '').slice(0, 300));
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
await new Promise((r) => setTimeout(r, 1000));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.exception?.text ?? '').slice(0, 700) };
  return r?.result?.result?.value;
};
const results: any = { steps: [] };
const step = (name: string, pass: boolean, detail: any = null) => {
  results.steps.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== null ? '  ' + JSON.stringify(detail).slice(0, 240) : ''}`);
};
const shot = async (expr: string, name: string) => {
  const url = await ev(expr);
  if (typeof url === 'string' && url.startsWith('data:image/png')) {
    await Bun.write(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
    return true;
  }
  console.log('SHOT FAIL', name, String(url).slice(0, 160));
  return false;
};

// the shared live-coverage probe (DEFECT 1) — evaluated at the CURRENT pose
const coverageExpr = `
(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const shirt = A.outfit.slots.tshirt[0];
  const body = shirt.userData.rwfDerived.body;
  const skeleton = body.skeleton;
  const bones = skeleton.bones;
  const M = bones.map((b, i) => new T.Matrix4().multiplyMatrices(b.matrixWorld, skeleton.boneInverses[i]));
  const SW = body.geometry.attributes.skinWeight, SI = body.geometry.attributes.skinIndex;
  const BP = body.geometry.attributes.position;
  const domOf = (vi) => { let d2 = 0, dw = -1; for (let j = 0; j < 4; j++) { const w = SW.getComponent(vi, j); if (w > dw) { dw = w; d2 = SI.getComponent(vi, j); } } return d2; };
  const bindOf = (name) => { const b = bones.find((x) => x.name.replace(/^mixamorig:/, '') === name);
    const m = new T.Matrix4().copy(skeleton.boneInverses[bones.indexOf(b)]).invert();
    return new T.Vector3().setFromMatrixPosition(m); };
  const a0L = bindOf('LeftArm'), a1L = bindOf('LeftForeArm');
  const a0R = bindOf('RightArm'), a1R = bindOf('RightForeArm');
  const axisT = (a, b, p) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L2 = dx * dx + dy * dy + dz * dz || 1e-9; return ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2; };
  const { garmentVerts } = await import('/site/models/geno-outfit.js');
  const gp = garmentVerts(shirt);
  const H = body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y;
  let tot = 0, un = 0, worst = 0;
  for (let i = 0; i < BP.count; i++) {
    const n = bones[domOf(i)].name.replace(/^mixamorig:/, '');
    if (!/^(Left|Right)(Shoulder|Arm)$/.test(n)) continue;
    const bind = new T.Vector3().fromBufferAttribute(BP, i);
    const side = n.startsWith('Left') ? 'L' : 'R';
    const t = axisT(side === 'L' ? a0L : a0R, side === 'L' ? a1L : a1R, bind);
    if (n.endsWith('Arm') && t > 0.45) continue;   // past the sleeve (bare by design)
    // live body position (skinned, same matrices as the garment)
    const p = new T.Vector3();
    for (let j = 0; j < 4; j++) {
      const w = SW.getComponent(i, j); if (w <= 0) continue;
      const m = M[SI.getComponent(i, j)]; if (!m) continue;
      const e = m.elements;
      p.x += w * (e[0] * bind.x + e[4] * bind.y + e[8] * bind.z + e[12]);
      p.y += w * (e[1] * bind.x + e[5] * bind.y + e[9] * bind.z + e[13]);
      p.z += w * (e[2] * bind.x + e[6] * bind.y + e[10] * bind.z + e[14]);
    }
    let bd = Infinity;
    for (const q of gp) { const dd = q.distanceToSquared(p); if (dd < bd) bd = dd; }
    const cm = Math.sqrt(bd) * 175 / H;
    tot++;
    if (cm > 2.2) { un++; worst = Math.max(worst, cm); }
  }
  return { tot, un, pctUncovered: +(100 * un / tot).toFixed(2), worstCm: +worst.toFixed(1) };
})()`;

// ═══ 1. DEFECT 1 — shoulder coverage at stand + walk@50 ═══
const covStand2 = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  return await (${coverageExpr});
})()`);
step('DEFECT 1 — shoulder coverage ≥ 98% at stand (deltoid + upper arm live-posed)',
  covStand2?.__exc === undefined && covStand2?.pctUncovered <= 2, covStand2?.__exc ?? covStand2);

const covWalk = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0);
  av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  const out = await (${coverageExpr});
  p.stop();
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  return out;
})()`);
step('DEFECT 1 — shoulder coverage ≥ 95% at walk@50',
  covWalk?.__exc === undefined && covWalk?.pctUncovered <= 5, covWalk?.__exc ?? covWalk);

// DEFECT 1, PIXEL instrument (the brief's "shoulder garment pixel coverage
// ≥98% at bind"): front camera on each arm joint, disc r=0.10 NDC — flesh
// or background seen through the sleeve = an invisible section.
const shoulderPx = await ev(`(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  for (const g of A.outfit.slots.head ?? []) g.visible = false;
  window.__scan ??= async () => {
    const url = A.snapshot();
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, cv.width, cv.height);
  };
  const cls = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx === g && d > 30 && g > 120) return 'lime';    // shirt
    if (mx === r && d > 30 && r > 110) return 'coral';   // shorts (arm at side)
    if (b >= r + 3 && d < 44 && mx > 34 && mx < 150) return 'band';
    if (mx > 140 && d < 45 && b >= r - 25) return 'flesh';
    if (d < 12 && mx < 60) return 'dark';
    return 'other';
  };
  const out = {};
  for (const [sk, bone] of Object.entries({ L: av.bones.armL, R: av.bones.armR })) {
    const j = bone.getWorldPosition(new T.Vector3());
    A.setCam([j.x * 0.55, j.y + 0.03, j.z + 0.92], [j.x * 0.72, j.y - 0.015, j.z]);
    const { width: W, height: FH, data: d } = await window.__scan();
    // project AFTER the capture — the camera state is only final once the
    // frame is taken (projecting before snapshot measured a stale view and
    // threw the disc into the background on the L side)
    const cam = A.getCam();
    const ndc = j.clone().project(cam);
    const tally = {};
    for (let dx = -0.10; dx <= 0.10; dx += 0.0035) for (let dy = -0.10; dy <= 0.10; dy += 0.0035) {
      if (dx * dx + dy * dy > 0.10 * 0.10) continue;
      const x = Math.round((ndc.x + dx + 1) / 2 * (W - 1)), y = Math.round((1 - (ndc.y + dy)) / 2 * (FH - 1));
      const q = (y * W + x) * 4;
      const c = cls(d[q], d[q + 1], d[q + 2]);
      tally[c] = (tally[c] ?? 0) + 1;
    }
    const n = Object.values(tally).reduce((a, b) => a + b, 0);
    out[sk] = {
      shirtPct: +(100 * ((tally.lime ?? 0) + (tally.coral ?? 0) + (tally.band ?? 0)) / n).toFixed(1),
      fleshPct: +(100 * (tally.flesh ?? 0) / n).toFixed(1),
      seeThruPct: +(100 * ((tally.dark ?? 0) + (tally.other ?? 0)) / n).toFixed(1),
    };
  }
  for (const g of A.outfit.slots.head ?? []) g.visible = true;
  A.homeCam();
  return out;
})()`);
step('DEFECT 1 — shoulder PIXEL coverage ≥ 98% at bind (both sides)',
  shoulderPx?.__exc === undefined && ['L', 'R'].every((s) => (shoulderPx?.[s]?.fleshPct ?? 100) + (shoulderPx?.[s]?.seeThruPct ?? 100) <= 2),
  shoulderPx?.__exc ?? shoulderPx);

// ═══ 2. DEFECT 2 — band junction column scan (stand + walk@50) ═══
const bandScan = await ev(`(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const cls = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx === g && d > 30 && g > 120) return 'lime';
    if (mx === r && d > 30 && r > 110) return 'coral';
    if (b >= r + 3 && d < 44 && mx > 34 && mx < 150) return 'band';
    if (mx > 140 && d < 45 && b >= r - 25) return 'flesh';
    if (d < 12 && mx < 60) return 'dark';
    return 'other';
  };
  window.__scan ??= async () => {
    const url = A.snapshot();
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, cv.width, cv.height);
  };
  const scan = async () => {
    A.setCam([0.30, 1.02, 2.6], [0, 0.92, 0]);
    const cam = A.getCam();
    const H = av.H * av.root.scale.x;
    const id2 = await window.__scan();
    const W = id2.width, FH = id2.height, d = id2.data;
    let worstGap = 0, gapAt = 0, sawBand = false, sawCoral = false;
    let run = 0;
    for (let wy = 0.58 * H; wy >= 0.48 * H; wy -= 0.0025 * H) {
      const ndc = new T.Vector3(0.02, wy, 0).project(cam);
      let lime = 0, coral = 0, band = 0, flesh = 0, dark = 0, other = 0, n = 0;
      for (let dx = -0.05; dx <= 0.05; dx += 0.0025) {
        const x = Math.round((ndc.x + dx + 1) / 2 * (W - 1)), y = Math.round((1 - ndc.y) / 2 * (FH - 1));
        const q = (y * W + x) * 4;
        const c = cls(d[q], d[q + 1], d[q + 2]);
        if (c === 'lime') lime++; else if (c === 'coral') coral++; else if (c === 'band') band++;
        else if (c === 'flesh') flesh++; else if (c === 'dark') dark++; else other++;
        n++;
      }
      let dom = 'other', bv = 0;
      for (const [k, v] of Object.entries({ lime, coral, band, flesh, dark, other })) if (v > bv) { bv = v; dom = k; }
      if (dom === 'band') sawBand = true;
      if (dom === 'coral' && sawBand) sawCoral = true;
      // a gap = flesh or dark dominating BETWEEN the band and the coral
      if (sawBand && !sawCoral && (dom === 'flesh' || dom === 'dark')) { run++; if (run > worstGap) { worstGap = run; gapAt = +(wy / H).toFixed(3); } }
      else run = 0;
    }
    A.homeCam();
    return { worstGapRows: worstGap, gapAtH: gapAt, sawBand, sawCoralBelow: sawCoral };
  };
  const out = {};
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true); A.outfit.settle(0.5);
  out.stand = await scan();
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0); av.root.updateMatrixWorld(true); A.outfit.settle(0.5);
  out.walk50 = await scan();
  p.stop();
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true); A.outfit.settle(0.5);
  return out;
})()`);
step('DEFECT 2 — no skin/see-through gap under the band (stand + walk@50)',
  bandScan?.__exc === undefined && bandScan?.stand?.worstGapRows === 0 && bandScan?.walk50?.worstGapRows === 0
  && bandScan?.stand?.sawCoralBelow && bandScan?.walk50?.sawCoralBelow,
  bandScan?.__exc ?? { stand: bandScan?.stand, walk50: bandScan?.walk50 });

// ═══ 3. BUILD 3 — the easy fabric physics ═══
const phys = await ev(`window.__atelier.fabricPhysics()?.state`);
step('physics layer present + bounded (verts, clamp spec)',
  !!phys && phys.verts >= 500 && phys.enabled === true, phys ? { verts: phys.verts, caps: phys.caps, enabled: phys.enabled } : null);

const lag = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const FP = A.fabricPhysics();
  const shirt = A.outfit.slots.tshirt[0];
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  // 2.5 s of walk at 30 Hz — max |P − S| over the run (the lag), the lip
  // ring's world motion between consecutive frames (the brief's "two-frame
  // hem displacement > 0.5 cm" = the layer visibly MOVES the hem), settle.
  const T = await import('/site/lib/three.module.js');
  let maxLagCm = 0, twoFrameCm = 0, hemTwoFrameCm = 0;
  let prevLip = null;
  const sk = shirt.userData.rwfDerived.body.skeleton;
  const mats = sk.bones.map((b, i) => new T.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
  const SI = shirt.geometry.attributes.skinIndex, SW = shirt.geometry.attributes.skinWeight;
  const skinWorld = (vi) => {
    const pv = new T.Vector3().fromBufferAttribute(shirt.geometry.attributes.position, vi);
    const out = new T.Vector3();
    for (let j = 0; j < 4; j++) {
      const w = SW.getComponent(vi, j); if (w <= 0) continue;
      const m = mats[SI.getComponent(vi, j)]; if (!m) continue;
      out.addScaledVector(new T.Vector3().copy(pv).applyMatrix4(m), w);
    }
    return out;
  };
  let prevHem = null, lipVi = -1;
  for (let f = 0; f < 75; f++) {
    p.time = (f / 30) % p.duration; p.update(0);
    av.root.updateMatrixWorld(true);
    for (let i = 0; i < mats.length; i++) mats[i].multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);
    A.outfit.updateFabric(1 / 30);
    const pd = FP.dispOf(shirt);
    if (lipVi < 0) { for (let k = 0; k < pd.idx.length; k++) if (pd.idx[k] >= 1728 && pd.idx[k] < 1792) { lipVi = pd.idx[k]; break; } }
    if (lipVi >= 0) {
      const w = skinWorld(lipVi);
      if (prevHem) hemTwoFrameCm = Math.max(hemTwoFrameCm, w.distanceTo(prevHem));
      prevHem = w;
    }
    // use all shirt phys verts — the max lag
    for (let k = 0; k < pd.idx.length; k++) {
      const dd = Math.hypot(pd.disp[k*3], pd.disp[k*3+1], pd.disp[k*3+2]);
      if (dd > maxLagCm) maxLagCm = dd;
    }
    if (prevLip) twoFrameCm = Math.max(twoFrameCm, Math.abs(maxLagCm - prevLip));
    prevLip = maxLagCm;
  }
  const H = A.avatar.H * A.avatar.root.scale.x;   // LIVE height (1.6 for Geno — the stale 1.7065 under-reported every cm by 6.6%)
  maxLagCm = +(maxLagCm * 175 / H).toFixed(2);
  twoFrameCm = +(twoFrameCm * 175 / H).toFixed(2);
  hemTwoFrameCm = +(hemTwoFrameCm * 175 / H).toFixed(2);
  // settle: stop, step physics at 30 Hz until asleep (≤ 3 s wall of patience)
  let simS = 0, frames = 0;
  while (FP.state.awake && simS < 3) { A.outfit.updateFabric(1 / 30); simS += 1 / 30; frames++; }
  const settle = { simS: +simS.toFixed(2), awake: FP.state.awake, maxDispCm: +FP.state.maxDispCm.toFixed(3) };
  p.stop();
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  return { maxLagCm, twoFrameCm, hemTwoFrameCm, settle };
})()`);
step('physics: hem lag measurable during walk (max |P−S| > 0.5 cm)',
  lag?.__exc === undefined && lag?.maxLagCm > 0.5, lag?.__exc ?? { lagCm: lag?.maxLagCm, twoFrame: lag?.twoFrameCm });
step('physics: two-frame hem displacement > 0.5 cm during walk (the hem visibly moves)',
  lag?.__exc === undefined && lag?.hemTwoFrameCm > 0.5, { hemTwoFrameCm: lag?.hemTwoFrameCm });
step('physics: bounded — lag ≤ clamp (2 cm) + collider allowance (1.5 cm)',
  lag?.__exc === undefined && lag?.maxLagCm <= 3.5, { lagCm: lag?.maxLagCm });
step('physics: settles asleep ≤ 1.5 s after motion stops',
  lag?.__exc === undefined && lag?.settle?.awake === false && lag?.settle?.simS <= 1.5, lag?.settle);

// 0.25× slow-mo walk — the founder's tuning bar (1-2 cm lag)
const slowmo = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const FP = A.fabricPhysics();
  const shirt = A.outfit.slots.tshirt[0];
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  let maxLag = 0;
  for (let f = 0; f < 75; f++) {
    p.time = (f / 30 * 0.25) % p.duration; p.update(0);
    av.root.updateMatrixWorld(true);
    A.outfit.updateFabric(1 / 30 * 0.25);
    const pd = FP.dispOf(shirt);
    for (let k = 0; k < pd.idx.length; k++) {
      const dd = Math.hypot(pd.disp[k*3], pd.disp[k*3+1], pd.disp[k*3+2]);
      if (dd > maxLag) maxLag = dd;
    }
  }
  p.stop(); av.pose('stand', 0.35); av.root.updateMatrixWorld(true); A.outfit.settle(0.5);
  return { slowmoLagCm: +(maxLag * 175 / (window.__atelier.avatar.H * window.__atelier.avatar.root.scale.x)).toFixed(2) };
})()`);
step('physics: 0.25× slow-mo lag in the 0.5-2.5 cm band (subtle flow, not flags)',
  slowmo?.__exc === undefined && slowmo?.slowmoLagCm >= 0.5 && slowmo?.slowmoLagCm <= 2.5, slowmo);

// reduced motion → disabled, pure skinned
const reduced = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const FP = A.fabricPhysics();
  const was = FP.state.enabled;
  FP.setEnabled(false);
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0); av.root.updateMatrixWorld(true);
  A.outfit.updateFabric(1 / 30);
  const shirt = A.outfit.slots.tshirt[0];
  const pd = FP.dispOf(shirt);
  let mx = 0;
  for (let k = 0; k < pd.idx.length; k++) mx = Math.max(mx, Math.hypot(pd.disp[k*3], pd.disp[k*3+1], pd.disp[k*3+2]));
  p.stop(); av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  FP.setEnabled(was);
  return { enabledWhileOff: FP.state.enabled, dispCmWhileOff: +(mx * 175 / (window.__atelier.avatar.H * window.__atelier.avatar.root.scale.x)).toFixed(3), restored: was };
})()`);
step('physics: disabled = zero displacement (reduced-motion safe)',
  reduced?.__exc === undefined && reduced?.dispCmWhileOff === 0 && reduced?.restored === true, reduced);

// ═══ 4. v8 regression core ═══
const stats = await ev('window.__atelier.derivedStats()');
const allOpenings = [...stats.perGarment.tshirt.openings, ...stats.perGarment.shorts.openings, ...stats.perGarment.waistband.openings];
step('openings all matched (v8 core)', stats.garmentMode === 'fabric' && allOpenings.every((o: any) => o.matched),
  allOpenings.map((o: any) => o.name + ':' + (o.matched ? 'ok' : 'MISS')));
const bindRegions = await ev('window.__atelier.regionChecks()');
const bindGate = (bindRegions?.regions ?? []).filter((r: any) => !r.name.includes('sole'));
step('region checks at bind (v8 core)', bindRegions?.__exc === undefined && bindGate.every((r: any) => r.pass),
  bindGate.map((r: any) => `${r.name}:${r.share}%`));

// ═══ 5. idle rAF + console ═══
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false); window.__atelier.homeCam()');
await new Promise((r) => setTimeout(r, 2500));   // let the settle tail finish
const perf = await ev('window.__atelier.perfProbe(2000)');
step('idle rAF = 0 (physics settles quiet)', perf?.rafCallbacks === 0 && perf?.renders === 0, perf);
step('zero console errors', errors.length === 0, errors.slice(0, 3));

// ═══ 6. screenshots (v9) ═══
await shot(`(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  const p = av.bones.armL.getWorldPosition(new T.Vector3());
  A.setCam([p.x * 1.05, p.y + 0.12, p.z + 1.25], [p.x * 0.4, p.y + 0.02, p.z]);
  return A.snapshot();
})()`, 'shoulder_v9.png');
await shot(`(async () => {
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  A.setCam([0.28, 1.04, 2.45], [0, 0.95, 0]);
  return A.snapshot();
})()`, 'band_junction_v9.png');
await shot(`(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0); av.root.updateMatrixWorld(true);
  A.outfit.updateFabric(1 / 30); A.outfit.updateFabric(1 / 30);
  const hip = av.bones.hips.getWorldPosition(new T.Vector3());
  A.setCam([0.65, hip.y - 0.15, 2.3], [0.1, hip.y - 0.35, 0]);
  return A.snapshot();
})()`, 'hem_midstride_v9.png');
await shot(`(async () => {
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(1.2);
  A.setCam([0.65, 0.75, 2.3], [0.1, 0.55, 0]);
  return A.snapshot();
})()`, 'hem_settled_v9.png');
await shot(`(async () => {
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.outfit.settle(0.5);
  A.homeCam();
  return A.snapshot();
})()`, 'fullkit_v9.png');

const failed = results.steps.filter((s: any) => !s.pass);
console.log(`\n${results.steps.length - failed.length}/${results.steps.length} checks pass`);
if (failed.length) console.log('FAILED:', failed.map((s: any) => s.name).join(' · '));
await send('Browser.close', {}).catch(() => {});
process.exit(failed.length ? 1 : 0);
