// apps/avatars/test/geno_black_diag3.ts — is the black card a LOST WebGL context?
// Fresh chromium → browse the gallery top→bottom like a user (so lazy contexts
// accumulate) → per model card: gl.isContextLost() + framebuffer presence.
// Usage: bun apps/avatars/test/geno_black_diag3.ts
const PORT = 9459;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/genodiag-prof3', '--no-first-run', '--no-sandbox',
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
await send('Log.enable', {}, sessionId);

const events: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Log.entryAdded') {
      const en = m.params.entry;
      if (/context|WebGL/i.test(en.text) || /error|warning/i.test(en.level)) events.push(`[${en.level}] ${en.text}`.slice(0, 200));
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`);
await new Promise(r => setTimeout(r, 1500));

const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;

// founder-like browse: smooth-ish scroll through the WHOLE page in chunks,
// letting lazy contexts come and go naturally, ending at the model cards.
await send('Runtime.evaluate', {
  expression: `(async () => {
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 400) { scrollTo({ top: y }); await new Promise(r => setTimeout(r, 120)); }
    return true;
  })()`, awaitPromise: true, returnByValue: true,
}, sessionId);
await new Promise(r => setTimeout(r, 4000));

// now scroll to each model card in order, check context-lost + draw presence
const out = [];
for (let i = 0; i < names.length; i++) {
  await send('Runtime.evaluate', {
    expression: `(() => { document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }); return true; })()`,
    returnByValue: true,
  }, sessionId);
  const ok = await waitFor(`(() => { const e = window.__rwfModels[${i}]; return !!(e && e.renderer && (e.avatar || e.root3d)); })()`, 45000);
  if (!ok) { out.push({ i, name: names[i], never: true }); console.log(`### ${i}: ${names[i]} NEVER READY`); continue; }
  await new Promise(r => setTimeout(r, 700));
  const r = await send('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const e = window.__rwfModels[${i}];
      const gl = e.renderer.getContext();
      e.renderer.render(e.scene, e.cam);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let alpha = 0;
      for (let p = 0; p < W * H; p++) if (buf[p*4+3] >= 10) alpha++;
      // live context census across the page
      let live = 0, lost = 0;
      for (const c of document.querySelectorAll('canvas')) {
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) continue;
        if (g.isContextLost()) lost++; else live++;
      }
      return { lost: gl.isContextLost(), drawnPx: alpha, census: { live, lost } };
    })()`,
  }, sessionId);
  const v = r?.result?.result?.value;
  out.push({ i, name: names[i], ...v });
  console.log(`### ${i}: ${names[i]}  ctxLost=${v?.lost} drawnPx=${v?.drawnPx} census=${JSON.stringify(v?.census)}`);
}

console.log('\nBROWSER LOG (context/webgl):');
for (const e of events.slice(0, 20)) console.log('  ' + e);
await Bun.write('/tmp/genodiag/summary3.json', JSON.stringify(out, null, 2));
ws.close(); process.exit(0);
