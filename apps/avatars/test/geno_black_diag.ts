// apps/avatars/test/geno_black_diag.ts — find the Geno-family card that renders BLACK.
// Method: headless chromium + CDP → scroll each Geno model card into view (lazy
// renderer fires), render one frame, readPixels the whole framebuffer, and
// classify pixels: chromatic (tinted figure) vs neutral-dark vs light. A card
// whose figure renders black = tinted-card with ~zero chromatic pixels and a
// dark neutral foreground cluster. Also saves a per-card clip screenshot PNG
// for eyeball verification.
// Usage: bun apps/avatars/test/geno_black_diag.ts   → /tmp/genodiag/*.png + JSON
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/genodiag', { recursive: true });

const PORT = 9457;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/genodiag-prof', '--no-first-run', '--no-sandbox',
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
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0 && [...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Geno'))`);
await new Promise(r => setTimeout(r, 2000));

// names aligned with __rwfModels indices (all MODELS entries become cards, in order)
const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;

// The Geno family + soldier control
const wanted = [];
for (let i = 0; i < names.length; i++) if (/geno|soldier/i.test(names[i])) wanted.push(i);

// in-page pixel probe: render the card's own scene once, readPixels, classify
const probeExpr = (i) => `(async () => {
  const e = window.__rwfModels[${i}];
  if (!e) return { error: 'no entry' };
  if (!e.avatar && !e.root3d) return { error: 'model not loaded yet' };
  if (!e.renderer) return { error: 'renderer not created (off-screen?)' };
  e.renderer.render(e.scene, e.cam);
  const gl = e.renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let chroma = 0, lit = 0, dark = 0, alpha = 0, litSum = 0;
  let cr = 0, cg = 0, cb = 0;              // mean of chromatic pixels
  let dr = 0, dg = 0, db = 0;              // mean of dark-neutral pixels
  for (let p = 0; p < W * H; p++) {
    const a = buf[p*4+3]; if (a < 10) continue;      // transparent canvas → CSS behind
    const r = buf[p*4], g = buf[p*4+1], b = buf[p*4+2];
    alpha++;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    const lum = 0.299*r + 0.587*g + 0.114*b;
    if (d > 25) { chroma++; cr += r; cg += g; cb += b; }
    else if (lum < 55) { dark++; dr += r; dg += g; db += b; }
    else { lit++; litSum += lum; }
  }
  const n = Math.max(1, alpha);
  return {
    W, H,
    pct: {
      drawn: +(100*alpha/n).toFixed(1),
      chroma: +(100*chroma/n).toFixed(1),
      litNeutral: +(100*lit/n).toFixed(1),
      darkNeutral: +(100*dark/n).toFixed(1),
    },
    chromaRGB: chroma ? [Math.round(cr/chroma), Math.round(cg/chroma), Math.round(cb/chroma)] : null,
    darkRGB: dark ? [Math.round(dr/dark), Math.round(dg/dark), Math.round(db/dark)] : null,
  };
})()`;

const results = [];
for (const i of wanted) {
  // scroll THIS card into view (lazy IntersectionObserver → renderer + auto-BVH)
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; c.scrollIntoView({ block: 'center' }); return true; })()`,
    returnByValue: true,
  }, sessionId);
  // wait until this card has a renderer + a loaded model, settle for BVH card
  await waitFor(`(() => { const e = window.__rwfModels[${i}]; return e && e.renderer && (e.avatar || e.root3d); })()`, 30000);
  await new Promise(r => setTimeout(r, 3500));

  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: probeExpr(i) }, sessionId);
  const v = r?.result?.result?.value;
  results.push({ i, name: names[i], ...(v ?? { error: r?.result?.exception?.description ?? 'no value' }) });
  console.log(`\n### ${i}: ${names[i]}`);
  console.log('  ', JSON.stringify(v ?? r?.result?.exception?.description));

  // clip screenshot of the card for eyeballs
  const rect = (await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 340) }; })()`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
  }, sessionId);
  const slug = names[i].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  await Bun.write(`/tmp/genodiag/${String(i).padStart(2, '0')}_${slug}.png`, Buffer.from(shot.result.data, 'base64'));
}

await Bun.write('/tmp/genodiag/summary.json', JSON.stringify(results, null, 2));
console.log('\nCONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 12)) console.log('  ' + e.slice(0, 240));
console.log('\nsaved /tmp/genodiag/*.png + summary.json');
ws.close(); process.exit(0);
