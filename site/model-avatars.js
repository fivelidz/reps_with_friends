// site/model-avatars.js — REAL rigged character models as avatar candidates.
//
// Three sources, one interface:
//   • Soldier.glb  (three.js r177 example) — realistic human, mixamo rig,
//     ships Idle/Run/Walk animations. The "more realistic" option.
//   • Xbot.glb     (three.js r177 example) — stylised robot humanoid, mixamo
//     rig, ships idle/run/pose animations. The "stylised mascot" option.
//   • orc.glb      (goblin-village game)   — the founder's own game art:
//     flat palette texture, Rigify rig, no animations. The "gamified" option.
//
// Posing: every bone's REST quaternion is captured at load; a pose is a set of
// local-space delta rotations applied on top of rest. Deltas are authored per
// rig family (mixamo vs rigify) and tuned against renders — mixamo bone axes
// are not documented, they are empirical.
//
// Exercises are phase-driven (p ∈ [0,1), the rep bottoms out at p≈0.5) to match
// the procedural gallery, so the same selector drives both sections.

import * as THREE from 'three';
import { GLTFLoader } from './lib/GLTFLoader.js';

export const MODELS = [
  { id: 'soldier', name: 'Soldier — realistic', file: '/models/Soldier.glb', rig: 'mixamo', native: ['Idle', 'Walk', 'Run'] },
  { id: 'xbot', name: 'Xbot — stylised robot', file: '/models/Xbot.glb', rig: 'mixamo', native: ['idle', 'run', 'sneak_pose'] },
  { id: 'robot', name: 'Robot Expressive — character', file: '/models/RobotExpressive.glb', rig: 'none', native: ['Idle', 'Walking', 'Running', 'Dance', 'Jump', 'Wave', 'Punch'] },
  { id: 'orc', name: 'Orc — goblin game art', file: '/models/orc.glb', rig: 'rigify', native: [] },
];

const loader = new GLTFLoader();
const cache = new Map();

export async function loadModel(file) {
  if (cache.has(file)) return cache.get(file).clone(true);
  const gltf = await loader.loadAsync(file);
  cache.set(file, gltf.scene);
  return gltf.scene.clone(true);
}

// ── bone lookup ──────────────────────────────────────────────────────────────
function boneMap(root, rig) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:/, '')] = o;
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
      hips: bones['spine'], spine: bones['spine.001'], spine1: bones['spine.002'], spine2: bones['spine.003'],
      neck: bones['spine.004'], head: bones['spine.005'],
      shoulderL: bones['shoulder.L'], armL: bones['upper_arm.L'], foreL: bones['forearm.L'], handL: bones['hand.L'],
      shoulderR: bones['shoulder.R'], armR: bones['upper_arm.R'], foreR: bones['forearm.R'], handR: bones['hand.R'],
      upLegL: bones['thigh.L'], legL: bones['shin.L'], footL: bones['foot.L'], toeL: bones['toe.L'],
      upLegR: bones['thigh.R'], legR: bones['shin.R'], footR: bones['foot.R'], toeR: bones['toe.R'],
    });
  }
  return m;
}

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

// ── poses (tuned empirically — see git history for the iterations) ──────────
// p: rep phase. 0=standing/top, 0.5=bottom of the rep. tri = triangle wave.
const tri = (p) => 1 - Math.abs(2 * p - 1);          // 0→1→0
const down = (p) => (p < 0.5 ? p * 2 : (1 - p) * 2); // 0→1→0, kinked at bottom

function poseMixamo(B, rest, exercise, p) {
  const d = down(p), t = tri(p);
  // reset all to rest first (cheap; bones are few)
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
  } else if (exercise === 'pushup') {
    // prone handled by the CONTAINER rotation (see ModelAvatar); here the arms
    // press: elbows bend at the bottom (d high), straighten at the top.
    setQ(B.armL, rest, 0, 0, 1.35); setQ(B.armR, rest, 0, 0, -1.35); // arms to sides→down in prone frame
    setQ(B.foreL, rest, -1.15 * d, 0, 0); setQ(B.foreR, rest, -1.15 * d, 0, 0);
    setQ(B.spine, rest, 0.06 * d); setQ(B.upLegL, rest, 0.05); setQ(B.upLegR, rest, 0.05);
    setQ(B.head, rest, -0.35); // look forward, not at the floor
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
}

function poseRigify(B, rest, exercise, p) {
  const d = down(p), t = tri(p);
  for (const b of Object.values(B)) if (b && rest.has(b)) b.quaternion.copy(rest.get(b));

  if (exercise === 'squat') {
    if (B.hips) B.hips.position.y = B.hips.userData.restY - B.hips.userData.H * 0.15 * d;
    setQ(B.upLegL, rest, 1.2 * d, 0, -0.1 * d); setQ(B.upLegR, rest, 1.2 * d, 0, 0.1 * d);
    setQ(B.legL, rest, -1.85 * d, 0, 0); setQ(B.legR, rest, -1.85 * d, 0, 0);
    setQ(B.footL, rest, 0.6 * d, 0, 0); setQ(B.footR, rest, 0.6 * d, 0, 0);
    setQ(B.spine, rest, -0.2 * d, 0, 0); setQ(B.spine1, rest, -0.12 * d, 0, 0);
    setQ(B.armL, rest, 0, 0, -0.5 - 0.3 * d); setQ(B.armR, rest, 0, 0, 0.5 + 0.3 * d);
    setQ(B.foreL, rest, -0.4, 0, 0); setQ(B.foreR, rest, -0.4, 0, 0);
  } else if (exercise === 'pushup') {
    setQ(B.armL, rest, 0, 0, -1.4); setQ(B.armR, rest, 0, 0, 1.4);
    setQ(B.foreL, rest, 1.1 * d, 0, 0); setQ(B.foreR, rest, 1.1 * d, 0, 0);
    setQ(B.head, rest, 0.4);
  } else if (exercise === 'jumpingjack') {
    const s = t;
    setQ(B.armL, rest, 0, 0, -0.4 - 2.0 * s); setQ(B.armR, rest, 0, 0, 0.4 + 2.0 * s);
    setQ(B.upLegL, rest, 0, 0, -0.05 - 0.35 * s); setQ(B.upLegR, rest, 0, 0, 0.05 + 0.35 * s);
  } else if (exercise === 'curl') {
    setQ(B.armL, rest, 0, 0, -0.8); setQ(B.armR, rest, 0, 0, 0.8);
    setQ(B.foreL, rest, 1.8 * d, 0, 0); setQ(B.foreR, rest, 1.8 * d, 0, 0);
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
    // body height + hips rest offset, for proportional squat drop
    const box = new THREE.Box3().setFromObject(scene);
    this.H = box.max.y - box.min.y;
    const hips = this.bones.hips;
    if (hips) { hips.userData.restY = hips.position.y; hips.userData.H = this.H; }
    // centre on origin, feet on y=0
    scene.position.sub(new THREE.Vector3((box.max.x + box.min.x) / 2, box.min.y, (box.max.z + box.min.z) / 2));
  }
  pose(exercise, p) {
    const fn = this.rig === 'mixamo' ? poseMixamo : poseRigify;
    fn(this.bones, this.rest, exercise, p);
    // push-up: tilt prone (face down) about the feet; lift so nothing clips
    const wantProne = exercise === 'pushup';
    this.prone.rotation.x = wantProne ? -Math.PI / 2 : 0;
    this.prone.position.y = wantProne ? this.H * 0.17 : 0;
  }
}
