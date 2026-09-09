// story_shots.ts — screenshot the HOW THIS WAS BUILT panel + console-error watch.
// Usage: bun apps/atelier/test/story_shots.ts
// Shots (suffix _story) → apps/atelier/shots/ + /tmp copies.
const PORT = 9487;
const errors: string[] = [];
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
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    errors.push(m.params.args?.map((a: any) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
    errors.push(m.params.entry.text);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'exception');
  }
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
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

const shoot = async (name: string) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  await Bun.write(`apps/atelier/shots/${name}.png`, Buffer.from(s.result.data, 'base64'));
  await Bun.write(`/tmp/${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log(`shot apps/atelier/shots/${name}.png`);
};

// 1) collapsed atelier — proves the tool is unregressed with the panel present
await shoot('atelier_story_collapsed');

// 2) open the story panel, scroll it into view
await send('Runtime.evaluate', { expression: `document.getElementById('story').open = true; document.getElementById('story').scrollIntoView({block:'start'});`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 900));
await shoot('atelier_story_open_top');

// 3) the generations grid close-up
await send('Runtime.evaluate', { expression: `document.querySelector('.story-gens').scrollIntoView({block:'start'});`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 700));
await shoot('atelier_story_gens');

// 4) instruments + mocap sidebar
await send('Runtime.evaluate', { expression: `document.querySelector('.story-cols').scrollIntoView({block:'start'});`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 700));
await shoot('atelier_story_instruments_mocap');
await send('Runtime.evaluate', { expression: `document.querySelector('.story-note')?.scrollIntoView({block:'center'});`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 700));
await shoot('atelier_story_note');

// sanity: story DOM present + main stage still alive
await send('Runtime.evaluate', { expression: `document.getElementById('animSel').dispatchEvent(new Event('change'))`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 2000));
const sanity = (await send('Runtime.evaluate', { expression: `JSON.stringify({
  gens: document.querySelectorAll('.story-gens .gen').length,
  svgs: document.querySelectorAll('.gen-svg').length,
  inst: document.querySelectorAll('.inst').length,
  mocap: document.querySelectorAll('.story-mocap li').length,
  src: !!document.querySelector('.story-src'),
  hudAnim: document.getElementById('hudAnim')?.textContent,
  hudCtx: document.getElementById('hudCtx')?.textContent,
  errors: window.__errCount ?? 0,
})`, returnByValue: true }, sessionId)).result.result.value;
console.log('SANITY', sanity);
console.log('CONSOLE_ERRORS', errors.length);
for (const e of errors) console.log('ERR:', e.slice(0, 300));
ws.close(); process.exit(0);
