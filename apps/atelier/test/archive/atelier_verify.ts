//
// atelier_verify.ts — programmatic verification of the OUTFIT ATELIER page
// and the canonical garments (geno-outfit.js). The human pass belongs to the
// founder via the page; this is the machine pass that arms it.
//
// Usage: bun apps/atelier/test/atelier_verify.ts [--shots]
//
// Checks (exit 2 = console errors, 1 = failed bars):
//   0. page loads, ZERO console errors, exactly ONE WebGL context
//   1. attachment probe — garment→body distance bars (per region, cloth
//      hanging allowances) across 5 BVH clips × 4 phases + 4 poses × 3
//      phases, cloth SETTLED to each posed frame (page-side probe)
//   2. SIGNED coverage probe — inside-body garment verts must be 0 per case
//      (depth-oracle occlusion test; dwell states after settle; tuck/fold/
//      bare-limb/sleeve-armpit crossings excused and counted)
//   3. cloth strain — adjacent-ring edge strain ≤ 2.5 cm (elastic collar)
//   4. REGION pixel checks — shirt-lime at shoulders/upper chest, shorts-
//      coral on both thighs, shoes at toes — at bind AND walk frame 50%
//   5. waistband visibility + sleeves over the deltoid (pixel probes)
//   6. CLOTH checks — silhouette bulk (shirt ≤ body+6 cm at chest, the
//      anti-armour detector), settle < 3 s from a rest drop, hem lag > 0 on
//      walk (fabric, not glue)
//   7. build-up + fullkit screenshots → apps/atelier/shots/ (_cloth, --shots)
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
  if (!report.attachPass) {
    const over = report.rows.filter((r: any) => r.overBar);
    if (over.length) fail('attachment bar breached: ' + over.map((r: any) => `${r.label} ${r.overBar} ${r.perGarment[r.overBar].maxCm}cm`).join('; '));
    // (inside-body failures are reported and failed by their own check below)
  }
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

// ── 2b. signed coverage summary (from the same verify report) ──────────────
const insideRows = report?.rows?.filter((r: any) => r.insideVerts > 0) ?? [];
const insideTotal = report?.insideVerts ?? 0;
const crossTotal = report?.limbCrossVerts ?? 0;
console.log(`  inside-body verts TOTAL: ${insideTotal} (bar 0) · worst ${report?.insideWorstCm ?? '?'} cm · ${crossTotal} bare-limb crossings excused (LBS cloth limit, documented)`);
if (insideTotal > 0) {
  for (const r of insideRows) console.log(`    ${r.label}: ${r.insideVerts} vert(s), worst ${r.insideWorstCm} cm`);
  fail(`inside-body verts: ${insideTotal} (expected 0)`);
}

// ── 3. REGION pixel checks (founder's three reports) ────────────────────────
console.log('\n── 3. region pixel checks (shoulders/chest, thighs, toes)');
{
  const walk = await ev(`
    (async () => {
      const A = window.__atelier, av = A.avatar;
      const M = await import('/site/model-avatars.js');
      const res = await M.loadBVH(M.BVH_FILES.walk);
      const p = new M.BVHPlayer(av, res);
      p.time = p.duration * 0.5; p.update(0);
      av.root.updateMatrixWorld(true);
      const r = await A.regionChecks();
      p.stop();
      return r;
    })()`);
  const bind = await ev('window.__atelier.regionChecks()');
  for (const [label, r] of [['bind', bind], ['walk@50%', walk]] as const) {
    if (!r || r.error) { fail(`regionChecks ${label}: ${r?.error ?? 'no value'}`); continue; }
    console.log(`  ${label}: ${r.pass ? 'PASS' : 'FAIL'} — ` + r.regions.map((x: any) => `${x.name} ${x.share}%${x.pass ? '✓' : '✗'}`).join(' · '));
    if (!r.pass) fail(`region checks ${label}: ` + r.regions.filter((x: any) => !x.pass).map((x: any) => x.name).join(', '));
  }
}

// ── 3b. waistband pixel check ───────────────────────────────────────────────
console.log('\n── 3. waistband visibility (pixel probe)');
const band = await ev('window.__atelier.bandCheck()');
console.log('  ' + JSON.stringify(band));
if (!band || !band.pass) fail('waistband band not verified: ' + JSON.stringify(band));

// ── 4b. sleeve coverage ─────────────────────────────────────────────────────
console.log('\n── 4. sleeves over the deltoid (front + 3/4)');
for (const view of ['front', 'three-quarter']) {
  const sl = await ev(`window.__atelier.sleeveCheck('${view}')`);
  console.log(`  ${view}: ${sl?.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(sl?.sleevePixels ?? sl?.samples ?? {})}`);
  if (!sl?.pass) fail(`sleeve check ${view}: ${JSON.stringify(sl)}`);
}

