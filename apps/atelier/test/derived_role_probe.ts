// Which shirt verts are farthest from the body? Per-role breakdown at bind
// and one_arm@0.5 — hem/sleeve construction vs a real defect.
const PORT = 9473;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=900,700', '--user-data-dir=/tmp/atelier-role', '--no-first-run', '--no-sandbox',
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
const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};
await waitFor('window.__atelier?.ready');
await new Promise((r) => setTimeout(r, 800));
const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const A = window.__atelier, av = A.avatar;
    const THREE = await import('/site/lib/three.module.js');
    const O = await import('/site/models/geno-outfit.js');
    const M = await import('/site/model-avatars.js');
    const probe = async (label) => {
      av.root.updateMatrixWorld(true);
      const surface = O.bodySurface(av);
      const near = O.nearestDistanceFactory(surface, 0.05);
      const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
      const cmPU = 175 / (s * av.H);
      const res = {};
      for (const m of A.outfit.derived.meshes) {
        const d = m.userData.rwfDerived;
        const verts = O.garmentVerts(m);
        const byRole = {};
        for (let k = 0; k < verts.length; k++) {
          const role = d.roles[k] ?? 'region';
          const dist = near(verts[k].x, verts[k].y, verts[k].z) * cmPU;
          if (!isFinite(dist)) continue;
          const e = byRole[role] ??= { max: 0, n: 0, y: 0 };
          e.n++;
          if (dist > e.max) { e.max = dist; e.y = +(verts[k].y / (s * av.H) * 1.75).toFixed(2); }
        }
        res[m.userData.rwfWardrobe] = Object.fromEntries(Object.entries(byRole).map(([k2, v]) => [k2, { maxCm: +v.max.toFixed(2), n: v.n, worstYM: v.y }]));
      }
      return { label, res };
    };
    const out = [];
    A.pause();
    A.setAnim('idle'); av.pose('stand', 0.5);
    out.push(await probe('bind/stand'));
    const res = await M.loadBVH(M.BVH_FILES.one_arm);
    const p = new M.BVHPlayer(av, res);
    p.time = p.duration * 0.5; p.update(0);
    out.push(await probe('one_arm@0.5'));
    p.stop();
    const res2 = await M.loadBVH(M.BVH_FILES.walk);
    const p2 = new M.BVHPlayer(av, res2);
    p2.time = p2.duration * 0.25; p2.update(0);
    out.push(await probe('walk@0.25'));
    p2.stop();
    return out;
  })()`,
}, sessionId);
if (r?.result?.exceptionDetails) { console.error(JSON.stringify(r.result.exceptionDetails).slice(0, 1200)); process.exit(1); }
console.log(JSON.stringify(r.result.result.value, null, 1));
await send('Browser.close', {}).catch(() => {});
