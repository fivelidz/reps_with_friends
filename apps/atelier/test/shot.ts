// one-off: screenshot the atelier stage
const PORT = 9471;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-shot', '--no-first-run', '--no-sandbox',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const ok = (await send('Runtime.evaluate', { expression: 'window.__atelier?.ready', returnByValue: true }, sessionId))?.result?.result?.value;
  if (ok) break;
  await new Promise(r => setTimeout(r, 400));
}
await new Promise(r => setTimeout(r, 2500));
await send('Runtime.evaluate', { expression: 'window.__atelier.pause(); window.__atelier.setTurntable(false);', returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 400));
const name = process.argv[2] ?? 'cloth_now';
const rect = (await send('Runtime.evaluate', { expression: `(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, returnByValue: true }, sessionId)).result.result.value;
const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
await Bun.write(`/tmp/${name}.png`, Buffer.from(s.result.data, 'base64'));
console.log(`/tmp/${name}.png ${rect.w}x${rect.h}`);
ws.close(); process.exit(0);
