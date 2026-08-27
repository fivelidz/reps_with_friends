// Screenshot + verify the CREATURES section of /avatars (see creature-rig.js /
// dragon2.js). Binding verification loop from the post-mortem: screenshot →
// look → fix. This script produces the screenshots and checks console errors
// and the lazy-WebGL-context contract; pixel contrast is measured separately
// (python) against these PNGs.
//
// Usage: bun apps/avatars/test/creature-shot.ts
//   → /tmp/creature_<anim>.png    (section shot, all 3 stages, per animation)
//   → /creature_stage_<id>.png    (per-stage close-up, flap mid-downstroke)
//   → prints console errors + lazy-context audit; exit 1 on failure

const PORT = 9449;
const PAGE = 'http://localhost:4173/avatars';

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/creashot-prof', '--no-first-run', '--no-sandbox',
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
await send('Network.enable', {}, sessionId);
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
await send('Runtime.enable', {}, sessionId);

// console error capture
const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      errors.push(`console.${m.params.type}: ` + m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('log: ' + m.params.entry.text);
    }
  } catch {}
});
await send('Log.enable', {}, sessionId);

const ev = async (expression: string) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId))?.result?.result?.value;

await send('Page.navigate', { url: PAGE }, sessionId);
await new Promise(r => setTimeout(r, 4000));

// scroll the creatures section into view and let lazy contexts spin up
await ev(`document.getElementById('creatureSection')?.scrollIntoView({block:'start'})`);
await new Promise(r => setTimeout(r, 1500));

const rectOf = (sel: string) => ev(`(() => { const el = document.querySelector('${sel}'); if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);

async function clipShot(sel: string, out: string) {
  const r = await rectOf(sel);
  if (!r) { console.error('no rect for', sel); return; }
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
  }, sessionId);
  await Bun.write(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out, `${Math.round(r.w)}x${Math.round(r.h)}`);
}

const ready = await ev(`!!window.__creatures`);
console.log('creatures module ready:', ready);

// 1) per-animation section shots (mid-frame frozen for comparability)
for (const anim of ['idle', 'flap', 'walk']) {
  await ev(`window.__creatures.setAnim(${JSON.stringify(anim)}); window.__creatures.playing = true; 'ok'`);
  await new Promise(r => setTimeout(r, 2300)); // run into the animation
  await ev(`window.__creatures.freeze(${anim === 'flap' ? 0.62 : 0.5})`);
  await new Promise(r => setTimeout(r, 500));
  await clipShot('#creatureSection', `/tmp/creature_${anim}.png`);
}

// 2) per-stage close-ups on the hero loop, mid-downstroke
await ev(`window.__creatures.setAnim('flap'); window.__creatures.freeze(0.62); 'ok'`);
await new Promise(r => setTimeout(r, 400));
for (const st of ['hatchling', 'fledgling', 'elder']) {
  await clipShot(`#creatureGrid [data-stage="${st}"]`, `/tmp/creature_stage_${st}.png`);
}

// 3) lazy-WebGL-context contract: off-screen → released after 3s; back → recreated
await ev(`scrollTo({top: 0})`);
await new Promise(r => setTimeout(r, 4000));
const offCount = await ev(`window.__creatures.canvasCount()`);
await ev(`document.getElementById('creatureSection')?.scrollIntoView({block:'start'})`);
await new Promise(r => setTimeout(r, 1200));
const onCount = await ev(`window.__creatures.canvasCount()`);
console.log(`lazy contexts: off-screen=${offCount} (want 0), back=${onCount} (want 3)`);

// 4) measured silhouette ratios straight from the live rigs
for (const c of await ev(`window.__creatures.cards.map(c => ({ stage: c.stage, ...c.dragon.measure() }))`) ?? []) {
  console.log(`measure ${c.stage}: wings ${c.wingRatio.toFixed(2)}x body, neck ${c.neckTorso.toFixed(2)}x torso, tail ${c.tailBody.toFixed(2)}x body`);
}

console.log(errors.length ? `CONSOLE ERRORS (${errors.length}):\n` + errors.join('\n') : 'console: clean');
ws.close();
process.exit(errors.length || offCount !== 0 || onCount !== 3 ? 1 : 0);
