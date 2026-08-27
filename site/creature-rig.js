// site/creature-rig.js — a dedicated CREATURE skeleton for non-humanoid avatars.
//
// Born from the dragon post-mortem (notes_avatars_investigation.md §3/§4): the
// failed dragon was a humanoid-in-a-suit because it was built on the humanoid
// exercise rig. Creatures get their own rig. Non-negotiables baked into the
// REST POSE itself:
//
//   • HORIZONTAL body axis — the spine chain runs forward (+Z), the tail chain
//     runs back (−Z). The identity pose is a standing quadruped-ish wyvern,
//     never an upright biped.
//   • LONG silhouette — neck chain and tail chain are first-class structures
//     with their own segment counts, sized by the caller (dragon2.js enforces
//     neck ≥ torso, tail ≥ body).
//   • WING FINGERS — each wing is shoulder → elbow → wrist → 3 finger bones
//     fanning a membrane, so the sail is the biggest shape on the creature.
//
// Conventions (memorise before touching the animation code):
//   • The creature faces +Z. Up is +Y. Left is +X.
//   • LEFT wing bones extend along local +X; RIGHT wing bones along local −X.
//     Mirror rule: rotation.z and rotation.y are mirrored across sides
//     (multiply by the wing's `s` sign), rotation.x (twist) is NOT.
//   • All joints are plain THREE.Groups — zero meshes live here. The style
//     layer (avatar-styles/dragon2.js) hangs geometry on the joints and uses
//     the marker Object3Ds to skin the wing membranes per frame.
//
// This module knows nothing about dragons specifically — it is reusable for
// any horizontal-axis creature (wolf, drake, mule-deer, whatever the game needs).

import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Build the creature skeleton.
 *
 * @param {object} dims  World-unit dimensions:
 *   hipY       height of the hip pivot above the ground plane
 *   bodyLen    hips → chest distance along +Z (split across 3 spine segments)
 *   bodyR      body radius at the chest
 *   hipR       body radius at the hips
 *   neckLen    chest → head along the neck chain (2 segments, rests +Z)
 *   neckR      neck radius
 *   headR      skull radius reference (head meshes are the style's business)
 *   tailLen    hips → tail tip along −Z (6 segments)
 *   tailR      tail radius at the base
 *   wingArm1   shoulder → elbow (per side)
 *   wingArm2   elbow → wrist
 *   fingerLen  wrist → finger tip (each of the 3 fingers)
 *   shoulderX  wing root lateral offset from the chest centre
 *   shoulderY  wing root height above the chest joint
 *   legUp      thigh length (hip → knee, rests −Y)
 *   legLo      shin length (knee → ankle)
 *   hipX       leg lateral offset
 *   legZ       leg forward offset from the hips (negative = behind the pivot)
 */
export function buildCreatureRig(dims) {
  const d = {
    neckSegs: 2,
    tailSegs: 6,
    ...dims,
  };

  const root = new THREE.Group();
  root.name = 'creature';

  // ── hips: the root joint of the whole body ──────────────────────────────
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, d.hipY, 0);
  root.add(hips);

  // ── spine chain: hips → chest, running FORWARD (+Z), body horizontal ────
  const spine = [];
  const segZ = d.bodyLen / 3;
  let parent = hips;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.name = 'spine' + (i + 1);
    // spine1 sits half a segment ahead of the hip pivot (the hip capsule
    // covers the space behind it); the rest chain full segments.
    g.position.set(0, 0, i === 0 ? segZ * 0.5 : segZ);
    parent.add(g);
    spine.push(g);
    parent = g;
  }
  const chest = spine[2]; // the shoulder girdle lives here

  // ── neck chain: chest → head, resting +Z (the POSE raises it) ───────────
  const neck = [];
  parent = chest;
  const neckSeg = d.neckLen / d.neckSegs;
  for (let i = 0; i < d.neckSegs; i++) {
    const g = new THREE.Group();
    g.name = 'neck' + (i + 1);
    // neck1 sprouts from the front-top of the chest; the rest chain onward.
    g.position.set(0, i === 0 ? d.bodyR * 0.22 : 0, i === 0 ? segZ * 0.42 : neckSeg);
    parent.add(g);
    neck.push(g);
    parent = g;
  }
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0, neckSeg);
  neck[d.neckSegs - 1].add(head);

  // jaw — hinged at the BACK of the skull so rotation.x opens it downward
  // (Rx(+) pitches the +Z jaw tip down = open).
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -d.headR * 0.32, d.headR * 0.05);
  head.add(jaw);

  // ── wings: shoulder → elbow → wrist → 3 fingers, per side ───────────────
  function wing(side) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = new THREE.Group();
    shoulder.name = 'shoulder' + side;
    shoulder.position.set(s * d.shoulderX, d.shoulderY, 0);
    chest.add(shoulder);

    const elbow = new THREE.Group();
    elbow.name = 'elbow' + side;
    elbow.position.set(s * d.wingArm1, 0, 0);
    shoulder.add(elbow);

    const wrist = new THREE.Group();
    wrist.name = 'wrist' + side;
    wrist.position.set(s * d.wingArm2, 0, 0);
    elbow.add(wrist);

    // 3 finger bones fanning off the wrist. They rest along ±X (outward);
    // the POSE sweeps them back (−Z) with rotation.y to fan the membrane.
    const fingers = [];
    for (let f = 0; f < 3; f++) {
      const base = new THREE.Group();
      base.name = 'finger' + (f + 1) + side;
      wrist.add(base);
      const tip = new THREE.Object3D();
      tip.name = 'fingerTip' + (f + 1) + side;
      tip.position.set(s * d.fingerLen, 0, 0);
      base.add(tip);
      fingers.push({ base, tip });
    }

    // Membrane anchor markers. The style reads these WORLD positions every
    // frame and rebuilds the sail geometry from them — the membrane can never
    // detach from the bones no matter how the joints animate.
    const mark = (parentNode, x, y, z, name) => {
      const m = new THREE.Object3D();
      m.name = name;
      m.position.set(x, y, z);
      parentNode.add(m);
      return m;
    };
    const marks = {
      S: mark(shoulder, 0, 0, 0, 'memS' + side),                       // wing root
      E: mark(elbow, 0, 0, 0, 'memE' + side),                          // elbow
      W: mark(wrist, 0, 0, 0, 'memW' + side),                          // wrist
      T: fingers.map((f) => f.tip),                                    // finger tips
      B: mark(hips, s * d.hipR * 0.8, -d.hipR * 0.05, -d.bodyLen * 0.05, 'memB' + side), // body anchor at the flank
    };
    return { s, shoulder, elbow, wrist, fingers, marks };
  }
  const wingL = wing('L');
  const wingR = wing('R');

  // ── tail chain: hips → tip, running BACK (−Z) ───────────────────────────
  const tail = [];
  parent = hips;
  const tailSeg = d.tailLen / d.tailSegs;
  for (let i = 0; i < d.tailSegs; i++) {
    const g = new THREE.Group();
    g.name = 'tail' + (i + 1);
    g.position.set(0, 0, i === 0 ? -segZ * 0.5 : -tailSeg);
    parent.add(g);
    tail.push(g);
    parent = g;
  }
  const tailTip = new THREE.Object3D();
  tailTip.name = 'tailTip';
  tailTip.position.set(0, 0, -tailSeg);
  tail[d.tailSegs - 1].add(tailTip);

  // ── hind legs: hip → knee → ankle → foot, resting −Y (down) ─────────────
  function leg(side) {
    const s = side === 'L' ? 1 : -1;
    const hip = new THREE.Group();
    hip.name = 'legHip' + side;
    hip.position.set(s * d.hipX, -d.hipR * 0.3, d.legZ);
    hips.add(hip);

    const knee = new THREE.Group();
    knee.name = 'knee' + side;
    knee.position.set(0, -d.legUp, 0);
    hip.add(knee);

    const ankle = new THREE.Group();
    ankle.name = 'ankle' + side;
    ankle.position.set(0, -d.legLo, 0);
    knee.add(ankle);

    const foot = new THREE.Group();
    foot.name = 'foot' + side;
    ankle.add(foot);

    // ground-contact marker under the toes — the style sizes the foot mesh
    // to land here, and animations can raycast/plant against it.
    const sole = new THREE.Object3D();
    sole.name = 'sole' + side;
    sole.position.set(0, -0.02, 0.07);
    foot.add(sole);
    return { s, hip, knee, ankle, foot, sole };
  }
  const legL = leg('L');
  const legR = leg('R');

  const rig = {
    dims: d,
    root, hips, spine, chest, neck, head, jaw,
    wings: { L: wingL, R: wingR },
    tail, tailTip,
    legs: { L: legL, R: legR },
  };
  resetCreaturePose(rig);
  return rig;
}

