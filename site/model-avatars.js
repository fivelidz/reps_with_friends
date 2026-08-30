// site/model-avatars.js — REAL rigged character models as avatar candidates.
//
// Sources, one interface:
//   • orc.glb / orc_marauder.glb (goblin-village game) — the founder's own
//     game art: flat palette texture, Rigify rig, no animations. The avatar
//     BASE. Colourways come from site/model-recolor.js (palette remap).
//   • Soldier.glb  (three.js r177 example) — realistic human, mixamo rig,
//     ships Idle/Run/Walk animations; palette-treated for the game look.
//   • Xbot.glb     (three.js r177 example) — stylised robot humanoid (kept
//     available; not in the default gallery lineup).
//
// ── Posing ──────────────────────────────────────────────────────────────────
// ONE system — AIM + IK — drives every exercise on every rig. The orc GLBs
// rest in a T-POSE (arms straight out along ±X) and the Soldier rests T-pose
// facing −Z in centimetres, so hand-tuned Euler deltas can never produce sane
// exercise poses from there. Instead:
//
//      aim(bone, dir)  — rotate the bone so its rest pointing-direction
//                        (bone origin → main child joint, captured at load)
//                        points at `dir` in world space, regardless of how
//                        ancestors have been posed:
//                        delta = M⁻¹ · Q(dir0 → dir) · wq0
//                        (M = bone's live world quat with itself at rest,
//                         wq0 = its world rest quat, dir0 = its rest dir)
//      bend(bone, ax, a) — rotate `a` radians about a world axis, INCREMENTS
//                        compounding with ancestors (distributed spine lean)
//      ik2(a, b, target, pole) — analytic two-bone IK (hip→knee→ankle,
//                        shoulder→elbow→wrist): aims `a` at the solved mid
//                        joint, `b` at the planted `target`; mid joint biased
//                        toward `pole` (knees forward, elbows back along ribs).
//                        Feet/hands stay PLANTED by construction.
//
//    All positions are handled in MODEL units (world ÷ the avatar's current
//    uniform scale) so the gallery's normalising scale cancels out, and the
//    ctor auto-flips backward-facing exports so forward is always +Z.
//
//    (poseMixamo below is the OLD Euler-delta system, kept for reference —
//    it assumed an arms-down rest and is no longer called.)
//
// Push-ups: the whole figure is tipped face-down by the `prone` container
// (rotation order YXZ: Rx(θ) puts the chest to the ground, Ry(π/2) swings the
// body axis to +X so the camera at +Z sees the left profile), pivoting at the
// TOES. θ eases from 90° (flat, bottom of rep) to a per-model solved incline
// at the top (real push-up geometry: the body rises as the arms straighten);
// arm IK absorbs the difference so the hands stay planted.
//
// Exercises are phase-driven (p ∈ [0,1), the rep bottoms out at p≈0.5) to
// match the procedural gallery, so the same selector drives both sections.

import * as THREE from 'three';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { BVHLoader } from './lib/BVHLoader.js';

export const MODELS = [
  { id: 'orc', name: 'Orc — game art (original)', file: '/models/orc.glb', rig: 'rigify', native: [] },
  { id: 'orc-couch', name: 'Orc — couch tier', file: '/models/orc.glb', rig: 'rigify', native: [], colorway: 'couch' },
  { id: 'orc-casual', name: 'Orc — casual tier', file: '/models/orc.glb', rig: 'rigify', native: [], colorway: 'casual' },
  { id: 'orc-fit', name: 'Orc — fit tier', file: '/models/orc.glb', rig: 'rigify', native: [], colorway: 'fit' },
  { id: 'orc-athlete', name: 'Orc — athlete tier', file: '/models/orc.glb', rig: 'rigify', native: [], colorway: 'athlete' },
  { id: 'orc-human', name: 'Orc — human palette', file: '/models/orc.glb', rig: 'rigify', native: [], colorway: 'human' },
  { id: 'marauder', name: 'Orc Marauder — armoured', file: '/models/orc_marauder.glb', rig: 'rigify', native: [], dark: true },
  { id: 'soldier', name: 'Soldier — palette-treated', file: '/models/Soldier.glb', rig: 'mixamo', native: ['Idle', 'Walk', 'Run'], palette: 'soldier' },
  // ── Geno (AI4Animation biped, from the founder's Unity game jam). 62-joint
  // mixamo-style rig, single WHITE material, no embedded anims — driven by
  // the game's BVH mocap captures (see BVHPlayer below) and tinted per
  // character, exactly the approach the game's own docs settled on: same
  // model, tint = race/tier.
  { id: 'geno', name: 'Geno — AI4Animation biped', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#eceef1' },
  { id: 'geno-couch', name: 'Geno — couch tier', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'couch' },
  { id: 'geno-casual', name: 'Geno — casual tier', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'casual' },
  { id: 'geno-fit', name: 'Geno — fit tier', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'fit' },
  { id: 'geno-athlete', name: 'Geno — athlete tier', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'athlete' },
  { id: 'geno-goblin', name: 'Geno — goblin green', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'goblin' },
  { id: 'geno-human', name: 'Geno — human skin', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'human' },
  { id: 'geno-bvh', name: 'Geno — mocap (source: AI4Animation)', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#eceef1', bvh: ['walk', 'run', 'idle', 'demo_walk', 'demo_run', 'sprint', 'swagger', 'agree', 'headshake', 'sad', 'sneak', 'goblin_walk', 'goblin_limp', 'goblin_drag', 'goblin_arm', 'goblin_combat'], bvhAuto: 'walk' },
  // ── Geno Wardrobe: SKINNED clothes + species heads (geno-wardrobe.js).
  // Tank/shorts are SkinnedMeshes bound to Geno's own skeleton (smooth weight
  // ramps across the joint chains), so mocap and exercise poses deform
  // them like skin — no gapping at bent joints. Cards carry the FULL
  // animation coverage: real mocap + legacy captures + the 4 exercise poses.
  { id: 'geno-wardrobe', name: 'Geno Wardrobe — dressed', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#eceef1', wardrobe: 'full', wardrobeToggle: true, bvh: ['walk', 'run', 'idle', 'demo_walk', 'sprint', 'swagger', 'agree', 'sad', 'goblin_walk', 'goblin_limp', 'goblin_drag', 'goblin_arm', 'goblin_combat'], bvhAuto: 'walk' },
  { id: 'geno-frog', name: 'Geno Frog — mocap walk', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#86c05a', head: 'frog', bvh: ['walk', 'run', 'idle', 'demo_walk', 'sprint', 'swagger', 'agree', 'sad', 'sneak'], bvhAuto: 'walk' },
  { id: 'geno-goblinhead', name: 'Geno Goblin — species head', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: 'goblin', head: 'goblin' },
  { id: 'geno-robot', name: 'Geno Robot — species head', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#c9ced4', head: 'robot' },
  { id: 'geno-fullkit', name: 'Geno Full Kit — crowned frog, mocap', file: '/models/Geno.glb', rig: 'mixamo', native: [], tint: '#86c05a', head: 'frog-crown', wardrobe: 'full', bvh: ['walk', 'run', 'idle', 'demo_walk', 'sprint', 'swagger', 'agree', 'sad', 'goblin_walk', 'goblin_combat'], bvhAuto: 'walk' },
  // ── anyCreature compiled (spec → skinned GLB, vertex-coloured + AO-baked).
  // creature: true → native-anim playback only, no exercise retarget (the rigs
  // are creature skeletons, not mixamo/rigify humanoids).
  { id: 'ac-wolf', name: 'Wolf — anyCreature', file: '/models/wolf.glb', rig: 'anycreature', native: ['idle', 'move'], creature: true },
  { id: 'ac-dragon-hunter', name: 'Wyvern Hunter — anyCreature', file: '/models/dragon_hunter.glb', rig: 'anycreature', native: ['idle', 'move', 'flap', 'attack'], creature: true },
  { id: 'ac-dragon-elder', name: 'Wyvern Elder — anyCreature', file: '/models/dragon_elder.glb', rig: 'anycreature', native: ['idle', 'move', 'flap', 'attack'], creature: true, dark: true },
  { id: 'ac-adventurer', name: 'Adventurer — anyCreature', file: '/models/humanoid_adventurer.glb', rig: 'anycreature', native: ['idle', 'walk', 'attack'], creature: true },
  { id: 'ac-brute', name: 'Brute — anyCreature', file: '/models/humanoid_brute.glb', rig: 'anycreature', native: ['idle', 'walk', 'attack'], creature: true },
  // Cranberry: the AI4Animation detailed human (159 joints, b_* names — no
  // name overlap with the BVHs, so display-only like the creature cards).
  { id: 'cranberry', name: 'Cranberry — detailed human', file: '/models/Cranberry.glb', rig: 'anycreature', native: [], creature: true, tint: '#b9c2cc' },
];

const loader = new GLTFLoader();
const cache = new Map();

/** Object3D.clone(true) on skinned meshes SHARES the source Skeleton (three's
 *  SkinnedMesh.copy does `this.skeleton = source.skeleton`) — the clone's
 *  bones are new objects the skin never follows, so every posed clone would
 *  stay frozen in bind pose. Rebind each clone to a skeleton rebuilt from its
 *  OWN bones (matched by name). */
function rebindSkeletons(root) {
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const bones = o.skeleton.bones.map((b) => root.getObjectByName(b.name) || b);
    o.skeleton = new THREE.Skeleton(bones, o.skeleton.boneInverses);
    o.bind(o.skeleton, o.bindMatrix);
  });
}

export async function loadModel(file) {
  if (cache.has(file)) {
    const cloned = cache.get(file).clone(true);
    rebindSkeletons(cloned);
    return cloned;
  }
  const gltf = await loader.loadAsync(file);
  cache.set(file, gltf.scene);
  return gltf.scene; // first caller gets the original (already self-bound)
}

// ── bone lookup (logical names shared by both rig families) ─────────────────
// GLTFLoader sanitises node names (PropertyBinding.sanitizeNodeName strips
// "[]. :/" — reserved for track paths), so `spine.001` arrives as `spine001`,
// `foot.L` as `footL`, `mixamorig:Hips` as `mixamorigHips`. Normalise BOTH
// raw glTF names and sanitised names to one key space.
const normBone = (n) => n.replace(/^mixamorig:/, '').replace(/^mixamorig/, '').replace(/[\[\].:/]/g, '');

function boneMap(root, rig) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[normBone(o.name)] = o;
  });
  const m = {};
  if (rig === 'mixamo') {
    Object.assign(m, {
      hips: bones.Hips, spine: bones.Spine, spine1: bones.Spine1, spine2: bones.Spine2,
      neck: bones.Neck, head: bones.Head,
      shoulderL: bones.LeftShoulder, armL: bones.LeftArm, foreL: bones.LeftForeArm, handL: bones.LeftHand,
      shoulderR: bones.RightShoulder, armR: bones.RightArm, foreR: bones.RightForeArm, handR: bones.RightHand,
      upLegL: bones.LeftUpLeg, legL: bones.LeftLeg, footL: bones.LeftFoot, toeL: bones.LeftToeBase,
      upLegR: bones.RightUpLeg, legR: bones.RightLeg, footR: bones.RightFoot, toeR: bones.RightToeBase,
    });
  } else {
    Object.assign(m, {
      hips: bones['spine'], spine: bones['spine001'], spine1: bones['spine002'], spine2: bones['spine003'],
      neck: bones['spine004'], head: bones['spine005'],
      shoulderL: bones['shoulderL'], armL: bones['upper_armL'], foreL: bones['forearmL'], handL: bones['handL'],
      shoulderR: bones['shoulderR'], armR: bones['upper_armR'], foreR: bones['forearmR'], handR: bones['handR'],
      upLegL: bones['thighL'], legL: bones['shinL'], footL: bones['footL'], toeL: bones['toeL'],
      upLegR: bones['thighR'], legR: bones['shinR'], footR: bones['footR'], toeR: bones['toeR'],
    });
  }
  return m;
}

