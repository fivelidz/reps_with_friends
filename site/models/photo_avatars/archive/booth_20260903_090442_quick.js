// site/models/photo_avatars/booth_20260903_090442_quick.js — PHOTO BOOTH quick palette avatar
//
// FALLBACK path (no vision API): palette median-cut sampled from the user's
// photo (scripts/avatars/photo_palette_sample.py method) + a deterministic
// template bust (scripts/booth/generate.py QUICK_TEMPLATE). Same contract as
// every photo avatar: pivots + userData.sockets + userData.tick idle.
// 2026-09-03 · photo never stored.

import * as THREE from 'three';

const C = { skin: 0x7b4c2d, hair: 0x20293a, garment: 0xe0a52e, accent: 0xcfa367, eye: 0x2e2a26, dark: 0x14161c };

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

export function createBoothModel() {
  const root = new THREE.Group(); root.name = 'booth-quick-bust';
  const M = (geo, hex, parent, p, o) => { const m = new THREE.Mesh(geo, mat(hex, o)); m.position.set(p[0], p[1], p[2]); parent.add(m); return m; };

  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Hair = new THREE.Group(); Hair.name = 'Hair'; Head.add(Hair);

  // torso: tee shoulders (bust only)
  M(new THREE.BoxGeometry(2.7, 1.15, 1.15), C.garment, Shoulders, [0, 0.55, 0]);
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.garment, Shoulders, [1.32, 1.02, 0]);
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.garment, Shoulders, [-1.32, 1.02, 0]);
  M(new THREE.BoxGeometry(0.7, 0.1, 0.06), C.accent, Shoulders, [0, 0.86, 0.59]);   // chest stripe
  M(new THREE.CylinderGeometry(0.3, 0.36, 0.8, 12), C.skin, Neck, [0, 0.32, 0]);      // neck

  // head + face
  M(new THREE.SphereGeometry(1.0, 20, 14), C.skin, Head, [0, 0.25, 0.05]);
  for (const sx of [1, -1]) {
    const eye = M(new THREE.CapsuleGeometry(0.11, 0.18, 4, 10), C.eye, Head, [0.36 * sx, 0.38, 1.06]);
    eye.scale.set(1, 1, 0.35);
  }
  const mouth = M(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.dark, Head, [0, -0.15, 0.94]);
  mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.1, 0.5, 0.7);

  // hair: cap + back volume
  const cap = M(new THREE.SphereGeometry(1.05, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), C.hair, Hair, [0, 0.25, 0.05]);
  cap.rotation.x = 0.32;
  const back = M(new THREE.SphereGeometry(0.95, 16, 12), C.hair, Hair, [0, 0.3, -0.32]);
  back.scale.set(0.95, 0.95, 0.8);

  // accent ear studs — the palette's signature pop
  M(new THREE.SphereGeometry(0.07, 10, 8), C.accent, Head, [-1.02, 0.25, 0.05]);
  M(new THREE.SphereGeometry(0.07, 10, 8), C.accent, Head, [1.02, 0.25, 0.05]);

  root.userData.sockets = { root, shoulders: Shoulders, neck: Neck, head: Head, hair: Hair };
  root.userData.tick = (t) => {
    Head.rotation.z = Math.sin(1.4 * t) * 0.03;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.012);
    Hair.rotation.z = -Math.sin(1.4 * t) * 0.05;
  };
  return root;
}

export const BOOTH_DESC = {
  id: 'booth_20260903_090442_quick',
  name: 'Quick palette bust 090442',
  blurb: 'quick palette avatar — colours sampled from your photo, silhouette from the house template (no likeness)'
};
