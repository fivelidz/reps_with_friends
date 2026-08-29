// One-shot measurement of Geno's bind skeleton + body extents — feeds the
// outfit module's design constants (waist height, shoulder span, arm lengths).
const PORT = 9461;
async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1200,900', '--user-data-dir=/tmp/geno-measure-prof', '--no-first-run', '--no-sandbox',
    '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', 'about:blank'],
    { stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 30 && !info; i++) { await new Promise(r => setTimeout(r, 500)); info = await ver(); }
}
if (!info) { console.error('chromium never came up'); process.exit(1); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise(r => { ws.onopen = () => r(null); });
ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}, sessionId?) => new Promise<any>(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'http://localhost:4173/avatars' }, sessionId);

const waitFor = async (expr: string, timeout = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r?.result?.result?.value) return true;
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
};
await waitFor(`window.__rwfModels?.some(e => e.ok && e.M?.id === 'geno-wardrobe')`);
// bring the card into view so it loads
await send('Runtime.evaluate', {
  expression: `(() => { const i = window.__rwfModels.findIndex(e => e.M?.id === 'geno-wardrobe'); const c = document.querySelectorAll('#modelGrid .style-card--model')[i]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 300 }); return true; })()`,
  returnByValue: true,
}, sessionId);
await waitFor(`window.__rwfModels?.some(e => e.ok && e.M?.id === 'geno-wardrobe' && e.avatar)`, 90000);
await new Promise(r => setTimeout(r, 1500));

const r = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const THREE = await import('/site/lib/three.module.js');
    const e = window.__rwfModels.find(e => e.M?.id === 'geno-wardrobe' && e.avatar);
    if (!e) return { error: 'no card' };
    const av = e.avatar, B = av.bones;
    const scene = av.prone.children[0];
    // BIND joint positions (boneInverses⁻¹, pose-independent)
    let body = null; scene.traverse(o => { if (!body && o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) body = o; });
    const inv = (b) => { const k = body.skeleton.bones.indexOf(b); return new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[k].clone().invert()); };
    const J = {}; for (const [k, b] of Object.entries(B)) if (b) J[k] = inv(b).toArray().map(v => +v.toFixed(4));
    // extra: Spine3 + Neck1 + Head chain via raw find
    const norm = n => n.replace(/^mixamorig:/,'').replace(/[\\[\\].:/]/g,'');
    scene.traverse(o => { if (o.isBone && ['Spine3','Neck1','Head_Top_End','LeftHandThumb1'].includes(norm(o.name))) { const k = body.skeleton.bones.indexOf(o); if (k >= 0) J['raw_' + norm(o.name)] = new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[k].clone().invert()).toArray().map(v => +v.toFixed(4)); } });
    // body cross-sections at key heights (all-bone and pelvis-only), plus arm cross-sections
    const P = body.geometry.attributes.position, SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight;
    const cloud = [];
    const step = Math.max(1, Math.floor(P.count / 8000));
    for (let i = 0; i < P.count; i += step) {
      const ks = [[SI.getX(i), SW.getX(i)],[SI.getY(i), SW.getY(i)],[SI.getZ(i), SW.getZ(i)],[SI.getW(i), SW.getW(i)]];
      let dom = ks[0]; for (const k of ks) if (k[1] > dom[1]) dom = k;
      cloud.push({ p: new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)), b: dom[0] });
    }
    const hipsY = J.hips[1], spineY = J.spine[1];
    const band = (y, boneIdx) => {
      const vs = cloud.filter(v => Math.abs(v.p.y - y) < 0.012 && (boneIdx == null || v.b === boneIdx));
      if (!vs.length) return null;
      let mx = -1e9, mn = 1e9, mz = -1e9, nmz = 1e9, cx = 0, cz = 0;
      for (const v of vs) { cx += v.p.x; cz += v.p.z; if (v.p.x > mx) mx = v.p.x; if (v.p.x < mn) mn = v.p.x; if (v.p.z > mz) mz = v.p.z; if (v.p.z < nmz) nmz = v.p.z; }
      cx /= vs.length; cz /= vs.length;
      return { n: vs.length, cx: +cx.toFixed(3), cz: +cz.toFixed(3), halfX: +((mx - mn) / 2).toFixed(3), halfZ: +((mz - nmz) / 2).toFixed(3), mx: +mx.toFixed(3), mn: +mn.toFixed(3), mz: +mz.toFixed(3), nmz: +nmz.toFixed(3) };
    };
    const bi = {}; for (const n of ['hips','spine','spine1','spine2','upLegL','upLegR','armL','armR','foreL','head','neck']) bi[n] = body.skeleton.bones.indexOf(B[n]);
    const sp3 = J.raw_Spine3 ?? J.spine2;
    const cuts = {
      waistSpine: band(spineY, null),
      waistSpineP: band(spineY, bi.hips),
      hipBand: band(hipsY + 0.06, null),
      chest: band(spineY + 0.14, null),
      seat: band(hipsY - 0.07, null),
      thighMidL: null,
      armMidL: band(J.armL[1] - 0.07, bi.armL),
      armTopL: band(J.armL[1] - 0.015, null),
    };
    // thigh mid: plane perpendicular-ish — use y-band on LeftUpLeg verts
    const ty = J.upLegL[1] - 0.75 * (J.upLegL[1] - J.legL[1]);
    cuts.thighMidL = band(ty, bi.upLegL);
    const H = av.H, scale = 1.5 / H;
    return {
      H: +H.toFixed(4), humanM: +(1.75).toFixed(2), sceneUnitsPerM: +(H / 1.75).toFixed(4),
      joints: J,
      yDeltas: {
        hipsToSpine: +(spineY - hipsY).toFixed(4),
        spineToSpine3: +(sp3[1] - spineY).toFixed(4),
        spine3ToNeck: +(J.neck[1] - sp3[1]).toFixed(4),
        neckToHead: +(J.head[1] - J.neck[1]).toFixed(4),
        hipsToUpLeg: +(J.upLegL[1] - hipsY).toFixed(4),
        upLegToKnee: +(J.upLegL[1] - J.legL[1]).toFixed(4),
        kneeToAnkle: +(J.legL[1] - J.footL[1]).toFixed(4),
        shoulderX: +(Math.abs(J.armL[0]) + Math.abs(J.armR[0])) / 2 .toFixed ? +((Math.abs(J.armL[0]) + Math.abs(J.armR[0])) / 2).toFixed(4) : 0,
        shoulderY: +((J.armL[1] + J.armR[1]) / 2).toFixed(4),
        armLen: +(new THREE.Vector3(...J.foreL).distanceTo(new THREE.Vector3(...J.armL))).toFixed(4),
        foreLen: +(new THREE.Vector3(...J.handL).distanceTo(new THREE.Vector3(...J.foreL))).toFixed(4),
      },
      cuts,
    };
  })()`,
}, sessionId);
const v = r?.result?.result?.value;
console.log(JSON.stringify(v, null, 1));
ws.close(); process.exit(0);
