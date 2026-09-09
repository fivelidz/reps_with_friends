// meshy2_verify.ts — verify the Meshy rigged athlete plays our clips.
// For each clip: two-frame world-position deltas per key joint (t=0 vs t=0.5 s
// and t=1.0 s) + NaN gate + ground sanity. Pose check: squat at two phases.
// Usage: bun apps/avatars/test/meshy2_verify.ts
const PORT = 9483;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/meshy2-verify-b', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r?.result?.exceptionDetails) console.log('EXC', JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r?.result?.result?.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(3500); // let the page's own cards boot (we only use its module context)

const BOOT = `
(async () => {
  const THREE = await import('three');
  const M = await import('/site/model-avatars.js');
  window.__T = THREE; window.__M = M;
  const root = await M.loadModel(${JSON.stringify(process.env.MODEL_FILE ?? '/models/meshy_rigged_01.glb')});
  const av = new M.ModelAvatar(root, 'mixamo');
  av.root.scale.setScalar(1.5 / av.H);
  window.__av = av;
  const missing = Object.entries(av.bones).filter(([, b]) => !b).map(([k]) => k);
  return { file: root.userData.src ?? 'loaded', H: +av.H.toFixed(3), missing, bones: Object.keys(av.bones).length };
})()
`;
console.log('BOOT', JSON.stringify(await ev(BOOT, sessionId)));

const RUN_CLIP = `
(async (clipId) => {
  const THREE = window.__T, M = window.__M, av = window.__av;
  const res = await M.loadGenoClip(clipId);
  const p = new M.BVHPlayer(av, res);
  const J = ['hips', 'head', 'handL', 'handR', 'footL', 'footR'];
  const cap = () => { av.root.updateMatrixWorld(true); const o = {}; for (const k of J) { const b = av.bones[k]; o[k] = b ? b.getWorldPosition(new THREE.Vector3()) : null; } return o; };
  const dt = (a, b) => { const out = {}; let mx = 0, nan = 0; for (const k of J) { if (!a[k] || !b[k]) continue; if (Number.isNaN(a[k].x + b[k].x)) nan++; out[k] = +a[k].distanceTo(b[k]).toFixed(4); mx = Math.max(mx, out[k]); } return { per: out, max: +mx.toFixed(4), nan }; };
  p.update(0); const f0 = cap();
  p.update(0.5); const f05 = cap();
  p.update(1.0); const f10 = cap();
  const d05 = dt(f0, f05), d10 = dt(f0, f10);
  const mins = Object.values({ ...f0, ...f10 }).filter(Boolean).map(v => v.y);
  p.stop();
  return { clip: clipId, duration: +p.duration.toFixed(2), pairs: p.pairs.length, maxDelta05: d05.max, maxDelta10: d10.max, perJoint05: d05.per, nan: d05.nan + d10.nan, minY: +Math.min(...mins).toFixed(3), maxY: +Math.max(...mins).toFixed(3) };
})
`;

const RUN_CLIP_FN = `(${RUN_CLIP})`;
for (const clip of (process.argv[2] ? [process.argv[2]] : ['walk', 'run'])) {
  console.log('CLIP', JSON.stringify(await ev(`${RUN_CLIP_FN}(${JSON.stringify(clip)})`, sessionId)));
}

// exercise pose: two-phase world-position delta (squat 0.15 vs 0.85)
const RUN_POSE = `
(() => {
  const THREE = window.__T, av = window.__av;
  const J = ['hips', 'head', 'handL', 'handR', 'kneeL', 'footL'];
  const cap = () => { av.root.updateMatrixWorld(true); const o = {}; for (const k of J) { const b = av.bones[k]; o[k] = b ? b.getWorldPosition(new THREE.Vector3()) : null; } return o; };
  av.pose('squat', 0.1); const a = cap();
  av.pose('squat', 0.5); const b = cap();
  let mx = 0, nan = 0; const per = {};
  for (const k of J) { if (!a[k] || !b[k]) continue; if (Number.isNaN(a[k].x + b[k].x)) nan++; per[k] = +a[k].distanceTo(b[k]).toFixed(4); mx = Math.max(mx, per[k]); }
  const hipDrop = +(a.hips.y - b.hips.y).toFixed(4);
  av.pose('squat', 0.5);
  return { pose: 'squat', maxDelta: +mx.toFixed(4), perJoint: per, hipDrop, nan };
})()
`;
console.log('POSE', JSON.stringify(await ev(RUN_POSE, sessionId)));
ws.close(); process.exit(0);