// logical name → logical child name (the joint each bone "points at")
const CHILD = {
  hips: 'spine', spine: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head',
  shoulderL: 'armL', armL: 'foreL', foreL: 'handL',
  shoulderR: 'armR', armR: 'foreR', foreR: 'handR',
  upLegL: 'legL', legL: 'footL', footL: 'toeL',
  upLegR: 'legR', legR: 'footR', footR: 'toeR',
};

// capture rest quaternions so poses are deltas, not absolutes
function captureRest(bones) {
  const rest = new Map();
  for (const b of Object.values(bones)) if (b) rest.set(b, b.quaternion.clone());
  return rest;
}

function setQ(bone, rest, x = 0, y = 0, z = 0) {
  if (!bone || !rest.has(bone)) return;
  const e = new THREE.Euler(x, y, z, 'XYZ');
  bone.quaternion.copy(rest.get(bone)).multiply(new THREE.Quaternion().setFromEuler(e));
}

// ── aim/IK rig (works for both rigify and mixamo via logical names) ─────────
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _p1 = new THREE.Vector3(), _s1 = new THREE.Vector3();

class AimRig {
  constructor(avatar) {
    this.av = avatar;
    this.B = avatar.bones;
    this.restQ = new Map();   // bone → rest quaternion (local)
    this.restP = new Map();   // bone → rest position (local translation)
    this.wq0 = new Map();     // bone → world rest quaternion
    this.dir0 = new Map();    // bone → world rest pointing direction
    this.s = 1;               // current uniform world scale of the avatar
    for (const b of Object.values(this.B)) {
      if (!b) continue;
      this.restQ.set(b, b.quaternion.clone());
      this.restP.set(b, b.position.clone());
    }
    // FULL-skeleton bind snapshot (v7 FIX 4): aim/bend drive only the LOGICAL
    // bone map above, but BVH clips pose EVERY joint (62 on Geno — Spine3,
    // Neck1, fingers…). reset() must restore the whole skeleton or clip
    // residue survives on unmapped joints and bleeds into the next pose.
    this.allBones = [];
    avatar.prone.children[0].traverse((o) => { if (o.isBone) this.allBones.push(o); });
    this.allRestQ = this.allBones.map((b) => b.quaternion.clone());
    this.allRestP = this.allBones.map((b) => b.position.clone());
    this.capture();
  }
  capture() {
    // run at ctor: all bones at rest, prone at identity, root unscaled
    this.av.root.updateMatrixWorld(true);
    for (const [name, b] of Object.entries(this.B)) {
      if (!b) continue;
      b.getWorldQuaternion(_q1);
      this.wq0.set(b, _q1.clone());
      this.restWorld = this.restWorld || new Map();
      this.restWorld.set(b, b.getWorldPosition(new THREE.Vector3()));
      const child = this.B[CHILD[name]];
      if (child) {
        const dir = child.getWorldPosition(_v1).sub(b.getWorldPosition(_v2));
        if (dir.lengthSq() > 1e-10) this.dir0.set(b, dir.normalize().clone());
      }
    }
    this.len = {
      thighL: this._len('upLegL', 'legL'), shinL: this._len('legL', 'footL'),
      thighR: this._len('upLegR', 'legR'), shinR: this._len('legR', 'footR'),
      armL: this._len('armL', 'foreL'), foreL: this._len('foreL', 'handL'),
      armR: this._len('armR', 'foreR'), foreR: this._len('foreR', 'handR'),
    };
    this.armTotal = (this.len.armL + this.len.foreL) || 0;
  }
  _len(aName, bName) {
    const a = this.B[aName], b = this.B[bName];
    if (!a || !b) return 0;
    return this.restWorld.get(a).distanceTo(this.restWorld.get(b));
  }
  reset() {
    this.s = this.av.root.scale.x || 1; // root has no parent; gallery scale is uniform
    for (let i = 0; i < this.allBones.length; i++) {
      this.allBones[i].quaternion.copy(this.allRestQ[i]);
      this.allBones[i].position.copy(this.allRestP[i]);
    }
    this.av.root.updateMatrixWorld(true);
  }
  sync() { this.av.root.updateMatrixWorld(true); }
  /** live joint position in MODEL units (world ÷ scale) */
  rpos(bone, out = _v3) { return bone.getWorldPosition(out).divideScalar(this.s); }
  /** rest joint position in model units */
  rrest(bone) { return this.restWorld.get(bone); }
  /** rest joint position pushed through the CURRENT prone transform (model
   *  units, root space — scale-free) — where a rigid body would carry it */
  pt(bone, out = new THREE.Vector3()) {
    this.av.prone.updateMatrix();
    return out.copy(this.restWorld.get(bone)).applyMatrix4(this.av.prone.matrix);
  }

