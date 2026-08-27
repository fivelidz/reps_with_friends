// RWF avatars — stylised mini figures doing exercises, built from primitives.
// Reusable across the site + demo: createAvatar() builds one rig,
// AvatarScene() stages a row of them with render-gating and reduced-motion care.
// Fully procedural (fn(t) rotations) — no animation files, no deps beyond three.
import * as THREE from 'three';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tier identity colours (match design tokens).
export const TIER_COLORS = {
  couch: 0xffb020,   // amber
  casual: 0x6ec1ff,  // sky
  fit: 0xc6f32e,     // lime
  athlete: 0xff5c38, // coral
};

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
// smooth 0→1→0 triangle over one loop — the "down and up" of a rep
const tri = (p) => (p < 0.5 ? easeInOut(p * 2) : easeInOut((1 - p) * 2));

// ── rig dimensions (metres; figure stands ~0.40 tall) ────────────────────────
const D = {
  hipY: 0.160,          // pelvis pivot height (upper+lower leg)
  legUp: 0.085, legUpR: 0.030,
  legLo: 0.075, legLoR: 0.026,
  hipX: 0.034,          // hip pivot lateral offset
  torsoLen: 0.105, torsoR: 0.052,
  shoulderY: 0.118, shoulderX: 0.063,
  armUp: 0.075, armUpR: 0.021,
  armLo: 0.070, armLoR: 0.019,
  handR: 0.023,
  headR: 0.052, headY: 0.200,
};

function capsule(r, len, mat) {
  // CapsuleGeometry axis is Y; total height = len + 2r
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
}

// ── the rig ───────────────────────────────────────────────────────────────────
// root → orient (whole-body pose: upright / prone) → pelvis → torso + hips
// Joints are Groups at the pivot; limb meshes hang off them centred on their
// length, so rotating the Group rotates the limb about its joint.
function buildRig(color) {
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.28,
    roughness: 0.38, metalness: 0.12,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0c0f14, emissive: 0x1a2230, emissiveIntensity: 0.5,
    roughness: 0.18, metalness: 0.55,
  });

  const root = new THREE.Group();
  const orient = new THREE.Group(); // whole-body orientation (standing / prone)
  orient.position.y = D.hipY;
  root.add(orient);
  const pelvis = new THREE.Group();
  orient.add(pelvis);

  // pelvis blob
  const pelvisMesh = capsule(0.040, 0.030, mat);
  pelvisMesh.position.y = 0.008;
  pelvis.add(pelvisMesh);

  // ---- torso + head ----
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = capsule(D.torsoR, D.torsoLen, mat);
  torsoMesh.position.y = D.torsoLen / 2 + 0.012;
  torso.add(torsoMesh);

  const head = new THREE.Group();
  head.position.y = D.headY;
  torso.add(head);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(D.headR, 22, 18), mat);
  head.add(headMesh);
  // visor stripe — a sliver of dark glass across the face. Enough character.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.019, 0.026), visorMat);
  visor.position.set(0, 0.006, D.headR * 0.82);
  head.add(visor);

  // ---- arms: shoulder → upper arm → elbow → lower arm → hand ----
  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * D.shoulderX, D.shoulderY, 0);
    torso.add(shoulder);
    const upper = capsule(D.armUpR, D.armUp, mat);
    upper.position.y = -D.armUp / 2;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -D.armUp;
    shoulder.add(elbow);
    const lower = capsule(D.armLoR, D.armLo, mat);
    lower.position.y = -D.armLo / 2;
    elbow.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(D.handR, 14, 12), mat);
    hand.position.y = -D.armLo;
    elbow.add(hand);
    return { shoulder, elbow };
  }
  const armL = arm(+1); // figure's left (+X)
  const armR = arm(-1);

  // ---- legs: hip → upper leg → knee → lower leg → foot ----
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * D.hipX, -0.012, 0);
    pelvis.add(hip);
    const upper = capsule(D.legUpR, D.legUp, mat);
    upper.position.y = -D.legUp / 2;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -D.legUp;
    hip.add(knee);
    const lower = capsule(D.legLoR, D.legLo, mat);
    lower.position.y = -D.legLo / 2;
    knee.add(lower);
    // foot: small rounded box reaching forward (+Z); points toes-down when prone
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.020, 0.030, 4, 10), mat);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -D.legLo, 0.018);
    knee.add(foot);
    return { hip, knee };
  }
  const legL = leg(+1);
  const legR = leg(-1);

  return {
    root, orient, pelvis, torso, head,
    shoulderL: armL.shoulder, elbowL: armL.elbow,
    shoulderR: armR.shoulder, elbowR: armR.elbow,
    hipL: legL.hip, kneeL: legL.knee,
    hipR: legR.hip, kneeR: legR.knee,
    mat, visorMat,
  };
}

