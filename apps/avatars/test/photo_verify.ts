// apps/avatars/test/photo_verify.ts — verification harness for the PHOTO
// AVATARS strip (docs/23 §3 prototype). Loads /avatars, scrolls to the photo
// section (LAZY WebGL — cards only render when intersecting), waits for the
// three factories to build + their idle ticks to run, captures a per-card
// screenshot and dumps runtime state (renderer alive, tick contract, sockets).
// Usage: bun apps/avatars/test/photo_verify.ts  → /tmp/photo_av_*.png + summary
import { mkdirSync } from 'node:fs';

const PORT = 9451;
const PAGE = 'http://localhost:4173/avatars';

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/pav-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: any) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);

const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (t && !/favicon/.test(t)) errors.push(`[console.${m.params.type}] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      errors.push(`[log] ${m.params.entry.source}: ${m.params.entry.text}`);
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: PAGE }, sessionId);

const waitFor = async (expr: string, timeout = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

const ok = await waitFor(`document.querySelectorAll('#photoGrid .style-card--model').length >= 3`);
if (!ok) { console.error('FAIL: photo strip never built 3 cards'); console.log(errors.join('\n')); process.exit(1); }

// scroll the section into view and let the lazy renderers spin up + idle run
await send('Runtime.evaluate', { expression: `document.querySelector('#photoSection').scrollIntoView({ block: 'start' })` }, sessionId);
await new Promise(r => setTimeout(r, 2500));

const state = (await send('Runtime.evaluate', {
  expression: `(() => {
    const cards = window.__rwfPhotoAvatars ?? [];
    return cards.map((c) => ({
      name: c.card.querySelector('h3')?.textContent ?? '?',
      renderer: !!c.renderer,
      ctxLost: c.renderer ? c.renderer.getContext().isContextLost() : null,
      hasTick: typeof c.model?.userData?.tick === 'function',
      sockets: Object.keys(c.model?.userData?.sockets ?? {}),
      turntable: !!c.turn,
      phase: +(c.phase ?? 0).toFixed(2),
      renderMs: +(c.renderMs ?? 0).toFixed(2),
      rect: (() => { const r = c.card.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })(),
    }));
  })()`, returnByValue: true,
}, sessionId)).result.result.value;

mkdirSync('/tmp/photo_av', { recursive: true });
for (const [i, c] of state.entries()) {
  await send('Runtime.evaluate', { expression: `window.__rwfPhotoAvatars[${i}].card.scrollIntoView({ block: 'center' })` }, sessionId);
  // deterministic framing: face the camera, stop the turntable for the shot
  await send('Runtime.evaluate', { expression: `(() => { const e = window.__rwfPhotoAvatars[${i}]; e.spin = false; e.turn.rotation.y = 0; return 1; })()` }, sessionId);
  await new Promise(r => setTimeout(r, 700));
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: c.rect.x, y: c.rect.y, width: c.rect.w, height: c.rect.h, scale: 1 },
    captureBeyondViewport: true,
  }, sessionId);
  const slug = String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await Bun.write(`/tmp/photo_av/${i}_${slug}.png`, Buffer.from(shot.result.data, 'base64'));
}

console.log('PHOTO AVATAR CARDS:');
for (const c of state) {
  console.log(`  ${c.name} — renderer=${c.renderer} ctxLost=${c.ctxLost} tick=${c.hasTick} phase=${c.phase} renderMs=${c.renderMs} sockets=[${c.sockets.join(',')}]`);
}
const allOk = state.every((c: any) => c.renderer && !c.ctxLost && c.hasTick && c.phase > 0);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${state.length} cards, screenshots in /tmp/photo_av/`);
console.log(`CONSOLE ERRORS/WARNINGS: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
process.exit(allOk ? 0 : 1);
