// site/models/photo_avatars/monster.js — PHOTO AVATAR prototype #3
//
// Provenance (img2threejs-style, LIGHTWEIGHT manual pass — NOT the full gated
// pipeline): reference = img2threejs-showcase `monster`
// (public/references/monster/reference.png), the abyss creature. Construction
// follows the showcase registry entry (code-only measured reconstruction,
// own 41-bone rig, abyss layer) reduced to a readable stylized gaunt wraith;
// colous PALETTE-SAMPLED from the reference pixels (region crops, median-cut,
// 2026-09-02):
//   hide #eaeaea · dark limbs/face #26221f · face plate #2e2621 ·
//   mid grey #908a83 · eye pinlights #f5f5f5
// Method: reconstruction-by-code (Apache-2.0 img2threejs skill contract);
// no meshes, no textures. Output (this file) is ours.

import * as THREE from 'three';

const C = {
  hide: 0xeaeaea, dark: 0x26221f, face: 0x2e2621, mid: 0x908a83, pin: 0xf5f5f5,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });

/** Abyss wraith — pale gaunt humanoid, hunched, long clawed arms, jaw idle. */
export function createMonsterModel() {
  const root = new THREE.Group();
  root.name = 'AbyssWraith_Root';

  // ── pivots: hunched spine chain ──
  const hips = new THREE.Group(); hips.name = 'Hips'; hips.position.y = 0.62; hips.rotation.x = 0.12; root.add(hips);
  const spine = new THREE.Group(); spine.name = 'Spine'; spine.position.y = 0.2; spine.rotation.x = 0.22; hips.add(spine);
  const chest = new THREE.Group(); chest.name = 'Chest'; chest.position.y = 0.24; chest.rotation.x = 0.18; spine.add(chest);
  const neck = new THREE.Group(); neck.name = 'Neck'; neck.position.y = 0.18; neck.rotation.x = -0.3; chest.add(neck); // head thrust forward
  const head = new THREE.Group(); head.name = 'Head'; head.position.y = 0.1; neck.add(head);

  // torso — elongated, ribbed
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.34, 4, 10), mat(C.hide));
  trunk.name = 'Trunk'; trunk.position.y = 0.1; trunk.scale.set(1, 1, 0.8); spine.add(trunk);
  for (let i = 0; i < 3; i++) { // rib bands — dark, suggestion only
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.125 - i * 0.012, 0.012, 5, 12), mat(C.mid));
    rib.rotation.x = Math.PI / 2; rib.position.y = 0.02 + i * 0.1; rib.scale.z = 0.8; spine.add(rib);
  }
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(C.dark));
  pelvis.name = 'Pelvis'; pelvis.scale.set(1, 0.8, 0.85); hips.add(pelvis);

  // legs — digitigrade bend, dark lower
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const leg = new THREE.Group(); leg.name = `Leg_${side}`; leg.position.set(0.085 * s, -0.02, 0); hips.add(leg);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.26, 3, 8), mat(C.hide));
    thigh.position.y = -0.14; leg.add(thigh);
    const knee = new THREE.Group(); knee.name = `Knee_${side}`; knee.position.y = -0.29; knee.rotation.x = -0.5; leg.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 3, 8), mat(C.dark));
    shin.position.y = -0.13; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.15), mat(C.dark));
    foot.position.set(0, -0.27, 0.04); knee.add(foot);
    for (let c = 0; c < 3; c++) { // toe claws
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 5), mat(C.pin, { roughness: 0.4 }));
      claw.rotation.x = Math.PI / 2.1; claw.position.set((c - 1) * 0.022, -0.275, 0.13); knee.add(claw);
    }
  }

  // arms — LONG, two-segment, clawed hands (wraith signature)
  const arms = {};
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group(); shoulder.name = `Shoulder_${side}`;
    shoulder.position.set(0.15 * s, 0.12, 0); shoulder.rotation.z = s * 0.55; chest.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.34, 3, 8), mat(C.hide));
    upper.position.y = -0.19; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.name = `Elbow_${side}`; elbow.position.y = -0.38; elbow.rotation.z = s * 0.12; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.34, 3, 8), mat(C.dark));
    fore.position.y = -0.19; elbow.add(fore);
    const hand = new THREE.Group(); hand.name = `Hand_${side}`; hand.position.y = -0.38; elbow.add(hand);
    for (let c = 0; c < 3; c++) { // finger claws, fan
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.14, 5), mat(C.pin, { roughness: 0.35 }));
      claw.position.set((c - 1) * 0.028, -0.07, 0.01); claw.rotation.x = -0.15 + c * 0.04; claw.rotation.z = (c - 1) * 0.16;
      hand.add(claw);
    }
    arms[side] = { shoulder, elbow, hand };
  }

  // head — elongated pale skull, dark face plate, sunken eyes with pinlights
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat(C.hide));
  skull.name = 'Skull'; skull.scale.set(0.85, 1.2, 1.05); head.add(skull);
  const facePlate = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.5), mat(C.face));
  facePlate.name = 'Face_Plate'; facePlate.scale.set(0.95, 1.15, 1.1); head.add(facePlate); // dark mask, front hemisphere
  const eyes = [];
  for (const s of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mat(0x120e0c, { roughness: 1 }));
    socket.name = s < 0 ? 'Socket_L' : 'Socket_R';
    socket.position.set(0.038 * s, 0.02, 0.078); socket.scale.set(1, 0.8, 0.6); head.add(socket);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), mat(C.pin, { emissive: 0xf5f5f5, emissiveIntensity: 1.6, roughness: 0.2 }));
    pin.name = s < 0 ? 'Pinlight_L' : 'Pinlight_R';
    pin.position.set(0.038 * s, 0.02, 0.094); head.add(pin);
    eyes.push(pin.material);
  }
  // jaw — pivot, slightly open idle
  const jaw = new THREE.Group(); jaw.name = 'Jaw'; jaw.position.set(0, -0.05, 0.02); head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.11), mat(C.face));
  jawMesh.position.set(0, -0.02, 0.045); jaw.add(jawMesh);
  for (let c = 0; c < 5; c++) { // teeth — pale
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 4), mat(C.pin));
    tooth.position.set(-0.032 + c * 0.016, 0.004, 0.096); head.add(tooth);
  }
  // spines down the back
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09 - i * 0.012, 5), mat(C.mid));
    spike.position.set(0, 0.26 - i * 0.13, -0.1 - i * 0.015); spike.rotation.x = -0.7;
    spine.add(spike);
  }

  // ── runtime contract: sockets + idle tick (img2threejs conventions) ──
  root.userData.sockets = { hand_L: arms.L.hand, hand_R: arms.R.hand, jaw, head };
  root.userData.tick = (t) => {
    spine.rotation.x = 0.22 + 0.035 * Math.sin(t * 1.1);              // hunch breath
    chest.rotation.x = 0.18 + 0.02 * Math.sin(t * 1.1 + 0.5);
    jaw.rotation.x = 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7));    // slow jaw idle
    const flick = 1.2 + 0.8 * Math.abs(Math.sin(t * 2.3)) * Math.abs(Math.sin(t * 0.31)); // eye pinlight flicker
    for (const m of eyes) m.emissiveIntensity = flick;
    arms.L.shoulder.rotation.z = 0.55 + 0.05 * Math.sin(t * 0.9);     // long-arm sway
    arms.R.shoulder.rotation.z = -0.55 - 0.05 * Math.sin(t * 0.9 + 1.4);
    root.rotation.y = 0.06 * Math.sin(t * 0.5);                       // unsettling drift
  };
  return root;
}

export const MONSTER_DESC = {
  id: 'wraith', name: 'Wraith — abyss creature',
  blurb: 'img2threejs-style light pass · pale gaunt wraith, jaw idle + eye pinlight flicker · ref: showcase monster',
};