/**
 * The neutral stance — a standing quadruped-ish wyvern. Every animation
 * re-derives its pose from these absolutes (never additively) so drift is
 * structurally impossible.
 *
 * Body horizontal, legs folded digitigrade underneath, neck raised in an S,
 * head level with the ground, tail extended back and slightly up, wings
 * outstretched (the identity/evaluation spread).
 */
export function resetCreaturePose(rig) {
  const { hips, spine, neck, head, jaw, tail, wings, legs } = rig;

  hips.position.y = rig.dims.hipY;
  hips.rotation.set(0, 0, 0);

  // gentle dorsal arch: chest a touch higher than the hips
  spine[0].rotation.set(-0.05, 0, 0);
  spine[1].rotation.set(-0.03, 0, 0);
  spine[2].rotation.set(0, 0, 0);

  // neck raised (negative Rx pitches the +Z chain upward), head re-levelled
  neck[0].rotation.set(-0.62, 0, 0);
  for (let i = 1; i < neck.length; i++) neck[i].rotation.set(-0.26, 0, 0);
  head.rotation.set(0.52, 0, 0);
  jaw.rotation.set(0.06, 0, 0);

  // tail extended back, slightly up, straight
  tail.forEach((t, i) => t.rotation.set(0.05 + i * 0.012, 0, 0));

  // wings outstretched: slightly raised, swept back a touch, fingers fanned
  for (const side of ['L', 'R']) {
    const w = wings[side], s = w.s;
    w.shoulder.rotation.set(0.08, 0, s * 0.1);
    w.elbow.rotation.set(0, s * 0.22, 0);
    w.fingers.forEach((f, i) => f.base.rotation.set(0, s * (0.16 + i * 0.42), 0));
  }

  // digitigrade legs under the body: thigh forward, shin back, foot level
  for (const side of ['L', 'R']) {
    const l = legs[side];
    l.hip.rotation.set(-0.62, 0, 0);
    l.knee.rotation.set(1.05, 0, 0);
    l.ankle.rotation.set(-0.55, 0, 0);
    l.foot.rotation.set(0.12, 0, 0);
  }
}

/**
 * Hip height that puts the soles exactly on the ground for the neutral leg
 * angles above (thigh −0.62 rad, shin +0.43 rad world, small foot drop).
 * Callers compute dims.hipY from this so feet never float or sink.
 */
export function hipYForLegs(legUp, legLo, footDrop = 0.05) {
  return legUp * Math.cos(0.62) + legLo * Math.cos(1.05 - 0.62) + footDrop;
}
