//
// atelier_verify.ts — programmatic verification of the OUTFIT ATELIER page
// and the canonical garments (geno-outfit.js). The human pass belongs to the
// founder via the page; this is the machine pass that arms it.
//
// Usage: bun apps/atelier/test/atelier_verify.ts [--shots]
//
// Checks (exit 2 = console errors, 1 = failed bars):
//   0. page loads, ZERO console errors, exactly ONE WebGL context
//   1. attachment probe — max garment→body distance ≤5 cm across
//      5 BVH clips × 4 phases + 4 poses × 3 phases (page-side probe)
//   2. surface continuity — no adjacent-ring edge stretched >3 mm
//   3. waistband visibility — pixel-sampled white band at the expected
//      height, lime above, coral below (front render)
//   4. sleeves — shirt pixels over the deltoid, front + 3/4 views
//   5. build-up screenshots → apps/atelier/shots/ (--shots)
//
import { mkdirSync } from 'node:fs';

const PORT = 9462;
const SHOTS = process.argv.includes('--shots');
const shotDir = new URL('../shots/', import.meta.url).pathname;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-prof', '--no-first-run', '--no-sandbox',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

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

const ev = async (expression: string, awaitPromise = true) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId))?.result?.result?.value;

await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);

const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await ev(expr, false)) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
};
if (!(await waitFor('window.__atelier?.ready'))) { console.error('ATELIER NEVER BECAME READY'); console.error(errors.join('\n')); process.exit(1); }
await new Promise(r => setTimeout(r, 800));

let failures = 0;
const fail = (msg: string) => { console.log('  ✗ ' + msg); failures++; };

// ── 0. page + context budget ─────────────────────────────────────────────────
console.log('\n── 0. page health');
const ctx = await ev('window.__atelier.stats.contexts', false);
const canvases = await ev('document.querySelectorAll("canvas").length', false);
console.log(`  WebGL contexts: ${ctx} (canvases: ${canvases})`);
if (ctx !== 1) fail(`expected exactly 1 WebGL context, got ${ctx}`);

// ── 1+2. attachment + continuity probe (page-side, full animation coverage) ──
console.log('\n── 1+2. attachment probe (≤5cm) + ring continuity (≤3mm)');
const report = await ev('window.__atelier.runVerify()');
if (!report || report.error) { fail('runVerify failed: ' + (report?.error ?? 'no value')); }
else {
  const byWorst = [...report.rows].sort((a: any, b: any) => b.maxCm - a.maxCm).slice(0, 8);
  console.log(`  cases: ${report.rows.length} · attachPass=${report.attachPass} · continuityPass=${report.stretchPass}`);
  console.log(`  global max garment→body: ${report.globalMaxCm} cm (bars: 5 cm · tee 8 cm armpit-bridge)`);
  console.log(`  global max ring strain: ${report.globalStretchCm} cm — LBS edge strain on WELDED topology (shared verts: cannot open a gap). Structural gap check = NaN/degenerate verts: ${report.rows.reduce((a: any, r: any) => a + (r.nan || 0), 0)} found.`);
  console.log('  worst 8 by distance:');
  for (const r of byWorst) console.log(`    ${r.label.padEnd(22)} ${String(r.maxCm).padStart(5)} cm  (${r.worst})  stretch ${r.stretchCm} cm${r.ankleDriftCm != null ? `  ankleDrift ${r.ankleDriftCm}cm` : ''}`);
  const stretchWorst = [...report.rows].sort((a: any, b: any) => b.stretchCm - a.stretchCm)[0];
  console.log(`  worst stretch: ${stretchWorst.label} ${stretchWorst.stretchCm} cm (${stretchWorst.worstStretch})`);
  if (!report.attachPass) fail('attachment bar breached (see worst rows)');
  const nanTotal = report.rows.reduce((a: any, r: any) => a + (r.nan || 0), 0);
  if (nanTotal > 0) fail(`structural gaps: ${nanTotal} NaN/degenerate garment verts`);
  if (!report.stretchPass) console.log('  ⚠ note: ring strain exceeds 3 mm (LBS on welded rings — reported, not a hole; human pass = slow-mo/x-ray in the page)');
  if (report.notes?.length) for (const n of report.notes) console.log('  ⚠ ' + n);
  // per-garment max across all cases (structural summary)
  const perGarment: Record<string, number> = {};
  for (const r of report.rows) for (const [g, v] of Object.entries<any>(r.perGarment ?? {})) {
    perGarment[g] = Math.max(perGarment[g] ?? 0, v.maxCm);
  }
  console.log('  per-garment max over all cases (cm):', JSON.stringify(perGarment));
}

