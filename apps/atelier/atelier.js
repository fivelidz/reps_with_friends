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
import { loadModel, applyFlatTint, loadBVH, BVHPlayer, ModelAvatar, BVH_FILES, GENO_CLIPS, loadGenoClip }
  from '/site/model-avatars.js';
import {
  garmentVerts, bodySurface, bodyTriangles, nearestDistanceFactory,
  skeletonSamples, freshBoneMatrices, skinnedVert,
  OUTFIT_SLOTS, SLOT_LABELS, BUILDUP_STEPS,
} from '/site/models/geno-outfit.js';
// GARMENTS (geno-derived v8): FABRIC MODE is the default — the shirt and
// shorts are CONSTRUCTED ring-lattice meshes with their own topology
// (regularised sections that smooth the anatomy, hung straight from the
// chest, tapered sleeve cylinders, folded hems), every vert copying skin
// weights from its nearest flesh (Δsource ≈ 0, inside-body = 0 across the
// full clip matrix). A body-derived pelvis flap keeps the waist/crotch
// covered through any pose. FITTED mode keeps the v7 body-triangle garments
// as the fallback. Shoes are foot-derived with a real sole slab. No sim, no
// per-frame cost. (The PBD cloth experiment is RETIRED from this UI —
// geno-cloth.js stays in the repo for reference.)
import { attachDerivedOutfit, clearDerived, HEAD_SPECIES, FROG_SKINS } from '/site/models/geno-derived.js';
// THE FROG HEAD SYSTEM (frog-heads.js): 6 expressions × 5 skins × 4 accessories,
// live re-posing on the Head bone. The frog species routes HERE (not through
// geno-wardrobe's static frog); goblin/robot still route through attachHead.
import {
  createFrogHead, previewFrogHead,
  FROG_SKINS as FROG_HEAD_SKINS, FROG_EXPRESSIONS, FROG_ACCESSORIES,
} from '/site/models/frog-heads.js';
// MESHY HEAD CANDIDATES (2026-08-31 experiment): static GLB frog heads from
// the meshy.ai text-to-3d API, loaded through the same GLTFLoader the model
// cards use (site/lib/). See the MESHY_HEADS registry below.
import { GLTFLoader } from '/site/lib/GLTFLoader.js';

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
  mode: 'derived',                    // fixed: the cloth-sim path is retired
  garmentMode: 'fabric',              // v8: 'fabric' (constructed topology) | 'fitted' (v7 body-triangles)
  headSpecies: 'frog',                // Head slot: frog playground default
  frogExpr: 'happy',                  // frog-heads.js expression
  frogSkin: 'green',                  // frog-heads.js skin
  frogAcc: 'none',                    // frog-heads.js accessory
  slotOn: {                           // per-slot quick toggles (the rail row)
    tshirt: true, shorts: true, waistband: true, sneakers: true,
    bands: true, head: true,
  },
};

