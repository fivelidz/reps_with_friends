// RACE TEST v2 (no network interception): select clip + pose in the SAME JS
// task — the clip's awaited fetch is guaranteed to resolve later, so its
// BVHPlayer construction + update(0) land on top of the already-selected pose.
// Usage: bun apps/atelier/test/pose_race_v7.ts
const PORT = 9545;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-pose-race2', '--no-first-run', '--no-sandbox',
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

const out = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const snap = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); return {
    hipsY: +av.bones.hips.getWorldPosition(v).y.toFixed(4),
    headY: +av.bones.head.getWorldPosition(v).y.toFixed(4),
    handY: +av.bones.handL.getWorldPosition(v).y.toFixed(4),
    yaw: +av.root.rotation.y.toFixed(3) }; };
  A.setTurntable(false); A.play();
  // THE RACE: clip selection starts (async), pose selection lands first
  const p1 = A.setAnim('clip:walk');
  A.setAnim('squat');          // synchronous — state now 'squat', pose playing
  const duringSquat = snap();
  await p1;                    // let the clip's await resolve + BVHPlayer land
  await new Promise((r) => setTimeout(r, 300));
  const afterLateClip = snap();
  // is the squat still animating after the late clip landed?
  const a = snap();
  await new Promise((r) => setTimeout(r, 600));
  const b = snap();
  const moving = Math.abs(b.headY - a.headY) + Math.abs(b.hipsY - a.hipsY);
  // do non-mapped bones (Spine3/Neck1 — outside the 24-bone map) hold the clip pose?
  const sp3 = av.prone.children[0].getObjectByName('Spine3');
  return { duringSquat, afterLateClip, squatStillMoving: +moving.toFixed(4),
           animId: A.state.animId,
           spine3Quat: sp3 ? sp3.quaternion.toArray().map((q) => +q.toFixed(3)) : null };
})()`);
console.log('RACE RESULT:', JSON.stringify(out, null, 1));

// recovery check: after the race, does selecting a pose work?
const recover = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  await A.setAnim('squat');
  await new Promise((r) => setTimeout(r, 400));
  av.root.updateMatrixWorld(true); const v = new THREE.Vector3();
  const a = +av.bones.head.getWorldPosition(v).y.toFixed(4);
  await new Promise((r) => setTimeout(r, 600));
  av.root.updateMatrixWorld(true);
  const b = +av.bones.head.getWorldPosition(v).y.toFixed(4);
  return { headMoves: Math.abs(b - a) > 0.02, dHead: +(b - a).toFixed(4), yaw: +av.root.rotation.y.toFixed(3) };
})()`);
console.log('RECOVERY after race (re-select squat):', JSON.stringify(recover));
console.log('console errors:', errors.length, errors.slice(0, 4));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
