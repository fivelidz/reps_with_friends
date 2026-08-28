// apps/avatars/test/wardrobe_probe2.ts — definitive colour-presence probe.
// Per wardrobe/species card: render, read the WHOLE framebuffer, count pixels
// by hue bucket (immune to lighting brightness shifts), and sample each
// attachment mesh's projected bbox corners. Returns compact JSON.
const PORT = 9454;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,640', '--user-data-dir=/tmp/wardrobe-prof2', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }

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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/.test(t)) errors.push(`[console.error] ${t}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?'}`);
    }
  } catch {}
});

await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Wardrobe'))`);
await new Promise(r => setTimeout(r, 2000));

await send('Runtime.evaluate', {
  expression: `(() => { const h = [...document.querySelectorAll('#modelGrid .style-card--model h3')].find(h => h.textContent.includes('Wardrobe')); const r = h.closest('.style-card').getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 200 }); return true; })()`,
  returnByValue: true,
}, sessionId);
await new Promise(r => setTimeout(r, 5000));

const probe = (i: number) => send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar || !e.renderer) return { error: 'not ready' };
    const THREE = await import('/site/lib/three.module.js');
    const av = e.avatar;
    av.root.updateMatrixWorld(true);
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // hue buckets (deg): lime 68, green 110 (frog/goblin), coral 11, amber 38, sky 205
    const buckets = { lime: 0, green: 0, coral: 0, amber: 0, pale: 0, grey: 0, dark: 0, white: 0 };
    const hues = { lime: 68, green: 112, coral: 11, amber: 38 };
    for (let p = 0; p < W * H; p++) {
      const r = buf[p*4], g = buf[p*4+1], b = buf[p*4+2];
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
      if (d < 18) { // neutral
        if (mx > 200) buckets.white++; else if (mx < 45) buckets.dark++; else if (mx < 130) buckets.grey++; else buckets.white++;
        continue;
      }
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      if (Math.abs(h - hues.lime) < 14) buckets.lime++;
      else if (Math.abs(h - hues.green) < 22) buckets.green++;
      else if (Math.abs(h - hues.coral) < 16) buckets.coral++;
      else if (Math.abs(h - hues.amber) < 14) buckets.amber++;
      else if (g > r && g > b && g > 150 && r > 110) buckets.pale++; // pale eye bulbs
    }
    // per-mesh bbox corner samples
    const meshes = [];
    av.prone.children[0].traverse((o) => {
      let p = o, tagged = false;
      while (p) { if (p.userData?.rwfWardrobe) { tagged = true; break; } p = p.parent; }
      if (tagged && o.isMesh) meshes.push(o);
    });
    const read = (u, v) => {
      const x = Math.min(W - 1, Math.max(0, Math.round(u * W))), y = Math.min(H - 1, Math.max(0, Math.round(v * H)));
      const p = (y * W + x) * 4;
      return [buf[p], buf[p+1], buf[p+2]];
    };
    const out = [];
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const bb = new THREE.Box3().setFromObject(m);
      const c = bb.getCenter(new THREE.Vector3());
      const s = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const pts = [c.clone(), c.clone().add(new THREE.Vector3(s.x, 0, s.z)), c.clone().add(new THREE.Vector3(-s.x, 0, s.z)),
                   c.clone().add(new THREE.Vector3(0, s.y, s.z)), c.clone().add(new THREE.Vector3(0, -s.y, s.z))];
      const samples = pts.map((pt) => {
        const ndc = pt.clone().project(e.cam);
        const u = (ndc.x + 1) / 2, v = (ndc.y + 1) / 2;
        return (ndc.z < 1 && u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) ? read(u, v) : null;
      }).filter(Boolean);
      out.push({ geo: m.geometry.type, mat: m.material?.color ? '#' + m.material.color.getHexString() : (m.material?.emissive ? 'emissive#' + m.material.emissive.getHexString() : '?'),
        n: samples.length, samples: samples.slice(0, 5) });
    }
    return { buckets, pct: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +(100 * v / (W * H)).toFixed(2)])), meshes: out };
  })()`,
}, sessionId);

const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;

for (let i = 0; i < names.length; i++) {
  if (!/wardrobe|frog|goblin|robot|full kit/i.test(names[i])) continue;
  // scroll THIS card into view first (lazy renderer + auto-BVH fire on
  // intersection), settle, then probe
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 200 }); return true; })()`,
    returnByValue: true,
  }, sessionId);
  await new Promise(r => setTimeout(r, 4500));
  const r = await probe(i);
  const v = r?.result?.result?.value;
  console.log(`\n### ${i}: ${names[i]}`);
  if (!v || v.error) { console.log('  ', v?.error ?? 'no value'); continue; }
  console.log('  stage %:', JSON.stringify(v.pct));
  const byMat = {};
  for (const m of v.meshes) {
    const key = `${m.geo} ${m.mat}`;
    byMat[key] = byMat[key] || { n: 0, samples: [] };
    byMat[key].n++;
    byMat[key].samples.push(...m.samples);
  }
  for (const [k, s] of Object.entries(byMat)) {
    const samp = (s as any).samples.slice(0, 6).map((x: number[]) => x.join(',')).join(' | ');
    console.log(`   ${k} x${(s as any).n}: ${samp}`);
  }
}

console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 300));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
