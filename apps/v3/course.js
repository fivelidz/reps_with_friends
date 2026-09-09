/* ═══════════════════════════════════════════════════════════════════════
   RWF · V3 — course.js · THE 3D BATTLE COURSE
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder's original pitch, made literal: "a 3D representation and
   game-like model to represent avatars moving over a course to
   represent reps progress and the powerups held by a player."

   What lives here
   ───────────────
   Course3D — one lazy WebGL context that renders:
     · THE COURSE   a stylised running track — one lane per player,
                    tier-coloured, distance markers every 25% — in a
                    low-poly world (grass, trees, hills, sky gradient,
                    gentle fog)
     · RUNNERS      Geno avatars (site/model-avatars.js) driven by REAL
                    Soldier mocap (GENO_CLIPS walk/run/idle — the
                    founder's preferred animation), tier-tinted. Reps
                    logged → the runner lerps forward along its lane.
                    Comeback-armed → gold lightning ring at the feet;
                    lightning live → gold trail behind the runner;
                    shielded → blue shell.
     · POWER-UPS    billboard card-sprites (canvas textures: name +
                    icon + rarity) floating + bobbing over each runner.
                    Playing one: the card flies up and BURSTS.
     · CHARITY POT  a trophy pedestal just past the finish — chip
                    stacks (gold/blue/red/white by denomination, engine
                    chipMix) grow with every contribution.
     · PODIUM       the result arrangement — blocks 2·1·3 with the
                    avatars on top, slow orbit.

   Cameras: FOLLOW-LEADER (cinematic, default) or ORBIT (drag to orbit /
   pinch to zoom — OrbitControls). Toggle from the HUD.

   Perf contract (phone-first):
     · LAZY context — the renderer exists only while a 3D screen is
       mounted; leaving the route disposes it (forceContextLoss) so the
       app never holds a WebGL context on 2D screens
     · idle render-gate — reduced-motion users get renders ONLY when
       something actually changed (dirty flag); motion users get the
       rAF loop gated on document.visibilityState
     · pixelRatio capped at 2
     · placeholder capsules run instantly; Geno + mocap stream in
       behind a "RUNNERS WARMING UP" veil (Soldier.glb is cached once,
       all runners retarget from the same clips)
     · no shadow maps — cheap blob-contact shadows under the runners
   ═══════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ── course geometry constants (world units ≈ metres) ─────────────────── */
export const COURSE_LEN = 28;   // start line → finish line (table-top footprint
                                 // for the oblique POV — the whole course reads
                                 // like a board game on a table, figures sized
                                 // like game pieces at the TABLE camera)
export const LANE_W = 2.1;      // lane width — board-game lane spacing
export const START_Z = 3;       // start line z (runners run toward −Z)
export const FINISH_Z = START_Z - COURSE_LEN;
export const POT_Z = FINISH_Z - 5.5; // charity pot pedestal, past the finish
const RUNNER_H = 1.75;          // normalised avatar height

/* ── the POV rig ────────────────────────────────────────────────────────
   The founder's ask: "a 3d map view that looks more top down on the
   figures … like they are on a table like a board game, or we are viewing
   them from high in a stadium. perspective oblique third person."
   TABLE   — the default: ~57.5° down, TRUE perspective (not orthographic),
             the whole course framed like a board on a table, gentle drift,
             drag-to-pan + pinch/wheel zoom
   STADIUM — higher + wider, slow orbital sweep (the spectacle view)
   FOLLOW  — the leader cam (kept)
   PODIUM  — result screen (orbit) */
const CAM_EL_TABLE = THREE.MathUtils.degToRad(57.5); // down-angle, 50–65° band
const CAM_YAW = THREE.MathUtils.degToRad(20);        // diagonal board-game composition
const CAM_EL_STADIUM = THREE.MathUtils.degToRad(68); // higher, wider
const CAM_SWEEP = 0.045;                             // rad/s — slow orbital sweep
const CAM_FIT_MARGIN = 1.1;                          // breathing room around the frame

const TRACK_TOP = 0.02;         // running surface y
const TRACK_H = 0.14;

/* deterministic scatter (the world must look identical every visit) */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── shared small textures ────────────────────────────────────────────── */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

let _confettiTex = null;
function confettiTexture() {
  if (_confettiTex) return _confettiTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(4, 4, 24, 24);
  _confettiTex = new THREE.CanvasTexture(c);
  _confettiTex.colorSpace = THREE.SRGBColorSpace;
  return _confettiTex;
}

let _crownTex = null;
function crownTexture() {
  if (_crownTex) return _crownTex;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d");
  g.shadowColor = "rgba(255,201,65,0.9)";
  g.shadowBlur = 14;
  g.fillStyle = "#ffc941";
  g.strokeStyle = "#271b04";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(12, 64);
  g.lineTo(20, 30);
  g.lineTo(38, 50);
  g.lineTo(48, 22);
  g.lineTo(58, 50);
  g.lineTo(76, 30);
  g.lineTo(84, 64);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = "#fff2a8";
  g.fillRect(20, 66, 56, 9);
  _crownTex = new THREE.CanvasTexture(c);
  _crownTex.colorSpace = THREE.SRGBColorSpace;
  return _crownTex;
}

function laneStripeTexture(hex, idx) {
  const c = document.createElement("canvas");
  c.width = 96; c.height = 512;
  const g = c.getContext("2d");
  const col = new THREE.Color(hex);
  const deep = `#${col.clone().multiplyScalar(0.24).getHexString()}`;
  const mid = `#${col.clone().multiplyScalar(0.46).lerp(new THREE.Color(0x33383f), 0.34).getHexString()}`;
  const hot = `#${col.clone().multiplyScalar(0.95).getHexString()}`;
  const grad = g.createLinearGradient(0, 0, 96, 0);
  grad.addColorStop(0, deep);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, deep);
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 512);
  g.fillStyle = "rgba(255,255,255,0.10)";
  for (let y = -80 + idx * 17; y < 560; y += 118) {
    g.save();
    g.translate(48, y);
    g.rotate(-0.32);
    g.fillRect(-70, -7, 140, 14);
    g.restore();
  }
  g.fillStyle = hot;
  g.globalAlpha = 0.36;
  g.fillRect(8, 0, 3, 512);
  g.fillRect(85, 0, 3, 512);
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3.2);
  tex.anisotropy = 4;
  return tex;
}

