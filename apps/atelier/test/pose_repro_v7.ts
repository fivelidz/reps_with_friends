// POSES REGRESSION REPRO (FIX 4 investigation) — do the exercise poses animate?
// Measures per-pose bone world-position deltas over a full cycle, the UI path
// (setAnim → tick loop), and clip→pose→clip round trips. Captures console errors.
// Usage: bun apps/atelier/test/pose_repro_v7.ts
const PORT = 9541;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-pose-repro', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 300));
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
await new Promise((r) => setTimeout(r, 800));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

// ── 1. DIRECT pose() sweep: max bone world-position delta over a cycle ──────
const direct = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const names = Object.keys(B).filter((k) => B[k]);
  const out = {};
  for (const pose of ['stand', 'squat', 'pushup', 'jumpingjack', 'curl']) {
    const ref = new Map(); let maxD = 0, argmax = '';
    try {
      for (let k = 0; k <= 16; k++) {
        const p = k / 16;
        av.pose(pose, p);
        av.root.updateMatrixWorld(true);
        if (k === 0) { for (const n of names) ref.set(n, B[n].getWorldPosition(new THREE.Vector3()).clone()); continue; }
        const v = new THREE.Vector3();
        for (const n of names) {
          const d = B[n].getWorldPosition(v).distanceTo(ref.get(n));
          if (d > maxD) { maxD = d; argmax = n; }
        }
      }
      out[pose] = { maxUnits: +maxD.toFixed(4), argmax };
    } catch (e) { out[pose] = { error: String(e).slice(0, 200) }; }
  }
  return out;
})()`);
console.log('DIRECT pose() sweep (world units; avatar scaled 1.6/1.96, 0.1 units ≈ 11 cm on a 1.75 m human):');
console.log(JSON.stringify(direct, null, 1));

// ── 2. UI path: setAnim('squat') then sample bones across advancing t ───────
const uiPath = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const probe = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); const o = {};
    for (const n of ['hips', 'head', 'armL', 'foreL', 'handL', 'upLegL', 'footL', 'spine2'])
      if (B[n]) o[n] = +B[n].getWorldPosition(v).divideScalar(av.root.scale.x).y.toFixed(4);
    return o; };
  const res = {};
  A.setTurntable(false); A.play();
  for (const id of ['squat', 'pushup', 'jumpingjack', 'curl', 'idle']) {
    await A.setAnim(id);
    await new Promise((r) => setTimeout(r, 350));   // let the tick loop run
    const s0 = probe(); const t0 = A.state.t;
    await new Promise((r) => setTimeout(r, 600));
    const s1 = probe(); const t1 = A.state.t;
    let moved = 0, arg = '';
    for (const k in s0) { const d = Math.abs(s1[k] - s0[k]); if (d > moved) { moved = d; arg = k; } }
    res[id] = { tAdvanced: +(t1 - t0).toFixed(3), maxDyUnits: +moved.toFixed(4), arg };
  }
  return res;
})()`);
console.log('UI path (setAnim + live tick, Δy over 0.6 s @1×):');
console.log(JSON.stringify(uiPath, null, 1));

// ── 3. ROUND TRIP: clip → pose → clip → pose ────────────────────────────────
const roundtrip = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const probe = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); const o = {};
    for (const n of ['hips', 'head', 'armL', 'foreL', 'upLegL'])
      if (B[n]) o[n] = B[n].getWorldPosition(v).divideScalar(av.root.scale.x).toArray().map((x) => +x.toFixed(3));
    return o; };
  const out = {};
  await A.setAnim('clip:walk'); await new Promise((r) => setTimeout(r, 700));
  out.afterWalk = probe();
  await A.setAnim('squat'); await new Promise((r) => setTimeout(r, 500));
  out.afterSquatA = probe();
  await new Promise((r) => setTimeout(r, 700));
  out.afterSquatB = probe();          // if the pose animates, A ≠ B
  await A.setAnim('clip:run'); await new Promise((r) => setTimeout(r, 700));
  out.afterRun = probe();
  await A.setAnim('jumpingjack'); await new Promise((r) => setTimeout(r, 500));
  out.afterJackA = probe();
  await new Promise((r) => setTimeout(r, 700));
  out.afterJackB = probe();
  await A.setAnim('idle');
  return out;
})()`);
console.log('ROUND TRIP bone snapshots (hip/head/arm positions):');
console.log(JSON.stringify(roundtrip, null, 1));

console.log('console errors:', errors.length, errors.slice(0, 5));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
