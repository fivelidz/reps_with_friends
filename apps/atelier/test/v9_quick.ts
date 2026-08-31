// quick one-shot CDP eval — prints the raw return of any expression
// Usage: bun apps/atelier/test/v9_quick.ts '<expr file or inline>'
const PORT = 9577;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v9-quick', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? '').slice(0, 1200));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
if (process.argv.includes('--reduced')) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
}
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
await new Promise((r) => setTimeout(r, 900));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.exception?.text ?? '').slice(0, 1500) };
  if (r?.result?.result?.value === undefined) return { __raw: JSON.stringify(r?.result ?? r).slice(0, 800) };
  return r?.result?.result?.value;
};
const argv = process.argv.slice(2).filter((a) => a !== '--reduced');
const expr = argv[0] === '-f'
  ? (await Bun.file(argv[1]).text())
  : (argv[0] ?? '1+1');
const out = await ev(expr);
if (typeof out === "string" && out.startsWith("data:image")) await Bun.write("/tmp/v9_waist_now.png", Buffer.from(out.split(",")[1], "base64"));
console.log(typeof out === 'object' ? JSON.stringify(out, null, 1) : out);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
