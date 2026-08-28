// apps/avatars/test/wardrobe_stress.ts — SKINNED-WARDROBE STRESS VERIFICATION.
// The founder's bar: clothes must hold up through the FULL animation coverage.
// For each stress pose (widest BVH stride, deepest squat, push-up prone,
// jumping-jack arms-up, curl top) this probe:
//   1. freezes the card at the EXTREME of the animation (walk: scans the clip
//      for the widest ankle spread; exercises: p=0.5 = the rep's extreme),
//   2. renders + reads the whole framebuffer,
//   3. CPU-skins Geno's own body vertices to the frozen pose (same maths as
//      the GPU: Σ wᵢ·(bone.matrixWorld·boneInverseᵢ)·v), keeps only
//      camera-facing ones, projects them, and classifies the pixel under
//      each: clothing colour (covered) vs body tint (EXPOSED SKIN) vs stage,
//   4. CPU-skins the CLOTH vertices too and walks the fabric surface between
//      adjacent rings — skin-coloured pixels on the fabric itself = tearing,
//   5. dumps joints at two walk frames so mocap drive is provable.
// Honest numbers, no screenshots required. Exit 2 on any console error.
import { mkdirSync } from 'node:fs';

const PORT = 9456;
const SHOTS = process.argv.includes('--shots');
const shotDir = new URL('../screenshots/', import.meta.url).pathname;