  /** rotate bone so its rest pointing-dir aims at `target` (model-space dir) */
  aim(bone, target) {
    const d0 = this.dir0.get(bone);
    if (!bone || !d0 || !target) return;
    const M = _q1.copy(bone.getWorldQuaternion(_q2)); // M (parents posed, bone at rest)
    const Q = _q2.setFromUnitVectors(d0, _v1.copy(target).normalize());
    // delta = M⁻¹ · Q · wq0
    Q.premultiply(M.invert()).multiply(this.wq0.get(bone));
    bone.quaternion.copy(this.restQ.get(bone)).multiply(Q);
  }
  /** rotate bone INCREMENTALLY by `a` radians about a world axis (compounds
   *  with ancestors' rotations — use for distributed spine lean) */
  bend(bone, axis, a) {
    if (!bone || a === 0) return;
    const M = _q1.copy(bone.getWorldQuaternion(_q2));
    const Q = _q2.setFromAxisAngle(_v1.copy(axis).normalize(), a);
    // delta = M⁻¹ · Q · M  →  bone world becomes Q · M (incremental)
    _q3.copy(M);
    Q.premultiply(M.invert()).multiply(_q3);
    bone.quaternion.copy(this.restQ.get(bone)).multiply(Q);
  }
  /** move bone origin by a model-space (root-space) delta. The delta is
   *  expressed in model units, so it must be divided by the parent's OWN
   *  scale only — the decomposed world scale also contains the avatar root's
   *  normalising scale, which cancels against `this.s`. */
  shift(bone, dx, dy, dz) {
    if (!bone || !bone.parent) return;
    bone.parent.updateWorldMatrix(true, false);
    _m1.copy(bone.parent.matrixWorld).decompose(_p1, _q1, _s1);
    const s = this.s || 1;
    _v1.set((dx * s) / (_s1.x || s), (dy * s) / (_s1.y || s), (dz * s) / (_s1.z || s))
      .applyQuaternion(_q1.invert());
    bone.position.add(_v1);
  }
  /**
   * Analytic 2-link IK. Aims bone `aName` at the solved mid joint; the caller
   * aims `bName` at `target` on the following pass (after sync()).
   * `target`/`pole` in model space. Returns the solved mid-joint position.
   */
  ik2(aName, target, pole, aLen, bLen) {
    const a = this.B[aName];
    if (!a) return null;
    const R = this.rpos(a, new THREE.Vector3());
    const to = new THREE.Vector3().copy(target).sub(R);
    let dist = to.length();
    const minD = Math.abs(aLen - bLen) + 1e-3, maxD = aLen + bLen - 1e-3;
    dist = Math.min(maxD, Math.max(minD, dist));
    to.normalize();
    const cosA = Math.min(1, Math.max(-1, (aLen * aLen + dist * dist - bLen * bLen) / (2 * aLen * dist)));
    const ang = Math.acos(cosA);
    const n = new THREE.Vector3().copy(to).cross(pole);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
    n.normalize();
    const mid = new THREE.Vector3().copy(to).applyAxisAngle(n, ang).multiplyScalar(aLen).add(R);
    // pole sanity: the mid joint must sit on the pole side of the R→target line
    const rel = new THREE.Vector3().copy(mid).sub(R);
    const lineDir = new THREE.Vector3().copy(target).sub(R).normalize();
    const off = rel.sub(lineDir.multiplyScalar(rel.dot(lineDir)));
    if (off.dot(pole) < 0) {
      mid.copy(to).applyAxisAngle(n, -ang).multiplyScalar(aLen).add(R);
    }
    this.aim(a, new THREE.Vector3().copy(mid).sub(R).normalize());
    return mid;
  }
}

// ── poses ────────────────────────────────────────────────────────────────────
// p: rep phase. 0=standing/top, 0.5=bottom of the rep.
const tri = (p) => 1 - Math.abs(2 * p - 1);          // 0→1→0
const down = (p) => (p < 0.5 ? p * 2 : (1 - p) * 2); // 0→1→0, kinked at bottom

const XAX = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const lerpDir = (a, b, k) => new THREE.Vector3().copy(a).lerp(b, k).normalize();
const mirrorX = (v) => new THREE.Vector3(-v.x, v.y, v.z);

// mixamo (arms rest DOWN — Euler deltas are fine here)
function poseMixamo(B, rest, exercise, p) {
  const d = down(p), t = tri(p);
  for (const b of Object.values(B)) if (b && rest.has(b)) b.quaternion.copy(rest.get(b));

  if (exercise === 'squat') {
    const hips = B.hips;
    if (hips) hips.position.y = hips.userData.restY - hips.userData.H * 0.16 * d;
    setQ(B.upLegL, rest, -1.25 * d, 0, 0.12 * d); setQ(B.upLegR, rest, -1.25 * d, 0, -0.12 * d);
    setQ(B.legL, rest, 1.9 * d, 0, 0); setQ(B.legR, rest, 1.9 * d, 0, 0);
    setQ(B.footL, rest, -0.55 * d, 0, 0); setQ(B.footR, rest, -0.55 * d, 0, 0);
    setQ(B.spine, rest, 0.22 * d); setQ(B.spine1, rest, 0.14 * d);
    setQ(B.armL, rest, 0.15, 0, 0.95 - 0.25 * d); setQ(B.armR, rest, 0.15, 0, -0.95 + 0.25 * d);
    setQ(B.foreL, rest, -0.5, 0, 0); setQ(B.foreR, rest, -0.5, 0, 0);
  } else if (exercise === 'jumpingjack') {
    const s = t;
    setQ(B.armL, rest, 0, 0, 0.55 + 2.1 * s); setQ(B.armR, rest, 0, 0, -0.55 - 2.1 * s);
    setQ(B.upLegL, rest, 0, 0, 0.06 + 0.38 * s); setQ(B.upLegR, rest, 0, 0, -0.06 - 0.38 * s);
    if (B.hips) B.hips.position.y = B.hips.userData.restY + B.hips.userData.H * 0.02 * Math.max(0, Math.sin(p * Math.PI * 2) ** 2);
  } else if (exercise === 'curl') {
    setQ(B.armL, rest, 0.1, 0, 0.85); setQ(B.armR, rest, 0.1, 0, -0.85);
    setQ(B.foreL, rest, -1.9 * d, 0, 0); setQ(B.foreR, rest, -1.9 * d, 0, 0);
    setQ(B.spine, rest, -0.06 * d);
  }
  // pushup handled by the shared aim path in ModelAvatar.pose()
}

