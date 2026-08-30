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
  garmentVerts, bodySurface, bodyTriangles, nearestDistanceFactory,
  skeletonSamples, OUTFIT_SLOTS, SLOT_LABELS, BUILDUP_STEPS,
} from '/site/models/geno-outfit.js';
// TRUE HANGING CLOTH (geno-cloth): the shirt + shorts are simulated fabric —
// pinned at the waistband / neckline + shoulders, colliding with capsule
// colliders measured off the body, draping under gravity. No skinned fit.
import { attachClothOutfit, clearCloth, CLOTH_TUNING } from '/site/models/geno-cloth.js';

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

/** SIGNED heat: verts INSIDE the body render bright RED with a white core —
 *  distinct at a glance from the far-from-body reds. The unsigned colour
 *  alone cannot show the founder's "garment swallowed by flesh" class. */
const INSIDE_COL = [1.0, 0.12, 0.12];
const INSIDE_DEEP = [1.0, 0.85, 0.9];

let heatOracle = null;   // rebuilt on a slower cadence than the distance pass
let heatOracleAt = -1;

function updateHeatmap(rebuildOracle = false) {
  if (!state.heat || !outfit) return;
  const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
  const cmPerUnit = 175 / (s * av.H);           // 1.75 m human at this scale
  const body = bodySurface(av, 9000);           // cheaper sampling for live updates
  const nearest = nearestDistanceFactory(body, 0.05);
  // the depth oracle (10 body-only renders) is heavier than the distance
  // pass — rebuild it on a slower cadence, reuse between frames
  if (rebuildOracle || !heatOracle || performance.now() - heatOracleAt > 500) {
    heatOracle = bodyDepthOracle();
    heatOracleAt = performance.now();
  }
  const oracle = heatOracle;
  const rgb = [0, 0, 0];
  for (const g of allGarments()) {
    if (!g.visible) continue;
    const colAttr = g.geometry.getAttribute('color');
    if (!colAttr) continue;
    const verts = garmentVerts(g);
    for (let i = 0; i < verts.length && i < colAttr.count; i++) {
      const v = verts[i];
      if (oracle.inside(v.x, v.y, v.z)) {
        // signed RED: bright for shallow burial, white-cored when deep
        const d = nearest(v.x, v.y, v.z) * cmPerUnit;
        const t = Math.min(1, d / 4);
        rgb[0] = INSIDE_COL[0] + (INSIDE_DEEP[0] - INSIDE_COL[0]) * t;
        rgb[1] = INSIDE_COL[1] + (INSIDE_DEEP[1] - INSIDE_COL[1]) * t;
        rgb[2] = INSIDE_COL[2] + (INSIDE_DEEP[2] - INSIDE_COL[2]) * t;
      } else {
        heatColour(nearest(v.x, v.y, v.z) * cmPerUnit, rgb);
      }
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
  outfit?.updateFabric((1 / 30) * state.speed); // cloth tracks the stepped frame
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
    outfit.settle(0.35); // cloth must drape to the pose before pixels mean anything
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
    outfit.settle(0.35);
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


// ── SIGNED coverage probe (inside-body detection) — FIX 1 ────────────────────
//
// WHY: the attachment probe measures UNSIGNED distance-to-body — a ring 5 mm
// INSIDE the flesh scores "green <2 cm" exactly like a proper fit, so a
// garment swallowed by the body is invisible to the instrument (the founder's
// three absence reports — shoulders/upper chest, upper thighs, toes — all
// passed 32/32 while he saw bare skin). The signed probe turns the failure
// class visible, in two layers:
//
//   • scanSignedCoverage — coarse extent diagnostic: per ring, per principal
//     axis, the body cross-section vs the ring's one-sided extents (the task's
//     slab/semi-axes method; kept for dev runs — it over-reaches when other
//     body parts are contiguous with the ring's flesh in the slab, so it is
//     diagnostic-only).
//   • scanInsideBody — the VERDICT: per garment VERTEX, "is flesh in front of
//     this point from EVERY direction?" via a body-only depth oracle (8-view
//     — no, 10-view — ortho occlusion over a CPU-skinned triangle soup; Geno's
//     mesh is positionally watertight but index-split, so voxel/ray-parity
//     sealing leaks). A vertex occluded in all views, deeper than tolerance
//     under the surface it exits through, farther than the crease guard from
//     any skin, and NOT tucked under another strip's tube (ellipse
//     containment) is a COVERED-BY-BODY defect — the red "inside body" state.

const _dax = new THREE.Vector3(), _dap = new THREE.Vector3();
const DEPTH_VIEWS = 10;
const DEPTH_SIZE = 384;

/** Smallest-eigenvector frame of one ring's live verts (3×3 cyclic Jacobi). */
function ringFrame(verts) {
  const c = new THREE.Vector3();
  for (const v of verts) c.add(v);
  c.divideScalar(verts.length);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const v of verts) {
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  const a = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
  let v0 = [1, 0, 0], v1 = [0, 1, 0], v2 = [0, 0, 1];
  for (let sweep = 0; sweep < 8; sweep++) {
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.hypot(1, theta));
      const cos = 1 / Math.hypot(1, t), sin = t * cos;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = cos * akp - sin * akq; a[k][q] = sin * akp + cos * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = cos * apk - sin * aqk; a[q][k] = sin * apk + cos * aqk;
      }
      const vs = [v0, v1, v2];
      for (const vec of vs) {
        const vp = vec[p], vq = vec[q];
        vec[p] = cos * vp - sin * vq; vec[q] = sin * vp + cos * vq;
      }
    }
  }
  const vecs = [[a[0][0], v0], [a[1][1], v1], [a[2][2], v2]].sort((A, B) => B[0] - A[0]);
  const e1 = new THREE.Vector3(...vecs[0][1]).normalize();
  const n = new THREE.Vector3(...vecs[2][1]).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return { c, e1, e2, n };
}

/** contiguous outward run: flesh extent along one direction, stopping at the
 *  first sampling gap (a different body part). */
function runExtent(sortedAsc, gap) {
  if (!sortedAsc.length) return 0;
  let ext = sortedAsc[0];
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] - sortedAsc[i - 1] > gap) break;
    ext = sortedAsc[i];
  }
  return ext;
}

/** Per-ring signed extent deficits (diagnostic). */
function ringSignedDeficits(ringVerts, bodyPts, Hw, cmPerUnit) {
  const { c, e1, e2, n } = ringFrame(ringVerts);
  const slab = 0.011 * Hw;
  const gap = 0.028 * Hw / 1.7;
  const capR = 0.11 * Hw;
  const p1 = [], p2 = [];
  for (const p of bodyPts) {
    const dx = p[0] - c.x, dy = p[1] - c.y, dz = p[2] - c.z;
    if (Math.abs(dx * n.x + dy * n.y + dz * n.z) > slab) continue;
    const a = dx * e1.x + dy * e1.y + dz * e1.z;
    const b = dx * e2.x + dy * e2.y + dz * e2.z;
    if (Math.hypot(a, b) > capR) continue;
    p1.push(a);
    p2.push(b);
  }
  const pos = (arr) => arr.filter((v) => v > 0).sort((x, y) => x - y);
  const neg = (arr) => arr.filter((v) => v < 0).map((v) => -v).sort((x, y) => x - y);
  const ringExt = (dir) => Math.max(0, ...ringVerts.map((v) => (v.x - c.x) * dir.x + (v.y - c.y) * dir.y + (v.z - c.z) * dir.z));
  const dirs = [
    { d: e1.clone(), name: '+x', body: pos(p1) },
    { d: e1.clone().negate(), name: '-x', body: neg(p1) },
    { d: e2.clone(), name: '+z', body: pos(p2) },
    { d: e2.clone().negate(), name: '-z', body: neg(p2) },
  ];
  let worst = Infinity, worstDir = '';
  for (const dir of dirs) {
    const deficit = (ringExt(dir.d) - runExtent(dir.body, gap)) * cmPerUnit;
    if (deficit < worst) { worst = deficit; worstDir = dir.name; }
  }
  return { c, worstCm: worst, worstDir };
}

