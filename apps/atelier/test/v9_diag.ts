// v9 DIAGNOSIS — the founder's two garment defects, measured before the fix.
//   DEFECT 1: "invisible sections around the shoulders for the shirt"
//     → shoulder-region garment pixel coverage at stand: lime% / flesh% /
//       see-through%; where are the missing patches (NDC offsets).
//   DEFECT 2: "the shorts have an invisible band under the band"
//     → vertical column scans through the waist: classify every row from
//       shirt hem → band → shorts; a FLESH or DARK run between charcoal and
//       coral = the transparent gap strip.
// Instrument: ONE render per camera via __atelier.snapshot() decoded to a
// canvas in-page → full-frame pixel grid with our own classifier.
// Usage: bun apps/atelier/test/v9_diag.ts
const PORT = 9573;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v9-diag2', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? '').slice(0, 300));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
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
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.exception?.text ?? '').slice(0, 800) };
  return r?.result?.result?.value;
};

// install the one-render scanner: window.__scan() → { W, H, px(x,y) → [r,g,b] }
// (classifies from the decoded frame; x/y are canvas pixels, y from BOTTOM)
await ev(`(async () => {
  const A = window.__atelier;
  window.__scan = async () => {
    const url = A.snapshot();
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    return { W: cv.width, H: cv.height, d };
  };
  window.__cls = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx === g && d > 30 && g > 120) return 'lime';
    if (mx === r && d > 30 && r > 110) return 'coral';
    if (b >= r + 3 && d < 44 && mx > 34 && mx < 150) return 'band';
    if (mx > 140 && d < 45 && b >= r - 25) return 'flesh';
    if (d < 12 && mx < 60) return 'dark';
    return 'other';
  };
  return 'ok';
})()`);

// ═══ 1. SHOULDER COVERAGE (pose stand) ═══
const shoulder = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  av.pose('stand', 0.35);
  av.root.updateMatrixWorld(true);
  for (const g of A.outfit.slots.head ?? []) g.visible = false;
  const out = {};
  const sides = { L: av.bones.armL, R: av.bones.armR };
  const cams = {
    front: (p) => [[p.x * 1.4, p.y + 0.06, p.z + 1.15], [p.x * 0.9, p.y - 0.02, p.z]],
    back:  (p) => [[p.x * 1.4, p.y + 0.06, p.z - 1.15], [p.x * 0.9, p.y - 0.02, p.z]],
    top:   (p) => [[p.x * 1.6, p.y + 0.85, p.z + 0.28], [p.x * 0.9, p.y, p.z]],
  };
  for (const [sk, bone] of Object.entries(sides)) {
    for (const [ck, cf] of Object.entries(cams)) {
      const p = bone.getWorldPosition(new THREE.Vector3());
      A.setCam(...cf(p));
      const cam = A.getCam();
      const ndc = p.clone().project(cam);
      const { W, H, d } = await window.__scan();
      const tally = { lime: 0, flesh: 0, dark: 0, other: 0, coral: 0, band: 0 };
      const misses = [];
      for (let dx = -0.20; dx <= 0.20; dx += 0.004) for (let dy = -0.16; dy <= 0.16; dy += 0.004) {
        if (dx * dx + dy * dy > 0.20 * 0.20) continue;
        // getImageData row 0 = frame TOP → NDC y maps to (1−y)/2
        const x = Math.round((ndc.x + dx + 1) / 2 * (W - 1)), y = Math.round((1 - (ndc.y + dy)) / 2 * (H - 1));
        const q = (y * W + x) * 4;
        const cls = window.__cls(d[q], d[q + 1], d[q + 2]);
        tally[cls]++;
        if ((cls === 'flesh' || cls === 'dark') && misses.length < 8) {
          misses.push([+dx.toFixed(3), +dy.toFixed(3), cls, d[q] + ',' + d[q + 1] + ',' + d[q + 2]]);
        }
      }
      const n = Object.values(tally).reduce((a, b) => a + b, 0);
      out[sk + '-' + ck] = {
        limePct: +(100 * tally.lime / n).toFixed(1), fleshPct: +(100 * tally.flesh / n).toFixed(1),
        darkPct: +(100 * tally.dark / n).toFixed(1), otherPct: +(100 * tally.other / n).toFixed(1),
        coralPct: +(100 * tally.coral / n).toFixed(1), bandPct: +(100 * tally.band / n).toFixed(1),
        misses,
      };
    }
  }
  for (const g of A.outfit.slots.head ?? []) g.visible = true;
  A.homeCam();
  return out;
})()`);
console.log('SHOULDER (stand):', JSON.stringify(shoulder, null, 1));

// ASCII map of the left shoulder front (flesh '.'→'F', band 'B', dark '·')
const asciiL = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  for (const g of A.outfit.slots.head ?? []) g.visible = false;
  const p = av.bones.armL.getWorldPosition(new THREE.Vector3());
  A.setCam([p.x * 1.4, p.y + 0.06, p.z + 1.15], [p.x * 0.9, p.y - 0.02, p.z]);
  const { W, H, d } = await window.__scan();
  const rows = [];
  const cell = 5;
  for (let y0 = Math.round(H * 0.08); y0 < H * 0.92; y0 += cell) {
    let row = '';
    for (let x0 = 0; x0 < W; x0 += cell) {
      const tally = {};
      for (let dy = 0; dy < cell; dy += 2) for (let dx = 0; dx < cell; dx += 2) {
        const q = ((H - 1 - (y0 + dy)) * W + x0 + dx) * 4;
        const c = window.__cls(d[q], d[q + 1], d[q + 2]);
        tally[c] = (tally[c] ?? 0) + 1;
      }
      let best = 'dark', bn = 0;
      for (const [k, v] of Object.entries(tally)) if (v > bn) { bn = v; best = k; }
      row += best === 'lime' ? 'T' : best === 'flesh' ? 'F' : best === 'band' ? 'B' : best === 'coral' ? 'S' : best === 'dark' ? '·' : ' ';
    }
    rows.push(row.replace(/·+$/, ''));
  }
  for (const g of A.outfit.slots.head ?? []) g.visible = true;
  A.homeCam();
  return rows.filter((r) => /[TFB]/.test(r)).join('\\n');
})()`);
console.log('LEFT SHOULDER front (T=shirt F=flesh B=band ·=bg " "=other):\n' + asciiL);