// all rigs (rest-pose-agnostic — aim/IK from any rest, T-pose or arms-down)
function poseAim(rig, exercise, p) {
  const B = rig.B;
  const d = down(p), t = tri(p);
  rig.reset();

  if (exercise === 'stand') {
    rig.bend(B.spine1, XAX, Math.sin(p * Math.PI * 2) * 0.015);
    rig.bend(B.neck, XAX, -0.04);
    const arm = new THREE.Vector3(0.22, -0.9, 0.06), fore = new THREE.Vector3(0.2, -0.95, 0.12);
    rig.aim(B.armL, arm); rig.aim(B.armR, mirrorX(arm));
    rig.sync();
    rig.aim(B.foreL, fore); rig.aim(B.foreR, mirrorX(fore));
    return;
  }

  if (exercise === 'squat') {
    // hips drop + SIT BACK (hip hinge); feet stay planted via leg IK
    const hips = B.hips;
    const restHips = rig.rrest(hips);
    const cur = rig.rpos(hips, _v1);
    const H = rig.av.H;
    rig.shift(hips, 0, (restHips.y - 0.29 * H * d) - cur.y, (restHips.z - 0.075 * H * d) - cur.z);
    // torso leans forward with depth, distributed over the spine (neutral
    // lumbar — no rounding)
    const lean = 0.55 * d;
    rig.bend(B.spine, XAX, lean * 0.25);
    rig.bend(B.spine1, XAX, lean * 0.35);
    rig.bend(B.spine2, XAX, lean * 0.4);
    rig.sync();
    // legs: 2-link IK, knees track forward + slightly out
    const ankleL = rig.rrest(B.footL), ankleR = rig.rrest(B.footR);
    rig.ik2('upLegL', ankleL, new THREE.Vector3(0.25, 0, 1), rig.len.thighL, rig.len.shinL);
    rig.ik2('upLegR', ankleR, new THREE.Vector3(-0.25, 0, 1), rig.len.thighR, rig.len.shinR);
    rig.sync();
    // shins at the ankles, feet FLAT (heels down), toes slightly out
    rig.aim(B.legL, new THREE.Vector3().copy(ankleL).sub(rig.rpos(B.legL, _v1)).normalize());
    rig.aim(B.legR, new THREE.Vector3().copy(ankleR).sub(rig.rpos(B.legR, _v1)).normalize());
    const footL = rig.dir0.get(B.footL), footR = rig.dir0.get(B.footR);
    rig.aim(B.footL, footL); rig.aim(B.footR, footR);
    rig.aim(B.toeL, new THREE.Vector3().copy(footL).applyAxisAngle(UP, 0.12));
    rig.aim(B.toeR, new THREE.Vector3().copy(footR).applyAxisAngle(UP, -0.12));
    // arms: at the sides at the top → forward for balance at the bottom
    const aD = lerpDir(new THREE.Vector3(0.2, -0.95, 0.1), new THREE.Vector3(0.1, -0.3, 0.95), d);
    rig.aim(B.armL, aD); rig.aim(B.armR, mirrorX(aD));
    rig.sync();
    const fD = lerpDir(new THREE.Vector3(0.18, -0.97, 0.16), new THREE.Vector3(0.08, -0.05, 1.0), d);
    rig.aim(B.foreL, fD); rig.aim(B.foreR, mirrorX(fD));
    // head counters the lean — look forward. NOTE: aim() points the bone's
    // REST direction (≈ straight UP for the neck chain) at the target, so the
    // old targets (0,0.55,0.83)/(0,0.3,0.95) folded the head 56°/72° forward
    // mid-squat — a tucked chin the whole rep (measured pitch, atelier probe).
    // Near-vertical + a modest gaze tilt reads as a lifter looking ahead.
    rig.aim(B.neck, new THREE.Vector3(0, 0.97, 0.26));
    rig.aim(B.head, new THREE.Vector3(0, 0.83, 0.55));
    return;
  }

  if (exercise === 'pushup') {
    // REFERENCE FORM (NSCA / exRx push-up standards):
    //  · rigid plank — ankles, knees, hips, shoulders, ears on ONE line
    //    (glutes braced; no pike, no sag). The legs and spine here are the
    //    UNTOUCHED bind chain, so the body line is straight by construction;
    //    the prone container (set up in ModelAvatar.pose) supplies the rep's
    //    rotation about the toe pivot.
    //  · hands flat, planted under the shoulders for the WHOLE rep (slightly
    //    wider — rig.planted, computed from the θ_top straight-arm geometry).
    //  · elbows track BACK alongside the ribs at ~45° abduction (pole toward
    //    the feet + a little out), never flared to 90° and never pointing at
    //    the ceiling.
    //  · scapula: "push the floor away" at the top, settle at the bottom.
    //  · head: neutral cervical spine — in line with the body, gaze ahead.
    const P = rig.planted;
    if (!P) return;
    // elbows point toward the FEET: the body axis in root space runs toe→head
    const headPt = rig.pt(B.head, _v1);
    const hipsPt = rig.pt(B.hips, _v2);
    const backDir = new THREE.Vector3().subVectors(hipsPt, headPt).normalize(); // toward feet
    const outL = new THREE.Vector3().subVectors(rig.rpos(B.armL, _v3), rig.rpos(B.spine2, new THREE.Vector3()));
    outL.y = 0;
    if (outL.lengthSq() < 1e-8) outL.set(0, 0, -1);
    outL.normalize();
    const poleL = backDir.clone().addScaledVector(outL, 0.45).normalize();
    const poleR = backDir.clone().addScaledVector(outL, -0.45).normalize();
    rig.ik2('armL', P.L, poleL, rig.len.armL, rig.len.foreL);
    rig.ik2('armR', P.R, poleR, rig.len.armR, rig.len.foreR);
    rig.sync();
    rig.aim(B.foreL, new THREE.Vector3().subVectors(P.L, rig.rpos(B.foreL, _v1)).normalize());
    rig.aim(B.foreR, new THREE.Vector3().subVectors(P.R, rig.rpos(B.foreR, _v2)).normalize());
    // hands: straight wrists, flat along the forearm line
    const flatL = new THREE.Vector3().subVectors(P.L, rig.rpos(B.foreL, _v1)).normalize();
    const flatR = new THREE.Vector3().subVectors(P.R, rig.rpos(B.foreR, _v2)).normalize();
    rig.aim(B.handL, flatL); rig.aim(B.handR, flatR);
    // scapular rhythm: slight protraction at the top of the press (d→0)
    rig.bend(B.spine2, new THREE.Vector3(0, 0, 1), 0.08 * (1 - d));
    // head: part of the body line, gaze slightly ahead of the hands
    const gaze = backDir.clone().multiplyScalar(-1).normalize(); // toward head
    rig.aim(B.neck, new THREE.Vector3(gaze.x, gaze.y + 0.25, gaze.z).normalize());
    rig.aim(B.head, new THREE.Vector3(gaze.x, gaze.y + 0.42, gaze.z).normalize());
    return;
  }

  if (exercise === 'jumpingjack') {
    const s = t;
    // REAL jack geometry: feet jump out to ~1.5× shoulder width, knees and
    // toes track slightly OUT, feet land flat; arms sweep the FRONTAL plane
    // from thighs to overhead. Feet MOVE here by definition of the exercise —
    // they lift a touch while travelling (no floor scrape) and land flat.
    const H = rig.av.H;
    const spread = 0.22 * H * s;                    // each foot outward
    const travel = 0.02 * H;                        // slight lift while in motion
    const restL = rig.rrest(B.footL), restR = rig.rrest(B.footR);
    const outL = Math.sign(restL.x || -1), outR = Math.sign(restR.x || 1);
    const ankleL = restL.clone().add(_v1.set(outL * spread, travel, 0));
    const ankleR = restR.clone().add(_v2.set(outR * spread, travel, 0));
    // hips dip slightly as the legs spread (weight shift)
    rig.shift(B.hips, 0, -0.035 * H * s, 0);
    rig.ik2('upLegL', ankleL, new THREE.Vector3(0.5, 0, 0.45), rig.len.thighL, rig.len.shinL);
    rig.ik2('upLegR', ankleR, new THREE.Vector3(-0.5, 0, 0.45), rig.len.thighR, rig.len.shinR);
    rig.sync();
    rig.aim(B.legL, new THREE.Vector3().subVectors(ankleL, rig.rpos(B.legL, _v1)).normalize());
    rig.aim(B.legR, new THREE.Vector3().subVectors(ankleR, rig.rpos(B.legR, _v2)).normalize());
    rig.sync();
    // feet FLAT at landing, toes tracking the knees (out at the spread)
    const footL = rig.dir0.get(B.footL), footR = rig.dir0.get(B.footR);
    rig.aim(B.footL, new THREE.Vector3().copy(footL).applyAxisAngle(UP, 0.15 + 0.25 * s));
    rig.aim(B.footR, new THREE.Vector3().copy(footR).applyAxisAngle(UP, -(0.15 + 0.25 * s)));
    rig.aim(B.toeL, new THREE.Vector3().copy(footL).applyAxisAngle(UP, 0.2 + 0.3 * s));
    rig.aim(B.toeR, new THREE.Vector3().copy(footR).applyAxisAngle(UP, -(0.2 + 0.3 * s)));
    // arms sweep sides → overhead in the frontal plane, palms facing in
    const aD = lerpDir(new THREE.Vector3(0.18, -0.98, 0.04), new THREE.Vector3(0.22, 0.965, 0), s);
    rig.aim(B.armL, aD); rig.aim(B.armR, mirrorX(aD));
    rig.sync();
    const fD = lerpDir(new THREE.Vector3(0.14, -0.985, 0.06), aD, 0.85 + 0.15 * s);
    rig.aim(B.foreL, fD); rig.aim(B.foreR, mirrorX(fD));
    rig.aim(B.neck, new THREE.Vector3(0, 0.98, 0.2));   // was (0,0.35,0.94): 70° head fold
    rig.aim(B.head, new THREE.Vector3(0, 0.92, 0.4));
    return;
  }

  if (exercise === 'curl') {
    // upper arms pinned at the sides (slight forward cheat at the top of the
    // curl); forearms sweep from hanging to fully curled
    const arm = new THREE.Vector3(0.1, -0.985, 0.09 + 0.14 * d);
    rig.aim(B.armL, arm); rig.aim(B.armR, mirrorX(arm));
    rig.sync();
    const fD = lerpDir(new THREE.Vector3(0.06, -0.99, 0.1), new THREE.Vector3(0.04, 0.82, 0.57), d);
    rig.aim(B.foreL, fD); rig.aim(B.foreR, mirrorX(fD));
    rig.bend(B.spine1, XAX, -0.05 * d);
    rig.aim(B.neck, new THREE.Vector3(0, 0.99, 0.15));  // was (0,0.3,0.95): 72° head fold
    rig.aim(B.head, new THREE.Vector3(0, 0.95, 0.31));
    return;
  }
}

