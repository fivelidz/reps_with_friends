// site/models/photo_avatars/booth_20260903_093311.js — PHOTO BOOTH avatar
//
// Generated 2026-09-03 09:33 by scripts/booth/generate.py:
//   intake  : glm-4.6v (palette + silhouette semantics from a photo — no likeness)
//   codegen : glm-5.3 (procedural Three.js bust, module contract)
//   gate    : headless render contract + deterministic pixel probes
// Host refine pass 1 (2026-09-03): mat() whitelist — codegen passed mesh/
// geometry props (openEnded, rotation) into material options; three warned and
// ignored them. Whitelisted destructure keeps modules console-silent. Same
// fix folded into the codegen contract (scripts/booth/generate.py).
// The reference photo was never stored. This file is ours.

import * as THREE from 'three';
const C = { hair: 0x8B4513, skin: 0xD2B48C, eyes: 0x000000, headwear: 0xFFD700, facial_hair: 0x8B4513, garment: 0xFFA500, accent: 0xFF6B6B, background: 0x1E2A3A };
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0, flatShading: true }, Object.fromEntries(Object.entries(o || {}).filter(([k]) => ['roughness','metalness','emissive','emissiveIntensity','transparent','opacity','side'].includes(k)))));
export function createBoothModel() {
  const root = new THREE.Group(); root.name = 'booth-bust';
  const M = (geo, hex, parent, p, o) => { const m = new THREE.Mesh(geo, mat(hex, o)); m.position.set(p[0], p[1], p[2]); parent.add(m); return m; };

  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Hair = new THREE.Group(); Hair.name = 'Hair'; Head.add(Hair);

  // --- torso: orange tee bust ---
  M(new THREE.BoxGeometry(2.7, 1.15, 1.15), C.garment, Shoulders, [0, 0.55, 0]);
  M(new THREE.CylinderGeometry(1.42, 1.42, 1.15, 7, 1, false, -Math.PI * 0.5, Math.PI), C.garment, Shoulders, [0, 0.55, 0], { openEnded: true });
  M(new THREE.BoxGeometry(2.74, 0.16, 1.18), C.accent, Shoulders, [0, 0.16, 0]); // coral hem stripe
  M(new THREE.BoxGeometry(0.7, 0.5, 0.1), C.accent, Shoulders, [0, 0.78, 0.58]); // chest accent patch
  M(new THREE.BoxGeometry(0.9, 0.14, 0.12), C.accent, Shoulders, [0, 1.02, 0.55]); // collar band

  // --- neck ---
  M(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 10), C.skin, Neck, [0, 0.32, 0]);

  // --- head: round, tan skin ---
  M(new THREE.SphereGeometry(1.0, 18, 14), C.skin, Head, [0, 0.25, 0]);
  M(new THREE.BoxGeometry(0.16, 0.12, 0.12), C.skin, Head, [0, 0.1, 1.02]); // nose bridge

  // --- face: black eyes, neutral mouth ---
  M(new THREE.SphereGeometry(0.09, 8, 6), C.eyes, Head, [-0.36, 0.38, 1.05]);
  M(new THREE.SphereGeometry(0.09, 8, 6), C.eyes, Head, [0.36, 0.38, 1.05]);
  M(new THREE.BoxGeometry(0.34, 0.06, 0.06), C.eyes, Head, [0, -0.15, 0.94]);

  // --- hair: short bean cap hugging the crown ---
  const cap = M(new THREE.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), C.hair, Hair, [0, 0.27, 0]);
  cap.scale.set(1.02, 0.92, 1.04);
  M(new THREE.SphereGeometry(0.52, 10, 8), C.hair, Hair, [0, 0.72, -0.1]); // bean crown volume
  M(new THREE.BoxGeometry(1.9, 0.3, 0.5), C.hair, Hair, [0, 0.5, -0.82]); // back tuft

  // --- facial hair: brown beard hugging the jaw ---
  M(new THREE.SphereGeometry(0.86, 14, 8, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), C.facial_hair, Head, [0, 0.2, 0.08]);
  M(new THREE.TorusGeometry(0.55, 0.13, 8, 14, Math.PI), C.facial_hair, Head, [0, -0.28, 0.62], { rotation: new THREE.Euler(0.25, 0, 0) });
  M(new THREE.BoxGeometry(0.16, 0.2, 0.14), C.facial_hair, Head, [0, -0.02, 0.92]); // moustache
  M(new THREE.BoxGeometry(0.5, 0.18, 0.16), C.facial_hair, Head, [0, -0.62, 0.45]); // chin base

  // --- accessories: round gold glasses, outside head radius at ear height ---
  const gl = new THREE.TorusGeometry(0.28, 0.055, 8, 16);
  M(gl, C.headwear, Head, [-0.38, 0.38, 0.98], { rotation: new THREE.Euler(0, 0.35, 0) });
  M(gl, C.headwear, Head, [0.38, 0.38, 0.98], { rotation: new THREE.Euler(0, -0.35, 0) });
  M(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), C.headwear, Head, [0, 0.38, 0.98], { rotation: new THREE.Euler(0, 0, Math.PI / 2) });
  M(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), C.headwear, Head, [-1.08, 0.25, 0], { rotation: new THREE.Euler(0, 0, Math.PI / 2) }); // left temple
  M(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), C.headwear, Head, [1.08, 0.25, 0], { rotation: new THREE.Euler(0, 0, Math.PI / 2) }); // right temple

  root.userData.sockets = { root, shoulders: Shoulders, neck: Neck, head: Head, hair: Hair };
  root.userData.tick = (t) => {
    Head.rotation.z = Math.sin(1.4 * t) * 0.03;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.012);
    Hair.rotation.z = -Math.sin(1.4 * t) * 0.05;
  };
  return root;
}
export const BOOTH_DESC = { id: 'booth_20260903_093311', name: 'Golden Hour Bookworm', blurb: 'Round tan face with a brown bean-crop hair, gold round glasses and full beard over an orange tee with coral trim, cut from a warm illustrative palette.' };
