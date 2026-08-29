// apps/avatars/test/fullkit_verify.ts — GEOMETRIC-ATTACHMENT VERIFICATION for
// the Full Kit card (and the dressed wardrobe card): every wardrobe mesh,
// per frame, max world-space distance from the body's skinned surface (cm at
// human scale). Covers all 5 BVH clips × phases + the 4 exercise poses.
// Bar: garments ≤ ~5 cm (protrusions BY DESIGN — crown/eyes, shoe toe box,
// skull-engulfing headband — are listed but exempt).
// Usage: bun apps/avatars/test/fullkit_verify.ts
const PORT = 9471;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fkverify-prof', '--no-first-run', '--no-sandbox',
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
const errs: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
      errs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160));
    if (m.method === 'Runtime.exceptionThrown')
      errs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 160));
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
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`);
await send('Runtime.evaluate', {
  expression: `import('/site/lib/three.module.js').then(m => { window.__T = m; return true; })`,
  returnByValue: true, awaitPromise: true,
}, sessionId);

// measure(idx, mode, name): mode = {clip:'walk'} | {pose:'squat'} …
const MEASURE = (idx: number, setup: string) => `
(async () => {
  const e = window.__rwfModels[${idx}];
  const av = e.avatar, THREE = window.__T;
  ${setup}
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
      const d2 = dx*dx+dy*dy+dz*dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
  const tagOf = (o) => { let n = o; while (n) { if (n.userData?.rwfWardrobe) return n.userData.rwfWardrobe; n = n.parent; } return null; };
  const agg = {};
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position || !o.visible) return;
    const tag = tagOf(o);
    if (!tag) return;
    const gp = o.geometry.attributes.position;
    const st = Math.max(1, Math.floor(gp.count / 220));
    let mx = 0;
    for (let i = 0; i < gp.count; i += st) {
      v.fromBufferAttribute(gp, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      const d = minD(v.x, v.y, v.z);
      if (d > mx) mx = d;
    }
    if (!agg[tag] || mx > agg[tag]) agg[tag] = mx;
  });
  const out = {};
  for (const k of Object.keys(agg)) out[k] = +(agg[k] * cm).toFixed(1);
  return out;
})()`;

const startClip = (name: string) => `
  if (e.bvh) e.bvh.stop();
  e.bvh = null; e.exercise = null;
  const res = await loadBVHsafe('${name}');
  if (!res) return { err: 'load ${name}' };
  e.bvh = new BVHPlayer(av, res);
`;
const clipSetup = (name: string, frac: number) => `
  { const res = await loadBVHsafe('${name}');
    if (e.bvh) e.bvh.stop();
    e.bvh = new BVHPlayer(av, res);
    e.bvh.time = ${frac} * e.bvh.duration;
    e.bvh.update(0.016); }
`;
const poseSetup = (pose: string, ph: number) => `
  { if (e.bvh) { e.bvh.stop(); e.bvh = null; }
    av.pose('${pose}', ${ph}); }
`;

// helpers injected once
await send('Runtime.evaluate', {
  expression: `window.loadBVHsafe = async (name) => {
    const m = await import('/site/model-avatars.js');
    window.BVHPlayer = m.BVHPlayer;
    const key = m.BVH_FILES[name] ?? name;
    try { return await m.loadBVH(key); } catch { return null; }
  }; true`, returnByValue: true, awaitPromise: true,
}, sessionId);

const idxOf = async (re: RegExp) => {
  const r = await send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => ${re}.test(h.textContent))`,
    returnByValue: true,
  }, sessionId);
  return r.result.result.value as number;
};
const IDX_FULLKIT = await idxOf(/Full Kit/);
const IDX_WARDROBE = await idxOf(/Wardrobe — dressed/);
console.log(`fullkit=${IDX_FULLKIT} wardrobe=${IDX_WARDROBE}`);

