/**
 * avatars.js — public avatar API.
 *
 * As of the style exploration this file is a THIN FACADE. All the real work
 * moved to:
 *   site/avatar-styles/rig-core.js   skeleton, proportion solver, IK, exercises
 *   site/avatar-styles/<style>.js    per-style proportion ratios + meshes
 *   site/avatar-styles/index.js      the registry
 *
 * The exported surface is unchanged, so /, /demo and the studio keep working
 * without edits: createAvatar(cfg) returns the same object shape it always did,
 * and AvatarScene stages a row of them on one renderer exactly as before.
 *
 * The one addition is `style`: any config may now carry a style id
 * ('athletic' | 'lowpoly' | 'blocky' | 'chibi' | 'minimal'). Omit it and you
 * get DEFAULT_STYLE.
 *
 * The previous monolithic implementation is preserved at
 * site/archive/avatars_20260827_prestyles.js.
 */

import * as THREE from 'three';
import { STYLES, STYLE_IDS, STYLE_LIST, getStyle, styleSummary } from './avatar-styles/index.js';
import {
  makeAvatar, normalizeAvatarConfig as _normalize, avatarConfigFromSeed as _fromSeed,
  EXERCISES, EXERCISE_NAMES, AVATAR_DEFAULTS, BUILDS, HAIR_STYLES, ACCESSORIES,
  SKIN_TONES, OUTFIT_COLORS, HAIR_COLORS, TIER_COLORS, TIER_ACCENTS,
  REDUCED, clamp,
} from './avatar-styles/rig-core.js';

export {
  EXERCISES, EXERCISE_NAMES, AVATAR_DEFAULTS, BUILDS, HAIR_STYLES, ACCESSORIES,
  SKIN_TONES, OUTFIT_COLORS, HAIR_COLORS, TIER_COLORS, TIER_ACCENTS,
  STYLES, STYLE_IDS, STYLE_LIST, getStyle, styleSummary,
};

/**
 * Which style the shipping surfaces (site squad strip, /demo) use.
 *
 * Currently ATHLETIC: it's the only one that can sit next to the product's
 * "real workouts, real people" copy without undercutting it, and it's the style
 * the proportion rules were written against. Change this one constant to
 * re-skin the whole product once the founder picks a direction.
 */
export const DEFAULT_STYLE = 'athletic';

export function normalizeAvatarConfig(opts = {}) {
  return _normalize({ style: DEFAULT_STYLE, ...opts }, STYLE_IDS);
}
export function avatarConfigFromSeed(seed, overrides = {}) {
  return _fromSeed(seed, { style: DEFAULT_STYLE, ...overrides }, STYLE_IDS);
}
export function randomAvatarConfig(overrides = {}) {
  return avatarConfigFromSeed(Math.floor(Math.random() * 0xffffffff), overrides);
}

/**
 * Build one avatar.
 *
 * @param {object} opts — any subset of AVATAR_DEFAULTS (plus `style`), and
 *                        `onRep(reps, api)`.
 * @returns {{
 *   group: THREE.Group, config: object, dims: object, styleId: string,
 *   setExercise(name, cycle?): boolean, setColors(partial): void,
 *   update(dt): void, pose(p?): void, reset(): void, dispose(): void,
 *   toJSON(): object,
 * }}
 */
export function createAvatar(opts = {}) {
  const style = getStyle(opts.style ?? DEFAULT_STYLE);
  return makeAvatar(style, opts, STYLE_IDS);
}

// ── AvatarScene ──────────────────────────────────────────────────────────────
/**
 * Stage a row of avatars on ONE shared renderer — the gallery puts five styles
 * side by side this way, and it's why five characters cost roughly one
 * character's worth of GL state.
 *
 * opts: {
 *   mount, avatars: [config…],
 *   spacing = 0.62, fov = 33, ground = true, alpha = true, bg,
 *   camY = 0.46, targetY = 0.19, zMin = 0.9, zMax = 4.4,
 *   orbit = false, speed = 1,
 *   frameAll = false,   // fit the camera to the row's real bounds (gallery)
 * }
 */