/** rounded-rect card face texture for the power-up billboards */
function cardTexture(name, glyph, rarHex) {
  const W = 256, H = 352;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const rr = (x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  // face
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#30343e");
  grad.addColorStop(0.38, "#1b2028");
  grad.addColorStop(1, "#0b0d12");
  g.fillStyle = grad;
  rr(6, 6, W - 12, H - 12, 26); g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(255,255,255,0.09)";
  g.lineWidth = 3;
  for (let y = -H; y < H * 1.4; y += 28) {
    g.beginPath();
    g.moveTo(-20, y);
    g.lineTo(W + 20, y + W * 0.45);
    g.stroke();
  }
  g.restore();
  g.shadowColor = rarHex;
  g.shadowBlur = 18;
  g.lineWidth = 8; g.strokeStyle = rarHex; g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.32)"; g.stroke();
  // rarity strip
  g.fillStyle = rarHex;
  rr(22, 24, 86, 30, 8); g.fill();
  g.fillStyle = "#0b0c0e";
  g.font = "700 19px ui-monospace, monospace";
  g.fillText(name.length > 12 ? "CARD" : rarHex === "#ffc941" ? "LEGENDARY" : rarHex === "#b78cff" ? "EPIC" : rarHex === "#6ec1ff" ? "RARE" : "COMMON", 32, 45);
  // icon glyph
  g.font = "400 128px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = rarHex;
  g.shadowBlur = 20;
  g.fillStyle = rarHex;
  g.fillText(glyph, W / 2, H * 0.48);
  g.shadowBlur = 0;
  // name
  g.font = "700 30px system-ui, sans-serif";
  g.fillStyle = "#e8eaed";
  g.fillText(name.toUpperCase(), W / 2, H - 96, W - 44);
  // RUF cost strip
  g.font = "700 20px ui-monospace, monospace";
  g.fillStyle = "#9aa0a8";
  g.fillText("◈ PLAY", W / 2, H - 48, W - 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

/** painted lane number — decal lying ON the track surface (board-game lane) */
function laneNumTexture(num, hex) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");
  g.clearRect(0, 0, S, S);
  g.font = `800 ${S * 0.62}px ui-monospace, monospace`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 14; g.strokeStyle = "rgba(6,7,9,0.78)";
  g.strokeText(String(num), S / 2, S / 2 + 4);
  g.fillStyle = hex;
  g.fillText(String(num), S / 2, S / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** small floating text label (distance markers, name tags, pot label) */
function labelTexture(lines, { fg = "#e8eaed", bg = "rgba(10,11,13,0.72)", accent = null, font = 700 } = {}) {
  const W = 320, H = 40 * lines.length + 18;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  const r = 14, w = W - 8, h = H - 8;
  g.beginPath();
  g.moveTo(4 + r, 4);
  g.arcTo(4 + w, 4, 4 + w, 4 + h, r);
  g.arcTo(4 + w, 4 + h, 4, 4 + h, r);
  g.arcTo(4, 4 + h, 4, 4, r);
  g.arcTo(4, 4, 4 + w, 4, r);
  g.closePath(); g.fill();
  if (accent) { g.strokeStyle = accent; g.lineWidth = 3; g.stroke(); }
  g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((ln, i) => {
    g.fillStyle = i === 0 ? fg : "#9aa0a8";
    g.font = `${i === 0 ? font : 500} ${i === 0 ? 24 : 20}px ui-monospace, monospace`;
    g.fillText(ln, W / 2, 16 + 40 * i + (i ? 2 : 0), W - 30);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ═══════════════════════════════════════════════════════════════════════
   Course3D
   ═══════════════════════════════════════════════════════════════════ */
export class Course3D {
  /**
   * @param {HTMLElement} host  element the canvas mounts into
   * @param {object} opts
   *   tierHex(tier, isYou) → colour string for lane / tint / tag
   *   rarHex(rarity)       → rarity colour for billboard cards
   *   reducedMotion        → static course (no mocap drive, render on change)
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.tierHex = opts.tierHex ?? (() => "#c6f32e");
    this.rarHex = opts.rarHex ?? (() => "#c6f32e");
    this.reduced = !!opts.reducedMotion;
    this.onModelsReady = opts.onModelsReady;
    this.runners = new Map();      // pid → runner state
    this.fx = [];                  // transient sprites {spr, vel, t, dur, kind}
    this.trail = [];               // lightning trail sprites
    this.mode = "table";           // table | stadium | follow | podium
    this.modelsReady = false;
    this.disposed = false;
    this.dirty = true;             // reduced-motion render gate
    this._frameMs = [];            // rolling render cost (perf probe)
    this._clock = new THREE.Clock();
    /* POV rig state */
    this._lookAt = null;           // smoothed look target (shared by all modes)
    this._tablePan = new THREE.Vector3(); // user pan offset (TABLE, ground plane)
    this._tableZoom = 1;           // user zoom factor (TABLE, clamped)
    this._stadiumAz = CAM_YAW;     // sweep phase (STADIUM)
    this._onVis = () => { this.dirty = true; };
    document.addEventListener("visibilitychange", this._onVis);

    this._buildScene();
    this._buildRenderer();
    this._buildWorld();
  }

  /* ── scene / renderer / camera ─────────────────────────────────────── */
  _buildScene() {
    const scene = new THREE.Scene();
    // sky gradient — a big back-side sphere with a canvas gradient
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 8; skyCanvas.height = 256;
    const sg = skyCanvas.getContext("2d");
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#0b1424");   // zenith — deep night blue
    grad.addColorStop(0.62, "#16283f");
    grad.addColorStop(0.86, "#2c4a66"); // horizon glow
    grad.addColorStop(1, "#24422b");    // bleeds into the grass
    sg.fillStyle = grad; sg.fillRect(0, 0, 8, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    scene.add(sky);
    // fog tuned for the TABLE distance (~30–45 units): the whole course stays
    // crisp, only the far hills breathe out
    scene.fog = new THREE.Fog(0x102134, 42, 180);

    const ambient = new THREE.HemisphereLight(0x8fb6ff, 0x132318, 0.74);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffd7a3, 2.35);
    key.position.set(-16, 24, 11);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x82d5ff, 1.08);
    rim.position.set(13, 8, -18);
    scene.add(rim);
    const turfBounce = new THREE.PointLight(0xc6f32e, 0.9, 32, 2.1);
    turfBounce.position.set(0, 3.2, START_Z - COURSE_LEN * 0.45);
    scene.add(turfBounce);

    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);
    // seed at the TABLE home — the first frame is already the founder's POV
    const home = this._tableHome(0);
    this.camera.position.copy(home.pos);
    this.camera.lookAt(home.look);
    this._lookAt = home.look.clone();
  }

  _buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.style.touchAction = "none";
    this.host.appendChild(this.renderer.domElement);
    this._resize();
    this._ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    this._ro.observe(this.host);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.enabled = false; // TABLE/STADIUM/FOLLOW drive the camera; podium owns it

    this._wireTableGestures();
  }

  /* ── TABLE gestures: drag to pan the table · pinch/wheel zoom ──────── */
  _wireTableGestures() {
    const el = this.renderer.domElement;
    this._ptrs = new Map(); // pointerId → {x, y}
    const inTable = () => this.mode === "table" && !this.disposed;

    el.addEventListener("pointerdown", (e) => {
      if (!inTable()) return;
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    el.addEventListener("pointermove", (e) => {
      if (!inTable() || !this._ptrs.has(e.pointerId)) return;
      const pts = this._ptrs;
      if (pts.size === 2) {
        // pinch zoom — ratio of pointer-pair distances
        const pair = [...pts.entries()];
        const d = ([, a], [, b]) => Math.hypot(a.x - b.x, a.y - b.y);
        const before = d(pair[0], pair[1]);
        pts.get(e.pointerId).x = e.clientX; pts.get(e.pointerId).y = e.clientY;
        const after = d(pair[0], pair[1]);
        if (before > 0 && after > 0) {
          this._tableZoom = THREE.MathUtils.clamp(this._tableZoom * (before / after), 0.55, 2.0);
          this.dirty = true;
        }
        return;
      }
      // single-pointer pan — the table follows the finger (screen-space → ground)
      const p = pts.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const h = this.host.clientHeight || 1;
      const dist = this.camera.position.distanceTo(this._lookAt ?? new THREE.Vector3());
      const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
      // camera screen basis projected on the ground plane
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      this._tablePan.addScaledVector(right, -dx * wpp).addScaledVector(fwd, dy * wpp);
      this._tablePan.y = 0;
      this._tablePan.x = THREE.MathUtils.clamp(this._tablePan.x, -7, 7);
      this._tablePan.z = THREE.MathUtils.clamp(this._tablePan.z, -COURSE_LEN * 0.45, COURSE_LEN * 0.45);
      this.dirty = true;
    });
    const lift = (e) => this._ptrs.delete(e.pointerId);
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
    el.addEventListener("pointerleave", lift);
    el.addEventListener("wheel", (e) => {
      if (!inTable()) return;
      e.preventDefault();
      this._tableZoom = THREE.MathUtils.clamp(this._tableZoom * Math.exp(e.deltaY * 0.0011), 0.55, 2.0);
      this.dirty = true;
    }, { passive: false });
  }

  _resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ── the POV rig: homes for TABLE / STADIUM ─────────────────────────── */
  /** centre of the framed footprint — start line to the pot, ground level */
  _courseCenter() {
    return new THREE.Vector3(0, 0.9, (START_Z + 2 + POT_Z - 2.5) / 2);
  }

  /**
   * Solve the camera distance that fits the course footprint (start line →
   * pot, trophy height included) in TRUE perspective at (elevation, yaw),
   * for the current viewport aspect. Pinhole approximation at the look
   * point — corners off-axis are near enough under the 1.1 margin.
   */
  _fitDistance(el, yaw) {
    const n = this._nPlayers ?? 4;
    const halfW = (n * LANE_W) / 2 + 3.4;        // track + gantry + breathing room
    const zNear = START_Z + 2.2, zFar = POT_Z - 3.0; // banner → behind the trophy
    const halfV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.camera.aspect || 1;
    // camera sits at C + R·h — screen basis at the look point
    const h = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
    const fwd = h.clone().negate();                          // camera → look
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    let need = 1;
    for (const sx of [-halfW, halfW]) for (const sy of [0, 3]) for (const sz of [zNear, zFar]) {
      const o = new THREE.Vector3(sx, sy, sz).sub(this._courseCenter());
      const nx = Math.abs(o.dot(right)) / (halfV * aspect);
      const ny = Math.abs(o.dot(up)) / halfV;
      need = Math.max(need, nx, ny);
    }
    return need * CAM_FIT_MARGIN;
  }

  /** TABLE home: the oblique board-game view, with gentle drift unless reduced */
  _tableHome(now) {
    const el = CAM_EL_TABLE;
    const yaw = CAM_YAW + (this.reduced ? 0 : Math.sin(now * 0.1) * 0.03); // parallax drift
    const breathe = this.reduced ? 1 : 1 + Math.sin(now * 0.07) * 0.025;   // slow breathing
    const R = this._fitDistance(el, yaw) * this._tableZoom * breathe;
    const look = this._courseCenter().add(this._tablePan);
    const pos = look.clone().add(new THREE.Vector3(
      Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)
    ).multiplyScalar(R));
    return { pos, look };
  }

  /** STADIUM home: higher + wider, slow orbital sweep (frozen under reduced motion) */
  _stadiumHome(now, dt) {
    if (!this.reduced) this._stadiumAz += dt * CAM_SWEEP;
    const el = CAM_EL_STADIUM, yaw = this._stadiumAz;
    const R = this._fitDistance(el, yaw) * 1.5;
    const look = this._courseCenter();
    const pos = look.clone().add(new THREE.Vector3(
      Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)
    ).multiplyScalar(R));
    return { pos, look };
  }

  /* ── the low-poly world: track, lanes, markers, grass, trees, pot ──── */
  _buildWorld() {
    const W = this.scene;
    const rng = mulberry32(20260903);

    // grass
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0x24422b })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.06;
    W.add(grass);

    // hills on the horizon
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x1d3724 });
    for (let i = 0; i < 7; i++) {
      const r = 60 + rng() * 80;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), hillMat);
      hill.scale.y = 0.32 + rng() * 0.16;
      const a = rng() * Math.PI * 2, d = 170 + rng() * 90;
      hill.position.set(Math.cos(a) * d, -r * 0.42, Math.sin(a) * d - COURSE_LEN * 0.35);
      W.add(hill);
    }

    // low-poly stadium bowl: far enough to read as atmosphere, cheap enough for phone.
    const standMats = [
      new THREE.MeshLambertMaterial({ color: 0x182231 }),
      new THREE.MeshLambertMaterial({ color: 0x222c3d }),
      new THREE.MeshLambertMaterial({ color: 0x293448 }),
    ];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const tier = i % 3;
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(8.8, 0.55 + tier * 0.18, 3.2),
          standMats[tier]
        );
        block.position.set(side * (15.5 + tier * 1.15), 0.55 + tier * 0.28, START_Z - 2.5 - i * 4.2);
        block.rotation.y = side * THREE.MathUtils.degToRad(5 + i * 0.55);
        W.add(block);
      }
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xaedcff, transparent: true, opacity: 0.42 });
    for (const x of [-13.8, 13.8]) for (const z of [START_Z - 2, START_Z - 15, START_Z - 28]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 5.6, 6), new THREE.MeshLambertMaterial({ color: 0x1c222b }));
      mast.position.set(x, 2.8, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.28), lightMat);
      lamp.position.set(x, 5.7, z);
      lamp.rotation.y = x < 0 ? -0.35 : 0.35;
      W.add(mast, lamp);
    }

    // trees + rocks — kept clear of the track corridor
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3627 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e5236 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
    const trackHalf = 12; // generous clearance
    for (let i = 0; i < 34; i++) {
      let x, z, tries = 0;
      do {
        x = (rng() * 2 - 1) * 90;
        z = START_Z + 8 - rng() * (COURSE_LEN + 26);
        tries++;
      } while (Math.abs(x) < trackHalf && tries < 9);
      if (Math.abs(x) < trackHalf) continue;
      const g = new THREE.Group();
      const s = 0.8 + rng() * 1.5;
      if (rng() < 0.78) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.1 * s, 6), trunkMat);
        trunk.position.y = 0.55 * s;
        const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05 * s, 2.6 * s, 7), leafMat);
        crown.position.y = (1.1 + 1.15) * s;
        g.add(trunk, crown);
      } else {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), rockMat);
        rock.position.y = 0.3 * s;
        rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        g.add(rock);
      }
      g.position.set(x, 0, z);
      W.add(g);
    }
  }

  /** the track itself — call once the player count is known */
  buildTrack(players, tierOf) {
    if (this.track) return;
    const n = players.length;
    const totalW = n * LANE_W;
    const track = new THREE.Group();
    this.track = track;
    this.scene.add(track);

    // base slab
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + 2.4, TRACK_H, COURSE_LEN + 10),
      new THREE.MeshStandardMaterial({ color: 0x303844, roughness: 0.82, metalness: 0.04 })
    );
    slab.position.set(0, TRACK_TOP - TRACK_H / 2, START_Z - COURSE_LEN / 2 + 2);
    track.add(slab);

    // one lane strip per player, tier-tinted (subtle — reads as colour, not noise)
    players.forEach((p, i) => {
      const base = this.tierHex(p.tier, p.isYou);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(LANE_W - 0.12, TRACK_H * 0.55, COURSE_LEN + 8),
        new THREE.MeshStandardMaterial({
          map: laneStripeTexture(base, i),
          color: 0xffffff,
          roughness: 0.74,
          metalness: 0.02,
          emissive: new THREE.Color(base).multiplyScalar(0.05),
        })
      );
      strip.position.set(this.laneX(i), TRACK_TOP + 0.004, START_Z - COURSE_LEN / 2 + 2);
      track.add(strip);
    });

    // painted lane numbers at the start — readable from the oblique TABLE POV
    // (board-game lanes; texture "up" points down-course, toward the far side
    // of the table, so the figures' lanes read upright from the camera side)
    players.forEach((p, i) => {
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 1.15),
        new THREE.MeshBasicMaterial({
          map: laneNumTexture(i + 1, this.tierHex(p.tier, p.isYou)),
          transparent: true, depthWrite: false,
        })
      );
      num.rotation.x = -Math.PI / 2;
      num.rotation.z = CAM_YAW; // align the digits with the camera azimuth
      num.position.set(this.laneX(i), TRACK_TOP + 0.013, START_Z - 1.5);
      num.renderOrder = 2;
      track.add(num);
    });

    // lane divider lines
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8eaed });
    for (let i = 0; i <= n; i++) {
      const x = -totalW / 2 + i * LANE_W;
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, TRACK_H * 0.5, COURSE_LEN + 8),
        lineMat
      );
      line.position.set(x, TRACK_TOP + 0.008, START_Z - COURSE_LEN / 2 + 2);
      track.add(line);
    }

    // start line — solid white strip
    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + 1.2, 0.02, 0.5),
      lineMat
    );
    startLine.position.set(0, TRACK_TOP + 0.012, START_Z);
    track.add(startLine);

    // finish — checker strip + arch posts + CHARITY POT gantry beyond
    const finishLine = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + 1.2, 0.02, 0.5),
      lineMat
    );
    finishLine.position.set(0, TRACK_TOP + 0.012, FINISH_Z);
    track.add(finishLine);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x0f1216 });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xe8b54a, emissive: 0x63480f });
    for (const sx of [-totalW / 2 - 1.1, totalW / 2 + 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.4, 8), postMat);
      post.position.set(sx, 2.2, FINISH_Z);
      track.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), goldMat);
      cap.position.set(sx, 4.5, FINISH_Z);
      track.add(cap);
    }
    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + 2.6, 0.5, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x15181e })
    );
    gantry.position.set(0, 4.35, FINISH_Z);
    track.add(gantry);
    const finishTag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(["FINISH"], { accent: "#c6f32e" }),
      transparent: true, depthWrite: false,
    }));
    finishTag.scale.set(2.6, 0.5, 1);
    finishTag.position.set(0, 5.15, FINISH_Z);
    track.add(finishTag);

    // distance markers every 25%
    for (const frac of [0.25, 0.5, 0.75]) {
      const z = START_Z - frac * COURSE_LEN;
      const reps = Math.round(frac * (this.targetReps ?? 300));
      for (const sx of [-totalW / 2 - 0.75, totalW / 2 + 0.75]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 7),
          new THREE.MeshLambertMaterial({ color: 0xe8b54a }));
        cone.position.set(sx, TRACK_TOP + 0.31, z);
        track.add(cone);
      }
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture([`${Math.round(frac * 100)}%`, `${reps} REPS`], { accent: null }),
        transparent: true, depthWrite: false,
      }));
      tag.scale.set(3.4, 1.16, 1);
      tag.position.set(0, 2.5, z);
      track.add(tag);
    }

    // charity pot pedestal at the finish
    this._buildPot();

    // start banner
    const startTag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(["START — LOG REPS TO ADVANCE"], { accent: "#6ec1ff" }),
      transparent: true, depthWrite: false,
    }));
    startTag.scale.set(6.2, 1.0, 1);
    startTag.position.set(0, 3.1, START_Z + 0.4);
    track.add(startTag);
  }

  laneX(i) {
    const n = this.runners.size || this._nPlayers || 4;
    return (i - (n - 1) / 2) * LANE_W;
  }

  /* ── the charity pot — trophy pedestal + chip stacks ───────────────── */
  _buildPot() {
    const pot = new THREE.Group();
    pot.position.set(0, 0, POT_Z);
    this.potGroup = pot;
    this.scene.add(pot);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.3, 0.34, 24),
      new THREE.MeshLambertMaterial({ color: 0x1a1d23 })
    );
    plinth.position.y = 0.17;
    pot.add(plinth);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.35, 0.6, 24),
      new THREE.MeshLambertMaterial({ color: 0x23262e })
    );
    column.position.y = 0.64;
    pot.add(column);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.15, 0.16, 24),
      new THREE.MeshLambertMaterial({ color: 0x2c3038 })
    );
    top.position.y = 1.0;
    pot.add(top);

    // stylised trophy (primitives): base, stem, cup, flame-knob
    const gold = new THREE.MeshLambertMaterial({ color: 0xe8b54a, emissive: 0x5a420f });
    const cupBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.14, 14), gold);
    cupBase.position.y = 1.15;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.34, 10), gold);
    stem.position.y = 1.36;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.14, 0.5, 16), gold);
    cup.position.y = 1.76;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), gold);
    knob.position.y = 2.08;
    pot.add(cupBase, stem, cup, knob);
    for (const hx of [-0.5, 0.5]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 18, Math.PI), gold);
      handle.position.set(hx, 1.78, 0);
      handle.rotation.z = hx < 0 ? -Math.PI / 2 : Math.PI / 2;
      pot.add(handle);
    }

    // CHARITY POT label
    this.potLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(["CHARITY POT", "0 PTS"], { accent: "#e8b54a" }),
      transparent: true, depthWrite: false,
    }));
    this.potLabel.scale.set(3.6, 1.28, 1);
    this.potLabel.position.set(0, 2.75, POT_Z);
    this.scene.add(this.potLabel);

    this.potChips = new THREE.Group();
    this.potChips.position.set(0, 1.08, POT_Z);
    this.scene.add(this.potChips);
    this._potTotal = -1;
  }

  /** engine chipMix → stacked denomination chips on the pedestal */
  setPot(total, chipMix) {
    if (!this.potChips || total === this._potTotal) return;
    this._potTotal = total;
    // rebuild stacks (cheap — a handful of cylinders)
    for (const ch of [...this.potChips.children]) {
      ch.geometry?.dispose(); ch.material?.dispose();
      this.potChips.remove(ch);
    }
    const cols = { gold: 0xe8b54a, blue: 0x3d7bd9, red: 0xd8434e, white: 0xf2eee2 };
    const mix = chipMix ?? [];
    let slot = 0;
    for (const d of mix) {
      const count = Math.min(d.count, 9);
      const colour = cols[d.id] ?? 0xf2eee2;
      for (let i = 0; i < count; i++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.21, 0.21, 0.055, 14),
          new THREE.MeshLambertMaterial({ color: colour })
        );
        const ringR = slot < 7 ? 0.62 : 0.98;
        const s = slot < 7 ? slot : slot - 7;
        const a = (s / 7) * Math.PI * 2 + 0.35;
        chip.position.set(Math.cos(a) * ringR, (i * 0.062) + 0.03, Math.sin(a) * ringR);
        chip.rotation.y = Math.random() * Math.PI;
        this.potChips.add(chip);
      }
      slot++;
    }
    // label refresh
    const lbl = this.potLabel.material.map;
    if (lbl) { lbl.dispose(); }
    this.potLabel.material.map = labelTexture(["CHARITY POT", `${total} PTS`], { accent: "#e8b54a" });
    this.potLabel.material.needsUpdate = true;
    this.dirty = true;
  }

  potBump() {
    // a soft gold pulse over the trophy when a contribution lands
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xe8b54a, transparent: true, opacity: 0.35, depthWrite: false })
    );
    pulse.position.set(0, 1.6, POT_Z);
    this.scene.add(pulse);
    this.fx.push({ spr: pulse, t: 0, dur: 0.7, kind: "potpulse" });
  }

  /* ── runners ───────────────────────────────────────────────────────── */
  /** sync runner roster + per-runner state. players: [{id,name,tier,isYou}] */
  setRunners(players, { targetReps = 300 } = {}) {
    this.targetReps = targetReps;
    this._nPlayers = players.length;
    // remove stale
    for (const [pid, r] of this.runners) {
      if (!players.some((p) => p.id === pid)) {
        this.scene.remove(r.group);
        this.runners.delete(pid);
      }
    }
    players.forEach((p, i) => {
      let r = this.runners.get(p.id);
      if (!r) {
        const group = new THREE.Group();
        group.position.set(this.laneX(i), TRACK_TOP, START_Z);
        this.scene.add(group);

        // placeholder capsule (until Geno streams in)
        const ph = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.26, 0.8, 4, 10),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.tierHex(p.tier, p.isYou)).multiplyScalar(0.92),
            roughness: 0.54,
            metalness: 0.04,
            emissive: new THREE.Color(this.tierHex(p.tier, p.isYou)).multiplyScalar(0.16),
          })
        );
        ph.position.y = 0.72;
        ph.name = "placeholder";
        group.add(ph);

        // blob contact shadow
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.42, 18),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.015;
        group.add(shadow);

        // tier-coloured silhouette glow behind the figure for TABLE legibility
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(),
          color: this.tierHex(p.tier, p.isYou),
          transparent: true,
          opacity: p.isYou ? 0.52 : 0.34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        glow.scale.set(1.25, 2.2, 1);
        glow.position.y = 1.02;
        group.add(glow);

        // name tag
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({
          map: labelTexture([p.name.toUpperCase()], { accent: this.tierHex(p.tier, p.isYou), bg: "rgba(10,11,13,0.66)" }),
          transparent: true, depthWrite: false,
        }));
        tag.scale.set(2.45, 0.58, 1);
        tag.position.y = 2.25;
        group.add(tag);

        const crown = new THREE.Sprite(new THREE.SpriteMaterial({
          map: crownTexture(),
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }));
        crown.scale.set(0.74, 0.74, 1);
        crown.position.y = 2.88;
        group.add(crown);

        // comeback ring (gold, at the feet)
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.6, 0.045, 8, 36),
          new THREE.MeshBasicMaterial({ color: 0xffc941, transparent: true, opacity: 0.9 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        ring.visible = false;
        group.add(ring);

        // shield shell
        const shield = new THREE.Mesh(
          new THREE.SphereGeometry(0.95, 18, 14),
          new THREE.MeshBasicMaterial({ color: 0x6ec1ff, transparent: true, opacity: 0.14, depthWrite: false })
        );
        shield.position.y = 0.95;
        shield.visible = false;
        group.add(shield);

        r = {
          id: p.id, name: p.name, tier: p.tier, isYou: !!p.isYou, lane: i,
          group, glow, tag, crown, ring, shield, avatar: null, players: {}, clip: null,
          t: 0, target: 0, fromT: 0, moveElapsed: 0, moveDur: 0,
          speed: 0, bobPhase: Math.random() * Math.PI * 2,
          cards: [], cardsGroup: new THREE.Group(),
        };
        r.cardsGroup.position.y = 2.75;
        group.add(r.cardsGroup);
        this.runners.set(p.id, r);
      } else {
        r.lane = i;
      }
    });
    this.dirty = true;
  }

  /** patch progress targets; drives the runner lerp (flags live in setStatus) */
  setProgress(rows) {
    for (const row of rows) {
      const r = this.runners.get(row.player.id);
      if (!r) continue;
      const next = Math.min(1, (row.rawReps ?? 0) / (this.targetReps || 1));
      if (Math.abs(next - r.target) > 0.0005) {
        r.fromT = r.t;
        r.target = next;
        r.moveElapsed = 0;
        r.moveDur = THREE.MathUtils.clamp(0.7 + Math.abs(next - r.t) * 2.4, 0.78, 1.25);
      } else {
        r.target = next;
      }
    }
    this.dirty = true;
  }

  /** status flags straight from the engine (call with the live match) */
  setStatus(match, engineHelpers) {
    for (const [pid, r] of this.runners) {
      r.ring.visible = engineHelpers.armed(pid);
      r.shield.visible = engineHelpers.shielded(pid);
      r._lit = engineHelpers.lit(pid);
    }
    this.dirty = true;
  }

  /** held power-ups → billboard cards over the runner */
  setCards(pid, cards) {
    // cards: [{kind, name, glyph, rarity}]
    const r = this.runners.get(pid);
    if (!r) return;
    const sig = cards.map((c) => c.kind).join(",");
    if (r._cardsSig === sig) return;
    r._cardsSig = sig;
    for (const spr of r.cards) {
      spr.material.map?.dispose(); spr.material.dispose();
      r.cardsGroup.remove(spr);
    }
    r.cards = cards.map((c, i) => {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cardTexture(c.name, c.glyph, this.rarHex(c.rarity)),
        transparent: true, depthWrite: false,
      }));
      spr.scale.set(0.86, 1.18, 1);
      spr.position.x = (i - (cards.length - 1) / 2) * 0.92;
      spr.userData.phase = i * 1.3;
      r.cardsGroup.add(spr);
      return spr;
    });
    this.dirty = true;
  }

  /** card played → it flies up + bursts */
  playCardFx(pid, { name, glyph, rarity }) {
    this.fxPlayed = (this.fxPlayed ?? 0) + 1; // probe: 3D play fx observed
    const r = this.runners.get(pid);
    if (!r) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cardTexture(name, glyph, this.rarHex(rarity)),
      transparent: true, depthWrite: false,
    }));
    spr.scale.set(0.86, 1.18, 1);
    spr.position.set(r.group.position.x, 3.0, r.group.position.z);
    this.scene.add(spr);
    this.fx.push({ spr, t: 0, dur: 0.85, kind: "cardup", vel: new THREE.Vector3(0, 2.6, 0) });
    this.dirty = true;
  }

  repsBurst(pid, reps, accent = "#c6f32e") {
    const r = this.runners.get(pid);
    if (!r) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture([`+${reps} REPS`], {
        accent,
        fg: "#ffffff",
        bg: "rgba(8,10,13,0.72)",
        font: 800,
      }),
      transparent: true,
      depthWrite: false,
    }));
    spr.scale.set(2.15, 0.48, 1);
    spr.position.set(r.group.position.x, 2.85, r.group.position.z - 0.25);
    this.scene.add(spr);
    this.fx.push({
      spr, t: 0, dur: 1.05, kind: "textburst",
      vel: new THREE.Vector3(0, 1.05, -0.12),
    });
    this.dirty = true;
  }

  dailyWinFx(origin = null) {
    const p = origin ?? new THREE.Vector3(0, 2.4, START_Z - COURSE_LEN * 0.38);
    const cols = [0xc6f32e, 0xffc941, 0x6ec1ff, 0xff5c38, 0xb78cff];
    for (let i = 0; i < 34; i++) {
      const mat = new THREE.SpriteMaterial({
        map: confettiTexture(),
        color: cols[i % cols.length],
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
      });
      mat.rotation = Math.random() * Math.PI;
      const spr = new THREE.Sprite(mat);
      spr.scale.set(0.09 + Math.random() * 0.09, 0.18 + Math.random() * 0.14, 1);
      spr.position.copy(p);
      spr.position.x += (Math.random() - 0.5) * 2.2;
      spr.position.z += (Math.random() - 0.5) * 1.4;
      this.scene.add(spr);
      const a = Math.random() * Math.PI * 2;
      const v = 1.6 + Math.random() * 2.2;
      this.fx.push({
        spr, t: 0, dur: 1.4 + Math.random() * 0.6, kind: "confetti",
        vel: new THREE.Vector3(Math.cos(a) * v, 2.2 + Math.random() * 2.4, Math.sin(a) * v),
        spin: (Math.random() - 0.5) * 6,
      });
    }
    this.dirty = true;
  }

  /* ── podium (result screen) ────────────────────────────────────────── */
  showPodium(rows) {
    // rows: finalStandings top rows; arrange 2 · 1 · 3 on blocks by the pot
    this.mode = "podium";
    if (this.podiumGroup) this.scene.remove(this.podiumGroup);
    const pg = new THREE.Group();
    pg.position.set(0, 0, POT_Z + 3.4);
    this.podiumGroup = pg;
    this.scene.add(pg);

    const podium = rows.slice(0, 3);
    const spots = [
      { place: 1, x: 0, h: 1.25, col: 0xe8b54a },
      { place: 2, x: -2.0, h: 0.85, col: 0xc9ced4 },
      { place: 3, x: 2.0, h: 0.55, col: 0xb0703f },
    ];
    const placeOf = new Map(podium.map((row, i) => [row.player.id, i + 1]));
    for (const s of spots) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, s.h, 1.7),
        new THREE.MeshLambertMaterial({ color: 0x1c2026 })
      );
      block.position.set(s.x, s.h / 2, 0);
      pg.add(block);
      const topPlate = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.09, 1.7),
        new THREE.MeshLambertMaterial({ color: s.col })
      );
      topPlate.position.set(s.x, s.h + 0.045, 0);
      pg.add(topPlate);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture([`${s.place}${s.place === 1 ? "ST" : s.place === 2 ? "ND" : "RD"}`], { accent: `#${new THREE.Color(s.col).getHexString()}` }),
        transparent: true, depthWrite: false,
      }));
      tag.scale.set(1.5, 0.6, 1);
      tag.position.set(s.x, s.h + 1.1, 0.4);
      pg.add(tag);

      const row = podium[s.place - 1];
      const r = this.runners.get(row?.player.id);
      if (r) {
        r.group.position.set(s.x, TRACK_TOP + s.h + 0.09, 0 + pg.position.z);
        r.group.rotation.y = 0; // face the camera (toward start / +Z)
        r.target = r.t = 0;
        this._setClip(r, "idle");
      }
    }
    // non-podium runners idle near the track end
    for (const [pid, r] of this.runners) {
      if (placeOf.has(pid)) continue;
      r.group.rotation.y = 0;
      this._setClip(r, "idle");
    }
    this.camera.position.set(6.5, 3.4, POT_Z + 9.5);
    this.camera.lookAt(0, 1.6, POT_Z + 2.4);
    this.controls.target.set(0, 1.5, POT_Z + 2.6);
    this.controls.enabled = true;
    this.controls.autoRotate = !this.reduced;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.update();
    if (!this.reduced) this.dailyWinFx(new THREE.Vector3(0, 3.2, POT_Z + 3.2));
    this.dirty = true;
  }

  setCameraMode(mode) {
    if (!["table", "stadium", "follow", "podium"].includes(mode)) return;
    this.mode = mode;
    // fresh framing per mode — the eased lerp still glides there (no jumps)
    this._tablePan.set(0, 0, 0);
    this._tableZoom = 1;
    if (mode === "podium") {
      this.controls.enabled = true;
      this.controls.autoRotate = !this.reduced;
    } else {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
    }
    this.dirty = true;
  }

  /** table → stadium → follow → table (podium is the result screen, not cycled) */
  cycleCamera() {
    const order = ["table", "stadium", "follow"];
    const i = order.indexOf(this.mode);
    if (i < 0) return this.mode; // podium — leave the result view alone
    const next = order[(i + 1) % order.length];
    this.setCameraMode(next);
    return next;
  }

  /** camera probe — the POV audits read this (angle below horizontal, etc) */
  camState() {
    if (!this.camera) return null;
    const look = this._lookAt ?? new THREE.Vector3(0, 1.1, START_Z - 4);
    const dir = new THREE.Vector3().subVectors(look, this.camera.position).normalize();
    const downDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-dir.y, -1, 1)));
    const r3 = (v) => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });
    return { mode: this.mode, pos: r3(this.camera.position), look: r3(look), downDeg: +downDeg.toFixed(1) };
  }

  /** NDC position of a runner on screen (−1..1; |x|,|y| ≤ 1 → on-frame) */
  runnerScreen(pid) {
    const r = this.runners.get(pid);
    if (!r || !this.camera) return null;
    const v = r.group.position.clone();
    v.y += 0.9; // mid-figure, not the feet
    v.project(this.camera);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  }

  /** NDC of any world point — pot framing, lane-number placement audits */
  worldScreen(x, y, z) {
    if (!this.camera) return null;
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  }

  _leader() {
    let best = null;
    for (const [, r] of this.runners) {
      if (!best || r.target > best.target) best = r;
    }
    return best;
  }

  /* ── avatars + mocap (lazy, async) ─────────────────────────────────── */
  /** stream Geno + Soldier clips in; placeholder capsules run meanwhile */
  async loadAvatars() {
    if (this._avatarsLoading || this.disposed) return;
    this._avatarsLoading = true;
    try {
      const MA = await import("/site/model-avatars.js");
      const [genoSceneProto, walk, run, idle] = await Promise.all([
        MA.loadModel("/models/Geno.glb").catch(() => null),
        MA.loadGenoClip("walk").catch(() => null),
        MA.loadGenoClip("run").catch(() => null),
        MA.loadGenoClip("idle").catch(() => null),
      ]);
      if (this.disposed) return;
      this._MA = MA;
      this._clips = { walk, run, idle };

      for (const [pid, r] of this.runners) {
        if (!genoSceneProto) break;
        try {
          const geno = await MA.loadModel("/models/Geno.glb"); // cached — clones per runner
          if (this.disposed) return;
          MA.applyFlatTint(geno, r.isYou ? "#c6f32e" : this._genoTint(r.tier));
          const av = new MA.ModelAvatar(geno, "mixamo");
          const s = RUNNER_H / av.H;
          av.root.scale.setScalar(s);
          av.root.rotation.y = Math.PI; // course runs toward −Z; Geno faces +Z
          r.group.add(av.root);
          const ph = r.group.getObjectByName("placeholder");
          if (ph) { ph.geometry.dispose(); ph.material.dispose(); r.group.remove(ph); }
          r.avatar = av;
          this._setClip(r, this._clipFor(r));
        } catch { /* runner keeps its capsule — the course still plays */ }
      }
      this.modelsReady = true;
      this.dirty = true;
      this.onModelsReady?.();
    } catch { /* WebGL/model trouble — capsules carry the game */ }
    this._avatarsLoading = false;
  }

  _genoTint(tier) {
    const tints = { couch: "#ffb020", casual: "#6ec1ff", fit: "#c6f32e", athlete: "#ff5c38" };
    return tints[tier] ?? "#eceef1";
  }

  _setClip(r, kind) {
    if (!r.avatar || !this._clips?.[kind]) return;
    if (r.clip === kind) return;
    const prev = r.player;
    try {
      r.player = new this._MA.BVHPlayer(r.avatar, this._clips[kind]);
      r.clip = kind;
      prev?.stop();
    } catch { r.player = prev; }
  }

  _clipFor(r) {
    if (this.reduced) return "idle";
    return r.speed > 0.028 ? "run" : r.moving ? "walk" : "idle";
  }

  /* ── per-frame drive ───────────────────────────────────────────────── */
  _step(dt, now) {
    // reduced motion: dt arrives as 0 (no animation clock) — SNAPSHOT the
    // runner at its target instead of lerping (ease would be 1-e^0 = 0 and
    // the runner would freeze at the start line forever). Static means
    // "correctly positioned, no glide", not "frozen".
    let leader = null;

    for (const [, r] of this.runners) {
      const prevT = r.t;
      if (this.reduced) {
        r.t = r.target;
      } else if (r.moveElapsed < r.moveDur && Math.abs(r.target - r.fromT) > 0.0005) {
        r.moveElapsed += dt;
        const p = THREE.MathUtils.clamp(r.moveElapsed / r.moveDur, 0, 1);
        const s = p * p * (3 - 2 * p); // smoothstep: accelerate, then settle.
        r.t = THREE.MathUtils.lerp(r.fromT, r.target, s);
        if (p >= 1 || Math.abs(r.target - r.t) < 0.0012) r.t = r.target;
      } else {
        r.t = r.target;
      }
      r.speed = dt > 0 ? Math.abs(r.t - prevT) / dt : 0;
      r.moving = Math.abs(r.target - r.t) > 0.0025;

      const z = START_Z - r.t * COURSE_LEN;
      if (this.mode !== "podium") {
        r.group.position.z = z;
        r.group.position.x = this.laneX(r.lane);
      }

      // mocap drive
      if (r.avatar && !this.reduced) {
        this._setClip(r, this._clipFor(r));
        try { r.player?.update(dt); } catch { /* keep rendering */ }
        // time-scale the idle so runners don't sync-step
        // (BVHPlayer owns its clock — desync via per-runner start offsets is enough)
      }

      // start-line / idle breathing lives inside the figure, not on the group,
      // so the debug world position remains the exact ground-plane anchor.
      if (!this.reduced) {
        const breathe = Math.sin(now * (r.moving ? 8.0 : 2.8) + r.bobPhase);
        const lift = (r.moving ? 0.04 : 0.022) * Math.max(0, breathe);
        const ph = r.group.getObjectByName("placeholder");
        if (ph) ph.position.y = 0.72 + lift;
        if (r.avatar?.root) r.avatar.root.position.y = lift;
        r.glow.scale.set(1.18 + lift * 2.2, 2.12 + lift * 3.2, 1);
        r.glow.material.opacity = (r.isYou ? 0.48 : 0.31) + (r.moving ? 0.08 : 0.02) * Math.max(0, breathe);
      }

      // ring spin / shield pulse
      if (r.ring.visible) {
        r.ring.rotation.z = now * 1.8;
        const p = 1 + Math.sin(now * 4 + r.bobPhase) * 0.06;
        r.ring.scale.setScalar(p);
      }
      if (r.shield.visible) {
        r.shield.scale.setScalar(1 + Math.sin(now * 2.2 + r.bobPhase) * 0.04);
      }

      // cards bob
      for (const c of r.cards) {
        c.position.y = Math.sin(now * 2.1 + c.userData.phase) * 0.07;
        c.material.rotation = Math.sin(now * 1.35 + c.userData.phase) * 0.055;
      }

      // lightning live → gold trail
      if (r._lit && !this.reduced && now - (r._lastTrailAt ?? 0) > 0.09) {
        r._lastTrailAt = now;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), color: 0xffc941, transparent: true,
          opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        spr.scale.setScalar(0.55);
        spr.position.set(r.group.position.x, 0.85, r.group.position.z);
        this.scene.add(spr);
        this.trail.push({ spr, t: 0, dur: 0.85 });
        if (this.trail.length > 46) {
          const old = this.trail.shift();
          old.spr.material.dispose();
          this.scene.remove(old.spr);
        }
      }

      if (!leader || r.t > leader.t) leader = r;
    }

    for (const [, r] of this.runners) {
      const isLeader = leader && r.id === leader.id;
      r.crown.material.opacity = isLeader ? 1 : 0;
      r.crown.position.y = 2.9 + (this.reduced ? 0 : Math.sin(now * 2.4 + r.bobPhase) * 0.06);
      r.glow.material.color.set(this.tierHex(r.tier, r.isYou));
      if (isLeader) r.glow.material.opacity = Math.max(r.glow.material.opacity, 0.62);
    }

    // ── the POV rig ──────────────────────────────────────────────────────
    // Every non-podium mode computes a home (pos, look) each frame; the
    // camera eases toward it (exp smoothing) — mode changes glide, never
    // jump. Reduced motion: factors are 1 (snap — learn from the runner
    // freeze bug: dt=0 with exp ease would never converge).
    const easePos = this.reduced ? 1 : 1 - Math.exp(-dt * 2.4);
    const easeLook = this.reduced ? 1 : 1 - Math.exp(-dt * 3.0);
    if (this.mode === "table" || this.mode === "stadium") {
      const home = this.mode === "table" ? this._tableHome(now) : this._stadiumHome(now, dt);
      this.camera.position.lerp(home.pos, easePos);
      this._lookAt = this._lookAt ?? home.look.clone();
      this._lookAt.lerp(home.look, easeLook);
      this.camera.lookAt(this._lookAt);
    } else if (this.mode === "follow" && leader) {
      const lp = leader.group.position;
      const want = new THREE.Vector3(lp.x * 0.5, 3.15, lp.z + 7.2);
      const look = new THREE.Vector3(lp.x * 0.35, 1.15, lp.z - 5.5);
      this.camera.position.lerp(want, this.reduced ? 1 : 1 - Math.exp(-dt * 2.6));
      this._lookAt = this._lookAt ?? look.clone();
      this._lookAt.lerp(look, this.reduced ? 1 : 1 - Math.exp(-dt * 3.2));
      this.camera.lookAt(this._lookAt);
    } else if (this.mode === "podium") {
      this.controls.update();
    }

    // transient fx
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      if (f.kind === "cardup") {
        f.spr.position.y = 3.0 + 2.6 * (1 - Math.pow(1 - p, 2));
        f.spr.material.opacity = 1 - p * p;
        const s = 0.86 * (1 + p * 0.7);
        f.spr.scale.set(s, s * 1.37, 1);
        if (p >= 1) {
          this._burst(f.spr.position, f.spr.material.color.getHex());
          f.spr.material.map?.dispose(); f.spr.material.dispose();
          this.scene.remove(f.spr);
          this.fx.splice(i, 1);
        }
      } else if (f.kind === "potpulse") {
        f.spr.scale.setScalar(0.4 + p * 1.4);
        f.spr.material.opacity = 0.35 * (1 - p);
        if (p >= 1) {
          f.spr.geometry.dispose(); f.spr.material.dispose();
          this.scene.remove(f.spr);
          this.fx.splice(i, 1);
        }
      } else if (f.kind === "spark") {
        f.spr.position.addScaledVector(f.vel, dt);
        f.vel.y -= 2.2 * dt;
        f.spr.material.opacity = 0.95 * (1 - p);
        const s = 0.16 * (1 - p * 0.6);
        f.spr.scale.setScalar(s);
        if (p >= 1) {
          f.spr.material.dispose();
          this.scene.remove(f.spr);
          this.fx.splice(i, 1);
        }
      } else if (f.kind === "textburst") {
        f.spr.position.addScaledVector(f.vel, dt);
        f.spr.material.opacity = 1 - p * p;
        const s = 1 + Math.sin(p * Math.PI) * 0.16;
        f.spr.scale.set(2.15 * s, 0.48 * s, 1);
        if (p >= 1) {
          f.spr.material.map?.dispose(); f.spr.material.dispose();
          this.scene.remove(f.spr);
          this.fx.splice(i, 1);
        }
      } else if (f.kind === "confetti") {
        f.spr.position.addScaledVector(f.vel, dt);
        f.vel.y -= 4.6 * dt;
        f.spr.material.rotation += f.spin * dt;
        f.spr.material.opacity = 0.96 * (1 - p);
        if (p >= 1) {
          f.spr.material.dispose();
          this.scene.remove(f.spr);
          this.fx.splice(i, 1);
        }
      }
    }

    // trail fade
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const tr = this.trail[i];
      tr.t += dt;
      const p = Math.min(1, tr.t / tr.dur);
      tr.spr.material.opacity = 0.9 * (1 - p);
      tr.spr.scale.setScalar(0.55 * (1 - p * 0.7));
      if (p >= 1) {
        tr.spr.material.dispose();
        this.scene.remove(tr.spr);
        this.trail.splice(i, 1);
      }
    }
  }

  _burst(pos, hex) {
    for (let i = 0; i < 16; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: hex, transparent: true,
        opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      spr.scale.setScalar(0.16);
      spr.position.copy(pos);
      const a = (i / 16) * Math.PI * 2;
      const v = 2.2 + Math.random() * 1.6;
      this.scene.add(spr);
      this.fx.push({
        spr, t: 0, dur: 0.65, kind: "spark",
        vel: new THREE.Vector3(Math.cos(a) * v, 1.4 + Math.random() * 1.8, Math.sin(a) * v),
      });
    }
  }

  /* ── the loop (gated) ──────────────────────────────────────────────── */
  start() {
    if (this._raf || this.disposed) return;
    const loop = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(loop);
      if (document.visibilityState !== "visible") return; // idle gate — hidden tab
      const dt = Math.min(this._clock.getDelta(), 0.06);
      const now = this._clock.elapsedTime;
      if (this.reduced) {
        // reduced motion: render ONLY when something changed
        this._step(0, now);
        if (this.dirty) {
          this._render();
          this.dirty = false;
        }
      } else {
        this._step(dt, now);
        this._render();
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  _render() {
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    this._frameMs.push(ms);
    if (this._frameMs.length > 120) this._frameMs.shift();
  }

  frameMs() {
    if (!this._frameMs.length) return 0;
    const sorted = [...this._frameMs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]; // median — robust to GC spikes
  }

  /* ── probes (e2e + geometry checks) ────────────────────────────────── */
  runnerWorldPos(pid) {
    const r = this.runners.get(pid);
    if (!r) return null;
    return {
      x: +r.group.position.x.toFixed(3),
      y: +r.group.position.y.toFixed(3),
      z: +r.group.position.z.toFixed(3),
      t: +r.t.toFixed(4),
      lane: r.lane,
      avatarReady: !!r.avatar,
    };
  }

  laneXs() {
    return [...this.runners.values()].map((r) => +this.laneX(r.lane).toFixed(3));
  }

  /* pot world anchor — the geometry audit checks centre-on-course-axis */
  potPos() {
    if (!this.potChips) return null;
    return { x: +this.potChips.position.x.toFixed(3), z: +this.potChips.position.z.toFixed(3), chips: this.potChips.children.length };
  }

  /* track build facts — lane-strip heights must be distinct + above the slab */
  trackStats() {
    if (!this.track) return null;
    return {
      objects: this.track.children.length,
      lanes: this._nPlayers,
      laneW: LANE_W,
      finishZ: FINISH_Z,
      potZ: POT_Z,
    };
  }

  /* ── teardown (lazy context — the page never holds it on 2D screens) ─ */
  dispose() {
    this.disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._ro?.disconnect();
    document.removeEventListener("visibilitychange", this._onVis);
    this.controls?.dispose();
    if (this.renderer) {
      try {
        this.renderer.dispose();
        const gl = this.renderer.getContext();
        if (gl.getExtension("WEBGL_lose_context")) this.renderer.forceContextLoss?.();
      } catch { /* already gone */ }
      this.renderer.domElement?.remove();
      this.renderer = null;
    }
    // free GPU resources
    this.scene?.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
      }
    });
    _glowTex = null;
    _confettiTex = null;
    _crownTex = null;
    this.scene = null;
  }
}
