// v7 SHOTS — founder-facing evidence for the four fixes:
//   collar_v7_neckline.png    (FIX 1 close-up: collar rings the neck base)
//   band_v7_waist.png         (FIX 2: charcoal band contrast front view)
//   fabric_v7_hang.png        (FIX 3: loose hang + pleats, 3/4 view)
//   fabric_v7_hem.png         (FIX 3: hem flare close-up)
//   pose_v7_squat|pushup|jack|curl.png  (FIX 4: poses mid-rep)
//   fullkit_v7_front.png      (overall)
// Usage: bun apps/atelier/test/derived_v7_shots.ts
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'apps/atelier/shots';
mkdirSync(OUT, { recursive: true });
const PORT = 9548;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v7-shots', '--no-first-run', '--no-sandbox',
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
// capture via the atelier's own canvas PNG export — the CLEAN render frame
// (Page.captureScreenshot would include the UI chrome, which pollutes pixel
// analysis and makes ugly founder evidence; v6 shots used snapshot() too)
const shot = async (name: string) => {
  const data = await ev('window.__atelier.snapshot()');
  if (!data?.startsWith?.('data:image/png')) { console.error('snapshot failed for', name, String(data).slice(0, 60)); process.exit(1); }
  writeFileSync(`${OUT}/${name}`, Buffer.from(data.slice(22), 'base64'));
  console.log('shot:', name);
};
const A = 'window.__atelier';

await ev(`${A}.pause(); ${A}.setTurntable(false); ${A}.homeCam()`);
// FIX 1 — neckline close-up (head + headband hidden for a clean look at the
// collar: the headband floats at forehead height once the species head is off).
// NEUTRAL LIGHTS (the same rig the in-page pixel probes use — the default
// dramatic key light leaves the rib ring's inner wall in neck shadow, where it
// reads charcoal-dark instead of lime). Camera slightly below the neck line
// looking up so the rib's outer wall is lit.
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  A.avatar.pose('stand', 0.35); A.avatar.root.updateMatrixWorld(true);
  const n = A.avatar.bones.neck.getWorldPosition(new THREE.Vector3());
  A.setCam([n.x + 0.26, n.y - 0.06, 0.78], [n.x, n.y + 0.02, 0]);
  A.outfit.slots.head.forEach((h) => h.visible = false);
  A.outfit.slots.headband.forEach((h) => h.visible = false);
  // withNeutralLights (internal) replicated via the exposed object graph
  const scene = A.avatar.root.parent;
  const saved = [];
  scene.traverse((o) => { if (!o.isLight) return;
    saved.push([o, o.color?.getHex?.() ?? null, o.groundColor?.getHex?.() ?? null, o.intensity]);
    if (o.color) o.color.setHex(0xffffff);
    if (o.groundColor) o.groundColor.setHex(0xffffff);
    o.intensity = o.isDirectionalLight || o.isHemisphereLight ? Math.max(o.intensity, 1.35) : 0; });
  scene.background = new THREE.Color('#101215');
  window.__neutralLights = { scene, saved };   // restored after the shot
  return true; })()`);
await shot('collar_v7_neckline.png');
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const { scene, saved } = window.__neutralLights;
  for (const [o, c, g, i] of saved) { if (c != null) o.color.setHex(c); if (g != null) o.groundColor.setHex(g); o.intensity = i; }
  scene.background = new THREE.Color('#0a0b0d');
  delete window.__neutralLights;
  const A = window.__atelier;
  A.outfit.slots.headband.forEach((h) => h.visible = true);
  return true; })()`);
// FIX 2 — waistband front
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const h = A.avatar.bones.hips.getWorldPosition(new THREE.Vector3());
  A.setCam([0.42, h.y + 0.06, 1.35], [0, h.y - 0.02, 0]); return true; })()`);
await shot('band_v7_waist.png');
// FIX 2b — waistband 3/4 view (task: band must read in front AND 3/4)
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const h = A.avatar.bones.hips.getWorldPosition(new THREE.Vector3());
  A.setCam([0.95, h.y + 0.10, 1.05], [0.06, h.y - 0.02, 0]); return true; })()`);
await shot('band_v7_waist34.png');
// FIX 3 — loose hang + pleats (3/4 view) and hem close-up
await ev(`${A}.homeCam(); ${A}.setCam([1.7, 1.05, 1.7], [0, 0.85, 0])`);
await shot('fabric_v7_hang.png');
await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier;
  const h = A.avatar.bones.hips.getWorldPosition(new THREE.Vector3());
  A.setCam([0.55, h.y - 0.16, 1.0], [0, h.y - 0.18, 0]); return true; })()`);
await shot('fabric_v7_hem.png');
// full kit front
await ev(`${A}.homeCam()`);
await shot('fullkit_v7_front.png');
// FIX 4 — poses mid-rep (bottom of each rep ≈ phase 0.5; jack at spread 0.5)
for (const [pose, ph] of [['squat', 0.5], ['pushup', 0.5], ['jumpingjack', 0.5], ['curl', 0.5]] as any[]) {
  await ev(`(async () => { const THREE = await import('/site/lib/three.module.js');
    const A = window.__atelier, av = A.avatar;
    A.outfit.slots.head.forEach((h) => h.visible = true);
    A.outfit.slots.headband.forEach((h) => h.visible = true);
    av.pose('${pose}', ${ph}); av.root.updateMatrixWorld(true);
    A.homeCam(); return true; })()`);
  await shot(`pose_v7_${pose}.png`);
}
// restore
await ev(`${A}.setAnim('idle')`);
console.log('console errors:', errors.length, errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