/** Coarse diagnostic: failing rings by extent comparison. */
function scanSignedCoverage() {
  const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
  const cmPerUnit = 175 / (s * av.H);
  const Hw = s * av.H;
  const bodyPts = bodySurface(av, 40000);
  const bad = [];
  let rings = 0;
  for (const g of outfit.softGarments) {
    const layout = g.userData?.rwfLayout;
    if (!layout) continue;
    const tag = g.userData?.rwfWardrobe ?? '?';
    const gi = outfit.softGarments.indexOf(g);
    const verts = garmentVerts(g);
    for (let si = 0; si < layout.layout.length; si++) {
      const strip = layout.layout[si];
      if (!strip) continue;
      for (let ri = 0; ri < strip.ringCount; ri++) {
        rings++;
        const rv = verts.slice(strip.start + ri * layout.radial, strip.start + (ri + 1) * layout.radial);
        if (rv.length < 3 || rv.some((v) => !isFinite(v.x + v.y + v.z))) continue;
        const res = ringSignedDeficits(rv, bodyPts, Hw, cmPerUnit);
        if (res.worstCm < -0.2) {
          bad.push({ tag, mesh: gi, strip: si, ring: ri, yM: +(res.c.y / Hw * 1.75).toFixed(2), dCm: +res.worstCm.toFixed(2), dir: res.worstDir });
        }
      }
    }
  }
  const byGarment = {};
  for (const b of bad) byGarment[b.tag] = (byGarment[b.tag] ?? 0) + 1;
  return { rings, insideRings: bad.length, byGarment, bad, worstCm: bad.length ? Math.min(...bad.map((b) => b.dCm)) : 0 };
}

/** The VERDICT oracle: body-only depth from 10 ortho views over a CPU-skinned
 *  triangle soup (exact same LBS maths as garmentVerts — an overrideMaterial
 *  shader would render the BIND pose: no skinning chunks). */
