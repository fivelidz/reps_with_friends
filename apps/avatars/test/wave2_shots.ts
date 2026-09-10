// wave2_shots.ts — verify + screenshot the meshy.ai wave-2 ASSET VAULT on
// /avatars (meshy2_shots.ts pattern: absolute scrollTo + page-space clip +
// captureBeyondViewport + page-truth via the __rwfVault hook).
//
// Checks per asset: GLB loaded (entry.ok), bounding-box + matrix FINITE
// (the NaN gate — no rigged walk deltas this wave: rigs were blocked by the
// credit balance, see site/models/meshy/manifest_wave2.json).
// Usage: bun apps/avatars/test/wave2_shots.ts
const PORT = 9488;
const errors: string[] = [];
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/wave2-shots', '--no-first-run', '--no-sandbox',
    '--disable-extensions', // a local extension injects page-script.js into every page and logs a console error — not ours
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push(m.params.args?.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') errors.push(String(m.params.entry.text).slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails?.exception?.description ?? 'exception').slice(0, 200));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
  if (m.method === 'Network.loadingFailed') errors.push(`NETFAIL ${m.params.errorText} ${m.params.type ?? ''}`);
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(5000);

// scroll through the page once so every strip's lazy contexts + loads fire
const pageH = await ev(`document.body.scrollHeight`, sessionId);
for (let y = 0; y < pageH; y += 800) { await send('Runtime.evaluate', { expression: `scrollTo({top:${y}})`, sessionId }); await sleep(350); }

// page-truth inventory of the vault
const inv = await ev(`JSON.stringify((window.__rwfVault ?? []).map((e, i) => {
  return { i, id: e.A?.id, ok: e.ok, hasModel: !!e.model, spin: e.spin, renderMs: +(e.renderMs ?? 0).toFixed(1),
           blurb: e.card?.querySelector('.style-blurb')?.textContent?.slice(0, 60) };
}))`, sessionId);
console.log('INV', inv);

// NaN/finite gate + per-card screenshots
const cards = JSON.parse(inv ?? '[]');
for (const c of cards) {
  const check = await ev(`(() => {
    const e = (window.__rwfVault ?? [])[${c.i}];
    if (!e?.ok || !e.model) return { loaded: false };
    let nan = 0, count = 0, min = 1e9, max = -1e9;
    e.model.updateMatrixWorld(true);
    e.model.traverse((o) => {
      const el = o.matrixWorld?.elements;
      if (!el) return;
      for (const v of el) { count++; if (!Number.isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
    });
    const p = new (e.model.position.constructor)();
    e.model.getWorldPosition(p);
    return { loaded: true, matricesChecked: count, nan, worldY: +p.y.toFixed(3) };
  })()`, sessionId);
  console.log('CHECK', c.id, JSON.stringify(check));
  const geo = await ev(`(() => { const el = document.querySelectorAll('#vaultGrid .style-card--model')[${c.i}]; const r = el.getBoundingClientRect(); return { top: r.top + scrollY, x: r.x, w: r.width, h: r.height }; })()`, sessionId);
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(geo.top - 200)} })` }, sessionId);
  await sleep(2200);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: geo.x, y: geo.top, width: geo.w, height: Math.min(geo.h, 980), scale: 1 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(`apps/avatars/screenshots/wave2_${c.id.replace('wave2-', '')}.png`, Buffer.from(s.result.data, 'base64'));
  await Bun.write(`/tmp/wave2_${c.id.replace('wave2-', '')}.png`, Buffer.from(s.result.data, 'base64'));
  console.log(`shot wave2_${c.id.replace('wave2-', '')}.png`);
}

// full vault section shot
const secGeo = await ev(`(() => { const el = document.getElementById('vaultSection'); const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: el.offsetHeight }; })()`, sessionId);
await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(secGeo.top - 80)} })` }, sessionId);
await sleep(2500);
const sec = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: secGeo.top, width: 1440, height: Math.min(secGeo.h, 1400), scale: 0.8 }, captureBeyondViewport: true }, sessionId);
await Bun.write('apps/avatars/screenshots/wave2_vault_section.png', Buffer.from(sec.result.data, 'base64'));
console.log('shot wave2_vault_section.png');

console.log('CONSOLE_ERRORS', errors.length);
for (const e of errors) console.log('ERR:', e);
ws.close(); process.exit(0);
