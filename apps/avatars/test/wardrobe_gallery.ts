// apps/avatars/test/wardrobe_gallery.ts — refresh the founder's reference
// gallery shots: wardrobe + fullkit cards, two walk frames each (mocap drive
// evidence). Archives existing files to apps/avatars/archive/ first.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const PORT = 9459;
const SHOT_DIR = new URL('../screenshots/', import.meta.url).pathname;
const ARCHIVE = new URL('../archive/', import.meta.url).pathname;
mkdirSync(ARCHIVE, { recursive: true });

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/wardrobe-gal', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params = {}, sessionId?: string) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[console.error] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    }
  } catch {}
});
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 2, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
};
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Full Kit'))`);

const SHOTS: Array<[string, RegExp, string]> = [
  ['geno_wardrobe_dressed.png', /Wardrobe — dressed/, 'geno_wardrobe_walk.png'],
  ['geno_fullkit_walk.png', /Full Kit/, 'geno_fullkit_walk_f2.png'],
];
for (const [mainName, cardRe, secondName] of SHOTS) {
  const i = (await send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => h.textContent.match(${cardRe}))`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  if (i < 0) { console.log('card not found for', mainName); continue; }
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 300 }); return true; })()`,
  }, sessionId);
  const gotBvh = await waitFor(`window.__rwfModels[${i}]?.bvh && !window.__rwfModels[${i}].bvh.dead`, 90000);
  console.log(`${mainName}: bvh ${gotBvh ? 'playing' : 'TIMEOUT'}`);
  await new Promise(r => setTimeout(r, 2500));
  const card = (await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  for (const [name, wait] of [[mainName, 0], [secondName, 700]] as Array<[string, number]>) {
    await new Promise(r => setTimeout(r, wait));
    const dest = SHOT_DIR + name;
    if (existsSync(dest)) copyFileSync(dest, ARCHIVE + name.replace('.png', '_v1_20260829.png'));
    const shot = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: card.x, y: card.y, width: card.w, height: card.h, scale: 1 }, captureBeyondViewport: true,
    }, sessionId);
    await Bun.write(dest, Buffer.from(shot.result.data, 'base64'));
    console.log('  →', dest);
  }
}
console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 300));
ws.close(); process.exit(errors.length ? 2 : 0);
