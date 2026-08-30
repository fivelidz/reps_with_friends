// v8 SHOTS — founder-facing evidence for FABRIC garments + the shoe fix:
//   fullkit_fabric_front.png / fullkit_fabric_34.png   (overall kit)
//   chest_fabric_garment.png / chest_fabric_body.png   (chest close-up: fabric vs bare)
//   silhouette_fabric_body.png / silhouette_fabric_kit.png (front silhouettes — the smoothness read)
//   shoe_fabric_toe.png / shoe_fabric_heel.png / shoe_fabric_sole.png
//   walk_fabric_midstride.png  (walk@50% — lifted foot, sole visible)
// Usage: bun apps/atelier/test/derived_v8_shots.ts
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'apps/atelier/shots';
mkdirSync(OUT, { recursive: true });
const PORT = 9549;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v8-shots', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? m.exceptionDetails.text ?? '').slice(0, 200));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
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
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 300) };
  return r?.result?.result?.value;
};
const shot = async (name: string) => {
  const data = await ev('window.__atelier.snapshot()');
  if (!data?.startsWith?.('data:image/png')) { console.error('snapshot failed for', name, String(data).slice(0, 60)); process.exit(1); }
  writeFileSync(`${OUT}/${name}`, Buffer.from(data.slice(22), 'base64'));
  console.log('shot:', name);
};
const A = 'window.__atelier';

await ev(`${A}.pause(); ${A}.setTurntable(false); ${A}.homeCam()`);
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true); return true; })()`);

// full kit — front + 3/4
await ev(`${A}.homeCam()`);
await shot('fullkit_fabric_front.png');
await ev(`${A}.setCam([1.7, 1.05, 1.7], [0, 0.85, 0])`);
await shot('fullkit_fabric_34.png');

// chest close-up: garment vs bare body (the fabric-smooths-anatomy read)
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  const s2 = av.bones.spine2.getWorldPosition(new THREE.Vector3());
  A.setCam([s2.x + 0.75, s2.y + 0.16, 1.05], [s2.x, s2.y, 0]); return true; })()`);
await shot('chest_fabric_garment.png');
await ev(`(async () => {
  const A = window.__atelier;
  for (const s of ['tshirt', 'shorts', 'waistband', 'sneakers', 'headband']) A.outfit.toggle(s, false);
  return true; })()`);
await shot('chest_fabric_body.png');
await ev(`(async () => {
  const A = window.__atelier;
  for (const s of ['tshirt', 'shorts', 'waistband', 'sneakers', 'headband']) A.outfit.toggle(s, true);
  return true; })()`);

// front silhouettes (the smoothness comparison pair — full height)
await ev(`${A}.setCam([0, 1.0, 3.1], [0, 0.9, 0])`);
await shot('silhouette_fabric_kit.png');
await ev(`(async () => { const A = window.__atelier;
  for (const s of ['tshirt', 'shorts', 'waistband', 'sneakers', 'headband']) A.outfit.toggle(s, false);
  return true; })()`);
await shot('silhouette_fabric_body.png');
await ev(`(async () => { const A = window.__atelier;
  for (const s of ['tshirt', 'shorts', 'waistband', 'sneakers', 'headband']) A.outfit.toggle(s, true);
  return true; })()`);

// shoe close-ups — toe, heel, sole (from below-front), both feet
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.root.updateMatrixWorld(true);
  const t = av.bones.toeL.getWorldPosition(new THREE.Vector3());
  A.setCam([t.x - 0.10, t.y + 0.22, t.z + 0.69], [t.x, t.y - 0.01, t.z]); return true; })()`);
await shot('shoe_fabric_toe.png');
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.root.updateMatrixWorld(true);
  const f = av.bones.footL.getWorldPosition(new THREE.Vector3());
  A.setCam([f.x - 0.04, f.y + 0.19, f.z - 0.70], [f.x, f.y - 0.07, f.z + 0.03]); return true; })()`);
await shot('shoe_fabric_heel.png');
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.root.updateMatrixWorld(true);
  const f = av.bones.footL.getWorldPosition(new THREE.Vector3());
  A.setCam([f.x - 0.22, f.y - 0.13, f.z + 0.66], [f.x, f.y - 0.03, f.z + 0.02]); return true; })()`);
await shot('shoe_fabric_sole.png');

// walk mid-stride (lifted foot: sole visible)
await ev(`(async () => {
  const A = window.__atelier;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(A.avatar, res);
  p.time = p.duration * 0.5; p.update(0);
  A.avatar.root.updateMatrixWorld(true);
  A.homeCam();
  p.stop();
  return true; })()`);
await shot('walk_fabric_midstride.png');

await ev(`${A}.setAnim('idle')`);
console.log('console errors:', errors.length, errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(errors.length ? 1 : 0);
