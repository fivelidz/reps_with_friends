// Screenshot the /avatars gallery (procedural + model sections) for review.
// Usage: bun apps/avatars/test/shot.ts [exercise]   → /tmp/avshot_<exercise>.png
const PORT = 9448;
const EXERCISE = process.argv[2] ?? 'squat';

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/avshot-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await new Promise(r => setTimeout(r, 9000)); // models load async

// set exercise
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    for (const s of document.querySelectorAll('select')) {
      const o = [...s.options].find(o => /${EXERCISE}/i.test(o.value + ' ' + o.textContent));
      if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    return 'set';
  })()`, returnByValue: true
}, sessionId);
console.log('exercise:', r?.result?.result?.value);

// pause mid-rep for a stable comparable frame
await send('Runtime.evaluate', { expression: `
  document.querySelectorAll('button').forEach(b => { if (/pause/i.test(b.textContent)) b.click(); });
  'paused'`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 1200));

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
await Bun.write(`/tmp/avshot_${EXERCISE}.png`, Buffer.from(shot.result.data, 'base64'));
console.log('saved /tmp/avshot_' + EXERCISE + '.png');
ws.close(); process.exit(0);
