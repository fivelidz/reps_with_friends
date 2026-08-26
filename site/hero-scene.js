// RWF site — hero scene: stylised dumbbell, curl bob, particle motes.
// Fully offline; three@0.185.1 vendored at /site/vendor.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COL = {
  bg: 0x0a0b0d,
  lime: 0xc6f32e,
  coral: 0xff5c38,
  steel: 0x2e333b,
  steelLight: 0x343943,
  plate: 0x252930,
};

export function initHero(mount) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    console.warn('RWF hero: WebGL unavailable, scene skipped —', err);
    mount.style.display = 'none'; // page still works without WebGL
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  mount.appendChild(renderer.domElement);
  // allow vertical page scroll on touch; horizontal drag orbits
  renderer.domElement.style.touchAction = 'pan-y';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 6.5, 13);

  const camera = new THREE.PerspectiveCamera(
    42, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 40
  );
  camera.position.set(0, 0.55, 6.6);

  // ---- lights ----
  scene.add(new THREE.HemisphereLight(0x2a3038, 0x0a0b0d, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3.5, 5, 4);
  scene.add(key);
  const limeLight = new THREE.PointLight(COL.lime, 26, 16, 2);
  limeLight.position.set(-3.4, -1.2, 2.4);
  scene.add(limeLight);
  const coralLight = new THREE.PointLight(COL.coral, 18, 16, 2);
  coralLight.position.set(3.6, 2.4, -3);
  scene.add(coralLight);

  // ---- dumbbell ----
  const rig = new THREE.Group();   // parallax target
  const bell = new THREE.Group();  // curl-bob target
  rig.add(bell);
  scene.add(rig);

  const steelMat = new THREE.MeshStandardMaterial({ color: COL.steel, metalness: 0.7, roughness: 0.28 });
  const steelLightMat = new THREE.MeshStandardMaterial({ color: COL.steelLight, metalness: 0.65, roughness: 0.34 });
  const plateMat = new THREE.MeshStandardMaterial({ color: COL.plate, metalness: 0.65, roughness: 0.34 });
  const rimMat = new THREE.MeshStandardMaterial({
    color: COL.lime, emissive: COL.lime, emissiveIntensity: 1.3,
    metalness: 0.2, roughness: 0.4,
  });

  // bar (cylinder default axis is Y → rotate to lie along X)
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 3.6, 28), steelMat);
  bar.rotation.z = Math.PI / 2;
  bell.add(bar);

  // centre sleeve + collars
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.8, 28), steelLightMat);
  sleeve.rotation.z = Math.PI / 2;
  bell.add(sleeve);
  for (const s of [-1, 1]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 28), steelLightMat);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = s * 1.27;
    bell.add(collar);
  }

  // plates: stacked discs of decreasing radius → bevel feel
  const stack = [
    { r: 0.68, t: 0.11 },
    { r: 0.60, t: 0.10 },
    { r: 0.50, t: 0.09 },
  ];
  for (const s of [-1, 1]) {
    let x = 1.32;
    for (const { r, t } of stack) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 48), plateMat);
      plate.rotation.z = Math.PI / 2;
      plate.position.x = s * (x + t / 2);
      x += t + 0.015;
      bell.add(plate);
    }
    // lime emissive rim rings (torus default faces Z → rotate to face X)
    const rimOuter = new THREE.Mesh(new THREE.TorusGeometry(0.655, 0.016, 12, 72), rimMat);
    rimOuter.rotation.y = Math.PI / 2;
    rimOuter.position.x = s * 1.44;
    bell.add(rimOuter);
    const rimInner = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.013, 12, 64), rimMat);
    rimInner.rotation.y = Math.PI / 2;
    rimInner.position.x = s * (x + 0.005);
    bell.add(rimInner);
    // lime end cap on the bar tip
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 28), rimMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * 1.8;
    bell.add(cap);
  }
  bell.rotation.z = -0.14; // slight compositional tilt

  // ---- ground glow (radial canvas texture, additive) ----
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 256;
  {
    const g = glowCanvas.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(198,243,46,0.30)');
    grad.addColorStop(0.5, 'rgba(198,243,46,0.10)');
    grad.addColorStop(1, 'rgba(198,243,46,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.75;
  scene.add(glow);

  // ---- particle motes ----
  const N = 400;
  const BOUNDS = { x: 5.6, y: 3.2, z: 3.4 };
  const pPos = new Float32Array(N * 3);
  const pCol = new Float32Array(N * 3);
  const pVel = new Float32Array(N * 3);
  const limeC = new THREE.Color(COL.lime);
  const coralC = new THREE.Color(COL.coral);
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = (Math.random() * 2 - 1) * BOUNDS.x;
    pPos[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y;
    pPos[i * 3 + 2] = (Math.random() * 2 - 1) * BOUNDS.z;
    const c = Math.random() < 0.72 ? limeC : coralC;
    const dim = 0.35 + Math.random() * 0.6;
    pCol[i * 3] = c.r * dim;
    pCol[i * 3 + 1] = c.g * dim;
    pCol[i * 3 + 2] = c.b * dim;
    pVel[i * 3] = (Math.random() * 2 - 1) * 0.07;
    pVel[i * 3 + 1] = (Math.random() * 2 - 1) * 0.05;
    pVel[i * 3 + 2] = (Math.random() * 2 - 1) * 0.05;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.05, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  scene.add(points);

  // ---- controls: orbit, no zoom, no pan ----
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.9;
  controls.minPolarAngle = 0.9;
  controls.maxPolarAngle = 2.1;
  controls.target.set(0, 0.15, 0);

  // ---- pointer parallax (rig tilt; controls own the camera) ----
  let px = 0, py = 0, tx = 0, ty = 0;
  mount.addEventListener('pointermove', (e) => {
    const r = mount.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5;
    ty = (e.clientY - r.top) / r.height - 0.5;
  });
  mount.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

  // ---- rep counter sync ----
  const repEl = document.getElementById('repCount');
  const CYCLE = 2.4; // seconds per curl
  let reps = 0;
  let lastRepIndex = 0;

  // ---- visibility: skip rendering when hero is off-screen ----
  let running = true;
  new IntersectionObserver((entries) => { running = entries[0].isIntersecting; }, { threshold: 0 })
    .observe(mount);

  // ---- resize ----
  new ResizeObserver(() => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }).observe(mount);

  // ---- loop ----
  const clock = new THREE.Clock();
  const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  function frame() {
    requestAnimationFrame(frame);
    clock.getDelta(); // keep elapsedTime flowing even when skipped
    if (!running) return;

    const t = clock.elapsedTime;

    if (!REDUCED) {
      // particle drift with wrap
      const posAttr = pGeo.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < N; i++) {
        let x = arr[i * 3] + pVel[i * 3] * 0.016;
        let y = arr[i * 3 + 1] + pVel[i * 3 + 1] * 0.016;
        let z = arr[i * 3 + 2] + pVel[i * 3 + 2] * 0.016;
        if (x > BOUNDS.x) x = -BOUNDS.x; else if (x < -BOUNDS.x) x = BOUNDS.x;
        if (y > BOUNDS.y) y = -BOUNDS.y; else if (y < -BOUNDS.y) y = BOUNDS.y;
        if (z > BOUNDS.z) z = -BOUNDS.z; else if (z < -BOUNDS.z) z = BOUNDS.z;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      posAttr.needsUpdate = true;

      // curl bob: motion in the first half of each 2.4s cycle, rest after
      const c = (t % CYCLE) / CYCLE;
      const p = c < 0.5 ? c / 0.5 : 0;
      const lift = Math.sin(easeInOut(p) * Math.PI);
      bell.position.y = lift * 0.5;
      bell.rotation.x = lift * 0.14;
      rimMat.emissiveIntensity = 1.1 + lift * 1.5;

      // rep ticks at the top of each curl
      const repIndex = Math.floor(t / CYCLE);
      if (c >= 0.25 && repIndex !== lastRepIndex) {
        lastRepIndex = repIndex;
        reps++;
        if (repEl) repEl.textContent = String(reps).padStart(4, '0');
      }

      // parallax ease
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      rig.rotation.y = px * 0.45;
      rig.rotation.x = py * 0.22;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  frame();
}
