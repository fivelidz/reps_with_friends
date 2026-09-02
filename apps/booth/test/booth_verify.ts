// apps/booth/test/booth_verify.ts — END-TO-END verification for the PHOTO
// BOOTH (apps/booth, /api/booth). Drives the REAL UI headless via CDP:
//   /booth (phone viewport) → privacy banner → camera-DENIED friendly path →
//   upload the synthetic test portrait (scripts/booth/test_portrait.png — a
//   PIL-composed cartoon, NOT a real person) → generate → poll until done →
//   reveal (renders + turntable) → ADD TO MY AVATARS → /avatars photo strip
//   shows the booth card with a YOURS chip and a live renderer.
// ZERO console errors is a hard requirement. Screenshots → apps/booth/shots/.
//
// Usage:
//   bun apps/booth/test/booth_verify.ts              # full paid run (LLM calls)
//   BOOTH_VERIFY_STUB=1 bun apps/booth/test/...      # replay the last real
//     result through the same UI (fetch shim on /api/booth*) — re-verification
//     without re-spending API budget. Requires one prior real run.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 9471;
const SHOTS = "apps/booth/shots";
const PORTRAIT = resolve("scripts/booth/test_portrait.png"); // CDP needs an absolute path
const STUB = !!process.env.BOOTH_VERIFY_STUB;
// per-run profile: a stale chromium from a previous verify (same user-data-dir)
// can accept /json/version but hang the WebSocket attach — seen live once
const PROFILE = `/tmp/booth-verify-${process.pid}`;

// a stub run replays the server's LAST successful job result (real artifact,
// real module) — the harness fetches it before navigating
let stubResult: any = null;
if (STUB) {
  const r = await fetch("http://localhost:4173/api/booth/status");
  const j: any = await r.json();
  if (!j?.result?.ok) { console.error("STUB mode needs a prior successful job in server memory"); process.exit(2); }
  stubResult = j.result;
  console.log(`(stub replay of ${stubResult.module})`);
}

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=460,1000', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 40 && !info; i++) { await new Promise(r => setTimeout(r, 250)); info = await ver(); }
}
if (!info) { console.error('chromium never came up (is port 9471 held by a stale instance?)'); process.exit(1); }

const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((res, rej) => { ws.onopen = () => res(null); ws.onerror = () => rej(new Error('ws')); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: any) =>
  new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('DOM.enable', {}, sessionId);

const errors: string[] = [];
ws.addEventListener('message', e => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      // filtered: favicon 404s; the /avatars MODEL gallery's own pre-existing
      // GLTF texture 404 (model cards, not the booth — present before /booth)
      if (t && !/favicon|GLTFLoader.*texture|Couldn't load texture/.test(t)) errors.push(`[console.${m.params.type}] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    }
  } catch {}
});

const evalJs = async (expr: string) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId))?.result?.result?.value;

