const OUT = new URL('.', import.meta.url).pathname;
const PORT = 9474;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-bisect', '--no-first-run', '--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

const shot = async (name) => {
  const rect = (await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } }, sessionId);
  await Bun.write(OUT + 'shots/' + name, Buffer.from(s.result.data, 'base64'));
  const stats = await ev(`(() => {
    const c = document.querySelector('#stage canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return c ? JSON.stringify({w: c.width, h: c.height, clientW: c.clientWidth}) : 'nocanvas';
  })()`, sessionId);
  console.log('shot', name, 'canvas:', stats);
};

await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
let t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await ev('window.__atelier?.ready', sessionId)) break; await sleep(400); }
await sleep(2500);
await shot('bisect_1_boot.png');
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false);', sessionId);
await sleep(600);
await shot('bisect_2_paused.png');
await ev('window.__atelier.setHead("meshy-b")', sessionId);
await sleep(3500);
await shot('bisect_3_meshyb.png');
await ev('window.__atelier.isolate("head")', sessionId);
await sleep(700);
await shot('bisect_4_iso.png');
ws.close(); process.exit(0);
