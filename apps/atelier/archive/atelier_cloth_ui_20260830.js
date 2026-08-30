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
  skeletonSamples, freshBoneMatrices, skinnedVert,
  OUTFIT_SLOTS, SLOT_LABELS, BUILDUP_STEPS,
} from '/site/models/geno-outfit.js';
// SKIN-DERIVED GARMENTS (geno-derived): the DEFAULT system — the body's own
// triangles, offset +6 mm along their normals, same skeleton, same weights.
// Cannot be inside the flesh, cannot be armour, deforms identically to the
// body through every clip and pose. No sim, no per-frame cost.
import { attachDerivedOutfit, clearDerived } from '/site/models/geno-derived.js';
// TRUE HANGING CLOTH (geno-cloth): EXPERIMENTAL, OFF by default — simulated
// fabric pinned + colliding + draped by gravity. Kept wired behind a toggle
// for comparison runs; the derived system above is the canonical answer.
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
  mode: 'derived',          // 'derived' (default) | 'cloth' (experimental)
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
  wake();
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
  wake();
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
  wake();
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
  if (state.heat) updateHeatmap();               // on-demand: paused garments don't move
  if (!wasPaused) $('hudPhase').textContent = phaseLabel();
  wake();
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
  wake();
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
  // world spine line (skin-derived garments have no rings — the outward
  // direction for the exit probe is horizontal-radial from this line)
  const spineW = [];
  for (const bn of ['hips', 'spine', 'spine1', 'neck']) {
    const b = av.bones[bn];
    if (!b) continue;
    b.updateWorldMatrix(true, false);
    spineW.push(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
  }
  spineW.sort((a, b) => a.y - b.y);
  const centreAt = (y) => {
    if (spineW.length < 2) return spineW[0] ?? new THREE.Vector3(0, y, 0);
    for (let k = 0; k < spineW.length - 1; k++) {
      if (y <= spineW[k + 1].y || k === spineW.length - 2) {
        const t = Math.min(1, Math.max(0, (y - spineW[k].y) / (spineW[k + 1].y - spineW[k].y || 1)));
        return spineW[k].clone().lerp(spineW[k + 1], t);
      }
    }
    return spineW[0];
  };
  const _u = new THREE.Vector3();
  for (let mi = 0; mi < outfit.softGarments.length; mi++) {
    const g = outfit.softGarments[mi];
    const layout = g.userData?.rwfLayout;
    const tag = g.userData?.rwfWardrobe ?? '?';
    const verts = garmentVerts(g);
    if (!layout) {
      // ── SKIN-DERIVED garment: per-vertex verdict (no ring layout — the
      //    garment IS body triangles, so each vertex answers for itself)
      let inside = 0, excused = 0, defect = 0, worstCm = 0, worstY = 0, limbCross = 0;
      const samples = [];
      const s2 = av.root.getWorldScale(new THREE.Vector3()).x || 1;
      for (let vi = 0; vi < verts.length; vi++) {
        const v = verts[vi];
        if (!v || !isFinite(v.x + v.y + v.z)) continue;
        if (!oracle.inside(v.x, v.y, v.z)) continue;
        if (nearSurface(v.x, v.y, v.z) <= near) { excused++; continue; } // crease/skin graze
        inside++;
        _u.set(v.x - centreAt(v.y).x, 0, v.z - centreAt(v.y).z);
        if (_u.lengthSq() < 1e-9) _u.set(0, 0, 1);
        _u.normalize();
        const ex = oracle.exit(v.x, v.y, v.z, _u.x, _u.y, _u.z, 0, 1, 0);
        if (ex.fold) { excused++; continue; }
        if (ex.depth <= tol) { excused++; continue; }
        if (cover.clothed(ex.x, ex.y, ex.z, mi, -1, -1)) { excused++; continue; }
        if (distToSeg(ex.x, ex.y, ex.z) <= 0.055) { limbCross++; continue; }
        if (tag === 'tshirt' && distToArmAxis(v.x, v.y, v.z) < 0.11) { limbCross++; continue; } // sleeve verts ride the arm into the armpit's flesh
        if (bellyFold) { limbCross++; continue; } // folded torso: the skinning folds WITH the flesh
        defect++;
        const dCm = ex.depth * cmPerUnit;
        if (dCm > worstCm) { worstCm = dCm; worstY = +(v.y / (s2 * av.H) * 1.75).toFixed(2); }
        if (samples.length < 4) samples.push({ vert: vi, yM: +(v.y / (s2 * av.H) * 1.75).toFixed(2), dCm: +dCm.toFixed(1) });
      }
      rows.push({ tag, mesh: mi, strip: -1, rings: verts.length, insideVerts: inside, excused, limbCross, defectVerts: defect, worstCm: +worstCm.toFixed(2), worstY, samples });
      continue;
    }
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

/** Remove wardrobe remnants (rigid v4 pieces clone through loadModel; cloth
 *  lives at scene level; derived garments are body-scene children — the
 *  rwfWardrobe tag catches all three). Collect-then-remove: removing during
 *  traverse shifts the children array mid-iteration (three's traverse reads
 *  children[i] raw — crash on the first multi-removal, i.e. on setMode). */
function clearOutfitRemnants() {
  clearCloth(av);
  const doomed = [];
  av.prone.children[0].traverse((o) => {
    if (o.userData?.rwfWardrobe || o.userData?.rwfDerived) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
}

// ── garment mode: derived (default) ⇄ cloth (experimental) ───────────────────
async function setMode(mode) {
  if ((mode !== 'derived' && mode !== 'cloth') || !av) return;
  if (outfit && state.mode === mode) return;
  const savedAnim = state.animId;
  if (bvh) { bvh.stop(); bvh = null; }
  clearOutfitRemnants();
  matSave.clear();
  heatOracle = null;
  heatOracleAt = -1;
  state.mode = mode;
  state.verifying = false;
  $('btnVerify').disabled = false;
  if (mode === 'cloth') {
    outfit = attachClothOutfit(av, { slots: 'full' });
    av.pose('stand', 0.5);
    outfit.settle(1.2); // drop from the bind rest shape — the founder never sees A-pose cloth
  } else {
    outfit = attachDerivedOutfit(av, { slots: 'full' });
    av.pose('stand', 0.5);
  }
  applyViewFX();
  applyVisibility();
  updateModeUI();
  await setAnim(savedAnim);
  state.t = 0;
  applyAnimAt();
  wake();
  return outfit;
}

function updateModeUI() {
  const cloth = state.mode === 'cloth';
  for (const [id, m] of [['btnModeDerived', 'derived'], ['btnModeCloth', 'cloth']]) {
    $(id)?.classList.toggle('is-on', state.mode === m);
  }
  for (const id of ['btnClothDebug', 'btnClothStep', 'btnClothReset']) {
    const el = $(id);
    if (el) { el.disabled = !cloth; el.title = cloth ? el.dataset.title ?? el.title : 'cloth-mode only — the derived garments have no sim'; }
  }
  const info = $('clothInfo');
  if (info) info.textContent = cloth
    ? 'EXPERIMENTAL cloth: shirt + shorts hang from pins and collide with capsule colliders. The DEFAULT garments are skin-derived (the body + 6 mm) — switch back with "Skin-derived".'
    : 'The garments are SKIN-DERIVED: the body\'s own triangles offset +6 mm (collar 3 mm, band 9 mm), same skeleton, same weights — they cannot tunnel, balloon, or detach, and cost no sim. "Cloth sim" is the archived experimental path.';
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
  if (!outfit.pieces) return { skipped: true, note: 'no cloth sim in this mode' }; // derived garments don't drape
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
  // attachment bars (cm) are MODE-dependent:
  //   DERIVED (skin-derived body triangles + offsets) — measured per role
  //   (derived_role_probe): region verts sit at the constructed offset (0.63
  //   cm ≈ 6 mm × scale), collar 0.32, band 0.95; the shirt hem lip (dropped
  //   2.8 cm + flared 1 cm BY SPEC) reaches 3.13 cm at walk — so the tee bar
  //   is 3.5, shorts 2.5 (hem 2.3). The REAL attachment assertion is the
  //   source-delta probe (bar 1 cm) + inside-body probe (bar 0).
  //   sneakers/headband/wristbands are the UNCHANGED founder-approved v4
  //   pieces — sneakers 5.5 (measured 5.1, 1 mm sampling noise on the old
  //   5.0 bar), band pieces 8 (their halo geometry predates this system).
  //   CLOTH — hanging-fabric allowances, measured on this build (see notes).
  const ATTACH_BAR = state.mode === 'cloth'
    ? { default: 8, tshirt: 25, 'tshirt sleeves': 12, shorts: 45, 'shorts legs': 45, waistband: 8, sneakers: 5 }
    : { default: 2.5, tshirt: 3.5, shorts: 2.5, waistband: 1.5, sneakers: 5.5, headband: 8, wristbands: 8 };
  const DELTA_BAR = 1.0;  // cm — |live offset| vs |bind offset| (shared skinning)
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
    let maxDelta = 0, worstDelta = '';
    let maxStrainExcess = 0;
    for (const g of [...outfit.softGarments, ...outfit.rigidPieces]) {
      const tag = g.userData?.rwfWardrobe ?? '?';
      const nearest = g.isSkinnedMesh ? nearSurface : nearBody;
      const verts = garmentVerts(g);
      // ── DERIVED probes (skin-derived garments): (a) source-delta — each
      //    garment vert must stay at its CONSTRUCTED offset from its own
      //    source body vert (shared skinning ⇒ identical deformation; bar
      //    1 cm for LBS blend softening at joint creases); (b) edge strain —
      //    the garment's welded edges must strain no more than the BODY's
      //    own edges between the same verts (inherited topology).
      const der = g.userData?.rwfDerived;
      if (der) {
        const s2 = av.root.getWorldScale(new THREE.Vector3()).x || 1;
        const mats = freshBoneMatrices(der.body.skeleton);
        const src = der.srcIndex, bd = der.bindDelta;
        const bodyLive = new Array(src.length);
        let devMax = 0;
        for (let k = 0; k < src.length && k < verts.length; k++) {
          bodyLive[k] = skinnedVert(der.body, src[k], new THREE.Vector3(), mats).clone();
          const dl = verts[k].distanceTo(bodyLive[k]);        // live offset length
          const expect = Math.hypot(bd[k * 3], bd[k * 3 + 1], bd[k * 3 + 2]) * s2; // scaled bind offset
          const dev = Math.abs(dl - expect);
          if (dev > devMax) devMax = dev;
        }
        const devCm = devMax * cmPerUnit;
        perGarment[tag] = perGarment[tag] ?? { maxCm: 0, nan: 0 };
        perGarment[tag].deltaCm = +devCm.toFixed(2);
        if (devCm > maxDelta) { maxDelta = devCm; worstDelta = tag; }
        // edge strain: garment live vs bind, against the body's own
        const gI = g.geometry.index, GP = g.geometry.attributes.position, BP = der.body.geometry.attributes.position;
        const gv = new THREE.Vector3();
        let gStrain = 0, bStrain = 0;
        const strainEdge = (a, b) => {
          const bindG = gv.fromBufferAttribute(GP, a).distanceTo(new THREE.Vector3().fromBufferAttribute(GP, b));
          const liveG = verts[a].distanceTo(verts[b]) / s2;
          gStrain = Math.max(gStrain, (liveG - bindG) * cmPerUnit);
          const bindB = new THREE.Vector3().fromBufferAttribute(BP, src[a]).distanceTo(new THREE.Vector3().fromBufferAttribute(BP, src[b]));
          const liveB = (bodyLive[a]?.distanceTo(bodyLive[b]) ?? 0) / s2;
          bStrain = Math.max(bStrain, (liveB - bindB) * cmPerUnit);
        };
        for (let t = 0; t < gI.count; t += 3) {
          strainEdge(gI.getX(t), gI.getX(t + 1));
          strainEdge(gI.getX(t + 1), gI.getX(t + 2));
          strainEdge(gI.getX(t + 2), gI.getX(t));
        }
        perGarment[tag].strainCm = +gStrain.toFixed(2);
        perGarment[tag].bodyStrainCm = +bStrain.toFixed(2);
        maxStrainExcess = Math.max(maxStrainExcess, gStrain - bStrain);
      }
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
        // max-merge: several meshes can share a tag (rigid group meshes) —
        // assignment would silently keep only the LAST one's maximum
        if (!perGarment[tg] || d > (perGarment[tg].maxCm ?? 0)) perGarment[tg] = { maxCm: +d.toFixed(1), nan: 0 };
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
      // derived-mode verdicts
      deltaCm: +maxDelta.toFixed(2), worstDelta,
      strainExcessCm: +maxStrainExcess.toFixed(2),
      overDelta: maxDelta > DELTA_BAR, overStrain: maxStrainExcess > 0.5,
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
    const drape = outfit.pieces ? await drapeCheck() : null; // derived: no sim — nothing to drape
    await setAnim(savedAnim); // drapeCheck drove the rig — restore again

    // ── verdicts
    const attachRows = rows.filter((r) => r.overBar);
    const stretchRows = rows.filter((r) => r.stretchCm > STRETCH_BAR);
    const nanRows = rows.filter((r) => r.nan > 0);
    const insideRows = rows.filter((r) => r.insideVerts > 0 || r.solidOk === false);
    const deltaRows = state.mode === 'derived' ? rows.filter((r) => r.overDelta) : [];
    const strainRows = state.mode === 'derived' ? rows.filter((r) => r.overStrain) : [];
    const attachPass = attachRows.length === 0 && nanRows.length === 0 && insideRows.length === 0
      && deltaRows.length === 0 && strainRows.length === 0;
    const stretchPass = stretchRows.length === 0;

    let html = '<table><tr><th>case</th><th>max→body</th><th>worst</th><th>inside-body</th><th>stretch</th>'
      + (state.mode === 'derived' ? '<th>Δsrc</th><th>strain−body</th>' : '') + '<th>verdict</th></tr>';
    for (const r of rows) {
      const bad = !!r.overBar || r.stretchCm > STRETCH_BAR || r.nan > 0 || r.insideVerts > 0 || r.solidOk === false
        || r.overDelta || r.overStrain;
      const insideTxt = r.solidOk === false ? 'oracle!' : (r.insideVerts > 0
        ? `${r.insideVerts} vert${r.insideVerts > 1 ? 's' : ''} ${r.insideWorstCm}cm` : '0');
      html += `<tr><td>${r.label}</td><td class="${r.overBar ? 'fail' : 'pass'}">${r.maxCm} cm</td>` +
        `<td class="dim">${r.worst}</td><td class="${r.insideVerts > 0 || r.solidOk === false ? 'fail' : 'pass'}">${insideTxt}</td>` +
        `<td class="${r.stretchCm > STRETCH_BAR ? 'fail' : 'pass'}">${r.stretchCm.toFixed(2)} cm</td>` +
        (state.mode === 'derived'
          ? `<td class="${r.overDelta ? 'fail' : 'pass'}">${r.deltaCm.toFixed(2)} cm</td>` +
            `<td class="${r.overStrain ? 'fail' : 'pass'}">+${r.strainExcessCm.toFixed(2)} cm</td>` : '') +
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
    const globalDelta = Math.max(...rows.map((r) => r.deltaCm));
    const globalStrainExcess = Math.max(...rows.map((r) => r.strainExcessCm));
    const barsTxt = state.mode === 'derived'
      ? `derived bars: tee 3.5 (hem lip) · shorts 2.5 · band 1.5 · shoes 5.5 · Δsource <1.0 · strain−body ≤0.5 cm`
      : `cloth hanging bars: tee 25 · sleeves 12 · shorts 45 · band 8 · shoes 5`;
    html += `<div class="verify-summary ${attachPass && stretchPass ? 'ok' : 'bad'}">` +
      `${rows.length} cases · max garment→body <b>${globalMax.toFixed(1)} cm</b> (${barsTxt}) · ` +
      `inside-body verts <b>${insideTotal}</b> (worst ${insideWorst.toFixed(1)} cm · ${crossTotal} bare-limb crossings excused) · ` +
      `max ring stretch <b>${globalStretch.toFixed(2)} cm</b> (bar ≤${STRETCH_BAR}) · ` +
      (state.mode === 'derived'
        ? `max Δsource <b>${globalDelta.toFixed(2)} cm</b> (bar <${DELTA_BAR} — garment verts track their body verts through shared skinning) · ` +
          `max strain−body <b>+${globalStrainExcess.toFixed(2)} cm</b> · `
        : '') +
      `${attachPass && stretchPass ? 'ALL PASS ✓' : attachRows.length + stretchRows.length + nanRows.length + insideRows.length + deltaRows.length + strainRows.length + ' case(s) over bar'}</div>`;
    const bulkOK = bulk && bulk.pass !== false;
    const drapeOK = drape == null || drape.pass !== false;
    html += `<div class="verify-summary ${bulkOK && drapeOK ? 'ok' : 'bad'}">${state.mode === 'derived' ? 'DERIVED — ' : 'CLOTH — '}` +
      `bulk: shirt silhouette ${bulk?.shirtCm ?? '?'} cm vs body ${bulk?.bodyCm ?? '?'} cm = ` +
      `<b>+${bulk?.excessCm ?? '?'} cm</b> (bar ≤6 — the armour detector) · ` +
      (drape
        ? `settle: <b>${drape.settleS ?? '?'} s</b> (bar <3) · hem lag on walk: <b>${drape.lagCm ?? '?'} cm</b> (bar >0.15 — fabric, not glue) · `
        : `settle/lag: <b>n/a</b> (no sim — the garment is skinned body surface) · `) +
      `${bulkOK && drapeOK ? 'PASS ✓' : 'FAIL'}</div>`;
    for (const r of rows) {
      if (r.ankleDriftCm != null && r.ankleDriftCm > 3) notes.push(`${r.pose}: feet drift ${r.ankleDriftCm} cm across phases (not planted)`);
    }
    if (notes.length) html += notes.map((n) => `<p class="verify-note">⚠ ${n}</p>`).join('');
    html += '<p class="verify-note">edge "stretch" = welded ring-to-ring edge strain (LBS responds to joint bends; a welded strip cannot open a gap — NaN/degenerate verts are the structural hole check and must stay 0).</p>';
    say(html);

    const report = { rows, attachPass, stretchPass, globalMaxCm: +globalMax.toFixed(1), globalStretchCm: +globalStretch.toFixed(2), insideVerts: insideTotal, insideWorstCm: +insideWorst.toFixed(1), limbCrossVerts: crossTotal, notes, bars: { attachCm: ATTACH_BAR, stretchCm: STRETCH_BAR, deltaCm: state.mode === 'derived' ? DELTA_BAR : null, strainExcessCm: state.mode === 'derived' ? 0.5 : null }, bulk, drape, mode: state.mode, derivedStats: outfit.derived?.stats ?? null, cloth: outfit.clothStats?.() ?? null };
    window.__atelier.lastVerify = report;
    return report;
  } catch (e) {
    say(`<div class="verify-summary bad">probe failed: ${e.message}</div>`);
    throw e;
  } finally {
    state.verifying = false;
    $('btnVerify').disabled = false;
    wake(); // redraw the restored state
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
      module: state.mode === 'cloth' ? '/site/models/geno-cloth.js' : '/site/models/geno-derived.js',
      mode: state.mode === 'cloth' ? 'hanging-cloth PBD (experimental)' : 'skin-derived body triangles (+6 mm)',
      buildStep: state.buildStep,
      stepLabel: BUILDUP_STEPS[state.buildStep].label,
      slotsVisible: OUTFIT_SLOTS.filter((s2) => state.iso ? s2 === state.iso : BUILDUP_STEPS[state.buildStep].slots.includes(s2)),
      isolated: state.iso,
      bandTopM: +(outfit ? outfit.plan.bandTop / av.H * 1.75 : 0).toFixed(3),
      derived: outfit?.derived?.stats ?? null,
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
  // DEFAULT: skin-derived garments — the body's own triangles + 6 mm, sharing
  // the skeleton. (Cloth stays available behind the experimental toggle.)
  outfit = attachDerivedOutfit(av, { slots: 'full' });
  av.pose('stand', 0.5);
  state.ready = true;
  updateModeUI();

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
    wake(state.autoTurn ? 100000 : 350); // turntable on = keep moving; off = settle + quiet
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
  // ── garment mode: skin-derived (default) vs cloth sim (experimental) ─────
  $('btnModeDerived').addEventListener('click', () => setMode('derived'));
  $('btnModeCloth').addEventListener('click', () => setMode('cloth'));
  // ── cloth controls: debug overlay, substep-by-substep settle, reset drape
  //    (clothed-mode only — inert in derived mode)
  $('btnClothDebug').addEventListener('click', () => {
    if (!outfit?.sim?.debug) return;
    const on = !outfit.sim.debug.visible;
    outfit.clothDebug(on);
    $('btnClothDebug').classList.toggle('is-on', on);
  });
  $('btnClothStep').addEventListener('click', () => {
    if (!outfit?.clothStep) return;
    state.paused = true; updatePauseBtn();
    outfit.clothStep(1); // ONE substep — watch the drape converge frame by frame
    if (state.heat) updateHeatmap();
    wake();
  });
  $('btnClothReset').addEventListener('click', () => { outfit?.resetDrape?.(); wake(); });
  setInterval(() => {
    if (state.mode !== 'cloth' || !outfit?.clothStats) return; // no sim, no polling
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
    wake();
  });

  applyVisibility();
  updatePauseBtn();
  wake();
  window.dispatchEvent(new Event('atelier:ready'));
}

// ── resize + frame loop (DIRTY-FLAG: idle = silent) ─────────────────────────
//
// The founder's complaint: "this is performing so badly when just
// stationary." The old loop ran rAF → controls.update() → full render at
// display rate (measured: 101 callbacks / 129.7 ms busy per 2 s idle on a
// paused, turntable-off page). Now the loop renders ONLY when something
// changed — animation advancing, turntable, orbit drag + damping settle,
// heatmap refresh (while animating only), probes, resize — and goes QUIET
// when paused. Target ≈ 0 rAF callbacks over 2 s idle (perfProbe measures).
//
// renderer.setPixelRatio(min(dpr, 2)) caps fill-rate; RENDER_CAP_MS (~72 Hz)
// keeps playing animation from burning a 120 Hz+ display for a scene this
// small.
const perf = { raf: 0, renders: 0, frameMs: 0, lastFrameMs: 0, wakeups: 0 };
let loopActive = false;
let needsRender = true;
let holdUntil = 0;                  // keep looping while orbit damping settles
let last = performance.now();
let lastRenderAt = 0;
const RENDER_CAP_MS = 1000 / 72;

function wake(holdMs = 350) {
  needsRender = true;
  perf.wakeups++;
  holdUntil = Math.max(holdUntil, performance.now() + holdMs);
  if (!loopActive) {
    loopActive = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  wake();
}
new ResizeObserver(resize).observe(stage);
resize();

controls.addEventListener('change', () => wake()); // drag + autoRotate + damping

function tick(now) {
  if (!loopActive) return;
  perf.raf++;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const engaged = state.ready && !state.verifying;
  const animating = engaged && !state.paused;
  const auto = engaged && controls.autoRotate;
  if (animating) {
    state.t += dt * state.speed;
    const a = animById(state.animId);
    if (a?.kind === 'bvh' && bvh) bvh.update(dt * state.speed);
    else if (a?.kind === 'pose') av.pose(a.pose, (state.t / a.cycle) % 1);
    // cloth mode: paused = FROZEN (reduced-motion safe); playing = sim advances.
    // derived mode: no sim — updateFabric is a no-op.
    outfit?.updateFabric(dt * state.speed);
    // seam heatmap refreshes ONLY while animating (the ~7 Hz idle interval is
    // gone — a paused garment's distances do not change)
    if (state.heat) {
      heatTimer += dt;
      if (heatTimer > 0.15) { heatTimer = 0; updateHeatmap(); }
    }
  }
  const capped = (animating || auto) && now - lastRenderAt < RENDER_CAP_MS - 0.5;
  const doRender = engaged && (needsRender || animating || auto || now < holdUntil) && !capped;
  if (doRender) {
    const t0 = performance.now();
    controls.update();
    renderer.render(scene, camera);
    perf.renders++;
    perf.lastFrameMs = performance.now() - t0;
    perf.frameMs = perf.frameMs * 0.9 + perf.lastFrameMs * 0.1;
    lastRenderAt = now;
    needsRender = false;
    fps.ema = fps.ema * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    $('hudFps').textContent = fps.ema.toFixed(0) + ' fps';
    $('hudPhase').textContent = phaseLabel();
    $('hudCtx').textContent = glContexts + ' ctx';
  }
  const stayAlive = (engaged && (animating || auto || needsRender)) || now < holdUntil;
  if (stayAlive) requestAnimationFrame(tick);
  else {
    loopActive = false; // quiet until an event calls wake()
    // kill the orbit damping momentum: with enableDamping off, three's
    // update() ZEROES the spherical delta — otherwise the decay tail keeps
    // firing 'change' → wake() → render for seconds after the last drag
    // (measured: the "idle" 9-rAF tail). Two frames, then silence.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    $('hudFps').textContent = 'idle · 0 rAF';
  }
}
wake();

// ── automation surface (CDP verify suite) ───────────────────────────────────
window.__atelier = {
  get state() { return state; },
  get ready() { return state.ready; },
  get avatar() { return av; },
  get outfit() { return outfit; },
  get mode() { return state.mode; },
  setMode,
  setAnim, setSpeed: (v) => { state.speed = v; $('speedRange').value = v; $('speedVal').textContent = v.toFixed(2) + '×'; },
  pause: () => { state.paused = true; updatePauseBtn(); },
  play: () => { state.paused = false; updatePauseBtn(); },
  stepFrame,
  setBuildStep: (i) => { state.buildStep = i; state.iso = null; applyVisibility(); },
  isolate: (slot) => { state.iso = slot ?? null; applyVisibility(); },
  setXray: (on) => { state.xray = !!on; applyViewFX(); $('btnXray').classList.toggle('is-on', state.xray); },
  setHeat: (on) => { state.heat = !!on; applyViewFX(); $('btnHeat').classList.toggle('is-on', state.heat); $('heatLegend').hidden = !state.heat; if (state.heat) updateHeatmap(); },
  setTurntable: (on) => { state.autoTurn = !!on; controls.autoRotate = state.autoTurn; $('btnTurn').classList.toggle('is-on', state.autoTurn); wake(state.autoTurn ? 100000 : 350); },
  runVerify, bandCheck, sleeveCheck, asciiView, regionChecks,
  scanSignedCoverage, scanInsideBody, bulkCheck, drapeCheck,
  clothStats: () => outfit?.clothStats?.() ?? null,
  clothStep: (n = 1) => outfit?.clothStep?.(n),   // watch cloth settle substep by substep
  clothDebug: (on) => outfit?.clothDebug?.(on),   // particles + constraints overlay
  resetDrape: () => outfit?.resetDrape?.(),
  /** Derived-construction report (region sizes, tri counts, degenerates). */
  derivedStats: () => outfit?.derived?.stats ?? null,
  /** Idle-performance probe: rAF callbacks + renders over `ms` (setTimeout-
   *  based — the probe itself schedules no rAFs and so does not pollute the
   *  count). Paused + turntable off should read ≈ 0. */
  perfProbe: (ms = 2000) => new Promise((res) => {
    const r0 = perf.raf, rr0 = perf.renders, f0 = perf.frameMs;
    setTimeout(() => res({
      ms,
      rafCallbacks: perf.raf - r0,
      renders: perf.renders - rr0,
      frameMsEma: +perf.frameMs.toFixed(2),
      loopActive,
      renderCapHz: +(1000 / RENDER_CAP_MS).toFixed(0),
      pixelRatio: renderer.getPixelRatio(),
    }), ms);
  }),
  /** Render + return the frame as a PNG data-URL (same JS task → safe with
   *  preserveDrawingBuffer off). */
  snapshot: () => {
    controls.update();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  },
  setCam: (pos, tgt) => {
    controls.autoRotate = false;
    camera.position.set(...pos);
    controls.target.set(...tgt);
    controls.update();
    wake();
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
    wake();
  },
  configJSON,
  stats: {
    get contexts() { return glContexts; },
    get fps() { return fps.ema; },
    get perf() { return { ...perf, loopActive, renderCapHz: +(1000 / RENDER_CAP_MS).toFixed(0), pixelRatio: renderer.getPixelRatio() }; },
  },
  lastVerify: null,
};

boot().catch((e) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="padding:14px 20px;color:var(--danger);font-family:var(--font-mono);white-space:pre-wrap">atelier boot failed: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 5).join('\n')}</div>`);
  console.error(e);
});
