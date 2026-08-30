// Per-clip browser verification of Geno's mocap retarget: opens /avatars,
// finds the Geno mocap card, clicks EVERY clip button, and captures two
// mid-motion frames per clip (+ joint dumps). Also poses push-up/squat on a
// wardrobe card. Zero console errors required.
// Usage: bun apps/avatars/test/geno_mocap_shots.ts   → /tmp/geno_mocap/
import { mkdirSync } from 'node:fs';

const PORT = 9452;
const OUT = '/tmp/geno_mocap';

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,700', '--user-data-dir=/tmp/geno-mocap-prof', '--no-first-run', '--no-sandbox',
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

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
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
await waitFor(`document.querySelectorAll('#modelGrid .style-card--model h3').length && [...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('mocap'))`);
await new Promise(r => setTimeout(r, 2500));

mkdirSync(OUT, { recursive: true });

// gradual scroll to the model section (context-cap discipline, see geno_shot)
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
  await new Promise(r => setTimeout(r, 3500));
}

// find the Geno mocap card + its clip buttons
const card = (await send('Runtime.evaluate', {
  expression: `(() => {
    const cards = [...document.querySelectorAll('#modelGrid .style-card--model')];
    const c = cards.find(x => /mocap \\(source/i.test(x.querySelector('h3')?.textContent ?? ''));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { i: cards.indexOf(c), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height,
      clips: [...c.querySelectorAll('[data-bvh]')].map(b => b.dataset.bvh) };
  })()`, returnByValue: true,
}, sessionId)).result.result.value;
if (!card) { console.error('Geno mocap card not found'); process.exit(1); }
console.log('card idx', card.i, 'clips:', card.clips.join(','));

// scroll the card into view
{
  const top = (await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${card.i}]; return c.getBoundingClientRect().top + scrollY - 300; })()`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(top)} })` }, sessionId);
  await new Promise(r => setTimeout(r, 3000)); // first clip auto-loads on visibility
}

const jointDump = (i: number) => send('Runtime.evaluate', {
  expression: `(() => {
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar) return null;
    const B = e.avatar.bones, s = e.avatar.root.scale.x || 1;
    const el = (b, k) => b ? +(b.matrixWorld.elements[k] / s).toFixed(3) : null;
    return { bvh: e.bvh ? { t: +e.bvh.time.toFixed(2), dead: e.bvh.dead } : null,
      hipsY: el(B.hips, 13), headY: el(B.head, 13),
      ankL: [el(B.footL, 12), el(B.footL, 13), el(B.footL, 14)], ankR: [el(B.footR, 12), el(B.footR, 13), el(B.footR, 14)],
      handL: [el(B.handL, 12), el(B.handL, 13), el(B.handL, 14)], handR: [el(B.handR, 12), el(B.handR, 13), el(B.handR, 14)] };
  })()`, returnByValue: true,
}, sessionId);

const shoot = async (name: string, frame: number) => {
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: card.x, y: card.y, width: card.w, height: card.h, scale: 1 }, captureBeyondViewport: true,
  }, sessionId);
  await Bun.write(`${OUT}/${name}_f${frame}.png`, Buffer.from(shot.result.data, 'base64'));
};

for (const clip of card.clips) {
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('#modelGrid .style-card--model')[${card.i}].querySelector('[data-bvh="${clip}"]').click()`,
  }, sessionId);
  await new Promise(r => setTimeout(r, clip === 'goblin_walk' ? 9000 : 2600)); // 33MB legacy capture
  const jd1 = await jointDump(card.i);
  await shoot(clip, 1);
  await new Promise(r => setTimeout(r, 480));
  const jd2 = await jointDump(card.i);
  await shoot(clip, 2);
  console.log(`${clip.padEnd(13)} f1 ${JSON.stringify(jd1?.result?.result?.value ?? null)}`);
  console.log(`${' '.repeat(13)} f2 ${JSON.stringify(jd2?.result?.result?.value ?? null)}`);
}

// exercise poses on the wardrobe card (push-up + squat rebuild check)
const wcard = (await send('Runtime.evaluate', {
  expression: `(() => {
    const cards = [...document.querySelectorAll('#modelGrid .style-card--model')];
    const c = cards.find(x => /wardrobe/i.test(x.querySelector('h3')?.textContent ?? ''));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { i: cards.indexOf(c), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
  })()`, returnByValue: true,
}, sessionId)).result.result.value;
if (wcard) {
  const top = (await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${wcard.i}]; return c.getBoundingClientRect().top + scrollY - 300; })()`,
    returnByValue: true,
  }, sessionId)).result.result.value;
  await send('Runtime.evaluate', { expression: `scrollTo({ top: ${Math.round(top)} })` }, sessionId);
  await new Promise(r => setTimeout(r, 2600));
  for (const ex of ['pushup', 'squat', 'jumpingjack', 'curl']) {
    await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${wcard.i}]; c.querySelector('[data-ex="${ex}"]')?.click(); c.querySelector('[data-bvh="walk"]')?.classList.remove('is-on'); return true; })()`,
    }, sessionId);
    // stop the auto-walk so the exercise pose shows
    await send('Runtime.evaluate', {
      expression: `(() => { const e = window.__rwfModels[${wcard.i}]; if (e && e.bvh) { e.bvh.stop(); e.bvh = null; } return true; })()`,
    }, sessionId);
    await new Promise(r => setTimeout(r, 900));
    const shot = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: wcard.x, y: wcard.y, width: wcard.w, height: wcard.h, scale: 1 }, captureBeyondViewport: true,
    }, sessionId);
    await Bun.write(`${OUT}/exercise_${ex}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(`exercise ${ex} captured`);
  }
}

console.log(`\nCONSOLE ERRORS/WARNINGS: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 250));
ws.close();
