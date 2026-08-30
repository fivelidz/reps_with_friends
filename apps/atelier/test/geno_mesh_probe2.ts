// Calibration probe #2 for geno-derived.js: TRUE dominant-bone distribution
// (fixed loop), per-bone y/x extents, and the region sizes each selector
// rule would produce. Run: bun apps/atelier/test/geno_mesh_probe2.ts
const PORT = 9465;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=900,700', '--user-data-dir=/tmp/geno-derived-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
await new Promise(r => setTimeout(r, 2500));

const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const M = await import('/site/model-avatars.js');
    const THREE = await import('/site/lib/three.module.js');
    const geno = await M.loadModel('/models/Geno.glb');
    const av = new M.ModelAvatar(geno, 'mixamo');
    av.root.updateMatrixWorld(true);
    const scene = av.prone.children[0];
    const inv = scene.matrixWorld.clone().invert();
    const bp = (n) => { const b = av.bones[n]; b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv); };
    const H = av.H;
    const body = (() => { let best = null; scene.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.skinIndex && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; }); return best; })();
    const P = body.geometry.attributes.position, SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight;
    const boneIdx = {}; for (const [k, b] of Object.entries(av.bones)) if (b) boneIdx[k] = body.skeleton.bones.indexOf(b);
    const dom = new Int16Array(P.count);
    const stats = {};
    for (let i = 0; i < P.count; i++) {
      let d = 0, dw = -1;
      for (let j = 0; j < 4; j++) { const w = SW.getComponent(i, j); if (w > dw) { dw = w; d = SI.getComponent(i, j); } }
      dom[i] = d;
      const nm = body.skeleton.bones[d].name.replace('mixamorig:', '');
      const y = P.getY(i) / H, x = P.getX(i) / H;
      const s = stats[nm] ??= { n: 0, yMin: 9, yMax: -9, xMax: 0 };
      s.n++; if (y < s.yMin) s.yMin = y; if (y > s.yMax) s.yMax = y; s.xMax = Math.max(s.xMax, Math.abs(x));
    }
    const fmt = Object.fromEntries(Object.entries(stats).sort((a, b) => b[1].n - a[1].n).slice(0, 22)
      .map(([k, s]) => [k, { n: s.n, y: [+s.yMin.toFixed(3), +s.yMax.toFixed(3)], xMax: +s.xMax.toFixed(3) }]));
    // region rule counts (the selectors geno-derived will use)
    const hips = bp('hips'), spine = bp('spine'), neck = bp('neck');
    const bandTop = spine.y - 0.0047 * H;
    const collarY = neck.y - 0.022 * H;
    const hipY = bandTop + 0.004 * H;
    const torsoBones = new Set([boneIdx.hips, boneIdx.spine, boneIdx.spine1, boneIdx.spine2].filter((v) => v >= 0));
    const neckTorso = new Set([boneIdx.neck].filter((v) => v >= 0));
    const shTorso = new Set([boneIdx.shoulderL, boneIdx.shoulderR].filter((v) => v >= 0));
    const armSet = new Set([boneIdx.armL, boneIdx.armR, boneIdx.foreL, boneIdx.foreR].filter((v) => v >= 0));
    const legSet = new Set([boneIdx.hips, boneIdx.upLegL, boneIdx.upLegR, boneIdx.legL, boneIdx.legR].filter((v) => v >= 0));
    const seg = (a, b, p) => { const ax = a.x, ay = a.y, az = a.z; const dx = b.x - ax, dy = b.y - ay, dz = b.z - az; const L2 = dx * dx + dy * dy + dz * dz; let t = ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / L2; t = Math.max(0, Math.min(1, t)); return t; };
    const V = new THREE.Vector3();
    let nShirt = 0, nSleeve = 0, nShorts = 0, nBand = 0;
    const armLs = bp('armL'), armLe = bp('foreL'), armRs = bp('armR'), armRe = bp('foreR');
    const legLs = bp('upLegL'), legLe = bp('legL'), legRs = bp('upLegR'), legRe = bp('legR');
    for (let i = 0; i < P.count; i++) {
      const d = dom[i], y = P.getY(i), x = Math.abs(P.getX(i));
      V.fromBufferAttribute(P, i);
      const tArm = seg(x > 0 ? armLs : armRs, x > 0 ? armLe : armRe, V);
      const tLeg = seg(x > 0 ? legLs : legLe, x > 0 ? legRs : legRe, V);
      if ((torsoBones.has(d) || (neckTorso.has(d) && y <= collarY + 0.004 * H) || (shTorso.has(d) && y <= collarY)) && y >= hipY && y <= collarY + 0.006 * H) nShirt++;
      if (armSet.has(d) && tArm <= 0.42) nSleeve++;
      if (legSet.has(d) && y <= bandTop && (d === boneIdx.hips ? y >= hips.y - 0.088 * H : tLeg <= 0.55)) nShorts++;
      if (legSet.has(d) && y <= bandTop && y >= bandTop - 0.014 * H && (d === boneIdx.hips ? true : tLeg <= 0.55)) nBand++;
    }
    return { H, bandTop: +(bandTop / H).toFixed(4), collarY: +(collarY / H).toFixed(4), hipY: +(hipY / H).toFixed(4), fmt, regions: { nShirt, nSleeve, nShorts, nBand }, hipsY: +(hips.y / H).toFixed(4) };
  })()`,
}, sessionId);
if (r?.result?.exceptionDetails) { console.error('probe failed', JSON.stringify(r.result.exceptionDetails, null, 2).slice(0, 2500)); process.exit(1); }
console.log(JSON.stringify(r.result.result.value, null, 1));
await send('Browser.close', {}).catch(() => {});
