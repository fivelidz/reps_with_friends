// apps/avatars/test/geno_pose.ts — freeze Geno cards at a chosen exercise,
// mid-rep (p=0.5), and capture per-card clips for pose verification.
// Usage: bun apps/avatars/test/geno_pose.ts <exercise> [label]
// → /tmp/geno_cards/<label>_<i>_<slug>.png + joint dumps on stdout
import { mkdirSync } from 'node:fs';

const EXERCISE = process.argv[2] ?? 'squat';
const LABEL = process.argv[3] ?? `p_${EXERCISE}`;
const PORT = 9453;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/geno-pose-prof', '--no-first-run', '--no-sandbox',
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
await send('Network.enable', {}, sessionId);
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
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
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
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Geno'))`);
await new Promise(r => setTimeout(r, 2000));

// set the gallery exercise, PAUSE the cycle (so the frozen pose isn't
// overwritten by the live per-frame posing), then freeze at mid-rep p=0.5
await send('Runtime.evaluate', { expression: `(() => {
    for (const s of document.querySelectorAll('select')) {
      const o = [...s.options].find(o => o.value === '${EXERCISE}');
      if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    const play = document.querySelector('#galPlay');
    if (play && play.checked) { play.checked = false; play.dispatchEvent(new Event('change', { bubbles: true })); }
    for (const e of window.__rwfModels ?? []) {
      if (e.avatar && !e.mixer && !e.bvh) e.avatar.pose('${EXERCISE}', 0.5);
    }
    return 'posed';
  })()`, returnByValue: true }, sessionId);
await new Promise(r => setTimeout(r, 1500));

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

mkdirSync('/tmp/geno_cards', { recursive: true });

// gradual scroll to the model section (lazy-context discipline, see geno_shot.ts)
{
  const target = (await send('Runtime.evaluate', {
    expression: `document.querySelector('#modelSection').getBoundingClientRect().top + scrollY`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  for (let y = 0; y < target; y += 300) {
    await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(y)} })` }, sessionId);
    await new Promise(r => setTimeout(r, 240));
  }
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(target)} })` }, sessionId);
  await new Promise(r => setTimeout(r, 3200));
}

const jointDump = (i: number) => send('Runtime.evaluate', {
  expression: `(() => {
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar) return null;
    const B = e.avatar.bones, s = e.avatar.root.scale.x || 1;
    const p = (b) => b ? +(b.matrixWorld.elements[13] / s).toFixed(3) : null; // world Y
    const pz = (b) => b ? +(b.matrixWorld.elements[14] / s).toFixed(3) : null; // world Z
    const px = (b) => b ? +(b.matrixWorld.elements[12] / s).toFixed(3) : null; // world X
    return { hipsY: p(B.hips), headY: p(B.head), headX: px(B.head),
      ankL: [px(B.footL), p(B.footL), pz(B.footL)], ankR: [px(B.footR), p(B.footR), pz(B.footR)],
      handL: [px(B.handL), p(B.handL), pz(B.handL)], handR: [px(B.handR), p(B.handR), pz(B.handR)] };
  })()`, returnByValue: true,
}, sessionId);

for (const c of cardInfo) {
  // geno tint cards + cranberry; the BVH card keeps its mocap, not the pose
  if (!/geno|cranberry/i.test(c.name) || /bvh/i.test(c.name)) continue;
  {
    const top = (await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${c.i}]; const r = c.getBoundingClientRect(); return r.top + scrollY - 300; })()`,
      returnByValue: true,
    }, sessionId)).result.result.value;
    const cur = (await send('Runtime.evaluate', { expression: 'scrollY', returnByValue: true }, sessionId)).result.result.value;
    const step = Math.sign(top - cur) * 300;
    for (let y = cur; Math.abs(top - y) > 300; y += step) {
      await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(y)} })` }, sessionId);
      await new Promise(r => setTimeout(r, 220));
    }
    await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(top)} })` }, sessionId);
  }
  await new Promise(r => setTimeout(r, 1400));
  // re-assert the frozen pose (lazy re-init on scroll may have re-created it)
  await send('Runtime.evaluate', { expression: `(() => { const e = window.__rwfModels[${c.i}]; if (e && e.avatar && !e.mixer && !e.bvh) e.avatar.pose('${EXERCISE}', 0.5); return 1; })()`, returnByValue: true }, sessionId);
  await new Promise(r => setTimeout(r, 500));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 }, captureBeyondViewport: true,
  }, sessionId);
  const slug = String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await Bun.write(`/tmp/geno_cards/${LABEL}_${c.i}_${slug}.png`, Buffer.from(shot.result.data, 'base64'));
  const jd = await jointDump(c.i);
  console.log(`captured ${c.i} ${c.name}`, JSON.stringify(jd?.result?.result?.value ?? null));
}

console.log(`\nCONSOLE ERRORS/WARNINGS: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 250));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