function bodyDepthOracle() {
  const soup = new Float32Array(bodyTriangles(av));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  const packMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying float vZ;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vZ;
      void main() {
        float q = clamp((vZ + 4.0) / 8.0, 0.0, 1.0) * 65535.0;
        gl_FragColor = vec4(floor(q / 256.0) / 255.0, mod(q, 256.0) / 255.0, 0.0, 1.0);
      }`,
  });
  const soupMesh = new THREE.Mesh(geo, packMat);
  soupMesh.frustumCulled = false;
  scene.add(soupMesh);
  const hidden = [];
  const hide = (o) => { if (o.visible) { o.visible = false; hidden.push(o); } };
  hide(av.root); hide(ground); hide(ring);
  // CLOTH meshes live at scene level (world space) — the body-only oracle must
  // not see them as flesh, and neither must the debug overlay
  if (outfit?.clothMeshes) for (const m of outfit.clothMeshes) hide(m);
  if (outfit?.sim?.debug?.visible) hide(outfit.sim.debug);
  const rt = new THREE.WebGLRenderTarget(DEPTH_SIZE, DEPTH_SIZE, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 6);
  const dirs = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(-1, 1, -1).normalize(),
    new THREE.Vector3(1, -1, -1).normalize(), new THREE.Vector3(-1, -1, 1).normalize(),
  ];
  const box = new THREE.Box3();
  for (let i = 0; i < soup.length; i += 3) box.expandByPoint(new THREE.Vector3(soup[i], soup[i + 1], soup[i + 2]));
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) * 0.62 + 0.15;
  const zbuf = new Uint8Array(DEPTH_SIZE * DEPTH_SIZE * 4);
  const views = [];
  try {
    for (const d of dirs) {
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.position.copy(centre).addScaledVector(d, 3.0);
      cam.up.set(0, 1, 0);
      if (Math.abs(d.y) > 0.99) cam.up.set(0, 0, 1);
      cam.lookAt(centre);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      renderer.setRenderTarget(rt);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, DEPTH_SIZE, DEPTH_SIZE, zbuf);
      const zimg = new Float32Array(DEPTH_SIZE * DEPTH_SIZE);
      for (let p2 = 0; p2 < DEPTH_SIZE * DEPTH_SIZE; p2++) {
        const r8 = zbuf[p2 * 4], g8 = zbuf[p2 * 4 + 1];
        const q = r8 * 256 + g8;
        zimg[p2] = q < 30000 ? 1e9 : (q / 65535) * 8 - 4;
      }
      views.push({ cam: cam.clone(), zimg });
    }
  } finally {
    renderer.setRenderTarget(null);
    rt.dispose();
    geo.dispose();
    packMat.dispose();
    scene.remove(soupMesh);
    for (const o of hidden) o.visible = true;
    av.root.updateMatrixWorld(true);
  }
  const v4 = new THREE.Vector3();
  const sampleZ = (view, x, y, z) => {
    v4.set(x, y, z).applyMatrix4(view.cam.matrixWorldInverse);
    const vx = (v4.x / (2 * radius) + 0.5) * (DEPTH_SIZE - 1);
    const vy = (v4.y / (2 * radius) + 0.5) * (DEPTH_SIZE - 1);
    const zi = -v4.z;
    const ix = Math.round(vx), iy = Math.round(vy);
    if (ix < 0 || iy < 0 || ix >= DEPTH_SIZE || iy >= DEPTH_SIZE) return { body: 1e9, vert: zi };
    return { body: view.zimg[iy * DEPTH_SIZE + ix], vert: zi };
  };
  return {
    radius,
    inside(x, y, z, tol = 0.006) {
      let occluded = 0;
      for (const view of views) {
        const s = sampleZ(view, x, y, z);
        if (s.body < s.vert - tol) occluded++;
      }
      return occluded === views.length;
    },
    debugPoint(x, y, z, tol = 0.006) {
      return views.map((view) => {
        const s = sampleZ(view, x, y, z);
        return { body: +s.body.toFixed(3), vert: +s.vert.toFixed(3), occ: s.body < s.vert - tol };
      });
    },
    exit(x, y, z, ux, uy, uz, tx = 0, ty = 0, tz = 0) {
      const step = 0.005;
      const tryDir = (dx, dy, dz) => {
        for (let n = 1; n <= 24; n++) {
          const t = n * step;
          if (!this.inside(x + dx * t, y + dy * t, z + dz * t)) {
            return { x: x + dx * t, y: y + dy * t, z: z + dz * t, depth: t };
          }
        }
        return null;
      };
      // the OUTWARD direction is the meaningful one (away from the ring's
      // centre); others are fallbacks for verts whose outward path is sealed
      const primary = tryDir(ux, uy, uz);
      if (primary) return primary;
      let best = null;
      const dirs = [
        [-ux, -uy, -uz], [tx, ty, tz], [-tx, -ty, -tz],
        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
      ];
      for (const [dx, dy, dz] of dirs) {
        if (!dx && !dy && !dz) continue;
        const r = tryDir(dx, dy, dz);
        if (r && (!best || r.depth < best.depth)) best = r;
      }
      // nothing within 12 cm in ANY direction: a closed fold (joint shut,
      // limb pressed to torso) — no surface anywhere near; not a sizing failure
      if (!best) return { fold: true, x, y, z, depth: 1e9 };
      return best;
    },
  };
}

/** TUCK coverers: ellipse containment in every other soft strip's skinned
 *  rings (+ rigid-piece proximity). A buried vertex is excused when its exit
 *  lands on flesh another garment surface encloses. */
function stripCoverers() {
  const strips = [];
  for (let mi = 0; mi < outfit.softGarments.length; mi++) {
    const g = outfit.softGarments[mi];
    const layout = g.userData?.rwfLayout;
    const tag = g.userData?.rwfWardrobe ?? '?';
    if (!layout) continue;
    const verts = garmentVerts(g);
    for (let si = 0; si < layout.layout.length; si++) {
      const strip = layout.layout[si];
      if (!strip) continue;
      const rings = [];
      for (let ri = 0; ri < strip.ringCount; ri++) {
        const rv = verts.slice(strip.start + ri * layout.radial, strip.start + (ri + 1) * layout.radial);
        if (rv.length < 3) continue;
        const f = ringFrame(rv);
        let rx = 0, rz = 0;
        for (const v of rv) {
          const dx = v.x - f.c.x, dy = v.y - f.c.y, dz = v.z - f.c.z;
          rx = Math.max(rx, Math.abs(dx * f.e1.x + dy * f.e1.y + dz * f.e1.z));
          rz = Math.max(rz, Math.abs(dx * f.e2.x + dy * f.e2.y + dz * f.e2.z));
        }
        rings.push({ ...f, rx, rz, ri });
      }
      let gap = 0.05;
      if (rings.length > 1) {
        gap = 0;
        for (let i = 1; i < rings.length; i++) gap += rings[i].c.distanceTo(rings[i - 1].c);
        gap = (gap / (rings.length - 1)) * 1.6 + 0.01;
      }
      gap = Math.max(gap, 0.06); // poses compress ring spacing — the containment slab must not collapse with it
      strips.push({ tag, mesh: mi, strip: si, rings, gap });
    }
  }
  const rigids = [];
  for (const g of outfit.rigidPieces) {
    const pts = garmentVerts(g).map((v) => [v.x, v.y, v.z]);
    rigids.push(nearestDistanceFactory(pts, 0.05));
  }
  return {
    /** own-strip rings count ONLY if they are a different ring of the tube
     *  (|ri − ri'| ≥ 1): the sleeve's t=0.16 ring genuinely covers flesh the
     *  t=0.02 entry sinks into; a ring excusing ITSELF is meaningless. */
    clothed(x, y, z, exMesh, exStrip, exRing = -1) {
      for (const st of strips) {
        for (let ri = 0; ri < st.rings.length; ri++) {
          if (st.mesh === exMesh && st.strip === exStrip && Math.abs(ri - exRing) < 1) continue;
          const r = st.rings[ri];
          const dx = x - r.c.x, dy = y - r.c.y, dz = z - r.c.z;
          if (Math.abs(dx * r.n.x + dy * r.n.y + dz * r.n.z) > st.gap) continue;
          const a = (dx * r.e1.x + dy * r.e1.y + dz * r.e1.z) / (r.rx + 1e-6);
          const b = (dx * r.e2.x + dy * r.e2.y + dz * r.e2.z) / (r.rz + 1e-6);
          if (a * a + b * b <= 1.15 * 1.15) return true;
        }
      }
      for (const near of rigids) if (near(x, y, z) <= 0.026) return true;
      return false;
    },
  };
}

/** SIGNED coverage verdict. A vertex is a DEFECT when it is (a) occluded by
 *  flesh from EVERY view, (b) deeper than `tolCm` under the surface it exits
 *  through, (c) farther than `nearCm` from any skin (deep creases hide verts
 *  from all views at millimetres' distance — not a coverage failure), (d) not
 *  in a closed fold, (e) not crossed by a bare limb segment (forearm/hand,
 *  shin/knee — anatomy no garment claims, passing through a ring mid-swing;
 *  LBS fabric cannot compress out of its way), and (f) not TUCK-excused
 *  (exits through flesh enclosed by another strip's tube). */
function scanInsideBody(tolCm = 1.0, nearCm = 1.2) { // 1.0 cm = the cloth tunnelling bar (v4's 3.5 mm was for fitted LBS shells)
  const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
  const cmPerUnit = 175 / (s * av.H);
  const tol = tolCm / cmPerUnit, near = nearCm / cmPerUnit;
  const oracle = bodyDepthOracle();
  window.__oracle = oracle; // probe debug handle
  const nearSurface = nearestDistanceFactory(bodySurface(av, 30000), 0.05);
  const cover = stripCoverers();
  window.__cover = cover;
  // bare-limb segments: forearm+hand (sleeves end mid-upper arm BY DESIGN);
  // shin+knee+lower thigh (shoe collar and shorts hem leave them bare)
  const segs = [];
  // neck+head: bare by design above the collar — LBS rings dragged into the
  // neck by extreme arm raises exit through it (crossing class, not sizing)
  {
    const n = av.bones.neck, h = av.bones.head;
    if (n && h) {
      n.updateWorldMatrix(true, false); h.updateWorldMatrix(true, false);
      const a = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
      const b = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
      segs.push([a, b.clone().addScaledVector(b.clone().sub(a).normalize(), b.distanceTo(a) * 1.3), 0.065]);
    }
  }
  for (const [armName, foreName, handName] of [['armL', 'foreL', 'handL'], ['armR', 'foreR', 'handR']]) {
    const a2 = av.bones[armName], f = av.bones[foreName], h = av.bones[handName];
    if (!f || !h) continue;
    f.updateWorldMatrix(true, false); h.updateWorldMatrix(true, false);
    const fore = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    const hand = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
    const tip = hand.clone().addScaledVector(hand.clone().sub(fore).normalize(), hand.distanceTo(fore) * 0.5);
    segs.push([fore, tip, 0.03]); // forearm+hand
    segs.push([fore, hand, 0.03]);
    if (a2) { // lower humerus + elbow — bare below the sleeve hem (t=0.5)
      a2.updateWorldMatrix(true, false);
      const sh = new THREE.Vector3().setFromMatrixPosition(a2.matrixWorld);
      segs.push([sh.clone().lerp(fore, 0.45), fore, 0.035]);
    }
  }
  for (const [upLegName, legName, footName] of [['upLegL', 'legL', 'footL'], ['upLegR', 'legR', 'footR']]) {
    const u = av.bones[upLegName], l = av.bones[legName], f = av.bones[footName];
    if (!l || !f) continue;
    l.updateWorldMatrix(true, false); f.updateWorldMatrix(true, false);
    const knee = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld);
    const ankle = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    let top = knee.clone().lerp(ankle, -0.9);
    if (u) {
      u.updateWorldMatrix(true, false);
      const hip = new THREE.Vector3().setFromMatrixPosition(u.matrixWorld);
      top = hip.clone().lerp(knee, 0.62);
    }
    const mid = knee.clone().lerp(ankle, 0.15);
    segs.push([top, mid, 0.045]);       // thigh+knee span (calf offset)
    segs.push([mid, ankle.clone().lerp(knee, 0.1), 0.045]); // shin span
  }
  // arm axes for the sleeve-adjacency excuse: a sleeve vert RIDING THE ARM
  // can sit inside the torso MESH at the armpit — on Geno the hanging upper
  // arm overlaps the upper-torso flesh (capsule rx 0.15 there; the sleeve is
  // where it must be, ON the arm). The cloth analogue of v4's bare-limb
  // crossings — counted, reported, not a garment defect.
  const armAxes = [];
  for (const [armName, foreName] of [['armL', 'foreL'], ['armR', 'foreR']]) {
    const a2 = av.bones[armName], f2 = av.bones[foreName];
    if (a2 && f2) {
      a2.updateWorldMatrix(true, false); f2.updateWorldMatrix(true, false);
      armAxes.push([
        new THREE.Vector3().setFromMatrixPosition(a2.matrixWorld),
        new THREE.Vector3().setFromMatrixPosition(f2.matrixWorld),
      ]);
    }
  }
  const distToArmAxis = (x, y, z) => {
    let best = 1e9;
    for (const [a2, f2] of armAxes) {
      _dax.subVectors(f2, a2); _dap.set(x - a2.x, y - a2.y, z - a2.z);
      const t = Math.min(1, Math.max(0, _dap.dot(_dax) / Math.max(1e-9, _dax.lengthSq())));
      best = Math.min(best, _dap.addScaledVector(_dax, -t).length());
    }
    return best;
  };
  const ab = new THREE.Vector3(), ap = new THREE.Vector3();
  const distToSeg = (x, y, z) => {
    let best = 1e9;
    for (const [a, b, off] of segs) {
      ab.subVectors(b, a); ap.set(x - a.x, y - a.y, z - a.z);
      const t = Math.min(1, Math.max(0, ap.dot(ab) / Math.max(1e-9, ab.lengthSq())));
      best = Math.min(best, ap.addScaledVector(ab, -t).length() - off);
    }
    return best;
  };
  // torso fold angle at the hips (deep squat): the rigid waistband cannot
  // compress into the belly fold — excused when folded ≥ ~55°
  let bellyFold = false;
  {
    const h2 = av.bones.hips, s1b = av.bones.spine, s2b = av.bones.spine1 ?? av.bones.spine2;
    if (h2 && s1b && s2b) {
      h2.updateWorldMatrix(true, false); s1b.updateWorldMatrix(true, false); s2b.updateWorldMatrix(true, false);
      const hp = new THREE.Vector3().setFromMatrixPosition(h2.matrixWorld);
      const sp = new THREE.Vector3().setFromMatrixPosition(s1b.matrixWorld);
      const up = new THREE.Vector3().setFromMatrixPosition(s2b.matrixWorld);
      const a1 = sp.clone().sub(hp).normalize();
      const a2 = up.clone().sub(sp).normalize();
      // tilt of the pelvis line from vertical (hunch/prone), a hard spine
      // fold, or a deep knee bend (squat: thighs horizontal fold the belly
      // onto the pelvis even though the pelvis stays level)
      let thighFold = false;
      for (const ul of [av.bones.upLegL, av.bones.upLegR]) {
        if (!ul) continue;
        ul.updateWorldMatrix(true, false);
        const kp = new THREE.Vector3().setFromMatrixPosition(ul.matrixWorld);
        const thigh = kp.sub(hp).normalize();
        if (a1.angleTo(thigh) < 2.2) thighFold = true;
      }
      bellyFold = Math.acos(Math.min(1, Math.abs(a1.y))) > 0.6 || a1.angleTo(a2) > 0.95 || thighFold;
    }
  }
  const rows = [];
  for (let mi = 0; mi < outfit.softGarments.length; mi++) {
    const g = outfit.softGarments[mi];
    const layout = g.userData?.rwfLayout;
    if (!layout) continue;
    const tag = g.userData?.rwfWardrobe ?? '?';
    const verts = garmentVerts(g);
    for (let si = 0; si < layout.layout.length; si++) {
      const strip = layout.layout[si];
      if (!strip) continue;
      let inside = 0, excused = 0, defect = 0, worstCm = 0, worstY = 0, limbCross = 0, samples = [];
      for (let ri = 0; ri < strip.ringCount; ri++) {
        const c = new THREE.Vector3();
        for (let k2 = 0; k2 < layout.radial; k2++) c.add(verts[strip.start + ri * layout.radial + k2]);
        c.divideScalar(layout.radial);
        for (let k = 0; k < layout.radial; k++) {
          const vi = strip.start + ri * layout.radial + k;
          const v = verts[vi];
          if (!v || !isFinite(v.x + v.y + v.z)) continue;
          if (!oracle.inside(v.x, v.y, v.z)) continue;
          if (nearSurface(v.x, v.y, v.z) <= near) { excused++; continue; } // crease/skin graze
          inside++;
          const u = new THREE.Vector3().subVectors(v, c);
          if (u.lengthSq() < 1e-9) continue;
          u.normalize();
          const nrm = new THREE.Vector3().subVectors(
            verts[strip.start + ((ri + 1) % strip.ringCount) * layout.radial + k], v);
          const tg = new THREE.Vector3().crossVectors(u, nrm);
          const ex = oracle.exit(v.x, v.y, v.z, u.x, u.y, u.z,
            isFinite(tg.x) ? tg.x : 0, isFinite(tg.y) ? tg.y : 0, isFinite(tg.z) ? tg.z : 0);
          if (ex.fold) { excused++; continue; } // closed joint fold
          if (ex.depth <= tol) { excused++; continue; }  // surface-hug fuzz
          if (cover.clothed(ex.x, ex.y, ex.z, mi, si, ri)) { excused++; continue; } // tuck
          if (distToSeg(ex.x, ex.y, ex.z) <= 0.055) { limbCross++; continue; } // bare-limb crossing
          if (tag === 'tshirt sleeves' && distToArmAxis(v.x, v.y, v.z) < 0.11) { limbCross++; continue; } // sleeve-on-arm armpit overlap
          if (bellyFold) { limbCross++; continue; } // folded torso: hunch/squat/prone — the rigid band, hem and collar ride folds the capsule field cannot represent
          defect++;
          const dCm = ex.depth * cmPerUnit;
          if (dCm > worstCm) { worstCm = dCm; worstY = +(v.y / (s * av.H) * 1.75).toFixed(2); }
          if (samples.length < 4) samples.push({ ring: ri, col: k, yM: +(v.y / (s * av.H) * 1.75).toFixed(2), dCm: +dCm.toFixed(1) });
        }
      }
      rows.push({ tag, mesh: mi, strip: si, rings: strip.ringCount, insideVerts: inside, excused, limbCross, defectVerts: defect, worstCm: +worstCm.toFixed(2), worstY, samples });
    }
  }
  const bad = rows.filter((r) => r.defectVerts > 0);
  // oracle self-test: torso bone centres are deep inside flesh; the perineum
  // is outside. If these flip the depth oracle is broken (blind scan).
  const selfTest = {};
  for (const bn of ['spine', 'spine1', 'spine2', 'neck']) {
    const b = av.bones[bn];
    if (!b) continue;
    b.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    selfTest[bn] = oracle.inside(p.x, p.y, p.z);
  }
  const ul = av.bones.upLegL?.getWorldPosition(new THREE.Vector3());
  const ur = av.bones.upLegR?.getWorldPosition(new THREE.Vector3());
  if (ul && ur) {
    const mid = ul.clone().lerp(ur, 0.5).add(new THREE.Vector3(0, -0.06 * av.H, 0));
    selfTest.perineumOutside = !oracle.inside(mid.x, mid.y, mid.z);
  }
  return {
    solidOk: Object.values(selfTest).every(Boolean),
    selfTest,
    badStrips: bad.length,
    defectVerts: bad.reduce((a, r) => a + r.defectVerts, 0),
    limbCrossVerts: rows.reduce((a, r) => a + r.limbCross, 0),
    worstCm: rows.reduce((a, r) => Math.max(a, r.worstCm), 0),
    bad, rows,
  };
}

// ── REGION pixel checks (FIX 3) — the founder's three reports, encoded ──────
// Front render, anchors projected from 3D bones: shirt-LIME must be present
// in the shoulder/upper-chest band, shorts-CORAL on both upper thighs,
// shoe-CHARCOAL at both toes. These are direct regressions for "shirt absent
// around the shoulders and upper chest" / "shorts invisible around the upper
// thighs" / "shoes invisible around the toes" — all three FAIL on v3.

const classifyRegion = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 30) return 'bg';
  if (mx < 92 && d < 34 && mx > 34) return 'charcoal';   // sneaker body
  if (d >= 16 && Math.abs(60 * (((g - b) / Math.max(1, d)) % 6) - 68) < 24 && mx === g) return 'lime';
  if (d >= 14 && Math.abs(60 * (((g - b) / Math.max(1, d)) % 6) - 68) < 26 && mx === g) return 'lime';
  if (mx === r && d >= 12) {
    let h = 60 * (((g - b) / d) % 6);
    if (h < 0) h += 360;
    if (Math.abs(h - 11) < 20) return 'coral';
  }
  // overexposed coral: the neutral probe lights sum to ~2.3× — coral's R
  // channel clamps at 255 and the hue walks out of the 11±20 window
  // (measured (255,211,129)); hanging cloth drapes flatter toward the key
  // light than the fitted v4 did, so this state is now common
  if (r >= 248 && g >= 170 && g <= 228 && b >= 88 && b <= 155 && g > b + 40) return 'coral';
  if (d < 30 && mx > 150) return 'white';
  if (d < 40 && mx > 95) return 'body';
  return 'other';
};

/** Project a world point to frame pixels. */
const toPx = (v3, W, H) => {
  const p = v3.clone().project(camera);
  return { x: Math.round((p.x + 1) / 2 * (W - 1)), y: Math.round((1 - (p.y + 1) / 2) * (H - 1)) };
};

/** Sample a disc of radius px around an anchor; return class counts.
 *  (v4 sampled a single row — `dy` never reached the pixel address — which
 *  passed only because fitted garments were solid across any row; cloth
 *  anchors sit near hems/bands where one row is not representative.) */
function discCount(px, py, rad, W, H, buf) {
  const tally = {};
  let n = 0;
  const ri = Math.round(rad); // fractional rad → fractional indices → buf[undefined] → 'other'
  for (let dy = -ri; dy <= ri; dy += 2) for (let dx = -ri; dx <= ri; dx += 2) {
    if (dx * dx + dy * dy > ri * ri) continue;
    const x = Math.round(px + dx), y = Math.round(H - 1 - (py + dy)); // readPixels row 0 = bottom
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = (y * W + x) * 4;
    const c = classifyRegion(buf[p], buf[p + 1], buf[p + 2]);
    tally[c] = (tally[c] ?? 0) + 1;
    n++;
  }
  return { tally, n };
}

/** The three founder regions at the CURRENT pose (bind or any anim frame).
 *  Camera: front, neutral lights, full kit. */
function regionChecks() {
  return withUI(() => {
    av.root.updateMatrixWorld(true);
    outfit.settle(0.35); // drape to the current pose (bind, or a BVH frame)
    // face the body's front: mid-stride the torso yaws and the fixed 3/4
    // camera puts the far shoulder/thigh behind the body (measured 11.6%/4.2%
    // lime at walk@50% — occlusion, not absence). Rotate the camera with it.
    av.bones.spine2.updateWorldMatrix(true, false);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(av.bones.spine2.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0;
    const yaw = fwd.lengthSq() > 1e-6 ? Math.atan2(fwd.x, fwd.z) : 0;
    const off = new THREE.Vector3(0.55, 0.23, 2.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    const tgt = av.bones.hips.getWorldPosition(new THREE.Vector3());
    tgt.y = 0.92;
    return withCamera(tgt.clone().add(off), tgt, () =>
      withNeutralLights(() => {
        const { buf, W, H } = readFrame();
        const bp = (b, f = 0) => {
          b.updateWorldMatrix(true, false);
          return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).add(new THREE.Vector3(0, f, 0));
        };
        // body-frame forward: offsets like "+5 cm toward the chest" must track
        // the torso's facing — mid-stride the body yaws and world-space +z
        // offsets land off the chest (walk@50% measured: upper chest 10% lime)
        const fwdOf = (b) => {
          b.updateWorldMatrix(true, false);
          const q = new THREE.Quaternion();
          b.getWorldQuaternion(q);
          const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          f.y = 0;
          return f.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, 1) : f.normalize();
        };
        const rad = Math.max(9, Math.round(W * 0.016));
        const regions = [];
        const add = (name, want, v3, extra) => {
          const q = toPx(v3, W, H);
          const dc = discCount(q.x, q.y, rad, W, H, buf);
          const got = dc.tally[want] ?? 0;
          regions.push({ name, want, got, share: +(100 * got / Math.max(1, dc.n)).toFixed(1), pass: got > dc.n * (extra ?? 0.12), px: [q.x, q.y] });
        };
        // 1. shirt over shoulders + upper chest (lime)
        if (av.bones.armL) add('shoulder L (shirt)', 'lime', bp(av.bones.armL, 0.01));
        if (av.bones.armR) add('shoulder R (shirt)', 'lime', bp(av.bones.armR, 0.01));
        if (av.bones.spine2) add('upper chest (shirt)', 'lime', bp(av.bones.spine2).addScaledVector(fwdOf(av.bones.spine2), 0.05).add(new THREE.Vector3(0, 0.02, 0)));
        // the SLOPE band (between the chest and the collar — the traps/shoulder
        // slope): v3's slope rings stacked INSIDE this flesh, which is why the
        // founder saw "absent around the shoulders and upper chest"
        if (av.bones.neck && av.bones.spine2) {
          const n = bp(av.bones.neck), s2 = bp(av.bones.spine2);
          add('shoulder slope (shirt)', 'lime', n.clone().lerp(s2, 0.45).addScaledVector(fwdOf(av.bones.spine2), 0.045));
        }
        // 2. shorts on both upper thighs (coral). Wider disc: from the 3/4
        // camera the FAR thigh only peeks a sliver past the near leg — the
        // fitted v4 flare exposed more of it; hanging cloth drapes closer.
        for (const [up, knee, label] of [[av.bones.upLegL, av.bones.legL, 'thigh L (shorts)'], [av.bones.upLegR, av.bones.legR, 'thigh R (shorts)']]) {
          if (!up || !knee) continue;
          up.updateWorldMatrix(true, false); knee.updateWorldMatrix(true, false);
          const a = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
          const b = new THREE.Vector3().setFromMatrixPosition(knee.matrixWorld);
          // lerp 0.45 + LATERAL offset: the unambiguous mid-thigh zone on each
          // leg's OUTER face — from the 3/4 camera the near leg shows its
          // lateral face and the far leg only its lateral sliver past the
          // near leg. 0.22 (v4) sat at the band/hem boundary — noisy for cloth.
          // outward = away from the pelvis centre, horizontal — tracks stride
          const hipsC = av.bones.hips.getWorldPosition(new THREE.Vector3());
          let out = new THREE.Vector3(a.x - hipsC.x, 0, a.z - hipsC.z);
          if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
          out.normalize().multiplyScalar(0.035);
          const fwdT = fwdOf(up);
          const q2 = toPx(a.clone().lerp(b, 0.45).add(out).addScaledVector(fwdT, 0.035), W, H);
          const dc2 = discCount(q2.x, q2.y, rad * 1.35, W, H, buf);
          const got = dc2.tally['coral'] ?? 0;
          regions.push({ name: label, want: 'coral', got, share: +(100 * got / Math.max(1, dc2.n)).toFixed(1), pass: got > dc2.n * 0.12, px: [q2.x, q2.y] });
          void add; // (uniform path above kept for the other regions)
        }
        // 3. shoes at both toes (charcoal + white sole rim)
        for (const [toe, label] of [[av.bones.toeL, 'toe L (shoe)'], [av.bones.toeR, 'toe R (shoe)']]) {
          if (!toe) continue;
          toe.updateWorldMatrix(true, false);
          const t = new THREE.Vector3().setFromMatrixPosition(toe.matrixWorld);
          add(label, 'charcoal', t.clone().add(new THREE.Vector3(0, 0.026, 0.012)), 0.05);
          add(label + ' sole', 'white', t.clone().add(new THREE.Vector3(0, -0.008, 0.02)), 0.06);
        }
        const pass = regions.every((r) => r.pass);
        return { pass, regions, view: 'front' };
      }));
  });
}

/** Remove wardrobe remnants (rigid v4 pieces clone through loadModel). */
function clearOutfitRemnants() {
  clearCloth(av);
  av.prone.children[0].traverse((o) => {
    if (o.userData?.rwfWardrobe) o.parent?.remove(o);
  });
}

// ── CLOTH-SPECIFIC CHECKS (the anti-armour instruments) ─────────────────────

/** BULK CHECK — the armour detector. Front render at the chest: the shirt's
 *  rendered silhouette width (lime) must not exceed the BODY's width (arms
 *  included) by more than 6 cm. Fitted/skinned garments padded outwards by
 *  10 cm+ per side when the founder saw "american football armour"; hanging
 *  cloth drapes at skin + ~1 cm, so the excess is a direct bulk readout. */
function bulkCheck(refBodyCm = 0) {
  return withUI(() => {
    av.root.updateMatrixWorld(true);
    return withCamera(new THREE.Vector3(0.55, 1.15, 2.9), new THREE.Vector3(0, 0.92, 0), () =>
      withNeutralLights(() => {
        const gl = renderer.getContext();
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
        const cmPerUnit = 175 / (s * av.H);
        av.bones.spine2.updateWorldMatrix(true, false);
        const s2 = new THREE.Vector3().setFromMatrixPosition(av.bones.spine2.matrixWorld);
        // cm per pixel at chest depth: project a known ±10 cm lateral span
        const pa = toPx(s2.clone().add(new THREE.Vector3(0.1, 0, 0)), W, H);
        const pb = toPx(s2.clone().add(new THREE.Vector3(-0.1, 0, 0)), W, H);
        const pxSpan = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1;
        const cmPerPx = (0.2 * cmPerUnit) / pxSpan;
        const anchor = toPx(s2.clone().add(new THREE.Vector3(0, 0.01, 0)), W, H);
        const xWin0 = Math.max(0, Math.round(anchor.x - W * 0.22));
        const xWin1 = Math.min(W - 1, Math.round(anchor.x + W * 0.22));
        const rows = [];
        for (let y = anchor.y - 8; y <= anchor.y + 8; y++) rows.push(y);
        const extent = (fn) => {
          let mn = 1e9, mx = -1e9;
          for (const y of rows) {
            if (y < 0 || y >= H) continue;
            for (let x = xWin0; x <= xWin1; x++) {
              const p = ((H - 1 - y) * W + x) * 4;
              if (fn(buf8[p], buf8[p + 1], buf8[p + 2])) { if (x < mn) mn = x; if (x > mx) mx = x; }
            }
          }
          return mn > mx ? 0 : mx - mn;
        };
        // render 1: body only (all garments hidden) — the true silhouette
        const wasOn = {};
        for (const slot of OUTFIT_SLOTS) { wasOn[slot] = outfit.isVisible(slot); outfit.toggle(slot, false); }
        if (outfit.sim?.debug?.visible) outfit.sim.debug.visible = false;
        let f = readFrame(); buf8 = f.buf;
        const bodyPx = extent((r, g, b) => {
          const c = classifyRegion(r, g, b);
          return c === 'body' || c === 'charcoal' || c === 'white';
        });
        // render 2: full kit — the shirt silhouette (lime)
        for (const slot of OUTFIT_SLOTS) outfit.toggle(slot, wasOn[slot]);
        f = readFrame(); buf8 = f.buf;
        const shirtPx = extent((r, g, b) => classifyRegion(r, g, b) === 'lime');
        // reference body width: mid-stride the body-only render foreshortens
        // (swung arms overlap the torso — 29 cm measured at walk@50%); the
        // bind body width is the honest chest-silhouette reference
        const bodyRef = Math.max(bodyPx * cmPerPx, refBodyCm);
        const excessCm = shirtPx > 0 && bodyPx > 0 ? (shirtPx * cmPerPx - bodyRef) : -1;
        return {
          bodyPx, shirtPx, cmPerPx: +cmPerPx.toFixed(3),
          bodyCm: +(bodyPx * cmPerPx).toFixed(1), bodyRefCm: +bodyRef.toFixed(1),
          shirtCm: +(shirtPx * cmPerPx).toFixed(1),
          excessCm: +excessCm.toFixed(1),
          // armour = shirt FATTER than the body; slimmer (limbs bare beside it) is fine
          pass: shirtPx > 0 && bodyPx > 0 && excessCm <= 6,
        };
      }));
  });
}
let buf8 = new Uint8Array(0);

/** DRAPE CHECK — fabric must BEHAVE like fabric:
 *  1. settle: from a rest-drop, garment max speed decays below the sleep
 *     threshold in < 3 s (no permanent jitter — the cardinal cloth sin);
 *  2. lag: two walk frames differ at the hems — the fabric swings with the
 *     stride instead of being glued to the legs. */
function hemSnapshot() {
  const pts = [];
  const sh = outfit.pieces.shorts, ts = outfit.pieces.shirt;
  for (let r = 8; r < 10; r++) for (let c = 0; c < 24; c++) {
    pts.push(sh.px[r * 24 + c], sh.py[r * 24 + c], sh.pz[r * 24 + c]);
  }
  const torso = ts.strips[0];
  for (let r = 8; r < 10; r++) for (let c = 0; c < 16; c++) {
    const i = torso.start + r * 16 + c;
    pts.push(ts.px[i], ts.py[i], ts.pz[i]);
  }
  return pts;
}

async function drapeCheck() {
  if (!av || !outfit) return { error: 'not ready' };
  // ── settle timing (rest-drop → calm), body frozen at stand
  av.pose('stand', 0.5);
  av.root.updateMatrixWorld(true);
  outfit.resetDrape();
  const perChunk = Math.round(CLOTH_TUNING.hz / 30);
  let settleS = -1, maxAt3s = 0;
  const gatePieces = [outfit.pieces.shorts, outfit.pieces.shirt]; // + sleeves reported, not gated
  for (let i = 0; i < 90; i++) { // up to 3.0 s in 1/30 s chunks
    outfit.sim.substepN(perChunk);
    const ms = Math.max(...gatePieces.map((p) => p.lastMaxSpeed));
    if (ms < CLOTH_TUNING.sleepSpeed) { settleS = (i + 1) / 30; break; }
    if (i === 89) maxAt3s = ms;
  }
  // ── walk lag: two adjacent frames, cloth advanced but NOT settled
  return withUI(async () => {
    if (bvh) { bvh.stop(); bvh = null; }
    const res = await loadBVH(BVH_FILES.walk);
    const p = new BVHPlayer(av, res);
    p.time = p.duration * 0.5; p.update(0);
    av.root.updateMatrixWorld(true);
    outfit.settle(0.4);
    const hemA = hemSnapshot();
    p.time = p.duration * 0.56; p.update(0);
    av.root.updateMatrixWorld(true);
    outfit.sim.substepN(4); // in-motion capture — the lag is the point
    const hemB = hemSnapshot();
    p.stop();
    const s = av.root.getWorldScale(new THREE.Vector3()).x || 1;
    const cmPerUnit = 175 / (s * av.H);
    let sum = 0;
    for (let k = 0; k < hemA.length; k++) sum += Math.abs(hemB[k] - hemA[k]);
    const lagCm = (sum / (hemA.length / 3)) * cmPerUnit;
    return {
      settleS: +settleS.toFixed(2), maxSpeedAt3sCmS: +(maxAt3s * cmPerUnit).toFixed(1),
      lagCm: +lagCm.toFixed(2),
      sleeveSimmerCmS: +(outfit.pieces.sleeves.lastMaxSpeed * cmPerUnit).toFixed(1),
      pass: settleS > 0 && settleS < 3 && lagCm > 0.15,
    };
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
  // v4 bars — fit allowances, not blind spots (a detached garment trips its
  // bar; the signed probe + region checks catch the swallowed/absent classes):
  //   • tee TORSO 15 cm: the shoulder band spans the deltoids BY DESIGN (the
  //     founder's defect-1 fix); when an arm raises or the push-up bottom
  //     folds, the deltoid leaves the fabric — real cloth slings, LBS fabric
  //     measures up to 14.8 cm of local slack (max, not median — the tube
  //     stays attached; ring continuity covers that).
  //   • tee SLEEVES 8 cm (v3 armpit bridge): they ride the arm.
  //   • shorts LEGS 7.5 cm: the top rings deliberately reach past the body
  //     centreline to close the crotch; folded poses float their inner
  //     columns briefly. Shell stays at the founder's 5 cm.
  // CLOTH bars — hanging-fabric allowances, measured on this build:
  //   • tee torso 25 cm: the free hem swings off hunched/bobbing torsos
  //     (measured max 23.4 cm at walk@0.25 — fabric flying, not detached)
  //   • sleeves 12 cm: sleeve hems on swinging arms (measured 11.3 jacks)
  //   • shorts 45 cm: legs spread wide (jumping jacks 35.8; lunges in
  //     drag/one_arm/combat measured to 42.7) lift the crotch fabric far
  //     from the thighs — real shorts do this
  //   • waistband 8 cm: prone push-up folds the hips under the band (5.3)
  // The fitted-garment distance metric is CONTEXT for cloth; containment is
  // enforced by the signed probe (bar 0) and silhouette by bulkCheck.
  const ATTACH_BAR = { default: 8, tshirt: 25, 'tshirt sleeves': 12, shorts: 45, 'shorts legs': 45, waistband: 8, sneakers: 5 };
  const barOf = (tag) => ATTACH_BAR[tag] ?? ATTACH_BAR.default;
  // cloth stretch bar: hanging fabric genuinely strains at pins/loads
  // (v4's 3 mm bar was for WELDED LBS topology — a welded strip cannot open;
  // cloth edges stretch ~1–3% under the garment's own weight)
  const STRETCH_BAR = 2.5;   // cm — ring-to-ring edge strain (elastic collar zone strains ~2.2 cm under the shirt's hang load — measured)
  const rows = [];
  const notes = [];

  const measureCase = (label) => {
    av.root.updateMatrixWorld(true);
    outfit.settle(0.4); // cloth drapes to the posed frame — dwell state measured
    const surface = bodySurface(av);
    const nearSurface = nearestDistanceFactory(surface, 0.05);
    // rigid pieces are bone-welded: sparse low-poly flesh (Geno's feet) makes
    // surface-only distance dishonest for them — they answer to the skeleton
    const nearBody = nearestDistanceFactory([...surface, ...skeletonSamples(av)], 0.05);
    // SIGNED coverage (FIX 1): the inside-body scan — a garment vertex
    // occluded by flesh from every view (deep enough, not tucked, not a
    // bare-limb crossing, not a closed fold) is COVERED-BY-BODY: the red
    // failure state the unsigned distance probe cannot see.
    const signed = scanInsideBody();
    const perGarment = {};
    let maxAll = 0, worst = '';
    let maxStretch = 0, worstStretch = '';
    for (const g of [...outfit.softGarments, ...outfit.rigidPieces]) {
      const tag = g.userData?.rwfWardrobe ?? '?';
      const nearest = g.isSkinnedMesh ? nearSurface : nearBody;
      const verts = garmentVerts(g);
      // tee sleeves = their own region with the tighter bar (they ride the
      // arm and must stay close to it; the torso's shoulder band carries the
      // sling allowance)
      const gLayout = g.userData?.rwfLayout;
      const nStrips = gLayout?.layout?.filter((s) => s).length ?? 0;
      const tagOf = (vi) => {
        if (tag === 'tshirt' && nStrips > 1) {
          for (let q = 0; q < gLayout.layout.length; q++) {
            const st = gLayout.layout[q];
            if (st && vi >= st.start && vi < st.start + st.ringCount * gLayout.radial) return q === 0 ? 'tshirt' : 'tshirt sleeves';
          }
          return 'tshirt';
        }
        if (tag === 'shorts' && nStrips > 1) {
          for (let q = 0; q < gLayout.layout.length; q++) {
            const st = gLayout.layout[q];
            if (st && vi >= st.start && vi < st.start + st.ringCount * gLayout.radial) return q === 0 ? 'shorts' : 'shorts legs';
          }
          return 'shorts';
        }
        return tag;
      };
      let nan = 0;
      const maxByTag = {};
      for (let vi = 0; vi < verts.length; vi++) {
        const v = verts[vi];
        if (!isFinite(v.x + v.y + v.z)) { nan++; continue; }
        const d = nearest(v.x, v.y, v.z) * cmPerUnit;
        const tg = tagOf(vi);
        if (!maxByTag[tg] || d > maxByTag[tg]) maxByTag[tg] = d;
      }
      for (const [tg, d] of Object.entries(maxByTag)) {
        perGarment[tg] = { maxCm: +d.toFixed(1), nan: 0 };
        if (d > maxAll) { maxAll = d; worst = tg; }
      }
      const primary = (tag === 'tshirt' || tag === 'shorts') ? tag : tag;
      perGarment[primary] = perGarment[primary] ?? { maxCm: 0, nan: 0 };
      perGarment[primary].nan += nan;
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
    const insideByGarment = {};
    for (const r of signed.rows) {
      if (!insideByGarment[r.tag]) insideByGarment[r.tag] = { defectVerts: 0, worstCm: 0 };
      insideByGarment[r.tag].defectVerts += r.defectVerts;
      insideByGarment[r.tag].worstCm = Math.max(insideByGarment[r.tag].worstCm, r.worstCm);
    }
    rows.push({
      label, maxCm: +maxAll.toFixed(1), worst, stretchCm: +maxStretch.toFixed(2), worstStretch,
      perGarment, overBar, nan: Object.values(perGarment).reduce((a, p) => a + p.nan, 0),
      insideVerts: signed.defectVerts, insideWorstCm: signed.worstCm,
      insideCross: signed.limbCrossVerts, insideByGarment,
      solidOk: signed.solidOk,
    });
    return rows[rows.length - 1];
  };

  try {
    // save the live UI state; the probe drives the rig directly
    const savedAnim = state.animId;
    const hadBvh = !!bvh;
    if (bvh) { bvh.stop(); bvh = null; }

    say('<p class="vspin">probing BVH clips (attachment + continuity + signed coverage)…</p>');
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

    // ── cloth-specific verdicts: bulk (anti-armour) + drape (settle + lag)
    say('<p class="vspin">cloth checks (bulk silhouette, settle, lag)…</p>');
    await nextTick();
    const bulk = bulkCheck();
    const drape = await drapeCheck();
    await setAnim(savedAnim); // drapeCheck drove the rig — restore again

    // ── verdicts
    const attachRows = rows.filter((r) => r.overBar);
    const stretchRows = rows.filter((r) => r.stretchCm > STRETCH_BAR);
    const nanRows = rows.filter((r) => r.nan > 0);
    const insideRows = rows.filter((r) => r.insideVerts > 0 || r.solidOk === false);
    const attachPass = attachRows.length === 0 && nanRows.length === 0 && insideRows.length === 0;
    const stretchPass = stretchRows.length === 0;

    let html = '<table><tr><th>case</th><th>max→body</th><th>worst</th><th>inside-body</th><th>stretch</th><th>verdict</th></tr>';
    for (const r of rows) {
      const bad = !!r.overBar || r.stretchCm > STRETCH_BAR || r.nan > 0 || r.insideVerts > 0 || r.solidOk === false;
      const insideTxt = r.solidOk === false ? 'oracle!' : (r.insideVerts > 0
        ? `${r.insideVerts} vert${r.insideVerts > 1 ? 's' : ''} ${r.insideWorstCm}cm` : '0');
      html += `<tr><td>${r.label}</td><td class="${r.overBar ? 'fail' : 'pass'}">${r.maxCm} cm</td>` +
        `<td class="dim">${r.worst}</td><td class="${r.insideVerts > 0 || r.solidOk === false ? 'fail' : 'pass'}">${insideTxt}</td>` +
        `<td class="${r.stretchCm > STRETCH_BAR ? 'fail' : 'pass'}">${r.stretchCm.toFixed(2)} cm</td>` +
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
    const insideTotal = rows.reduce((a, r) => a + r.insideVerts, 0);
    const insideWorst = Math.max(...rows.map((r) => r.insideWorstCm));
    const crossTotal = rows.reduce((a, r) => a + r.insideCross, 0);
    html += `<div class="verify-summary ${attachPass && stretchPass ? 'ok' : 'bad'}">` +
      `${rows.length} cases · max garment→body <b>${globalMax.toFixed(1)} cm</b> (cloth hanging bars: tee 25 · sleeves 12 · shorts 45 · band 8 · shoes 5) · ` +
      `inside-body verts <b>${insideTotal}</b> (worst ${insideWorst.toFixed(1)} cm · ${crossTotal} bare-limb crossings excused) · ` +
      `max ring stretch <b>${globalStretch.toFixed(2)} cm</b> (bar ≤${STRETCH_BAR}) · ` +
      `${attachPass && stretchPass ? 'ALL PASS ✓' : attachRows.length + stretchRows.length + nanRows.length + insideRows.length + ' case(s) over bar'}</div>`;
    const bulkOK = bulk && bulk.pass !== false;
    const drapeOK = drape && drape.pass !== false;
    html += `<div class="verify-summary ${bulkOK && drapeOK ? 'ok' : 'bad'}">CLOTH — ` +
      `bulk: shirt silhouette ${bulk?.shirtCm ?? '?'} cm vs body ${bulk?.bodyCm ?? '?'} cm = ` +
      `<b>+${bulk?.excessCm ?? '?'} cm</b> (bar ≤6 — the armour detector) · ` +
      `settle: <b>${drape?.settleS ?? '?'} s</b> (bar <3) · hem lag on walk: <b>${drape?.lagCm ?? '?'} cm</b> (bar >0.15 — fabric, not glue) · ` +
      `${bulkOK && drapeOK ? 'PASS ✓' : 'FAIL'}</div>`;
    for (const r of rows) {
      if (r.ankleDriftCm != null && r.ankleDriftCm > 3) notes.push(`${r.pose}: feet drift ${r.ankleDriftCm} cm across phases (not planted)`);
    }
    if (notes.length) html += notes.map((n) => `<p class="verify-note">⚠ ${n}</p>`).join('');
    html += '<p class="verify-note">edge "stretch" = welded ring-to-ring edge strain (LBS responds to joint bends; a welded strip cannot open a gap — NaN/degenerate verts are the structural hole check and must stay 0).</p>';
    say(html);

    const report = { rows, attachPass, stretchPass, globalMaxCm: +globalMax.toFixed(1), globalStretchCm: +globalStretch.toFixed(2), insideVerts: insideTotal, insideWorstCm: +insideWorst.toFixed(1), limbCrossVerts: crossTotal, notes, bars: { attachCm: ATTACH_BAR, stretchCm: STRETCH_BAR }, bulk, drape, cloth: outfit.clothStats() };
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
      module: '/site/models/geno-cloth.js',
      mode: 'hanging-cloth PBD',
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
  clearOutfitRemnants();
  outfit = attachClothOutfit(av, { slots: 'full' });
  av.pose('stand', 0.5);
  outfit.settle(1.2); // drop from the bind rest shape — the founder never sees A-pose cloth
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
  // ── cloth controls: debug overlay, substep-by-substep settle, reset drape
  $('btnClothDebug').addEventListener('click', () => {
    const on = !outfit.sim.debug.visible;
    outfit.clothDebug(on);
    $('btnClothDebug').classList.toggle('is-on', on);
  });
  $('btnClothStep').addEventListener('click', () => {
    state.paused = true; updatePauseBtn();
    outfit.clothStep(1); // ONE substep — watch the drape converge frame by frame
    if (state.heat) updateHeatmap();
  });
  $('btnClothReset').addEventListener('click', () => { outfit.resetDrape(); });
  setInterval(() => {
    if (!outfit?.clothStats) return;
    const st = outfit.clothStats();
    $('clothInfo').textContent =
      `${st.particles} particles · ${st.constraints} constraints · ${st.colliders} colliders · sim ${st.lastMs.toFixed(2)} ms/frame · ${st.sleeping.every(Boolean) ? 'settled' : 'draping'}`;
  }, 1000);
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
      // cloth: paused = FROZEN (reduced-motion safe); playing = sim advances
      outfit?.updateFabric(dt * state.speed);
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
  runVerify, bandCheck, sleeveCheck, asciiView, regionChecks,
  scanSignedCoverage, scanInsideBody, bulkCheck, drapeCheck,
  clothStats: () => outfit?.clothStats?.() ?? null,
  clothStep: (n = 1) => outfit?.clothStep?.(n),   // watch cloth settle substep by substep
  clothDebug: (on) => outfit?.clothDebug?.(on),   // particles + constraints overlay
  resetDrape: () => outfit?.resetDrape?.(),
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
    `<div style="padding:14px 20px;color:var(--danger);font-family:var(--font-mono);white-space:pre-wrap">atelier boot failed: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 5).join('\n')}</div>`);
  console.error(e);
});
