// PIXEL-LEVEL pose test through the REAL dropdown (change event) — do poses
// visibly move on screen? Diffs renderer pixels 700 ms apart for each pose.
// Usage: bun apps/atelier/test/pose_pixels_v7.ts
const PORT = 9543;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-pose-pixels', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 300));
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
await new Promise((r) => setTimeout(r, 800));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

const res = await ev(`(async () => {
  const A = window.__atelier;
  const sel = document.getElementById('animSel');
  // pixel grab straight off the canvas (same-JS-task, preserves buffer)
  const grab = async () => {   // atelier snapshot(): render + toDataURL same task
    const img = new Image(); img.src = A.snapshot();
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, 160, 120);
    return ctx.getImageData(0, 0, 160, 120).data;
  };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]-b[i]) > 12 || Math.abs(a[i+1]-b[i+1]) > 12 || Math.abs(a[i+2]-b[i+2]) > 12) n++; } return n; };
  A.setTurntable(false); A.play(); A.homeCam();
  const out = {};
  const pick = async (id) => {
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 400));
    const a = await grab();
    await new Promise((r) => setTimeout(r, 700));
    const b = await grab();
    out[id] = { changedPx: diff(a, b), paused: A.state.paused, animId: A.state.animId, t: +A.state.t.toFixed(2) };
  };
  await pick('squat');
  await pick('pushup');
  await pick('jumpingjack');
  await pick('curl');
  await pick('clip:walk');
  await pick('squat');   // clip → pose again, via the dropdown
  return out;
})()`);
console.log('PIXEL diff over 0.7 s per selection (of 19200 sampled px, >200 = clearly moving):');
console.log(JSON.stringify(res, null, 1));
console.log('console errors:', errors.length, errors.slice(0, 5));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