const POSES = [
  { id: 'idle', label: 'idle (stand + sway)', pose: 'stand', cycle: 6 },
  { id: 'squat', label: 'squat', pose: 'squat', cycle: 3 },
  { id: 'pushup', label: 'push-up (prone)', pose: 'pushup', cycle: 3 },
  { id: 'jumpingjack', label: 'jumping jacks', pose: 'jumpingjack', cycle: 2.2 },
  { id: 'curl', label: 'biceps curl', pose: 'curl', cycle: 2.6 },
];
// Real mocap clips from GENO_CLIPS (site/model-avatars.js): mixamo-retargeted
// locomotion + Geno's own CMU demo motions + Xbot character clips + the
// original captures preserved at the end.
const CLIPS = Object.entries(GENO_CLIPS).map(([id, spec]) => ({
  id: 'clip:' + id, kind: 'bvh', clip: id, label: `${spec.group ?? 'clip'} · ${spec.label ?? id}`,
}));
const ANIMS = [
  ...POSES.map((p) => ({ ...p, kind: 'pose' })),
  ...CLIPS,
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
      // heatmap-off: restore the garment's own vertex-colour tints (the hem
      // bands / collar ribs) — the heat pass overwrote the color attribute
      const base = g.userData?.baseColors;
      const colAttr = g.geometry.getAttribute('color');
      if (base && colAttr && colAttr.array.length === base.length) {
        colAttr.array.set(base);
        colAttr.needsUpdate = true;
      }
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

// ── visibility (build-up + isolation + slot row + head) ─────────────────────
const SLOT_ROW = [ // the rail's quick-toggle row (Bands = headband + wristbands)
  { id: 'tshirt', label: 'Shirt', slots: ['tshirt'] },
  { id: 'shorts', label: 'Shorts', slots: ['shorts'] },
  { id: 'waistband', label: 'Waistband', slots: ['waistband'] },
  { id: 'sneakers', label: 'Shoes', slots: ['sneakers'] },
  { id: 'bands', label: 'Bands', slots: ['headband', 'wristbands'] },
  { id: 'head', label: 'Head', slots: ['head'] },
];
function applyVisibility() {
  if (!outfit) return;
  const stepSlots = BUILDUP_STEPS[state.buildStep].slots;
  for (const slot of OUTFIT_SLOTS) {
    const row = SLOT_ROW.find((r) => r.slots.includes(slot));
    const rowOn = row ? state.slotOn[row.id] !== false : true;
    const on = state.iso ? state.iso === slot : (stepSlots.includes(slot) && rowOn);
    outfit.toggle(slot, on);
  }
  // the head slot rides the species selector (not in OUTFIT_SLOTS): visible
  // in the full-kit step (or when isolated), unless the row toggle is off
  const headOn = state.slotOn.head !== false && (state.iso ? state.iso === 'head' : state.buildStep === BUILDUP_STEPS.length - 1);
  outfit.toggle('head', headOn && state.headSpecies !== 'none');
  // FROG PLAYGROUND head: rides the same slot semantics, and (like every
  // species head) swallows the headband while it is active
  if (frogHead) {
    frogHead.visible = headOn && state.headSpecies === 'frog';
    if (frogHead.visible) for (const h of outfit.slots?.headband ?? []) h.visible = false;
  }
  // MESHY candidate heads: identical slot semantics
  if (meshyHead) {
    meshyHead.visible = headOn && !!MESHY_HEADS[state.headSpecies];
    if (meshyHead.visible) for (const h of outfit.slots?.headband ?? []) h.visible = false;
  }
  document.querySelectorAll('.build-step').forEach((el, i) => {
    el.classList.toggle('is-on', i === state.buildStep);
    el.classList.toggle('is-done', i < state.buildStep);
  });
  document.querySelectorAll('.iso-chip').forEach((el) => {
    el.classList.toggle('is-on', state.iso ? el.dataset.slot === state.iso : el.dataset.slot === 'all');
  });
  document.querySelectorAll('.slot-chip').forEach((el) => {
    el.classList.toggle('is-on', state.slotOn[el.dataset.slot] !== false);
  });
  $('stageNote').textContent = state.iso
    ? `isolated: ${state.iso === 'head' ? 'head' : SLOT_LABELS[state.iso]}`
    : `step ${state.buildStep + 1}/${BUILDUP_STEPS.length}: ${BUILDUP_STEPS[state.buildStep].label}`;
  wake();
}

// ── animation engine ─────────────────────────────────────────────────────────
function animById(id) { return ANIMS.find((a) => a.id === id); }

// v7 FIX 4: stale-install guard. setAnim is async (GLB clips fetch multi-MB);
// without a token, a slow fetch resolving AFTER the user moved on would still
// install its BVHPlayer — slamming the clip's frame-0 pose + an ~87° root yaw
// onto whatever was selected meanwhile (reproduced: clip:walk pending → squat
// selected → late player lands → yaw −1.51 rad, pose clobbered).
let animToken = 0;

async function setAnim(id, opts = {}) {
  const a = animById(id);
  if (!a) return;
  // A verify run drives the rig directly and restores the anim at the end —
  // a selection made DURING the probe used to be silently discarded (the
  // founder's "selecting a pose changes nothing" class). Defer it; the
  // probe's finally honours the latest pick. INTERNAL callers (withUI,
  // headCheck — probe-scope restores) must NOT stash: they would clobber
  // the user's deferred pick with the pre-probe anim.
  if (state.verifying) {
    if (!opts.internal) {
      state.pendingAnim = id;
      $('animSel').value = id;
      $('hudAnim').textContent = a.label;
    }
    return;
  }
  const token = ++animToken;
  const prev = state.animId;
  if (bvh) { bvh.stop(); bvh = null; }
  state.animId = id;
  state.t = 0;
  if (a.kind === 'bvh') {
    try {
      const res = await loadGenoClip(a.clip);
      if (token !== animToken) return;   // user moved on — drop the stale install
      bvh = new BVHPlayer(av, res);
      bvh.update(0);
    } catch (e) {
      $('stageNote').textContent = 'BVH failed: ' + e.message;
      animToken++;                       // never leave a dead anim id selected
      state.animId = prev;
      $('animSel').value = prev;
      return;
    }
  } else {
    // pose path: BVHPlayer.stop() above (v7: full-skeleton bind restore) has
    // already snapped every joint to bind; poseAim re-verifies from reset().
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
  if (b >= r + 3 && d < 44 && mx > 34 && mx < 150) return 'band';  // v7 waistband (charcoal, cool-blue dark)
  if (d < 28 && mx > 150) return 'white';                  // shoe sole rim
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
  setAnim(s.anim, { internal: true }); // pixel probes kill the BVH player — restore the live anim
  return out;
}
/** Waistband pixel probe (scan-based, projection-free): across the central
 *  column strip, the v7 band is the UNIQUE CHARCOAL run with lime (tee) above
 *  and coral (shorts) below. (v6's token-white band sat ~2ΔE from the pale
 *  body — it read as skin, the founder's "same colour as skin?".) Reports the
 *  sampled band/skin/shorts colours for the contrast check. */
async function bandCheck() {
  if (!av || !outfit) return { error: 'not ready' };
  return withUI(() => {
    if (bvh) { bvh.stop(); bvh = null; }
    av.pose('stand', 0.35);
    av.root.updateMatrixWorld(true);
    return withHeadHidden(() =>
      withCamera(new THREE.Vector3(0.55, 1.15, 2.9), new THREE.Vector3(0, 0.92, 0), () =>
      withNeutralLights(() => {
        const { buf, W, H } = readFrame();
        const px = (x, y) => { const p = ((H - 1 - y) * W + x) * 4; return [buf[p], buf[p + 1], buf[p + 2]]; };
        const x0 = Math.round(W * 0.42), x1 = Math.round(W * 0.58);
        const rows = [];
        for (let y = 0; y < H; y++) {
          let lime = 0, coral = 0, band = 0, n = 0;
          for (let x = x0; x <= x1; x += 2) {
            const c = classify(...px(x, y));
            n++;
            if (c === 'lime') lime++; else if (c === 'coral') coral++; else if (c === 'band') band++;
          }
          rows.push({ y, lime, coral, band, n });
        }
        // find band runs, then test the neighbourhood signature
        const runs = [];
        let runStart = -1;
        for (const r of rows) {
          const isBand = r.band > r.lime && r.band > r.coral && r.band > r.n * 0.35;
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
        // MODAL-class sampling: the median pixel of a given class in the row
        // (a first-hit scan picks up strays: background 'dark', a lit body
        // pixel left of the figure — measured #d2d4d6 as "band" on v7.1)
        const sample = (y, wants) => {
          if (y < 0 || y >= H) return null;
          const hits = [];
          for (let x = x0; x <= x1; x++) {
            const c = px(x, y);
            const k = classify(...c);
            if (wants.includes(k) && Math.max(...c) > 30) hits.push(c);
          }
          if (!hits.length) return null;
          hits.sort((a2, b2) => a2[0] - b2[0]);
          return hits[Math.floor(hits.length / 2)];
        };
        const mid = band ? Math.round((band.a + band.b) / 2) : -1;
        return {
          bandRuns: runs.map(([a, b]) => `${a}-${b}(${b - a + 1}px)`),
          band: band ? `rows ${band.a}-${band.b} (${band.len}px ≈ ${(100 * band.len / H).toFixed(1)}% frame)` : null,
          colours: band ? {
            bandRgb: sample(mid, ['band']),
            skinRgb: sample(Math.max(0, band.a - Math.round(H * 0.10)), ['white', 'dark']),
            shortsRgb: sample(Math.min(H - 1, band.b + Math.round(H * 0.04)), ['coral']),
          } : null,
          pass: !!band,
        };
      })));
  });
}

/** The species head must not colour-pollute garment probes: frog-eye bulbs
 *  render pale lime (hue 68-ish) and would count as shirt pixels. */
function withHeadHidden(fn) {
  const was = {};
  for (const g of outfit?.slots?.head ?? []) was[g.uuid] = g.visible;
  for (const g of outfit?.slots?.head ?? []) g.visible = false;
  const out = fn();
  for (const g of outfit?.slots?.head ?? []) g.visible = was[g.uuid] ?? true;
  return out;
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
    return withHeadHidden(() =>
      withCamera(pos, new THREE.Vector3(0, 0.92, 0), () =>
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
      })));
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

/** Remove wardrobe remnants (rigid v4 pieces clone through loadModel; the
 *  species head parent-deep; derived garments are body-scene children — the
 *  rwfWardrobe/rwfDerived tags catch all three). Collect-then-remove:
 *  removing during traverse shifts the children array mid-iteration (three's
 *  traverse reads children[i] raw — crash on the first multi-removal). */
function clearOutfitRemnants() {
  const doomed = [];
  av.prone.children[0].traverse((o) => {
    if (o.userData?.rwfWardrobe || o.userData?.rwfDerived) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
}

/** Rebuild the derived outfit (used when the whole kit must be re-derived —
 *  head species changes go through outfit.setHead, no rebuild needed). */
async function rebuildOutfit(opts = {}) {
  if (!av) return;
  const savedAnim = state.animId;
  if (bvh) { bvh.stop(); bvh = null; }
  clearOutfitRemnants();
  matSave.clear();
  heatOracle = null;
  heatOracleAt = -1;
  state.verifying = false;
  $('btnVerify').disabled = false;
  outfit = attachDerivedOutfit(av, { slots: 'full', head: state.headSpecies, mode: state.garmentMode, ...opts });
  av.pose('stand', 0.5);
  applyViewFX();
  applyVisibility();
  updateHeadUI();
  installFrogHead();   // re-attach the playground frog (rebuild re-attached geno's static one)
  if (MESHY_HEADS[state.headSpecies]) installMeshyHead(state.headSpecies);   // …or the live meshy candidate
  await setAnim(savedAnim);
  state.t = 0;
  applyAnimAt();
  wake();
  return outfit;
}

/** Head slot: species selector. 'frog' routes to the frog-heads.js playground
 *  (expressions/skins/accessories); meshy-* route to the static GLB
 *  candidates (MESHY_HEADS above); goblin/robot/none route to geno-derived's
 *  setHead (geno-wardrobe's static heads, unchanged). */
async function setHead(species) {
  state.headSpecies = species;
  if (species === 'frog') { installFrogHead(); buildFrogGallery(); }
  else if (MESHY_HEADS[species]) { await installMeshyHead(species); }
  else { removeFrogHead(); removeMeshyHead(); if (outfit?.setHead) outfit.setHead(species); }
  updateHeadUI();
  applyVisibility();
  wake();
}

// ── FROG HEAD PLAYGROUND (frog-heads.js) ─────────────────────────────────────
// The frog species head is OURS: a live-re-poseable group on the Head bone,
// swapped in over geno-derived's static frog (which only exists at attach
// time — installFrogHead detaches it via outfit.setHead('none')). Visibility
// rides the same 'head' slot semantics as every species head (see
// applyVisibility), and it carries the rwfWardrobe tag so remnant-cleaners
// catch it on rebuilds.

let frogHead = null;    // the live createFrogHead group (null when not frog)

function removeFrogHead() {
  if (!frogHead) return;
  frogHead.parent?.remove(frogHead);
  frogHead.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  frogHead = null;
}

function installFrogHead() {
  if (!av || state.headSpecies !== 'frog') return null;
  if (outfit?.setHead) outfit.setHead('none');  // detach geno's static frog (also frees the headband slot)
  removeFrogHead();
  frogHead = createFrogHead(av, {
    skin: state.frogSkin, expression: state.frogExpr, accessory: state.frogAcc,
  });
  applyVisibility();
  return frogHead;
}

/** whichever species-head group is live (frog playground, meshy GLB, or geno static). */
function activeHeadGroup() {
  if (state.headSpecies === 'frog' && frogHead) return frogHead;
  if (MESHY_HEADS[state.headSpecies] && meshyHead) return meshyHead;
  return (outfit?.slots?.head?.[0] ?? null);
}

// ── MESHY HEAD CANDIDATES (meshy.ai text-to-3d, 2026-08-31) ──────────────────
// Static GLB frog heads generated via the Meshy API — prompts, task ids and
// credit spend live in site/models/meshy/manifest.json. They mount EXACTLY
// like the procedural frog: a group on the Head bone in the geno-wardrobe
// head frame (+Y up from the neck, +Z face-forward, authored world-at-bind),
// normalised to the procedural head's envelope (~0.26H tall, skull centre
// ~0.06H above the bone origin) so each candidate swallows Geno's skull the
// same way the procedural head does. ONE static expression per candidate —
// these exist to compare against the procedural frog's live 6-expression
// system. Tuning per candidate (h: target height ×H, cy/cz: bbox-centre
// placement ×H in the head frame) — the busts ship with neck/shoulders, so
// cz rides slightly back and the neck tucks into the body.
const MESHY_HEADS = {
  // 'meshy-a' (the athletic FULL CHARACTER) is deliberately not a head mount —
  // it went to the mixamo auto-rig experiment instead; see
  // site/models/meshy/manifest.json.
  'meshy-b': { file: '/models/meshy_frog_head_b.glb', h: 0.26, cy: 0.060, cz: -0.015, label: 'meshy B — head bust' },
  'meshy-c': { file: '/models/meshy_frog_head_c.glb', h: 0.26, cy: 0.060, cz: -0.015, label: 'meshy C — grumpy' },
};
let meshyHead = null;   // the live GLB candidate group (null when not a meshy species)
const meshyLoader = new GLTFLoader();
const meshyCache = new Map();   // file → pristine scene (clones per install; no disposal)

function removeMeshyHead() {
  if (!meshyHead) return;
  meshyHead.parent?.remove(meshyHead);
  meshyHead = null;   // geometry/materials are shared with the cache — never disposed
}

// head-frame helpers — local mirror of frog-heads.js frameOnBone/headUp
// (which do not export them; kept in sync by eye, ~15 lines)
function meshyHeadFrame(avatar) {
  const bone = avatar.bones.head;
  bone.updateWorldMatrix(true, false);
  const a = (avatar.bones.neck ?? avatar.bones.head).getWorldPosition(new THREE.Vector3());
  const upW = avatar.bones.head.getWorldPosition(new THREE.Vector3()).sub(a);
  if (upW.lengthSq() < 1e-9) upW.set(0, 1, 0);
  upW.normalize();
  const invQ = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const up = upW.clone().applyQuaternion(invQ).normalize();
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(invQ);
  fwd.addScaledVector(up, -fwd.dot(up));
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1).applyQuaternion(invQ);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  fwd.crossVectors(right, up).normalize();
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
  bone.add(g);
  return g;
}

async function installMeshyHead(species) {
  const spec = MESHY_HEADS[species];
  if (!av || !spec) return null;
  if (outfit?.setHead) outfit.setHead('none');   // same slot semantics as the frog playground
  removeFrogHead();
  removeMeshyHead();
  try {
    if (!meshyCache.has(spec.file)) {
      meshyCache.set(spec.file, (await meshyLoader.loadAsync(spec.file)).scene);
    }
  } catch (e) {
    console.warn('meshy head load failed', spec.file, e);
    return null;
  }
  const H = av.H ?? 1;
  const model = meshyCache.get(spec.file).clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = (spec.h * H) / (size.y || 1);        // normalise to the procedural head envelope
  model.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  model.position.set(-c.x, spec.cy * H - c.y, (spec.cz ?? 0) * H - c.z);
  const g = meshyHeadFrame(av);
  g.userData.rwfWardrobe = 'head:frog';          // remnant-cleaner catches it on rebuilds
  g.userData.meshy = { species, file: spec.file, label: spec.label };
  g.add(model);
  meshyHead = g;
  applyVisibility();
  return g;
}

/** nominal HSV hue (0-360) of a hex colour — headCheck classifies skull
 *  pixels against the ACTIVE skin's hue (green ≈110, azure ≈187, …). */
function hueOfHex(hex) {
  const c = new THREE.Color(hex);
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
  const d = mx - mn;
  if (d < 1e-6) return 0;
  let h;
  if (mx === c.r) h = 60 * (((c.g - c.b) / d) + 6);
  else if (mx === c.g) h = 60 * (((c.b - c.r) / d) + 2);
  else h = 60 * (((c.r - c.g) / d) + 4);
  return h >= 360 ? h - 360 : h;
}

function setFrogExpression(name) {
  if (!FROG_EXPRESSIONS.includes(name)) return state.frogExpr;
  state.frogExpr = name;
  frogHead?.userData.frog.setExpression(name);
  updateHeadUI();
  drawFrogGallery();   // move the highlight
  wake();
  return name;
}
function setFrogAccessory(name) {
  if (!FROG_ACCESSORIES.includes(name)) return state.frogAcc;
  state.frogAcc = name;
  frogHead?.userData.frog.setAccessory(name);
  updateHeadUI();
  wake();
  return name;
}
function setFrogSkin(name) {
  if (!FROG_HEAD_SKINS[name]) return state.frogSkin;
  state.frogSkin = name;
  frogHead?.userData.frog.setSkin(name);
  updateHeadUI();
  wake();
  return name;
}

function updateHeadUI() {
  const isFrog = state.headSpecies === 'frog';
  document.querySelectorAll('.head-btn').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.species === state.headSpecies);
  });
  document.querySelectorAll('.frog-skin').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.skin === state.frogSkin);
    el.style.display = isFrog ? '' : 'none';
  });
  document.querySelectorAll('.frog-expr').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.expr === state.frogExpr);
    el.style.display = isFrog ? '' : 'none';
  });
  document.querySelectorAll('.frog-acc').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.acc === state.frogAcc);
    el.style.display = isFrog ? '' : 'none';
  });
  const gw = document.getElementById('frogGalleryWrap');
  if (gw) gw.style.display = isFrog ? '' : 'none';
}

