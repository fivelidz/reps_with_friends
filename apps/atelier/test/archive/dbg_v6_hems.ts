// v6 hem debug: dump construction heights + boundary loop geometry + snap sanity
const PORT = 9471;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=900,700', '--user-data-dir=/tmp/geno-v6-dbg', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise((r) => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errors: string[] = [];
await new Promise((r) => { ws.onopen = () => r(null); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 500));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
await new Promise((r) => setTimeout(r, 2500));
const t0 = await send('Runtime.evaluate', { expression: '1+1', returnByValue: true }, sessionId);
console.log('harness sanity:', JSON.stringify(t0?.result?.result?.value));
const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    try {
    const M = await import('/site/model-avatars.js');
    const D = await import('/site/models/geno-derived.js');
    const geno = await M.loadModel('/models/Geno.glb');
    M.applyFlatTint(geno, '#eceef1');
    const av = new M.ModelAvatar(geno, 'mixamo');
    av.root.scale.setScalar(1.6 / av.H);
    const out = D.attachDerivedOutfit(av, { slots: 'full' });
    const st = out.derived.stats;
    const body = out.derived.body;
    const P = body.geometry.attributes.position;
    // raw bind heights (body-local)
    const H = av.H;
    // boundary loops of the shirt mesh, with geometry
    const mesh = out.derived.meshes[0];
    const tris = Array.from(mesh.geometry.index.array);
    const edgeCount = new Map();
    const ek = (a,b) => a<b? a+'_'+b : b+'_'+a;
    for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
      const k = ek(tris[t+e], tris[t+(e+1)%3]);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
    const adj = new Map();
    for (const [k,c] of edgeCount) { if (c !== 1) continue;
      const [a,b] = k.split('_').map(Number);
      adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); }
    const posAttr = mesh.geometry.attributes.position;
    const loops = [];
    const seen = new Set();
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [start]; seen.add(start);
      let prev = -1, cur = start;
      for (let g = 0; g < adj.size + 2; g++) {
        const nbrs = (adj.get(cur) ?? []).filter(x => x !== prev);
        const nxt = nbrs.find(x => !seen.has(x)) ?? nbrs[0];
        if (nxt === undefined || nxt === start) break;
        loop.push(nxt); seen.add(nxt); prev = cur; cur = nxt;
      }
      if (loop.length >= 8) loops.push(loop);
    }
    const loopInfo = loops.map(L => {
      let yMin = 1e9, yMax = -1e9, xMin = 1e9, xMax = -1e9, zMin = 1e9, zMax = -1e9;
      for (const vi of L) {
        yMin = Math.min(yMin, posAttr.getY(vi)); yMax = Math.max(yMax, posAttr.getY(vi));
        xMin = Math.min(xMin, posAttr.getX(vi)); xMax = Math.max(xMax, posAttr.getX(vi));
        zMin = Math.min(zMin, posAttr.getZ(vi)); zMax = Math.max(zMax, posAttr.getZ(vi));
      }
      return { n: L.length, yMin: +yMin.toFixed(3), yMax: +yMax.toFixed(3), x: [+xMin.toFixed(2),+xMax.toFixed(2)], z: [+zMin.toFixed(2),+zMax.toFixed(2)] };
    });
    // bind joint ys — read the position straight from world matrices (bind pose = load pose)
    const jp = {};
    for (const bn of ['hips','spine','spine1','spine2','neck','head','upLegL','legL']) {
      const b = av.bones[bn]; if (!b) continue;
      b.updateWorldMatrix(true, false);
      const e = b.matrixWorld.elements;
      jp[bn] = +e[13].toFixed(3);
    }
    // simpler: use raw bind from stats (heightsH) + raw values
    const rawH = {};
    for (const [k, v] of Object.entries(st.heightsH)) rawH[k] = +(v * H).toFixed(3);
    return { H, rawH, jointY: jp, loopInfo, stats: { perGarment: st.perGarment, graded: st.gradedOffsetsMm } };
    } catch (err) { return { err: String(err), stack: String(err?.stack ?? '').slice(0, 800) }; }
  })()`,
}, sessionId);
if (!r) console.log('NO RESPONSE');
else if (r.error) console.log('CDP ERROR:', JSON.stringify(r.error));
else if (r?.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.exceptionDetails, null, 1).slice(0, 1500));
else console.log(JSON.stringify(r.result.result.value, null, 1).slice(0, 4000));
console.log('pageErrors:', JSON.stringify(errors));
await send('Browser.close', {}).catch(() => {});
