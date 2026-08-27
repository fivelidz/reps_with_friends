// apps/avatars/test/model_verify.ts — verification harness for the model
// characters section. For each exercise: freeze mid-rep, scroll every model
// card into view (LAZY WebGL — cards only render when intersecting), capture
// a per-card clip, and collect console errors throughout.
// Usage: bun apps/avatars/test/model_verify.ts [exercise...]  → /tmp/mv_<ex>_<i>.png
import { mkdirSync } from 'node:fs';

const PORT = 9449;
const EXERCISES = process.argv.length > 2 ? process.argv.slice(2) : ['stand', 'squat', 'pushup', 'jumpingjack', 'curl'];

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/mv-prof', '--no-first-run', '--no-sandbox',
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
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);

// ── console error collection ─────────────────────────────────────────────────
const errors: string[] = [];
const addErr = (src: string, text: string) => {
  if (!text || /favicon|net::ERR.*favicon/.test(text)) return;
  errors.push(`[${src}] ${text}`);
};
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      addErr('console.' + m.params.type, (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      addErr('exception', m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?');
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      addErr('log.' + m.params.entry.level, `${m.params.entry.source}: ${m.params.entry.text}`);
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

// wait for the 8 model cards to load their avatars (canvases appear lazily on
// intersection, so wait for the cards + a scroll pass first)
const waitFor = async (expr: string, timeout = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`document.querySelectorAll('#modelGrid .style-card--model').length >= 8`);
// NOTE: no fast full-page pre-scroll — that initialises many WebGL contexts at
// once and headless chromium force-loses the oldest (blank cards). Instead the
// capture loop below serialises: scroll away (release), then to each card.
await new Promise(r => setTimeout(r, 1500));

// card boxes (page coords) + names
const cardInfo = (await send('Runtime.evaluate', {
  expression: `(() => {
    const out = [];
    document.querySelectorAll('#modelGrid .style-card--model').forEach((c, i) => {
      const r = c.getBoundingClientRect();
      out.push({ i, name: c.querySelector('h3')?.textContent ?? '?',
        x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
    });
    return out;
  })()`, returnByValue: true,
}, sessionId)).result.result.value;
console.log(`cards: ${cardInfo.map((c: any) => c.name).join(' | ')}`);

mkdirSync('/tmp/mv', { recursive: true });
for (const EX of EXERCISES) {
  // set exercise + freeze mid-rep deterministically
  await send('Runtime.evaluate', {
    expression: `(() => {
      const s = document.querySelector('#galExercise');
      s.value = '${EX}'; s.dispatchEvent(new Event('change', { bubbles: true }));
      window.__rwfStudio.galState.playing = false;
      return 'ok';
    })()`, returnByValue: true,
  }, sessionId);
  await new Promise(r => setTimeout(r, 700));

  for (const c of cardInfo) {
    // serialise contexts: scroll far away first so the previous card's lazy
    // renderer releases (3s timer), then bring THIS card into view
    await send('Runtime.evaluate', { expression: `scrollTo({ top: 0 })` }, sessionId);
    await new Promise(r => setTimeout(r, 3600));
    await send('Runtime.evaluate', {
      expression: `document.querySelectorAll('#modelGrid .style-card--model')[${c.i}].scrollIntoView({ block: 'center' })`,
    }, sessionId);
    await new Promise(r => setTimeout(r, 700));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 },
      captureBeyondViewport: true,
    }, sessionId);
    const slug = String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await Bun.write(`/tmp/mv/${EX}_${c.i}_${slug}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(`captured ${EX} × ${cardInfo.length}`);
}

console.log(`\nCONSOLE ERRORS/WARNINGS: ${errors.length}`);
for (const e of errors.slice(0, 30)) console.log('  ' + e.slice(0, 300));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