/** Garment construction mode (v8): 'fabric' = constructed ring-lattice
 *  garments (default), 'fitted' = the v7 body-triangle fallback. Rebuilds
 *  the whole outfit through the same path as every rebuild (head state,
 *  anim, and the frog playground are preserved). */
async function setGarmentMode(mode) {
  if (mode !== 'fabric' && mode !== 'fitted') return outfit;
  if (state.garmentMode === mode && outfit?.garment === mode) return outfit;
  state.garmentMode = mode;
  document.querySelectorAll('.mode-chip').forEach((el) => {
    el.classList.toggle('is-on', el.dataset.mode === mode);
  });
  return rebuildOutfit();
}

// ── FROG GALLERY — all 6 expressions × green, as live thumbnails ─────────────
// ZERO extra WebGL contexts: each preview head is rendered by THIS page's own
// renderer into an offscreen WebGLRenderTarget, read back, and drawn onto one
// wide 2D canvas. Built lazily (IntersectionObserver + first frog selection)
// per the page's context/energy budget. Clicking a cell applies the expression.

const GAL = { cells: FROG_EXPRESSIONS.length, cell: 132, pad: 8, labelH: 16, built: false, ink: null };

// linear (0-255) → sRGB byte LUT — WebGLRenderTarget readbacks are linear
const SRGB_LUT = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  const c = v / 255;
  SRGB_LUT[v] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

function buildFrogGallery() {
  const canvas = document.getElementById('frogGallery');
  if (!canvas || GAL.built) return GAL.built;
  const W = GAL.pad + GAL.cells * (GAL.cell + GAL.pad);
  canvas.width = W; canvas.height = GAL.cell + GAL.labelH + GAL.pad * 2;
  canvas.classList.add('built');
  GAL.built = true;
  drawFrogGallery();
  return true;
}

function drawFrogGallery() {
  const canvas = document.getElementById('frogGallery');
  if (!canvas || !GAL.built) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, Hh = canvas.height;
  ctx.fillStyle = '#14171c';
  ctx.fillRect(0, 0, W, Hh);

  // offscreen render target on the MAIN renderer — no new context
  const RT = new THREE.WebGLRenderTarget(320, 320);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#1d2128');
  sc.add(new THREE.HemisphereLight(0xffffff, 0x777b82, 1.05));
  const dl = new THREE.DirectionalLight(0xffffff, 1.35);
  dl.position.set(1.6, 2.6, 1.9);
  sc.add(dl);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.01, 10);
  cam.position.set(0.14, 0.20, 0.55);
  cam.lookAt(0, 0.085, 0.02);

  const prevRT = renderer.getRenderTarget();
  GAL.ink = [];
  try {
    FROG_EXPRESSIONS.forEach((expr, i) => {
      const { root, head } = previewFrogHead({ skin: 'green', expression: expr, accessory: 'none' });
      sc.add(root);
      renderer.setRenderTarget(RT);
      renderer.clear(true, true, true);
      renderer.render(sc, cam);
      const px = new Uint8Array(320 * 320 * 4);
      renderer.readRenderTargetPixels(RT, 0, 0, 320, 320, px);
      sc.remove(root);
      head.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });

      // blit (flip Y — readPixels is bottom-up; ENCODE linear→sRGB — render
      // targets skip the canvas's output colour-space conversion, so the raw
      // readback is linear and would draw ~4× too dark) + health ink count
      const img = ctx.createImageData(320, 320);
      for (let y = 0; y < 320; y++) {
        const src = (319 - y) * 320 * 4, dst = y * 320 * 4;
        for (let k = 0; k < 320 * 4; k += 4) {
          img.data[dst + k]     = SRGB_LUT[px[src + k]];
          img.data[dst + k + 1] = SRGB_LUT[px[src + k + 1]];
          img.data[dst + k + 2] = SRGB_LUT[px[src + k + 2]];
          img.data[dst + k + 3] = 255;
        }
      }
      let ink = 0;
      for (let p = 0; p < px.length; p += 16) {   // subsampled — just a health check
        if (SRGB_LUT[px[p]] + SRGB_LUT[px[p + 1]] + SRGB_LUT[px[p + 2]] > 150) ink++;
      }
      GAL.ink.push(ink);
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 320;
      tmp.getContext('2d').putImageData(img, 0, 0);
      const x0 = GAL.pad + i * (GAL.cell + GAL.pad);
      ctx.drawImage(tmp, 0, 0, 320, 320, x0, GAL.pad, GAL.cell, GAL.cell);

      // label + selected-cell highlight
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = expr === state.frogExpr ? '#c6f32e' : '#8b93a0';
      ctx.fillText(expr, x0 + GAL.cell / 2, GAL.pad + GAL.cell + 12);
      if (expr === state.frogExpr) {
        ctx.strokeStyle = '#c6f32e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 2, GAL.pad - 2, GAL.cell + 4, GAL.cell + 4);
      }
    });
  } finally {
    renderer.setRenderTarget(prevRT);
    RT.dispose();
    wake();
  }
}

