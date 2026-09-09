// meshy2_shots.ts — screenshot the Meshy model cards on /avatars (geno_shot.ts pattern:
// absolute scrollTo + page-space clip + captureBeyondViewport + joint dump).
// Usage: bun apps/avatars/test/meshy2_shots.ts   → apps/avatars/screenshots/*_meshy2.png
const PORT = 9486;
const errors: string[] = [];
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/meshy2-shots', '--no-first-run', '--no-sandbox',
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
};
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await sleep(4500);

// page-truth inventory: card index, title, entry state from the page's own registry
const inv = await ev(`JSON.stringify([...document.querySelectorAll('#modelGrid .style-card--model')].map((c, i) => {
  const e = window.__rwfModels?.[i];
  return { i, t: c.querySelector('h3')?.textContent, ok: e?.ok ?? null, hasAvatar: !!e?.avatar, bvh: e?.bvh ? e.bvh.clip?.duration : null };
}))`, sessionId);
console.log('INV', inv);

const cards = JSON.parse(inv ?? '[]');
const want = [
  { match: 'Athlete — meshy', out: 'meshy_athlete_card_meshy2' },
  { match: 'Heavyweight — meshy', out: 'meshy_heavy_card_meshy2' },
  { match: 'Sprinter — meshy', out: 'meshy_slim_card_meshy2' },
  { match: 'Frog — meshy', out: 'meshy_frog_card_meshy2' },
  { match: 'Arena podium', out: 'meshy_arena_card_meshy2' },
];
for (const w of want) {
  const c = cards.find((x: any) => (x.t ?? '').includes(w.match));
  if (!c) { console.log('MISS', w.match); continue; }
  const geo = await ev(`(() => { const el = document.querySelectorAll('#modelGrid .style-card--model')[${c.i}]; const r = el.getBoundingClientRect(); return { top: r.top + scrollY, x: r.x, w: r.width, h: r.height }; })()`, sessionId);
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(geo.top - 200)} })` }, sessionId);
  await sleep(3600);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: geo.x, y: geo.top, width: geo.w, height: Math.min(geo.h, 980), scale: 1 }, captureBeyondViewport: true }, sessionId);
  await Bun.write(`apps/avatars/screenshots/${w.out}.png`, Buffer.from(s.result.data, 'base64'));
  await Bun.write(`/tmp/${w.out}.png`, Buffer.from(s.result.data, 'base64'));
  const jd = await ev(`(() => {
    const e = window.__rwfModels?.[${c.i}];
    if (!e || !e.avatar) return null;
    const B = e.avatar.bones, sc = e.avatar.root.scale.x || 1;
    const p = (b) => b ? +(b.matrixWorld.elements[13] / sc).toFixed(3) : null;
    return { ok: e.ok, bvhT: e.bvh ? +e.bvh.time.toFixed(2) : null, hipsY: p(B.hips), handLY: p(B.handL), footLY: p(B.footL), footRY: p(B.footR) };
  })()`, sessionId);
  console.log(`shot ${w.out}.png`, JSON.stringify(jd));
}
console.log('CONSOLE_ERRORS', errors.length);
for (const e of errors) console.log('ERR:', e);
ws.close(); process.exit(0);
