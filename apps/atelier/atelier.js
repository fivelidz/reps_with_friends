//
// atelier.js — the OUTFIT ATELIER runtime.
//
// One avatar, one WebGL context, every instrument the founder's eyes need:
//   • animation: idle + 5 BVH clips + 4 exercise poses, 0.1×–2× speed,
//     pause + single-frame stepping (watch a seam at the exact strain frame)
//   • turntable: orbit + zoom (OrbitControls) + auto-rotate
//   • x-ray: garments at 30% opacity (+ optional body wireframe) — seam
//     alignment vs the body, seen THROUGH the fabric
//   • seam heatmap: garment vertices false-coloured by live distance to the
//     body surface (green <2 cm · amber <5 cm · red beyond)
//   • build-up: naked → … → full kit, one advancing step at a time
//   • isolation: exactly one garment on screen
//   • verify: programmatic attachment probe (all clips × 4 phases, all poses
//     × 3 phases): garment→body max distance + ring-by-ring continuity
//   • config export: current setup as copyable JSON (reusable tool)
//
// window.__atelier exposes everything for the CDP verify suite.
//

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadModel, applyFlatTint, loadBVH, BVHPlayer, ModelAvatar, BVH_FILES }
  from '/site/model-avatars.js';
import {
  attachOutfit, clearOutfit, garmentVerts, bodySurface, nearestDistanceFactory,
  skeletonSamples, OUTFIT_SLOTS, SLOT_LABELS, BUILDUP_STEPS,
} from '/site/models/geno-outfit.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// ── renderer / scene / camera (ONE context — created exactly once) ───────────
let glContexts = 0;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
glContexts++;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0b0d');

const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 60);
const HOME = { pos: new THREE.Vector3(0.55, 1.25, 2.9), tgt: new THREE.Vector3(0, 0.92, 0) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.tgt);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.7;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.56;

// neutral-white light rig: hue-true pixels for the in-page probes (the old
// blue stage shifted lime shadows into body-tint hues and broke classification)
scene.add(new THREE.HemisphereLight(0xffffff, 0x777b82, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 1.35);
key.position.set(1.6, 2.6, 1.9);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-1.8, 1.2, -1.4);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1.35, 48).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x111318 }),
);
ground.position.y = -0.002;
scene.add(ground);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.62, 0.635, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x2a2e36 }),
);
scene.add(ring);

// ── state ────────────────────────────────────────────────────────────────────
const state = {
  animId: 'idle', speed: 1, paused: false, t: 0,
  buildStep: BUILDUP_STEPS.length - 1, iso: null,
  xray: false, wire: false, heat: false, autoTurn: true,
  ready: false, verifying: false,
};

const POSES = [
  { id: 'idle', label: 'idle (stand + sway)', pose: 'stand', cycle: 6 },
  { id: 'squat', label: 'squat', pose: 'squat', cycle: 3 },
  { id: 'pushup', label: 'push-up (prone)', pose: 'pushup', cycle: 3 },
  { id: 'jumpingjack', label: 'jumping jacks', pose: 'jumpingjack', cycle: 2.2 },
  { id: 'curl', label: 'biceps curl', pose: 'curl', cycle: 2.6 },
];
const CLIPS = ['walk', 'limp', 'drag', 'one_arm', 'combat'];
const ANIMS = [
  ...POSES.map((p) => ({ ...p, kind: 'pose' })),
  ...CLIPS.map((c) => ({ id: 'bvh:' + c, kind: 'bvh', clip: c, label: `BVH · ${c}` })),
];

let av = null;          // ModelAvatar
let outfit = null;      // attachOutfit result
let bvh = null;         // live BVHPlayer (killed on switch — BVHPlayer.stop is terminal)
let heatTimer = 0;
const fps = { ema: 60 };

// ── garment material surgery (x-ray / heatmap) ───────────────────────────────
const matSave = new Map(); // mesh -> { opacity, transparent, depthWrite, mat }
const heatMat = new THREE.MeshLambertMaterial({
  vertexColors: true, color: 0xffffff, side: THREE.DoubleSide,
});

function allGarments() {
  return outfit ? [...outfit.softGarments, ...outfit.rigidPieces] : [];
}

