// gallery debug — health-check the frog gallery's 2D canvas cells directly
// (per-cell bright/greenish/pale counts after the linear→sRGB blit).
// Usage: bun apps/atelier/test/frog_gallery_debug.ts
const PORT = 9549;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-frog-dbg', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 700));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

const out = await ev(`(() => {
  const A = window.__atelier;
  A.buildFrogGallery();
  const c = document.getElementById('frogGallery');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const x0 = 8 + i * (132 + 8);
    let bright = 0, greenish = 0, pale = 0, tot = 0;
    for (let y = 8; y < 8 + 132; y++) for (let x = x0; x < x0 + 132; x++) {
      const p = (y * W + x) * 4; tot++;
      const r = d[p], g = d[p + 1], b = d[p + 2];
      if (r + g + b > 220) bright++;
      if (g > r && g > b && g > 50) greenish++;
      if (r > 150 && g > 150 && b > 90) pale++;
    }
    cells.push({ bright, greenish, pale, tot });
  }
  return { size: [W, H], galleryInfo: A.galleryInfo(), cells };
})()`);
if (out?.__exc) { console.error('EXC', out.__exc); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
console.log('console errors:', errors.length, errors.slice(0, 3));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