// ── the avatar wrapper ───────────────────────────────────────────────────────
export class ModelAvatar {
  constructor(scene, rig) {
    this.root = new THREE.Group();
    this.prone = new THREE.Group(); // push-up tilt container — scene lives INSIDE it
    this.root.add(this.prone);
    this.prone.add(scene);
    this.bones = boneMap(scene, rig);
    this.rest = captureRest(this.bones);
    this.rig = rig;
    // facing fix: some exports face −Z (Soldier's toes point backward). All
    // pose directions assume forward = +Z, so flip backward models at load.
    // (Animations keep working — this only rotates the scene container.)
    const toeL = this.bones.toeL, footL = this.bones.footL;
    if (toeL && footL) {
      scene.updateMatrixWorld(true);
      const tz = toeL.getWorldPosition(new THREE.Vector3()).z - footL.getWorldPosition(new THREE.Vector3()).z;
      if (tz < 0) scene.rotateY(Math.PI);
    }
    // body height + hips rest offset, for proportional squat drop (mixamo)
    const box = new THREE.Box3().setFromObject(scene);
    this.H = box.max.y - box.min.y;
    const hips = this.bones.hips;
    if (hips) { hips.userData.restY = hips.position.y; hips.userData.H = this.H; }
    // centre on origin, feet on y=0
    scene.position.sub(new THREE.Vector3((box.max.x + box.min.x) / 2, box.min.y, (box.max.z + box.min.z) / 2));
    this.aimrig = new AimRig(this);
  }
  pose(exercise, p) {
    const rig = this.aimrig;
    rig.s = this.root.scale.x || 1; // gallery normalises scale before posing
    const wantProne = exercise === 'pushup';
    this.prone.rotation.order = 'YXZ';
    if (!wantProne) {
      this.prone.rotation.set(0, 0, 0);
      this.prone.position.set(0, 0, 0);
      poseAim(rig, exercise, p);
      return;
    }
    // Tip the figure face-down, pivoting at the TOES: Rx(θ) chest-to-ground,
    // Ry(π/2) swings the body axis to +X (camera at +Z sees the left
    // profile). θ eases from 90° (flat, bottom of rep) to ~72° (inclined,
    // top of rep — real push-up geometry: the body rises as arms straighten).
    const d = down(p);
    const toe = new THREE.Vector3()
      .add(rig.rrest(rig.B.toeL)).add(rig.rrest(rig.B.toeR)).multiplyScalar(0.5);
    const headTop = rig.rrest(rig.B.head);
    const span = Math.max(0.6, headTop.distanceTo(toe));
    // Solve the top-of-rep incline analytically for THIS model's proportions:
    // shoulder height above the toe pivot after Rx(θ) is A·cosθ + B·sinθ
    // (A, B from the rest shoulder offset); we want it at "arms ~94% extended"
    // reaching the ground — models with short arms relative to the torso
    // (Soldier) get a shallower incline than long-armed ones (orc).
    const arm = rig.armTotal || 0.4 * this.H;
    const fwd = 0.16 * arm;
    const C = 0.05 * arm + Math.sqrt(Math.max(0.01, (0.94 * arm) ** 2 - fwd * fwd));
    const shRel = new THREE.Vector3().copy(rig.rrest(rig.B.armL)).sub(toe);
    const A = shRel.y, B = -shRel.z;
    const Rhyp = Math.hypot(A, B) || 1;
    const phi = Math.atan2(B, A);
    const thetaTop = Math.min(Math.PI / 2 - 0.05, phi + Math.acos(Math.min(0.999, C / Rhyp)));
    const setProne = (theta) => {
      this.prone.rotation.set(theta, Math.PI / 2, 0);
      // position so the toe mid-point stays on the ground at x = −span/2
      // (keeps the prone figure centred on the origin for the camera)
      const target = new THREE.Vector3(-span * 0.5, 0.02 * this.H, 0);
      this.prone.position.copy(toe).applyQuaternion(this.prone.quaternion).multiplyScalar(-1).add(target);
      this.prone.updateMatrix();
    };
    let theta = thetaTop + (Math.PI / 2 - thetaTop) * d;
    setProne(theta);
    // ground clearance: the body has thickness — if any key joint (the body
    // axis) would sit under ~6% of height, relax θ (tipping back about the
    // toes lifts the body) until it clears.
    const clear = 0.06 * this.H;
    const keys = [rig.B.hips, rig.B.spine2, rig.B.head, rig.B.upLegL, rig.B.upLegR, rig.B.legL, rig.B.legR].filter(Boolean);
    let minY = Math.min(...keys.map((b) => rig.pt(b, _v1).y));
    if (minY < clear) {
      theta = Math.max(Math.PI / 2 - 0.55, theta - (clear - minY) / (span * 0.55));
      setProne(theta);
    }
    // ── planted hands (real push-up geometry) ──
    // Hands are FIXED on the ground for the whole rep, directly under the
    // shoulders at the top-of-rep incline (straight-arm support). As θ tips
    // the body toward the floor, the elbows bend to keep them planted — the
    // arms absorb the rep, the body stays a rigid plank. Compute the plant
    // from the θ_top geometry, then restore the frame's θ.
    setProne(thetaTop);
    this.prone.updateMatrix();
    const hy = 0.03 * arm;
    const zL = rig.pt(rig.B.armL, _v2).z, zR = rig.pt(rig.B.armR, _v2).z;
    rig.planted = {
      L: new THREE.Vector3(rig.pt(rig.B.armL, _v1).x, hy, zL + Math.sign(zL || 1) * 0.02 * this.H),
      R: new THREE.Vector3(rig.pt(rig.B.armR, _v1).x, hy, zR + Math.sign(zR || -1) * 0.02 * this.H),
    };
    setProne(theta);
    poseAim(rig, exercise, p); // shared aim/IK path (both rig families)
  }
}

// ── Geno flat tint (the game's own approach: same model, tint = character) ──
// Geno ships ONE white material, so material.color tints cleanly. A flat
// Lambert response reads best on the dark card stage (no specular glow, the
// tier colour reads as colour). Materials are created per call — loadModel()
// clones share materials with the cached source scene, so each card needs
// its own instance.
export const GENO_TINTS = {
  couch: '#ffb020',   // rookie→couch amber
  casual: '#6ec1ff',  // casual sky
  fit: '#c6f32e',     // fit lime
  athlete: '#ff5c38', // athlete coral
  goblin: '#598c1f',  // the game's goblin green (0.35, 0.55, 0.12)
  human: '#d1a680',   // the game's warm human skin (0.82, 0.65, 0.50)
};

export function applyFlatTint(root, hex = '#ffffff') {
  const color = new THREE.Color(hex);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = new THREE.MeshLambertMaterial({ color });
  });
}

// ── BVH mocap playback (AI4Animation captures → Geno) ───────────────────────
// The game's five goblin mocap captures. Joint names are mixamo-style and
// Geno's 62 joints all exist in each file (62/62 match, per the game docs).
export const BVH_FILES = {
  walk: '/models/goblin_walk_stick.bvh',
  limp: '/models/goblin_limp.bvh',
  drag: '/models/goblin_drag.bvh',
  one_arm: '/models/goblin_one_arm.bvh',
  combat: '/models/goblin_combat.bvh',
};

const bvhLoader = new BVHLoader();
const bvhCache = new Map();

/** Fetch + parse a BVH once; returns { skeleton, clip } (see lib/BVHLoader.js). */
export async function loadBVH(file) {
  if (!bvhCache.has(file)) {
    const text = await (await fetch(file)).text();
    bvhCache.set(file, bvhLoader.parse(text));
  }
  return bvhCache.get(file);
}

/**
 * BVHPlayer — drives a ModelAvatar from a BVH clip via WORLD-SPACE
 * retargeting.
 *
 * Why not just copy local rotations (or run the clip through an
 * AnimationMixer on Geno, which amounts to the same thing)? The BVH rest
 * hierarchy has the arms straight UP while Geno binds arms-OUT, and the
 * captures' frame-0 pose is arms HANGING — BVH locals are only meaningful
 * inside the BVH's own rest frames. Instead each Geno bone tracks its BVH
 * counterpart's WORLD orientation through a constant per-bone frame
 * conversion E(b), derived from the two rigs' own geometry:
 *
 *      E(b)  = rot(ĉ_bvh(b) → ĉ_geno(b))     (primary-child offset dirs)
 *      WQ_geno(t, b) = WQ_bvh(t, b) · E(b)⁻¹
 *
 * where ĉ(b) is the direction from bone b to its chain child, expressed in
 * b's LOCAL frame (the child's local position). Because E converts local
 * frames using the same offsets the world pose is built from, Geno's limb
 * direction is EXACTLY parallel to the BVH's at every frame:
 *
 *      dir_geno(t) = WQ_bvh(t)·E⁻¹·ĉ_geno·L = WQ_bvh(t)·ĉ_bvh·L = dir_bvh(t)·L
 *
 * — the capture's stride, arm swing, spine lean and head look transfer at
 * full amplitude, and the base pose IS the capture's own frame-0 pose
 * (arms hanging), no reference-pose matching needed. (A pose-matched
 * alignment A = P·B_ref⁻¹ was tried first and is WRONG here: Geno's bone
 * frames are ~90° off the BVH's, so conjugating the motion through A turns
 * forward leg swings into sideways ones.)
 *
 * Per frame, locals are solved top-down so each bone only needs its
 * parent's already-solved world quaternion:
 *
 *      q_local(b) = WQ_parent⁻¹ · WQ_bvh(t, b) · E(b)⁻¹
 *
 * The hips additionally follow the BVH root's Y translation (scaled from
 * capture cm to model units); X/Z travel is dropped so the figure walks in
 * place inside a gallery card.
 */
// chain child for the frame conversion (both rigs share these names);
// finger/segment bones fall through to the digit-increment rule
const PRIMARY_CHILD = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Spine3', Spine3: 'Neck',
  Neck: 'Neck1', Neck1: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};