async function ver() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } }
let info = await ver();
if (!info) {
  Bun.spawn(['chromium', '--headless=new', `--remote-debugging-port=${PORT}`,
    '--window-size=1400,950', '--user-data-dir=/tmp/wardrobe-stress-prof', '--no-first-run', '--no-sandbox',
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
await waitFor(`[...document.querySelectorAll('#modelGrid .style-card--model h3')].some(h => h.textContent.includes('Full Kit'))`, 60000);

const names = (await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('#modelGrid .style-card--model h3')].map(h => h.textContent)`,
  returnByValue: true,
}, sessionId)).result.result.value;
console.log('cards:', names.map((n: string, i: number) => `${i}:${n}`).join(' | '));

// ── the in-page probe (one atomic evaluate per case: pose → render → read) ──
const PROBE = (i: number, setup: string) => send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const THREE = await import('/site/lib/three.module.js');
    const e = window.__rwfModels[${i}];
    if (!e || !e.avatar || !e.renderer) return { error: 'card not ready' };
    const av = e.avatar, B = av.bones;
    const scene3 = av.prone.children[0];

    // ── pose setup (case-specific, injected) ──
    try { ${setup} } catch (err) { return { error: 'setup: ' + err.message }; }

    // NEUTRALISE the card lights for the probe render (restored right after
    // readPixels): the stage's blue hemisphere + lime rim shift the tank's
    // shadow side to hue ~90 — the same hue as the frog body tint — which
    // made covered fabric classify as exposed skin. Under neutral white
    // light, lime reads lime, the green body reads green, white reads white.
    const lightSave = [];
    e.scene.traverse((o) => {
      if (!o.isLight) return;
      lightSave.push([o, o.color ? o.color.getHex() : null, o.groundColor ? o.groundColor.getHex() : null, o.intensity]);
      if (o.color) o.color.setHex(0xffffff);
      if (o.groundColor) o.groundColor.setHex(0xffffff);
      if (o.isPointLight || o.isSpotLight) o.intensity = 0; // kill the lime rim
      else o.intensity = Math.max(o.intensity, 1.8);
    });

    av.root.updateMatrixWorld(true);
    e.renderer.render(e.scene, e.cam);
    const gl = e.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (const [l, c, g, i0] of lightSave) {
      if (c != null) l.color.setHex(c);
      if (g != null) l.groundColor.setHex(g);
      l.intensity = i0;
    }
    const px = (u, v) => {
      const x = Math.min(W - 1, Math.max(0, Math.round(u * W))), y = Math.min(H - 1, Math.max(0, Math.round(v * H)));
      const p = (y * W + x) * 4;
      return [buf[p], buf[p + 1], buf[p + 2]];
    };
    const hueOf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 10) return -1;
      let h = 0;
      if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
      return h < 0 ? h + 360 : h;
    };
    // classify: lime≈68 (tank), coral≈11 (shorts), green≈80-135 (frog body
    // tint / goblin skin), white = bright neutral (the dressed card's body).
    // 'dark'/'other' = can't tell (shadow, warm tint) — never counted as
    // exposure, only hue-DEFINITE skin/garment colours are.
    const cls = (rgb) => {
      const [r, g, b] = rgb, h = hueOf(r, g, b), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
      if (h >= 0 && Math.abs(h - 68) < 15) return 'lime';
      if (h >= 0 && Math.abs(h - 11) < 17) return 'coral';
      if (h >= 0 && h > 80 && h < 135) return 'green';
      if (d < 25 && mx > 150) return 'white';
      if (d < 10 && mx < 60) return 'dark';
      return 'other';
    };

    // ── CPU skinning (body + cloth), same maths as the GPU path ──
    const skinned = [];
    const collect = (mesh, step) => {
      const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal;
      const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
      if (!SI) return;
      const sk = mesh.skeleton, bones = sk.bones, inv = sk.boneInverses;
      const M = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[k]));
      const out = [];
      step = Math.max(1, step | 0);
      for (let i = 0; i < P.count; i += step) {
        const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i));
        const n = N ? new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)) : new THREE.Vector3(0, 1, 0);
        const wsum = SW.getX(i) + SW.getY(i) + SW.getZ(i) + SW.getW(i) || 1;
        const wp = new THREE.Vector3(), wn = new THREE.Vector3();
        const ks = [[SI.getX(i), SW.getX(i)], [SI.getY(i), SW.getY(i)], [SI.getZ(i), SW.getZ(i)], [SI.getW(i), SW.getW(i)]];
        let dom = ks[0];
        for (const k of ks) if (k[1] > dom[1]) dom = k;
        for (const [bi, w] of ks) {
          if (w <= 0 || !M[bi]) continue;
          const ww = w / wsum;
          wp.addScaledVector(v.clone().applyMatrix4(M[bi]), ww);
          wn.addScaledVector(n.clone().transformDirection(M[bi]), ww);
        }
        out.push({ p: wp, n: wn.normalize(), dom: dom[0], bind: v });
      }
      return out;
    };
    let body = null, bodySkel = null, bodyFull = null;
    scene3.traverse((o) => {
      if (!body && o.isSkinnedMesh && o.skeleton && !o.userData?.rwfWardrobe) {
        body = collect(o, Math.floor(o.geometry.attributes.position.count / 900));
        bodyFull = collect(o, 1); // dense: the occluder cloud
        bodySkel = o.skeleton;
      }
    });
    if (!body) return { error: 'no body skinned mesh' };

    // BIND-pose reference joints, pose-independent: boneInverses[i]⁻¹ holds
    // the bone's bind world matrix in scene-local space (live joint positions
    // would move with the pose and corrupt the region windows)
    const bindJoint = (b) => {
      const k = bodySkel.bones.indexOf(b);
      if (k < 0) return new THREE.Vector3();
      return new THREE.Vector3().setFromMatrixPosition(bodySkel.boneInverses[k].clone().invert());
    };
    const hipsY = bindJoint(B.hips).y, spineY = bindJoint(B.spine).y;
    const kneeY = bindJoint(B.legL).y;
    const shoulderL = bindJoint(B.armL), shoulderR = bindJoint(B.armR);
    const shY = (shoulderL.y + shoulderR.y) / 2;
    const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Spine3']);
    const GARMENT = new Set(['lime', 'coral']); // any clothing counts as covered
    const SKIN = new Set(['green', 'white']);   // hue-definite body tint

    // ── region coverage: camera-facing body verts → pixel class ──
    const camPos = e.cam.position;
    const regions = {
      pelvis: { want: ['coral'], n: 0, ok: 0, bad: [] },
      crotch: { want: ['coral'], n: 0, ok: 0, bad: [] },
      thighL: { want: ['coral'], n: 0, ok: 0, bad: [] },
      thighR: { want: ['coral'], n: 0, ok: 0, bad: [] },
      beltline: { want: ['coral', 'other'], n: 0, ok: 0, bad: [] },
      torso: { want: ['lime'], n: 0, ok: 0, bad: [] },
      chest: { want: ['lime'], n: 0, ok: 0, bad: [] },
      sleeveL: { want: ['lime'], n: 0, ok: 0, bad: [] },
      sleeveR: { want: ['lime'], n: 0, ok: 0, bad: [] },
    };
    const thighTop = hipsY - 0.02, thighHem = kneeY + 0.50 * (hipsY - kneeY);
    // occluder cloud: body verts + RIGID wardrobe pieces (species heads, belt,
    // sneakers — anything that can legitimately sit in front of skin). The
    // skinned garments themselves are the things under test, so they are NOT
    // occluders. Depth must be LINEAR view-space z — NDC z at this camera
    // (near 0.01 / far 60) compresses 0.1 world units to ~1e-5 NDC.
    const invCam = e.cam.matrixWorldInverse;
    const viewZ = (p) => p.clone().applyMatrix4(invCam).z;
    for (const s of body) { s.ndc = s.p.clone().project(e.cam); s.vz = viewZ(s.p); }
    const occluders = bodyFull.map((s) => { const n = s.p.clone().project(e.cam); return { x: n.x, y: n.y, z: viewZ(s.p) }; });
    scene3.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      // rigid wardrobe pieces (species heads, belt, sneakers) — the tag may
      // sit on an ancestor group (head group → skull/eye/glint children)
      let p = o, tagged = false;
      while (p) { if (p.userData?.rwfWardrobe) { tagged = true; break; } p = p.parent; }
      if (!tagged) return;
      o.updateWorldMatrix(true, false);
      const P = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(P.count / 700));
      for (let i = 0; i < P.count; i += step) {
        const pt = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(o.matrixWorld);
        const ndc = pt.clone().project(e.cam);
        occluders.push({ x: ndc.x, y: ndc.y, z: viewZ(pt) });
      }
    });
    const occluded = (ndc, vz) => {
      for (const o of occluders) {
        // view z is negative in front; closer to camera = greater (less
        // negative). Occluder must be ≥2cm CLOSER than the sample.
        if (o.z <= vz + 0.02) continue;
        if (Math.abs(o.x - ndc.x) < 0.008 && Math.abs(o.y - ndc.y) < 0.008) return true;
      }
      return false;
    };
    // arm-axis frame for the sleeve region (bind space)
    const shL = shoulderL, shR = shoulderR;
    const elL = bindJoint(B.foreL), elR = bindJoint(B.foreR);
    const armAxisL = elL.clone().sub(shL).normalize(), armAxisR = elR.clone().sub(shR).normalize();
    for (const s of body) {
      const name = bodySkel.bones[s.dom]?.name ?? '';
      const b = s.bind;
      let reg = null;
      if (TORSO.has(name)) {
        if (b.y < spineY - 0.012 && b.y > hipsY - 0.075) reg = 'pelvis';
        else if (b.y < hipsY - 0.028 && Math.abs(b.x) < 0.055 && b.y > hipsY - 0.075) reg = 'crotch';
        else if (b.y >= spineY - 0.012 && b.y <= spineY + 0.018) reg = 'beltline';
        else if (b.y > spineY + 0.018 && b.y < shY - 0.09) reg = b.y > 1.2 ? 'chest' : 'torso';
      } else if (name === 'LeftUpLeg' || name === 'RightUpLeg') {
        if (b.y < thighTop && b.y > thighHem) reg = name === 'LeftUpLeg' ? 'thighL' : 'thighR';
      } else if (name === 'LeftArm' || name === 'RightArm') {
        // the sleeve's actual span: along the upper-arm axis, not the deltoid
        // cap above the joint (a tank legitimately leaves the cap bare)
        const sh = name === 'LeftArm' ? shL : shR;
        const ax = name === 'LeftArm' ? armAxisL : armAxisR;
        const rel = b.clone().sub(sh);
        const along = rel.dot(ax);
        const radial = rel.clone().addScaledVector(ax, -along).length();
        if (along > 0.015 && along < 0.105 && radial < 0.062) reg = name === 'LeftArm' ? 'sleeveL' : 'sleeveR';
      }
      if (!reg) continue;
      const toCam = camPos.clone().sub(s.p);
      if (s.n.dot(toCam) <= 0) continue; // back-facing: its pixel is the far side
      if (s.ndc.z >= 1 || Math.abs(s.ndc.x) > 0.99 || Math.abs(s.ndc.y) > 0.99) continue;
      if (occluded(s.ndc, s.vz)) continue;
      const c = cls(px((s.ndc.x + 1) / 2, (s.ndc.y + 1) / 2));
      const R = regions[reg];
      if (c === 'dark' || c === 'other') { R.unknown = (R.unknown || 0) + 1; continue; }
      R.n++;
      if (GARMENT.has(c)) R.ok++; // any garment colour = covered (layering
      // between tank/shorts/belt at deep bends is fine — the bar is NO SKIN)
      else if (SKIN.has(c) && R.bad.length < 4) R.bad.push(c + '@' + ((s.ndc.x + 1) / 2).toFixed(2) + ',' + ((s.ndc.y + 1) / 2).toFixed(2));
    }

    // ── fabric continuity: cloth surface midpoints between adjacent rings ─
    // A hue-definite SKIN pixel on the fabric's own surface = a tear. Another
    // garment colour = layering (tank hem over the shorts waistband) — fine.
    // Midpoints pushed INSIDE the body at deep flexion (fabric hugs/enters
    // the skin it wraps) can't tear visibly — skipped. Dark/other = unknown.
    const fabric = { n: 0, ok: 0, bad: [] };
    scene3.traverse((o) => {
      if (!o.isSkinnedMesh || !o.userData?.rwfWardrobe) return;
      const verts = collect(o, 1);
      for (let k = 0; k + 18 < verts.length; k += 18) {
        for (let j = 0; j < 18; j += 3) {
          const a = verts[k + j], b2 = verts[k + 18 + j];
          const m = a.p.clone().lerp(b2.p, 0.5);
          const nrm = a.n.clone().add(b2.n).normalize();
          if (nrm.dot(camPos.clone().sub(m)) < 0.25) continue;
          const ndc = m.project(e.cam);
          if (ndc.z >= 1 || Math.abs(ndc.x) > 0.99 || Math.abs(ndc.y) > 0.99) continue;
          // occluded by a closer body part (limb/head crossing)? not a tear
          if (occluded(ndc, viewZ(m))) continue;
          // inside the body (fabric pressed into its own skin)? not visible
          let inside = false;
          for (const s of bodyFull) { if (s.p.distanceToSquared(m) < 0.012 * 0.012) { inside = true; break; } }
          if (inside) continue;
          // verdict from the midpoint AND its two ring verts: the fabric is
          // intact if ANY of the three lands on garment colour (a midpoint
          // tucked behind skin with visible fabric walls is bunching, not a
          // tear; a real hole reads skin at all three)
          const readPx = (pt) => {
            const n2 = pt.clone().project(e.cam);
            if (n2.z >= 1 || Math.abs(n2.x) > 0.99 || Math.abs(n2.y) > 0.99) return 'skip';
            return cls(px((n2.x + 1) / 2, (n2.y + 1) / 2));
          };
          const cs = [readPx(m), readPx(a.p), readPx(b2.p)];
          if (cs.every((c) => c === 'dark' || c === 'other' || c === 'skip')) continue; // unknowable
          fabric.n++;
          if (cs.some((c) => GARMENT.has(c))) fabric.ok++;
          else if (fabric.bad.length < 5) fabric.bad.push(cs.join('/') + '@' + ((ndc.x + 1) / 2).toFixed(2) + ',' + ((ndc.y + 1) / 2).toFixed(2));
        }
      }
    });

    // ── joint dump (mocap-drive evidence) ──
    const jp = (b) => { const v = b.getWorldPosition(new THREE.Vector3()); return [+(v.x).toFixed(3), +(v.y).toFixed(3), +(v.z).toFixed(3)]; };
    const joints = {
      bvhT: e.bvh && !e.bvh.dead ? +e.bvh.time.toFixed(2) : null,
      hips: jp(B.hips), head: jp(B.head),
      ankL: jp(B.footL), ankR: jp(B.footR), handL: jp(B.handL),
    };

    // ── ASCII view of the card (the agent's eyes): 10px cells → majority
    //    class. L=lime tank, C=coral shorts, G=green/white skin, K=dark
    //    belt/shoe, .=stage. The figure reads like a low-res screenshot.
    const CW = 10, rows = [];
    for (let y0 = 0; y0 < H; y0 += CW) {
      let row = '';
      for (let x0 = 0; x0 < W; x0 += CW) {
        const tally = {};
        for (let dy = 0; dy < CW; dy += 2) for (let dx = 0; dx < CW; dx += 2) {
          const c = cls(px((x0 + dx) / W, 1 - (y0 + dy) / H));
          tally[c] = (tally[c] ?? 0) + 1;
        }
        let best = 'dark', bn = 0;
        for (const [k, v2] of Object.entries(tally)) if (v2 > bn) { bn = v2; best = k; }
        row += best === 'lime' ? 'L' : best === 'coral' ? 'C' : best === 'green' ? 'G'
          : best === 'white' ? 'W' : best === 'dark' ? '.' : ' ';
      }
      rows.push(row);
    }
    const ascii = rows.filter((r) => /[LCGW]/.test(r)).join('\\n');

    const out = { joints, ascii };
    for (const [k, R] of Object.entries(regions)) out[k] = R.n ? \`\${(100 * R.ok / R.n).toFixed(0)}% (\${R.ok}/\${R.n})\${R.bad.length ? ' bad:' + R.bad.join('|') : ''}\` : '—';
    out.fabric = fabric.n ? \`\${(100 * fabric.ok / fabric.n).toFixed(0)}% (\${fabric.ok}/\${fabric.n})\${fabric.bad.length ? ' bad:' + fabric.bad.join('|') : ''}\` : '—';
    return out;
  })()`,
}, sessionId);

// pose setups injected into the probe
const BVH_WIDEST = (clip: string) => `
  if (!e.bvh || e.bvh.dead || e.bvh.clipName !== '${clip}') {
    if (e.bvh) e.bvh.stop();
    const { loadBVH, BVHPlayer } = await import('/site/model-avatars.js');
    const res = await loadBVH('/models/goblin_${clip === 'walk' ? 'walk_stick' : clip}.bvh');
    e.bvh = new BVHPlayer(av, res);
    e.bvh.clipName = '${clip}';
  }
  // scan the clip for the widest ankle spread — the stress frame
  let best = 0, bestT = 0;
  for (let k = 0; k <= 48; k++) {
    e.bvh.time = (k / 48) * e.bvh.duration;
    e.bvh.update(0);
    av.root.updateMatrixWorld(true);
    const d = B.footL.getWorldPosition(new THREE.Vector3()).distanceTo(B.footR.getWorldPosition(new THREE.Vector3()));
    if (d > best) { best = d; bestT = e.bvh.time; }
  }
  e.bvh.time = bestT; e.bvh.update(0);`;
const WALK_WIDEST = BVH_WIDEST('walk');
const WALK_T = (frac: number) => `
  if (!e.bvh || e.bvh.dead) {
    const { loadBVH, BVHPlayer } = await import('/site/model-avatars.js');
    e.bvh = new BVHPlayer(av, await loadBVH('/models/goblin_walk_stick.bvh'));
  }
  e.bvh.time = (e.bvh.time + ${frac} * e.bvh.duration) % e.bvh.duration;
  e.bvh.update(0);`;
const EXERCISE = (name: string) => `
  if (e.bvh) { e.bvh.stop(); e.bvh = null; }
  if (e.mixer) { e.mixer.stopAllAction(); e.mixer = null; }
  av.pose('${name}', 0.5);`;

const CASES: Array<[string, string, RegExp]> = [
  ['fullkit_walk_widest', WALK_WIDEST, /Full Kit/],
  ['fullkit_walk_f2', WALK_T(0.5), /Full Kit/],
  ['fullkit_squat_deep', EXERCISE('squat'), /Full Kit/],
  ['fullkit_pushup_bottom', EXERCISE('pushup'), /Full Kit/],
  ['fullkit_jack_armsup', EXERCISE('jumpingjack'), /Full Kit/],
  ['fullkit_curl_top', EXERCISE('curl'), /Full Kit/],
  ['fullkit_limp_widest', BVH_WIDEST('limp'), /Full Kit/],
  ['fullkit_drag_widest', BVH_WIDEST('drag'), /Full Kit/],
  ['fullkit_onearm_widest', BVH_WIDEST('one_arm'), /Full Kit/],
  ['fullkit_combat_widest', BVH_WIDEST('combat'), /Full Kit/],
  ['wardrobe_walk_widest', WALK_WIDEST, /Wardrobe — dressed/],
  ['wardrobe_squat_deep', EXERCISE('squat'), /Wardrobe — dressed/],
];

if (SHOTS) mkdirSync(shotDir, { recursive: true });
let failures = 0;
for (const [label, setup, nameRe] of CASES) {
  const i = names.findIndex((n: string) => nameRe.test(n));
  if (i < 0) { console.log(`\n### ${label}: CARD NOT FOUND`); failures++; continue; }
  // scroll into view (lazy renderer + auto-BVH), settle
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - 300 }); return true; })()`,
    returnByValue: true,
  }, sessionId);
  const needsWalk = setup.includes('walk') || label.includes('walk');
  if (needsWalk) {
    await waitFor(`window.__rwfModels[${i}]?.bvh && !window.__rwfModels[${i}].bvh.dead`, 90000);
  } else {
    await new Promise(r => setTimeout(r, 3500));
  }
  await new Promise(r => setTimeout(r, 800));
  const r = await PROBE(i, setup);
  const v = r?.result?.result?.value;
  console.log(`\n### ${label}  [card ${i}: ${names[i]}]`);
  if (!v || v.error) { console.log('  ERROR:', v?.error ?? 'no value'); failures++; continue; }
  console.log('  joints:', JSON.stringify(v.joints));
  if (v.ascii) console.log(v.ascii);
  const pct = (s: string) => parseInt(s ?? '0', 10);
  let bad = false;
  for (const [k, val] of Object.entries(v)) {
    if (k === 'joints') continue;
    const p = pct(String(val));
    console.log('  ' + String(k).padEnd(9) + ' ' + val);
    if (k !== 'beltline' && p < 90) bad = true;
  }
  if (bad) failures++;
  if (SHOTS) {
    const card = (await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelectorAll('#modelGrid .style-card--model')[${i}]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
      returnByValue: true,
    }, sessionId)).result.result.value;
    const shot = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: card.x, y: card.y, width: card.w, height: card.h, scale: 1 }, captureBeyondViewport: true,
    }, sessionId);
    await Bun.write(`${shotDir}wardrobe_stress_${label}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log('  shot → apps/avatars/screenshots/wardrobe_stress_' + label + '.png');
  }
}

console.log(`\nCONSOLE ERRORS: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('  ' + e.slice(0, 300));
console.log(`\n${failures} case(s) below 90% coverage`);
ws.close(); process.exit(errors.length > 0 ? 2 : failures > 0 ? 1 : 0);