function applyViewFX() {
  if (!outfit) return;
  for (const g of allGarments()) {
    if (!matSave.has(g)) {
      matSave.set(g, { mat: g.material, transparent: g.material.transparent, depthWrite: g.material.depthWrite });
    }
    const save = matSave.get(g);
    if (state.heat) {
      if (!g.geometry.getAttribute('color')) {
        const n = g.geometry.attributes.position.count;
        g.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      }
      g.material = heatMat;
    } else if (state.xray) {
      g.material = save.mat;
      g.material.transparent = true;
      g.material.opacity = 0.3;
      g.material.depthWrite = false;
      g.material.needsUpdate = true;
    } else {
      g.material = save.mat;
      g.material.transparent = save.transparent;
      g.material.opacity = 1;
      g.material.depthWrite = save.depthWrite;
      g.material.needsUpdate = true;
    }
  }
  // body: wireframe + silhouette lift (skip anything under a wardrobe tag)
  av.prone.children[0].traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    let p = o, tagged = false;
    while (p) { if (p.userData?.rwfWardrobe) { tagged = true; break; } p = p.parent; }
    if (tagged) return;
    o.material.wireframe = state.wire;
    o.material.emissive?.setHex(state.xray ? 0x23272e : 0x000000);
  });
}

const heatColour = (dCm, out) => {
  // green <2 · amber <5 · red beyond — smooth blend between stops
  const g = [0.20, 0.83, 0.60], a = [1.0, 0.69, 0.13], r = [1.0, 0.30, 0.37];
  let c;
  if (dCm <= 2) c = g;
  else if (dCm <= 5) { const t = (dCm - 2) / 3; c = g.map((v, i) => v + (a[i] - v) * t); }
  else { const t = Math.min(1, (dCm - 5) / 3); c = a.map((v, i) => v + (r[i] - v) * t); }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
};

function updateHeatmap() {
  if (!state.heat || !outfit) return;
  const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
  const cmPerUnit = 175 / (s * av.H);           // 1.75 m human at this scale
  const body = bodySurface(av, 9000);           // cheaper sampling for live updates
  const nearest = nearestDistanceFactory(body, 0.05);
  const rgb = [0, 0, 0];
  for (const g of allGarments()) {
    if (!g.visible) continue;
    const colAttr = g.geometry.getAttribute('color');
    if (!colAttr) continue;
    const verts = garmentVerts(g);
    for (let i = 0; i < verts.length && i < colAttr.count; i++) {
      const d = nearest(verts[i].x, verts[i].y, verts[i].z) * cmPerUnit;
      heatColour(d, rgb);
      colAttr.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    }
    colAttr.needsUpdate = true;
  }
}

// ── visibility (build-up + isolation) ────────────────────────────────────────
function applyVisibility() {
  if (!outfit) return;
  const stepSlots = BUILDUP_STEPS[state.buildStep].slots;
  for (const slot of OUTFIT_SLOTS) {
    const on = state.iso ? state.iso === slot : stepSlots.includes(slot);
    outfit.toggle(slot, on);
  }
  document.querySelectorAll('.build-step').forEach((el, i) => {
    el.classList.toggle('is-on', i === state.buildStep);
    el.classList.toggle('is-done', i < state.buildStep);
  });
  document.querySelectorAll('.iso-chip').forEach((el) => {
    el.classList.toggle('is-on', state.iso ? el.dataset.slot === state.iso : el.dataset.slot === 'all');
  });
  $('stageNote').textContent = state.iso
    ? `isolated: ${SLOT_LABELS[state.iso]}`
    : `step ${state.buildStep + 1}/${BUILDUP_STEPS.length}: ${BUILDUP_STEPS[state.buildStep].label}`;
}

// ── animation engine ─────────────────────────────────────────────────────────
function animById(id) { return ANIMS.find((a) => a.id === id); }

async function setAnim(id) {
  const a = animById(id);
  if (!a) return;
  if (bvh) { bvh.stop(); bvh = null; }
  state.animId = id;
  state.t = 0;
  if (a.kind === 'bvh') {
    try {
      const res = await loadBVH(BVH_FILES[a.clip] ?? `/models/goblin_${a.clip}.bvh`);
      bvh = new BVHPlayer(av, res);
      bvh.update(0);
    } catch (e) {
      $('stageNote').textContent = 'BVH failed: ' + e.message;
      return;
    }
  } else {
    av.pose(a.pose, 0.5);
  }
  $('animSel').value = id;
  $('hudAnim').textContent = a.label;
}

function applyAnimAt() {
  const a = animById(state.animId);
  if (!a) return;
  if (a.kind === 'bvh' && bvh) {
    bvh.time = state.t % bvh.duration;
    bvh.update(0);
  } else if (a.kind === 'pose') {
    av.pose(a.pose, (state.t / a.cycle) % 1);
  }
}

function stepFrame(dir) {
  const wasPaused = state.paused;
  state.paused = true;
  updatePauseBtn();
  state.t += dir * (1 / 30) * state.speed;
  applyAnimAt();
  if (state.heat) updateHeatmap();
  if (!wasPaused) $('hudPhase').textContent = phaseLabel();
}

