// site/avatar-styles/dragon2.js — the DRAGON, take two.
//
// dragon.js (left untouched as the failed reference) mapped a wyvern onto the
// humanoid exercise rig and rendered its membranes in near-black navy on a
// near-black void — pixel-confirmed invisible. This file is the rebuild per
// the post-mortem (notes_avatars_investigation.md §3/§4), and every binding
// requirement is encoded here, not just intended:
//
//   • Built on the CREATURE rig (../creature-rig.js): horizontal body axis,
//     neck ≥ torso, tail ≥ body — enforced by the stage table and REPORTED
//     by measure() so a card can print the live numbers.
//   • Wing sails ≥ 1.5× body area in BRIGHT CORAL #ff5c38 on deep green —
//     contrast is pixel-verified externally, and the membrane carries an
//     emissive floor so no lighting rig can ever hide it again.
//   • Membrane geometry is rebuilt every frame from the rig's marker
//     Object3Ds — it cannot detach from the finger bones.
//   • Projecting snout with a hinged jaw, horns, glowing MeshBasic eyes,
//     dorsal scale spikes, tail spade.
//   • Evolution stages (founder's tamagotchi concept): hatchling →
//     fledgling → elder, driven by the `stage` param.
//   • Animations are creature animations — idle / FLAP / walk. A dragon
//     doesn't squat.
//
// Material language: flat MeshLambert, low poly counts (6-radial capsules,
// 7×5 spheres, 4-5 seg cones) — same as the game's, per the investigation.

import * as THREE from 'three';
import { buildCreatureRig, resetCreaturePose, hipYForLegs, clamp, lerp } from '../creature-rig.js';

const RAD = 6; // radial segments — the game's low-poly capsule language

// ── stage table ─────────────────────────────────────────────────────────────
// Every silhouette rule from the post-mortem is a number here:
//   neckLen ≥ bodyLen, tailLen ≥ bodyLen (fledgling/elder; the hatchling is
//   deliberately a round baby — stub everything, per the founder's concept).
export const DRAGON_STAGES = {
  hatchling: {
    id: 'hatchling', label: 'Hatchling',
    blurb: 'Fresh from the egg — round, stub-winged, hornless, all eyes.',
    bodyLen: 0.50, bodyR: 0.165, hipR: 0.150,
    neckLen: 0.40, neckR: 0.075, headR: 0.145, eye: 1.5,
    tailLen: 0.46, tailR: 0.075,
    wingArm1: 0.15, wingArm2: 0.17, fingerLen: 0.19,
    legUp: 0.16, legLo: 0.16,
    horn: 0, spikes: 0, tailSpikes: 0, spade: 0.35, teeth: 0,
    body: '#4a9c2a', membrane: '#ff5c38',
  },
  fledgling: {
    id: 'fledgling', label: 'Fledgling',
    blurb: 'Wings have come in — full sails, nub horns, first spikes.',
    bodyLen: 0.85, bodyR: 0.19, hipR: 0.16,
    neckLen: 0.92, neckR: 0.075, headR: 0.155, eye: 1.15,
    tailLen: 1.10, tailR: 0.085,
    wingArm1: 0.42, wingArm2: 0.50, fingerLen: 0.62,
    legUp: 0.28, legLo: 0.28,
    horn: 0.5, spikes: 5, tailSpikes: 0, spade: 1.0, teeth: 1,
    body: '#2d7a1a', membrane: '#ff5c38',
  },
  elder: {
    id: 'elder', label: 'Elder',
    blurb: 'Huge sails, full horns, tail spikes — reads big even when small.',
    bodyLen: 1.05, bodyR: 0.215, hipR: 0.185,
    neckLen: 1.20, neckR: 0.085, headR: 0.165, eye: 1.0,
    tailLen: 1.50, tailR: 0.095,
    wingArm1: 0.60, wingArm2: 0.72, fingerLen: 0.95,
    legUp: 0.34, legLo: 0.34,
    horn: 1.0, spikes: 9, tailSpikes: 4, spade: 1.45, teeth: 1,
    body: '#1f5c12', membrane: '#ff5c38',
  },
};

