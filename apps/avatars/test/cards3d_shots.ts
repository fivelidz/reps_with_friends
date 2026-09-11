// cards3d_shots.ts — verify + screenshot the 3D CARDS deck wheel on /avatars
// (wave2_shots.ts pattern: page-truth via the __rwfCards3d hook, absolute
// scrollTo + page-space clip + captureBeyondViewport, console-error gate).
// Usage: bun apps/avatars/test/cards3d_shots.ts
const errors: string[] = [];
const PORT = 9493;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', `--user-data-dir=/tmp/cards3d-shots-${Date.now()}`, '--no-first-run', '--no-sandbox',
    '--disable-extensions', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('no chromium'); process.exit(2); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push(m.params.args?.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') errors.push(String(m.params.entry.text).slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails?.exception?.description ?? 'exception').slice(0, 200));
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(5000);

// scroll straight to the 3D cards section (fires the lazy context)
await ev(`document.querySelector('#cards3dSection')?.scrollIntoView({ block: 'center' })`, sessionId);
await sleep(2500);

// page-truth: the wheel exists, 21 cards, live renderer
const stats = JSON.parse(await ev(`JSON.stringify(window.__rwfCards3d ? { ...window.__rwfCards3d.stats(), spinning: window.__rwfCards3d.spinning } : null)`, sessionId) ?? 'null');
let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ FAIL: ' + l); } };
ok(!!stats, 'wheel hook live (__rwfCards3d)');
ok(stats?.cards === 21, `all 21 deck cards in the wheel (${stats?.cards})`);
ok(stats?.live === true, 'lazy renderer live on-screen');
ok(stats?.spinning === true, 'wheel slowly rotating');
ok((stats?.renderMs ?? 99) < 30, `wheel render cost sane (${stats?.renderMs}ms)`);

// the wheel is actually DRAWING pixels — sample INSIDE a rAF (WebGL clears
// its buffer after compositing, so between-frame drawImage reads blank; the
// demo's rAF loop registered first, so a later callback in the same frame
// still sees the freshly rendered buffer)
const drawn = await ev(`new Promise(res => requestAnimationFrame(() => {
  const cv = document.querySelector('#cards3dGrid canvas');
  if (!cv) return res(-1);
  const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64;
  const g = c2.getContext('2d');
  g.drawImage(cv, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 12) n++;
  res(n);
}))`, sessionId);
ok(drawn > 200, `wheel draws real pixels (${drawn}/4096 samples opaque)`);

// screenshot the section (viewport capture — the section fits 1440×1000)
const sec = await ev(`(() => { const el = document.querySelector('#cards3dSection'); el.scrollIntoView({ block: 'center' }); return true; })()`, sessionId);
await sleep(900);
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
if (!shot?.result?.data) { console.log('  shot response:', JSON.stringify(shot).slice(0, 200)); }
const { writeFileSync } = await import('node:fs');
writeFileSync('/home/fivelidz/projects/reps_with_friends/apps/avatars/screenshots/cards3d_deck.png', Buffer.from(shot.result.data, 'base64'));
console.log('  📸 apps/avatars/screenshots/cards3d_deck.png');

console.log('— CONSOLE');
ok(errors.length === 0, `zero console errors${errors.length ? ' — ' + errors[0] : ''}`);
console.log(`\n${pass}/${pass + fail} cards3d vault checks passed`);
process.exit(fail || errors.length ? 1 : 0);