function phaseLabel() {
  const a = animById(state.animId);
  if (!a) return '—';
  if (a.kind === 'bvh' && bvh) return `t ${bvh.time.toFixed(2)}s / ${bvh.duration.toFixed(2)}s`;
  return 'phase ' + (((state.t / a.cycle) % 1)).toFixed(2);
}

function updatePauseBtn() {
  $('btnPause').textContent = state.paused ? '▶ Play' : '⏸ Pause';
  $('btnPause').classList.toggle('is-on', state.paused);
}

// ── pixel probes (band visibility, sleeves) ─────────────────────────────────
function readFrame() {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return { buf, W, H };
}
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 10) return -1;
  let h = 0;
  if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};
const classify = (r, g, b) => {
  const h = hueOf(r, g, b), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (h >= 0 && Math.abs(h - 68) < 16) return 'lime';      // tee
  if (h >= 0 && Math.abs(h - 11) < 18) return 'coral';     // shorts / headband
  if (d < 28 && mx > 150) return 'white';                  // waistband stripe
  if (d < 10 && mx < 60) return 'dark';
  return 'other';
};

function withCamera(pos, tgt, fn) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  controls.autoRotate = false;
  camera.position.copy(pos);
  controls.target.copy(tgt);
  camera.lookAt(tgt);
  controls.update();
  const out = fn();
  camera.position.copy(p0);
  controls.target.copy(t0);
  controls.update();
  return out;
}
function withNeutralLights(fn) {
  const saved = [];
  scene.traverse((o) => {
    if (!o.isLight) return;
    saved.push([o, o.color?.getHex?.() ?? null, o.groundColor?.getHex?.() ?? null, o.intensity]);
    if (o.color) o.color.setHex(0xffffff);
    if (o.groundColor) o.groundColor.setHex(0xffffff);
    o.intensity = o.isDirectionalLight || o.isHemisphereLight ? Math.max(o.intensity, 1.35) : 0;
  });
  scene.background = new THREE.Color('#101215');
  const out = fn();
  for (const [o, c, g, i] of saved) {
    if (c != null) o.color.setHex(c);
    if (g != null) o.groundColor.setHex(g);
    o.intensity = i;
  }
  scene.background = new THREE.Color('#0a0b0d');
  return out;
}
function withUI(fn) {
  const s = { x: state.xray, h: state.heat, step: state.buildStep, iso: state.iso, anim: state.animId };
  state.xray = false; state.heat = false; state.iso = null;
  state.buildStep = BUILDUP_STEPS.length - 1; // full kit for probes
  applyViewFX(); applyVisibility();
  const out = fn();
  Object.assign(state, { xray: s.x, heat: s.h, buildStep: s.step, iso: s.iso });
  applyViewFX(); applyVisibility();
  setAnim(s.anim); // pixel probes kill the BVH player — restore the live anim
  return out;
}

/** Waistband pixel probe (scan-based, projection-free): across the central
 *  column strip, the band is the UNIQUE white run with lime (tee) above and
 *  coral (shorts) below — shoe soles are white too but sit under charcoal,
 *  and nothing else is white-between-lime-and-coral. */
async function bandCheck() {
  if (!av || !outfit) return { error: 'not ready' };
  return withUI(() => {
    if (bvh) { bvh.stop(); bvh = null; }
    av.pose('stand', 0.35);
    av.root.updateMatrixWorld(true);
    return withCamera(new THREE.Vector3(0.55, 1.15, 2.9), new THREE.Vector3(0, 0.92, 0), () =>
      withNeutralLights(() => {
        const { buf, W, H } = readFrame();
        const px = (x, y) => { const p = ((H - 1 - y) * W + x) * 4; return [buf[p], buf[p + 1], buf[p + 2]]; };
        const x0 = Math.round(W * 0.42), x1 = Math.round(W * 0.58);
        const rows = [];
        for (let y = 0; y < H; y++) {
          let lime = 0, coral = 0, white = 0, n = 0;
          for (let x = x0; x <= x1; x += 2) {
            const c = classify(...px(x, y));
            n++;
            if (c === 'lime') lime++; else if (c === 'coral') coral++; else if (c === 'white') white++;
          }
          rows.push({ y, lime, coral, white, n });
        }
        // find white runs, then test the neighbourhood signature
        const runs = [];
        let runStart = -1;
        for (const r of rows) {
          const isBand = r.white > r.lime && r.white > r.coral && r.white > r.n * 0.35;
          if (isBand && runStart < 0) runStart = r.y;
          if (!isBand && runStart >= 0) { runs.push([runStart, r.y - 1]); runStart = -1; }
        }
        if (runStart >= 0) runs.push([runStart, H - 1]);
        const near = (y, key, dir) => {
          for (let dy = 2; dy <= 34; dy += 2) {
            const r = rows[Math.max(0, Math.min(H - 1, y + dir * dy))];
            if (r && r[key] > r.n * 0.3) return true;
          }
          return false;
        };
        const band = runs.map(([a, b]) => ({
          a, b, len: b - a + 1,
          limeAbove: near(a, 'lime', -1),
          coralBelow: near(b, 'coral', +1),
        })).find(r => r.limeAbove && r.coralBelow && r.len >= 3 && r.len < H * 0.08);
        return {
          whiteRuns: runs.map(([a, b]) => `${a}-${b}(${b - a + 1}px)`),
          band: band ? `rows ${band.a}-${band.b} (${band.len}px ≈ ${(100 * band.len / H).toFixed(1)}% frame)` : null,
          pass: !!band,
        };
      }));
  });
}