// ═══ 2. BAND JUNCTION (stand / walk50 / squat50) ═══
const bandJunction = await ev(`(async () => {
  const THREE = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  const out = {};
  const scan = async (label) => {
    av.root.updateMatrixWorld(true);
    A.setCam([0.30, 1.02, 2.6], [0, 0.92, 0]);
    const cam = A.getCam();
    const H = av.H * av.root.scale.x;
    const { W, H: FH, d } = await window.__scan();
    const rows = [];
    for (let wy = 0.72 * H; wy >= 0.50 * H; wy -= 0.003 * H) {
      const ndc = new THREE.Vector3(0.02, wy, 0).project(cam);
      const tally = { lime: 0, coral: 0, band: 0, flesh: 0, dark: 0, other: 0 };
      let fleshSample = null;
      for (let dx = -0.05; dx <= 0.05; dx += 0.0025) {
        const x = Math.round((ndc.x + dx + 1) / 2 * (W - 1)), y = Math.round((1 - ndc.y) / 2 * (FH - 1));
        const q = (y * W + x) * 4;
        const cls = window.__cls(d[q], d[q + 1], d[q + 2]);
        tally[cls]++;
        if (cls === 'flesh' && !fleshSample) fleshSample = [d[q], d[q + 1], d[q + 2]];
      }
      rows.push({ wy: +(wy / H).toFixed(4), ...tally, n: 41, fleshSample });
    }
    const dom = rows.map((r) => {
      let best = 'other', bv = -1;
      for (const k of ['lime', 'coral', 'band', 'flesh', 'dark', 'other']) if (r[k] > bv) { bv = r[k]; best = k; }
      return { wy: r.wy, cls: best, pct: Math.round(100 * bv / r.n), flesh: r.flesh, fleshSample: r.fleshSample };
    });
    const bandRows = dom.filter((r) => r.cls === 'band');
    const gapsBelow = [];
    if (bandRows.length) {
      const bLo = Math.min(...bandRows.map((r) => r.wy));
      let run = [];
      const flush = () => { if (run.length) gapsBelow.push({ fromY: run[0].wy, toY: run[run.length - 1].wy, cls: run[0].cls, rows: run.length, worstPct: Math.max(...run.map((r2) => r2.pct)) }); run = []; };
      let inGap = false;
      for (const r of dom) {
        if (r.wy >= bLo) { if (inGap) { flush(); inGap = false; } continue; }
        const gapish = r.cls === 'flesh' || r.cls === 'dark' || (r.cls === 'other' && r.pct < 55);
        if (gapish && r.pct >= 30) { if (!inGap) { inGap = true; run = []; } run.push(r); }
        else if (inGap) { flush(); inGap = false; }
      }
      if (inGap) flush();
    }
    out[label] = {
      bandRowsYH: bandRows.map((r) => r.wy),
      gapsBelowBand: gapsBelow,
      columnTopDown: dom.map((r) => r.wy + ':' + r.cls + (r.cls === 'flesh' || r.cls === 'dark' ? '!' : '')).join(' '),
    };
  };
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true); await scan('stand');
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0); av.root.updateMatrixWorld(true); await scan('walk50');
  p.stop();
  av.pose('squat', 0.5); av.root.updateMatrixWorld(true); await scan('squat50');
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  A.homeCam();
  return out;
})()`);
console.log('BAND JUNCTION:', JSON.stringify(bandJunction, null, 1));
console.log('ERRORS:', errors.slice(0, 5));
await send('Browser.close', {}).catch(() => {});
process.exit(0);