const EXEMPT = ['head:frog', 'headband', 'sneakers']; // protrusions by design
const report: any = { fullkit: {}, wardrobe: {} };
const FAILS: string[] = [];

for (const [label, idx] of [['fullkit', IDX_FULLKIT], ['wardrobe', IDX_WARDROBE]] as [string, number][]) {
  if (idx < 0) continue;
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('#modelGrid .style-card--model')[${idx}].scrollIntoView({ block: 'center' }); true`,
    returnByValue: true,
  }, sessionId);
  await waitFor(`!!(window.__rwfModels[${idx}] && window.__rwfModels[${idx}].avatar && window.__rwfModels[${idx}].renderer)`, 60000);
  // trigger BVH infra (loads libs + first clip)
  await send('Runtime.evaluate', { expression: clipSetup('walk', 0.1), returnByValue: true, awaitPromise: true }, sessionId);
  const cases: Array<[string, string]> = [];
  for (const clip of ['walk', 'limp', 'drag', 'one_arm', 'combat'])
    for (const frac of [0.12, 0.37, 0.62, 0.87])
      cases.push([`${clip}@${frac}`, clipSetup(clip, frac)]);
  for (const pose of ['squat', 'pushup', 'jumpingjack', 'curl'])
    for (const ph of [0.25, 0.5, 0.75])
      cases.push([`${pose}@${ph}`, poseSetup(pose, ph)]);
  const worst: Record<string, number> = {};
  for (const [name, setup] of cases) {
    const r = await send('Runtime.evaluate', {
      expression: MEASURE(idx, setup), returnByValue: true, awaitPromise: true,
    }, sessionId);
    const v = r.result.result.value;
    if (!v || v.err || Object.keys(v).length === 0) { FAILS.push(`${label} ${name}: ${v?.err ?? JSON.stringify(v)?.slice(0,80) ?? 'no result'}`); continue; }
    for (const [slot, d] of Object.entries(v)) {
      const dnum = d as number;
      if (!worst[slot] || dnum > worst[slot]) worst[slot] = dnum;
      if (!EXEMPT.includes(slot) && dnum > 5.5)
        FAILS.push(`${label} ${name}: ${slot} ${dnum}cm`);
    }
  }
  report[label] = worst;
  console.log(`\n${label} worst per slot (cm at human scale):`);
  for (const [slot, d] of Object.entries(worst).sort((a, b) => b[1] - a[1]))
    console.log(`  ${slot.padEnd(14)} ${String(d).padStart(5)}${EXEMPT.includes(slot) ? '  (by design)' : d > 5 ? '  ⚠' : ''}`);
}

// screenshots for founder review: fullkit walk at 3 phases
await send('Runtime.evaluate', { expression: `document.querySelectorAll('#modelGrid .style-card--model')[${IDX_FULLKIT}].scrollIntoView({ block: 'center' }); true`, returnByValue: true }, sessionId);
for (const [i, frac] of [0.12, 0.5, 0.8].entries()) {
  await send('Runtime.evaluate', { expression: clipSetup('walk', frac), returnByValue: true, awaitPromise: true }, sessionId);
  await new Promise(r => setTimeout(r, 400));
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`/tmp/fullkit_fixed_walk${i}.png`, Buffer.from(shot.result.data, 'base64'));
}
console.log('\nscreenshots: /tmp/fullkit_fixed_walk{0,1,2}.png');
console.log(`\nconsole errors/warnings: ${errs.length}`);
for (const e of errs.slice(0, 10)) console.log('  ' + e);
console.log(`\nFAILS (>5.5cm non-exempt): ${FAILS.length}`);
for (const f of FAILS.slice(0, 30)) console.log('  ' + f);
await Bun.write('/tmp/fullkit_verify_results.json', JSON.stringify({ report, fails: FAILS, consoleErrs: errs }, null, 2));
ws.close(); process.exit(FAILS.length ? 1 : 0);
