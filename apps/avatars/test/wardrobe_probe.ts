// apps/avatars/test/wardrobe_probe.ts — ground-truth probe for geno-wardrobe
// attachments: for each wardrobe/species card, walk the attachment groups,
// project each mesh's world centre (and feature offsets) through the card
// camera, render, and gl.readPixels the exact colour under each point.
// Reports: tag → parent bone → screen uv → RGBA. Usage:
//   bun apps/avatars/test/wardrobe_probe.ts
import { mkdirSync } from 'node:fs';

const PORT = 9453;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,640', '--user-data-dir=/tmp/wardrobe-prof', '--no-first-run', '--no-sandbox',
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

// scroll straight to the wardrobe row (direct jump — probe only needs these cards)
await send('Runtime.evaluate', {
  expression: `(() => { const h = [...document.querySelectorAll('#modelGrid .style-card--model h3')].find(h => h.textContent.includes('Wardrobe')); const r = h.closest('.style-card').getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 200 }); return true; })()`,
  returnByValue: true,
}, sessionId);
await new Promise(r => setTimeout(r, 5000));

// probe one card: attachment inventory + projected pixel readback
const probe = (i: number) => send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar || !e.renderer) return { error: 'card not ready' };
    const THREE = await import('/site/lib/three.module.js');
    const av = e.avatar;
    av.root.updateMatrixWorld(true);
    // inventory: every rwfWardrobe-tagged group
    const inv = [];
    av.prone.children[0].traverse((o) => {
      if (o.userData?.rwfWardrobe) inv.push({ tag: o.userData.rwfWardrobe, parent: o.parent?.name ?? '?', nMesh: o.children.length });
    });
    // feature meshes by material colour (walk all wardrobe meshes)
    const meshes = [];
    av.prone.children[0].traverse((o) => {
      if (o.isMesh && o.userData?.rwfWardrobe !== false) {
        let p = o, tagged = false;
        while (p) { if (p.userData?.rwfWardrobe) { tagged = true; break; } p = p.parent; }
        if (tagged) meshes.push(o);
      }
    });
    // render + read pixels under each mesh's world centre
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const read = (u, v) => {
      const px = new Uint8Array(4);
      gl.readPixels(Math.min(W - 1, Math.max(0, Math.round(u * W))), Math.min(H - 1, Math.max(0, Math.round(v * H))), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    };
    const out = [];
    for (const m of meshes) {
      const c = m.getWorldPosition(new THREE.Vector3());
      const ndc = c.clone().project(e.cam);
      const u = (ndc.x + 1) / 2, v = (ndc.y + 1) / 2;
      const col = (ndc.z < 1 && u > 0 && u < 1 && v > 0 && v < 1) ? read(u, v) : null;
      const mat = m.material?.color ? '#' + m.material.color.getHexString() : '?';
      out.push({ mesh: m.geometry?.type ?? '?', mat, hex: mat,
        world: [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)],
        uv: [+u.toFixed(3), +v.toFixed(3)], px: col });
    }
    return { inv, n: out.length, out: out.slice(0, 40) };
  })()`,
}, sessionId);

const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;

for (let i = 0; i < names.length; i++) {
  if (!/wardrobe|frog|goblin|robot|full kit/i.test(names[i])) continue;
  const r = await probe(i);
  const v = r?.result?.result?.value;
  console.log(`\n### ${i}: ${names[i]}`);
  if (!v || v.error) { console.log('  ', v?.error ?? 'no value'); continue; }
  console.log('  inventory:', v.inv.map((x: any) => `${x.tag}→${x.parent}(${x.nMesh})`).join(' '));
  for (const o of v.out) {
    console.log(`   ${o.mesh.padEnd(14)} ${o.mat} world[${o.world}] uv[${o.uv}] px=${o.px ? o.px.join(',') : 'OFFSCREEN'}`);
  }
}

console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 300));
ws.close(); process.exit(errors.length > 0 ? 2 : 0);