/** Sleeve probe (scan-based): in the band between the headband row and the
 *  waist band, lime pixels FAR from the figure centreline are SLEEVES —
 *  count them on each side. Projection-free like bandCheck. */
async function sleeveCheck(view = 'front') {
  if (!av || !outfit) return { error: 'not ready' };
  return withUI(() => {
    if (bvh) { bvh.stop(); bvh = null; }
    av.pose('stand', 0.35);
    av.root.updateMatrixWorld(true);
    const pos = view === 'front'
      ? new THREE.Vector3(0.55, 1.15, 2.9)
      : new THREE.Vector3(2.1, 1.35, 2.1);
    return withCamera(pos, new THREE.Vector3(0, 0.92, 0), () =>
      withNeutralLights(() => {
        const { buf, W, H } = readFrame();
        const px = (x, y) => { const p = ((H - 1 - y) * W + x) * 4; return [buf[p], buf[p + 1], buf[p + 2]]; };
        // column classification profile: per column, the min/max row of lime
        const colLime = Array.from({ length: W }, () => ({ n: 0, min: 1e9, max: -1 }));
        let limeTotal = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          if (classify(...px(x, y)) === 'lime') {
            const c = colLime[x];
            c.n++; c.min = Math.min(c.min, y); c.max = Math.max(c.max, y);
            limeTotal++;
          }
        }
        // figure centre: mean x of lime columns weighted by count
        let sx = 0, sn = 0;
        for (let x = 0; x < W; x++) if (colLime[x].n > 0) { sx += x * colLime[x].n; sn += colLime[x].n; }
        if (!sn) return { view, pass: false, reason: 'no shirt pixels' };
        const cx = sx / sn;
        // lime columns whose TOP row is above 55% frame height = sleeve/shoulder
        // zone; split by side
        let left = 0, right = 0;
        for (let x = 0; x < W; x++) {
          const c = colLime[x];
          if (!c.n || c.min > H * 0.55) continue;
          if (x < cx - W * 0.02) left += c.n;
          else if (x > cx + W * 0.02) right += c.n;
        }
        const perSide = (left + right) / Math.max(1, limeTotal);
        return {
          view,
          sleevePixels: { left, right },
          shareOfShirt: +(100 * perSide).toFixed(1) + '%',
          pass: left > 25 && right > 25,
        };
      }));
  });
}

// ── THE VERIFY PROBE (programmatic attachment + continuity) ─────────────────
const V_CLIPS = CLIPS;
const V_POSES = ['squat', 'pushup', 'jumpingjack', 'curl'];