export class AvatarScene {
  constructor(opts) {
    const o = {
      spacing: 0.62, fov: 33, ground: true, alpha: true,
      camY: 0.46, targetY: 0.19, zMin: 0.9, zMax: 4.4,
      orbit: false, speed: 1, frameAll: false, ...opts,
    };
    this.mount = o.mount;
    this.opts = o;
    this.speed = o.speed;
    this.frozen = false;
    this.visible = true;
    this.disposed = false;
    this.renderMs = 0;

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
    // Toon banding is the whole look for two of the styles — ACES would smear
    // the steps back into a gradient, so tone mapping is off and exposure lives
    // in the light rig.
    renderer.toneMapping = THREE.NoToneMapping;
    this.mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';

    this.scene = new THREE.Scene();
    if (!o.alpha) {
      this.scene.background = new THREE.Color(o.bg ?? 0x0a0b0d);
      this.scene.fog = new THREE.Fog(o.bg ?? 0x0a0b0d, 4, 10);
    }

    this.camera = new THREE.PerspectiveCamera(
      o.fov, (this.mount.clientWidth || 1) / Math.max(this.mount.clientHeight || 1, 1), 0.05, 40
    );

    // Toon/standard light rig: a cool hemisphere fill that keeps shadowed sides
    // off black, one warm key for the band break, two coloured rims from behind
    // so the silhouette separates from a dark card. The low-poly and minimal
    // styles use MeshStandardMaterial, which needs the same rig to read.
    this.scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x1b1f26, 1.15));
    const key = new THREE.DirectionalLight(0xfff3e2, 2.05);
    key.position.set(2.4, 3.6, 2.8);
    this.scene.add(key);
    const rimA = new THREE.DirectionalLight(0xc6f32e, 1.35);
    rimA.position.set(-3.2, 1.4, -2.2);
    this.scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0xff5c38, 0.95);
    rimB.position.set(3.0, 0.9, -2.6);
    this.scene.add(rimB);

    this.avatars = [];
    this.configs = [];
    const list = o.avatars || [];
    const n = list.length;
    this.rowHalf = Math.max(n * o.spacing, 1) / 2;
    list.forEach((cfg, i) => this._mountAvatar(cfg, i, n));

    if (o.ground && n) this._buildGround(this.rowHalf + 0.42);
    if (o.orbit) this._initOrbit();

    // render-gating: only draw while on screen
    this._io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible && !this.frozen) this._renderOnce();
    }, { threshold: 0 });
    this._io.observe(this.mount);

    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this.mount);

    this.clock = new THREE.Clock();
    this._raf = 0;
    this._fit();
    if (REDUCED) this.avatars.forEach((a) => a.pose(0.34));
    this._renderOnce();
  }

  _mountAvatar(cfg, i, n) {
    const av = createAvatar(cfg);
    av.group.position.x = (i - (n - 1) / 2) * this.opts.spacing;
    this.scene.add(av.group);
    this.avatars[i] = av;
    this.configs[i] = av.config;
    if (REDUCED) av.pose(0.34);
    return av;
  }

  _buildGround(gr) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(gr, 48), new THREE.MeshBasicMaterial({ color: 0x14171d })
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
    glow.position.y = 0.0005;
    this.scene.add(glow);
  }

  // Orbit is opt-in and lazy so the site/demo bundles never pay for it.
  _initOrbit() {
    import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
      if (this.disposed || this.dead) return;
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.enablePan = false;
      c.minDistance = 0.20;
      c.maxDistance = 3.0;
      c.maxPolarAngle = Math.PI * 0.52;
      // Seat on the measured framing if _fit() already computed one.
      const p = this._pendingOrbit;
      c.target.set(p ? p.targetX : 0, p ? p.targetY : this.opts.targetY, 0);
      if (p) { this.camera.position.set(p.targetX, p.camY, p.z); this._orbitAppliedZ = p.z; }
      c.update();
      this.controls = c;
      this._renderOnce();
    }).catch((err) => console.warn('RWF avatars: orbit controls unavailable —', err));
  }

  /**
   * Swap one avatar's configuration. Geometry depends on style/build/height/
   * hair/accessory, so anything structural rebuilds — but pure colour changes
   * route to setColors() and skip it entirely, which is what lets the studio's
   * colour pickers be live-dragged.
   */
  setAvatarConfig(i, cfg) {
    if (this.dead || this.disposed) return null;
    const old = this.avatars[i];
    if (!old) return null;
    const next = normalizeAvatarConfig({ ...old.config, ...cfg });
    const structural = ['style', 'build', 'height', 'hair', 'accessory', 'scale'];
    if (structural.every((k) => next[k] === old.config[k])) {
      old.setColors(next);
      if (next.exercise !== old.config.exercise) {
        old.setExercise(next.exercise, next.cycle ?? undefined);
        // A push-up's bounding box is nothing like a squat's — re-measure.
        this._frame = null; this._orbitAppliedZ = null; this._fit();
      } else if (next.cycle != null && next.cycle !== old.cycle) old.setCycle(next.cycle);
      if (this.frozen || REDUCED) { old.pose(0.34); this._renderOnce(); }
      return old;
    }
    const n = this.avatars.length;
    this.scene.remove(old.group);
    old.dispose();
    const av = this._mountAvatar(next, i, n);
    // Geometry changed, so the cached framing box is stale — drop it and re-fit
    // rather than letting a taller/shorter figure drift out of frame.
    this._frame = null;
    this._fit();
    this._renderOnce();
    return av;
  }

  setExercise(i, name) {
    this.avatars[i]?.setExercise(name);
    this._frame = null; this._orbitAppliedZ = null; this._fit();
  }
  setExerciseAll(name) {
    for (const a of this.avatars) a.setExercise(name);
    this._frame = null; this._orbitAppliedZ = null; this._fit();
  }
  setSpeed(x) { this.speed = clamp(Number(x) || 1, 0.1, 4); }

  /** Freeze every avatar at one phase — used to screenshot a mid-rep frame. */
  poseAll(p = 0.5) {
    for (const a of this.avatars) a.pose(p);
    this._renderOnce();
  }

  /**
   * Measure the framing box ONCE, from the standing pose.
   *
   * Hardcoded camera distances were cropping the blocky and chibi heads while
   * leaving the taller styles small and adrift — a per-style magic number can't
   * track five different silhouettes plus hair plus a cap peak. So instead we
   * measure the real world-space bounds.
   *
   * Two deliberate choices:
   *  • Measured while STANDING, then cached. A push-up's bounding box is short
   *    and wide; re-fitting per pose would make the camera lurch every time the
   *    exercise changed, which destroys the comparison.
   *  • The extent is squared off — max(width, height) on both axes — because a
   *    push-up rotates the figure through 90°, so the standing HEIGHT becomes
   *    the horizontal extent. Framing for the larger of the two means no pose
   *    can escape the frame.
   */
  /**
   * Measure the framing box by SAMPLING THE WHOLE REP, then cache it.
   *
   * Three things this has to get right, each learned from a broken render:
   *  • Sample several phases, not just pose(0). A squat's lowest frame and a
   *    push-up's bottom are nowhere near the rest pose; framing on one phase
   *    clipped the figure mid-rep.
   *  • Hide the contact shadow first. It's a flat quad ≈7× the torso radius
   *    across and completely dominates the width if you leave it in.
   *  • Return a CENTRE on both axes. The push-up lays the body out along +X
   *    from the toes, so a frame centred on x=0 pushes it off the right-hand
   *    edge — which is exactly what the first screenshot showed.
   *
   * Cached, and invalidated whenever geometry or exercise changes, so the
   * camera is stable during a rep instead of breathing with the animation.
   */
  _measureFrame() {
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const PHASES = [0, 0.2, 0.35, 0.5, 0.65, 0.85];
    const hidden = [];
    for (const av of this.avatars) {
      const shadow = av.rig?.shadow;
      if (shadow) { hidden.push([shadow, shadow.visible]); shadow.visible = false; }
    }
    for (const av of this.avatars) {
      for (const p of PHASES) {
        av.pose(p);
        av.group.updateMatrixWorld(true);
        tmp.setFromObject(av.group);
        box.union(tmp);
      }
    }
    for (const [s, v] of hidden) s.visible = v;
    if (box.isEmpty()) return null;

    const size = new THREE.Vector3(), c = new THREE.Vector3();
    box.getSize(size); box.getCenter(c);
    // A prone pose is wide and flat, so its box is nothing like a standing
    // one's. Fit the ACTUAL box on both axes rather than squaring it off — a
    // squared frame left the push-up as a small strip with two-thirds of the
    // card empty above it.
    return {
      halfW: Math.max(size.x, 1e-3) / 2,
      halfH: Math.max(size.y, 1e-3) / 2,
      centreX: c.x, centreY: c.y,
      figH: Math.max(size.y, 1e-3),
      // Ground plane sits at y=0; keep it in shot so contact still reads.
      minY: box.min.y,
    };
  }

  /**
   * Shift each avatar so its POSE sits centred on its column slot.
   *
   * A standing figure is centred on its own origin, but the push-up lays the
   * body out along +X from the toes, so it drifted right and the last avatar in
   * a row got clipped. Measuring the pose's own centre and subtracting it fixes
   * every current and future asymmetric pose without special-casing any of them.
   * Column centres are untouched, so HTML overlays stay aligned.
   */
  _centreInColumns() {
    const n = this.avatars.length;
    const box = new THREE.Box3();
    for (let i = 0; i < n; i++) {
      const av = this.avatars[i];
      const slot = (i - (n - 1) / 2) * this.opts.spacing;
      const key = `${av.config.exercise}|${av.config.style}|${av.config.build}|${av.config.height}`;
      if (av._colKey !== key) {
        const shadow = av.rig?.shadow;
        const vis = shadow ? shadow.visible : false;
        if (shadow) shadow.visible = false;
        av.group.position.x = 0;
        let lo = Infinity, hi = -Infinity;
        for (const p of [0, 0.25, 0.5, 0.75]) {
          av.pose(p);
          av.group.updateMatrixWorld(true);
          box.setFromObject(av.group);
          lo = Math.min(lo, box.min.x); hi = Math.max(hi, box.max.x);
        }
        if (shadow) shadow.visible = vis;
        av._colOffset = Number.isFinite(lo) ? -(lo + hi) / 2 : 0;
        av._colKey = key;
      }
      av.group.position.x = slot + (av._colOffset ?? 0);
    }
  }

  _fit() {
    if (this.dead || this.disposed) return;
    const w = this.mount.clientWidth, h = this.mount.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.opts.fov / 2));

    let z, targetY = this.opts.targetY, camY = this.opts.camY, targetX = 0;

    if (this.opts.frameAll && this.avatars.length) {
      if (!this._frame) this._frame = this._measureFrame();
      const f = this._frame;
      if (f) {
        const margin = this.opts.frameMargin ?? 1.16;
        // The camera looks slightly DOWN at the figure, so a prone pose's
        // apparent height is more than its bounding-box height — foreshortening
        // adds the body's depth along the view ray. Give a flat pose extra
        // vertical allowance, or the push-up crops at the near edge.
        const flatness = clamp(f.halfW / Math.max(f.halfH, 1e-4), 1, 4);
        const vAllow = f.halfH * (1 + (flatness - 1) * 0.32);
        // Distance that fits the box VERTICALLY, and the one that fits it
        // HORIZONTALLY; take the larger so neither axis clips.
        const zV = (vAllow * margin) / tanHalf;
        const zH = (f.halfW * margin) / (tanHalf * this.camera.aspect);
        z = Math.max(zV, zH);
        targetX = f.centreX;
        targetY = f.centreY;
        // Lift the camera in proportion to the FRAMED size, not the figure's
        // own height — on a prone pose the latter is tiny and the camera ends
        // up at floor level, which reads as a worm's-eye view.
        camY = f.centreY + Math.max(f.halfH, f.halfW * 0.22) * (this.opts.camLift ?? 0.55);
      }
    }

    if (z == null) {
      // Row path: halfW = n·spacing/2 exactly, which places avatar i at
      // horizontal fraction (i+0.5)/n — matching an n-column HTML overlay cell
      // for cell. The site's squad strip depends on that alignment, so the
      // COLUMN geometry is never touched here.
      //
      // But a prone avatar (push-up) extends along +X well past its column and
      // was being clipped at the row's edge. Nudge each avatar's own x so its
      // pose is centred inside its column — the column centres, and therefore
      // the overlay alignment, are unchanged.
      this._centreInColumns();
      z = THREE.MathUtils.clamp(this.rowHalf / (tanHalf * this.camera.aspect), this.opts.zMin, this.opts.zMax);
    }

    if (!this.controls) {
      this.camera.position.set(targetX, camY, z);
      this.camera.lookAt(targetX, targetY, 0);
      this._pendingOrbit = { camY, targetY, targetX, z };
    } else if (this._pendingOrbit && this._pendingOrbit.z !== this._orbitAppliedZ) {
      // Orbit loads lazily and geometry can change under it (style swap).
      // Re-seat on the newly measured framing, but ONLY when it actually
      // changed — otherwise every resize would yank the user's view.
      this.camera.position.set(targetX, camY, z);
      this.controls.target.set(targetX, targetY, 0);
      this.controls.update();
      this._orbitAppliedZ = z;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.frozen || REDUCED) this._renderOnce();
  }

  _renderOnce() {
    if (this.dead || this.disposed) return;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    // exponential moving average — one slow first frame shouldn't dominate
    this.renderMs = this.renderMs ? this.renderMs * 0.9 + ms * 0.1 : ms;
  }

  start() {
    if (this.dead || this.disposed || this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this.visible || this.frozen) return;   // keep clock flowing, skip work
      if (this.controls) this.controls.update();
      if (!REDUCED) {
        const scaled = dt * this.speed;
        for (const av of this.avatars) av.update(scaled);
      }
      this._renderOnce();
    };
    loop();
  }

  freeze() { this.frozen = true; }
  resume() { this.frozen = false; this._renderOnce(); }
  reset() { this.avatars.forEach((a) => a.reset()); this._renderOnce(); }

  toJSON() { return this.avatars.map((a) => a.toJSON()); }

  dispose() {
    if (this.disposed || this.dead) { this.disposed = true; return; }
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._io.disconnect();
    this._ro.disconnect();
    this.controls?.dispose();
    for (const av of this.avatars) av.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
