// site/models/photo_avatars/pantera.js — PHOTO AVATAR prototype #1
//
// Provenance (img2threejs-style, LIGHTWEIGHT manual pass — NOT the full gated
// pipeline): reference = img2threejs-showcase `girl-character` front plate
// (public/references/girl-character/front.jpg), a stylized dual-sword warrior.
// Proportions & garment stack follow the showcase's own written intake
// (src/demos/girl-character-3/analysis.md: ~8 heads tall, high ponytail,
// corset-narrowed waist, split leather skirt, opera gloves, low-heel boots,
// two back-mounted crossed swords). Colours are PALETTE-SAMPLED from the
// reference pixels (region crops, median-cut, 2026-09-02):
//   skin #b08b78 · hair #0f0f0f · corset #5f3a30 · skirt #301613/#472520 ·
//   boots/gloves #1a120f · steel #cfd2d6
// Method: reconstruction-by-code (Apache-2.0 img2threejs skill contract);
// no meshes, no textures, no scan data. Output (this file) is ours.

import * as THREE from 'three';

const C = {
  skin: 0xc79b82, hair: 0x1a1614, corset: 0x7a4a3c, corsetDark: 0x45291f,
  skirt: 0x4a2820, yoke: 0x5c342a, boot: 0x2a1e16, steel: 0xcfd2d6,
  steelDark: 0x8b9096, eye: 0x1c1512,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

/** Dual-sword warrior — dark palette edition. ~8 heads, A-pose-ish stand. */
export function createPanteraModel() {
  const root = new THREE.Group();
  root.name = 'Panterra_Root';

  // ── pivots (animation joints; img2threejs runtime-hierarchy contract) ──
  const hips = new THREE.Group(); hips.name = 'Hips'; hips.position.y = 0.78; root.add(hips);
  const spine = new THREE.Group(); spine.name = 'Spine'; spine.position.y = 0.16; hips.add(spine);
  const chest = new THREE.Group(); chest.name = 'Chest'; spine.position.y += 0.0; chest.position.y = 0.22; spine.add(chest);
  const neck = new THREE.Group(); neck.name = 'Neck'; neck.position.y = 0.16; chest.add(neck);
  const head = new THREE.Group(); head.name = 'Head'; head.position.y = 0.07; neck.add(head);

  // legs (slight A-stance)
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = s < 0 ? 'Leg_L' : 'Leg_R';
    leg.position.set(0.09 * s, -0.02, 0); hips.add(leg);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.36, 8), mat(C.skin));
    thigh.position.y = -0.18; leg.add(thigh);
    const knee = new THREE.Group(); knee.name = s < 0 ? 'Knee_L' : 'Knee_R'; knee.position.y = -0.36; leg.add(knee);
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.32, 8), mat(C.boot)); // calf-wrapped
    calf.position.y = -0.16; knee.add(calf);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.16), mat(C.boot)); // low-heel boot
    boot.position.set(0, -0.335, 0.035); knee.add(boot);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.05), mat(C.boot));
    heel.position.set(0, -0.368, -0.045); knee.add(heel);
  }

  // torso — corset narrows the waist hard (analysis §2 macro)
  const torsoLower = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.18, 10), mat(C.corsetDark)); // racerback inner
  torsoLower.position.y = 0.09; spine.add(torsoLower);
  const corset = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.3, 10), mat(C.corset)); // white→dark-leather corset, palette edition
  corset.position.y = 0.3; corset.scale.set(1, 1, 0.82); chest.add(corset);
  const chestPlate = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(C.corsetDark));
  chestPlate.position.y = 0.455; chestPlate.scale.set(1, 0.72, 0.8); chest.add(chestPlate);

  // skirt — split leather, open front apron (cone with front wedge cut = phiLength)
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.42, 12, 1, true, Math.PI * 0.62, Math.PI * 1.76), mat(C.skirt, { side: THREE.DoubleSide }));
  skirt.position.y = -0.04; skirt.rotation.x = Math.PI; // open downward
  hips.add(skirt);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.07, 10), mat(C.yoke)); // leather hip wrap
  yoke.position.y = 0.015; yoke.scale.z = 0.85; hips.add(yoke);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.012, 6, 14), mat(C.steelDark)); // one buckled strap (of the 2–3 belt system)
  belt.rotation.x = Math.PI / 2; belt.position.y = -0.03; belt.scale.z = 0.85; hips.add(belt);

  // head + high ponytail (silhouette element — analysis §2 macro #1)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.093, 12, 10), mat(C.skin));
  skull.scale.set(0.92, 1.05, 0.95); head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.099, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(C.hair));
  hairCap.scale.set(0.95, 1.1, 1); hairCap.position.y = 0.008; head.add(hairCap);
  for (const s of [-1, 1]) { // eyes
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6), mat(C.eye, { roughness: 0.3 }));
    eye.position.set(0.034 * s, 0.0, 0.084); eye.scale.set(1, 1.25, 0.6); head.add(eye);
  }
  const ponytail = new THREE.Group(); ponytail.name = 'Ponytail'; ponytail.position.set(0, 0.05, -0.075); head.add(ponytail);
  let segParent = ponytail, segs = [];
  for (let i = 0; i < 3; i++) { // 3 tapered segments, slight curve rearward
    const seg = new THREE.Group(); seg.rotation.x = -0.45;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.036 - i * 0.009, 0.17, 7), mat(C.hair));
    m.position.y = -0.085; m.rotation.x = Math.PI; seg.add(m);
    segParent.add(seg); segParent = seg; segs.push(seg);
    seg.position.y = i === 0 ? 0 : -0.155;
  }

  // arms — opera-length gloves (dark), skin only at the shoulder
  const arms = {};
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group(); shoulder.name = `Shoulder_${side}`;
    shoulder.position.set(0.135 * s, 0.42, 0); shoulder.rotation.z = s * 0.42; chest.add(shoulder); // abducted A-pose
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.037, 0.15, 3, 8), mat(C.skin));
    upper.position.y = -0.1; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.name = `Elbow_${side}`; elbow.position.y = -0.2; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.15, 3, 8), mat(C.boot)); // glove leather
    fore.position.y = -0.1; elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.045, 8), mat(C.boot)); // pointed cuff flare
    cuff.position.y = -0.185; elbow.add(cuff);
    const hand = new THREE.Group(); hand.name = `Hand_${side}`; hand.position.y = -0.215; elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), mat(C.boot));
    palm.scale.set(0.8, 1.15, 0.55); hand.add(palm);
    arms[side] = { shoulder, elbow };
  }

  // two back-mounted swords, scabbards crossing the lower back horizontally
  const scabbards = new THREE.Group(); scabbards.name = 'Scabbards'; scabbards.position.set(0, 0.16, -0.1); chest.add(scabbards);
  const glintMats = [];
  for (const s of [-1, 1]) {
    const sc = new THREE.Group(); sc.rotation.z = s * 0.62; scabbards.add(sc);
    const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.5, 0.05), mat(C.yoke));
    sc.add(sheath);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), mat(C.steelDark)); // metal end cap
    cap.position.y = -0.26; sc.add(cap);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.34, 0.03), mat(C.steel, { metalness: 0.85, roughness: 0.25, emissive: 0x223344, emissiveIntensity: 0 }));
    blade.position.y = 0.42; sc.add(blade); // drawn — crossguard hooks up
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.06), mat(C.steelDark, { metalness: 0.7, roughness: 0.4 }));
    guard.position.y = 0.25; sc.add(guard);
    glintMats.push(blade.material);
  }

  // ── runtime contract: sockets + idle tick (img2threejs conventions) ──
  root.userData.sockets = {
    hand_L: arms.L.elbow.children.find((c) => c.name === 'Hand_L'),
    hand_R: arms.R.elbow.children.find((c) => c.name === 'Hand_R'),
    scabbards,
    head,
  };
  root.userData.tick = (t) => {
    ponytail.rotation.x = -0.08 * Math.sin(t * 1.7);        // ponytail sway
    segs[1].rotation.z = 0.1 * Math.sin(t * 1.7 + 0.6);
    segs[2].rotation.z = 0.14 * Math.sin(t * 1.7 + 1.1);
    chest.scale.y = 1 + 0.012 * Math.sin(t * 2.1);           // breath
    const g = 0.5 + 0.5 * Math.sin(t * 0.9);                 // slow steel glint
    for (const m of glintMats) m.emissiveIntensity = 0.35 * g;
    arms.L.shoulder.rotation.z = -0.42 + 0.02 * Math.sin(t * 2.1);
    arms.R.shoulder.rotation.z = 0.42 - 0.02 * Math.sin(t * 2.1 + 1);
  };
  return root;
}

export const PANTERA_DESC = {
  id: 'pantera', name: 'Pantera — dual-sword warrior',
  blurb: 'img2threejs-style light pass · dark-palette warrior, ponytail sway + sword glint · ref: showcase girl-character',
};
