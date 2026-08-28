// apps/avatars/test/fabric_verify.ts — full verification of both fixes.
//   A. black-card regression: browse every model card, assert every one draws
//      (drawnPx > 0), census live/lost WebGL contexts.
//   B. fabric: hem sim state over time on the Wardrobe + Full Kit cards
//      (walk): flex = how far the bottom ring's offset-from-anchor MOVES
//      (rigid skinning would hold it perfectly constant).
//   C. squat flare: hem ring radius from the thigh axis across the squat cycle.
//   D. perf: per-card renderMs (pose+fabric+render) for all Geno cards.
//   E. freeze discipline: paused exercise card → hem movement ≈ 0.
//   F. lazy contexts: off-screen 4.5s → renderer released; back → recreated.
// Plus viewport screenshots (composited) for eyeball review.
// Usage: bun apps/avatars/test/fabric_verify.ts
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/fabric', { recursive: true });

const PORT = 9461;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fabric-prof', '--no-first-run', '--no-sandbox',
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

const waitFor = async (expr, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};
const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description ?? 'exception' };
  return r?.result?.result?.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`/tmp/fabric/${name}.png`, Buffer.from(s.result.data, 'base64'));
};

await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`);
await sleep(1500);

const names = await ev(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`);
const idxOf = (re) => names.findIndex((n) => re.test(n));
const iWardrobe = idxOf(/Wardrobe — dressed/);
const iFullKit = idxOf(/Full Kit/);
console.log(`cards: wardrobe=${iWardrobe} fullkit=${iFullKit} of ${names.length}`);

// in-page hem sampler: anchors + bottom ring (world) + capsule endpoints
const hemSampleExpr = (i) => `(() => {
  const e = window.__rwfModels[${i}];
  const w = e.wardrobe; if (!w || !w.hems.length) return { err: 'no hems' };
  e.avatar.root.updateMatrixWorld(true);
  const bonePos = (b) => { const el = b.matrixWorld.elements; return [el[12], el[13], el[14]]; };
  return w.hems.map((h) => {
    const C = h.C, R = h.R, p = h.p;
    const ring = (r) => { const out = []; for (let k = 0; k < C; k++) { const o = (r*C+k)*3; out.push([p[o], p[o+1], p[o+2]]); } return out; };
    return {
      C, R,
      anchors: ring(0),
      bottom: ring(R),
      caps: h.spec.capsules.map((c) => ({ a: bonePos(c.a), b: bonePos(c.b), r: c.r })),
    };
  });
})()`;

// ── A. black-card regression ─────────────────────────────────────────────────
console.log('\n== A. browse-all draw check ==');
await ev(`(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 400) { scrollTo({ top: y }); await new Promise(r => setTimeout(r, 90)); } return true; })()`, true);
await sleep(3500);
let allDraw = true;
const perfByCard = {};
for (let i = 0; i < names.length; i++) {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  const ok = await waitFor(`(() => { const e = window.__rwfModels[${i}]; return !!(e && e.renderer && (e.avatar || e.root3d)); })()`, 45000);
  if (!ok) { console.log(`  ${i} ${names[i]}: NEVER READY ✗`); allDraw = false; continue; }
  await sleep(400);
  const v = await ev(`(() => { const e = window.__rwfModels[${i}]; e.renderer.render(e.scene, e.cam); const gl = e.renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const buf = new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf); let a=0; for (let p=0;p<W*H;p++) if (buf[p*4+3]>=10) a++; return { drawn: a, lost: gl.isContextLost(), renderMs: +(e.renderMs||0).toFixed(2) }; })()`);
  if (!v || v.__err) { console.log(`  ${i} ${names[i]}: probe err ${v?.__err}`); allDraw = false; continue; }
  perfByCard[names[i]] = v.renderMs;
  if (v.drawn <= 0) { console.log(`  ${i} ${names[i]}: drawnPx=0 ✗ BLACK`); allDraw = false; }
}
console.log(allDraw ? '  all cards drew pixels ✓' : '  SOME CARDS BLANK ✗');

