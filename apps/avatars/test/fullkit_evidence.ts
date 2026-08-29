// apps/avatars/test/fullkit_evidence.ts — founder-facing evidence for the
// Full Kit fix: card-clipped screenshots at multiple walk phases + other
// clips + squat; framebuffer colour census (black-ring check); wristband
// bone-segment tracking; per-card render cost.
// Usage: bun apps/avatars/test/fullkit_evidence.ts
const PORT = 9479;
const OUT = '/tmp/fullkit_evidence';
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/fkev-prof', '--no-first-run', '--no-sandbox',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);
const waitFor = async (expr, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};
await waitFor(`!!window.__rwfModels && window.__rwfModels.length > 0`);
await send('Runtime.evaluate', { expression: `import('/site/lib/three.module.js').then(m => { window.__T = m; return true; })`, returnByValue: true, awaitPromise: true }, sessionId);
const IDX = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => /Full Kit/.test(h.textContent))`,
  returnByValue: true,
}, sessionId)).result.result.value;
await send('Runtime.evaluate', { expression: `document.querySelectorAll('#modelGrid .style-card--model')[${IDX}].scrollIntoView({ block: 'center' }); true`, returnByValue: true }, sessionId);
await waitFor(`!!(window.__rwfModels[${IDX}] && window.__rwfModels[${IDX}].bvh)`, 120000);
await send('Runtime.evaluate', {
  expression: `window.loadBVHsafe = async (name) => {
    const m = await import('/site/model-avatars.js');
    window.BVHPlayer = m.BVHPlayer;
    try { return await m.loadBVH(m.BVH_FILES[name] ?? name); } catch { return null; }
  }; true`, returnByValue: true, awaitPromise: true,
}, sessionId);

// ── colour census + wristband tracking at several states ──
const STATE = (setup: string) => `
(async () => {
  const e = window.__rwfModels[${IDX}];
  const av = e.avatar, T = window.__T;
  ${setup}
  e.renderer.render(e.scene, e.cam);
  const gl = e.renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // token-colour census: lime tank #c6f32e, coral shorts #ff5c38, charcoal
  // belt #2a3038, green frog #4da33e — ±28 per channel
  const near = (r, g, b, R, G, B) => Math.abs(r - R) < 28 && Math.abs(g - G) < 28 && Math.abs(b - B) < 28;
  let lime = 0, coral = 0, charcoal = 0, green = 0, any = 0;
  // charcoal pixels' bounding box (the old black ring filled the card)
  let cminx = W, cmaxx = 0, cminy = H, cmaxy = 0;
  for (let p = 0; p < W * H; p++) {
    const r = buf[p * 4], g = buf[p * 4 + 1], b = buf[p * 4 + 2], a = buf[p * 4 + 3];
    if (a < 10) continue;
    any++;
    if (near(r, g, b, 198, 243, 46)) lime++;
    else if (near(r, g, b, 255, 92, 56)) coral++;
    else if (near(r, g, b, 42, 48, 56)) {
      charcoal++;
      const x = p % W, y = Math.floor(p / W);
      if (x < cminx) cminx = x; if (x > cmaxx) cmaxx = x;
      if (y < cminy) cminy = y; if (y > cmaxy) cmaxy = y;
    }
    else if (near(r, g, b, 77, 163, 62)) green++;
  }
  // wristband bone-segment tracking
  const seg = (a, b, p) => {
    const A = a.getWorldPosition(new T.Vector3()), B = b.getWorldPosition(new T.Vector3());
    const AB = B.clone().sub(A); const t = Math.max(0, Math.min(1, p.clone().sub(A).dot(AB) / AB.lengthSq()));
    return p.distanceTo(A.clone().addScaledVector(AB, t));
  };
  const cm = 175 / (av.H * (av.root.scale.x || 1));
  const bands = [];
  av.prone.children[0].traverse(o => {
    if (o.userData?.rwfWardrobe !== 'wristbands' || !o.parent?.isBone) return;
    const bone = o.parent;
    const hand = av.bones[bone.name === 'LeftForeArm' ? 'handL' : 'handR'];
    const bb = new T.Box3().setFromObject(o);
    const c = bb.getCenter(new T.Vector3());
    bands.push(+(seg(bone, hand, c) * cm).toFixed(1));
  });
  return {
    px: { any, lime, coral, charcoal, green },
    charcoalBox: charcoal ? { w: cmaxx - cminx, h: cmaxy - cminy, cardW: W, cardH: H } : null,
    bandSegCm: bands, renderMs: +(e.renderMs ?? 0).toFixed(2),
  };
})()`;

const clip = (name: string, frac: number) => `
  { const res = await loadBVHsafe('${name}');
    if (e.bvh) e.bvh.stop();
    e.bvh = new BVHPlayer(av, res);
    e.bvh.time = ${frac} * e.bvh.duration; e.bvh.update(0.016); }`;
const pose = (name: string) => `
  { if (e.bvh) { e.bvh.stop(); e.bvh = null; } av.pose('${name}', 0.5); }`;

const shots: Array<[string, string]> = [
  ['walk12', clip('walk', 0.12)],
  ['walk50', clip('walk', 0.5)],
  ['walk80', clip('walk', 0.8)],
  ['limp', clip('limp', 0.4)],
  ['combat', clip('combat', 0.5)],
  ['squat', pose('squat')],
];
for (const [name, setup] of shots) {
  const r = await send('Runtime.evaluate', { expression: STATE(setup), returnByValue: true, awaitPromise: true }, sessionId);
  const v = r.result.result.value;
  if (!v || Object.keys(v).length === 0) { console.log(name, 'ERROR:', JSON.stringify(r.result).slice(0, 300)); continue; }
  console.log(`${name.padEnd(8)} px=${JSON.stringify(v.px)} charcoalBox=${v.charcoalBox ? v.charcoalBox.w + 'x' + v.charcoalBox.h : 'none'} bandSegCm=${JSON.stringify(v.bandSegCm)} renderMs=${v.renderMs}`);
  // card-clipped screenshot
  const cardBox = await send('Runtime.evaluate', {
    expression: `(() => { const r = document.querySelectorAll('#modelGrid .style-card--model')[${IDX}].querySelector('.style-stage').getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: Math.min(r.width, 400), height: Math.min(r.height, 500) }; })()`,
    returnByValue: true,
  }, sessionId);
  const cb = cardBox.result.result.value;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: cb.x, y: cb.y, width: cb.width, height: cb.height, scale: 1 },
    captureBeyondViewport: true,
  }, sessionId);
  await Bun.write(`${OUT}_${name}.png`, Buffer.from(shot.result.data, 'base64'));
}
console.log(`\ncard shots: ${OUT}_<name>.png`);
ws.close(); process.exit(0);
