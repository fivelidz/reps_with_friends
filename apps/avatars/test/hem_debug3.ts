// apps/avatars/test/hem_debug3.ts — dump shorts-hem internals during a squat:
// p rows, constraints, capsule endpoints, scale, phase.
const PORT = 9464;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/hemdbg3b-prof', '--no-first-run', '--no-sandbox',
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
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', { expression: '!!window.__rwfModels', returnByValue: true }, sessionId);
  if (r?.result?.result?.value) break;
}
await sleep(1000);
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
await sleep(2500);
await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('#modelGrid .style-card--model')[${iW}].querySelector('[data-ex="squat"]').click(), true`,
  returnByValue: true,
}, sessionId);
await sleep(1400);

const dump = `(async () => {
  try {
    const e = window.__rwfModels[${iW}];
    if (!e || !e.wardrobe) return { err: 'no wardrobe' };
    const w = e.wardrobe;
    e.avatar.root.updateMatrixWorld(true);
    const cm = 175 / 1.5;
    const f = (x) => +(x * cm).toFixed(1);
    const h = w.hems[0];
    const C = h.C, R = h.R, p = h.p;
    const ring = (rr) => { const out = []; for (let k = 0; k < C; k++) { const o = (rr*C+k)*3; out.push([f(p[o]), f(p[o+1]), f(p[o+2])]); } return out; };
    const bel = (b) => { const el = b.matrixWorld.elements; return [f(el[12]), f(el[13]), f(el[14])]; };
    const scl = h.mesh.matrixWorld.elements;
    const sx = Math.hypot(scl[0], scl[1], scl[2]);
    return {
      scale: +sx.toFixed(4),
      specHeight: +h.spec.height.toFixed(2),
      gap: +h.gap.toFixed(4),
      consSample: h.cons.slice(0, 8).map(([i, j, rest]) => [i, j, +rest.toFixed(4)]),
      consCount: h.cons.length,
      anchors: ring(0), mid: ring(1), bottom: ring(2),
      upLegWorld: bel(e.avatar.bones.upLegL),
      kneeWorld: bel(e.avatar.bones.legL),
      capWorld: h.spec.capsules.map((c) => ({ a: bel(c.a), b: bel(c.b), rCm: f(c.r) })),
      gposSample: Array.from(h.gpos.slice(0, 6)).map((x) => +x.toFixed(3)),
      phase: e.phase === undefined ? null : +e.phase.toFixed(3),
    };
  } catch (err) { return { err: err.message, stack: String(err.stack).split('\\n').slice(0, 5).join(' | ') }; }
})()`;

const r = await send('Runtime.evaluate', { expression: dump, awaitPromise: true, returnByValue: true }, sessionId);
const v = r?.result?.result?.value;
if (!v) console.log('FAILED:', JSON.stringify(r?.result?.exceptionDetails ?? r).slice(0, 400));
else console.log(JSON.stringify(v, null, 1));
ws.close(); process.exit(0);