const shot = async (name: string) => {
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`${SHOTS}/${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log(`  📸 ${SHOTS}/${name}.png`);
};

// phone-first viewport — the booth is designed for the phone
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 950, deviceScaleFactor: 2, mobile: true }, sessionId);
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};

console.log('── 1 · /booth loads (phone viewport)');
await send('Page.navigate', { url: 'http://localhost:4173/booth' }, sessionId);
await new Promise(r => setTimeout(r, 1200));
check(await evalJs(`!!document.querySelector('.privacy-banner') && document.querySelector('.privacy-banner').textContent.includes('never leaves this machine')`), 'privacy banner prominent + true wording');
check(await evalJs(`!document.getElementById('captureCard').hidden && document.getElementById('genCard').hidden && document.getElementById('revealCard').hidden`), 'step 1 visible, steps 2-3 hidden');
check(await evalJs(`typeof window.__boothState === 'object'`), 'test hook __boothState present');
await shot('01-capture');

console.log('── 2 · camera-DENIED path is friendly');
await evalJs(`window.__origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); undefined`);
await evalJs(`document.getElementById('camBtn').click(); undefined`);
await new Promise(r => setTimeout(r, 600));
check(await evalJs(`!document.getElementById('camDenied').hidden && document.getElementById('camDenied').textContent.includes('upload')`), 'denial message points to upload, no dead end');
check(await evalJs(`document.getElementById('camDenied').textContent.includes('Camera not available')`), 'denial is the friendly camera banner');
await evalJs(`navigator.mediaDevices.getUserMedia = window.__origGUM; undefined`); // restore the real one
await shot('02-camera-denied');

console.log('── 3 · upload the synthetic portrait');
if (STUB) {
  // replay mode: shim /api/booth* so the UI walks the real flow against the
  // recorded result (the module on disk is the real paid-run artifact)
  await evalJs(`window.__stub = ${JSON.stringify(stubResult)}; (() => {
    const real = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      if (String(url) === '/api/booth' && opts?.method === 'POST')
        return Promise.resolve(new Response(JSON.stringify({ ok: true, job: 'stub' }), { status: 200 }));
      if (String(url).startsWith('/api/booth/status'))
        return Promise.resolve(new Response(JSON.stringify({ job: 'stub', phase: 'done', result: window.__stub }), { status: 200 }));
      return real(url, opts);
    }; })(); undefined`);
}
const { root } = (await send('DOM.getDocument', {}, sessionId)).result;
const { nodeId } = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#fileInput' }, sessionId)).result;
await send('DOM.setFileInputFiles', { files: [PORTRAIT], nodeId }, sessionId);
await new Promise(r => setTimeout(r, 900));
check(await evalJs(`!document.getElementById('preview').hidden && !!document.getElementById('previewImg').src`), 'photo preview shown');
await shot('03-preview');

console.log('── 4 · generate → server pipeline (intake → codegen → gate)');
await evalJs(`document.getElementById('useBtn').click(); undefined`);
await new Promise(r => setTimeout(r, 2500));
if (!STUB) check(await evalJs(`!document.getElementById('genCard').hidden`), 'generation card visible');
else console.log('  (stub: gen card skipped — phase jumps to done instantly; paid run verified it)');
await shot('04-generating');
const t0 = Date.now();
let lastPhase = '';
for (;;) {
  const st = await evalJs(`JSON.stringify({phase: window.__boothState.phase, error: window.__boothState.error})`);
  const j = JSON.parse(st);
  if (j.phase !== lastPhase) { console.log(`  ⏱  phase: ${j.phase} (${Math.round((Date.now() - t0) / 1000)}s)`); lastPhase = j.phase; }
  if (j.phase === 'done' || j.phase === 'error') break;
  if (Date.now() - t0 > 480_000) { console.error('TIMEOUT waiting for generation'); break; }
  await new Promise(r => setTimeout(r, 3000));
}
const result = await evalJs(`window.__boothState.result ? JSON.stringify(window.__boothState.result) : null`);
check(!!result, 'generation finished ok', result ? '' : String(await evalJs(`window.__boothState.error`)));
if (!result) { console.log(errors.join('\n')); process.exit(1); }
const bust = JSON.parse(result);
console.log(`  bust: ${bust.module} · "${bust.name}" · palette ${bust.palette.join(' ')} · tokens ${JSON.stringify(bust.tokens)} · ${bust.seconds}s`);
if (bust.fixed_with) console.log(`  (one gate-fix pass was needed: ${bust.fixed_with.join('; ')})`);

console.log('── 5 · reveal renders');
await new Promise(r => setTimeout(r, 1500));
check(await evalJs(`!document.getElementById('revealCard').hidden`), 'reveal card visible');
check(await evalJs(`document.getElementById('revealName').textContent.length > 2`), `name shown: "${await evalJs(`document.getElementById('revealName').textContent`)}"`);
check(await evalJs(`document.querySelectorAll('#paletteRow i').length >= 2`), 'palette swatches shown');
check(await evalJs(`!!document.querySelector('#revealStage canvas')`), 'webgl canvas mounted');
// canvas actually drew (non-transparent pixels)
const drew = await evalJs(`(() => { const c = document.querySelector('#revealStage canvas'); if (!c) return false;
  const g = c.getContext('webgl2') || c.getContext('webgl'); const px = new Uint8Array(4 * 64);
  g.readPixels(c.width >> 1, (c.height >> 1) - 32, 8, 8, g.RGBA, g.UNSIGNED_BYTE, px);
  return px.some(v => v > 0); })()`);
check(!!drew, 'reveal canvas drew pixels (not blank)');
await shot('05-reveal');

console.log('── 6 · ADD TO MY AVATARS');
await evalJs(`document.getElementById('addBtn').click(); undefined`);
await new Promise(r => setTimeout(r, 300));
check(await evalJs(`JSON.parse(localStorage.getItem('rwf_my_booth_avatars') || '[]').includes(${JSON.stringify(bust.module)})`), 'module in localStorage set');
check(await evalJs(`document.getElementById('addBtn').textContent.includes('ADDED') && !document.getElementById('addedNote').hidden`), 'button flips to ADDED + note links /avatars');
await shot('06-added');

console.log('── 7 · /avatars photo strip integration');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
await new Promise(r => setTimeout(r, 2000));
await evalJs(`document.getElementById('photoSection').scrollIntoView({ block: 'start' }); undefined`);
// wait for cards incl. the booth one (4 static + registry busts), lazy render spin-up
let stripOk = false;
for (let i = 0; i < 40 && !stripOk; i++) {
  await new Promise(r => setTimeout(r, 1000));
  stripOk = await evalJs(`(() => { const cards = window.__rwfPhotoAvatars ?? [];
    return cards.length >= 5 && cards.some(c => c.card.textContent.includes(${JSON.stringify(bust.name)})); })()`);
}
check(stripOk, 'photo strip includes the booth bust card');
// lazy-context contract: cards render when they INTERSECT — bring the target
// card into view first, then assert its renderer is alive
await evalJs(`window.__rwfPhotoAvatars.find(x => x.card.textContent.includes(${JSON.stringify(bust.name)}))?.card.scrollIntoView({ block: 'center' }); undefined`);
await new Promise(r => setTimeout(r, 2200));
const stripState = await evalJs(`(() => { const cards = window.__rwfPhotoAvatars ?? [];
  const c = cards.find(x => x.card.textContent.includes(${JSON.stringify(bust.name)}));
  if (!c) return null;
  return { renderer: !!c.renderer, hasTick: typeof c.model?.userData?.tick === 'function',
           sockets: Object.keys(c.model?.userData?.sockets ?? {}),
           mine: !!c.card.querySelector('.booth-chip--mine') }; })()`);
check(!!stripState && stripState.renderer && stripState.hasTick, 'booth card renders with tick contract', JSON.stringify(stripState));
check(!!stripState?.mine, 'YOURS chip on the booth card');
await new Promise(r => setTimeout(r, 800));
await shot('07-avatars-strip');

console.log('── 8 · zero console errors');
check(errors.length === 0, 'console clean', errors.slice(0, 4).join(' | '));

console.log(failed === 0 ? '\nBOOTH E2E: ALL PASS' : `\nBOOTH E2E: ${failed} FAILURES`);
console.log(errors.join('\n'));
process.exit(failed === 0 ? 0 : 1);
