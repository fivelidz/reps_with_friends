// apps/avatars/test/shot_method.ts — find a screenshot mode that composites
// the WebGL canvases (clip screenshots render solid background in this
// chromium build). Tries: viewport-only, viewport+beyondViewport, clip+beyond.
const PORT = 9460;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/shotm-prof', '--no-first-run', '--no-sandbox',
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
await new Promise(r => setTimeout(r, 9000));

// scroll to the Wardrobe card
await send('Runtime.evaluate', {
  expression: `(() => { const h = [...document.querySelectorAll('#modelGrid .style-card--model h3')].find(h => h.textContent.includes('Wardrobe')); h.closest('.style-card').scrollIntoView({ block: 'center' }); return true; })()`,
  returnByValue: true,
}, sessionId);
await new Promise(r => setTimeout(r, 6000));

for (const [name, params] of [
  ['viewport', {}],
  ['viewport_beyond', { captureBeyondViewport: true }],
  ['clip_beyond', { captureBeyondViewport: true, clip: { x: 20, y: 100, width: 1300, height: 700, scale: 1 } }],
] as [string, any][]) {
  const shot = await send('Page.captureScreenshot', { format: 'png', ...params }, sessionId);
  await Bun.write(`/tmp/shotm_${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(name, 'saved');
}
ws.close(); process.exit(0);
