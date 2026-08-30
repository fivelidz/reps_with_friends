// One-shot probe of the Geno body SkinnedMesh: mesh inventory, vertex counts,
// index/normals, dominant-bone distribution over y, limb segment endpoints —
// the raw numbers geno-derived.js's region selectors are designed against.
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
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId); // needs the importmap page (bare "three")
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
    const bind = (b) => { b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv); };
    const out = { H: av.H, meshes: [], joints: {} };
    for (const [k, b] of Object.entries(av.bones)) if (b) out.joints[k] = bind(b).toArray().map(v => +v.toFixed(4));
    // mesh inventory
    const meshes = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    out.meshes = meshes.map((o) => ({
      name: o.name, verts: o.geometry.attributes.position.count,
      indexed: !!o.geometry.index, tris: o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3,
      hasNormal: !!o.geometry.attributes.normal,
      hasSkin: !!o.geometry.attributes.skinIndex,
      sameSkeleton: o.skeleton === meshes[0].skeleton,
      bindMode: o.bindMode,
    }));
    // dominant bone histogram on the biggest mesh, y-quantised
    const body = meshes.reduce((a, b) => a.geometry.attributes.position.count > b.geometry.attributes.position.count ? a : b);
    const P = body.geometry.attributes.position, SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight;
    const boneNames = body.skeleton.bones.map((b) => b.name);
    const hist = {};
    const maxY = {}, minY = {};
    for (let i = 0; i < P.count; i++) {
      let dom = 0, dw = -1;
      for (let j = 0; j < 4; j++) { const w = SW.getComponent(i, j); if (w > dw) { dw = w; SI.getComponent(i, j); } }
      for (let j = 0; j < 4; j++) { const w = SW.getComponent(i, j); if (w > dw) { dw = w; dom = SI.getComponent(i, j); } }
      const nm = boneNames[dom];
      const y = P.getY(i) / av.H;
      hist[nm] = (hist[nm] ?? 0) + 1;
      if (!minY[nm] || y < minY[nm]) minY[nm] = y;
      if (!maxY[nm] || y > maxY[nm]) maxY[nm] = y;
    }
    const byN = Object.fromEntries(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 26));
    out.dominant = Object.fromEntries(Object.entries(byN).map(([k, n]) => [k, { n, yMin: +minY[k].toFixed(3), yMax: +maxY[k].toFixed(3) }]));
    // vertical resolution: distinct-y ring spacing sample near the torso
    const ys = [];
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (Math.abs(y - 0.92 * av.H) < 0.12 * av.H) ys.push(y); }
    ys.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < ys.length; i++) { const g = ys[i] - ys[i - 1]; if (g > 1e-5 && g < 0.05) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    out.yRingGapMed = +(gaps[Math.floor(gaps.length / 2)] / av.H).toFixed(4);
    out.yRingGapP90 = +(gaps[Math.floor(gaps.length * 0.9)] / av.H).toFixed(4);
    return out;
  })()`,
}, sessionId);
if (r?.result?.exceptionDetails) { console.error('probe failed', JSON.stringify(r.result.exceptionDetails, null, 2).slice(0, 2000)); process.exit(1); }
console.log(JSON.stringify(r.result.result.value, null, 1));
await send('Browser.close', {}).catch(() => {});