export const DRAGON_ANIMS = ['idle', 'flap', 'walk'];
export const DRAGON_PERIODS = { idle: 4.2, flap: 2.6, walk: 1.9 };

// ── geometry helpers ────────────────────────────────────────────────────────
/** Capsule along −Y spanning [−over, len+over] — a limb hanging from a joint. */
function capsuleDown(len, r, over = 0.02) {
  const g = new THREE.CapsuleGeometry(r, len + over, 2, RAD);
  g.translate(0, -(len + over) / 2 + over, 0);
  return g;
}
/** Capsule along +Z spanning [0, len] — a body/neck/tail segment growing forward. */
function capsuleFwd(len, r, over = 0.03) {
  const g = new THREE.CapsuleGeometry(r, len + over, 3, RAD);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (len + over) / 2 - over);
  return g;
}
/** Capsule along ±X spanning [0, len·s] — a wing bone growing outward. */
function capsuleOut(len, r, s, over = 0.02) {
  const g = new THREE.CapsuleGeometry(r, len + over, 2, 5);
  g.rotateZ(s * -Math.PI / 2);
  g.translate(s * ((len + over) / 2 - over), 0, 0);
  return g;
}
/** Tapered snout frustum along +Z spanning [0, len] (narrow end forward). */
function frustumZ(rBack, rFront, len, seg = 5) {
  const g = new THREE.CylinderGeometry(rFront, rBack, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

// ── the dragon ──────────────────────────────────────────────────────────────
/**
 * createDragon({ stage, body, membrane, eye }) →
 *   { root, stage, setAnimation, update, poseAt, measure, dispose, anim }
 *
 * `update(dt)` advances the current animation and rebuilds the membranes.
 * `poseAt(name, phase)` snaps to an exact phase of an animation (screenshots).
 * `measure()` returns the silhouette ratios the post-mortem demands, computed
 * from the LIVE marker positions — a card can print them and they cannot
 * disagree with the render.
 */
export function createDragon(opts = {}) {
  const stage = DRAGON_STAGES[opts.stage] ?? DRAGON_STAGES.fledgling;
  const bodyColor = opts.body ?? stage.body;
  const membraneColor = opts.membrane ?? stage.membrane;
  const eyeColor = opts.eye ?? '#ffc63a';

  // ── materials: flat Lambert, tones derived from one base (game language) ──
  const lam = (c, mult = 1, extra = {}) => new THREE.MeshLambertMaterial({
    color: new THREE.Color(c).multiplyScalar(mult), ...extra,
  });
  const mats = {
    body: lam(bodyColor),
    head: lam(bodyColor, 0.85),
    dark: lam(bodyColor, 0.55),                       // limbs, wing bones, tail tip
    belly: lam('#d9c087'),                            // warm sand underside
    // bone with a small emissive floor: horns live on the back of the head,
    // away from the sun — without it they pixel-verified as shadow-grey
    // (#8f8f82, ~3 px detected) instead of reading as pale horn.
    horn: lam('#e8d9b0', 1, { emissive: new THREE.Color('#e8d9b0').multiplyScalar(0.15) }),
    tooth: lam('#f4efe2'),
    // THE fix for the invisible-wing failure: bright coral, double-sided,
    // with an emissive floor (≈30%) so the sail keeps its colour even in
    // shadow, underside-out, or against a dark background. Pixel-verified:
    // at 0.22 the elder's far sail fogged/shaded down to #7e3d23 and failed
    // the 3:1 contrast bar; 0.30 holds coral from any angle.
    membrane: new THREE.MeshLambertMaterial({
      color: new THREE.Color(membraneColor),
      emissive: new THREE.Color(membraneColor).multiplyScalar(0.40),
      side: THREE.DoubleSide, flatShading: true,
    }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(eyeColor) }), // unlit glow
  };

  // ── dims: hip height derived from the leg pose so feet land on the ground ──
  const dims = {
    bodyLen: stage.bodyLen, bodyR: stage.bodyR, hipR: stage.hipR,
    neckLen: stage.neckLen, neckR: stage.neckR, headR: stage.headR,
    tailLen: stage.tailLen, tailR: stage.tailR,
    wingArm1: stage.wingArm1, wingArm2: stage.wingArm2, fingerLen: stage.fingerLen,
    shoulderX: stage.bodyR * 0.82, shoulderY: stage.bodyR * 0.55,
    legUp: stage.legUp, legLo: stage.legLo,
    hipX: stage.hipR * 0.62, legZ: -stage.bodyLen * 0.06,
    hipY: hipYForLegs(stage.legUp, stage.legLo, 0.055),
  };
  const rig = buildCreatureRig(dims);
  const root = rig.root;

  const geoms = new Set();
  const keep = (g) => { geoms.add(g); return g; };
  const mesh = (g, m, parent) => {
    const mm = new THREE.Mesh(keep(g), m);
    mm.castShadow = true;
    parent.add(mm);
    return mm;
  };

  const segZ = dims.bodyLen / 3;
  const neckSeg = dims.neckLen / 2;
  const tailSeg = dims.tailLen / rig.tail.length;

  // ── body: tapering capsule chain along the spine, horizontal ─────────────
  mesh(new THREE.SphereGeometry(dims.hipR, 7, 5), mats.body, rig.hips); // hip cap
  const bodyMeshes = [];
  const radii = [lerp(dims.hipR, dims.bodyR, 0.35), lerp(dims.hipR, dims.bodyR, 0.7), dims.bodyR];
  rig.spine.forEach((seg, i) => {
    const len = i === 0 ? segZ * 1.15 : segZ * 1.25;
    bodyMeshes.push(mesh(capsuleFwd(len, radii[i]), mats.body, seg));
    // belly plate — flattened sand capsule peeking under each segment
    const belly = mesh(capsuleFwd(len * 0.92, radii[i] * 0.8), mats.belly, seg);
    belly.scale.set(0.94, 0.52, 1);
    belly.position.y = -radii[i] * 0.45;
  });
  const chestMesh = mesh(new THREE.SphereGeometry(dims.bodyR, 7, 5), mats.body, rig.chest);
  chestMesh.position.z = segZ * 0.28;
  bodyMeshes.push(chestMesh);

  // ── dorsal spikes: scale plates along the spine (+ neck, + tail by stage) ─
  const spikeH = dims.bodyR * 0.55;
  const spikeG = keep(new THREE.ConeGeometry(spikeH * 0.34, spikeH, 4));
  function spikeAt(parentNode, y, z, scale = 1) {
    const s = new THREE.Mesh(spikeG, mats.horn);
    s.castShadow = true;
    s.position.set(0, y, z);
    s.rotation.x = -0.45; // swept back
    s.scale.setScalar(scale);
    parentNode.add(s);
    return s;
  }
  if (stage.spikes > 0) {
    rig.spine.forEach((seg, i) => spikeAt(seg, radii[i] * 0.92, segZ * 0.45, 1 + i * 0.15));
    if (stage.spikes >= 5) {
      rig.neck.forEach((n, i) => spikeAt(n, dims.neckR * 0.95, neckSeg * 0.5, 0.7 - i * 0.1));
    }
  }
  if (stage.tailSpikes > 0) {
    for (let i = 1; i <= stage.tailSpikes; i++) {
      const t = rig.tail[i];
      if (t) spikeAt(t, dims.tailR * (1 - i * 0.16) * 0.95, tailSeg * 0.5, 0.8 - i * 0.12);
    }
  }

  // ── neck: tapering capsules ───────────────────────────────────────────────
  rig.neck.forEach((n, i) => {
    const r = dims.neckR * (1 - i * 0.18);
    mesh(capsuleFwd(neckSeg * 1.2, r), mats.body, n);
  });

  // ── head: elongated skull + PROJECTING snout + hinged jaw + horns + eyes ─
  const R = dims.headR;
  const head = rig.head;
  const skull = mesh(new THREE.SphereGeometry(R, 7, 5), mats.head, head);
  skull.scale.set(0.95, 0.82, 1.18); // elongated along the body axis

  const snoutLen = R * 1.35;
  const snout = mesh(frustumZ(R * 0.62, R * 0.34, snoutLen), mats.head, head);
  snout.position.set(0, -R * 0.1, R * 0.55);
  // nostril bumps on the snout tip
  const nostrilG = keep(new THREE.SphereGeometry(R * 0.09, 4, 3));
  for (const s of [1, -1]) {
    const n = new THREE.Mesh(nostrilG, mats.horn);
    n.position.set(s * R * 0.16, R * 0.02, R * 0.55 + snoutLen * 0.92);
    head.add(n);
  }
  // upper fangs (fledgling/elder) — drop cones under the snout sides
  if (stage.teeth > 0) {
    const fangG = keep(new THREE.ConeGeometry(R * 0.055, R * 0.22, 4));
    for (const s of [1, -1]) for (const z of [0.35, 0.7, 0.95]) {
      const f = new THREE.Mesh(fangG, mats.tooth);
      f.rotation.x = Math.PI; // point down
      f.position.set(s * R * 0.3, -R * 0.16, R * 0.55 + snoutLen * z);
      head.add(f);
    }
  }
  // jaw — its own joint (rig.jaw), frustum + upward teeth
  const jawMesh = mesh(frustumZ(R * 0.5, R * 0.26, snoutLen * 0.95), mats.dark, rig.jaw);
  jawMesh.position.set(0, -R * 0.06, R * 0.12);
  if (stage.teeth > 0) {
    const jfG = keep(new THREE.ConeGeometry(R * 0.05, R * 0.18, 4));
    for (const s of [1, -1]) for (const z of [0.4, 0.75]) {
      const f = new THREE.Mesh(jfG, mats.tooth);
      f.position.set(s * R * 0.26, R * 0.02, R * 0.12 + snoutLen * 0.95 * z);
      rig.jaw.add(f);
    }
  }
  // GLOWING eyes — unlit MeshBasic, they read at any size (game's red-eye
  // trick). Placed ON the skull surface (ellipsoid metric ≈ 1): an earlier
  // position at 0.73·R was fully INSIDE the skull — pixel-verified invisible
  // (0 amber px in every card). 0.22·R so they survive card-scale rendering.
  const eyeG = keep(new THREE.SphereGeometry(R * 0.22 * stage.eye, 5, 4));
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eyeG, mats.eye);
    e.position.set(s * R * 0.66, R * 0.23, R * 0.79);
    head.add(e);
  }
  // horns — a CROWN: up-and-OUT, big. Measured via tip-marker projection:
  // at 1.45·R the tip cleared the head crown by ~3px (the back-component of
  // the sweep eats the length from a 52° camera). Fledgling 2·R, elder 3·R.
  const hornTips = {};
  if (stage.horn > 0) {
    const hornLen = R * (1.0 + stage.horn * 2.0);
    const hornG = keep(new THREE.ConeGeometry(R * 0.22, hornLen, 5));
    for (const s of [1, -1]) {
      const h = new THREE.Mesh(hornG, mats.horn);
      h.castShadow = true;
      h.position.set(s * R * 0.42, R * 0.66, -R * 0.02);
      h.rotation.set(-0.15, 0, -s * 0.7); // up and strongly out
      const tip = new THREE.Object3D();    // exact tip marker for verification
      tip.position.y = hornLen / 2;
      h.add(tip);
      hornTips[s === 1 ? 'L' : 'R'] = tip;
      head.add(h);
    }
  }

  // ── legs: chunky digitigrade stilts ──────────────────────────────────────
  for (const side of ['L', 'R']) {
    const l = rig.legs[side];
    mesh(capsuleDown(dims.legUp, dims.bodyR * 0.30), mats.dark, l.hip);
    mesh(capsuleDown(dims.legLo, dims.bodyR * 0.24), mats.dark, l.knee);
    const foot = mesh(new THREE.BoxGeometry(dims.bodyR * 0.4, 0.055, dims.bodyR * 0.62), mats.dark, l.foot);
    foot.position.set(0, -0.028, dims.bodyR * 0.18);
    const toeG = keep(new THREE.ConeGeometry(dims.bodyR * 0.09, dims.bodyR * 0.24, 4));
    for (const x of [-0.13, 0, 0.13]) {
      const toe = new THREE.Mesh(toeG, mats.horn);
      toe.rotation.x = Math.PI / 2; // point forward (+Z)
      toe.position.set(x * dims.bodyR * 2.2, -0.028, dims.bodyR * 0.5);
      l.foot.add(toe);
    }
  }

  // ── tail: tapering segment chain + spade tip ─────────────────────────────
  rig.tail.forEach((t, i) => {
    const r = dims.tailR * (1 - (i / rig.tail.length) * 0.78);
    mesh(capsuleFwd(-tailSeg * 1.15, r), mats.body, t); // negative len: grows −Z
  });
  const spade = mesh(
    new THREE.OctahedronGeometry(dims.tailR * 1.15 * stage.spade, 0),
    mats.dark, rig.tail[rig.tail.length - 1]
  );
  spade.scale.set(0.22, 1.15, 1.5);
  spade.position.z = -tailSeg * 1.1;
  spade.rotation.x = -0.35;

  // ── wings: thin bones + claw + the membrane sail ─────────────────────────
  const membranes = [];
  for (const side of ['L', 'R']) {
    const w = rig.wings[side], s = w.s;
    mesh(capsuleOut(dims.wingArm1, dims.bodyR * 0.13, s), mats.dark, w.shoulder);
    mesh(capsuleOut(dims.wingArm2, dims.bodyR * 0.10, s), mats.dark, w.elbow);
    w.fingers.forEach((f) => mesh(capsuleOut(dims.fingerLen, dims.bodyR * 0.05, s), mats.dark, f.base));
    // wrist claw
    const claw = new THREE.Mesh(keep(new THREE.ConeGeometry(dims.bodyR * 0.05, dims.bodyR * 0.22, 4)), mats.horn);
    claw.rotation.x = Math.PI / 2;
    claw.position.set(0, dims.bodyR * 0.08, dims.bodyR * 0.1);
    w.wrist.add(claw);

    // Membrane: 9 anchors — S(shoulder) E(elbow) W(wrist) T1 D1 T2 D2 T3 B —
    // triangulated as a fan from S. D1/D2 are trailing-edge scallop dips,
    // recomputed every frame between the finger tips. The geometry positions
    // are OVERWRITTEN from the marker world positions each update, so the
    // sail follows the fingers through any pose (flap, fold, walk bounce).
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7, 0, 7, 8]);
    geoms.add(g);
    const m = new THREE.Mesh(g, mats.membrane);
    m.castShadow = true;
    m.frustumCulled = false; // verts move; the static bounding box would cull it
    root.add(m);
    membranes.push({ wing: w, mesh: m });
  }

  const _v = new THREE.Vector3();
  function updateMembranes() {
    root.updateMatrixWorld(true);
    for (const { wing, mesh: mm } of membranes) {
      const pos = mm.geometry.attributes.position;
      const M = wing.marks;
      const put = (i, marker) => {
        marker.getWorldPosition(_v);
        root.worldToLocal(_v);
        pos.setXYZ(i, _v.x, _v.y, _v.z);
      };
      put(0, M.S); put(1, M.E); put(2, M.W);
      put(3, M.T[0]); put(5, M.T[1]); put(7, M.T[2]);
      put(8, M.B);
      // scallop dips: midpoint between consecutive tips, pulled toward the wrist
      const dip = (i, a, b) => {
        M.T[a].getWorldPosition(_v);
        root.worldToLocal(_v);
        const ax = _v.x, ay = _v.y, az = _v.z;
        M.T[b].getWorldPosition(_v);
        root.worldToLocal(_v);
        const wx = pos.getX(2), wy = pos.getY(2), wz = pos.getZ(2);
        pos.setXYZ(i,
          lerp((ax + _v.x) / 2, wx, 0.14),
          lerp((ay + _v.y) / 2, wy, 0.14),
          lerp((az + _v.z) / 2, wz, 0.14));
      };
      dip(4, 0, 1); dip(6, 1, 2);
      pos.needsUpdate = true;
      mm.geometry.computeVertexNormals();
    }
  }

  // ── animations — procedural, time-based, absolute (no drift) ─────────────
  let anim = 'idle';
  let t = 0;

  function poseIdle(tt) {
    const br = Math.sin(tt * 1.7); // breath
    rig.hips.position.y = dims.hipY + br * 0.012;
    chestMesh.scale.setScalar(1 + br * 0.03);
    rig.tail.forEach((seg, i) => {
      seg.rotation.set(0.05 + i * 0.012 + Math.sin(tt * 0.9 - i * 0.3) * 0.02,
        Math.sin(tt * 1.3 - i * 0.55) * 0.055, 0);
    });
    rig.neck[0].rotation.set(-0.62 + br * 0.02, Math.sin(tt * 0.5) * 0.1, 0);
    rig.neck[1].rotation.set(-0.26, Math.sin(tt * 0.5 + 0.7) * 0.12, 0);
    rig.head.rotation.set(0.52 + Math.sin(tt * 1.7) * 0.03, Math.sin(tt * 0.5 + 1.4) * 0.08, 0);
    rig.jaw.rotation.x = 0.06 + Math.sin(tt * 0.31) * 0.03;
    for (const side of ['L', 'R']) {
      const w = rig.wings[side], s = w.s;
      w.shoulder.rotation.set(0.08, 0, s * (0.1 + Math.sin(tt * 0.9) * 0.05));
      w.elbow.rotation.set(0, s * (0.22 + Math.sin(tt * 0.9 + 0.6) * 0.06), 0);
      w.fingers.forEach((f, i) => f.base.rotation.set(0, s * (0.16 + i * 0.42 + Math.sin(tt * 0.9 + 1.2) * 0.03), 0));
    }
  }

  // FLAP — the hero loop: big slow beats, body bobbing against the stroke,
  // legs tucking on the downstroke, jaw gaping at the bottom.
  function poseFlap(tt) {
    const ph = (tt / DRAGON_PERIODS.flap) * Math.PI * 2;
    const beat = Math.sin(ph); // +1 wings up, −1 wings down
    const down = Math.max(0, -beat);
    rig.hips.position.y = dims.hipY + Math.sin(ph - 0.9) * 0.05;
    rig.hips.rotation.x = Math.sin(ph - 1.2) * 0.045;
    chestMesh.scale.setScalar(1);
    rig.tail.forEach((seg, i) => {
      seg.rotation.set(0.05 + i * 0.012 + Math.sin(ph - 0.8 - i * 0.35) * 0.05,
        Math.sin(ph * 0.5 - i * 0.5) * 0.03, 0);
    });
    rig.neck[0].rotation.set(-0.62 - beat * 0.05, 0, 0);
    rig.neck[1].rotation.set(-0.26 - beat * 0.03, 0, 0);
    rig.head.rotation.set(0.52 + beat * 0.05, 0, 0);
    rig.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(ph - 2.2)) * 0.3;
    for (const side of ['L', 'R']) {
      const w = rig.wings[side], s = w.s;
      w.shoulder.rotation.set(-0.12 + Math.cos(ph) * 0.18, 0, s * (0.18 + beat * 0.85));
      w.elbow.rotation.set(0, s * (0.16 + down * 0.2), 0);
      w.fingers.forEach((f, i) => f.base.rotation.set(0, s * (0.16 + i * 0.42 + beat * 0.06), 0));
    }
    for (const side of ['L', 'R']) {
      const l = rig.legs[side];
      l.hip.rotation.set(-0.62 - down * 0.18, 0, 0);
      l.knee.rotation.set(1.05 + down * 0.28, 0, 0);
      l.ankle.rotation.set(-0.55 - down * 0.1, 0, 0);
    }
  }

  // WALK — leg cycle + body bob, wings FOLDED back along the body.
  function poseWalk(tt) {
    const w = tt * (Math.PI * 2 / DRAGON_PERIODS.walk);
    const step = { L: Math.sin(w), R: Math.sin(w + Math.PI) };
    rig.hips.position.y = dims.hipY + Math.abs(Math.cos(w)) * 0.035 - 0.017;
    rig.hips.rotation.set(0, Math.sin(w) * 0.03, Math.sin(w) * 0.035);
    chestMesh.scale.setScalar(1);
    rig.tail.forEach((seg, i) => {
      seg.rotation.set(0.05 + i * 0.012, Math.sin(w * 0.5 - i * 0.6) * 0.09, 0);
    });
    rig.neck[0].rotation.set(-0.62, Math.sin(w * 0.5) * 0.05, 0);
    rig.neck[1].rotation.set(-0.26, Math.sin(w * 0.5 + 0.6) * 0.06, 0);
    rig.head.rotation.set(0.52 + Math.sin(w * 2) * 0.03, 0, 0);
    rig.jaw.rotation.x = 0.06;
    for (const side of ['L', 'R']) {
      const l = rig.legs[side], s = step[side];
      l.hip.rotation.set(-0.62 + s * 0.42, 0, 0);
      l.knee.rotation.set(1.05 + Math.max(0, -s) * 0.55, 0, 0);
      l.ankle.rotation.set(-0.55 - Math.max(0, s) * 0.25 + Math.max(0, -s) * 0.35, 0, 0);
      l.foot.rotation.set(0.12 + Math.max(0, -s) * 0.3, 0, 0);
    }
    for (const side of ['L', 'R']) {
      const wng = rig.wings[side], sgn = wng.s;
      const bounce = Math.sin(w) * 0.04;
      wng.shoulder.rotation.set(0.15, 0, sgn * (0.62 + bounce));
      wng.elbow.rotation.set(0, sgn * 1.35, 0);
      wng.fingers.forEach((f, i) => f.base.rotation.set(0, sgn * (0.55 + i * 0.5), 0));
    }
  }

  const POSES = { idle: poseIdle, flap: poseFlap, walk: poseWalk };

  function apply() {
    (POSES[anim] ?? poseIdle)(t);
    updateMembranes();
  }

  // ── silhouette measurement — from the LIVE rig, not hand-written ─────────
  function measure() {
    resetCreaturePose(rig);
    root.updateMatrixWorld(true);
    // wing polygon area (shoelace on the XZ plane) using the real markers
    let wingArea = 0;
    for (const { wing } of membranes) {
      const pts = [wing.marks.S, wing.marks.E, wing.marks.W, wing.marks.T[0], wing.marks.T[1], wing.marks.T[2], wing.marks.B]
        .map((mk) => mk.getWorldPosition(new THREE.Vector3()));
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.z - q.x * p.z;
      }
      wingArea += Math.abs(a) / 2;
    }
    // body silhouette (top view): capsules for body+neck+head+tail
    const bodyArea =
      dims.bodyLen * ((dims.hipR + dims.bodyR) / 2) * 2 * 0.92 +
      dims.neckLen * dims.neckR * 2 * 0.8 +
      Math.PI * dims.headR * dims.headR * 1.4 +
      dims.tailLen * dims.tailR * 2 * 0.5;
    const out = {
      wingRatio: wingArea / bodyArea,
      neckTorso: dims.neckLen / dims.bodyLen,
      tailBody: dims.tailLen / dims.bodyLen,
      wingArea, bodyArea,
    };
    apply(); // restore the live animation pose
    return out;
  }

  apply();

  return {
    root, stage, rig, hornTips,
    get anim() { return anim; },
    setAnimation(name) { if (POSES[name]) anim = name; },
    update(dt) { t += dt; apply(); },
    poseAt(name, phase) {
      if (POSES[name]) anim = name;
      t = (phase ?? 0.5) * (DRAGON_PERIODS[anim] ?? 1);
      apply();
    },
    measure,
    dispose() {
      root.removeFromParent();
      for (const g of geoms) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}

export default { createDragon, DRAGON_STAGES, DRAGON_ANIMS };