export class BVHPlayer {
  constructor(avatar, bvh) {
    this.av = avatar;
    this.clip = bvh.clip;
    this.duration = Math.max(0.01, bvh.clip.duration);
    this.dead = false;

    // BVH rig: linked Bone hierarchy (bones[0] = Hips). The mixer binds the
    // clip's `<name>.quaternion` / `<name>.position` tracks to these bones.
    this.holder = new THREE.Object3D();
    this.holder.add(bvh.skeleton.bones[0]);
    this.mixer = new THREE.AnimationMixer(this.holder);
    this.action = this.mixer.clipAction(bvh.clip);
    this.action.play();
    // pose "clips" (Xbot sad_pose/sneak_pose etc.) are two-key settles under
    // 0.25s — looping them flickers. Play once and hold the end pose instead.
    // Sources can force this with `hold: true` (GENO_CLIPS spec).
    this.hold = bvh.hold ?? bvh.clip.duration < 0.25;
    if (this.hold) {
      this.action.setLoop(THREE.LoopOnce, 1);
      this.action.clampWhenFinished = true;
    }

    const byName = new Map();
    // normalised keys: BVH rigs use plain names, mixamo GLBs arrive as
    // `mixamorig:Hips`→`mixamorigHips` — normBone folds both onto the key
    // space Geno's plain names already live in.
    bvh.skeleton.bones.forEach((b) => byName.set(normBone(b.name), b));
    this.bvhHips = byName.get('Hips') ?? bvh.skeleton.bones[0];

    // matched (geno bone, source bone) pairs in top-down hierarchy order
    const scene = avatar.prone.children[0];
    this.pairs = [];
    this.pairIndex = new Map();
    scene.traverse((o) => {
      if (!o.isBone) return;
      const b = byName.get(normBone(o.name));
      if (b) { this.pairIndex.set(o, this.pairs.length); this.pairs.push([o, b]); }
    });
    if (!this.pairs.length) throw new Error('BVHPlayer: no joint-name overlap with the model');

    // ── frame conversion E per bone ──
    // For each Geno bone, find its chain child (the joint it "points at"),
    // take the child's local position (the offset) in BOTH rigs, and build
    // the rotation that maps the BVH-local offset direction onto Geno's.
    // End bones (no child) inherit their parent's conversion.
    const genoChild = new Map(); // geno bone -> geno chain-child bone
    for (const [g] of this.pairs) {
      const kids = g.children.filter((c) => this.pairIndex.has(c));
      if (!kids.length) continue;
      let pick = kids[0];
      const m = g.name.match(/^(\D+)(\d+)$/);
      if (m) {
        const cont = kids.find((c) => c.name === m[1] + (Number(m[2]) + 1));
        if (cont) pick = cont;
      } else if (PRIMARY_CHILD[g.name]) {
        const p = kids.find((c) => c.name === PRIMARY_CHILD[g.name]);
        if (p) pick = p;
      }
      genoChild.set(g, pick);
    }
    const E = [];
    for (let i = 0; i < this.pairs.length; i++) {
      const g = this.pairs[i][0];
      const child = genoChild.get(g);
      if (!child) {
        const p = g.parent && this.pairIndex.get(g.parent);
        E.push((p != null && p < i) ? E[p].clone() : new THREE.Quaternion());
        continue;
      }
      const bChild = byName.get(normBone(child.name));
      const dg = child.position.clone().normalize();
      const db = bChild.position.clone().normalize();
      if (dg.lengthSq() < 0.5 || db.lengthSq() < 0.5) { E.push(new THREE.Quaternion()); continue; }
      E.push(new THREE.Quaternion().setFromUnitVectors(db, dg));
    }
    this.E = E;
    this.Einv = E.map((q) => q.clone().invert());

    // ── bind-pose snapshot ──
    // Players can be constructed while a POSE is live (headCheck does it) —
    // snap the FULL skeleton back to bind first so every capture below
    // (hipsRest, ground refs) is a bind quantity. (v7: aimrig.reset() now
    // restores every joint, not just the logical map.)
    avatar.aimrig.reset();
    avatar.prone.rotation.set(0, 0, 0);
    avatar.prone.position.set(0, 0, 0);
    this._gworld = this.pairs.map(() => new THREE.Quaternion());
    this._bq = new THREE.Quaternion();
    this._tq = new THREE.Quaternion();
    this._pq = new THREE.Quaternion();
    this._hq = new THREE.Quaternion();
    this._hp = new THREE.Vector3();

    // ── source world-frame alignment + scale ──
    // GLB sources bake their exporter's axes into the skeleton's world frame
    // (Soldier.glb is Z-up: height lives on world Z, world Y is sideways), and
    // the retarget copies WORLD quaternions — without correction Geno would
    // follow those axes and tip onto its side. R_align rigidly rotates the
    // source's own up axis (toe-midpoint → head, at frame 0) onto +Y; it is
    // identity for Y-up rigs (BVH, Xbot, the exported demo loops).
    this.mixer.setTime(0);
    this.holder.updateMatrixWorld(true);
    const srcW = (name, out) => { const b = byName.get(name); return b ? b.getWorldPosition(out) : null; };
    const srcHips = this.bvhHips.getWorldPosition(new THREE.Vector3());
    const srcHead = srcW('Head', new THREE.Vector3());
    const srcToe = new THREE.Vector3();
    let toeN = 0;
    for (const n of ['LeftToeBase', 'RightToeBase']) { const t = srcW(n, new THREE.Vector3()); if (t) { srcToe.add(t); toeN++; } }
    this.srcUp = new THREE.Vector3(0, 1, 0);
    if (srcHead && toeN) {
      const up = srcHead.sub(srcToe.divideScalar(toeN));
      if (up.lengthSq() > 1e-4) this.srcUp.copy(up.normalize());
    }
    this.Ralign = new THREE.Quaternion().setFromUnitVectors(this.srcUp, UP);
    // scale from the LEG CHAIN (hips→ankle distance): a rigid length, so it is
    // axis-independent and immune to hips-translation track unit mismatches.
    const srcAnkleB = byName.get('LeftFoot') ?? byName.get('RightFoot');
    let sc = 0;
    if (srcAnkleB && avatar.bones.hips && (avatar.bones.footL ?? avatar.bones.footR)) {
      const srcLeg = srcAnkleB.getWorldPosition(new THREE.Vector3()).distanceTo(srcHips);
      const gH = avatar.bones.hips.getWorldPosition(new THREE.Vector3());
      const gLeg = (avatar.bones.footL ?? avatar.bones.footR).getWorldPosition(new THREE.Vector3()).distanceTo(gH);
      if (srcLeg > 1e-6) sc = gLeg / srcLeg;
    }
    if (!(sc > 1e-6)) {
      // fallback: overall joint span along the rig's own up axis
      let lo = Infinity, hi = -Infinity;
      const _sp = new THREE.Vector3();
      bvh.skeleton.bones.forEach((b) => {
        const p = b.getWorldPosition(_sp).dot(this.srcUp);
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      });
      sc = avatar.H / Math.max(1e-6, hi - lo);
    }
    this.scale = sc;
    this.hips = avatar.bones.hips;
    this.hipsRest = this.hips.position.clone();   // bind (aimrig.reset above)
    this.hipsRefY = srcHips.dot(this.srcUp);

    // ── apply frame 0, then fit the figure to the card ──
    const s0 = avatar.root.scale.x || 1;
    const jointY = (b) => b.getWorldPosition(new THREE.Vector3()).y / s0;
    const groundBind = Math.min(
      ...[avatar.bones.toeL, avatar.bones.toeR, avatar.bones.footL, avatar.bones.footR]
        .filter(Boolean).map(jointY));
    this._solve();
    avatar.root.updateMatrixWorld(true);
    // ground correction: keep the stance foot at its bind height even though
    // Geno's leg proportions differ slightly from the capture subject's.
    // Applied as a constant world-Y offset riding the same parent-frame
    // transform as the per-frame bob (below).
    const groundRef = Math.min(
      ...[avatar.bones.toeL, avatar.bones.toeR, avatar.bones.footL, avatar.bones.footR]
        .filter(Boolean).map(jointY));
    this.groundFix = groundBind - groundRef;
    // orient the figure PROFILE to the camera (+X): the stride reads best
    // side-on. Forward = hips → mid-toes, horizontal.
    const fwd = new THREE.Vector3()
      .add(avatar.bones.toeL.getWorldPosition(new THREE.Vector3()))
      .add(avatar.bones.toeR.getWorldPosition(new THREE.Vector3()))
      .multiplyScalar(0.5)
      .sub(avatar.bones.hips.getWorldPosition(new THREE.Vector3()));
    fwd.y = 0;
    this.rootYaw = 0;
    if (fwd.lengthSq() > 1e-6) {
      this.rootYaw = Math.PI / 2 - Math.atan2(fwd.x, fwd.z);
      avatar.root.rotation.y += this.rootYaw;
    }

    // Geno's skeleton frames are ~90° rotated from world (FBX-style bone
    // convention: the Hips' local +Y is world +Z), so the world-space Y
    // delta must be transformed into the hips' PARENT frame — the same
    // decomposition AimRig.shift() uses. Captured once, AFTER the yaw above
    // (it changes the parent's world orientation): the containers don't
    // move during playback.
    const par = this.hips.parent;
    par.updateWorldMatrix(true, false);
    this._pq0 = new THREE.Quaternion();
    this._ps0 = new THREE.Vector3();
    new THREE.Matrix4().copy(par.matrixWorld).decompose(new THREE.Vector3(), this._pq0, this._ps0);
    this._invQ = new THREE.Quaternion();
    this._dv = new THREE.Vector3();

    this.time = 0;

    // ── stance-foot pinning (anti-skating) ──
    // The mixamo "in-place" clips (and root-travel-dropped captures) carry
    // the treadmill artifact: the stance foot slides backward at gait speed.
    // Each frame, the LOWER ankle (when near the ground) is pinned where it
    // last planted by a live 2-bone IK on thigh+shin — the leg reaches back
    // to its plant instead of skating. XZ only; ankle height keeps following
    // the retargeted capture (heel-toe roll stays).
    const B = avatar.bones;
    this._legs = [B.upLegL && B.legL && B.footL ? { up: B.upLegL, knee: B.legL, ankle: B.footL } : null,
                  B.upLegR && B.legR && B.footR ? { up: B.upLegR, knee: B.legR, ankle: B.footR } : null];
    this._pins = [null, null];      // planted XZ per leg (model units)
    this._support = null;           // sticky support foot (0/1/null)
    this._fmin = [Infinity, Infinity]; // per-foot ankle-height running min
    this._fmax = [-Infinity, -Infinity];
  }

