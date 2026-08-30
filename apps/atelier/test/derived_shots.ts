// Visual capture of the derived outfit: build-up steps, full kit front/back/
// 3-4, walk mid-stride → apps/atelier/shots/*_derived.png
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = 9470;
const shotDir = new URL('../shots/', import.meta.url).pathname;
mkdirSync(shotDir, { recursive: true });
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-shots', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const errors: string[] = [];
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('boot failed', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
const ev = async (expression: string, awaitPromise = true) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId))?.result?.result?.value;

const save = async (name: string) => {
  const data = await ev('window.__atelier.snapshot()');
  if (!data?.startsWith('data:image/png')) { console.error('snapshot failed for', name); process.exit(1); }
  writeFileSync(shotDir + name, Buffer.from(data.slice(22), 'base64'));
  console.log('shot', name);
};

// settle: idle pose, no turntable drag artefacts — pause + fixed cameras
await ev(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); A.setAnim('idle'); return true; })()`);
await new Promise((r) => setTimeout(r, 500));

// build-up 0..6
for (let i = 0; i <= 6; i++) {
  await ev(`window.__atelier.setBuildStep(${i})`);
  await new Promise((r) => setTimeout(r, 150));
  await save(`buildup_derived_${i}.png`);
}
// full kit front / back / 3-4
await ev(`window.__atelier.setBuildStep(6)`);
await ev(`window.__atelier.homeCam()`);
await save('fullkit_derived_front.png');
await ev(`window.__atelier.setCam([0.55, 1.25, -2.9], [0, 0.92, 0])`);
await save('fullkit_derived_back.png');
await ev(`window.__atelier.setCam([2.1, 1.35, 2.1], [0, 0.92, 0])`);
await save('fullkit_derived_34.png');
// walk mid-stride, front + 3/4
await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0);
  av.root.updateMatrixWorld(true);
  window.__walkPlayer = p;
  return true;
})()`);
await new Promise((r) => setTimeout(r, 300));
await ev(`window.__atelier.setCam([0.55, 1.15, 2.9], [0, 0.92, 0])`);
await save('fullkit_derived_walk_front.png');
await ev(`window.__atelier.setCam([2.1, 1.35, 2.1], [0, 0.92, 0])`);
await save('fullkit_derived_walk_34.png');
// isolation shots: shirt / shorts (hole check)
await ev(`window.__atelier.setAnim('idle'); window.__atelier.isolate('tshirt')`);
await ev(`window.__atelier.homeCam()`);
await save('iso_derived_tshirt.png');
await ev(`window.__atelier.isolate('shorts')`);
await save('iso_derived_shorts.png');
await ev(`window.__atelier.isolate('waistband')`);
await save('iso_derived_band.png');
await ev(`window.__atelier.isolate(null)`);
await ev(`window.__walkPlayer?.stop()`);

console.log('consoleErrors:', JSON.stringify(errors));
await send('Browser.close', {}).catch(() => {});
