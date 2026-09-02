// site/models/photo_avatars/mouse.js — PHOTO AVATAR prototype #2
//
// Provenance (img2threejs-style, LIGHTWEIGHT manual pass — NOT the full gated
// pipeline): reference = img2threejs-showcase `electric-mouse-mascot`
// (public/references/electric-mouse-mascot/reference.png), the stylized
// yellow electric-mouse mascot staged as a 10k-star celebration. Construction
// follows the showcase registry's own component contract (Body_Head_Main one
// rounded capsule, Ear_L/Ear_R tall tapered with dark tips, Eye_L/R with
// offset specular highlights, small dark nose, open smiling mouth with tongue,
// red cheek discs). Colours PALETTE-SAMPLED from the reference pixels
// (region crops, median-cut, 2026-09-02):
//   body #f3b822 · belly #feed3c · cheeks/mouth #c0564c · tongue #ef855c ·
//   ear tips #2b2016 · eyes #1c1512
// Method: reconstruction-by-code (Apache-2.0 img2threejs skill contract);
// no meshes, no textures. Output (this file) is ours.

import * as THREE from 'three';

const C = {
  body: 0xf3b822, belly: 0xfeed3c, cheek: 0xc0564c, tongue: 0xef855c,
  tip: 0x2b2016, eye: 0x1c1512, hi: 0xffffff, tail: 0x8a6a20,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: true, ...o });

/** Electric mouse mascot — celebration edition. One capsule reads body+head. */
export function createMouseModel() {
  const root = new THREE.Group();
  root.name = 'ElectricMouse_Root';

  // ── Body_Head_Main — single rounded capsule, no waist seam ──
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.2, 6, 14), mat(C.body));
  body.name = 'Body_Head_Main'; body.position.y = 0.38; root.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), mat(C.belly)); // soft belly patch, single crease feel
  belly.position.set(0, 0.33, 0.115); belly.scale.set(1, 1.25, 0.45); root.add(belly);

  // ── ears — tall, tapered, dark-tipped, pivot at base ──
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.name = s < 0 ? 'Ear_L' : 'Ear_R';
    ear.position.set(0.13 * s, 0.56, 0); ear.rotation.z = s * -0.5; root.add(ear);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 8), mat(C.body));
    cone.position.y = 0.13; ear.add(cone);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.11, 8), mat(C.tip));
    tip.position.y = 0.24; ear.add(tip);
    ears.push(ear);
  }

  // ── face — eyes w/ offset specular highlights, nose, smiling open mouth ──
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), mat(C.eye, { roughness: 0.25 }));
    eye.name = s < 0 ? 'Eye_L' : 'Eye_R';
    eye.position.set(0.085 * s, 0.47, 0.205); eye.scale.set(0.9, 1.1, 0.7); root.add(eye);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), mat(C.hi, { roughness: 0.1, emissive: 0x888888, emissiveIntensity: 0.4 }));
    hi.name = s < 0 ? 'EyeHighlight_L' : 'EyeHighlight_R';
    hi.position.set(0.085 * s + 0.011, 0.482, 0.23); root.add(hi);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(C.cheek, { emissive: 0x551111, emissiveIntensity: 0.5 })); // red cheek discs
    cheek.name = s < 0 ? 'Cheek_L' : 'Cheek_R';
    cheek.position.set(0.165 * s, 0.415, 0.165); cheek.scale.set(1, 1, 0.35); root.add(cheek);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), mat(C.tip, { roughness: 0.3 }));
  nose.name = 'Nose'; nose.position.set(0, 0.435, 0.245); nose.scale.set(1.3, 0.9, 0.8); root.add(nose);
  const mouth = new THREE.Group(); mouth.name = 'Mouth'; mouth.position.set(0, 0.385, 0.21); root.add(mouth);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.cheek, { side: THREE.DoubleSide }));
  cavity.name = 'Mouth_Inner'; cavity.rotation.x = Math.PI; cavity.scale.set(1, 0.55, 0.5); mouth.add(cavity);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 5, 12, Math.PI), mat(C.body));
  lip.name = 'Mouth_Outer'; lip.rotation.z = Math.PI; lip.scale.set(1, 0.55, 0.6); mouth.add(lip);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(C.tongue));
  tongue.name = 'Tongue'; tongue.position.set(0, -0.012, 0.012); tongue.scale.set(1, 0.6, 1); mouth.add(tongue);

  // ── stubby limbs + feet ──
  const limbs = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = s < 0 ? 'Arm_L' : 'Arm_R';
    arm.position.set(0.235 * s, 0.42, 0); arm.rotation.z = s * 0.7; root.add(arm);
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.09, 3, 8), mat(C.body));
    capsule.position.y = -0.06; arm.add(capsule);
    limbs.push(arm);
    const leg = new THREE.Group(); leg.name = s < 0 ? 'Leg_L' : 'Leg_R';
    leg.position.set(0.1 * s, 0.19, 0); root.add(leg);
    const stub = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.05, 3, 8), mat(C.body));
    stub.position.y = -0.035; leg.add(stub);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(C.tip));
    foot.position.set(0, -0.075, 0.015); foot.scale.set(0.9, 0.55, 1.25); leg.add(foot);
    limbs.push(leg);
  }

  // ── tail — zigzag, dark at base ──
  const tail = new THREE.Group(); tail.name = 'Tail'; tail.position.set(0, 0.3, -0.24); root.add(tail);
  let tp = tail;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group(); seg.rotation.y = i % 2 ? 0.7 : -0.7;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016 - i * 0.002, 0.014 - i * 0.002, 0.09, 6), mat(i === 0 ? C.tip : C.tail));
    m.rotation.x = Math.PI / 2; m.position.z = 0.045; seg.add(m);
    seg.position.z = i === 0 ? 0 : 0.09; tp.add(seg); tp = seg;
  }

  // ── runtime contract: sockets + idle tick (img2threejs conventions) ──
  root.userData.sockets = { ear_L: ears[0], ear_R: ears[1], mouth, tail };
  root.userData.tick = (t) => {
    body.position.y = 0.38 + 0.02 * Math.abs(Math.sin(t * 3.1));        // bounce
    belly.position.y = 0.33 + 0.02 * Math.abs(Math.sin(t * 3.1));
    ears[0].rotation.z = 0.5 + 0.16 * Math.sin(t * 5.2);                // ear wiggle
    ears[1].rotation.z = -0.5 - 0.16 * Math.sin(t * 5.2 + 0.8);
    mouth.scale.y = 1 + 0.12 * Math.sin(t * 3.1);                       // smile pulse w/ bounce
    tail.rotation.y = 0.3 * Math.sin(t * 2.6);                          // tail sway
    for (const l of limbs) l.rotation.z *= 1;                            // (limbs static — bounce carries it)
    root.rotation.y = 0.08 * Math.sin(t * 0.8);                          // gentle weight shift
  };
  return root;
}

export const MOUSE_DESC = {
  id: 'mouse', name: 'Sparky — electric mascot',
  blurb: 'img2threejs-style light pass · capsule body-head, ear wiggle + cheek glow · ref: showcase electric-mouse-mascot',
};
