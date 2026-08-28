// apps/avatars/test/fabric_final.ts — final checks:
//   G. prefers-reduced-motion → hems never created (static silhouette).
//   H. save founder-review screenshots (wardrobe + fullkit, walk + squat).
//   I. final context census after everything.
const PORT = 9467;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fabricfinal-prof', '--no-first-run', '--no-sandbox',
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description ?? 'exception' };
  return r?.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`/tmp/fabricfinal/${name}.png`, Buffer.from(s.result.data, 'base64'));
};

// ── G. reduced motion ────────────────────────────────────────────────────────
// CDP's setEmulatedMediaFeatures doesn't reach window.matchMedia in this
// chromium build (probed: stays false) — force it with an inject-on-load
// patch instead, which exercises the exact code path the page uses.
console.log('== G. prefers-reduced-motion ==');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const orig = window.matchMedia.bind(window); window.matchMedia = (q) => { const m = orig(q); if (/prefers-reduced-motion/.test(q)) { return { ...m, matches: /reduce/.test(q), addEventListener: m.addEventListener.bind(m), removeEventListener: m.removeEventListener.bind(m), addListener: m.addListener.bind(m), removeListener: m.removeListener.bind(m) }; } return m; }; })();`,
}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('!!window.__rwfModels')) break; }
await sleep(1200);
const names = await ev(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`);
const iW = names.findIndex((n) => /Wardrobe — dressed/.test(n));
await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${iW}].scrollIntoView({ block: 'center' }), true`);
for (let t = 0; t < 90; t++) { if (await ev(`!!(window.__rwfModels[${iW}] && window.__rwfModels[${iW}].wardrobe)`)) break; await sleep(400); }
await sleep(800);
const g = await ev(`(() => { const e = window.__rwfModels[${iW}]; return { hems: e.wardrobe?.hems.length ?? -1, slots: Object.keys(e.wardrobe?.slots ?? {}) }; })()`);
console.log(`  reduced-motion wardrobe: hems=${g.hems} (expect 0), slots=${JSON.stringify(g.slots)}`);
await shot('reduced_motion_wardrobe');

// ── H. founder screenshots (normal motion) — fresh target, no matchMedia patch ──
const t2 = (await send('Target.createTarget', { url: 'about:blank' })).result;
const s2 = (await send('Target.attachToTarget', { targetId: t2.targetId, flatten: true })).result;
await send('Page.enable', {}, s2.sessionId);
await send('Runtime.enable', {}, s2.sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, s2.sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, s2.sessionId);
{
  const ev2 = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, s2.sessionId);
    return r?.result?.result?.value;
  };
  const shot2 = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, s2.sessionId);
    await Bun.write(`/tmp/fabricfinal/${name}.png`, Buffer.from(s.result.data, 'base64'));
  };
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev2('!!window.__rwfModels')) break; }
  await sleep(1200);

  for (const [label, re, squat] of [
    ['wardrobe_walk', /Wardrobe — dressed/, false],
    ['wardrobe_squat', /Wardrobe — dressed/, true],
    ['fullkit_walk', /Full Kit/, false],
  ]) {
    const i = names.findIndex((n) => re.test(n));
    await ev2(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
    for (let t = 0; t < 120; t++) { if (await ev2(`!!(window.__rwfModels[${i}] && window.__rwfModels[${i}].bvh)`)) break; await sleep(400); }
    await sleep(2200);
    if (squat) {
      await ev2(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="squat"]').click(), true`);
      await sleep(1600);
    }
    await shot2(label);
    console.log(`  shot ${label}`);
  }
}

// ── I. final census ──────────────────────────────────────────────────────────
console.log('== I. final context census ==');
await ev(`(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 500) { scrollTo({ top: y }); await new Promise(r => setTimeout(r, 110)); } return true; })()`, true);
await sleep(4000);
const census = await ev(`(() => { let live = 0, lost = 0; for (const c of document.querySelectorAll('canvas')) { const g = c.getContext('webgl2') || c.getContext('webgl'); if (g) g.isContextLost() ? lost++ : live++; } return { live, lost }; })()`);
const blank = [];
for (let i = 0; i < names.length; i++) {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  for (let t = 0; t < 60; t++) { if (await ev(`!!(window.__rwfModels[${i}] && window.__rwfModels[${i}].renderer && (window.__rwfModels[${i}].avatar || window.__rwfModels[${i}].root3d))`)) break; await sleep(250); }
  const v = await ev(`(() => { const e = window.__rwfModels[${i}]; if (!e.renderer) return -1; e.renderer.render(e.scene, e.cam); const gl = e.renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const buf = new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf); let a=0; for (let p=0;p<W*H;p++) if (buf[p*4+3]>=10) a++; return a; })()`);
  if (typeof v === 'number' && v <= 0) blank.push(names[i]);
  await sleep(120);
}
console.log(`  census ${JSON.stringify(census)} · blank cards: ${blank.length ? blank.join(', ') : 'NONE'}`);
ws.close(); process.exit(0);
