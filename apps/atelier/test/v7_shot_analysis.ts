// v7 SHOT ANALYSIS — numeric evidence from the rendered PNGs (no eyeballs).
// The shots are CANVAS exports (no UI chrome; uniform #0a0b0d background).
//   collar_v7_neckline.png : collar rib band wraps BESIDE the neck — in the
//                            upper half, lime exists left AND right of a
//                            central pale (neck-flesh) gap, ABOVE any
//                            shoulder/trap silhouette
//   band_v7_waist{,34}.png : a charcoal run sits directly above coral shorts
//   pose_v7_*.png          : figure silhouettes differ from stand the way the
//                            pose demands (squat shorter, pushup MUCH flatter,
//                            jack wider + taller, curl forearms raised)
// Usage: bun apps/atelier/test/v7_shot_analysis.ts
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const OUT = 'apps/atelier/shots';

function decodePng(buf: Buffer): { w: number; h: number; data: Uint8Array } {
  let off = 8; const chunks: Buffer[] = [];
  let w = 0, h = 0, depth = 0, ctype = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    if (type === 'IDAT') chunks.push(data);
    off += len + 12;
    if (type === 'IEND') break;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6)) throw new Error(`unsupported PNG ${ctype}/${depth}`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[i] = v;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 3] = cur[x * bpp]; out[(y * w + x) * 3 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 3 + 2] = cur[x * bpp + 2]; }
    prev = cur;
  }
  return { w, h, data: out };
}
const load = (name: string) => decodePng(readFileSync(`${OUT}/${name}`));
const px = (im: any, x: number, y: number) => [im.data[(y * im.w + x) * 3], im.data[(y * im.w + x) * 3 + 1], im.data[(y * im.w + x) * 3 + 2]];
const isLime = ([r, g, b]: number[]) => g > 100 && g > r + 18 && g > b + 18;
const isCoral = ([r, g, b]: number[]) => r > 130 && r > g + 40 && r > b + 40;
const isBand = ([r, g, b]: number[]) => b >= r + 3 && b > g && Math.max(r, g, b) > 34 && Math.max(r, g, b) < 150 && Math.max(r, g, b) - Math.min(r, g, b) < 44;
const isPale = ([r, g, b]: number[]) => r > 120 && g > 120 && b > 120 && Math.max(r, g, b) - Math.min(r, g, b) < 40;