  /** rotate a posed bone so its CURRENT chain direction aims at targetDir
   *  (unit, model space) — live version of AimRig.aim, no rest assumptions */
  _aimLive(bone, child, targetDir) {
    bone.getWorldQuaternion(_q1);
    const d0 = _v1.copy(child.position).applyQuaternion(_q1);
    if (d0.lengthSq() < 1e-10) return;
    d0.normalize();
    const dq = _q2.setFromUnitVectors(d0, targetDir);
    const nw = _q1.premultiply(dq);
    bone.parent.getWorldQuaternion(_q3);
    bone.quaternion.copy(_q3.invert().multiply(nw));
  }

  /** pin the support leg's ankle to its planted XZ (live 2-link IK) */
  _pinStance() {
    if (!this._legs[0] && !this._legs[1]) return;
    const s = this.av.root.scale.x || 1;
    const rpos = (b) => b.getWorldPosition(new THREE.Vector3()).divideScalar(s);
    const a0 = this._legs[0] ? rpos(this._legs[0].ankle) : null;
    const a1 = this._legs[1] ? rpos(this._legs[1].ankle) : null;
    const H = this.av.H;
    // per-foot adaptive stance gate: an ankle is a stance candidate while it
    // sits near its own running minimum height (self-tunes per clip — walk
    // swings low, run swings high). Bounds tighten instantly and relax
    // slowly so step-to-step variation doesn't trip them.
    const cand = [false, false];
    for (let j = 0; j < 2; j++) {
      const a = j === 0 ? a0 : a1;
      if (!a) continue;
      this._fmin[j] = Math.min(this._fmin[j] + 0.004 * H, a.y);
      this._fmax[j] = Math.max(this._fmax[j] - 0.004 * H, a.y);
      cand[j] = a.y < this._fmin[j] + 0.45 * Math.max(1e-3, this._fmax[j] - this._fmin[j]);
    }
    // pin EVERY planted foot (double support pins both); a foot that lifts
    // out of its stance band is released and its pin discarded
    let any = false;
    for (let j = 0; j < 2; j++) {
      const leg = this._legs[j];
      const a = j === 0 ? a0 : a1;
      if (!leg || !a) continue;
      if (cand[j]) {
        any = true;
        let pin = this._pins[j];
        if (!pin || Math.hypot(a.x - pin.x, a.z - pin.z) > 0.35 * H) {
          this._pins[j] = new THREE.Vector3(a.x, a.y, a.z); // fresh plant
          continue;
        }
        this._pinLeg(leg, a, pin.x, pin.z, a.y);
      } else {
        this._pins[j] = null;
        // scrape guard: a swinging foot whose ankle drags its own floor
        // while moving gets a small knee-lift clearance
        if (a.y < this._fmin[j] + 0.012 * H) {
          this._pinLeg(leg, a, a.x, a.z, this._fmin[j] + 0.02 * H);
        }
      }
    }
    if (!any) this._support = null;
  }

  /** live 2-link IK: pull leg's ankle toward (tx,tz) — stance pins reuse the
   *  current ankle height; the scrape guard overrides y to lift the foot */
  _pinLeg(leg, a, tx, tz, ty) {
    const s = this.av.root.scale.x || 1;
    const rpos = (b) => b.getWorldPosition(new THREE.Vector3()).divideScalar(s);
    // 80% of the slide is corrected per frame (soft — no pops)
    tx = a.x + 0.9 * (tx - a.x); tz = a.z + 0.9 * (tz - a.z);
    const hip = rpos(leg.up), kneeP = rpos(leg.knee);
    const L1 = hip.distanceTo(kneeP), L2 = kneeP.distanceTo(a);
    if (L1 < 1e-6 || L2 < 1e-6) return;
    const target = new THREE.Vector3(tx, ty, tz);
    const to = target.clone().sub(hip);
    const dist = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, to.length()));
    to.normalize();
    // bend plane: keep the knee on its current side (pole = knee offset
    // projected off the hip→target line)
    const pole = kneeP.clone().sub(hip);
    pole.addScaledVector(to, -pole.dot(to));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
    pole.normalize();
    const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
    const n = to.clone().cross(pole);
    if (n.lengthSq() < 1e-8) return;
    const mid = to.clone().applyAxisAngle(n.normalize(), Math.acos(cosA)).multiplyScalar(L1).add(hip);
    this._aimLive(leg.up, leg.knee, mid.sub(hip).normalize());
    this.av.root.updateMatrixWorld(true);
    const knee2 = rpos(leg.knee);
    this._aimLive(leg.knee, leg.ankle, target.sub(knee2).normalize());
  }

  /** when a foot is planted, nothing below the ankle may sit under the
   *  ground: lift the hips (a Y offset on the bob channel) by the sink */
  _groundClamp() {
    const B = this.av.bones;
    const js = [B.toeL, B.toeR, B.footL, B.footR].filter(Boolean);
    if (!js.length) return 0;
    const s = this.av.root.scale.x || 1;
    let minY = Infinity;
    for (const j of js) minY = Math.min(minY, j.getWorldPosition(_v3).divideScalar(s).y);
    return minY < -0.015 * this.av.H ? -minY : 0; // positive lift needed
  }

  /** solve Geno locals from the source rig's current world quaternions */
  _solve() {
    const { pairs, Einv, Ralign, _gworld, _bq, _tq, _pq, _hq } = this;
    for (let i = 0; i < pairs.length; i++) {
      const g = pairs[i][0], b = pairs[i][1];
      b.getWorldQuaternion(_bq);
      _tq.copy(_bq).multiply(Einv[i]).premultiply(Ralign); // target world quaternion
      const parent = g.parent;
      let pq;
      if (parent && this.pairIndex.has(parent)) pq = _gworld[this.pairIndex.get(parent)];
      else if (parent) pq = parent.getWorldQuaternion(_pq);
      else pq = _hq.identity();
      g.quaternion.copy(_hq.copy(pq).invert().multiply(_tq));
      _gworld[i].copy(_tq);
    }
  }

  stop() {
    if (this.dead) return;
    this.dead = true;
    this.mixer.stopAllAction();
    // FULL bind restore (v7 FIX 4): every joint — including the ones outside
    // the logical bone map — back to bind, plus the prone container, so the
    // exercise-pose path resumes from a clean bind no matter what the clip
    // (or a late-arriving player) touched. hips + rootYaw were the only
    // other channels update() writes.
    this.av.aimrig.reset();
    this.av.prone.rotation.set(0, 0, 0);
    this.av.prone.position.set(0, 0, 0);
    if (this.hips) this.hips.position.copy(this.hipsRest);
    if (this.rootYaw) this.av.root.rotation.y -= this.rootYaw;
  }

  /** apply a world-space Y delta to the hips through the parent-frame transform */
  _hipsWorldY(delta) {
    const s = this.av.root.scale.x || 1;
    this._dv.set(0, (delta * s) / (this._ps0.y || s), 0)
      .applyQuaternion(this._invQ.copy(this._pq0).invert());
    this.hips.position.add(this._dv);
  }

  update(dt) {
    if (this.dead) return;
    if (this.hold) this.time = Math.min(this.time + dt, this.duration);
    else this.time = (this.time + dt) % this.duration;
    this.mixer.setTime(this.time);
    this.holder.updateMatrixWorld(true);
    this._solve();
    // hips bob (projected on the source's up axis) + ground fix: world-space
    // delta → hips-parent local (X/Z travel dropped so the figure walks in
    // place inside a card)
    const dy = (this.bvhHips.getWorldPosition(this._hp).dot(this.srcUp) - this.hipsRefY) * this.scale + this.groundFix;
    this.hips.position.copy(this.hipsRest);
    this._hipsWorldY(dy);
    this._pinStance(); // support foot stays planted (anti-skating)
    const lift = this._groundClamp(); // planted feet must not sink
    if (lift > 0) this._hipsWorldY(0.85 * lift);
  }
}

