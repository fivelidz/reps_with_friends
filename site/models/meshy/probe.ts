const OUTDIR = new URL('.', import.meta.url).pathname;
const PORT = 9471;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-probe', '--no-first-run', '--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
let t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await ev('window.__atelier?.ready', sessionId)) break; await new Promise(r => setTimeout(r, 400)); }
await new Promise(r => setTimeout(r, 1500));
console.log('boot state:', await ev(`JSON.stringify({iso: __atelier.state.iso, step: __atelier.state.buildStep, head: __atelier.state.headSpecies, nSteps: __atelier.state.buildSteps?.length})`, sessionId));
console.log('frogInfo keys:', await ev(`__atelier.frogInfo() ? Object.keys(__atelier.frogInfo()).join(',') : 'NULL'`, sessionId));
// isolate head and inspect the scene graph around the head bone
await ev(`window.__atelier.isolate('head')`, sessionId);
await new Promise(r => setTimeout(r, 800));
console.log('after iso:', await ev(`JSON.stringify({iso: __atelier.state.iso, step: __atelier.state.buildStep})`, sessionId));
console.log('head group probe:', await ev(`(() => {
  const av = __atelier.avatar;
  let out = [];
  av.root.updateMatrixWorld(true);
  const head = av.bones.head;
  head.children.forEach(c => out.push({name: c.name || c.type, type: c.type, visible: c.visible, wardrobe: c.userData?.rwfWardrobe ?? null, kids: c.children.length}));
  return JSON.stringify(out);
})()`, sessionId));
console.log('world visibility chain:', await ev(`(() => {
  const av = __atelier.avatar; const head = av.bones.head;
  let o = head, chain = [];
  while (o) { chain.push((o.name || o.type) + ':' + o.visible); o = o.parent; }
  return chain.join(' > ');
})()`, sessionId));

// direct boot screenshot, no zoom, no iso
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false);', sessionId);
await new Promise(r => setTimeout(r, 800));
const rect = (await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
await Bun.write(OUTDIR + 'probe_boot.png', Buffer.from(s.result.data, 'base64'));
console.log('probe_boot.png saved');
ws.close(); process.exit(0);

