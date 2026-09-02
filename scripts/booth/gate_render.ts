// scripts/booth/gate_render.ts — PHOTO BOOTH stage-3 gate runner (headless).
// Spawns chromium (swiftshader), loads /booth/gate.html?module=<name>, waits
// for the page's contract checks (render, tick, sockets, NaN sweep), captures
// a deterministic screenshot, prints a one-line JSON verdict to stdout.
// Exit 0 = page OK (pixel analysis happens after, in python).
//
// Usage: bun scripts/booth/gate_render.ts <module.js> <out.png> [base=http://localhost:4173] [port=9461] [export=createBoothModel]

const [moduleArg = '', outArg = '', baseArg = 'http://localhost:4173', portArg = '9461', exportArg = ''] = process.argv.slice(2);
if (!moduleArg || !outArg) { console.error('usage: gate_render.ts <module.js> <out.png> [base] [port] [export]'); process.exit(2); }
const PORT = +portArg;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=500,620', '--user-data-dir=/tmp/booth-gate-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise(r => setTimeout(r, 250)); info = await ver(); }
}
if (!info) { console.log(JSON.stringify({ ok: false, stage: 'chromium', error: 'chromium never came up' })); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = () => res(null); ws.onerror = () => rej(new Error('ws')); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: any) =>
  new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

const pageErrors: string[] = [];
ws.addEventListener('message', e => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?');
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `${baseArg}/booth/gate.html?module=${encodeURIComponent(moduleArg)}${exportArg ? `&export=${encodeURIComponent(exportArg)}` : ''}` }, sessionId);

// wait for the gate page's own verdict (OK/ERR), 60s cap (module fetch + compile)
let gate: any = null;
const t0 = Date.now();
while (Date.now() - t0 < 60_000) {
  await new Promise(r => setTimeout(r, 400));
  const r = await send('Runtime.evaluate', { expression: 'window.__gate && window.__gate.status !== "BOOT" ? JSON.stringify(window.__gate) : null', returnByValue: true }, sessionId);
  const v = r?.result?.result?.value;
  if (v) { gate = JSON.parse(v); break; }
}
if (!gate) { console.log(JSON.stringify({ ok: false, stage: 'page', error: 'gate page never reported (timeout)', pageErrors })); process.exit(1); }

let shot = '';
if (gate.status === 'OK') {
  await new Promise(r => setTimeout(r, 150)); // settle a frame
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  shot = s.result?.data ?? '';
  if (shot) await Bun.write(outArg, Buffer.from(shot, 'base64'));
}
await send('Target.closeTarget', { targetId }).catch(() => {});
try { ws.close(); } catch {}

console.log(JSON.stringify({ ok: gate.status === 'OK', stage: 'page', status: gate.status, stats: gate.stats, shot: shot ? outArg : null, pageErrors }));
process.exit(gate.status === 'OK' ? 0 : 1);
