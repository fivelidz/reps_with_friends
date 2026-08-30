// v7 FINAL EVIDENCE — the task's exact FIX4 scenario through the REAL atelier
// UI path: select clip:walk, then squat — record hips height + knee angle per
// phase (squat must visibly drop hips & bend knees through the full range),
// then pushup/jumpingjack/curl, then back to a clip (walk).
const PORT = 9550;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v7-final', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(String(m.params.args.map((a: any) => a.value ?? '').join(' ')));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + String(m.params.exceptionDetails.exception?.description ?? '').slice(0, 200));
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
  if (r?.exceptionDetails) return { __exc: String(r.exceptionDetails.exception?.description ?? '').slice(0, 300) };
  return r?.result?.result?.value;
};

const out = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  A.setTurntable(false); A.pause();
  const w = new THREE.Vector3();
  const kneeAngleDeg = (side) => {
    const up = B['upLeg' + side].getWorldPosition(new THREE.Vector3());
    const lo = B['leg' + side].getWorldPosition(new THREE.Vector3());
    const ft = B['foot' + side].getWorldPosition(new THREE.Vector3());
    const a = lo.clone().sub(up).normalize(), b = ft.clone().sub(lo).normalize();
    return +(Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI).toFixed(0);
  };
  const snap = () => { av.root.updateMatrixWorld(true);
    return { hipsY: +B.hips.getWorldPosition(w).y.toFixed(3), kneeL: kneeAngleDeg('L'), kneeR: kneeAngleDeg('R'),
             headY: +B.head.getWorldPosition(w).y.toFixed(3) }; };
  // 1) walk clip FIRST (the regression scenario), then squat
  await A.setAnim('clip:walk'); await new Promise((r) => setTimeout(r, 700));
  const duringWalk = { hipsY: +B.hips.getWorldPosition(w).y.toFixed(3), kneeL: kneeAngleDeg('L') };
  await A.setAnim('squat');
  const sweep = {};
  for (const ph of [0, 0.25, 0.5, 0.75]) { av.pose('squat', ph); sweep['ph' + ph] = snap(); }
  // 2) the other three poses, one frame each (mid-rep)
  const frames = {};
  for (const p of ['pushup', 'jumpingjack', 'curl']) { av.pose(p, 0.5); av.root.updateMatrixWorld(true); frames[p] = snap(); }
  // 3) back to a clip still works
  await A.setAnim('clip:walk'); await new Promise((r) => setTimeout(r, 700));
  av.root.updateMatrixWorld(true);
  const backToClip = { hipsY: +B.hips.getWorldPosition(w).y.toFixed(3), animId: A.state.animId };
  await A.setAnim('idle');
  return { duringWalk, squatSweep: sweep, midRep: frames, backToClip };
})()`);
console.log(JSON.stringify(out, null, 1));
console.log('console errors:', errors.length, errors.slice(0, 2));
await send('Browser.close', {}).catch(() => {});
