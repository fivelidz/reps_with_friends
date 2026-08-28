// apps/avatars/test/geno_black_diag2.ts — pixel-probe ONLY (screenshots come
// separately via full-page captureBeyondViewport, which composites WebGL
// correctly; clip screenshots render the canvas as solid background).
// Classifies each Geno-family card's framebuffer: chromatic vs dark-neutral.
// Usage: bun apps/avatars/test/geno_black_diag2.ts |& tee /tmp/genodiag/run2.log
const PORT = 9458;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/genodiag-prof2', '--no-first-run', '--no-sandbox',
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

const wanted = [];
for (let i = 0; i < names.length; i++) if (/geno/i.test(names[i])) wanted.push(i);

const probeExpr = (i) => `(async () => {
  const e = window.__rwfModels[${i}];
  if (!e) return { error: 'no entry' };
  if (!e.avatar && !e.root3d) return { error: 'model not loaded yet' };
  if (!e.renderer) return { error: 'renderer not created' };
  e.renderer.render(e.scene, e.cam);
  const gl = e.renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let chroma = 0, lit = 0, dark = 0, alpha = 0;
  let cr = 0, cg = 0, cb = 0, dr = 0, dg = 0, db = 0;
  for (let p = 0; p < W * H; p++) {
    const a = buf[p*4+3]; if (a < 10) continue;
    const r = buf[p*4], g = buf[p*4+1], b = buf[p*4+2];
    alpha++;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    const lum = 0.299*r + 0.587*g + 0.114*b;
    if (d > 25) { chroma++; cr += r; cg += g; cb += b; }
    else if (lum < 55) { dark++; dr += r; dg += g; db += b; }
    else lit++;
  }
  const n = Math.max(1, alpha);
  return {
    pct: { chroma: +(100*chroma/n).toFixed(1), litNeutral: +(100*lit/n).toFixed(1), darkNeutral: +(100*dark/n).toFixed(1) },
    chromaRGB: chroma ? [Math.round(cr/chroma), Math.round(cg/chroma), Math.round(cb/chroma)] : null,
    darkRGB: dark ? [Math.round(dr/dark), Math.round(dg/dark), Math.round(db/dark)] : null,
  };
})()`;

// warm the model cache once so per-card probes don't include load latency:
// scroll to the first Geno card and wait for it, then walk the list.
const results = [];
for (const i of wanted) {
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; c.scrollIntoView({ block: 'center' }); return true; })()`,
    returnByValue: true,
  }, sessionId);
  const ok = await waitFor(`(() => { const e = window.__rwfModels[${i}]; return !!(e && e.renderer && (e.avatar || e.root3d)); })()`, 45000);
  if (!ok) { console.log(`### ${i}: ${names[i]} — NEVER READY`); results.push({ i, name: names[i], error: 'never ready' }); continue; }
  await new Promise(r => setTimeout(r, 1200));
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: probeExpr(i) }, sessionId);
  const v = r?.result?.result?.value;
  console.log(`### ${i}: ${names[i]}`);
  console.log('   ' + JSON.stringify(v ?? { err: String(r?.result?.exception?.description).slice(0, 200) }));
  results.push({ i, name: names[i], ...(v ?? {}) });
}

await Bun.write('/tmp/genodiag/summary2.json', JSON.stringify(results, null, 2));
console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 12)) console.log('  ' + e.slice(0, 240));
ws.close(); process.exit(0);
