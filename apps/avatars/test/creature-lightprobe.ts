// Live light probe v2: for each sun condition, screenshot the fledgling card
// and dump the projected page-pixel of a known sunlit tile + a body point.
// Pixel values are read from the PNGs by python afterwards.
// Usage: bun apps/avatars/test/creature-lightprobe.ts
const PORT = 9449;
const PAGE = 'http://localhost:4173/avatars';

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/creashot-prof', '--no-first-run', '--no-sandbox',
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
const ev = async (expression: string) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId))?.result?.result?.value;

await send('Page.navigate', { url: PAGE }, sessionId);
await new Promise(r => setTimeout(r, 4000));
await ev(`document.getElementById('creatureSection')?.scrollIntoView({block:'start'})`);
await new Promise(r => setTimeout(r, 1200));
await ev(`window.__creatures.setAnim('flap'); window.__creatures.freeze(0.62); 'ok'`);
await new Promise(r => setTimeout(r, 400));

// page-pixel of a sunlit tile top + the dragon's chest, plus card rect
const geo = await ev(`(() => {
  const c = window.__creatures.cards.find(c => c.stage === 'fledgling');
  const lm = c.landmarks();
  const tile = c.project(1.5, 0.02, 1.5);
  const chest = c.project(...lm.chest);
  const r = c.rect();
  return { tile: [Math.round(tile.x), Math.round(tile.y)], chest: [Math.round(chest.x), Math.round(chest.y)], rect: r };
})()`);
console.log(JSON.stringify(geo));

const conds: [string, string][] = [
  ['baseline', ''],
  ['sunx5', `(() => { const s = window.__creatures.cards.find(c=>c.stage==='fledgling').scene.children.find(o=>o.isDirectionalLight); s.intensity = 12; return 1; })()`],
  ['noshadow', `(() => { const s = window.__creatures.cards.find(c=>c.stage==='fledgling').scene.children.find(o=>o.isDirectionalLight); s.intensity = 2.4; s.castShadow = false; return 1; })()`],
  ['nofog', `(() => { const c = window.__creatures.cards.find(c=>c.stage==='fledgling'); c.scene.fog = null; return 1; })()`],
  ['noamb', `(() => { const c = window.__creatures.cards.find(c=>c.stage==='fledgling');
     c.scene.children.filter(o=>o.isAmbientLight).forEach(a=>a.intensity=0); c.scene.fog = c.scene.fog; return 1; })()`],
];
for (const [name, expr] of conds) {
  if (expr) await ev(expr);
  await new Promise(r => setTimeout(r, 350));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: geo.rect.x, y: geo.rect.y, width: geo.rect.w, height: geo.rect.h, scale: 1 },
  }, sessionId);
  await Bun.write(`/tmp/probe_${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log('shot', name);
}
ws.close(); process.exit(0);
