// Smoke test of geno-derived.js construction: attach to a fresh Geno, check
// region stats, bind-space delta (6 mm ± construction roles), and delta
// persistence through poses (shared skinning ⇒ identical offsets).
const PORT = 9468;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=900,700', '--user-data-dir=/tmp/geno-derive-smoke', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => { ws.onopen = () => r(null); });
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
await new Promise((r) => setTimeout(r, 2000));
const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const THREE = await import('/site/lib/three.module.js');
    const M = await import('/site/model-avatars.js');
    const D = await import('/site/models/geno-derived.js');
    const geno = await M.loadModel('/models/Geno.glb');
    M.applyFlatTint(geno, '#eceef1');
    const av = new M.ModelAvatar(geno, 'mixamo');
    av.root.scale.setScalar(1.6 / av.H);
    document.querySelectorAll('canvas').forEach((c) => c.remove()); // atelier's stage — leave it
    const out = D.attachDerivedOutfit(av, { slots: 'full' });
    const cmPerUnit = 175 / 1.6 / 100 * 100; // 1.6 units = 1.75 m → cm per unit = 109.4
    const cmPU = 175 / 1.6; // cm per unit? no: 1.75 m / 1.6 units = 1.094 m/unit → 109.4 cm/unit
    // shared fresh bone matrices (exact shader maths, per geno-outfit)
    const skinned = (mesh, i, mats, p) => {
      p.fromBufferAttribute(mesh.geometry.attributes.position, i);
      const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
      const x = p.x, y = p.y, z = p.z; let px = 0, py = 0, pz = 0;
      for (let j = 0; j < 4; j++) {
        const w = SW.getComponent(i, j); if (w <= 0) continue;
        const m = mats[SI.getComponent(i, j)]; if (!m) continue;
        const e = m.elements;
        px += w * (e[0]*x + e[4]*y + e[8]*z + e[12]);
        py += w * (e[1]*x + e[5]*y + e[9]*z + e[13]);
        pz += w * (e[2]*x + e[6]*y + e[10]*z + e[14]);
      }
      p.set(px, py, pz); return p;
    };
    const deltaStats = (label) => {
      av.root.updateMatrixWorld(true);
      const res = { label };
      for (const m of out.derived.meshes) {
        const d = m.userData.rwfDerived;
        const body = d.body;
        const mats = body.skeleton.bones.map((b, i) =>
          new THREE.Matrix4().multiplyMatrices(b.matrixWorld, body.skeleton.boneInverses[i]));
        const gp = new THREE.Vector3(), bvp = new THREE.Vector3();
        let maxDev = 0, nan = 0;
        const bindDelta = d.bindDelta, src = d.srcIndex;
        for (let k = 0; k < src.length; k++) {
          skinned(m, k, mats, gp);
          skinned(body, src[k], mats, bvp);
          if (!isFinite(gp.x + gp.y + gp.z)) { nan++; continue; }
          // live offset = garment − body(source); compare to the SAME offset at bind,
          // rotated by nothing (offsets are bind-space; deviation = |liveΔ| vs |bindΔ|)
          const dl = gp.distanceTo(bvp);
          const db = Math.hypot(bindDelta[k*3], bindDelta[k*3+1], bindDelta[k*3+2]);
          const dev = Math.abs(dl - db);
          if (dev > maxDev) maxDev = dev;
        }
        res[m.userData.rwfWardrobe] = { verts: src.length, nan, maxDevCm: +(maxDev * 109.4).toFixed(3) };
      }
      return res;
    };
    const bind = deltaStats('bind');
    av.pose('stand', 0.5); const stand = deltaStats('stand');
    av.pose('squat', 0.5); const squat = deltaStats('squat');
    return { stats: out.derived.stats, bind, stand, squat };
  })()`,
}, sessionId);
if (r?.result?.exceptionDetails) { console.error('FAIL', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails).slice(0, 1800)); process.exit(1); }
console.log(JSON.stringify(r.result.result.value, null, 1));
await send('Browser.close', {}).catch(() => {});
