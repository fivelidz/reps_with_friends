// v6 hem debug 2: bind pose facts + edge-based boundary loops
const PORT = 9472;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=900,700', '--user-data-dir=/tmp/geno-v6-dbg2', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
await new Promise((r) => setTimeout(r, 2500));
const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    try {
    const T = await import('/site/lib/three.module.js');
    const M = await import('/site/model-avatars.js');
    const D = await import('/site/models/geno-derived.js');
    const geno = await M.loadModel('/models/Geno.glb');
    M.applyFlatTint(geno, '#eceef1');
    const av = new M.ModelAvatar(geno, 'mixamo');
    av.root.scale.setScalar(1.6 / av.H);
    const out = D.attachDerivedOutfit(av, { slots: 'full' });
    const mesh = out.derived.meshes[0];
    const posA = mesh.geometry.attributes.position;
    const tris = Array.from(mesh.geometry.index.array);
    // edge-based boundary extraction (never reuse an edge)
    const edgeCount = new Map();
    const ek = (a,b) => a<b? a+'_'+b : b+'_'+a;
    const edgeList = [];
    for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = tris[t+e], b = tris[t+(e+1)%3];
      const k = ek(a,b);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      edgeList.push([k, a, b]);
    }
    const usedEdge = new Set();
    const adjV = new Map();
    for (const [k,a,b] of edgeList) {
      if (edgeCount.get(k) !== 1) continue;
      if (!adjV.has(a)) adjV.set(a, []);
      if (!adjV.has(b)) adjV.set(b, []);
      adjV.get(a).push([b, k]); adjV.get(b).push([a, k]);
    }
    const loops = [];
    for (const [k0, a0, b0] of edgeList) {
      if (edgeCount.get(k0) !== 1 || usedEdge.has(k0)) continue;
      usedEdge.add(k0);
      const loop = [a0, b0];
      let cur = b0, prev = a0;
      for (let g = 0; g < edgeList.length + 2; g++) {
        const nbrs = (adjV.get(cur) ?? []).filter(([v, k]) => !usedEdge.has(k));
        let pick = nbrs.find(([v]) => v !== prev);
        if (!pick) pick = nbrs[0];
        if (!pick) break;
        usedEdge.add(pick[1]);
        if (pick[0] === a0) break;
        loop.push(pick[0]);
        prev = cur; cur = pick[0];
      }
      if (loop.length >= 8) loops.push(loop);
    }
    const info2 = loops.map(L => {
      let yMin=1e9,yMax=-1e9,xMin=1e9,xMax=-1e9,zMin=1e9,zMax=-1e9;
      for (const vi of L) {
        yMin=Math.min(yMin,posA.getY(vi)); yMax=Math.max(yMax,posA.getY(vi));
        xMin=Math.min(xMin,posA.getX(vi)); xMax=Math.max(xMax,posA.getX(vi));
        zMin=Math.min(zMin,posA.getZ(vi)); zMax=Math.max(zMax,posA.getZ(vi));
      }
      return {n:L.length, y:[+yMin.toFixed(3),+yMax.toFixed(3)], x:[+xMin.toFixed(2),+xMax.toFixed(2)], z:[+zMin.toFixed(2),+zMax.toFixed(2)]};
    });
    // bind joint positions in body-local (same maths as geno-derived bp)
    const scene = av.prone.children[0];
    scene.updateMatrixWorld(true);
    const toBind = scene.matrixWorld.clone().invert();
    const bp = (b) => { b.updateWorldMatrix(true, false);
      return new T.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(toBind); };
    const joints = {};
    for (const bn of ['armL','foreL','handL','upLegL','legL','footL','neck','head','hips']) {
      const b = av.bones[bn]; if (!b) continue;
      const p = bp(b);
      joints[bn] = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)];
    }
    return { H: av.H, joints, loops: info2 };
    } catch (err) { return { err: String(err), stack: String(err?.stack ?? '').slice(0, 600) }; }
  })()`,
}, sessionId);
console.log(JSON.stringify(r?.result?.result?.value ?? r, null, 1).slice(0, 3000));
await send('Browser.close', {}).catch(() => {});
