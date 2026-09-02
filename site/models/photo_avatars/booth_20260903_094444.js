// site/models/photo_avatars/booth_20260903_094444.js — PHOTO BOOTH avatar
//
// Generated 2026-09-03 09:45 by scripts/booth/generate.py:
//   intake  : glm-4.6v (palette + silhouette semantics from a photo — no likeness)
//   codegen : glm-5.3 (procedural Three.js bust, module contract)
//   gate    : headless render contract + deterministic pixel probes
// The reference photo was never stored. This file is ours.

import * as THREE from 'three';
const C = {
  hair: 0x8B572A,
  skin: 0xD4A574,
  eyes: 0x000000,
  garment: 0xF9C74F,
  accent: 0xFF6B6B,
  background: 0x1E293B,
  headwear: 0xFFD166
};
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0, flatShading: true }, Object.fromEntries(Object.entries(o || {}).filter(([k]) => ['roughness','metalness','emissive','emissiveIntensity','transparent','opacity','side'].includes(k)))));
export function createBoothModel() {
  const root = new THREE.Group(); root.name = 'booth-bust';
  const M = (geo, hex, parent, p, o) => { const m = new THREE.Mesh(geo, mat(hex, o)); m.position.set(p[0], p[1], p[2]); parent.add(m); return m; };

  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Hair = new THREE.Group(); Hair.name = 'Hair'; Head.add(Hair);

  // --- torso: yellow tee bust, squared shoulders ---
  const torso = M(new THREE.BoxGeometry(2.7, 1.15, 1.15), C.garment, Shoulders, [0, 0.55, 0]);
  M(new THREE.BoxGeometry(1.35, 0.5, 0.22), C.garment, Shoulders, [0, 1.05, 0.3]); // trap rise

  // --- neck ---
  M(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 10), C.skin, Neck, [0, 0.32, 0]);

  // --- head: round sphere ---
  M(new THREE.SphereGeometry(1.0, 20, 16), C.skin, Head, [0, 0.25, 0]);

  // --- ears (outside head radius at y 0.25) ---
  const earL = M(new THREE.SphereGeometry(0.16, 8, 6), C.skin, Head, [-1.02, 0.25, 0]);
  const earR = M(new THREE.SphereGeometry(0.16, 8, 6), C.skin, Head, [1.02, 0.25, 0]);
  earL.scale.set(0.6, 1, 0.8); earR.scale.set(0.6, 1, 0.8);

  // --- face: eyes + brows + mouth ---
  M(new THREE.SphereGeometry(0.09, 8, 8), C.eyes, Head, [-0.36, 0.38, 1.05]);
  M(new THREE.SphereGeometry(0.09, 8, 8), C.eyes, Head, [0.36, 0.38, 1.05]);
  const browL = M(new THREE.BoxGeometry(0.3, 0.06, 0.08), C.hair, Head, [-0.36, 0.56, 0.98]);
  const browR = M(new THREE.BoxGeometry(0.3, 0.06, 0.08), C.hair, Head, [0.36, 0.56, 0.98]);
  browL.rotation.z = 0.08; browR.rotation.z = -0.08;
  const mouth = M(new THREE.BoxGeometry(0.3, 0.07, 0.08), C.eyes, Head, [0, -0.15, 0.94]);
  mouth.rotation.z = 0;

  // --- facial hair: short beard band hugging the jaw ---
  const jaw = M(new THREE.CylinderGeometry(0.72, 0.5, 0.55, 14, 1, true), C.hair, Head, [0, -0.28, 0.08], { side: THREE.DoubleSide });
  jaw.scale.set(1.02, 1, 0.95);
  const chin = M(new THREE.SphereGeometry(0.34, 10, 8), C.hair, Head, [0, -0.52, 0.52]);
  chin.scale.set(1.1, 0.55, 0.7);
  const muz = M(new THREE.BoxGeometry(0.4, 0.16, 0.12), C.hair, Head, [0, -0.2, 0.86]);
  muz.scale.set(1, 1, 1);

  // --- hair: short cap under the beanie ---
  const cap = M(new THREE.SphereGeometry(1.05, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), C.hair, Hair, [0, 0.24, 0]);
  cap.scale.set(1, 0.9, 1);

  // --- accessory: gold beanie (silhouette) ---
  const beanie = M(new THREE.SphereGeometry(1.1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), C.headwear, Hair, [0, 0.27, -0.02]);
  beanie.scale.set(1, 0.92, 1);
  const brim = M(new THREE.TorusGeometry(1.02, 0.1, 8, 20), C.headwear, Hair, [0, 0.42, -0.02]);
  brim.rotation.x = Math.PI / 2;
  const pom = M(new THREE.SphereGeometry(0.19, 10, 8), C.headwear, Hair, [0, 1.32, -0.05]);

  // --- accessory: round gold glasses, outside head, over eyes' upper rim ---
  const lensL = M(new THREE.TorusGeometry(0.3, 0.055, 8, 18), C.headwear, Head, [-0.36, 0.38, 1.08]);
  const lensR = M(new THREE.TorusGeometry(0.3, 0.055, 8, 18), C.headwear, Head, [0.36, 0.38, 1.08]);
  const bridge = M(new THREE.BoxGeometry(0.2, 0.05, 0.06), C.headwear, Head, [0, 0.42, 1.1]);
  const templeL = M(new THREE.BoxGeometry(0.62, 0.05, 0.05), C.headwear, Head, [-0.82, 0.4, 0.82]);
  const templeR = M(new THREE.BoxGeometry(0.62, 0.05, 0.05), C.headwear, Head, [0.82, 0.4, 0.82]);
  templeL.rotation.y = 0.45; templeR.rotation.y = -0.45;

  // --- garment details: accent chest stripe + collar ---
  const stripe = M(new THREE.BoxGeometry(2.72, 0.18, 0.06), C.accent, Shoulders, [0, 0.62, 0.59]);
  const collar = M(new THREE.TorusGeometry(0.34, 0.08, 8, 16), C.accent, Shoulders, [0, 1.12, 0.18]);
  collar.rotation.x = Math.PI / 2 - 0.15;
  const zip = M(new THREE.BoxGeometry(0.08, 1.0, 0.05), C.accent, Shoulders, [0, 0.85, 0.58]);

  root.userData.sockets = { root, shoulders: Shoulders, neck: Neck, head: Head, hair: Hair };
  root.userData.tick = (t) => {
    Head.rotation.z = Math.sin(1.4 * t) * 0.03;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.012);
    Hair.rotation.z = -Math.sin(1.4 * t) * 0.05;
  };
  return root;
}
export const BOOTH_DESC = { id: 'booth_20260903_094444', name: 'Beanie Bard', blurb: 'A tan-skinned stylised bust with a gold beanie and round glasses, short brown beard, and a yellow tee with red accents on a navy stage.' };
