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
export const COURSE_LEN = 60;   // start line → finish line
export const LANE_W = 1.7;      // lane width
export const START_Z = 3;       // start line z (runners run toward −Z)
export const FINISH_Z = START_Z - COURSE_LEN;
export const POT_Z = FINISH_Z - 6.5; // charity pot pedestal, past the finish
const RUNNER_H = 1.75;          // normalised avatar height

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
  grad.addColorStop(0, "#23262e");
  grad.addColorStop(0.55, "#1a1d23");
  grad.addColorStop(1, "#101216");
  g.fillStyle = grad;
  rr(6, 6, W - 12, H - 12, 26); g.fill();
  g.lineWidth = 8; g.strokeStyle = rarHex; g.stroke();
  // rarity strip
  g.fillStyle = rarHex;
  rr(22, 24, 86, 30, 8); g.fill();
  g.fillStyle = "#0b0c0e";
  g.font = "700 19px ui-monospace, monospace";
  g.fillText(name.length > 12 ? "CARD" : rarHex === "#ffc941" ? "LEGENDARY" : rarHex === "#b78cff" ? "EPIC" : rarHex === "#6ec1ff" ? "RARE" : "COMMON", 32, 45);
  // icon glyph
  g.font = "400 128px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = rarHex;
  g.fillText(glyph, W / 2, H * 0.48);
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
    this.runners = new Map();      // pid → runner state
    this.fx = [];                  // transient sprites {spr, vel, t, dur, kind}
    this.trail = [];               // lightning trail sprites
    this.mode = "follow";          // follow | orbit | podium
    this.modelsReady = false;
    this.disposed = false;
    this.dirty = true;             // reduced-motion render gate
    this._frameMs = [];            // rolling render cost (perf probe)
    this._clock = new THREE.Clock();
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
    scene.fog = new THREE.Fog(0x1c3247, 34, 230);

    const hemi = new THREE.HemisphereLight(0x8fb6ff, 0x24422b, 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.85);
    sun.position.set(-14, 22, 10);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xc6f32e, 0.35);
    rim.position.set(10, 6, -18);
    scene.add(rim);

    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);
    this.camera.position.set(0, 3.4, START_Z + 9);
    this.camera.lookAt(0, 1.1, START_Z - 4);
  }

  _buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = "none";
    this.host.appendChild(this.renderer.domElement);
    this._resize();
    this._ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    this._ro.observe(this.host);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.enabled = false; // follow mode drives the camera
  }

  _resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
      new THREE.MeshLambertMaterial({ color: 0x33383f })
    );
    slab.position.set(0, TRACK_TOP - TRACK_H / 2, START_Z - COURSE_LEN / 2 + 2);
    track.add(slab);

    // one lane strip per player, tier-tinted (subtle — reads as colour, not noise)
    players.forEach((p, i) => {
      const hex = new THREE.Color(this.tierHex(p.tier, p.isYou));
      hex.multiplyScalar(0.62);
      hex.lerp(new THREE.Color(0x33383f), 0.45);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(LANE_W - 0.12, TRACK_H * 0.55, COURSE_LEN + 8),
        new THREE.MeshLambertMaterial({ color: hex })
      );
      strip.position.set(this.laneX(i), TRACK_TOP + 0.004, START_Z - COURSE_LEN / 2 + 2);
      track.add(strip);
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
          new THREE.MeshLambertMaterial({ color: new THREE.Color(this.tierHex(p.tier, p.isYou)).multiplyScalar(0.9) })
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

        // name tag
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({
          map: labelTexture([p.name.toUpperCase()], { accent: this.tierHex(p.tier, p.isYou), bg: "rgba(10,11,13,0.66)" }),
          transparent: true, depthWrite: false,
        }));
        tag.scale.set(2.35, 0.56, 1);
        tag.position.y = 2.16;
        group.add(tag);

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
          group, tag, ring, shield, avatar: null, players: {}, clip: null,
          t: 0, target: 0, speed: 0, bobPhase: Math.random() * Math.PI * 2,
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
      r.target = Math.min(1, (row.rawReps ?? 0) / (this.targetReps || 1));
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
    this.dirty = true;
  }

  setCameraMode(mode) {
    this.mode = mode;
    if (mode === "orbit") {
      const lead = this._leader();
      this.controls.target.set(0, 1.2, (lead ? lead.group.position.z : START_Z) - 3);
      this.controls.enabled = true;
      this.controls.autoRotate = false;
      this.controls.update();
    } else {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
    }
    this.dirty = true;
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
    const ease = this.reduced ? 1 : 1 - Math.exp(-dt * 2.4);
    let leader = null;

    for (const [, r] of this.runners) {
      const prevT = r.t;
      r.t += (r.target - r.t) * ease;
      if (Math.abs(r.target - r.t) < 0.0012) r.t = r.target;
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

    // follow camera — behind the leader, looking down-course
    if (this.mode === "follow" && leader) {
      const lp = leader.group.position;
      const want = new THREE.Vector3(lp.x * 0.5, 3.15, lp.z + 7.2);
      const look = new THREE.Vector3(lp.x * 0.35, 1.15, lp.z - 5.5);
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 2.6));
      this._lookAt = this._lookAt ?? look.clone();
      this._lookAt.lerp(look, 1 - Math.exp(-dt * 3.2));
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
    this.scene = null;
  }
}
