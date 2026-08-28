// apps/avatars/test/geno_shot.ts — screenshot the Geno/Cranberry region of the
// model-characters grid (lazy WebGL respected: scroll card-by-card, serialised
// context release). Usage: bun apps/avatars/test/geno_shot.ts [label] [waitMs]
// → /tmp/geno_<label>.png (+ per-card clips in /tmp/geno_cards/)
import { mkdirSync } from 'node:fs';

const PORT = 9451;
const LABEL = process.argv[2] ?? 'a';
const WAIT = Number(process.argv[3] ?? 4200);

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,640', '--user-data-dir=/tmp/geno-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params = {}, sessionId?: string) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
// never screenshot a stale avatars.js/model-avatars.js after a server-side fix
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);

const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[console.${m.params.type}] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      errors.push(`[log] ${m.params.entry.source}: ${m.params.entry.text}`);
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`document.querySelectorAll('#modelGrid .style-card--model h3').length && [...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Geno'))`);
await new Promise(r => setTimeout(r, 2500));

// card inventory + positions
const cardInfo = (await send('Runtime.evaluate', {
  expression: `(() => {
    const out = [];
    document.querySelectorAll('#modelGrid .style-card--model').forEach((c, i) => {
      const r = c.getBoundingClientRect();
      out.push({ i, name: c.querySelector('h3')?.textContent ?? '?', x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
    });
    return out;
  })()`, returnByValue: true,
}, sessionId)).result.result.value;
console.log('cards:', cardInfo.map((c: any) => `${c.i}:${c.name}`).join(' | '));

mkdirSync('/tmp/geno_cards', { recursive: true });
// settle at the model section first (lets the top sections' lazy contexts
// release), then walk cards SEQUENTIALLY — jumping to the top of the page
// between cards re-creates the procedural gallery's contexts and blows the
// ~16 live-context cap (blank cards). Sequential scrolling keeps live
// contexts ≈ visible cards + 3s stragglers.
// scroll to the model section GRADUALLY (300px steps): a single jump leaves
// the top sections' lazy contexts alive for their 3s release timer while the
// model rows create new ones — the overlap spikes past the ~16 live-context
// cap and the browser force-loses the oldest (blank cards).
{
  const target = (await send('Runtime.evaluate', {
    expression: `document.querySelector('#modelSection').getBoundingClientRect().top + scrollY`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  for (let y = 0; y < target; y += 300) {
    await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(y)} })` }, sessionId);
    await new Promise(r => setTimeout(r, 260));
  }
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(target)} })` }, sessionId);
  await new Promise(r => setTimeout(r, 3600));
}

const jointDump = (i: number) => send('Runtime.evaluate', {
  expression: `(() => {
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar) return null;
    const B = e.avatar.bones, s = e.avatar.root.scale.x || 1;
    // matrixWorld.elements[12..14] = world position — no THREE global needed
    const p = (b) => b ? +(b.matrixWorld.elements[13] / s).toFixed(3) : null;
    const pz = (b) => b ? +(b.matrixWorld.elements[14] / s).toFixed(3) : null;
    return {
      bvh: e.bvh ? { t: +e.bvh.time.toFixed(2), dead: e.bvh.dead } : null,
      hipsY: p(B.hips), headY: p(B.head),
      ankL_y: p(B.footL), ankR_y: p(B.footR), ankL_z: pz(B.footL), ankR_z: pz(B.footR),
      handL_y: p(B.handL), handR_y: p(B.handR), handL_z: pz(B.handL), handR_z: pz(B.handR),
    };
  })()`, returnByValue: true,
}, sessionId);

for (const c of cardInfo) {
  if (!/geno|cranberry/i.test(c.name)) continue;
  // direct jump to the card (probe-verified: stepping 300px through partial
  // rows inflates simultaneously-intersecting cards past the ~16 context cap)
  {
    const top = (await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${c.i}]; const r = c.getBoundingClientRect(); return r.top + scrollY - 430; })()`,
      returnByValue: true,
    }, sessionId)).result.result.value;
    await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(top)} })` }, sessionId);
  }
  await new Promise(r => setTimeout(r, WAIT));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 }, captureBeyondViewport: true,
  }, sessionId);
  const slug = String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await Bun.write(`/tmp/geno_cards/${LABEL}_${c.i}_${slug}.png`, Buffer.from(shot.result.data, 'base64'));
  const jd = await jointDump(c.i);
  console.log(`captured ${c.i} ${c.name}`, JSON.stringify(jd?.result?.result?.value ?? null));
  // second frame ~0.45s later for the BVH stride comparison
  if (/BVH/i.test(c.name)) {
    await new Promise(r => setTimeout(r, 450));
    const shot2 = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 }, captureBeyondViewport: true,
    }, sessionId);
    await Bun.write(`/tmp/geno_cards/${LABEL}_${c.i}_${slug}_f2.png`, Buffer.from(shot2.result.data, 'base64'));
    const jd2 = await jointDump(c.i);
    console.log(`  frame2`, JSON.stringify(jd2?.result?.result?.value ?? null));
  }
}

console.log(`\nCONSOLE ERRORS/WARNINGS: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 250));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
