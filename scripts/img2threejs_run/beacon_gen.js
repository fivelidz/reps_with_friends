import * as THREE from 'three';

// ── palette (spec) ──────────────────────────────────────────────────────────
const C = { skin:0xe8b88a, hair:0xff5c38, eye:0x6ec1ff, dark:0x0a0b0d, hoodie:0x8b5cf6, gold:0xffc821, lime:0xc6f32e, charcoal:0x1a1d23 };

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

// mesh budget: 23 / 24 (hard cap 34)
export function createBeaconModel() {
  const root = new THREE.Group();
  root.name = 'beacon-bust';

  // ── named pivot hierarchy per spec ────────────────────────────────────────
  const Shoulders = new THREE.Group();   Shoulders.name = 'Shoulders';   Shoulders.position.set(0, 0, 0);       root.add(Shoulders);
  const Neck      = new THREE.Group();   Neck.name      = 'Neck';        Neck.position.set(0, 1.0, 0);         Shoulders.add(Neck);
  const Head      = new THREE.Group();   Head.name      = 'Head';        Head.position.set(0, 0.72, 0);        Neck.add(Head);
  const Fringe    = new THREE.Group();   Fringe.name    = 'Fringe';      Fringe.position.set(0, 0, 0);         Head.add(Fringe);
  const TopKnot   = new THREE.Group();   TopKnot.name   = 'TopKnot';     TopKnot.position.set(0, 0, 0);        Head.add(TopKnot);
  const Headphones= new THREE.Group();   Headphones.name= 'Headphones';  Headphones.position.set(0, 0, 0);     Head.add(Headphones);
  const DrawstringL = new THREE.Group(); DrawstringL.name = 'DrawstringL'; DrawstringL.position.set(0, 1.12, 0.42); Shoulders.add(DrawstringL);
  const DrawstringR = new THREE.Group(); DrawstringR.name = 'DrawstringR'; DrawstringR.position.set(0, 1.12, 0.42); Shoulders.add(DrawstringR);

  // mesh helper: geometry, hex, parent pivot, [x,y,z], material overrides
  const M = (geo, hex, parent, p, o) => {
    const m = new THREE.Mesh(geo, mat(hex, o));
    m.position.set(p[0], p[1], p[2]);
    parent.add(m);
    return m;
  };

  // ── zone: torso + wide squared shoulder pads (bust only — no arms) ────────
  M(new THREE.BoxGeometry(2.7, 1.15, 1.15), C.hoodie, Shoulders, [0, 0.55, 0]);        // torso
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.hoodie, Shoulders, [ 1.32, 1.02, 0]);    // shoulder pad R
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.hoodie, Shoulders, [-1.32, 1.02, 0]);    // shoulder pad L (mirrored x)

  // ── zone: neck + head (tan face vs coral hair split) ─────────────────────
  M(new THREE.CylinderGeometry(0.3, 0.36, 0.8, 12), C.skin, Neck, [0, 0.32, 0]);       // neck, tapered
  M(new THREE.SphereGeometry(1.0, 20, 14), C.skin, Head, [0, 0.25, 0.05]);             // head

  // ── zone: coral hair — cap, back volume, fringe sweep over LEFT eye ──────
  const hairCap = M(new THREE.SphereGeometry(1.05, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), C.hair, Head, [0, 0.25, 0.05]);
  hairCap.rotation.x = 0.32;
  const hairBack = M(new THREE.SphereGeometry(0.95, 16, 12), C.hair, Head, [0, 0.3, -0.32]);
  hairBack.scale.set(0.95, 0.95, 0.8);
  const fringeSweep = M(new THREE.SphereGeometry(0.55, 16, 12), C.hair, Fringe, [-0.28, 0.5, 0.68]);
  fringeSweep.scale.set(1.35, 0.42, 0.6);
  fringeSweep.rotation.z = 0.35;                                                        // covers half of LEFT eye
  const topKnot = M(new THREE.SphereGeometry(0.2, 12, 10), C.hair, TopKnot, [0, 1.58, 0.12]);
  topKnot.scale.set(1, 0.85, 1);                                                        // small top-knot above crown

  // ── zone: face — sky-blue rounded-rect eyes (z-squashed capsules) ────────
  for (const sx of [1, -1]) {
    const eye = M(new THREE.CapsuleGeometry(0.1, 0.18, 4, 10), C.eye, Head, [0.36 * sx, 0.38, 0.95]);
    eye.scale.set(1, 1, 0.35);
  }
  // OPEN dark smile wedge (arbitration overrides intake's closed mouth)
  const mouth = M(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.dark, Head, [0, -0.15, 0.94]);
  mouth.rotation.x = Math.PI / 2;
  mouth.scale.set(1.2, 0.6, 0.8);

  // ── zone: headphones — dark band over crown, dark cups at EAR height ────
  // (host arbitration: cups on head flanks, NOT the eyes)
  M(new THREE.TorusGeometry(1.16, 0.07, 8, 32, Math.PI), C.dark, Headphones, [0, 0.25, 0.02]);  // band arcs over crown, joins both cups
  const cup_L = M(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), C.dark, Headphones, [-1.04, 0.25, 0.02]);
  cup_L.rotation.z = Math.PI / 2;
  const cup_R = M(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), C.dark, Headphones, [1.04, 0.25, 0.02]);
  cup_R.rotation.z = Math.PI / 2;
  const ring_L = M(new THREE.TorusGeometry(0.34, 0.05, 8, 24), C.gold, Headphones, [-1.17, 0.25, 0.02], { metalness: 0.45, roughness: 0.35 });
  ring_L.rotation.y = Math.PI / 2;
  const ring_R = M(new THREE.TorusGeometry(0.34, 0.05, 8, 24), C.gold, Headphones, [1.17, 0.25, 0.02], { metalness: 0.45, roughness: 0.35 });
  ring_R.rotation.y = Math.PI / 2;

  // ── zone: purple hood — collar ring behind neck + hood back ──────────────
  const hoodCollar = M(new THREE.TorusGeometry(0.5, 0.17, 10, 24), C.hoodie, Shoulders, [0, 1.14, -0.02]);
  hoodCollar.rotation.x = Math.PI / 2 + 0.12;
  const hoodBack = M(new THREE.SphereGeometry(0.6, 16, 12), C.hoodie, Shoulders, [0, 1.22, -0.58]);
  hoodBack.scale.set(1.15, 0.85, 0.6);

  // ── zone: lime drawstrings + gold aglets hanging from hoodie neckline ────
  for (const [g, sx] of [[DrawstringL, -1], [DrawstringR, 1]]) {
    M(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), C.lime, g, [0.22 * sx, -0.25, 0.1]);
    M(new THREE.SphereGeometry(0.06, 10, 8), C.gold, g, [0.22 * sx, -0.53, 0.1]);
  }

  // ── zone: gold zip pull at centre chest (emissive, glint in tick) ────────
  const zipMat = mat(C.gold, { emissive: new THREE.Color(C.gold), emissiveIntensity: 0.4 });
  const zipPull = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), zipMat);
  zipPull.position.set(0, 0.7, 0.6);
  zipPull.scale.set(0.8, 1.25, 0.6);
  Shoulders.add(zipPull);

  // ── sockets (spec list + headphone cups) ─────────────────────────────────
  root.userData.sockets = {
    root,
    shoulders: Shoulders,
    neck: Neck,
    head: Head,
    fringe: Fringe,
    topknot: TopKnot,
    headphones: Headphones,
    drawstrings: [DrawstringL, DrawstringR],
    cup_L,
    cup_R
  };

  // ── tick plan ────────────────────────────────────────────────────────────
  root.userData.tick = (t) => {
    // head bob: rotZ sin(1.4t)*.035, rotX sin(.9t)*.025, posY +sin(1.8t)*.02
    Head.rotation.z = Math.sin(1.4 * t) * 0.035;
    Head.rotation.x = Math.sin(0.9 * t) * 0.025;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;

    // breath: shoulders scale 1 + sin(1.1t)*~.015
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.015);

    // drawstring sway: rotZ sin(1.6t)*.06, rotX sin(1.1t+1.2)*.04 (R offset for naturalism)
    DrawstringL.rotation.z = Math.sin(1.6 * t) * 0.06;
    DrawstringL.rotation.x = Math.sin(1.1 * t + 1.2) * 0.04;
    DrawstringR.rotation.z = Math.sin(1.6 * t + 0.8) * 0.06;
    DrawstringR.rotation.x = Math.sin(1.1 * t + 2.0) * 0.04;

    // gold glint: zip emissiveIntensity 0.2..0.9 @ 2.4Hz
    zipMat.emissiveIntensity = 0.55 + 0.35 * Math.sin(2 * Math.PI * 2.4 * t);

    // fringe flutter + topknot counter-sway (against head bob)
    Fringe.rotation.z = Math.sin(2.0 * t) * 0.06;
    Fringe.rotation.x = Math.sin(2.6 * t) * 0.03;
    TopKnot.rotation.z = -Math.sin(1.4 * t) * 0.08;
    TopKnot.rotation.x = -Math.sin(0.9 * t) * 0.05;
  };

  return root;
}

export const BEACON_DESC = {
  id: 'beacon',
  name: 'Beacon — coral-top-knot DJ bust',
  blurb: 'REAL vision-driven run · glm-4.6v intake + glm-5.3 codegen · ref: authored flat-colour test subject (no people)'
};