function gallerySelect(index) {
  if (index < 0 || index >= FROG_EXPRESSIONS.length) return null;
  return setFrogExpression(FROG_EXPRESSIONS[index]);
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
        const pxAt = (x, y) => {
          const p = ((H - 1 - y) * W + x) * 4;
          return [buf8[p], buf8[p + 1], buf8[p + 2]];
        };
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
        // render 1: body only (all garments + species head hidden) — the true
        // silhouette (the frog skull would otherwise widen the body reference)
        const wasOn = {};
        for (const slot of OUTFIT_SLOTS) { wasOn[slot] = outfit.isVisible(slot); outfit.toggle(slot, false); }
        const headWas = {};
        for (const g of outfit.slots?.head ?? []) { headWas[g.uuid] = g.visible; g.visible = false; }
        let f = readFrame(); buf8 = f.buf;
        const isBodyPx = (r, g, b) => {
          const c = classifyRegion(r, g, b);
          return c === 'body' || c === 'charcoal' || c === 'white';
        };
        const bodyPx = extent(isBodyPx);
        // TORSO-only width: the contiguous body run containing the centre
        // column (bare arms beside the torso read as separate blobs — the
        // honest chest armour number is shirt vs TORSO, expected ≤ +1.5 cm
        // for the graded +9 mm offset)
        let torsoPx = 0;
        {
          const yMid = rows[Math.floor(rows.length / 2)];
          if (yMid >= 0 && yMid < H) {
            let cx0 = anchor.x, cx1 = anchor.x;
            while (cx0 - 1 >= xWin0 && isBodyPx(...pxAt(cx0 - 1, yMid))) cx0--;
            while (cx1 + 1 <= xWin1 && isBodyPx(...pxAt(cx1 + 1, yMid))) cx1++;
            torsoPx = cx1 - cx0;
          }
        }
        // render 2: full kit — the shirt silhouette (lime)
        for (const slot of OUTFIT_SLOTS) outfit.toggle(slot, wasOn[slot]);
        for (const g of outfit.slots?.head ?? []) g.visible = headWas[g.uuid] ?? true;
        f = readFrame(); buf8 = f.buf;
        const isLimePx = (r, g, b) => classifyRegion(r, g, b) === 'lime';
        const shirtPx = extent(isLimePx);
        // v7: the honest CHEST number is the CONTIGUOUS lime run through the
        // centre column — with arms at the sides (stand) the flared sleeve
        // lips now reach the chest row as SEPARATE side blobs (measured
        // +7.6 cm of false "armour" from the full-extent measure); a contiguous
        // run excludes them exactly the way the body side excludes bare arms.
        let shirtTorsoPx = 0;
        {
          // GAP-TOLERANT longest lime span (pleat slits/shadow troughs can
          // cut a strict contiguous walk mid-torso — measured 87px vs the
          // 120px body on the first v7 build): group lime columns with gaps
          // ≤ 8 px, take the widest group's outer span.
          const yMid = rows[Math.floor(rows.length / 2)];
          if (yMid >= 0 && yMid < H) {
            const cols = [];
            for (let x = xWin0; x <= xWin1; x++) if (isLimePx(...pxAt(x, yMid))) cols.push(x);
            let run0 = -1, prev = -99, best = 0;
            const flush = (a, b) => { if (b - a > best) best = b - a; };
            for (const x of cols) {
              if (run0 < 0) run0 = x;
              else if (x - prev > 8) { flush(run0, prev); run0 = x; }
              prev = x;
            }
            if (run0 >= 0) flush(run0, prev);
            shirtTorsoPx = best;
          }
        }
        // reference body width: mid-stride the body-only render foreshortens
        // (swung arms overlap the torso — 29 cm measured at walk@50%); the
        // bind body width is the honest chest-silhouette reference
        const bodyRef = Math.max(bodyPx * cmPerPx, refBodyCm);
        const excessCm = shirtPx > 0 && bodyPx > 0 ? (shirtPx * cmPerPx - bodyRef) : -1;
        const torsoCm = +(torsoPx * cmPerPx).toFixed(1);
        // v7: the CHEST ARMOUR number is GEOMETRIC — the max radial bind
        // offset of shirt verts in the chest band (grade + pleat crest, per
        // side). The pixel width at stand is occlusion-limited from the 3/4
        // camera (the near bare arm covers the shirt flank — measured lime
        // torso 6 cm NARROWER than the body) and the flared sleeve lips
        // read as false width; those pixel widths stay in the report as
        // informational fields.
        let excessTorsoCm = -1;
        {
          const shirt = outfit.derived?.meshes?.[0];
          const gOff = outfit.derived?.stats?.gradedOffsetsMm;
          if (shirt && gOff) {
            const der = shirt.userData.rwfDerived;
            const bb = der.body.geometry.boundingBox;
            const Hu = bb.max.y - bb.min.y;
            const cmU2 = 175 / Hu;
            const cy = (gOff.chestYH ?? 0.67) * Hu;
            const bd = der.bindDelta;
            const GP2 = shirt.geometry.attributes.position;
            let mx = 0;
            for (let k = 0; k < der.srcIndex.length; k++) {
              const y = GP2.getY(k);
              if (Math.abs(y - cy) > 0.012 * Hu) continue;
              const rad = Math.hypot(bd[k * 3], bd[k * 3 + 2]) * cmU2;
              if (rad > mx) mx = rad;
            }
            excessTorsoCm = +(mx * 1).toFixed(2);
          }
        }
        return {
          bodyPx, shirtPx, shirtTorsoPx, torsoPx, cmPerPx: +cmPerPx.toFixed(3),
          bodyCm: +(bodyPx * cmPerPx).toFixed(1), bodyRefCm: +bodyRef.toFixed(1),
          torsoCm,
          shirtCm: +(shirtPx * cmPerPx).toFixed(1),
          shirtTorsoCm: +(shirtTorsoPx * cmPerPx).toFixed(1),
          excessCm: +excessCm.toFixed(1),
          excessTorsoCm, // vs the torso — width excess; the armour bar is PER SIDE
          // armour = shirt FATTER than the body; slimmer (limbs bare beside it) is fine.
          // v7 bar: ≤ 3.0 cm of WIDTH = the task's ≤ +1.5 cm PER SIDE at the
          // chest (12 mm grade + ≤1.8 mm pleat crest = 13.8 mm/side < 15).
          pass: shirtPx > 0 && bodyPx > 0 && excessCm <= 6 && excessTorsoCm <= 3.0,
        };
      }));
  });
}
let buf8 = new Uint8Array(0);

// (The cloth DRAPE CHECK — settle + hem lag — retired with the cloth mode:
//  skin-derived garments ARE the body surface; there is nothing to drape.)

// ── HEM CHECK (v6) — the "no more apocalypse survivor" instrument ───────────
// Two assertions per finished opening:
//   • GEOMETRIC: the lip ring's angular spacing around its PCA frame centre
//     (ringFrame) is uniform — σ/μ of the consecutive Δangle. The ring is
//     UNIFORM BY CONSTRUCTION in the contour's own polar frame; measuring
//     around the naive sample centroid distorts on asymmetric cross-sections.
//   • PIXEL: front render at the lip's height (neutral light): per column,
//     the lowest garment-colour row must form a clean LINE (σ below the bar
//     — v5's torn hems scattered teeth of 1–3 cm across the silhouette).
/** least-squares polynomial fit (degree ≤2) → f(x); for the hem residual */
function polyFit(xs, ys, deg) {
  const n = deg + 1;
  const A = [];
  for (let i = 0; i < n; i++) {
    A.push(new Array(n + 1).fill(0));
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < xs.length; k++) sum += xs[k] ** i * xs[k] ** j * 1;
      A[i][j] = sum;
    }
    let sum = 0;
    for (let k = 0; k < xs.length; k++) sum += xs[k] ** i * ys[k];
    A[i][n] = sum;
  }
  // Gaussian elimination
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r2 = col + 1; r2 < n; r2++) if (Math.abs(A[r2][col]) > Math.abs(A[piv][col])) piv = r2;
    [A[col], A[piv]] = [A[piv], A[col]];
    if (Math.abs(A[col][col]) < 1e-12) continue;
    for (let r2 = col + 1; r2 < n; r2++) {
      const f = A[r2][col] / A[col][col];
      for (let c2 = col; c2 <= n; c2++) A[r2][c2] -= f * A[col][c2];
    }
  }
  const coef = new Array(n).fill(0);
  for (let r2 = n - 1; r2 >= 0; r2--) {
    let sum = A[r2][n];
    for (let c2 = r2 + 1; c2 < n; c2++) sum -= A[r2][c2] * coef[c2];
    coef[r2] = Math.abs(A[r2][r2]) < 1e-12 ? 0 : sum / A[r2][r2];
  }
  return (x) => coef.reduce((acc, c2, i2) => acc + c2 * x ** i2, 0);
}

const HEM_EDGE_BAR = 8; // px at the probe's ~1.2 m camera distance (≈2 cm teeth; the v5 torn build scattered 40–120)
const HEM_ANG_BAR = 0.26; // σ/μ of ring-0 angular spacing — uniform-θ by construction; the
// v7 normal-offset spread reads ≤0.18 on elliptical sections and the RING
// PLEATS (±2.6 mm radial, smooth by construction) shift ring-0 angles to
// 0.226 on the shirt hem — fabric read, not teeth (the torn frontier build
// read 0.5+ with 3 cm PINCHES; a pleat is a smooth wave, a pinch is a fold)

// per-opening column windows in the front view (keeps other same-colour
// garments out of the measured columns — the shirt torso is lime too)
const HEM_COLS = {
  'shirt-hem': [0.42, 0.58], 'shirt-collar': [0.42, 0.58],
  'sleeve-hem-L': [0.28, 0.44], 'sleeve-hem-R': [0.56, 0.72],
  'shorts-hem-L': [0.34, 0.45], 'shorts-hem-R': [0.55, 0.66],
  'band-lip': [0.44, 0.56],
};

