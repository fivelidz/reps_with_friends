// apps/avatars/test/wardrobe_deform_diag.ts — one-shot diagnostic: does the
// skinned TANK actually deform on the GPU? Freeze at a deep squat, hide the
// body, render, and compare the lime-pixel screen bbox (what the GPU drew)
// against the CPU-skinned tank vertex bbox (what it should be). Also dumps
// bindMatrix / bindMode / skeleton identity for the cloth vs the body.
const PORT = 9457;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/wardrobe-diag', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method: string, params = {}, sessionId?: string) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
const errors: string[] = [];
ws.addEventListener('message', (e) => {
  try {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[${m.params.type}] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    }
  } catch {}
});
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 2, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Wardrobe — dressed'))`);
const idx = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].findIndex(h => h.textContent.includes('Wardrobe — dressed'))`,
  returnByValue: true,
}, sessionId)).result.result.value;
await send('Runtime.evaluate', {
  expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${idx}]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 300 }); return true; })()`,
}, sessionId);
await new Promise(r => setTimeout(r, 5000));

const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const THREE = await import('/site/lib/three.module.js');
    const e = window.__rwfModels[${idx}];
    const av = e.avatar, scene3 = av.prone.children[0];
    if (e.bvh) { e.bvh.stop(); e.bvh = null; }
    av.pose('squat', 0.5);
    av.root.updateMatrixWorld(true);

    // inventory: body vs cloth skinned meshes
    let body = null, cloth = [];
    scene3.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (o.userData?.rwfWardrobe) cloth.push(o); else if (!body) body = o;
    });
    const info = cloth.map((c) => ({
      tag: c.userData.rwfWardrobe,
      bindMode: c.bindMode,
      bindMatrix: c.bindMatrix.elements.slice(12, 15).map((x) => +x.toFixed(3)),
      sameSkelAsBody: c.skeleton === body.skeleton,
      skelBones: c.skeleton.bones.length,
      parent: c.parent === scene3 ? 'scene3' : c.parent?.type,
      visible: c.visible,
      layers: c.layers.mask,
      matSide: c.material.side,
    }));

    // CPU-skin the tank's own verts → expected screen bbox
    const collect = (mesh) => {
      const P = mesh.geometry.attributes.position;
      const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
      const sk = mesh.skeleton, M = sk.bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[k]));
      const out = [];
      for (let i = 0; i < P.count; i++) {
        const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i));
        const wp = new THREE.Vector3();
        const ks = [[SI.getX(i), SW.getX(i)], [SI.getY(i), SW.getY(i)], [SI.getZ(i), SW.getZ(i)], [SI.getW(i), SW.getW(i)]];
        const wsum = ks.reduce((a, k) => a + k[1], 0) || 1;
        for (const [bi, w] of ks) if (w > 0 && M[bi]) wp.addScaledVector(v.clone().applyMatrix4(M[bi]), w / wsum);
        out.push(wp);
      }
      return out;
    };
    const tank = cloth.find((c) => c.userData.rwfWardrobe === 'tank');
    const expected = collect(tank).map((p) => p.clone().project(e.cam));
    const expBBox = {
      x: [Math.min(...expected.map((p) => p.x)), Math.max(...expected.map((p) => p.x))].map((v) => +v.toFixed(2)),
      y: [Math.min(...expected.map((p) => p.y)), Math.max(...expected.map((p) => p.y))].map((v) => +v.toFixed(2)),
    };

    // hide body + other cloth (NOT scene3 itself — traverse yields the root!)
    const vis = [];
    scene3.traverse((o) => { if (o !== tank && o !== scene3) { vis.push([o, o.visible]); o.visible = false; } });
    tank.visible = true;
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n = 0;
    const hist = {};
    for (let p = 0; p < W * H; p++) {
      const r0 = buf[p*4], g0 = buf[p*4+1], b0 = buf[p*4+2];
      const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), d = mx - mn;
      if (d < 10) { const k = mx < 60 ? 'dark' : mx > 150 ? 'bright' : 'mid'; hist[k] = (hist[k] ?? 0) + 1; continue; }
      let h = 0;
      if (mx === r0) h = 60 * (((g0 - b0) / d) % 6); else if (mx === g0) h = 60 * ((b0 - r0) / d + 2); else h = 60 * ((r0 - g0) / d + 4);
      if (h < 0) h += 360;
      const k = Math.round(h / 10) * 10;
      hist['h' + k] = (hist['h' + k] ?? 0) + 1;
      if (Math.abs(h - 68) < 15) {
        n++;
        const x = p % W, y = Math.floor(p / W);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const rinfo = { calls: e.renderer.info.render.calls, triangles: e.renderer.info.render.triangles };
    const attrs = Object.fromEntries(Object.entries(tank.geometry.attributes).map(([k, a]) => [k, a.count ?? a.length]));
    for (const [o, v] of vis) o.visible = v;
    // GL y is bottom-up; NDC y up → same direction, convert px→ndc
    const gpuBBox = n ? {
      x: [+(2 * minX / W - 1).toFixed(2), +(2 * maxX / W - 1).toFixed(2)],
      y: [+(2 * minY / H - 1).toFixed(2), +(2 * maxY / H - 1).toFixed(2)],
    } : null;
    return { info, attrs, rinfo, hist, expectedNdcBBox: expBBox, gpuLimePx: n, gpuLimeNdcBBox: gpuBBox };
  })()`,
}, sessionId);
console.log(JSON.stringify(r?.result?.result ?? r, null, 2));
console.log('CONSOLE:', errors.slice(0, 10));
ws.close(); process.exit(0);