// ── B. fabric walk: flex metrics on Wardrobe + Full Kit ──────────────────────
console.log('\n== B. hem flex during walk ==');
const cmPerUnit = 175 / 1.5; // cards normalise to 1.5 units ≙ 175 cm
for (const [label, i] of [['wardrobe', iWardrobe], ['fullkit', iFullKit]]) {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  await waitFor(`(() => { const e = window.__rwfModels[${i}]; return !!(e && e.renderer && e.avatar && e.bvh); })()`, 60000);
  await sleep(3000); // hems seeded + walking
  const samples = [];
  for (let s = 0; s < 14; s++) {
    const v = await ev(hemSampleExpr(i));
    if (v && !v.err) samples.push(v);
    await sleep(70);
  }
  if (!samples.length) { console.log(`  ${label}: NO SAMPLES ✗`); continue; }
  const t0 = samples[0];
  const flex = t0.map((_, h) => {
    let worst = 0, sum = 0, n = 0;
    for (const s of samples) {
      let d = 0;
      for (let k = 0; k < t0[h].C; k++) {
        const off = [s[h].bottom[k][0]-s[h].anchors[k][0], s[h].bottom[k][1]-s[h].anchors[k][1], s[h].bottom[k][2]-s[h].anchors[k][2]];
        const ref = [t0[h].bottom[k][0]-t0[h].anchors[k][0], t0[h].bottom[k][1]-t0[h].anchors[k][1], t0[h].bottom[k][2]-t0[h].anchors[k][2]];
        d += Math.hypot(off[0]-ref[0], off[1]-ref[1], off[2]-ref[2]);
      }
      const mean = d / t0[h].C * cmPerUnit;
      worst = Math.max(worst, mean); sum += mean; n++;
    }
    return { meanFlexCm: +(sum / n).toFixed(2), maxFlexCm: +worst.toFixed(2) };
  });
  console.log(`  ${label}: ${flex.map((f, h) => `hem${h}(C${t0[h].C}): mean ${f.meanFlexCm}cm max ${f.maxFlexCm}cm`).join(' · ')}`);
  await shot(`${label}_walkA`);
  await sleep(240);
  await shot(`${label}_walkB`);
  const rect = await ev(`(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  await Bun.write(`/tmp/fabric/${label}_rect.json`, JSON.stringify(rect));
}

// ── C. squat flare on the wardrobe card ──────────────────────────────────────
console.log('\n== C. squat flare ==');
await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${iWardrobe}].scrollIntoView({ block: 'center' }), true`);
await sleep(800);
await ev(`(() => { document.querySelectorAll('#modelGrid .style-card--model')[${iWardrobe}].querySelector('[data-ex="squat"]').click(); return true; })()`);
await sleep(2500);
const flareExpr = `(() => {
  const e = window.__rwfModels[${iWardrobe}];
  const w = e.wardrobe;
  e.avatar.root.updateMatrixWorld(true);
  return w.hems.map((h) => {
    const C = h.C, R = h.R, p = h.p;
    const cap = h.spec.capsules[0];
    const el = cap.a.matrixWorld.elements, el2 = cap.b.matrixWorld.elements;
    const ax = el[12], ay = el[13], az = el[14];
    const bx = el2[12], by = el2[13], bz = el2[14];
    const abx = bx-ax, aby = by-ay, abz = bz-az;
    const ab2 = abx*abx + aby*aby + abz*abz || 1e-9;
    let rSum = 0;
    for (let k = 0; k < C; k++) {
      const o = (R*C+k)*3;
      const px = p[o]-ax, py = p[o+1]-ay, pz = p[o+2]-az;
      const t = Math.max(0, Math.min(1, (px*abx+py*aby+pz*abz)/ab2));
      rSum += Math.hypot(px-abx*t, py-aby*t, pz-abz*t);
    }
    return rSum / C;
  });
})()`;
const flareSamples = [];
for (let s = 0; s < 26; s++) {
  const v = await ev(flareExpr);
  if (Array.isArray(v)) flareSamples.push(v);
  await sleep(65);
}
if (flareSamples.length) {
  const nH = flareSamples[0].length;
  for (let h = 0; h < nH; h++) {
    const rs = flareSamples.map((f) => f[h] ?? 0);
    const min = Math.min(...rs) * cmPerUnit, max = Math.max(...rs) * cmPerUnit;
    console.log(`  hem${h}: thigh-axis radius ${min.toFixed(1)}–${max.toFixed(1)} cm across squat cycle (Δ=${(max-min).toFixed(1)} cm)`);
  }
  // hang + lateral offset of the bottom ring vs the pin ring, squat vs earlier walk
  const sq = await ev(hemSampleExpr(iWardrobe));
  if (sq && !sq.err) {
    sq.forEach((h, i) => {
      let dz = 0, dl = 0;
      for (let k = 0; k < h.C; k++) {
        dz += h.anchors[k][1] - h.bottom[k][1];
        dl += Math.hypot(h.bottom[k][0] - h.anchors[k][0], h.bottom[k][2] - h.anchors[k][2]);
      }
      console.log(`  hem${i} squat-pose: hang ${(dz / h.C * cmPerUnit).toFixed(1)} cm below pin ring · lateral offset ${(dl / h.C * cmPerUnit).toFixed(1)} cm`);
    });
  }
  await shot('wardrobe_squat');
  const rect = await ev(`(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${iWardrobe}]; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  await Bun.write('/tmp/fabric/wardrobe_squat_rect.json', JSON.stringify(rect));
} else {
  console.log('  NO FLARE SAMPLES ✗');
}

// ── D. perf ──────────────────────────────────────────────────────────────────
console.log('\n== D. perf (per-card EMA ms/frame, pose+fabric+render) ==');
for (const [n, ms] of Object.entries(perfByCard)) {
  if (/geno/i.test(n)) console.log(`  ${ms} ms  ${n}`);
}

// ── E. freeze discipline ─────────────────────────────────────────────────────
console.log('\n== E. freeze ==');
await ev(`(() => { document.querySelectorAll('#modelGrid .style-card--model')[${iWardrobe}].scrollIntoView({ block: 'center' }); const cb = document.getElementById('galPlay'); if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
await sleep(1500);
const frozenA = await ev(hemSampleExpr(iWardrobe));
await sleep(600);
const frozenB = await ev(hemSampleExpr(iWardrobe));
if (frozenA && frozenB && !frozenA.err && !frozenB.__err) {
  let worst = 0;
  for (let h = 0; h < frozenA.length; h++) {
    for (let k = 0; k < frozenA[h].C; k++) {
      const dx = frozenB[h].bottom[k][0] - frozenA[h].bottom[k][0];
      const dy = frozenB[h].bottom[k][1] - frozenA[h].bottom[k][1];
      const dz = frozenB[h].bottom[k][2] - frozenA[h].bottom[k][2];
      worst = Math.max(worst, Math.hypot(dx, dy, dz));
    }
  }
  console.log(`  paused squat card: max hem movement over 0.6s = ${(worst * cmPerUnit).toFixed(2)} cm ${worst * cmPerUnit < 0.05 ? '✓ frozen' : '(moving)'}`);
} else {
  console.log('  freeze sample failed:', frozenA?.err ?? frozenA?.__err ?? frozenB?.__err);
}
await ev(`(() => { const cb = document.getElementById('galPlay'); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);

// ── F. lazy contexts ─────────────────────────────────────────────────────────
console.log('\n== F. lazy WebGL discipline ==');
await ev(`scrollTo({ top: 0 }), true`);
await sleep(4500);
const released = await ev(`(() => { const e = window.__rwfModels[${iWardrobe}]; return !e.renderer; })()`);
await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${iWardrobe}].scrollIntoView({ block: 'center' }), true`);
await sleep(1500);
const recreated = await ev(`(() => { const e = window.__rwfModels[${iWardrobe}]; return !!e.renderer; })()`);
const census = await ev(`(() => { let live = 0, lost = 0; for (const c of document.querySelectorAll('canvas')) { const g = c.getContext('webgl2') || c.getContext('webgl'); if (g) g.isContextLost() ? lost++ : live++; } return { live, lost }; })()`);
console.log(`  wardrobe renderer released off-screen: ${released ? '✓' : '✗'} · recreated on return: ${recreated ? '✓' : '✗'}`);
console.log(`  context census: ${JSON.stringify(census)}`);

console.log('\nCONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 240));
await Bun.write('/tmp/fabric/errors.json', JSON.stringify(errors, null, 2));
console.log('\nartifacts in /tmp/fabric/');
ws.close(); process.exit(errors.length ? 2 : 0);
