// v8 SMOKE: boot the atelier on FABRIC mode; report construction stats per
// garment (rings, openings, degenerates), the fabric/shoe info, garment-mode
// toggle round trip, zero-console-error check. Usage: bun apps/atelier/test/v8_smoke.ts
const PORT = 9548;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/geno-v8-smoke', '--no-first-run', '--no-sandbox',
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
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.exceptionDetails.exception?.description ?? m.exceptionDetails.text ?? '').slice(0, 400));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
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
if (!(await waitFor('window.__atelier?.ready'))) { console.error('BOOT FAILED', errors); process.exit(1); }
await new Promise((r) => setTimeout(r, 900));
const ev = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r?.exceptionDetails) return { __exc: (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 400) };
  return r?.result?.result?.value;
};

const stats = await ev('window.__atelier.derivedStats()');
console.log('garmentMode:', (stats as any)?.garmentMode, '| fabric:', JSON.stringify((stats as any)?.fabric));
console.log('heightsH:', JSON.stringify((stats as any)?.heightsH));
const per = (stats as any)?.perGarment ?? {};
for (const [tag, g] of Object.entries(per)) {
  const gg: any = g;
  console.log(`${tag}: verts=${gg.verts} tris=${gg.tris} ring=${gg.ringVerts} degen=${gg.degenerate} openings=${(gg.openings ?? []).map((o: any) => `${o.name}:${o.matched ? 'ok:' + o.angVar : 'MISS'}`).join(',')}`);
}
// shoe meshes present + tagged
const shoes = await ev(`(() => {
  const A = window.__atelier;
  const sg = A.outfit.softGarments.filter((m) => m.userData.rwfWardrobe === 'sneakers');
  return sg.map((m) => ({
    verts: m.geometry.attributes.position.count,
    fabric: !!m.userData.rwfDerived?.fabric,
    openings: (m.userData.rwfDerived?.openings ?? []).map((o) => o.name + ':' + (o.matched ? 'ok' : 'MISS')),
    min: m.geometry.boundingBox ? null : null,
  }));
})()`);
console.log('shoe meshes:', JSON.stringify(shoes));
// mode toggle round trip: fabric → fitted → fabric
const round = await ev(`(async () => {
  const A = window.__atelier;
  await A.setGarmentMode('fitted');
  const fitted = { mode: A.garmentMode(), outfit: A.outfit.garment, stats: A.derivedStats().garmentMode,
    shirtVerts: A.outfit.derived.meshes[0].geometry.attributes.position.count };
  await A.setGarmentMode('fabric');
  const fabric = { mode: A.garmentMode(), outfit: A.outfit.garment, stats: A.derivedStats().garmentMode,
    shirtVerts: A.outfit.derived.meshes[0].geometry.attributes.position.count,
    headSpecies: A.outfit.head?.species };
  return { fitted, fabric };
})()`);
console.log('mode round trip:', JSON.stringify(round));
console.log('console errors:', errors.length, errors.slice(0, 4));
await send('Browser.close', {}).catch(() => {});
process.exit(errors.length ? 1 : 0);
