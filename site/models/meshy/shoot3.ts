// shoot2.ts — evidence collector v2 (fixes: no out-of-range buildStep; pan the
// orbit target to the head with a CDP right-drag, then zoom with mouseWheel).
// Run: bun shoot2.ts
const OUT = new URL('.', import.meta.url).pathname;
const PORT = 9473;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-shot3', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const consoleLogs: string[] = [];
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    consoleLogs.push(`[${m.params.type}] ${m.params.args?.map(a => a.value ?? a.description ?? '').join(' ')}`.slice(0, 240));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleLogs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 240));
  }
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false }, sessionId);

const shot = async (name) => {
  const rect = (await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 2 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(OUT + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot', name);
};

// CDP-level pan (right-drag) + zoom (wheel) so OrbitControls moves its TARGET
// to the head, then dollies in.
const frameHead = async () => {
  const r = await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId);
  const cx = r.x + r.w / 2, topY = r.y + r.h * 0.12, midY = r.y + r.h * 0.5;
  // right-drag from centre upward: pans the orbit target toward the head
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: midY, button: 'right', buttons: 2, clicks: 1 }, sessionId);
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: midY - (midY - topY) * (i / 10), button: 'right', buttons: 2 }, sessionId);
    await sleep(16);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: topY, button: 'right', buttons: 0, clicks: 1 }, sessionId);
  await sleep(250);
  // wheel zoom in (6 notches)
  for (let i = 0; i < 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: topY, deltaX: 0, deltaY: -120 }, sessionId);
    await sleep(60);
  }
  await sleep(500);
};

await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
let t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await ev('window.__atelier?.ready', sessionId)) break; await sleep(400); }
await sleep(2000);
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false);', sessionId);
await sleep(400);

for (const sp of ['frog', 'meshy-b', 'meshy-c']) {
  await ev(`window.__atelier.setHead('${sp}')`, sessionId);
  await sleep(3000);
  const state = await ev(`window.__atelier.headSpecies`, sessionId);
  const mi = await ev(`window.__atelier.meshyInfo()`, sessionId);
  console.log('head', sp, '→ state', state, mi ? `file=${mi.file}` : '(procedural)');
  // isolated head, framed
  await ev(`window.__atelier.isolate('head')`, sessionId);
  await sleep(700);
  await shot(`shots/atelier_iso_${sp.replace('meshy-', 'meshy')}.png`);
  // full kit: click the LAST build-step chip (never index past the array)
  await ev(`window.__atelier.isolate(null)`, sessionId);
  await ev(`(() => { const chips = document.querySelectorAll('.build-step'); chips[chips.length - 1].click(); })()`, sessionId);
  await sleep(900);
  await shot(`shots/atelier_full_${sp.replace('meshy-', 'meshy')}.png`);
}

// walk frame with meshy-b: does the static GLB ride the Head bone through mocap?
await ev(`window.__atelier.setHead('meshy-b')`, sessionId);
await sleep(2500);
await ev(`window.__atelier.isolate(null)`, sessionId);
await ev(`(() => { const chips = document.querySelectorAll('.build-step'); chips[chips.length - 1].click(); })()`, sessionId);
await ev(`window.__atelier.setAnim('walk'); window.__atelier.play();`, sessionId);
await sleep(3500);
await ev(`window.__atelier.pause()`, sessionId);
await sleep(400);
await shot('shots/atelier_walk_meshy_b.png');

// ── avatars gallery: rigged full character card ──────────────────────────────
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(3500);
const cardSel = await ev(`(() => {
  const cards = [...document.querySelectorAll('.style-card--model')];
  const i = cards.findIndex(c => c.textContent.includes('meshy.ai rigged'));
  if (i >= 0) { cards[i].scrollIntoView({ block: 'center' }); return '.style-card--model:nth-of-type(' + (i + 1) + ')'; }
  return null;
})()`, sessionId);
console.log('meshy card selector', cardSel);
await sleep(6000); // lazy GL context + 10MB GLB + auto BVH
if (cardSel) {
  const rect = (await ev(`(() => { const r = document.querySelector('${cardSel}').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 2 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(OUT + 'shots/avatars_meshy_frog.png', Buffer.from(s.result.data, 'base64'));
  console.log('shot avatars_meshy_frog.png');
}
const genoSel = await ev(`(() => {
  const cards = [...document.querySelectorAll('.style-card--model')];
  const i = cards.findIndex(c => c.textContent.includes('Geno Frog'));
  if (i >= 0) { cards[i].scrollIntoView({ block: 'center' }); return '.style-card--model:nth-of-type(' + (i + 1) + ')'; }
  return null;
})()`, sessionId);
await sleep(3000);
if (genoSel) {
  const rect = (await ev(`(() => { const r = document.querySelector('${genoSel}').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 2 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(OUT + 'shots/avatars_geno_frog.png', Buffer.from(s.result.data, 'base64'));
  console.log('shot avatars_geno_frog.png');
}

console.log('\nconsole errors/warnings/exceptions:', consoleLogs.length);
consoleLogs.slice(0, 25).forEach(l => console.log(' ', l));
ws.close(); process.exit(0);