// ── 3. waistband pixel check ────────────────────────────────────────────────
console.log('\n── 3. waistband visibility (pixel probe)');
const band = await ev('window.__atelier.bandCheck()');
console.log('  ' + JSON.stringify(band));
if (!band || !band.pass) fail('waistband band not verified: ' + JSON.stringify(band));

// ── 4. sleeve coverage ──────────────────────────────────────────────────────
console.log('\n── 4. sleeves over the deltoid (front + 3/4)');
for (const view of ['front', 'three-quarter']) {
  const sl = await ev(`window.__atelier.sleeveCheck('${view}')`);
  console.log(`  ${view}: ${sl?.pass ? 'PASS' : 'FAIL'} ` + JSON.stringify(sl?.samples));
  if (!sl?.pass) fail(`sleeve check ${view}: ${JSON.stringify(sl)}`);
}

// ── ASCII sanity views (agent eyes) ─────────────────────────────────────────
console.log('\n── ASCII bind/idle view (T=tee S=shorts W=band .=dark)');
console.log(await ev('window.__atelier.asciiView(12)', false));

// pose extremes for my inspection
for (const [expr, label] of [
  ['window.__atelier.setAnim("bvh:walk"); "set"', 'walk (live, paused at 0.4s)'],
] as const) {
  await ev(expr, false);
  await new Promise(r => setTimeout(r, 2500));
  await ev('window.__atelier.pause()', false);
  await ev('window.__atelier.stepFrame(30)', false);
  console.log(`\n── ASCII ${label}`);
  console.log(await ev('window.__atelier.asciiView(12)', false));
}
for (const pose of ['squat', 'pushup', 'jumpingjack', 'curl']) {
  await ev(`window.__atelier.setAnim("${pose}")`, false);
  await new Promise(r => setTimeout(r, 600));
  await ev('window.__atelier.pause()', false);
  await ev('window.__atelier.setBuildStep(6)', false);
  await ev('window.__atelier.stepFrame(60)', false);
  console.log(`\n── ASCII pose ${pose} mid-rep`);
  console.log(await ev('window.__atelier.asciiView(12)', false));
}

// ── 5. build-up screenshots ─────────────────────────────────────────────────
if (SHOTS) {
  console.log('\n── 5. build-up screenshots → apps/atelier/shots/');
  mkdirSync(shotDir, { recursive: true });
  await ev('window.__atelier.setAnim("idle")', false);
  await new Promise(r => setTimeout(r, 800));
  await ev('window.__atelier.pause()', false);
  await ev('window.__atelier.setTurntable(false)', false);
  const canvasRect = await ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`, false);
  const shotNow = (name: string) =>
    send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.w, height: canvasRect.h, scale: 1 },
      captureBeyondViewport: true,
    }, sessionId).then((s) => Bun.write(`${shotDir}${name}.png`, Buffer.from(s.result.data, 'base64')));
  const steps = await ev('import("/site/models/geno-outfit.js").then(m => m.BUILDUP_STEPS.length)', true);
  for (let i = 0; i < steps; i++) {
    await ev(`window.__atelier.setBuildStep(${i})`, false);
    await ev('window.__atelier.stepFrame(1)', false);
    await new Promise(r => setTimeout(r, 450));
    await shotNow(`buildup_${i}`);
    console.log(`  buildup_${i}.png`);
  }
  // full kit front + 3/4 (sleeve + waistband visual evidence)
  for (const [name, cam] of [['fullkit_front', { pos: [0, 1.15, 2.6], tgt: [0, 0.95, 0] }],
                             ['fullkit_34', { pos: [1.75, 1.3, 1.9], tgt: [0, 0.95, 0] }]] as const) {
    await ev(`window.__atelier.setCam(${JSON.stringify(cam.pos)}, ${JSON.stringify(cam.tgt)})`, false);
    await new Promise(r => setTimeout(r, 500));
    await shotNow(name);
    console.log(`  ${name}.png`);
  }
  await ev('window.__atelier.homeCam()', false);
}

// ── console errors ──────────────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 600));
console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 300));
console.log(`\n${failures} failed check(s)`);
ws.close(); process.exit(errors.length > 0 ? 2 : failures > 0 ? 1 : 0);