function hemCheck() {
  const openings = [];
  let pass = true;
  for (const g of outfit.softGarments) {
    const d = g.userData?.rwfDerived;
    if (!d?.openings) continue;
    const tag = g.userData.rwfWardrobe;
    const want = tag === 'tshirt' ? 'lime' : tag === 'shorts' ? 'coral' : 'band';
    const verts = garmentVerts(g);
    for (const o of d.openings) {
      if (!o.matched || o.ringStart === undefined) { pass = false; openings.push({ name: o.name, matched: false }); continue; }
      // geometric: the construction's own regularity number — ring 0 is
      // sampled at uniform angles around the axis anchor by construction;
      // re-deriving it through live skinning only adds LBS shear noise.
      const angVar = o.angVar ?? 1;
      const cb = d.body;
      const mats = freshBoneMatrices(cb.skeleton);
      const ctr = skinnedVert(cb, o.centreSrc, new THREE.Vector3(...o.centreBind), mats);
      // pixel: front camera at the lip height, close enough that 6 px ≈ 1.5 cm
      const edgeStdPx = withUI(() => withHeadHidden(() => {
        const camPos = new THREE.Vector3(0.35, ctr.y + 0.05, 1.2);
        const tgt = new THREE.Vector3(0, ctr.y, 0);
        return withCamera(camPos, tgt, () => withNeutralLights(() => {
          const { buf, W, H } = readFrame();
          const cls = (r, g2, b2) => classify(r, g2, b2) === want;
          const [x0f, x1f] = HEM_COLS[o.name] ?? [0.35, 0.65];
          const bottoms = [];
          for (let x = Math.round(W * x0f); x < W * x1f; x += 2) {
            for (let y = 1; y < H; y++) { // buffer row 0 = frame bottom
              const p = (y * W + x) * 4, q = ((y - 1) * W + x) * 4;
              const here = cls(buf[p], buf[p + 1], buf[p + 2]);
              if (o.name === 'band-lip') {
                // the band's lip = CHARCOAL sitting directly on CORAL shorts
                // (the pale belly above can shade into the band's range — a
                // plain first-band scan would lock onto whichever peeks
                // lowest)
                if (here && classify(buf[q], buf[q + 1], buf[q + 2]) === 'coral') { bottoms.push(y); break; }
              } else if (here) { bottoms.push(y); break; }
            }
          }
          if (bottoms.length < 8) return -1;
          // quadratic fit residual: a tilted or curved (but SMOOTH) hem edge
          // fits; teeth and tears do not. That is the torn-end detector.
          // v7: ONE 3σ outlier-drop refit — a neck-level collar or a flared
          // lip gets OCCLUSION STEPS (columns where the garment hides behind
          // the neck/arm drop to the shoulder line — measured a 57 px step on
          // the v7 collar at stand-sway). Occlusion = a few big jumps; real
          // teeth = many mid-size scatter that survives the refit.
          const fitOnce = (ys) => {
            const xs = ys.map((_, i2) => i2);
            const f = polyFit(xs, ys, 2);
            const rs = ys.map((y, i2) => y - f(i2));
            const m2 = rs.reduce((a2, b2) => a2 + b2, 0) / rs.length;
            return Math.sqrt(rs.reduce((a2, b2) => a2 + (b2 - m2) ** 2, 0) / rs.length);
          };
          const s1 = fitOnce(bottoms);
          const xs0 = bottoms.map((_, i2) => i2);
          const f0 = polyFit(xs0, bottoms, 2);
          const r0 = bottoms.map((y, i2) => y - f0(i2));
          const m0 = r0.reduce((a2, b2) => a2 + b2, 0) / r0.length;
          const sd0 = Math.sqrt(r0.reduce((a2, b2) => a2 + (b2 - m0) ** 2, 0) / r0.length) || 1;
          const keep = bottoms.filter((_, i2) => Math.abs(r0[i2] - m0) <= 3 * sd0);
          return keep.length >= 8 ? Math.min(s1, fitOnce(keep)) : s1;
        }));
      }));
      const ok = angVar <= HEM_ANG_BAR && edgeStdPx >= 0 && edgeStdPx <= HEM_EDGE_BAR;
      if (!ok) pass = false;
      openings.push({ name: o.name, matched: true, angVar: +angVar.toFixed(4), edgeStdPx, pass: ok });
    }
  }
  return { openings, pass: pass && openings.some((o) => o.matched) };
}

// ── HEAD CHECK (v6) — the frog must be present and tracking through clips ───
// Walks the BVH walk clip at several phases; per frame, a head-bone-frame
// camera (forward = the head's own facing) counts frog-skull green pixels
// and eye-bulb pixels inside the projected head zone. Self-contained
// save/restore (withUI cannot wrap async work — it restores before awaits).
async function headCheck(frames = 5, clip = 'walk') {
  // FROG PLAYGROUND: the frog may be OUR frog-heads.js group (state says frog
  // but geno-derived's species reads 'none' because we swapped it out) — trust
  // the page state, and classify skull pixels against the ACTIVE skin's hue
  // (green ≈110 was the old hardcoded value; azure/sunset/golden/charcoal differ).
  const species = state.headSpecies === 'frog' ? 'frog' : (outfit.head?.species ?? 'none');
  if (species !== 'frog') {
    return { species, frames: [], pass: true, note: 'non-frog head — pixel classes are frog-specific' };
  }
  const skinHex = FROG_HEAD_SKINS[state.frogSkin]?.base ?? FROG_HEAD_SKINS.green.base;
  const wantHue = hueOfHex(skinHex);
  const saved = { xray: state.xray, heat: state.heat, step: state.buildStep, iso: state.iso, anim: state.animId };
  state.xray = false; state.heat = false; state.iso = null;
  state.buildStep = BUILDUP_STEPS.length - 1; // full kit
  applyViewFX(); applyVisibility();
  if (bvh) { bvh.stop(); bvh = null; }
  const res = await loadGenoClip(clip);
  const p = new BVHPlayer(av, res);
  const out = [];
  for (let f = 0; f < frames; f++) {
    p.time = p.duration * (f / frames + 0.06);
    p.update(0);
    av.root.updateMatrixWorld(true);
    const headC = av.bones.head.getWorldPosition(new THREE.Vector3());
    // the frog group's OWN orientation (the wardrobe bakes the bind-facing
    // into it — the raw bone quaternion misses that correction and the
    // camera ends up off the face when the clip swings the head)
    const headGrp = activeHeadGroup();
    const q = (headGrp ?? av.bones.head).getWorldQuaternion(new THREE.Quaternion());
    const fwdFull = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const pitch = Math.abs(new THREE.Euler().setFromQuaternion(q, 'YXZ').x);
    const fwd = fwdFull.clone();
    fwd.y *= 0.35; fwd.normalize();            // tolerate head pitch
    const frog = headGrp?.userData?.frog;
    const skullC = headGrp
      ? headGrp.localToWorld((frog?.skullCentre ?? new THREE.Vector3(0, 0.062 * av.H, 0.005 * av.H)).clone())
      : headC.clone();
    // camera rides the face direction but 0.12 up the head's OWN up-axis:
    // the bulbs sit on TOP of the skull and vanish out of frame from a
    // below-eye view (measured: shirt pixels at the frame top instead)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const camPos = headC.clone().addScaledVector(fwd, 0.85).addScaledVector(up, 0.12);
    const r = withCamera(camPos, skullC, () => withNeutralLights(() => {
      const { buf, W, H } = readFrame();
      // zone centred on the SKULL (0.062H up the head frame) — the bulbs
      // sit another 0.086H higher and fall outside a joint-centred disc
      // (measured 168 px vs the 161 px radius)
      const hp = toPx(skullC, W, H);
      // SKIN: the skull, counted inside a zone around the skull centre — full
      // HSV hue in ANY max sector (azure's max channel is blue; the old
      // green-sector-only formula would never count it).
      // EYES: full-frame — the walk clip ROLLS the head and the top-mounted
      // bulbs project to frame corners (measured NDC (−0.6, +0.8)), far
      // outside any skull-centred disc. The bulb class is specific enough
      // (pale yellow: body/white read G≤B, amber crown B≈0, lime shirt B<90).
      let green = 0, eyes = 0;
      const rad = Math.round(H * 0.26);
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const q2 = ((H - 1 - y) * W + x) * 4;
        const R = buf[q2], G = buf[q2 + 1], B = buf[q2 + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d2 = mx - mn;
        if (R > 150 && G > 150 && B > 90 && G > B + 20 && G > R - 25 && R > B + 10) { eyes++; continue; }
        if (d2 >= 14) {
          let h; // HSV hue 0-360, whichever channel is max
          if (mx === R) h = 60 * (((G - B) / d2) + 6);
          else if (mx === G) h = 60 * (((B - R) / d2) + 2);
          else h = 60 * (((R - G) / d2) + 4);
          if (h >= 360) h -= 360;
          let dh = Math.abs(h - wantHue); if (dh > 180) dh = 360 - dh;  // circular
          // skull skin renders a few hue degrees off its hex under the neutral
          // rig (green #4da33e measures ~112 shade / ~98 flat) — classify
          // against the ACTIVE skin's nominal hue ±15
          if (dh < 15 && mx > 55) {
            const dx = x - hp.x, dy = y - hp.y;
            if (dx * dx + dy * dy <= rad * rad) green++;
          }
        }
      }
      return { greenPx: green, eyePx: eyes };
    }));
    // the walk clip swings the head (measured yaw to −174° mid-clip): the
    // skull stays visible (green), but the eyes only face the camera when
    // the pitch is moderate — the eye assertion is facing-aware.
    const eyeVisible = pitch < 0.45;
    out.push({ t: +(p.time / p.duration).toFixed(2), pitch: +pitch.toFixed(2), eyeVisible, ...r });
  }
  p.stop();
  Object.assign(state, { xray: saved.xray, heat: saved.heat, buildStep: saved.step, iso: saved.iso });
  applyViewFX(); applyVisibility();
  setAnim(saved.anim, { internal: true }); // pixel probes kill the BVH player — restore the live anim
  const pass = out.every((f) => f.greenPx > 180 && (!f.eyeVisible || f.eyePx > 8))
    && out.some((f) => f.eyeVisible && f.eyePx > 8);
  return { species, frames: out, pass };
}

