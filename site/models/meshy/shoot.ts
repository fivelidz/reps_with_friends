// shoot.ts — CDP evidence collector for the meshy frog experiment.
// Screenshots: atelier (procedural frog vs meshy-b vs meshy-c, isolated head +
// full kit) and the avatars gallery card for the rigged full character.
// Console errors are collected and printed. Run: bun shoot.ts
const PORT = 9471;
const OUT = new URL('.', import.meta.url).pathname; // .../site/models/meshy/

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
let id = 0; const pend = new Map(); const consoleLogs: string[] = [];
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    consoleLogs.push(`[${m.params.type}] ${m.params.args?.map(a => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  }
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

const shot = async (name, sel, sessionId) => {
  const rect = (await ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, sessionId));
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(OUT + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot', name, `${rect.w}x${rect.h}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. ATELIER ────────────────────────────────────────────────────────────────
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
let t0 = Date.now();
while (Date.now() - t0 < 60000) {
  if (await ev('window.__atelier?.ready', sessionId)) break;
  await sleep(400);
}
await sleep(2000);
await ev('window.__atelier.pause(); window.__atelier.setTurntable(false);', sessionId);
await sleep(400);

// zoom toward the head: wheel on the upper-centre of the stage (OrbitControls
// dollies), then a small upward drag to frame the head higher.
const zoomToHead = async () => {
  await ev(`(() => {
    const st = document.getElementById('stage'); const r = st.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height * 0.22;
    const c = st.querySelector('canvas') || st;
    for (let i = 0; i < 9; i++) c.dispatchEvent(new WheelEvent('wheel', { clientX: cx, clientY: cy, deltaY: -160, bubbles: true, cancelable: true }));
  })()`, sessionId);
  await sleep(500);
};

for (const sp of ['frog', 'meshy-b', 'meshy-c']) {
  await ev(`window.__atelier.setHead('${sp}')`, sessionId);
  await sleep(2500); // GLB fetch + install
  const ok = await ev(`window.__atelier.headSpecies`, sessionId);
  const info2 = await ev(`window.__atelier.meshyInfo()`, sessionId);
  console.log('head', sp, 'state=', ok, info2 ? `file=${info2.file}` : '(procedural)');
  // isolated head, zoomed
  await ev(`window.__atelier.isolate('head')`, sessionId);
  await sleep(600);
  await zoomToHead();
  await shot(`shots/atelier_iso_${sp.replace('meshy-', 'meshy')}.png`, '#stage', sessionId);
  // full kit, default framing
  await ev(`window.__atelier.isolate(null); window.__atelier.setBuildStep(999)`, sessionId);
  // buildStep is clamped? use the exposed setBuildStep with last index instead:
  await ev(`window.__atelier.setBuildStep(window.__atelier.state.buildSteps ? window.__atelier.state.buildSteps.length - 1 : 6)`, sessionId);
  await sleep(800);
  await shot(`shots/atelier_full_${sp.replace('meshy-', 'meshy')}.png`, '#stage', sessionId);
}

// walk frame with meshy-b (does the static GLB ride the Head bone through mocap?)
await ev(`window.__atelier.setHead('meshy-b')`, sessionId);
await sleep(2000);
await ev(`window.__atelier.setAnim('walk'); window.__atelier.play();`, sessionId);
await sleep(3000);
await ev(`window.__atelier.pause()`, sessionId);
await shot('shots/atelier_walk_meshy_b.png', '#stage', sessionId);

// ── 2. AVATORS GALLERY (rigged full character card) ──────────────────────────
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(3500);
const cardIdx = await ev(`(() => {
  const cards = [...document.querySelectorAll('.style-card--model')];
  const i = cards.findIndex(c => c.textContent.includes('meshy.ai rigged'));
  if (i >= 0) cards[i].scrollIntoView({ block: 'center' });
  return i;
})()`, sessionId);
console.log('meshy card index', cardIdx);
await sleep(5000); // lazy context + GLB + auto BVH
if (cardIdx >= 0) {
  await ev(`(() => { [...document.querySelectorAll('.style-card--model')].forEach((c, i) => { if (i === ${cardIdx}) c.style.outline = '2px solid #c6f32e'; }); })()`, sessionId);
  await shot('shots/avatars_meshy_frog.png', `.style-card--model:nth-of-type(${cardIdx + 1})`, sessionId);
}
const genoIdx = await ev(`(() => {
  const cards = [...document.querySelectorAll('.style-card--model')];
  const i = cards.findIndex(c => c.textContent.includes('Geno Frog'));
  if (i >= 0) cards[i].scrollIntoView({ block: 'center' });
  return i;
})()`, sessionId);
await sleep(3000);
if (genoIdx >= 0) await shot('shots/avatars_geno_frog.png', `.style-card--model:nth-of-type(${genoIdx + 1})`, sessionId);

console.log('\nconsole errors/warnings:', consoleLogs.length);
consoleLogs.slice(0, 20).forEach(l => console.log(' ', l));
ws.close(); process.exit(0);