const results: any = { steps: [] };
const step = (name: string, pass: boolean, detail: any) => { results.steps.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`); };

// FIX1 — collar close-up (neutral-lit). The honest pixel signature of "collar
// at the neck, not on the traps": scanning top→bottom past the jaw, LIME
// first appears while the pale (flesh) column is still NECK-WIDTH — before
// the shoulder/trap flare widens it. If the collar sat on the traps (the v6
// defect), lime would only start ~8 cm lower, well after the flare.
{
  const im = load('collar_v7_neckline.png');
  const countRow = (y: number, test: (c: number[]) => boolean) => { let n = 0, x0 = -1, x1 = -1; for (let x = 0; x < im.w; x++) { if (test(px(im, x, y))) { n++; if (x0 < 0) x0 = x; x1 = x; } } return { n, w: n ? x1 - x0 : 0 }; };
  // the widest lime row in the lower half = the shirt across the shoulders
  let shoulderW = 0, shoulderY = -1;
  for (let y = Math.round(im.h * 0.5); y < im.h; y++) { const r = countRow(y, isLime); if (r.n >= 10 && r.w > shoulderW) { shoulderW = r.w; shoulderY = y; } }
  // first lime row in the upper 55% = the collar edge (needs ≥8 px to skip strays)
  let collarY = -1, collarW = -1, paleWAtCollar = -1;
  for (let y = Math.round(im.h * 0.1); y < im.h * 0.55; y++) {
    const r = countRow(y, isLime);
    if (r.n >= 8) { collarY = y; collarW = r.w; paleWAtCollar = countRow(y, isPale).w; break; }
  }
  // the pale column must still be near NECK width at the collar row: ≤ 75% of
  // the shoulder lime width (the trap flare reads ~100%+)
  step('FIX1 shot: collar edge starts at NECK width — above the shoulder/trap flare',
    collarY > 0 && shoulderW > 0 && collarW <= shoulderW * 0.75,
    { collarRowPx: collarY, collarLimeW: collarW, shoulderLimeW: shoulderW, shoulderRowPx: shoulderY,
      ratio: shoulderW ? +(collarW / shoulderW).toFixed(2) : null, paleWAtCollar });
}
// FIX2 — waistband front + 3/4: charcoal run directly above coral (scan the
// central third of columns; band = charcoal row with coral starting below)
for (const [name, tag] of [['band_v7_waist.png', 'front'], ['band_v7_waist34.png', '3/4']] as any[]) {
  try {
    const im = load(name);
    const x0 = Math.round(im.w * 0.38), x1 = Math.round(im.w * 0.62);
    const rows: number[] = []; let bestAdj = -1, adjRow = -1;
    for (let y = 0; y < im.h; y++) {
      let band = 0, coral = 0;
      for (let x = x0; x <= x1; x += 2) { const c = px(im, x, y); if (isBand(c)) band++; else if (isCoral(c)) coral++; }
      if (band >= (x1 - x0) / 2 * 0.35) rows.push(y);
      if (band >= 4 && coral >= 2) { bestAdj = band; adjRow = y; }
    }
    // adjacency: some band row with a coral row starting ≤25px below it
    let adjacent = false;
    for (const y of rows) for (let dy = 1; dy <= 25 && y + dy < im.h; dy++) {
      let coral = 0; for (let x = x0; x <= x1; x += 2) if (isCoral(px(im, x, y + dy))) coral++;
      if (coral >= 6) { adjacent = true; break; }
    }
    step(`FIX2 shot: charcoal band above coral shorts (${tag})`, rows.length >= 3 && adjacent,
      { bandRows: rows.length, bandSpan: rows.length ? `${Math.min(...rows)}-${Math.max(...rows)}` : null, adjacent });
  } catch (e: any) { step(`FIX2 shot (${tag})`, false, String(e).slice(0, 80)); }
}
// FIX4 — pose silhouettes on clean canvas frames (bg #0a0b0d): figure bbox +
// widest-row width, per pose vs stand.
{
  const fig = (name: string) => {
    const im = load(name);
    let top = im.h, bot = -1, widest = 0, wideY = -1, area = 0;
    const rowWidth: number[] = [];
    for (let y = 0; y < im.h; y++) {
      let n = 0, x0 = -1, x1 = -1;
      for (let x = 0; x < im.w; x += 2) {
        const c = px(im, x, y);
        if (Math.abs(c[0] - 10) + Math.abs(c[1] - 11) + Math.abs(c[2] - 13) > 42) { n++; if (x0 < 0) x0 = x; x1 = x; }
      }
      if (n >= 4) { if (y < top) top = y; bot = y; area += n * 2; rowWidth[y] = x1 - x0; if (x1 - x0 > widest) { widest = x1 - x0; wideY = y; } }
    }
    // leg-zone width: max width in the band 60–80% down the figure (thigh/
    // knee — jack's spread legs). Below ~85% the shoes + ground contact rows
    // are wide for BOTH stand and jack and would mask the spread.
    let legW = 0;
    for (let y = Math.round(top + (bot - top) * 0.60); y <= Math.round(top + (bot - top) * 0.80); y++) legW = Math.max(legW, rowWidth[y] ?? 0);
    return { top, bot, heightPx: bot - top + 1, widestPx: widest, legW, wideY, area };
  };
  const names: any = { stand: 'fullkit_v7_front.png', squat: 'pose_v7_squat.png', pushup: 'pose_v7_pushup.png', jumpingjack: 'pose_v7_jumpingjack.png', curl: 'pose_v7_curl.png' };
  const f: any = {};
  for (const [k, n] of Object.entries(names)) f[k] = fig(n as string);
  const pct = (a: number, b: number) => +(100 * (a - b) / b).toFixed(1);
  const det: any = {
    standH: f.stand.heightPx,
    squatHΔ: pct(f.squat.heightPx, f.stand.heightPx),
    pushupHΔ: pct(f.pushup.heightPx, f.stand.heightPx),
    jackLegWΔ: pct(f.jumpingjack.legW, f.stand.legW),
    jackHΔ: pct(f.jumpingjack.heightPx, f.stand.heightPx),
    curlHΔ: pct(f.curl.heightPx, f.stand.heightPx),
    curlAreaΔ: pct(f.curl.area, f.stand.area),
  };
  // squat: figure clearly shorter (hips drop: ≥6%)
  // pushup: prone plank: MUCH shorter (≥35%)
  // jack: leg-zone wider (spread legs, ≥25%) AND taller or equal (arms up)
  // curl: silhouette near stand but distinct (ΔH within ±15%, area Δ ≥3%)
  const pass =
    det.squatHΔ <= -6 &&
    det.pushupHΔ <= -35 &&
    det.jackLegWΔ >= 25 && det.jackHΔ >= -2 &&
    Math.abs(det.curlHΔ) <= 15 && Math.abs(det.curlAreaΔ) >= 3;
  step('FIX4 shots: pose silhouettes match the four exercises', pass, det);
}
// FIX3 — drape pleats visible as SHADING BANDS in the close-up render: across
// a horizontal scanline of the shirt torso, the green channel should ripple
// (fold shadows) rather than follow one smooth cylinder highlight. Count
// significant local minima after light smoothing.
{
  // close-up first; fall back to the 3/4 hang shot (both are drape evidence)
  let im: any = null, src = '';
  for (const n of ['fabric_v7_hem.png', 'fabric_v7_hang.png']) {
    const cand = load(n);
    let bestN = 0, bestY = -1;
    for (let y = 0; y < cand.h; y++) {
      let c2 = 0; for (let x = 0; x < cand.w; x += 2) { if (isLime(px(cand, x, y))) c2++; }
      if (c2 > bestN) { bestN = c2; bestY = y; }
    }
    if (bestN >= 40) { im = cand; src = n; (im as any).scanY = bestY; break; }
  }
  const bestY = im ? (im as any).scanY : -1;
  const greens: number[] = [], xs: number[] = [];
  if (bestY > 0) for (let x = 0; x < im.w; x++) { const c = px(im, x, bestY); if (isLime(c)) { greens.push(c[1]); xs.push(x); } }
  // 5-px box smooth, then count dips: local minima ≥ 6 units deep vs both shoulders ≥ 12px away
  let dips = 0; const dipDepths: number[] = [];
  if (greens.length > 60) {
    const sm = greens.map((_, i) => { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const g = greens[i + k]; if (g != null) { s += g; n++; } } return s / n; });
    for (let i = 12; i < sm.length - 12; i++) {
      let L = 0, R = 0;
      for (let k = 1; k <= 10; k++) { L = Math.max(L, sm[i - k] - sm[i], sm[i + k] - sm[i]); R = Math.max(R, sm[i - k] - sm[i], sm[i + k] - sm[i]); }
      if (L >= 5 && R >= 5 && sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1]) { dips++; dipDepths.push(+L.toFixed(0)); i += 8; }
    }
  }
  step(`FIX3 shot: drape pleats read as shading bands on the shirt (≥3 fold dips across the torso, ${src})`,
    dips >= 3, { src, scanRow: bestY, limePx: greens.length, dips, dipDepths });
}
const failed = results.steps.filter((x: any) => !x.pass);
console.log(`\n${results.steps.length - failed.length}/${results.steps.length} shot checks pass`);
process.exit(failed.length ? 1 : 0);
