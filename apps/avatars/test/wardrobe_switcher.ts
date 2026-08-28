// apps/avatars/test/wardrobe_switcher.ts — verify the per-card exercise
// switcher: click squat → card poses squat (hips drop, per-card state set);
// click a BVH clip → BVH plays and the per-card exercise clears; click
// push-up → prone tilt engages. Zero console errors or we exit 2.
const PORT = 9458;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/wardrobe-sw', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[console.error] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    }
  } catch {}
});
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
};
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Wardrobe — dressed'))`);
const i = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => h.textContent.includes('Wardrobe — dressed'))`,
  returnByValue: true,
}, sessionId)).result.result.value;
await send('Runtime.evaluate', {
  expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 300 }); return true; })()`,
}, sessionId);
await waitFor(`window.__rwfModels[${i}]?.avatar && window.__rwfModels[${i}]?.renderer`);
await new Promise(r => setTimeout(r, 1500));

const hipsY = () => send('Runtime.evaluate', {
  expression: `window.__rwfModels[${i}].avatar.bones.hips.getWorldPosition(new (window.__rwfModels[${i}].avatar.bones.hips.matrixWorld.constructor)()).y`,
  // simpler below
}, sessionId).catch(() => null);

const state = (expr: string) => send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);

// 1. click squat
await state(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="squat"]').click()`);
await new Promise(r => setTimeout(r, 600));
let r1 = await state(`(() => { const e = window.__rwfModels[${i}]; return { ex: e.exercise ?? null, hipsY: +e.avatar.bones.hips.matrixWorld.elements[13].toFixed(3), proneX: +e.avatar.prone.rotation.x.toFixed(2), squatBtnOn: document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="squat"]').classList.contains('is-on') }; })()`);
console.log('after squat click:  ', JSON.stringify(r1.result.result.value));

// 2. click pushup
await state(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="pushup"]').click()`);
await new Promise(r => setTimeout(r, 600));
let r2 = await state(`(() => { const e = window.__rwfModels[${i}]; return { ex: e.exercise ?? null, proneX: +e.avatar.prone.rotation.x.toFixed(2), pushupBtnOn: document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="pushup"]').classList.contains('is-on'), squatBtnOn: document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-ex="squat"]').classList.contains('is-on') }; })()`);
console.log('after pushup click: ', JSON.stringify(r2.result.result.value));

// 3. click a BVH clip (limp) — per-card exercise must clear, BVH must play
await state(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-bvh="limp"]').click()`);
const ok3 = await waitFor(`window.__rwfModels[${i}]?.bvh && !window.__rwfModels[${i}].bvh.dead`, 90000);
await new Promise(r => setTimeout(r, 1200));
let r3 = await state(`(() => { const e = window.__rwfModels[${i}]; return { bvhPlaying: !!(e.bvh && !e.bvh.dead), bvhT: e.bvh ? +e.bvh.time.toFixed(2) : null, ex: e.exercise ?? null, anyExBtnOn: [...document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelectorAll('[data-ex]')].some(b => b.classList.contains('is-on')) }; })()`);
console.log('after limp click:   ', JSON.stringify(r3.result.result.value), ok3 ? '' : '(BVH WAIT TIMEOUT)');

// 4. back to exercise via the generic button → follows the global selector
await state(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].querySelector('[data-native=""]').click()`);
await new Promise(r => setTimeout(r, 400));
let r4 = await state(`(() => { const e = window.__rwfModels[${i}]; return { ex: e.exercise ?? null, bvhDead: e.bvh ? e.bvh.dead : null }; })()`);
console.log('after exercise btn: ', JSON.stringify(r4.result.result.value));

console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 300));
ws.close(); process.exit(errors.length ? 2 : 0);
