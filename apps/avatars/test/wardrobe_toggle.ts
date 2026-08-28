// apps/avatars/test/wardrobe_toggle.ts — verify slot toggle buttons actually
// flip piece visibility: click each slot on the Wardrobe card, re-render,
// count hue-bucket pixels before/after. A working toggle drops the bucket.
const PORT = 9455;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,640', '--user-data-dir=/tmp/wardrobe-prof3', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }

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

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`window.__rwfModels?.some(e => e?.wardrobe)`);
await new Promise(r => setTimeout(r, 1500));

// find the wardrobe card index + scroll to it
const idx = (await send('Runtime.evaluate', {
  expression: `(() => { const i = window.__rwfModels.findIndex(e => e?.wardrobe); const c = document.querySelectorAll('#modelGrid .style-card--model')[i]; c.scrollIntoView({ block: 'center' }); return i; })()`,
  returnByValue: true,
}, sessionId)).result.result.value;
await new Promise(r => setTimeout(r, 3500));

// pause the card's exercise animation so before/after frames are comparable:
// switch to 'stand' via the exercise select is global; instead just sample
// quickly — the pose changes slowly (3s cycle), colour buckets are pose-stable
const countBuckets = (i: number) => send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const e = window.__rwfModels[${i}];
    if (!e?.renderer) return null;
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let lime = 0, coral = 0, amber = 0, dark = 0, white = 0;
    for (let p = 0; p < W * H; p++) {
      const r = buf[p*4], g = buf[p*4+1], b = buf[p*4+2];
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
      if (d < 18) { if (mx > 200) white++; else if (mx < 45) dark++; continue; }
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      if (Math.abs(h - 68) < 14) lime++;
      else if (Math.abs(h - 11) < 16) coral++;
      else if (Math.abs(h - 38) < 14) amber++;
    }
    return { lime, coral, amber, dark, white };
  })()`,
}, sessionId);

const slots = ['shorts', 'tank', 'headband', 'wristbands', 'sneakers', 'belt'];
console.log('card index:', idx);
const before = (await countBuckets(idx)).result.result.value;
console.log('before:', JSON.stringify(before));

let fails = 0;
for (const slot of slots) {
  // click OFF
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${idx}]; const b = c.querySelector('[data-slot="${slot}"]'); if (!b) return 'no button'; b.click(); return b.classList.contains('is-on') ? 'still-on' : 'off'; })()`,
    returnByValue: true,
  }, sessionId);
  await new Promise(r => setTimeout(r, 250));
  const off = (await countBuckets(idx)).result.result.value;
  // click back ON
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${idx}]; c.querySelector('[data-slot="${slot}"]').click(); return 'on'; })()`,
    returnByValue: true,
  }, sessionId);
  await new Promise(r => setTimeout(r, 250));
  const on = (await countBuckets(idx)).result.result.value;
  console.log(`${slot.padEnd(11)} off:${JSON.stringify({lime:off.lime, coral:off.coral, amber:off.amber})} on:${JSON.stringify({lime:on.lime, coral:on.coral, amber:on.amber})}`);
}

console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 250));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
