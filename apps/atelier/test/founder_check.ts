//
// founder_check.ts — the founder's 60-second re-verification of the three
// reported garment defects (one command, plain-English verdicts):
//
//   1. "Shirt is absent around the shoulders and upper chest"
//   2. "Shorts are invisible around the upper thighs"
//   3. "Shoes are invisible around the toes"
//
// Usage: bun apps/atelier/test/founder_check.ts
//
// What it does: opens /atelier headless, runs the same instruments the page
// exposes (signed coverage probe + region pixel checks at bind and at walk
// frame 50%), and prints one PASS/FAIL line per defect + the probe totals.
// Exit 0 = all three fixed.
//
const PORT = 9464;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000', '--user-data-dir=/tmp/atelier-founder', '--no-first-run', '--no-sandbox',
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
const ev = async (expression: string, awaitPromise = true) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId))?.result?.result?.value;

await send('Page.navigate', { url: 'http://localhost:4173/atelier' }, sessionId);
const t0 = Date.now();
while (Date.now() - t0 < 90000 && !(await ev('window.__atelier?.ready', false))) {
  await new Promise(r => setTimeout(r, 500));
}
await new Promise(r => setTimeout(r, 800));

console.log('\nFOUNDER RE-VERIFICATION — the three reported defects\n' + '='.repeat(52));

// ── region pixel checks (the reports, encoded) at bind and walk 50%
const bind = await ev('window.__atelier.regionChecks()');
const walk = await ev(`(async () => {
  const A = window.__atelier, av = A.avatar;
  const M = await import('/site/model-avatars.js');
  const res = await M.loadBVH(M.BVH_FILES.walk);
  const p = new M.BVHPlayer(av, res);
  p.time = p.duration * 0.5; p.update(0);
  av.root.updateMatrixWorld(true);
  const r = await A.regionChecks();
  p.stop();
  return r;
})()`);

const byPrefix = (r: any, prefix: string) => r.regions.filter((x: any) => x.name.startsWith(prefix));
const shirtOk = (r: any) => byPrefix(r, 'shoulder').concat(byPrefix(r, 'upper chest')).every((x: any) => x.pass);
const shortsOk = (r: any) => byPrefix(r, 'thigh').every((x: any) => x.pass);
const shoesOk = (r: any) => byPrefix(r, 'toe').every((x: any) => x.pass);

let fails = 0;
const verdict = (n: number, label: string, ok: boolean, detail: string) => {
  console.log(`${n}. ${label}: ${ok ? 'FIXED ✓' : 'STILL BROKEN ✗'}  (${detail})`);
  if (!ok) fails++;
};
verdict(1, 'Shirt absent around shoulders/upper chest',
  shirtOk(bind) && shirtOk(walk),
  `lime pixels at bind: ${byPrefix(bind, 'shoulder').map((x: any) => x.share + '%').join('/')}, walk@50%: ${byPrefix(walk, 'shoulder').map((x: any) => x.share + '%').join('/')}`);
verdict(2, 'Shorts invisible around upper thighs',
  shortsOk(bind) && shortsOk(walk),
  `coral pixels on thighs at bind: ${byPrefix(bind, 'thigh').map((x: any) => x.share + '%').join('/')}, walk@50%: ${byPrefix(walk, 'thigh').map((x: any) => x.share + '%').join('/')}`);
verdict(3, 'Shoes invisible around the toes',
  shoesOk(bind) && shoesOk(walk),
  `charcoal/sole at toes at bind: ${byPrefix(bind, 'toe').map((x: any) => x.share + '%').join('/')}, walk@50%: ${byPrefix(walk, 'toe').map((x: any) => x.share + '%').join('/')}`);

// ── the signed probe across all 32 animation cases
const verify = await ev('window.__atelier.runVerify()');
console.log(`\nSigned coverage probe (32 cases): ${verify.insideVerts} inside-body verts (bar 0)` +
  ` · worst ${verify.insideWorstCm} cm · ${verify.limbCrossVerts} bare-limb crossings excused` +
  ` · attachment bars ${verify.rows.some((r: any) => r.overBar) ? 'BREACHED' : 'all pass'}` +
  ` · structural holes (NaN): ${verify.rows.reduce((a: number, r: any) => a + r.nan, 0)}`);
const insideRows = verify.rows.filter((r: any) => r.insideVerts > 0);
for (const r of insideRows) console.log(`  ⚠ ${r.label}: ${r.insideVerts} vert(s), worst ${r.insideWorstCm} cm`);

console.log(`\n${fails === 0 && verify.insideVerts === 0 ? 'ALL THREE DEFECTS FIXED ✓✓✓' : `${fails} defect check(s) + ${verify.insideVerts} inside-body vert(s) remaining`}`);
ws.close();
process.exit(fails === 0 ? 0 : 1);
