// Dump per-stage landmark PAGE-PIXEL positions (projected through each card's
// live camera) for the python pixel verifier. Companion to creature-shot.ts.
// Usage: bun apps/avatars/test/creature-landmarks.ts  → /tmp/creature_landmarks.json
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
const ev = async (expression: string) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId))?.result?.result?.value;

await send('Page.navigate', { url: PAGE }, sessionId);
await new Promise(r => setTimeout(r, 4000));
await ev(`document.getElementById('creatureSection')?.scrollIntoView({block:'start'})`);
await new Promise(r => setTimeout(r, 1200));

// freeze at the same mid-downstroke frame the screenshots use
await ev(`window.__creatures.setAnim('flap'); window.__creatures.playing = false; window.__creatures.freeze(0.62); 'ok'`);
await new Promise(r => setTimeout(r, 600));

const data = await ev(`(() => {
  const out = [];
  const sec = document.getElementById('creatureSection').getBoundingClientRect();
  const secRect = { x: sec.left + scrollX, y: sec.top + scrollY, w: sec.width, h: sec.height };
  for (const c of window.__creatures.cards) {
    const lm = c.landmarks();
    const proj = {};
    for (const [k, v] of Object.entries(lm)) {
      if (!v) { proj[k] = null; continue; }
      const p = c.project(v[0], v[1], v[2]);
      proj[k] = { page: [Math.round(p.x), Math.round(p.y)], world: v.map((n) => +n.toFixed(3)) };
    }
    out.push({ stage: c.stage, rect: c.rect(), landmarks: proj });
  }
  return { secRect, cards: out };
})()`);

await Bun.write('/tmp/creature_landmarks.json', JSON.stringify(data, null, 2));
console.log('landmarks dumped:', data.cards.map((d: any) => d.stage).join(', '));
ws.close(); process.exit(0);
