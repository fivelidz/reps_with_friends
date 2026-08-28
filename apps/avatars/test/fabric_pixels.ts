// apps/avatars/test/fabric_pixels.ts — pixel-level hem verification (image
// reading unavailable in this session → project hem world positions to page
// pixels and analyse exactly those crops).
//   1. hem band renders: mean colour in the projected hem bbox matches the
//      garment colour (coral shorts / lime tank), not the dark stage.
//   2. hem band extends BELOW the garment's pin ring (geometry present).
//   3. two walk frames differ INSIDE the hem bbox (motion at the hems).
// Usage: bun apps/avatars/test/fabric_pixels.ts
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/fabricpx', { recursive: true });

const PORT = 9465;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fabricpx-prof', '--no-first-run', '--no-sandbox',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (r?.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description ?? 'exception' };
  return r?.result?.result?.value;
};
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev('!!window.__rwfModels')) break; }
await sleep(1200);
const names = await ev(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`);
const idxOf = (re) => names.findIndex((n) => re.test(n));

// project a hem's particles + its garment pin ring to page-pixel bboxes
const bboxExpr = (i) => `(async () => {
  try {
    const THREE = await import('/site/lib/three.module.js');
    const e = window.__rwfModels[${i}];
    const w = e.wardrobe; if (!w || !w.hems.length) return { err: 'no hems' };
    e.avatar.root.updateMatrixWorld(true);
    const canvas = e.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const pr = e.renderer.getPixelRatio();
    const cam = e.cam;
    const proj = (v) => {
      const ndc = new THREE.Vector3(v[0], v[1], v[2]).project(cam);
      return [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height, ndc.z];
    };
    const out = [];
    for (const h of w.hems) {
      const C = h.C, R = h.R, p = h.p;
      const hem = [], pin = [];
      for (let k = 0; k < C; k++) {
        const o = (R * C + k) * 3; // bottom ring
        hem.push(proj([p[o], p[o+1], p[o+2]]));
        pin.push(proj([p[k*3], p[k*3+1], p[k*3+2]]));
      }
      const bb = (pts) => {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
      };
      out.push({ tag: h.spec.tag, hemBBox: bb(hem), pinBBox: bb(pin) });
    }
    return { cardRect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }, hems: out };
  } catch (err) { return { err: err.message }; }
})()`;

const analyse = async (label, i) => {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  for (let t = 0; t < 90; t++) { if (await ev(`!!(window.__rwfModels[${i}] && window.__rwfModels[${i}].bvh)`)) break; await sleep(400); }
  await sleep(2500);
  const v = await ev(bboxExpr(i), true);
  if (!v || v.err || v.__err) { console.log(`${label}: bbox probe failed`, v?.err ?? v?.__err); return; }
  console.log(`\n### ${label}`);
  for (const h of v.hems) {
    const [hx0, hy0, hx1, hy1] = h.hemBBox, [px0, py0, px1, py1] = h.pinBBox;
    console.log(`  ${h.tag}: hem bbox [${hx0},${hy0} ${hx1}×${hy1}] pin bbox [${px0},${py0} ${px1}×${py1}] → hem extends ${py0 - hy0}px above / ${hy1 - py1}px below pin bbox`);
  }
  // two frames 240 ms apart
  const s1 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`/tmp/fabricpx/${label}_A.png`, Buffer.from(s1.result.data, 'base64'));
  await sleep(240);
  const s2 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await Bun.write(`/tmp/fabricpx/${label}_B.png`, Buffer.from(s2.result.data, 'base64'));
  // crop hem bboxes from both + measure
  for (let hi = 0; hi < v.hems.length; hi++) {
    const h = v.hems[hi];
    const [x0, y0, x1, y1] = h.hemBBox;
    if (x1 - x0 < 4 || y1 - y0 < 4) { console.log(`  ${h.tag}: bbox degenerate`); continue; }
    const w = Math.min(x1 - x0 + 8, 400), hh = Math.min(y1 - y0 + 8, 400);
    const cx = Math.max(0, x0 - 4), cy = Math.max(0, y0 - 4);
    const A = `/tmp/fabricpx/${label}_${hi}_A.png`, B = `/tmp/fabricpx/${label}_${hi}_B.png`;
    const crop = (src, dst) => Bun.spawnSync(['magick', src, '-crop', `${w}x${hh}+${cx}+${cy}`, '+repage', dst], { stdio: ['ignore', 'ignore', 'ignore'] });
    crop(`/tmp/fabricpx/${label}_A.png`, A);
    crop(`/tmp/fabricpx/${label}_B.png`, B);
    const diff = Bun.spawnSync(['compare', '-metric', 'AE', A, B, 'null:'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const ae = Number(new TextDecoder().decode(diff.stderr).trim()) || 0;
    // mean colour of frame A crop
    const stats = Bun.spawnSync(['magick', A, '-format', '%[mean]', 'info:'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const mean = new TextDecoder().decode(stats.stdout).trim();
    // unique-ish colour count
    const hist = Bun.spawnSync(['magick', A, '-colors', '8', '-format', '%c', 'histogram:info:'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const topColours = new TextDecoder().decode(hist.stdout).trim().split('\n').slice(0, 3).map(l => l.trim());
    console.log(`  ${h.tag} crop ${w}x${hh}: AE(diff A/B)=${ae} mean=${mean} top: ${topColours.join(' | ').slice(0, 150)}`);
  }
};

await analyse('wardrobe', idxOf(/Wardrobe — dressed/));
await analyse('fullkit', idxOf(/Full Kit/));

ws.close(); process.exit(0);