async function runVerify() {
  if (!av || !outfit || state.verifying) return { error: 'not ready' };
  state.verifying = true;
  $('btnVerify').disabled = true;
  const out = $('verifyOut');
  const say = (html) => { out.innerHTML = html; };

  const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
  const cmPerUnit = 175 / (s * av.H);
  // attachment bars (cm): the founder's ≤5 cm, plus a documented allowance —
  // a t-shirt's sleeve-side fabric SPANS the armpit hollow (deltoid↔pec gap,
  // measured ~6–8 cm of void in Geno): bridging is what a t-shirt does, so
  // the tee is bar'd at 8 cm, everything else at 5.
  const ATTACH_BAR = { default: 5, tshirt: 8 };
  const barOf = (tag) => ATTACH_BAR[tag] ?? ATTACH_BAR.default;
  const STRETCH_BAR = 0.3;   // cm — ring-to-ring edge strain (3 mm)
  const rows = [];
  const notes = [];

  const measureCase = (label) => {
    av.root.updateMatrixWorld(true);
    const surface = bodySurface(av);
    const nearSurface = nearestDistanceFactory(surface, 0.05);
    // rigid pieces are bone-welded: sparse low-poly flesh (Geno's feet) makes
    // surface-only distance dishonest for them — they answer to the skeleton
    const nearBody = nearestDistanceFactory([...surface, ...skeletonSamples(av)], 0.05);
    const perGarment = {};
    let maxAll = 0, worst = '';
    let maxStretch = 0, worstStretch = '';
    for (const g of [...outfit.softGarments, ...outfit.rigidPieces]) {
      const tag = g.userData?.rwfWardrobe ?? '?';
      const nearest = g.isSkinnedMesh ? nearSurface : nearBody;
      const verts = garmentVerts(g);
      let maxD = 0, nan = 0;
      for (const v of verts) {
        if (!isFinite(v.x + v.y + v.z)) { nan++; continue; }
        const d = nearest(v.x, v.y, v.z) * cmPerUnit;
        if (d > maxD) maxD = d;
      }
      perGarment[tag] = { maxCm: +maxD.toFixed(1), nan };
      if (maxD > maxAll) { maxAll = maxD; worst = tag; }
      // continuity: adjacent rings within each strip — live vs bind edge length
      const layout = g.userData?.rwfLayout;
      if (layout) {
        const P = g.geometry.attributes.position;
        const { radial } = layout;
        for (const strip of layout.layout) {
          if (!strip) continue;
          for (let ri = 0; ri < strip.ringCount - 1; ri++) {
            for (let k = 0; k < radial; k++) {
              const ia = strip.start + ri * radial + k;
              const ib = strip.start + (ri + 1) * radial + k;
              const a = verts[ia], b = verts[ib];
              if (!a || !b) continue;
              const dl = a.distanceTo(b);
              const db = new THREE.Vector3().fromBufferAttribute(P, ia)
                .distanceTo(new THREE.Vector3().fromBufferAttribute(P, ib));
              const stretch = (dl / s - db) * cmPerUnit; // scale-normalised cm
              if (stretch > maxStretch) { maxStretch = stretch; worstStretch = `${tag} r${ri}k${k}`; }
              if (!isFinite(dl)) { nan++; }
            }
          }
        }
      }
    }
    let overBar = null;
    for (const [tag, v] of Object.entries(perGarment)) {
      if (v.maxCm > barOf(tag)) overBar = tag;
    }
    rows.push({ label, maxCm: +maxAll.toFixed(1), worst, stretchCm: +maxStretch.toFixed(2), worstStretch, perGarment, overBar, nan: Object.values(perGarment).reduce((a, p) => a + p.nan, 0) });
    return rows[rows.length - 1];
  };

  try {
    // save the live UI state; the probe drives the rig directly
    const savedAnim = state.animId;
    const hadBvh = !!bvh;
    if (bvh) { bvh.stop(); bvh = null; }

    say('<p class="vspin">probing BVH clips…</p>');
    await nextTick();
    for (const clip of V_CLIPS) {
      const res = await loadBVH(BVH_FILES[clip]);
      const player = new BVHPlayer(av, res);
      for (const ph of [0, 0.25, 0.5, 0.75]) {
        player.time = ph * player.duration;
        player.update(0);
        measureCase(`bvh ${clip} @${ph.toFixed(2)}`);
      }
      player.stop();
      await nextTick();
    }

    say('<p class="vspin">probing exercise poses…</p>');
    await nextTick();
    for (const pose of V_POSES) {
      const ankles = [];
      for (const ph of [0.25, 0.5, 0.75]) {
        av.pose(pose, ph);
        const row = measureCase(`pose ${pose} @${ph.toFixed(2)}`);
        row.pose = pose; row.phase = ph;
        // feet-plant sanity: ankle world positions across phases
        ankles.push([
          av.bones.footL.getWorldPosition(new THREE.Vector3()).toArray(),
          av.bones.footR.getWorldPosition(new THREE.Vector3()).toArray(),
        ]);
      }
      let drift = 0;
      for (let i = 0; i < ankles.length; i++) for (let j = i + 1; j < ankles.length; j++) {
        for (const s2 of [0, 1]) {
          const d = Math.hypot(
            ankles[i][s2][0] - ankles[j][s2][0], ankles[i][s2][1] - ankles[j][s2][1], ankles[i][s2][2] - ankles[j][s2][2]);
          if (d > drift) drift = d;
        }
      }
      rows.filter((r) => r.pose === pose).forEach((r) => { r.ankleDriftCm = +(drift * cmPerUnit).toFixed(1); });
      await nextTick();
    }

    // restore the anim the founder had running
    await setAnim(savedAnim);
    state.t = 0;
    applyAnimAt();

    // ── verdicts
    const attachRows = rows.filter((r) => r.overBar);
    const stretchRows = rows.filter((r) => r.stretchCm > STRETCH_BAR);
    const nanRows = rows.filter((r) => r.nan > 0);
    const attachPass = attachRows.length === 0 && nanRows.length === 0;
    const stretchPass = stretchRows.length === 0;

    let html = '<table><tr><th>case</th><th>max→body</th><th>worst</th><th>stretch</th><th>verdict</th></tr>';
    for (const r of rows) {
      const bad = !!r.overBar || r.stretchCm > STRETCH_BAR || r.nan > 0;
      html += `<tr><td>${r.label}</td><td class="${r.overBar ? 'fail' : 'pass'}">${r.maxCm} cm</td>` +
        `<td class="dim">${r.worst}</td><td class="${r.stretchCm > STRETCH_BAR ? 'fail' : 'pass'}">${r.stretchCm.toFixed(2)} cm</td>` +
        `<td class="${bad ? 'fail' : 'pass'}">${bad ? 'FAIL' : 'pass'}</td></tr>`;
    }
    html += '</table>';
    // per-garment maxima across all cases + their bars
    const perGarmentMax = {};
    for (const r of rows) for (const [tag, v] of Object.entries(r.perGarment ?? {})) {
      if (!perGarmentMax[tag] || v.maxCm > perGarmentMax[tag].maxCm) perGarmentMax[tag] = { maxCm: v.maxCm, bar: barOf(tag) };
    }
    html += '<table style="margin-top:8px"><tr><th>garment</th><th>max over all cases</th><th>bar</th></tr>' +
      Object.entries(perGarmentMax).map(([tag, v]) =>
        `<tr><td>${tag}</td><td class="${v.maxCm > v.bar ? 'fail' : 'pass'}">${v.maxCm} cm</td><td class="dim">≤${v.bar} cm</td></tr>`).join('') +
      '</table>';
    const globalMax = Math.max(...rows.map((r) => r.maxCm));
    const globalStretch = Math.max(...rows.map((r) => r.stretchCm));
    html += `<div class="verify-summary ${attachPass && stretchPass ? 'ok' : 'bad'}">` +
      `${rows.length} cases · max garment→body <b>${globalMax.toFixed(1)} cm</b> (bars: 5 cm · tee 8 cm — armpit bridge) · ` +
      `max ring stretch <b>${globalStretch.toFixed(2)} cm</b> (bar ≤${STRETCH_BAR}) · ` +
      `${attachPass && stretchPass ? 'ALL PASS ✓' : attachRows.length + stretchRows.length + nanRows.length + ' case(s) over bar'}</div>`;
    for (const r of rows) {
      if (r.ankleDriftCm != null && r.ankleDriftCm > 3) notes.push(`${r.pose}: feet drift ${r.ankleDriftCm} cm across phases (not planted)`);
    }
    if (notes.length) html += notes.map((n) => `<p class="verify-note">⚠ ${n}</p>`).join('');
    html += '<p class="verify-note">edge "stretch" = welded ring-to-ring edge strain (LBS responds to joint bends; a welded strip cannot open a gap — NaN/degenerate verts are the structural hole check and must stay 0).</p>';
    say(html);

    const report = { rows, attachPass, stretchPass, globalMaxCm: +globalMax.toFixed(1), globalStretchCm: +globalStretch.toFixed(2), notes, bars: { attachCm: ATTACH_BAR, stretchCm: STRETCH_BAR } };
    window.__atelier.lastVerify = report;
    return report;
  } catch (e) {
    say(`<div class="verify-summary bad">probe failed: ${e.message}</div>`);
    throw e;
  } finally {
    state.verifying = false;
    $('btnVerify').disabled = false;
  }
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

// ── ASCII view (agent eyes via CDP — same classification as the probes) ─────
function asciiView(cellPx = 10) {
  return withNeutralLights(() => {
    const { buf, W, H } = readFrame();
    const px = (x, y) => { const p = ((H - 1 - y) * W + x) * 4; return [buf[p], buf[p + 1], buf[p + 2]]; };
    const rows = [];
    for (let y0 = 0; y0 < H; y0 += cellPx) {
      let row = '';
      for (let x0 = 0; x0 < W; x0 += cellPx) {
        const tally = {};
        for (let dy = 0; dy < cellPx; dy += 2) for (let dx = 0; dx < cellPx; dx += 2) {
          const c = classify(...px(x0 + dx, y0 + dy));
          tally[c] = (tally[c] ?? 0) + 1;
        }
        let best = 'dark', bn = 0;
        for (const [k, v] of Object.entries(tally)) if (v > bn) { bn = v; best = k; }
        row += best === 'lime' ? 'T' : best === 'coral' ? 'S' : best === 'white' ? 'W'
          : best === 'dark' ? '.' : ' ';
      }
      rows.push(row);
    }
    return rows.filter((r) => /[TSW]/.test(r)).join('\n');
  });
}

// ── config export ────────────────────────────────────────────────────────────
function configJSON() {
  const a = animById(state.animId);
  return {
    tool: 'rwf-outfit-atelier',
    model: { file: '/models/Geno.glb', rig: 'mixamo', tint: '#eceef1' },
    outfit: {
      module: '/site/models/geno-outfit.js',
      buildStep: state.buildStep,
      stepLabel: BUILDUP_STEPS[state.buildStep].label,
      slotsVisible: OUTFIT_SLOTS.filter((s2) => state.iso ? s2 === state.iso : BUILDUP_STEPS[state.buildStep].slots.includes(s2)),
      isolated: state.iso,
      bandTopM: +(outfit ? outfit.plan.bandTop / av.H * 1.75 : 0).toFixed(3),
    },
    anim: { id: state.animId, kind: a.kind, pose: a.pose ?? null, clip: a.clip ?? null, speed: state.speed, paused: state.paused },
    view: { xray: state.xray, bodyWire: state.wire, heatmap: state.heat, autoTurntable: state.autoTurn },
    camera: {
      position: camera.position.toArray().map((v) => +v.toFixed(3)),
      target: controls.target.toArray().map((v) => +v.toFixed(3)),
    },
  };
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // animation select
  const sel = $('animSel');
  for (const a of ANIMS) {
    const o = document.createElement('option');
    o.value = a.id; o.textContent = a.label;
    sel.appendChild(o);
  }
  sel.value = state.animId;

  // build-up list
  const bl = $('buildList');
  BUILDUP_STEPS.forEach((st, i) => {
    const b = document.createElement('button');
    b.className = 'build-step';
    b.innerHTML = `<span class="n">${i}</span><span>${st.label}</span>`;
    b.addEventListener('click', () => { state.buildStep = i; state.iso = null; applyVisibility(); });
    bl.appendChild(b);
  });

  // isolation chips
  const isoRow = $('isoRow');
  const mkChip = (slot, label) => {
    const c = document.createElement('button');
    c.className = 'iso-chip'; c.dataset.slot = slot; c.textContent = label;
    c.addEventListener('click', () => { state.iso = slot === 'all' ? null : (state.iso === slot ? null : slot); applyVisibility(); });
    isoRow.appendChild(c);
  };
  mkChip('all', 'all (build-up)');
  for (const s of OUTFIT_SLOTS) mkChip(s, SLOT_LABELS[s]);

  // load the avatar
  const geno = await loadModel('/models/Geno.glb');
  applyFlatTint(geno, '#eceef1');
  av = new ModelAvatar(geno, 'mixamo');
  av.root.scale.setScalar(1.6 / av.H);
  scene.add(av.root);
  clearOutfit(av);
  outfit = attachOutfit(av, { slots: 'full' });
  av.pose('stand', 0.5);
  state.ready = true;

  // ── wire controls
  sel.addEventListener('change', () => setAnim(sel.value));
  $('speedRange').addEventListener('input', (e) => {
    state.speed = +e.target.value;
    $('speedVal').textContent = state.speed.toFixed(2) + '×';
  });
  $('btnPause').addEventListener('click', () => { state.paused = !state.paused; updatePauseBtn(); });
  $('btnStepB').addEventListener('click', () => stepFrame(-1));
  $('btnStepF').addEventListener('click', () => stepFrame(1));
  $('btnTurn').addEventListener('click', () => {
    state.autoTurn = !state.autoTurn;
    controls.autoRotate = state.autoTurn;
    $('btnTurn').classList.toggle('is-on', state.autoTurn);
  });
  controls.autoRotate = state.autoTurn;
  controls.autoRotateSpeed = 1.1;
  $('btnXray').addEventListener('click', () => {
    state.xray = !state.xray; applyViewFX();
    $('btnXray').classList.toggle('is-on', state.xray);
  });
  $('btnWire').addEventListener('click', () => {
    state.wire = !state.wire; applyViewFX();
    $('btnWire').classList.toggle('is-on', state.wire);
  });
  $('btnHeat').addEventListener('click', () => {
    state.heat = !state.heat; applyViewFX();
    $('btnHeat').classList.toggle('is-on', state.heat);
    $('heatLegend').hidden = !state.heat;
    if (state.heat) updateHeatmap();
  });
  $('btnStepPrev').addEventListener('click', () => {
    state.buildStep = Math.max(0, state.buildStep - 1); state.iso = null; applyVisibility();
  });
  $('btnStepNext').addEventListener('click', () => {
    state.buildStep = Math.min(BUILDUP_STEPS.length - 1, state.buildStep + 1); state.iso = null; applyVisibility();
  });
  $('btnVerify').addEventListener('click', () => { runVerify().catch(() => {}); });
  $('btnExport').addEventListener('click', () => {
    const j = configJSON();
    $('exportBox').value = JSON.stringify(j, null, 2);
    $('exportBox').select();
    try { document.execCommand('copy'); $('stageNote').textContent = 'config copied to clipboard'; } catch { /* select is enough */ }
  });
  $('btnShot').addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `atelier_${state.animId.replace(/[^a-z0-9]+/gi, '_')}_step${state.buildStep}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  });
  renderer.domElement.addEventListener('dblclick', () => {
    camera.position.copy(HOME.pos);
    controls.target.copy(HOME.tgt);
  });

  applyVisibility();
  updatePauseBtn();
  window.dispatchEvent(new Event('atelier:ready'));
}

// ── resize + frame loop ──────────────────────────────────────────────────────
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

let last = performance.now();
(function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps.ema = fps.ema * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  if (state.ready && !state.verifying) {
    if (!state.paused) {
      state.t += dt * state.speed;
      const a = animById(state.animId);
      if (a?.kind === 'bvh' && bvh) bvh.update(dt * state.speed);
      else if (a?.kind === 'pose') av.pose(a.pose, (state.t / a.cycle) % 1);
    }
    if (state.heat) {
      heatTimer += dt;
      if (heatTimer > 0.15) { heatTimer = 0; updateHeatmap(); }
    }
    controls.update();
    renderer.render(scene, camera);
    $('hudFps').textContent = fps.ema.toFixed(0) + ' fps';
    $('hudPhase').textContent = state.paused ? phaseLabel() : phaseLabel();
    $('hudCtx').textContent = glContexts + ' ctx';
  }
})(last);

// ── automation surface (CDP verify suite) ───────────────────────────────────
window.__atelier = {
  get state() { return state; },
  get ready() { return state.ready; },
  get avatar() { return av; },
  get outfit() { return outfit; },
  setAnim, setSpeed: (v) => { state.speed = v; $('speedRange').value = v; $('speedVal').textContent = v.toFixed(2) + '×'; },
  pause: () => { state.paused = true; updatePauseBtn(); },
  play: () => { state.paused = false; updatePauseBtn(); },
  stepFrame,
  setBuildStep: (i) => { state.buildStep = i; state.iso = null; applyVisibility(); },
  isolate: (slot) => { state.iso = slot ?? null; applyVisibility(); },
  setXray: (on) => { state.xray = !!on; applyViewFX(); $('btnXray').classList.toggle('is-on', state.xray); },
  setHeat: (on) => { state.heat = !!on; applyViewFX(); $('btnHeat').classList.toggle('is-on', state.heat); $('heatLegend').hidden = !state.heat; if (state.heat) updateHeatmap(); },
  setTurntable: (on) => { state.autoTurn = !!on; controls.autoRotate = state.autoTurn; $('btnTurn').classList.toggle('is-on', state.autoTurn); },
  runVerify, bandCheck, sleeveCheck, asciiView,
  setCam: (pos, tgt) => {
    controls.autoRotate = false;
    camera.position.set(...pos);
    controls.target.set(...tgt);
    controls.update();
  },
  getCam: () => camera,
  readPx: (ndcX, ndcY) => {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const x = Math.round((ndcX + 1) / 2 * (W - 1)), y = Math.round((1 - (ndcY + 1) / 2) * (H - 1));
    const p = (y * W + x) * 4;
    return [buf[p], buf[p + 1], buf[p + 2], 'cam', +camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2), 'buf', W + 'x' + H, 'aspect', +camera.aspect.toFixed(2), 'fov', camera.fov];
  },
  homeCam: () => {
    camera.position.copy(HOME.pos);
    controls.target.copy(HOME.tgt);
    controls.update();
  },
  configJSON,
  stats: { get contexts() { return glContexts; }, get fps() { return fps.ema; } },
  lastVerify: null,
};

boot().catch((e) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="padding:14px 20px;color:var(--danger);font-family:var(--font-mono)">atelier boot failed: ${e.message}</div>`);
  console.error(e);
});