// ── Real mocap for Geno: embedded GLB clips + the source repo's own motions ──
// Geno ships WITHOUT animations — but its source project does not. Geno is
// byte-identical to facebookresearch/ai4animationpy `Demos/_ASSETS_/Geno/
// Model.glb` (md5 match), where it is driven by real CMU-derived mocap, and
// the site already carries mixamo-convention GLBs with embedded human mocap:
// Soldier.glb (Idle/Walk/Run/TPose) and Xbot.glb (agree/headShake/idle/run/
// sad_pose/sneak_pose/walk). Their skeletons use the same mixamo joint names
// as Geno (modulo the `mixamorig:` prefix), so the BVHPlayer's world-quaternion
// retarget transfers them exactly: per bone, E(b) maps the SOURCE rig's local
// chain direction onto Geno's, then Geno's locals are solved top-down.
//
// `scripts/avatars/geno_npz_export.py` additionally extracts looping cycles
// from Geno's OWN demo motions (the 23-joint world-space npz captures shipped
// in the source repo's _ASSETS_/Geno/Motions/) into compact JSON clips with
// the same rig shape. RobotExpressive.glb was probed too — its skeleton is
// NOT mixamo-named (Bone/Foot.L/Body/… + morph targets), so it is not
// retargetable this way and is left for its own native playback.

const gltfAnimCache = new Map();
async function gltfWithAnims(file) {
  if (!gltfAnimCache.has(file)) gltfAnimCache.set(file, await loader.loadAsync(file));
  return gltfAnimCache.get(file);
}

/** Deep-copy only the Bone chain under `src` (bind transforms, no meshes). */
function cloneBoneTree(src) {
  const out = new THREE.Bone();
  out.name = src.name;
  out.position.copy(src.position);
  out.quaternion.copy(src.quaternion);
  out.scale.copy(src.scale);
  for (const c of src.children) if (c.isBone) out.add(cloneBoneTree(c));
  return out;
}

const flatBones = (root) => { const a = []; root.traverse((o) => { if (o.isBone) a.push(o); }); return a; };

/** GLB → { skeleton, clip } shaped like the BVH result (bare bone rig bound
 *  to the clip's tracks) so BVHPlayer retargets it unchanged. The rig is a
 *  fresh bare-bone clone per call — mixers mutate, and the cached source
 *  scene must never be. */
export async function loadGLTFClip(file, clipName) {
  const gltf = await gltfWithAnims(file);
  const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
  if (!clip) throw new Error(`clip "${clipName}" not in ${file}`);
  let root = null;
  gltf.scene.traverse((o) => { if (!root && o.isBone && !(o.parent && o.parent.isBone)) root = o; });
  if (!root) throw new Error(`no bone hierarchy in ${file}`);
  const rig = cloneBoneTree(root);
  const bones = flatBones(rig);
  // the bare rig only carries the skeleton's Bone nodes; mixamo exports also
  // animate non-skeleton helper nodes (leaf *3/*4 fingers) whose tracks have
  // no target here — drop them so the mixer logs no binding warnings.
  const names = new Set(bones.map((b) => b.name));
  const tracks = clip.tracks.filter((t) => names.has(t.name.slice(0, t.name.indexOf('.'))));
  const slim = tracks.length === clip.tracks.length ? clip
    : new THREE.AnimationClip(clip.name, clip.duration, tracks);
  return { skeleton: { bones }, clip: slim };
}

/** Exported Geno demo-motion JSON (see scripts/avatars/geno_npz_export.py)
 *  → { skeleton, clip }: a bare bone rig built from the capture's rest
 *  offsets plus quaternion tracks (local, per bone) and a Hips position
 *  track. Loop is baked (endpoints pose-matched + yaw de-trended). */
const jsonClipCache = new Map();
export async function loadJSONClip(file) {
  if (!jsonClipCache.has(file)) {
    const data = await (await fetch(file)).json();
    const proto = data.names.map((name, i) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.fromArray(data.offsets[i]);
      return b;
    });
    data.parents.forEach((p, i) => { if (p >= 0) proto[p].add(proto[i]); });
    const times = data.times;
    const tracks = [];
    for (const name of data.names) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, data.quats[name]));
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${data.names[0]}.position`, times, data.hipsPos));
    const clip = new THREE.AnimationClip(file, times[times.length - 1], tracks);
    jsonClipCache.set(file, { bones: proto, clip });
  }
  const cached = jsonClipCache.get(file);
  return { skeleton: { bones: flatBones(cloneBoneTree(cached.bones[0])) }, clip: cached.clip };
}

// The unified Geno clip list: real mocap first (the default `walk` is proper
// locomotion), the original AI4Animation demo captures preserved at the end.
export const GENO_CLIPS = {
  // mixamo-convention GLB clips (Soldier = neutral soldier mocap)
  walk:      { label: 'walk',        group: 'mocap',    type: 'glb', file: '/models/Soldier.glb', clip: 'Walk' },
  run:       { label: 'run',         group: 'mocap',    type: 'glb', file: '/models/Soldier.glb', clip: 'Run' },
  idle:      { label: 'idle',        group: 'mocap',    type: 'glb', file: '/models/Soldier.glb', clip: 'Idle' },
  // Geno's own demo motions (CMU-derived, exported from the source repo)
  demo_walk: { label: 'demo walk',   group: 'mocap',    type: 'json', file: '/models/geno_npz_walk.json' },
  demo_run:  { label: 'demo run',    group: 'mocap',    type: 'json', file: '/models/geno_npz_run.json' },
  sprint:    { label: 'sprint',      group: 'mocap',    type: 'json', file: '/models/geno_npz_sprint.json' },
  // Xbot character clips (mixamo re-targeted acting mocap)
  swagger:   { label: 'swagger walk', group: 'character', type: 'glb', file: '/models/Xbot.glb', clip: 'walk' },
  agree:     { label: 'nod yes',     group: 'character', type: 'glb', file: '/models/Xbot.glb', clip: 'agree' },
  headshake: { label: 'shake head',  group: 'character', type: 'glb', file: '/models/Xbot.glb', clip: 'headShake' },
  sad:       { label: 'sad',         group: 'character', type: 'glb', file: '/models/Xbot.glb', clip: 'sad_pose', hold: true },
  sneak:     { label: 'sneak',       group: 'character', type: 'glb', file: '/models/Xbot.glb', clip: 'sneak_pose', hold: true },
  // the original AI4Animation demo captures (formerly the whole "BVH" list)
  goblin_walk:  { label: 'stick walk (old)', group: 'captures', type: 'bvh', file: '/models/goblin_walk_stick.bvh' },
  goblin_limp:  { label: 'limp (old)',       group: 'captures', type: 'bvh', file: '/models/goblin_limp.bvh' },
  goblin_drag:  { label: 'drag (old)',       group: 'captures', type: 'bvh', file: '/models/goblin_drag.bvh' },
  goblin_arm:   { label: 'one arm (old)',    group: 'captures', type: 'bvh', file: '/models/goblin_one_arm.bvh' },
  goblin_combat:{ label: 'combat (old)',     group: 'captures', type: 'bvh', file: '/models/goblin_combat.bvh' },
};

/** Resolve a GENO_CLIPS id (or legacy BVH_FILES key / direct path) into the
 *  { skeleton, clip } pair BVHPlayer retargets. */
export async function loadGenoClip(id) {
  const spec = GENO_CLIPS[id];
  if (spec) {
    if (spec.type === 'bvh') return loadBVH(spec.file);
    if (spec.type === 'json') return loadJSONClip(spec.file);
    const res = await loadGLTFClip(spec.file, spec.clip);
    if (spec.hold) res.hold = true;
    return res;
  }
  if (BVH_FILES[id]) return loadBVH(BVH_FILES[id]);
  return loadBVH(id); // bare path (legacy behaviour)
}