// reset every joint to the neutral standing pose
function neutral(rig) {
  rig.orient.rotation.set(0, 0, 0);
  rig.orient.position.set(0, D.hipY, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  for (const s of [rig.shoulderL, rig.shoulderR]) s.rotation.set(0, 0, 0);
  for (const e of [rig.elbowL, rig.elbowR]) e.rotation.set(0, 0, 0);
  for (const h of [rig.hipL, rig.hipR]) h.rotation.set(0, 0, 0);
  for (const k of [rig.kneeL, rig.kneeR]) k.rotation.set(0, 0, 0);
}

// ── exercises — each fn(rig, p) writes joint angles for phase p ∈ [0,1) ──────
// d = tri(p): eased 0→1→0 — the working half of the rep, then the return.
export const EXERCISES = {
  squat: {
    cycle: 1.5,
    fn(rig, p) {
      const d = tri(p);
      neutral(rig);
      rig.orient.position.y = D.hipY - d * 0.077;      // hips drop, feet stay
      rig.hipL.rotation.x = rig.hipR.rotation.x = -d * 1.45; // thighs swing forward
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = d * 1.75; // knees fold
      rig.torso.rotation.x = d * 0.28;                 // lean into it
      rig.head.rotation.x = -d * 0.18;                 // keep looking ahead
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -d * 1.5; // arms forward
      rig.shoulderL.rotation.z = 0.10 + d * 0.12;
      rig.shoulderR.rotation.z = -0.10 - d * 0.12;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -d * 0.25;
    },
  },

  pushup: {
    cycle: 1.4,
    fn(rig, p) {
      const d = tri(p);
      neutral(rig);
      // prone: face down, head toward +X — Euler XYZ verified for this frame
      rig.orient.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      // elbow angle 0.45 → 1.5 rad; body height = arm reach so hands stay planted
      const bend = 0.45 + d * 1.05;
      const reach = D.armUp + (D.armLo + D.handR) * Math.cos(bend);
      rig.orient.position.set(-0.046, reach, 0);
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -Math.PI / 2 + d * 0.35;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = bend;
      rig.torso.rotation.x = -0.06;                    // hold the plank straight
      rig.head.rotation.x = 0.55;                      // look up slightly
      rig.hipL.rotation.z = 0.10; rig.hipR.rotation.z = -0.10; // narrow stance
    },
  },

  jumpingjack: {
    cycle: 1.3,
    fn(rig, p) {
      const d = tri(p);
      neutral(rig);
      const hop = Math.pow(Math.abs(Math.sin(p * Math.PI * 2)), 3) * 0.028;
      rig.orient.position.y = D.hipY + hop;
      rig.shoulderL.rotation.z = 0.10 + d * 2.80;      // arms sweep out and overhead
      rig.shoulderR.rotation.z = -0.10 - d * 2.80;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.08;
      rig.hipL.rotation.z = d * 0.42;                  // legs apart
      rig.hipR.rotation.z = -d * 0.42;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = 0.06 + (1 - d) * 0.10;
    },
  },

  curl: {
    cycle: 1.6,
    fn(rig, p) {
      const d = tri(p);
      neutral(rig);
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.12 - d * 1.95; // forearms curl up
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -d * 0.22;  // slight swing
      rig.shoulderL.rotation.z = 0.13 + d * 0.10;
      rig.shoulderR.rotation.z = -0.13 - d * 0.10;
      rig.torso.rotation.x = -d * 0.05;                // tiny lean back
      rig.orient.position.y = D.hipY - d * 0.008;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = 0.08 + d * 0.05;    // soft knees
    },
  },
};

// ── createAvatar ──────────────────────────────────────────────────────────────
// opts: { tier | color, exercise='squat', cycle (override), scale=1, onRep }
// Returns { group, setExercise(name), update(dt), pose(p), reset(), dispose() }
export function createAvatar(opts = {}) {
  const color = opts.color ?? TIER_COLORS[opts.tier] ?? TIER_COLORS.fit;
  const rig = buildRig(color);
  if (opts.scale) rig.root.scale.setScalar(opts.scale);

  let exercise = EXERCISES[opts.exercise] ?? EXERCISES.squat;
  let cycle = opts.cycle ?? exercise.cycle;
  let phase = 0;
  let reps = 0;

  const api = {
    group: rig.root,
    get exercise() { return exercise; },
    get cycle() { return cycle; },
    get reps() { return reps; },

    setExercise(name, cycleOverride) {
      const ex = EXERCISES[name];
      if (!ex) return false;
      exercise = ex;
      cycle = cycleOverride ?? opts.cycle ?? ex.cycle;
      phase = 0;
      exercise.fn(rig, 0);
      return true;
    },

    // advance the loop; fires onRep once per completed cycle
    update(dt) {
      phase += dt;
      if (phase >= cycle) {
        phase %= cycle;
        reps++;
        if (typeof opts.onRep === 'function') opts.onRep(reps, api);
      }
      exercise.fn(rig, phase / cycle);
    },

    // hold a static phase (reduced motion / frozen previews)
    pose(p = 0.3) {
      phase = p * cycle;
      exercise.fn(rig, p);
    },

    reset() {
      reps = 0;
      phase = 0;
      exercise.fn(rig, 0);
    },

    dispose() {
      rig.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      rig.mat.dispose();
      rig.visorMat.dispose();
    },
  };

  exercise.fn(rig, 0);
  return api;
}

// ── AvatarScene — stage a row of avatars on one shared renderer ───────────────
// opts: {
//   mount, avatars: [{ tier|color, exercise, cycle, onRep, scale }],
//   spacing = 0.62, fov = 33, ground = true, alpha = true, bg (hex → fog too),
//   camY = 0.46, targetY = 0.19, zMin = 0.9, zMax = 4.4,
// }
// Methods: start(), freeze(), resume(), reset(), dispose(). Frozen keeps the
// last frame on the canvas (WebGL preserves it) — that's the demo's pause.
export class AvatarScene {
  constructor(opts) {
    const o = {
      spacing: 0.62, fov: 33, ground: true, alpha: true,
      camY: 0.46, targetY: 0.19, zMin: 0.9, zMax: 4.4, ...opts,
    };
    this.mount = o.mount;
    this.opts = o;
    this.frozen = false;
    this.visible = true;
    this.disposed = false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: o.alpha });
    } catch (err) {
      console.warn('RWF avatars: WebGL unavailable, scene skipped —', err);
      if (this.mount && this.mount.parentElement) this.mount.parentElement.style.minHeight = '0';
      this.dead = true;
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(this.mount.clientWidth || 300, this.mount.clientHeight || 200);
    if (o.alpha) renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    this.mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';

    this.scene = new THREE.Scene();
    if (!o.alpha) {
      this.scene.background = new THREE.Color(o.bg ?? 0x0a0b0d);
      this.scene.fog = new THREE.Fog(o.bg ?? 0x0a0b0d, 4, 10);
    }

    // camera fitted on first frame + resize (see _fit)
    this.camera = new THREE.PerspectiveCamera(
      o.fov, (this.mount.clientWidth || 1) / Math.max(this.mount.clientHeight || 1, 1), 0.05, 40
    );

    // lights — hero-scene tone: cool hemisphere, white key, lime + coral accents
    this.scene.add(new THREE.HemisphereLight(0x2a3038, 0x0a0b0d, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4, 3.5);
    this.scene.add(key);
    const lime = new THREE.PointLight(0xc6f32e, 7, 8, 2);
    lime.position.set(-1.6, 0.5, 1.6);
    this.scene.add(lime);
    const coral = new THREE.PointLight(0xff5c38, 5, 8, 2);
    coral.position.set(1.8, 0.7, 1.2);
    this.scene.add(coral);

    // avatars in a centred row
    this.avatars = [];
    const list = o.avatars || [];
    const n = list.length;
    this.rowHalf = Math.max(n * o.spacing, 1) / 2;
    list.forEach((cfg, i) => {
      const av = createAvatar(cfg);
      av.group.position.x = (i - (n - 1) / 2) * o.spacing;
      this.scene.add(av.group);
      this.avatars.push(av);
    });

    // subtle ground: dark disc + faint ring + one soft glow wash
    if (o.ground && n) {
      const gr = this.rowHalf + 0.42;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(gr, 48),
        new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.9, metalness: 0 })
      );
      disc.rotation.x = -Math.PI / 2;
      this.scene.add(disc);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(gr - 0.035, gr, 64),
        new THREE.MeshBasicMaterial({ color: 0x3a4048, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      this.scene.add(ring);
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = glowCanvas.height = 128;
      const g = glowCanvas.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(198,243,46,0.10)');
      grad.addColorStop(1, 'rgba(198,243,46,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      glowTex.colorSpace = THREE.SRGBColorSpace;
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(gr * 2.6, gr * 2.6),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.002;
      this.scene.add(glow);
    }

    // render-gating: only draw while on screen (hero-scene pattern)
    this._io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible && !this.frozen) this._renderOnce(); // refresh after off-screen
    }, { threshold: 0 });
    this._io.observe(this.mount);

    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this.mount);

    this.clock = new THREE.Clock();
    this._raf = 0;
    this._fit();
    if (REDUCED) this.avatars.forEach((a) => a.pose(0.3));
    this._renderOnce();
  }

  // camera distance so the row spans the width. halfW = n·spacing/2 exactly:
  // that places avatar i at horizontal fraction (i+0.5)/n — matching an
  // n-column HTML overlay (rep counters / name labels) cell for cell.
  _fit() {
    if (this.dead || this.disposed) return;
    const w = this.mount.clientWidth, h = this.mount.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    const halfW = this.rowHalf;
    const z = THREE.MathUtils.clamp(
      halfW / (Math.tan(THREE.MathUtils.degToRad(this.opts.fov / 2)) * this.camera.aspect),
      this.opts.zMin, this.opts.zMax
    );
    this.camera.position.set(0, this.opts.camY, z);
    this.camera.lookAt(0, this.opts.targetY, 0);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.frozen || REDUCED) this._renderOnce();
  }

  _renderOnce() {
    if (this.dead || this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.dead || this.disposed || this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this.visible || this.frozen) return; // keep clock flowing, skip work
      if (!REDUCED) {
        for (const av of this.avatars) av.update(dt);
      }
      this._renderOnce();
    };
    loop();
  }

  freeze() { this.frozen = true; }        // demo pause — canvas keeps last frame
  resume() { this.frozen = false; this._renderOnce(); }
  reset() { this.avatars.forEach((a) => a.reset()); this._renderOnce(); }

  setExercise(i, name) { this.avatars[i]?.setExercise(name); }

  dispose() {
    if (this.disposed || this.dead) { this.disposed = true; return; }
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._io.disconnect();
    this._ro.disconnect();
    for (const av of this.avatars) av.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