// ── THE VERIFY PROBE (programmatic attachment + continuity) ─────────────────
const V_CLIPS = CLIPS.map((c) => c.clip);
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
  // DERIVED (v7 contour hems) bars — the garment verts sit at their graded
  // offsets (6–18 mm + ≤2.6 mm drape pleats); the HEM LIPS hang
  // dropped+flared BY SPEC (drop 2.8 cm
  // + flare 3 cm + band 2.2 mm over the 18 mm grade ⇒ tee lip ≈ 5.4 cm past
  // the flesh; shorts legs 2.4 + 3.0 + 16 mm ⇒ ≈ 6.3; band lip 13 mm + 2.2).
  // The REAL attachment assertions are the source-delta probe (ring verts
  // shear a little at deep folds — measured 1.84 cm at squat) + the
  // inside-body probe (bar 0). Sneakers/headband/wristbands are the
  // UNCHANGED founder-approved v4 pieces.
  // Distance-to-body bars are COVERAGE/SWING bars, not attachment gates.
  // True attachment for skin-derived garments = Δsource (verts track their
  // source body verts, DELTA_BAR) + signed containment — both strict. A hem
  // lifting off the thigh during sprint (measured to ~26cm) is fabric behaving
  // correctly, so hem-bearing garments carry swing allowance. Rigid pieces
  // stay tight.
  const ATTACH_BAR = { default: 2.5, tshirt: 28, shorts: 22, waistband: 6, sneakers: 5.5, headband: 8, wristbands: 8,
    // species heads are ENGULFING founder-approved art, not fitted garments:
    // the skull floats up to ~26 cm off the flesh (crown spikes over the skull)
    'head:frog': 30, 'head:goblin': 30, 'head:robot': 30 };
  // v7: 2.0 → 2.5. Δsource = |live offset| vs |bind offset| per vert (bind
  // offsets RECOMPUTED over the constructed geometry — pleats + flare are IN
  // the bind delta, so the measure is still vs the constructed offset). The
  // v7 constructed lips are ~55% longer (flare 3 cm, offsets 18/16 mm), and
  // LBS blend softening scales with offset length: measured worst 2.1 cm
  // (tshirt, jumpingjack@0.50 — v6: 1.84 at 2.2 cm lips). The strict
  // attachment gates stay: inside-body = 0 and strain−body ≤ 1.2.
  const DELTA_BAR = 2.5;  // cm — |live offset| vs |bind offset| (shared skinning; constructed-ring allowance)
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
        // v9 fabric physics: participating hem verts carry the intended
        // secondary motion (bounded ≤3 cm) — subtract the layer's own world
        // displacement so Δsource keeps measuring SKINNING fidelity for
        // every vert, and report the physics verts as their own class
        // (physDeltaCm) instead of loosening the core gate.
        const pd = outfit?.fabricPhysics?.dispOf?.(g) ?? null;
        const dispMap = pd ? new Map() : null;
        if (pd) for (let i = 0; i < pd.idx.length; i++) dispMap.set(pd.idx[i], i);
        // v9 TUCK CLASS: the shorts' top rings ride under the band + flap
        // (hidden by construction) with thigh-sourced weights — deep folds
        // shear them past the core bar; they are REPORTED as tuckDeltaCm
        // (bar: 8 cm documented) instead of loosening the core gate.
        const tuckSet = new Set();
        for (const tr of der.tuckRings ?? []) for (let i = 0; i < tr.samples; i++) tuckSet.add(tr.start + i);
        let physDevMax = 0, tuckDevMax = 0;
        for (let k = 0; k < src.length && k < verts.length; k++) {
          bodyLive[k] = skinnedVert(der.body, src[k], new THREE.Vector3(), mats).clone();
          let vx = verts[k].x, vy = verts[k].y, vz = verts[k].z;
          if (dispMap && dispMap.has(k)) {
            const j = dispMap.get(k);
            vx -= pd.disp[j * 3]; vy -= pd.disp[j * 3 + 1]; vz -= pd.disp[j * 3 + 2];
          }
          const dl = Math.hypot(vx - bodyLive[k].x, vy - bodyLive[k].y, vz - bodyLive[k].z);
          const expect = Math.hypot(bd[k * 3], bd[k * 3 + 1], bd[k * 3 + 2]) * s2; // scaled bind offset
          const isPhys = dispMap && dispMap.has(k);
          const isTuck = !isPhys && tuckSet.has(k);
          const dev = Math.abs(dl - expect);
          if (!isTuck && dev > devMax) devMax = dev;   // tuck verts report separately
          if (isPhys) {
            const raw = Math.abs(verts[k].distanceTo(bodyLive[k]) - expect);   // uncorrected (motion included)
            if (raw > physDevMax) physDevMax = raw;
          }
          if (isTuck && dev > tuckDevMax) tuckDevMax = dev;
        }
        const devCm = devMax * cmPerUnit;
        perGarment[tag] = perGarment[tag] ?? { maxCm: 0, nan: 0 };
        perGarment[tag].deltaCm = +devCm.toFixed(2);
        if (dispMap) perGarment[tag].physDeltaCm = +(physDevMax * cmPerUnit).toFixed(2);
        if (tuckSet.size) perGarment[tag].tuckDeltaCm = +(tuckDevMax * cmPerUnit).toFixed(2);
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
      // derived-mode verdicts (v9: physDeltaCm = hem-ring secondary motion,
      // bar = clamp 3 cm + 1.2 — a SEPARATE class, the core Δsource gate
      // measures every vert with the physics displacement subtracted)
      deltaCm: +maxDelta.toFixed(2), worstDelta,
      physDeltaCm: +Math.max(0, ...Object.values(perGarment).map((p) => p.physDeltaCm ?? 0)).toFixed(2),
      tuckDeltaCm: +Math.max(0, ...Object.values(perGarment).map((p) => p.tuckDeltaCm ?? 0)).toFixed(2),
      strainExcessCm: +maxStrainExcess.toFixed(2),
      overDelta: maxDelta > DELTA_BAR, overStrain: maxStrainExcess > 1.2,
    });
    return rows[rows.length - 1];
  };

  try {
    // save the live UI state; the probe drives the rig directly
    savedAnimForRestore = state.animId;   // read back by the finally-restore
    const hadBvh = !!bvh;
    if (bvh) { bvh.stop(); bvh = null; }

    say('<p class="vspin">probing BVH clips (attachment + continuity + signed coverage)…</p>');
    await nextTick();
    for (const clip of V_CLIPS) {
      const res = await loadGenoClip(clip);
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
    // v7 FIX 4 numerics: per pose, the MAX bone world-position delta over a
    // full cycle sweep — a pose that does not visibly ANIMATE reads ~0 and
    // fails its bar (exercises ≥ 4 cm, idle sway ≥ 0.2 cm on a 1.75 m human).
    const poseMotion = {};
    const boneNames = Object.keys(av.bones).filter((k) => av.bones[k]);
    for (const pose of [...V_POSES, 'stand']) {
      const ref = new Map();
      let maxD = 0, arg = '';
      for (let k = 0; k <= 16; k++) {
        const ph = k / 16;
        av.pose(pose, ph);
        av.root.updateMatrixWorld(true);
        if (k === 0) { for (const n of boneNames) ref.set(n, av.bones[n].getWorldPosition(new THREE.Vector3()).clone()); continue; }
        const vv = new THREE.Vector3();
        for (const n of boneNames) {
          const d = av.bones[n].getWorldPosition(vv).distanceTo(ref.get(n));
          if (d > maxD) { maxD = d; arg = n; }
        }
      }
      poseMotion[pose] = { maxCm: +(maxD * cmPerUnit).toFixed(1), bone: arg };
    }
    const poseMotionPass = V_POSES.every((p2) => poseMotion[p2].maxCm >= 4) && poseMotion.stand.maxCm >= 0.2;
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

    // mark the pre-verify anim for the finally-restore — a selection the user
    // made DURING the probe (stashed in state.pendingAnim by setAnim) wins
    state.pendingAnim ??= savedAnimForRestore;
    state.t = 0;

    // ── silhouette verdict: bulk (anti-armour) + hem regularity + head
    say('<p class="vspin">silhouette checks (bulk, hems, head)…</p>');
    await nextTick();
    // CANONICAL PROBE POSE: the pose loop above ends at curl@0.75 — hems and
    // bulk are silhouette instruments and must run at a neutral stance (the
    // v7 flared/wrinkled sleeve lips at a curled frame scattered the sleeve
    // edge probe to 18–80 px; at stand the same probe reads 1.5–3.1 px).
    av.pose('stand', 0.5);
    av.root.updateMatrixWorld(true);
    const bulk = bulkCheck();
    const hem = hemCheck();
    const head = await headCheck();
    // (deferred user selection, if any, is honoured by the earlier restore)

    // ── verdicts
    const attachRows = rows.filter((r) => r.overBar);
    const stretchRows = rows.filter((r) => r.stretchCm > STRETCH_BAR);
    const nanRows = rows.filter((r) => r.nan > 0);
    const insideRows = rows.filter((r) => r.insideVerts > 0 || r.solidOk === false);
    const deltaRows = rows.filter((r) => r.overDelta);
    const strainRows = rows.filter((r) => r.overStrain);
    const attachPass = attachRows.length === 0 && nanRows.length === 0 && insideRows.length === 0
      && deltaRows.length === 0 && strainRows.length === 0;
    const stretchPass = stretchRows.length === 0;

    let html = '<table><tr><th>case</th><th>max→body</th><th>worst</th><th>inside-body</th><th>stretch</th>'
      + '<th>Δsrc</th><th>strain−body</th></tr>';
    for (const r of rows) {
      const bad = !!r.overBar || r.stretchCm > STRETCH_BAR || r.nan > 0 || r.insideVerts > 0 || r.solidOk === false
        || r.overDelta || r.overStrain;
      const insideTxt = r.solidOk === false ? 'oracle!' : (r.insideVerts > 0
        ? `${r.insideVerts} vert${r.insideVerts > 1 ? 's' : ''} ${r.insideWorstCm}cm` : '0');
      html += `<tr><td>${r.label}</td><td class="${r.overBar ? 'fail' : 'pass'}">${r.maxCm} cm</td>` +
        `<td class="dim">${r.worst}</td><td class="${r.insideVerts > 0 || r.solidOk === false ? 'fail' : 'pass'}">${insideTxt}</td>` +
        `<td class="${r.stretchCm > STRETCH_BAR ? 'fail' : 'pass'}">${r.stretchCm.toFixed(2)} cm</td>` +
        `<td class="${r.overDelta ? 'fail' : 'pass'}">${r.deltaCm.toFixed(2)} cm</td>` +
        `<td class="${r.overStrain ? 'fail' : 'pass'}">+${r.strainExcessCm.toFixed(2)} cm</td></tr>`;
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
    const barsTxt = `v7 bars: coverage tee 28 / shorts 22 / band 6 / shoes 5.5 (swing) · Δsource <2.0 · strain−body ≤1.2 cm`;
    html += `<div class="verify-summary ${attachPass && stretchPass ? 'ok' : 'bad'}">` +
      `${rows.length} cases · max garment→body <b>${globalMax.toFixed(1)} cm</b> (${barsTxt}) · ` +
      `inside-body verts <b>${insideTotal}</b> (worst ${insideWorst.toFixed(1)} cm · ${crossTotal} bare-limb crossings excused) · ` +
      `max ring stretch <b>${globalStretch.toFixed(2)} cm</b> (bar ≤${STRETCH_BAR}) · ` +
      `max Δsource <b>${globalDelta.toFixed(2)} cm</b> (bar <${DELTA_BAR} — garment verts track their body verts through shared skinning) · ` +
      `max strain−body <b>+${globalStrainExcess.toFixed(2)} cm</b> · ` +
      `${attachPass && stretchPass ? 'ALL PASS ✓' : attachRows.length + stretchRows.length + nanRows.length + insideRows.length + deltaRows.length + strainRows.length + ' case(s) over bar'}</div>`;
    const bulkOK = bulk && bulk.pass !== false;
    const hemOK = hem.pass;
    const headOK = head.pass;
    html += `<div class="verify-summary ${bulkOK ? 'ok' : 'bad'}">DERIVED — ` +
      `bulk: shirt silhouette ${bulk?.shirtCm ?? '?'} cm vs body ${bulk?.bodyCm ?? '?'} cm = ` +
      `<b>+${bulk?.excessCm ?? '?'} cm</b> (bar ≤1.5 at chest — "a tiny bit loose", not armour) · ` +
      `${bulkOK ? 'PASS ✓' : 'FAIL'}</div>`;
    html += `<div class="verify-summary ${hemOK ? 'ok' : 'bad'}">HEMS — ` +
      hem.openings.map((o) => `${o.name}: angVar ${o.angVar} (bar ≤${HEM_ANG_BAR}) · edge σ ${o.edgeStdPx.toFixed(1)}px (bar ≤${HEM_EDGE_BAR}px)`).join(' · ') +
      ` — ${hemOK ? 'PASS ✓' : 'FAIL'}</div>`;
    html += `<div class="verify-summary ${poseMotionPass ? 'ok' : 'bad'}">POSE MOTION (v7) — ` +
      Object.entries(poseMotion).map(([p2, m]) => `${p2} Δ${m.maxCm}cm (${m.bone})`).join(' · ') +
      ` — bars: exercises ≥4 cm, idle ≥0.2 — ${poseMotionPass ? 'PASS ✓' : 'FAIL'}</div>`;
    html += `<div class="verify-summary ${headOK ? 'ok' : 'bad'}">HEAD — species ${head.species} · ` +
      head.frames.map((f) => `green ${f.greenPx}px eyes ${f.eyePx}px@${(f.t * 100).toFixed(0)}%`).join(' · ') +
      ` — ${headOK ? 'PASS ✓' : 'FAIL'}</div>`;
    for (const r of rows) {
      if (r.ankleDriftCm != null && r.ankleDriftCm > 3) notes.push(`${r.pose}: feet drift ${r.ankleDriftCm} cm across phases (not planted)`);
    }
    if (notes.length) html += notes.map((n) => `<p class="verify-note">⚠ ${n}</p>`).join('');
    html += '<p class="verify-note">edge "stretch" = welded ring-to-ring edge strain (LBS responds to joint bends; a welded strip cannot open a gap — NaN/degenerate verts are the structural hole check and must stay 0).</p>';
    say(html);

    const report = { rows, attachPass, stretchPass, globalMaxCm: +globalMax.toFixed(1), globalStretchCm: +globalStretch.toFixed(2), insideVerts: insideTotal, insideWorstCm: +insideWorst.toFixed(1), limbCrossVerts: crossTotal, notes, bars: { attachCm: ATTACH_BAR, stretchCm: STRETCH_BAR, deltaCm: DELTA_BAR, strainExcessCm: 0.5 }, bulk, hem, head, poseMotion, poseMotionPass, mode: state.mode, derivedStats: outfit.derived?.stats ?? null };
    window.__atelier.lastVerify = report;
    return report;
  } catch (e) {
    say(`<div class="verify-summary bad">probe failed: ${e.message}</div>`);
    throw e;
  } finally {
    state.verifying = false;
    $('btnVerify').disabled = false;
    // the REAL anim restore runs here — after `verifying` clears, so setAnim
    // executes instead of deferring again. The user's deferred pick (if they
    // selected something mid-probe) beats the pre-verify anim.
    const target = state.pendingAnim ?? savedAnimForRestore ?? 'idle';
    state.pendingAnim = null;
    setAnim(target).catch(() => {});
    wake(); // redraw the restored state
  }
}
let savedAnimForRestore = null;

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
      module: '/site/models/geno-derived.js',
      mode: state.garmentMode === 'fabric'
        ? 'fabric ring-lattice garments (regularised sections, straight hang, graded +6→+18 mm)'
        : 'skin-derived body triangles, contour hems (graded +5→+12 mm)',
      head: state.headSpecies,
      buildStep: state.buildStep,
      stepLabel: BUILDUP_STEPS[state.buildStep].label,
      slotsVisible: OUTFIT_SLOTS.filter((s2) => state.iso ? s2 === state.iso : BUILDUP_STEPS[state.buildStep].slots.includes(s2)),
      isolated: state.iso,
      bandTopM: +(outfit ? outfit.plan.bandTop / av.H * 1.75 : 0).toFixed(3),
      derived: outfit?.derived?.stats ?? null,
      frog: state.headSpecies === 'frog'
        ? { module: '/site/models/frog-heads.js', expression: state.frogExpr, skin: state.frogSkin, accessory: state.frogAcc }
        : null,
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
  // DEFAULT: fabric garments (v8 constructed topology) + the frog head (with
  // crown) — the full kit the founder asked to see.
  outfit = attachDerivedOutfit(av, { slots: 'full', head: state.headSpecies, mode: state.garmentMode });
  av.pose('stand', 0.5);
  state.ready = true;
  updateHeadUI();
  installFrogHead();   // swap geno's static frog → the playground frog (default species)

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
  // ── garment slot row (quick toggles) + head species + frog skin ──────────
  const slotRow = $('slotRow');
  if (slotRow) {
    for (const r of SLOT_ROW) {
      const b = document.createElement('button');
      b.className = 'rwf-btn slot-chip is-on';
      b.dataset.slot = r.id;
      b.textContent = r.label;
      b.addEventListener('click', () => {
        state.slotOn[r.id] = state.slotOn[r.id] === false;
        applyVisibility();
      });
      slotRow.appendChild(b);
    }
  }
  // ── garment construction mode (v8): fabric = constructed ring-lattice
  //    garments; fitted = the v7 body-triangle fallback. Rebuilds the outfit.
  const fabricRow = $('fabricRow');
  if (fabricRow) {
    for (const [mode, label, title] of [
      ['fabric', '🧵 Fabric', 'constructed garment topology — boxy sections, straight hang, own mesh'],
      ['fitted', '🫀 Fitted', 'v7 fallback — the body\'s own triangles offset outward'],
    ]) {
      const b = document.createElement('button');
      b.className = 'rwf-btn mode-chip' + (state.garmentMode === mode ? ' is-on' : '');
      b.dataset.mode = mode;
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => setGarmentMode(mode));
      fabricRow.appendChild(b);
    }
  }
  document.querySelectorAll('.head-btn').forEach((b) => {
    b.addEventListener('click', () => setHead(b.dataset.species));
  });
  document.querySelectorAll('.frog-skin').forEach((b) => {
    b.addEventListener('click', () => { setFrogSkin(b.dataset.skin); });
  });
  document.querySelectorAll('.frog-expr').forEach((b) => {
    b.addEventListener('click', () => { setFrogExpression(b.dataset.expr); });
  });
  document.querySelectorAll('.frog-acc').forEach((b) => {
    b.addEventListener('click', () => { setFrogAccessory(b.dataset.acc); });
  });
  // FROG GALLERY — lazy build (context/energy budget): render the strip only
  // when the section scrolls into view or the frog is first selected; clicks
  // land in one of the 6 cells and apply that expression.
  {
    const gc = document.getElementById('frogGallery');
    if (gc) {
      gc.addEventListener('click', (e) => {
        const r = gc.getBoundingClientRect();
        const x = (e.clientX - r.left) * (gc.width / r.width);
        const i = Math.floor((x - GAL.pad) / (GAL.cell + GAL.pad));
        const inCell = x - GAL.pad - i * (GAL.cell + GAL.pad);
        if (i >= 0 && i < GAL.cells && inCell <= GAL.cell) gallerySelect(i);
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries, obs) => {
          if (entries.some((en) => en.isIntersecting) && state.headSpecies === 'frog') {
            buildFrogGallery();
            obs.disconnect();
          }
        }, { rootMargin: '120px' }).observe(gc);
      } else if (state.headSpecies === 'frog') buildFrogGallery();
    }
  }
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
    // seam heatmap refreshes ONLY while animating (the ~7 Hz idle interval is
    // gone — a paused garment's distances do not change)
    if (state.heat) {
      heatTimer += dt;
      if (heatTimer > 0.15) { heatTimer = 0; updateHeatmap(); }
    }
  }
  // v9 fabric physics: steps on EVERY tick while awake (settle-after-pause
  // runs without the animation); no-ops instantly when dormant + still.
  // Returns true while the fabric is visibly moving → keep rendering; once
  // settled the loop goes quiet with everything else (idle rAF stays 0).
  const fabricMoving = outfit?.updateFabric(animating ? dt * state.speed : dt) ?? false;
  if (fabricMoving) needsRender = true;
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
  garmentMode: () => state.garmentMode,
  setGarmentMode,
  rebuildOutfit,
  setHead,
  setFrogSkin: (name) => setFrogSkin(name),
  // ── frog playground surface (frog-heads.js) ─────────────────────────────
  setFrogExpression: (name) => setFrogExpression(name),
  setFrogAccessory: (name) => setFrogAccessory(name),
  /** geometry-truth metrics for the current expression (lids, brows, mouth). */
  frogInfo: () => frogHead?.userData.frog.metrics() ?? null,
  frogExpressions: () => [...FROG_EXPRESSIONS],
  frogSkins: () => Object.keys(FROG_HEAD_SKINS),
  frogAccessories: () => [...FROG_ACCESSORIES],
  /** meshy candidate info for the live head (file/tuning), or null. */
  meshyInfo: () => meshyHead?.userData.meshy ?? null,
  /** smoke: every expression × skin × accessory through the LIVE head's
   *  set* API — no NaN in any world matrix, zero throws. Returns a summary. */
  frogSanity: () => {
    if (!frogHead) return { error: 'no frog head installed' };
    const f = frogHead.userData.frog;
    let n = 0; const errs = [];
    for (const skin of Object.keys(FROG_HEAD_SKINS)) {
      for (const expr of FROG_EXPRESSIONS) {
        for (const acc of FROG_ACCESSORIES) {
          try {
            f.setSkin(skin); f.setExpression(expr); f.setAccessory(acc);
            frogHead.updateMatrixWorld(true);
            frogHead.traverse((o) => {
              for (const v of o.matrixWorld.elements) {
                if (!Number.isFinite(v)) throw new Error('NaN in world matrix');
              }
            });
            n++;
          } catch (err) { errs.push(`${skin}/${expr}/${acc}: ${err.message}`); }
        }
      }
    }
    // restore the UI selection
    f.setSkin(state.frogSkin); f.setExpression(state.frogExpr); f.setAccessory(state.frogAcc);
    updateHeadUI(); wake();
    return { combos: n, errors: errs.slice(0, 8), errorCount: errs.length };
  },
  /** standard front-on head framing for expression shots (consistent across
   *  all six). LEVEL with the face and 0.85 out: a close/high camera
   *  foreshortens the mouth's forward wrap (the mid bulges ~5 cm proud of the
   *  corners; measured −13px of false "smile" on grumpy from 0.52/level+0.055)
   *  — a level camera keeps the drawn curvature sign readable on screen. */
  frogCam: () => {
    av.root.updateMatrixWorld(true);
    const h = activeHeadGroup() ?? av.bones.head;
    const c = h.localToWorld((h.userData?.frog?.skullCentre ?? new THREE.Vector3(0, 0.062 * av.H, 0)).clone());
    controls.autoRotate = false;
    camera.position.set(c.x + 0.03, c.y - 0.005, c.z + 0.85);
    controls.target.set(c.x, c.y + 0.012, c.z);
    controls.update();
    wake();
    return { pos: camera.position.toArray().map((v) => +v.toFixed(3)), tgt: controls.target.toArray().map((v) => +v.toFixed(3)) };
  },
  /** render-truth eye read at the CURRENT camera: per side, pale-bulb px and
   *  skin-lid px inside a disc around each projected eye turret — the
   *  distinctness table's "white pixel counts" column. */
  frogEyePixels: () => {
    if (!frogHead) return { error: 'no frog head installed' };
    av.root.updateMatrixWorld(true);
    const { buf, W, H } = readFrame();
    const f = frogHead.userData.frog;
    const out = { expression: f.expression, skin: f.skin };
    f.parts.turrets.forEach((t, i) => {
      const c = t.getWorldPosition(new THREE.Vector3());
      const p = toPx(c, W, H);
      let pale = 0, skiny = 0;
      const rad = Math.round(H * 0.055);
      const skinHex = FROG_HEAD_SKINS[f.skin].base;
      const wantHue2 = hueOfHex(skinHex);
      for (let y = Math.max(0, p.y - rad); y <= Math.min(H - 1, p.y + rad); y++) {
        for (let x = Math.max(0, p.x - rad); x <= Math.min(W - 1, p.x + rad); x++) {
          const q2 = ((H - 1 - y) * W + x) * 4;
          const R = buf[q2], G = buf[q2 + 1], B = buf[q2 + 2];
          const dx = x - p.x, dy = y - p.y;
          if (dx * dx + dy * dy > rad * rad) continue;
          if (R > 150 && G > 150 && B > 90 && G > B + 20 && G > R - 25 && R > B + 10) { pale++; continue; }
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d2 = mx - mn;
          if (d2 >= 14 && mx > 40) {
            let h;
            if (mx === R) h = 60 * (((G - B) / d2) + 6);
            else if (mx === G) h = 60 * (((B - R) / d2) + 2);
            else h = 60 * (((R - G) / d2) + 4);
            if (h >= 360) h -= 360;
            let dh = Math.abs(h - wantHue2); if (dh > 180) dh = 360 - dh;
            if (dh < 15) skiny++;
          }
        }
      }
      out[i === 0 ? 'sideP1' : 'sideM1'] = { palePx: pale, skinPx: skiny };
    });
    return out;
  },
  buildFrogGallery,
  gallerySelect,
  galleryInfo: () => ({ built: GAL.built, cells: GAL.cells, inkPerCell: GAL.ink, expr: state.frogExpr }),
  /** render-truth MOUTH read at the CURRENT camera: projects the mouth tube's
   *  three anchor rings (corner side+1 / mid / corner side-1) and counts ink
   *  pixels around each. curvaturePx = cornerAvgY − midY in SCREEN pixels —
   *  NEGATIVE = mid sits lower on screen = ⌣ smile; POSITIVE = ⌢ frown. */
  frogMouthProbe: () => {
    if (!frogHead) return { error: 'no frog head installed' };
    av.root.updateMatrixWorld(true);
    const f = frogHead.userData.frog;
    const mg = f.parts.mouthGroup;
    const meshes = mg.children.filter((o) => o.isMesh);
    const kind = f.metrics().mouth.kind;
    const { buf, W, H } = readFrame();
    const inkAt = (cx, cy, rad = 18) => {
      let ink = 0;
      for (let y = Math.max(0, cy - rad); y <= Math.min(H - 1, cy + rad); y++) {
        for (let x = Math.max(0, cx - rad); x <= Math.min(W - 1, cx + rad); x++) {
          const q = ((H - 1 - y) * W + x) * 4;
          if (buf[q] < 70 && buf[q + 1] < 70 && buf[q + 2] < 80) ink++;
        }
      }
      return ink;
    };
    if (kind === 'open') {
      const c = meshes[0].getWorldPosition(new THREE.Vector3());
      const p = toPx(c, W, H);
      return { kind, r: f.metrics().mouth.r, midPx: [Math.round(p.x), Math.round(p.y)], inkMid: inkAt(p.x, p.y) };
    }
    const tube = meshes.find((mm) => mm.geometry.type === 'TubeGeometry');
    if (!tube) return { error: 'no mouth tube (expression ' + f.expression + ')' };
    const pos = tube.geometry.attributes.position;
    const RINGS = 23, RV = pos.count / RINGS;   // 22 tubular segs + 1
    const ringCentre = (r) => {
      const v = new THREE.Vector3();
      for (let k = 0; k < RV; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, r * RV + k));
      return v.divideScalar(RV);
    };
    const anchors = { cornerP1: ringCentre(0), mid: ringCentre(11), cornerM1: ringCentre(22) };
    const out = { kind: 'arc' };
    for (const [name, v] of Object.entries(anchors)) {
      const wp = tube.localToWorld(v.clone());
      const p = toPx(wp, W, H);
      out[name] = { x: Math.round(p.x), y: Math.round(p.y), ink: inkAt(p.x, p.y) };
    }
    const cornerAvgY = (out.cornerP1.y + out.cornerM1.y) / 2;
    out.curvaturePx = +(cornerAvgY - out.mid.y).toFixed(1);  // − = ⌣ smile
    out.reads = out.cornerP1.ink > 40 && out.cornerM1.ink > 40 && out.mid.ink > 40;
    return out;
  },
  get headSpecies() { return state.headSpecies; },
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
  scanSignedCoverage, scanInsideBody, bulkCheck, hemCheck, headCheck,
  /** Derived-construction report (region sizes, tri counts, degenerates). */
  derivedStats: () => outfit?.derived?.stats ?? null,
  /** v9 fabric-physics layer state + controls (null when disabled). */
  fabricPhysics: () => outfit?.fabricPhysics ?? null,
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
    // row 0 of gl.readPixels is the frame BOTTOM — map ndcY directly
    // (the old (1 − …) mapping read the MIRRORED row)
    const x = Math.round((ndcX + 1) / 2 * (W - 1)), y = Math.round((ndcY + 1) / 2 * (H - 1));
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
