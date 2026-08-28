// apps/avatars/test/hem_debug2.ts — why is h.p zero? probe live hem state.
const PORT = 9463;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/hemdbg2-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/i.test(m.params.type)) {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[${m.params.type}] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
    }
  } catch {}
});
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { await sleep(500); try { const r = await send('Runtime.evaluate', { expression: '!!window.__rwfModels', returnByValue: true }, sessionId); if (r?.result?.result?.value) break; } catch {} }
await sleep(1000);
const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;
const iW = names.findIndex((n) => /Wardrobe — dressed/.test(n));
await send('Runtime.evaluate', { expression: `document.querySelectorAll('#modelGrid .style-card--model')[${iW}].scrollIntoView({ block: 'center' }), true`, returnByValue: true }, sessionId);
for (let i = 0; i < 120; i++) {
  const r = await send('Runtime.evaluate', { expression: `!!(window.__rwfModels[${iW}] && window.__rwfModels[${iW}].bvh)`, returnByValue: true }, sessionId);
  if (r?.result?.result?.value) break;
  await sleep(500);
}
await sleep(2500);

const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const e = window.__rwfModels[${iW}];
    const w = e.wardrobe;
    const out = { hemCount: w.hems.length, states: [] };
    for (const h of w.hems) {
      out.states.push({
        C: h.C, R: h.R, seeded: h.seeded, frozen: h.frozen, acc: +h.acc.toFixed(3),
        meshParent: h.mesh.parent?.userData?.rwfWardrobe ?? (h.mesh.parent ? 'scene?' : 'NONE'),
        meshVisible: h.mesh.visible, inScene: !!h.mesh.parent,
        pNonZero: Array.from(h.p).some((x) => x !== 0),
        consCount: h.cons.length,
        firstP: Array.from(h.p.slice(0, 6)).map((x) => +x.toFixed(3)),
      });
    }
    // manual step to see if it throws
    try { w.updateFabric(0.016, false); out.manualStep = 'ok'; } catch (err) { out.manualStep = 'THREW: ' + err.message + '\\n' + err.stack?.split('\\n').slice(0, 4).join('\\n'); }
    out.afterStep = w.hems.map((h) => Array.from(h.p.slice(0, 6)).map((x) => +x.toFixed(3)));
    return out;
  })()`,
}, sessionId);
console.log(JSON.stringify(r?.result?.result?.value ?? r?.result?.exceptionDetails, null, 2).slice(0, 2500));
console.log('\npage errors/warnings (last 8):');
for (const e of errors.slice(-8)) console.log(' ', e.slice(0, 220));
ws.close(); process.exit(0);
