// apps/avatars/test/fabric_pixels2.ts — framebuffer hem verification.
// Projects each hem's particles to canvas pixels, samples those exact pixels
// from gl.readPixels (two renders 240 ms apart): colour presence + motion.
// Also colour-verifies the previously-black tint cards.
// Usage: bun apps/avatars/test/fabric_pixels2.ts
const PORT = 9466;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fabricpx2-prof', '--no-first-run', '--no-sandbox',
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

// one frame: render, read framebuffer, sample hem band pixels + pin band pixels
const frameExpr = (i) => `(async () => {
  try {
    const THREE = await import('/site/lib/three.module.js');
    const e = window.__rwfModels[${i}];
    const w = e.wardrobe; if (!w || !w.hems.length) return { err: 'no hems' };
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const px = (x, y) => { // y: NDC-up → buffer coords (bottom-left origin)
      const bx = Math.max(0, Math.min(W - 1, Math.round(x))), by = Math.max(0, Math.min(H - 1, Math.round(y)));
      const o = (by * W + bx) * 4;
      return [buf[o], buf[o+1], buf[o+2], buf[o+3]];
    };
    const out = { hems: [] };
    for (const h of w.hems) {
      const C = h.C, R = h.R, p = h.p;
      // sample a disc of 5 px around each bottom-ring particle + pin particle
      const samp = (arr) => {
        const rgbs = [];
        for (const [u, v] of arr) {
          // NDC y +1 = top of screen = TOP of the readback (row H-1); GL's
          // readPixels origin is bottom-left, so flip: v=+1 → H (clamped H-1)
          const bx = (u * W) / 2 + W / 2, by = ((v + 1) / 2) * H;
          for (const [dx, dy] of [[0,0],[2,0],[-2,0],[0,2],[0,-2]]) rgbs.push(px(bx + dx, by + dy));
        }
        return rgbs;
      };
      const proj = (o3) => {
        const ndc = new THREE.Vector3(p[o3], p[o3+1], p[o3+2]).project(e.cam);
        return [ndc.x, ndc.y];
      };
      const bottoms = [], pins = [];
      for (let k = 0; k < C; k++) {
        bottoms.push(proj((R * C + k) * 3));
        pins.push(proj(k * 3));
      }
      out.hems.push({ tag: h.spec.tag, bottom: samp(bottoms), pin: samp(pins) });
    }
    return out;
  } catch (err) { return { err: err.message }; }
})()`;

const summarise = (rgbs) => {
  let n = 0, r = 0, g = 0, b = 0, chroma = 0;
  for (const [R, G, B, A] of rgbs) {
    if (A < 10) continue;
    n++; r += R; g += G; b += B;
    if (Math.max(R, G, B) - Math.min(R, G, B) > 30) chroma++;
  }
  return { n, mean: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null, chromaPct: n ? Math.round(100 * chroma / n) : 0 };
};

for (const [label, i] of [['wardrobe', idxOf(/Wardrobe — dressed/)], ['fullkit', idxOf(/Full Kit/)]]) {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  for (let t = 0; t < 90; t++) { if (await ev(`!!(window.__rwfModels[${i}] && window.__rwfModels[${i}].bvh)`)) break; await sleep(400); }
  await sleep(2500);
  const f1 = await ev(frameExpr(i), true);
  await sleep(240);
  const f2 = await ev(frameExpr(i), true);
  if (!f1 || f1.err || f1.__err) { console.log(`${label}: probe failed`, f1?.err ?? f1?.__err); continue; }
  console.log(`\n### ${label} (walk, frames 240 ms apart)`);
  for (let hi = 0; hi < f1.hems.length; hi++) {
    const a = f1.hems[hi], b = f2.hems[hi];
    const sb = summarise(a.bottom), sp = summarise(a.pin);
    // motion: bottom-ring pixel change between frames (pairwise same sample slot)
    let moved = 0, n = 0;
    for (let s = 0; s < a.bottom.length; s++) {
      const [r1, g1, b1, al1] = a.bottom[s], [r2, g2, b2, al2] = b.bottom[s];
      if (al1 < 10 && al2 < 10) continue;
      n++;
      if (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 40) moved++;
    }
    const sb2 = summarise(b.bottom);
    console.log(`  ${a.tag}: bottom mean RGB ${JSON.stringify(sb.mean)} (chroma ${sb.chromaPct}%) · pin mean ${JSON.stringify(sp.mean)} · moved ${moved}/${n} samples (${Math.round(100 * moved / Math.max(1, n))}%) between frames`);
  }
}

// colour-verify the previously-black tint cards (fit = lime, goblin = green)
console.log('\n### tint card colours (the old black-card suspects)');
for (const [label, i] of [['fit(lime)', idxOf(/fit tier/)], ['goblin(green)', idxOf(/goblin green/)], ['geno base', idxOf(/AI4Animation/)]]) {
  await ev(`document.querySelectorAll('#modelGrid .style-card--model')[${i}].scrollIntoView({ block: 'center' }), true`);
  for (let t = 0; t < 90; t++) { if (await ev(`!!(window.__rwfModels[${i}] && window.__rwfModels[${i}].renderer && window.__rwfModels[${i}].avatar)`)) break; await sleep(400); }
  await sleep(600);
  const v = await ev(`(() => { const e = window.__rwfModels[${i}]; e.renderer.render(e.scene, e.cam); const gl = e.renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const buf = new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf); let cr=0,cg=0,cb=0,n=0; for (let p2=0;p2<W*H;p2++){ const a=buf[p2*4+3]; if (a<10) continue; const r=buf[p2*4],g=buf[p2*4+1],b=buf[p2*4+2]; if (Math.max(r,g,b)-Math.min(r,g,b)>30) { n++; cr+=r; cg+=g; cb+=b; } } return n ? [Math.round(cr/n), Math.round(cg/n), Math.round(cb/n), n] : null; })()`);
  console.log(`  ${label}: chromatic mean RGB ${JSON.stringify(v)}`);
}
ws.close(); process.exit(0);
