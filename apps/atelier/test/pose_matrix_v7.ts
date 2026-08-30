// EXHAUSTIVE transition matrix: every clip → every pose (and pose → pose,
// verify → pose). For each transition, does the target pose ANIMATE over the
// next 0.6 s? Uses bone world-Y sampling (render-independent).
// Usage: bun apps/atelier/test/pose_matrix_v7.ts
const PORT = 9544;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-pose-matrix', '--no-first-run', '--no-sandbox',
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

const matrix = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar, B = av.bones;
  const probe = () => { av.root.updateMatrixWorld(true); const v = new THREE.Vector3(); const o = {};
    for (const n of ['hips', 'head', 'armL', 'foreL', 'handL', 'upLegL', 'footL'])
      if (B[n]) o[n] = +B[n].getWorldPosition(v).divideScalar(av.root.scale.x).y.toFixed(4);
    return o; };
  const moveOf = (id) => new Promise((res) => {
    setTimeout(() => {
      const s0 = probe();
      setTimeout(() => {
        const s1 = probe();
        let m = 0, arg = '';
        for (const k in s0) { const d = Math.abs(s1[k] - s0[k]); if (d > m) { m = d; arg = k; } }
        res({ dy: +m.toFixed(4), arg });
      }, 620);
    }, 420);
  });
  A.setTurntable(false); A.play();
  const clips = Object.keys(Object.fromEntries(Array.from(document.getElementById('animSel').options).map((o) => [o.value, 1]))).filter((v) => v.startsWith('clip:'));
  const poses = ['idle', 'squat', 'pushup', 'jumpingjack', 'curl'];
  const out = {};
  for (const c of clips) {
    await A.setAnim(c);
    await new Promise((r) => setTimeout(r, 300));
    for (const p of poses) {
      await A.setAnim(p);
      out[c + ' → ' + p] = await moveOf(p);
    }
  }
  // pose → pose
  for (const a of poses) { await A.setAnim(a); await new Promise((r) => setTimeout(r, 200));
    for (const p of poses) { await A.setAnim(p); out[a + ' → ' + p] = await moveOf(p); } }
  await A.setAnim('idle');
  return { moves: out, bar: 'healthy pose Δy(0.62s) ≥ 0.05 units (squat/jack ≫); ~0 = frozen' };
})()`);
const moves = (matrix as any)?.moves ?? {};
const frozen = Object.entries(moves).filter(([, v]: any) => v.dy < 0.02);
console.log(`transitions tested: ${Object.keys(moves).length}`);
console.log(`FROZEN (<0.02 units over 0.62 s): ${frozen.length}`);
for (const [k, v] of frozen as any[]) console.log('  ', k, JSON.stringify(v));
const worst = Object.entries(moves).sort((a: any, b: any) => a[1].dy - b[1].dy).slice(0, 6);
console.log('lowest-motion transitions:', JSON.stringify(Object.fromEntries(worst)));
console.log('console errors:', errors.length, errors.slice(0, 4));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
