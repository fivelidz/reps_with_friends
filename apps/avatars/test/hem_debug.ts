// apps/avatars/test/hem_debug.ts — dump tank-hem geometry on the wardrobe card
// mid-walk: anchors, bottom ring, capsule endpoints/radii (world, cm).
const PORT = 9462;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/hemdbg-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { await sleep(500); try { const r = await send('Runtime.evaluate', { expression: '!!window.__rwfModels', returnByValue: true }, sessionId); if (r?.result?.result?.value) break; } catch {} }
await sleep(1500);

const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;
const iW = names.findIndex((n) => /Wardrobe — dressed/.test(n));
await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('#modelGrid .style-card--model')[${iW}].scrollIntoView({ block: 'center' }), true`,
  returnByValue: true,
}, sessionId);
for (let i = 0; i < 120; i++) {
  const r = await send('Runtime.evaluate', { expression: `!!(window.__rwfModels[${iW}] && window.__rwfModels[${iW}].bvh)`, returnByValue: true }, sessionId);
  if (r?.result?.result?.value) break;
  await sleep(500);
}
await sleep(3000);

const dump = `(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const e = window.__rwfModels[${iW}];
  const w = e.wardrobe;
  e.avatar.root.updateMatrixWorld(true);
  const cm = 175 / 1.5;
  const f = (x) => +(x * cm).toFixed(1);
  const h = w.hems[2]; // tank
  const C = h.C, R = h.R, p = h.p;
  const ring = (r) => { const out = []; for (let k = 0; k < C; k++) { const o = (r*C+k)*3; out.push([f(p[o]), f(p[o+1]), f(p[o+2])]); } return out; };
  const caps = h.spec.capsules.map((c) => { const el = c.a.matrixWorld.elements, el2 = c.b.matrixWorld.elements; return { a: [f(el[12]), f(el[13]), f(el[14])], b: [f(el2[12]), f(el2[13]), f(el2[14])], rCm: f(c.r) }; });
  // garment bottom ring via CPU skinning for comparison
  const g = h.spec.garment;
  const pos = g.geometry.attributes.position;
  const v = new THREE.Vector3();
  const gar = [];
  for (let k = 0; k < C; k++) {
    const u = (k / C) * h.spec.radial;
    const j0 = Math.floor(u) % h.spec.radial, j1 = (j0 + 1) % h.spec.radial, fr = u - Math.floor(u);
    const A = new THREE.Vector3().fromBufferAttribute(pos, h.spec.ringStart + j0); g.applyBoneTransform(h.spec.ringStart + j0, A);
    const B = new THREE.Vector3().fromBufferAttribute(pos, h.spec.ringStart + j1); g.applyBoneTransform(h.spec.ringStart + j1, B);
    gar.push([f(A.lerp(B, fr).applyMatrix4(g.matrixWorld).x), f(A.y), f(A.z)]);
  }
  return { anchors: ring(0), bottom: ring(R), caps, garment: gar, gapCm: f(h.gap) };
})()`;

for (let s = 0; s < 4; s++) {
  const r = await send('Runtime.evaluate', { expression: dump, awaitPromise: true, returnByValue: true }, sessionId);
  const v = r?.result?.result?.value;
  if (!v) { console.log('dump failed', JSON.stringify(r?.result?.exceptionDetails?.exception?.description ?? '').slice(0, 300)); break; }
  console.log(`\n--- sample ${s} (tank hem, cm) gap=${v.gapCm}`);
  console.log('  anchors :', JSON.stringify(v.anchors));
  console.log('  bottom  :', JSON.stringify(v.bottom));
  console.log('  garment :', JSON.stringify(v.garment));
  console.log('  caps    :', JSON.stringify(v.caps));
  await sleep(260);
}
ws.close(); process.exit(0);
