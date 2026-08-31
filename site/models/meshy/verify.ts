const PORT = 9476;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-verify', '--no-first-run', '--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
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
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
let t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await ev('window.__atelier?.ready', sessionId)) break; await sleep(400); }
await sleep(2000);
// 1. procedural frog headCheck (regression gate)
const hc = await ev('window.__atelier.headCheck(3)', sessionId);
console.log('headCheck frog:', JSON.stringify({ species: hc.species, pass: hc.pass, frames: hc.frames?.length, note: hc.frames?.map(f => f.pass) }));
// 2. meshy-b headCheck should early-return pass with note
await ev('window.__atelier.setHead("meshy-b")', sessionId);
await sleep(3000);
const hc2 = await ev('window.__atelier.headCheck(3)', sessionId);
console.log('headCheck meshy-b:', JSON.stringify(hc2).slice(0, 200));
// 3. back to frog — expression swap smoke
await ev('window.__atelier.setHead("frog")', sessionId);
await sleep(600);
const sanity = await ev('window.__atelier.frogSanity()', sessionId);
console.log('frogSanity:', JSON.stringify(sanity).slice(0, 220));
ws.close(); process.exit(0);
