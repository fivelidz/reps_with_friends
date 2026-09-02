import * as THREE from 'three';

const C = { skin: 0xe8b88a, hair: 0xff5c38, eye: 0x6ec1ff, dark: 0x0a0b0d, hoodie: 0x8b5cf6, gold: 0xffc821, lime: 0xc6f32e, charcoal: 0x1a1d23, navy: 0x131a2e };
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

export function createBeaconModel() {
  const root = new THREE.Group();
  root.name = 'BeaconBust';

  // shared flat materials (zip gets its own emissive instance for the glint)
  const skinM = mat(C.skin), hairM = mat(C.hair), eyeM = mat(C.eye), darkM = mat(C.dark),
        hoodieM = mat(C.hoodie), limeM = mat(C.lime),
        goldM = mat(C.gold, { metalness: 0.6, roughness: 0.4 }),
        zipM = mat(C.gold, { metalness: 0.5, roughness: 0.35, emissive: C.gold, emissiveIntensity: 0.25 });

  // ---- pivots ----
  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Fringe = new THREE.Group(); Fringe.name = 'Fringe'; Head.add(Fringe);
  const TopKnot = new THREE.Group(); TopKnot.name = 'TopKnot'; Head.add(TopKnot);
  const Headphones = new THREE.Group(); Headphones.name = 'Headphones'; Head.add(Headphones);
  const Strings = new THREE.Group(); Strings.name = 'Drawstrings'; Strings.position.set(0, 1.12, 0.42); Shoulders.add(Strings);

  // ZONE: garment — purple hoodie chest with wide squared shoulders (bust only, no arms)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.15, 1.15), hoodieM);
  torso.position.set(0, 0.55, 0); Shoulders.add(torso);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 1.1), hoodieM);
  padL.position.set(-1.32, 1.02, 0); Shoulders.add(padL);
  const padR = padL.clone(); padR.position.x = 1.32; Shoulders.add(padR);

  // ZONE: neck — tan skin column linking head to garment
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.8, 12), skinM);
  neck.position.set(0, 0.32, 0); Neck.add(neck);

  // ZONE: head — round skull, tan face on the front
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 18), skinM);
  head.position.set(0, 0.25, 0.05); Head.add(head);

  // ZONE: hair — coral cap tilted back so the tan face shows, plus back-of-head volume
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.05, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM);
  cap.position.copy(head.position); cap.rotation.x = 0.32; Head.add(cap);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), hairM);
  back.scale.set(0.95, 0.95, 0.8); back.position.set(0, 0.3, -0.32); Head.add(back);

  // ZONE: fringe — coral sweep diagonal across the brow, half-covering the LEFT eye (host arbitration)
  const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 10), hairM);
  sweep.scale.set(1.35, 0.42, 0.6); sweep.rotation.z = 0.35; sweep.position.set(-0.28, 0.5, 0.68); Fringe.add(sweep);

  // ZONE: eyes — small sky-blue rounded rects on the FACE FRONT
  const eyeGeo = new THREE.CapsuleGeometry(0.1, 0.18, 4, 10);
  const eyeL = new THREE.Mesh(eyeGeo, eyeM); eyeL.scale.z = 0.35;
  eyeL.position.set(-0.36, 0.38, 0.95); Head.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.36; Head.add(eyeR);

  // ZONE: mouth — OPEN smile: dark rounded wedge bulging from the lower face
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), darkM);
  mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.2, 0.6, 0.8); mouth.position.set(0, -0.15, 0.94); Head.add(mouth);

  // ZONE: top-knot — small coral bun perched above the crown
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), hairM);
  knot.scale.set(1, 0.85, 1); knot.position.set(0, 1.58, 0.12); TopKnot.add(knot);

  // ZONE: headphones — dark band arcing over the crown, dark cups at EAR height on head flanks, gold rims
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.07, 8, 28, Math.PI), darkM);
  band.position.set(0, 0.25, 0.02); band.rotation.x = -0.08; Headphones.add(band);
  const cupGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16);
  const cupL = new THREE.Mesh(cupGeo, darkM); cupL.rotation.z = Math.PI / 2; cupL.position.set(-1.04, 0.25, 0.02); Headphones.add(cupL);
  const cupR = cupL.clone(); cupR.position.x = 1.04; Headphones.add(cupR);
  const ringGeo = new THREE.TorusGeometry(0.34, 0.05, 8, 22);
  const ringL = new THREE.Mesh(ringGeo, goldM); ringL.rotation.y = Math.PI / 2; ring