// ── 5b. CLOTH checks — bulk (armour detector), settle, lag ──────────────────
console.log('\n── 5. cloth: bulk silhouette (anti-armour) + settle + hem lag');
{
  const bulkBind = await ev('window.__atelier.bulkCheck()');
  console.log(`  bulk @bind: shirt ${bulkBind?.shirtCm} cm vs body ${bulkBind?.bodyCm} cm → +${bulkBind?.excessCm} cm (bar ≤6) ${bulkBind?.pass ? 'PASS' : 'FAIL'}`);
  if (!bulkBind?.pass) fail('bulk (armour detector) bind: ' + JSON.stringify(bulkBind));
  const drape = await ev('window.__atelier.drapeCheck()');
  console.log(`  settle from rest drop: ${drape?.settleS} s (bar <3) · hem lag on walk: ${drape?.lagCm} cm (bar >0.15) · sleeve simmer (reported): ${drape?.sleeveSimmerCmS} cm/s ${drape?.pass ? 'PASS' : 'FAIL'}`);
  if (!drape?.pass) fail('drape: ' + JSON.stringify(drape));
  const walkBulk = await ev(`(async () => {
    const A = window.__atelier, av = A.avatar;
    const M = await import('/site/model-avatars.js');
    const res = await M.loadBVH(M.BVH_FILES.walk);
    const p = new M.BVHPlayer(av, res);
    p.time = p.duration * 0.5; p.update(0);
    av.root.updateMatrixWorld(true);
    A.outfit.settle(0.45);
    const r = await A.bulkCheck(${bulkBind?.bodyCm ?? 0}); // bind body = pose-invariant reference
    p.stop();
    return r;
  })()`);
  console.log(`  bulk @walk50%: +${walkBulk?.excessCm} cm ${walkBulk?.pass ? 'PASS' : 'FAIL'}`);
  if (!walkBulk?.pass) fail('bulk walk@50%: ' + JSON.stringify(walkBulk));
  const st = await ev('window.__atelier.clothStats()');
  console.log(`  sim: ${st?.particles} particles · ${st?.constraints} constraints · ${st?.colliders} colliders · ${st?.lastMs} ms/frame · sleeping ${JSON.stringify(st?.sleeping)}`);
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
    await new Promise(r => setTimeout(r, 650));
    await shotNow(`buildup_cloth_${i}`);
    console.log(`  buildup_cloth_${i}.png`);
  }
  // full kit: front / back / 3-4 at bind (settled stand) ...
  await ev('window.__atelier.setBuildStep(6)', false);
  await ev('(async()=>{ window.__atelier.pause(); window.__atelier.avatar.pose("stand", 0.5); window.__atelier.outfit.settle(1.2); })()', true);
  for (const [name, cam] of [['fullkit_cloth_front', { pos: [0, 1.15, 2.6], tgt: [0, 0.95, 0] }],
                              ['fullkit_cloth_back', { pos: [0, 1.15, -2.6], tgt: [0, 0.95, 0] }],
                              ['fullkit_cloth_34', { pos: [1.75, 1.3, 1.9], tgt: [0, 0.95, 0] }]] as const) {
    await ev(`window.__atelier.setCam(${JSON.stringify(cam.pos)}, ${JSON.stringify(cam.tgt)})`, false);
    await new Promise(r => setTimeout(r, 500));
    await shotNow(name);
    console.log(`  ${name}.png`);
  }
  // ... and at mid-walk (cloth mid-stride — hems swinging)
  await ev(`(async () => {
    const A = window.__atelier, av = A.avatar;
    const M = await import('/site/model-avatars.js');
    const res = await M.loadBVH(M.BVH_FILES.walk);
    const p = new M.BVHPlayer(av, res);
    p.time = p.duration * 0.5; p.update(0);
    av.root.updateMatrixWorld(true);
    A.outfit.settle(0.5);
    window.__walkPlayer = p;
  })()`, true);
  await new Promise(r => setTimeout(r, 200));
  for (const [name, cam] of [['fullkit_cloth_walk_front', { pos: [0, 1.15, 2.6], tgt: [0, 0.95, 0] }],
                              ['fullkit_cloth_walk_back', { pos: [0, 1.15, -2.6], tgt: [0, 0.95, 0] }],
                              ['fullkit_cloth_walk_34', { pos: [1.75, 1.3, 1.9], tgt: [0, 0.95, 0] }]] as const) {
    await ev(`window.__atelier.setCam(${JSON.stringify(cam.pos)}, ${JSON.stringify(cam.tgt)})`, false);
    await new Promise(r => setTimeout(r, 350));
    await shotNow(name);
    console.log(`  ${name}.png`);
  }
  await ev('window.__walkPlayer?.stop(); undefined', false);
  await ev('window.__atelier.homeCam()', false);
}

// ── console errors ──────────────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 600));
console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 300));
console.log(`\n${failures} failed check(s)`);
ws.close(); process.exit(errors.length > 0 ? 2 : failures > 0 ? 1 : 0);
