// v6 VISUAL CAPTURE — contour hems + graded offsets + frog head:
// build-up steps, full kit front/back/3-4, walk mid-stride, and ZOOMED
// detail close-ups of every finished opening (hem edges, collar ribs,
// waistband lip) → apps/atelier/shots/*_v6.png
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = 9541;
const shotDir = new URL('../shots/', import.meta.url).pathname;
mkdirSync(shotDir, { recursive: true });
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-shots-v6', '--no-first-run', '--no-sandbox',
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('boot failed', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 900));
const ev = async (expression: string) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId))?.result?.result?.value;
const save = async (name: string) => {
  const data = await ev('window.__atelier.snapshot()');
  if (!data?.startsWith('data:image/png')) { console.error('snapshot failed for', name); process.exit(1); }
  writeFileSync(shotDir + name, Buffer.from(data.slice(22), 'base64'));
  console.log('shot', name);
};

// settle: idle pose, no turntable artefacts — pause + fixed cameras
await ev(`(() => { const A = window.__atelier; A.pause(); A.setTurntable(false); A.setAnim('idle'); return true; })()`);
await new Promise((r) => setTimeout(r, 600));

// build-up 0..6 (full kit = frog head + garments)
for (let i = 0; i <= 6; i++) {
  await ev(`window.__atelier.setBuildStep(${i})`);
  await new Promise((r) => setTimeout(r, 180));
  await save(`buildup_v6_${i}.png`);
}
// full kit front / back / 3-4 (frog head + crown visible)
await ev(`window.__atelier.setBuildStep(6)`);
await ev(`window.__atelier.homeCam()`);
await save('fullkit_v6_front.png');
await ev(`window.__atelier.setCam([0.55, 1.25, -2.9], [0, 0.92, 0])`);
await save('fullkit_v6_back.png');
await ev(`window.__atelier.setCam([2.1, 1.35, 2.1], [0, 0.92, 0])`);
await save('fullkit_v6_34.png');

// walk mid-stride, front + 3-4 (frog tracks the clip)
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
await new Promise((r) => setTimeout(r, 400));
await ev(`window.__atelier.setCam([0.55, 1.15, 2.9], [0, 0.92, 0])`);
await save('fullkit_v6_walk_front.png');
await ev(`window.__atelier.setCam([2.1, 1.35, 2.1], [0, 0.92, 0])`);
await save('fullkit_v6_walk_34.png');
await ev(`window.__walkPlayer?.stop(); window.__atelier.setAnim('idle')`);
await new Promise((r) => setTimeout(r, 400));

// ── DETAIL CLOSE-UPS: every finished opening, camera zoomed ────────────────
// (positions from the live ring geometry — stand pose, world space)
const closeups: [string, number[], number[]][] = [
  ['detail_v6_shirt_hem.png', [0.30, 1.02, 0.75], [0, 0.90, 0.04]],       // hem lip + band top layering
  ['detail_v6_collar.png', [0.22, 1.56, 0.42], [0, 1.44, 0.02]],          // ribbed collar band
  ['detail_v6_sleeve_L.png', [0.55, 1.28, 0.45], [0.19, 1.16, 0.0]],      // sleeve hem ring + band
  ['detail_v6_sleeve_R.png', [-0.55, 1.28, 0.45], [-0.19, 1.16, 0.0]],
  ['detail_v6_shorts_hem_L.png', [0.34, 0.70, 0.55], [0.13, 0.585, 0.0]],  // leg hem ring, edge-on
  ['detail_v6_shorts_hem_R.png', [-0.34, 0.70, 0.55], [-0.13, 0.585, 0.0]],
  ['detail_v6_waistband.png', [0.24, 1.00, 0.55], [0, 0.90, 0.03]],       // band lip over the shorts shell
  ['detail_v6_shirt_hem_back.png', [0.30, 1.02, -0.75], [0, 0.90, -0.04]],
];
for (const [name, pos, tgt] of closeups) {
  await ev(`window.__atelier.setCam(${JSON.stringify(pos)}, ${JSON.stringify(tgt)})`);
  await new Promise((r) => setTimeout(r, 200));
  await save(name);
}
// frog head close-up (crown + eyes)
await ev(`window.__atelier.setCam([0.45, 1.75, 0.85], [0, 1.55, 0])`);
await new Promise((r) => setTimeout(r, 200));
await save('detail_v6_frog_head.png');

// isolation shots (hole check) + head isolation
await ev(`window.__atelier.setAnim('idle'); window.__atelier.homeCam()`);
await ev(`window.__atelier.isolate('tshirt')`);
await save('iso_v6_tshirt.png');
await ev(`window.__atelier.isolate('shorts')`);
await save('iso_v6_shorts.png');
await ev(`window.__atelier.isolate('waistband')`);
await save('iso_v6_band.png');
await ev(`window.__atelier.isolate('head')`);
await save('iso_v6_head.png');
await ev(`window.__atelier.isolate(null)`);

// species variants (frog colours + goblin/robot)
await ev(`window.__atelier.setFrogSkin('azure')`);
await ev(`window.__atelier.setCam([0.45, 1.75, 0.85], [0, 1.55, 0])`);
await save('detail_v6_frog_azure.png');
await ev(`window.__atelier.setFrogSkin('green')`);
await ev(`window.__atelier.setHead('goblin'); window.__atelier.homeCam()`);
await new Promise((r) => setTimeout(r, 200));
await save('fullkit_v6_goblin.png');
await ev(`window.__atelier.setHead('robot')`);
await new Promise((r) => setTimeout(r, 200));
await save('fullkit_v6_robot.png');
await ev(`window.__atelier.setHead('frog')`);

console.log('consoleErrors:', JSON.stringify(errors));
await send('Browser.close', {}).catch(() => {});
