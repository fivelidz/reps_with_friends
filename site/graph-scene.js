// RWF site — connections scene: system node graph with pulsing dashed edges.
// Flow direction: dashes march from edge[0] to edge[1] (chat → API → stores).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NODES = [
  { id: 'whatsapp', label: 'WhatsApp', css: '#c6f32e', color: 0xc6f32e, pos: [-3.3, 1.15, 0], r: 0.34 },
  { id: 'slack', label: 'Slack', css: '#6ec1ff', color: 0x6ec1ff, pos: [-3.5, 0, 0.4], r: 0.32 },
  { id: 'messenger', label: 'Messenger', css: '#9aa0a8', color: 0x9aa0a8, pos: [-3.3, -1.15, 0], r: 0.3 },
  { id: 'api', label: 'RWF API', css: '#c6f32e', color: 0xc6f32e, pos: [0, 0.1, 0], r: 0.5 },
  { id: 'core', label: 'game-core', css: '#8fb31c', color: 0x8fb31c, pos: [0, -1.75, 0.2], r: 0.36 },
  { id: 'pg', label: 'Postgres', css: '#9aa0a8', color: 0x9aa0a8, pos: [3.1, 0.85, 0], r: 0.32 },
  { id: 'redis', label: 'Redis', css: '#ffb020', color: 0xffb020, pos: [3.2, -0.75, 0.3], r: 0.3 },
];

// [from, to, pulse speed]
const EDGES = [
  ['whatsapp', 'api', 0.9],
  ['slack', 'api', 0.7],
  ['messenger', 'api', 0.5],
  ['api', 'core', 0.8],
  ['api', 'pg', 0.6],
  ['api', 'redis', 0.65],
];

function makeLabelSprite(text, cssColor) {
  const fs = 34, pad = 26, h = 72;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  g.font = `600 ${fs}px "Space Grotesk", system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  canvas.width = w;
  canvas.height = h;
  // canvas resize resets context state — re-apply
  g.font = `600 ${fs}px "Space Grotesk", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = cssColor;
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  const s = 1 / 110; // world units per px
  sprite.scale.set(w * s, h * s, 1);
  return sprite;
}

export function initGraph(mount) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    console.warn('RWF graph: WebGL unavailable, scene skipped —', err);
    mount.parentElement.style.minHeight = '0';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setClearColor(0x000000, 0); // transparent — sits inside a rwf-card
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'pan-y';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 50
  );
  camera.position.set(0.6, 0.5, 8.4);

  scene.add(new THREE.HemisphereLight(0x2e3440, 0x0a0b0d, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(3, 5, 4);
  scene.add(key);
  const limeLight = new THREE.PointLight(0xc6f32e, 22, 12, 2);
  limeLight.position.set(0, 0.1, 1.6);
  scene.add(limeLight);

  const group = new THREE.Group();
  scene.add(group);

  // ---- nodes ----
  const nodeMeshes = new Map();
  const pulsers = [];
  for (const n of NODES) {
    const mat = new THREE.MeshStandardMaterial({
      color: n.color, emissive: n.color, emissiveIntensity: 0.55,
      roughness: 0.35, metalness: 0.1,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(n.r, 32, 24), mat);
    mesh.position.set(...n.pos);
    group.add(mesh);
    nodeMeshes.set(n.id, mesh);
    pulsers.push({ mat, base: 0.55, phase: Math.random() * Math.PI * 2, amp: 0.16 });
    if (n.id === 'api') {
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.74, 1),
        new THREE.MeshBasicMaterial({ color: 0xc6f32e, wireframe: true, transparent: true, opacity: 0.14 })
      );
      mesh.add(shell);
    }
  }

  // ---- labels (after webfont settles, so canvas uses Space Grotesk) ----
  let labelsAdded = false;
  const addLabels = () => {
    if (labelsAdded) return;
    labelsAdded = true;
    for (const n of NODES) {
      const sprite = makeLabelSprite(n.label, n.css);
      sprite.position.set(n.pos[0], n.pos[1] + n.r + 0.36, n.pos[2]);
      group.add(sprite);
    }
  };
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(addLabels);
  } else {
    addLabels();
  }

  // ---- edges: dashed lines, pulse via lineDistance offset ----
  // (this three build has no material.dashOffset; shifting the lineDistance
  //  attribute moves the dash pattern along the line)
  const flows = [];
  for (const [fromId, toId, speed] of EDGES) {
    const from = nodeMeshes.get(fromId);
    const to = nodeMeshes.get(toId);
    const geo = new THREE.BufferGeometry().setFromPoints([from.position.clone(), to.position.clone()]);
    const mat = new THREE.LineDashedMaterial({
      color: NODES.find((n) => n.id === toId).color,
      dashSize: 0.17, gapSize: 0.11,
      transparent: true, opacity: 0.5,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    group.add(line);
    const attr = geo.attributes.lineDistance;
    flows.push({ attr, base: Float32Array.from(attr.array), offset: Math.random() * 0.3, speed });
  }

  // ---- controls: rotate only ----
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.55;
  controls.minPolarAngle = 1.0;
  controls.maxPolarAngle = 2.15;

  let running = true;
  new IntersectionObserver((entries) => { running = entries[0].isIntersecting; }, { threshold: 0 })
    .observe(mount);

  new ResizeObserver(() => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }).observe(mount);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!running) return;
    const t = clock.elapsedTime;

    if (!REDUCED) {
      // dash pulse: subtracting offset marches dashes from → to
      for (const f of flows) {
        f.offset += dt * f.speed;
        const arr = f.attr.array;
        for (let i = 0; i < arr.length; i++) arr[i] = f.base[i] - f.offset;
        f.attr.needsUpdate = true;
      }
      // gentle emissive breathing per node
      for (const p of pulsers) {
        p.mat.emissiveIntensity = p.base + Math.sin(t * 1.4 + p.phase) * p.amp;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }
  frame();
}
