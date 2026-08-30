// FROG HEADS VERIFY — the founder-facing evidence for frog-heads.js:
//   expr_frog_{happy,grumpy,surprised,sleepy,cheeky,determined}.png (front-on,
//     consistent framing via __atelier.frogCam)
//   gallery_frog_strip.png   (the live thumbnail strip, from the 2D canvas)
//   walk_frog_avatar.png     (on-avatar, walking, cheeky + crown — the taunt)
// Plus the numeric distinctness table (eye pale px per side from rendered
// frames; lid/brow/mouth geometry from the model) and the combo smoke test.
// Usage: bun apps/atelier/test/frog_heads_verify.ts
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'apps/atelier/shots';
mkdirSync(OUT, { recursive: true });
const PORT = 9549;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-frog-shots', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 200));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 900));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 300) };
  return r?.result?.result?.value;
};
const shot = async (name: string) => {
  const data = await ev('window.__atelier.snapshot()');
  if (!data?.startsWith?.('data:image/png')) { console.error('snapshot failed for', name, String(data).slice(0, 60)); process.exit(1); }
  writeFileSync(`${OUT}/${name}`, Buffer.from(data.slice(22), 'base64'));
  console.log('shot:', name);
};
const A = 'window.__atelier';
const EXPRS = ['happy', 'grumpy', 'surprised', 'sleepy', 'cheeky', 'determined'];

await ev(`${A}.pause(); ${A}.setTurntable(false); ${A}.homeCam(); ${A}.setFrogSkin('green'); ${A}.setFrogAccessory('none')`);

// ── 1. combo smoke: 6 expr × 5 skins × 4 accessories on the LIVE head ────────
const sanity = await ev(`${A}.frogSanity()`);
console.log('combo smoke:', JSON.stringify(sanity));
if (!sanity || sanity.errorCount > 0 || sanity.combos !== 120) { console.error('COMBO SMOKE FAILED'); process.exit(1); }

// ── 2. expression distinctness: rendered eye pixels + geometry ───────────────
const table: any[] = [];
for (const e of EXPRS) {
  await ev(`${A}.setFrogExpression('${e}')`);
  await ev(`${A}.frogCam()`);
  const eyes = await ev(`${A}.frogEyePixels()`);
  const info2 = await ev(`${A}.frogInfo()`);
  const mouth = await ev(`${A}.frogMouthProbe()`);
  table.push({ expr: e, eyes, geo: info2, mouth });
  await shot(`expr_frog_${e}.png`);
}
console.log('\n=== EXPRESSION DISTINCTNESS TABLE ===');
console.log('expr        | lidCov [+1,-1] | eye pale px [L,R] | eye lid-skin px [L,R] | browRotZ [+1,-1] | browY [+1,-1] | mouth (geo) | mouth (pixels: curvaturePx, ink c+/mid/c-)');
for (const r of table) {
  const g = r.geo, ey = r.eyes, mo = r.mouth;
  const mouthGeo = g.mouth.kind === 'open'
    ? `OPEN r=${g.mouth.r}`
    : `${g.mouth.curvature > 0.002 ? 'SMILE' : g.mouth.curvature < -0.002 ? 'FROWN' : 'FLAT'} Δ=${g.mouth.curvature} w=${g.mouth.w}` +
      (Math.abs(g.mouth.cornerP - g.mouth.cornerM) > 0.005 ? ` SKEW(${g.mouth.cornerP}/${g.mouth.cornerM})` : '');
  const mouthPx = mo?.kind === 'open'
    ? `open ring ink=${mo.inkMid}`
    : `${mo?.curvaturePx < -3 ? '⌣' : mo?.curvaturePx > 3 ? '⌢' : '—'} ${mo?.curvaturePx}px ink=${mo?.cornerP1?.ink}/${mo?.mid?.ink}/${mo?.cornerM1?.ink}`;
  console.log(
    `${r.expr.padEnd(11)} | ${(g.lidCoverage ?? []).join(',').padEnd(14)} | ` +
    `${String(ey?.sideM1?.palePx).padEnd(6)},${String(ey?.sideP1?.palePx).padEnd(6)} | ` +
    `${String(ey?.sideM1?.skinPx).padEnd(6)},${String(ey?.sideP1?.skinPx).padEnd(6)} | ` +
    `${(g.browRotZ ?? []).join(',').padEnd(15)} | ${(g.browY ?? []).join(',').padEnd(13)} | ${mouthGeo.padEnd(11)} | ${mouthPx}`);
}
writeFileSync('apps/atelier/test/frog_heads_distinctness.json', JSON.stringify(table, null, 2));

// ── 3. gallery: build, health-check, selection applies, strip PNG ────────────
const gb = await ev(`${A}.buildFrogGallery()`);
const gi = await ev(`${A}.galleryInfo()`);
console.log('\ngallery:', JSON.stringify(gi));
if (!gb || gi?.inkPerCell?.some((n: number) => n < 500)) { console.error('GALLERY HEALTH FAILED'); process.exit(1); }
const strip = await ev(`document.getElementById('frogGallery').toDataURL('image/png')`);
if (String(strip).startsWith('data:image/png')) {
  writeFileSync(`${OUT}/gallery_frog_strip.png`, Buffer.from(String(strip).slice(22), 'base64'));
  console.log('shot: gallery_frog_strip.png');
}
const picked = await ev(`${A}.gallerySelect(4)`);
const after = await ev(`${A}.frogInfo()`);
if (picked !== 'cheeky' || after?.expression !== 'cheeky') { console.error('GALLERY SELECT FAILED', picked, after?.expression); process.exit(1); }
console.log('gallery select 4 →', picked, '✓ (head expression =', after.expression + ')');

// ── 4. Head-bone tracking: walk + nod (agree) clips — frog pixels per frame ──
const walk = await ev(`${A}.headCheck(5, 'walk')`);
const nod = await ev(`${A}.headCheck(5, 'agree')`);
console.log('\nheadCheck walk:', JSON.stringify({ pass: walk?.pass, frames: walk?.frames?.map((f: any) => `g${f.greenPx}/e${f.eyePx}@${f.t}`) }));
console.log('headCheck nod  :', JSON.stringify({ pass: nod?.pass, frames: nod?.frames?.map((f: any) => `g${f.greenPx}/e${f.eyePx}@${f.t}`) }));
if (!walk?.pass || !nod?.pass) { console.error('HEAD TRACKING FAILED'); process.exit(1); }

// ── 5. on-avatar walking shot: cheeky + crown, the game's taunt face ─────────
await ev(`${A}.setFrogExpression('cheeky'); ${A}.setFrogAccessory('crown'); ${A}.setFrogSkin('green')`);
await ev(`(async () => { await window.__atelier.setAnim('clip:walk'); return true; })()`);
await new Promise((r) => setTimeout(r, 2600));   // mid-stride
await ev(`${A}.homeCam(); ${A}.pause()`);
await shot('walk_frog_avatar.png');

// restore
await ev(`${A}.setAnim('idle'); ${A}.play(); ${A}.setFrogExpression('happy'); ${A}.setFrogAccessory('none')`);
console.log('\nconsole errors:', errors.length, errors.slice(0, 5));
if (errors.length) process.exit(1);
await send('Browser.close', {}).catch(() => {});
process.exit(0);
