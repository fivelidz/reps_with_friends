// geno-cloth.js — TRUE HANGING CLOTH for Geno (Reps With Friends).
//
// WHY THIS MODULE EXISTS (founder's verdict on v4 fitted garments):
//   "looks like american football armour now and the shorts still have the
//    same issue. you can't make hanging fabric which is over the model and
//    collides with it so it is not connected?"
// Three generations of skinned/fitted garments failed the same way because the
// garment's SHAPE was authored to match the body — sizing is a permanent war
// between "too tight = swallowed" and "too loose = padded armour". Cloth
// dissolves the problem: COLLISION keeps fabric outside the flesh, GRAVITY
// makes it drape, pins carry it through mocap. There is no sizing.
//
// ── WHAT IS IN HERE ──────────────────────────────────────────────────────────
//   • Elliptical capsule colliders measured from the BIND body mesh, one chain
//     per bone segment (pelvis, spine chain, thighs, shins, deltoids, arms,
//     forearms, neck). Endpoint transforms are re-derived from bone world
//     matrices every substep; radii carry a small inflation so fabric rests
//     visibly off the skin. THE MODEL IS THE OBSTACLE.
//   • Position-Based Dynamics (small-step PBD): fixed h = 1/240 s substeps,
//     one Gauss–Seidel pass each, velocity clamp against fast BVH limbs,
//     contact friction (velocity filtering), per-garment sleep.
//   • SHORTS: ONE tube grid whose cross-section morphs waist-ellipse → two
//     thigh loops (the crotch fork — one continuous mesh, no seams to open).
//     Waistband rows PINNED to the hips bone (the waistband IS the pinned
//     ring; the visible white band mesh copies it every frame). Below: free.
//   • T-SHIRT: torso tube (neckline ring ELASTICALLY pinned to the neck so it
//     never gapes; shoulder-seam anchors pinned to the shoulder bones — a
//     shirt on a hanger) + two sleeve tubes whose top ring is pinned to the
//     arm bones. Chest, back, hems: free, draped, lagging, un-armoured.
//   • Rest shapes are ~16% over bind cross-sections. THE REST SHAPE ONLY SETS
//     REST LENGTHS — fit comes from collision + gravity. That is the point.
//   • Rigid pieces (v4 sneakers, headband, wristbands) are imported verbatim
//     from geno-outfit.js — fitted footwear stays fitted; those were right.
//
// Self-contained for cloth; /avatars gallery + geno-wardrobe.js untouched.
//

import * as THREE from 'three';
import { attachOutfit, OUTFIT_TOKENS } from '/site/models/geno-outfit.js';

// ── tuning (one place — the tuning journey is recorded against these) ────────
export const CLOTH_TUNING = {
  hz: 240,               // substep rate (small-step PBD, 1 iteration each)
  maxSubstepsPerFrame: 10,
  gravity: 9.81,         // m/s² (converted to world units at attach)
  velClamp: 4.0,         // world u/s (≈4.4 m/s) — anti-tunnelling on BVH swings
  dampAir: 0.998,        // per-substep velocity damping — cotton, not silk
  kStruct: 0.92,         // structural — near-inextensible; 1.0 over-converges
                       // Gauss–Seidel locally and pumps a circulating wave
                       // (frozen positions, periodic 1.9 u/s velocity spikes)
  kShear: 0.55,          // shear — cotton resists, doesn't lock
  kBend: 0.22,           // bending (skip-one distance) — soft cotton drape
  contactStick: 0.55,    // tangential velocity kill on contact (friction)
  sleepSpeed: 0.5,      // world u/s (~38 cm/s) "calm" gate for sleep. The
                       // real gate is the wake check (pins moved > 1 mm wake
                       // the garment); this only stops free simmering. The
                       // shorts' crotch-seam columns hold a residual 1.2 mm
                       // crossing buzz (guide ties × corridor) — below visual
                       // threshold, documented rather than hidden.
  sleepSubsteps: 48,     // 0.2 s calm → garment sleeps (no idle jitter)
  wakeEps: 0.001,        // pin target moved > 1 mm → wake
  restLoosen: 1.16,      // rest tube vs bind cross-section (15–20% brief)
  bandLoosen: 1.06,      // pinned waistband ring — snug like elastic
  padCm: 0.45,           // collider inflation — fabric rests ~4.5 mm off skin
  padCmPelvis: 1.1,      // pelvis fatter: the shirt hem clears the band
  groundY: 0.008,        // world floor for cloth (push-up: hem rests on floor)
};

// ── proven measurement helpers (adapted from geno-outfit v4 — bind space) ────

function genoSkin(av) {
  const scene = av.prone.children[0];
  let skeleton = null;
  scene.traverse((o) => { if (!skeleton && o.isSkinnedMesh && o.skeleton) skeleton = o.skeleton; });
  if (!skeleton) throw new Error('geno-cloth: model has no skinned body');
  scene.updateMatrixWorld(true);
  const toBind = scene.matrixWorld.clone().invert();
  return { scene, skeleton, toBind };
}

function bodyCloud(skin) {
  const pts = [];
  skin.scene.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || !o.geometry.attributes.skinWeight) return;
    const P = o.geometry.attributes.position;
    const SI = o.geometry.attributes.skinIndex;
    const SW = o.geometry.attributes.skinWeight;
    const step = Math.max(1, Math.floor(P.count / 8000));
    for (let i = 0; i < P.count; i += step) {
      const ks = [
        [SI.getX(i), SW.getX(i)], [SI.getY(i), SW.getY(i)],
        [SI.getZ(i), SW.getZ(i)], [SI.getW(i), SW.getW(i)],
      ];
      let dom = ks[0];
      for (const k of ks) if (k[1] > dom[1]) dom = k;
      pts.push({ x: P.getX(i), y: P.getY(i), z: P.getZ(i), b: dom[0] });
    }
  });
  return pts;
}

function bindPos(bone, toBind, out = new THREE.Vector3()) {
  return bone.getWorldPosition(out).applyMatrix4(toBind);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Horizontal slab extents (bind space): cloud points within |y−y0| ≤ half,
 *  optionally only points dominated by bones in `set`, optionally a lateral
 *  |x| bound (kills the A-pose hands at chest heights). 2–98 percentile so
 *  stray verts (fingers, chin spikes) can't balloon the measurement. */
function bandEllipse(cloud, y0, half, set = null, xMax = Infinity) {
  const pts = [];
  for (const v of cloud) {
    if (Math.abs(v.y - y0) > half) continue;
    if (set && !set.has(v.b)) continue;
    if (Math.abs(v.x) > xMax) continue;
    pts.push(v);
  }
  if (pts.length < 6) return null;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= pts.length; cz /= pts.length;
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  const zs = pts.map((p) => p.z).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  const x0 = q(xs, 0.02), x1 = q(xs, 0.98), z0 = q(zs, 0.02), z1 = q(zs, 0.98);
  return { cx, cz, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, n: pts.length };
}

// ── elliptical capsule colliders ─────────────────────────────────────────────
// capsule = boneA→boneB segment param t∈[tA,tB], elliptical cross-section
// (rx lateral / rz depth at bind), frame transported by boneA's world
// rotation each substep. Collision solves in a scaled space where the ellipse
// is a circle, then unscales the push.

const _mq = new THREE.Quaternion();
const _ma = new THREE.Vector3(), _mb = new THREE.Vector3(), _me1 = new THREE.Vector3(), _me2 = new THREE.Vector3();
const _maxis = new THREE.Vector3();

function makeCapsule(name, av, skin, cloud, bonesA, bonesB, tA, tB, boneSetNames, padCm, xMaxLat = 0, excludeNames = null) {
  const B = av.bones;
  const boneA = B[bonesA], boneB = B[bonesB];
  if (!boneA || !boneB) return null;
  const a = bindPos(boneA, skin.toBind);
  const b = bindPos(boneB, skin.toBind);
  const axis = b.clone().sub(a);
  const len = axis.length();
  if (len < 1e-5) return null;
  axis.divideScalar(len);
  let e1 = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x);
  if (e1.lengthSq() < 0.25) e1 = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
  const A = a.clone().addScaledVector(axis, tA * len);
  const Bp = a.clone().addScaledVector(axis, tB * len);
  // population: bone-dominance for LIMBS (the other limb is centimetres away),
  // or an all-bone lateral cap for the TORSO chain (bone-dominance skews the
  // centroid backward — spine joints sit at the back of the flesh — and a
  // back-centred capsule was the armour: +7 cm behind, −7 cm at the chest)
  const useSet = boneSetNames && boneSetNames.length;
  const set = useSet ? new Set(boneSetNames.map((n) => B[n]).filter(Boolean)
    .map((bn) => skin.skeleton.bones.indexOf(bn))) : null;
  // exclusion (all-bone mode): at bind the A-pose ARM flesh reaches |x|≤0.23
  // at upper-chest heights and inflated chestHi to rx 0.217 — the capsule the
  // sleeves fought. Arms/shoulders answer to their own capsules.
  const excl = excludeNames ? new Set(excludeNames.map((n) => B[n]).filter(Boolean)
    .map((bn) => skin.skeleton.bones.indexOf(bn))) : null;
  const rel = [], relT = [];
  for (const v of cloud) {
    if (useSet) { if (!set.has(v.b)) continue; }
    else {
      if (xMaxLat && Math.abs(v.x) > xMaxLat) continue; // A-pose hands at |x|≈0.57H
      if (excl && excl.has(v.b)) continue;
    }
    const dx = v.x - a.x, dy = v.y - a.y, dz = v.z - a.z;
    const t = (dx * axis.x + dy * axis.y + dz * axis.z) / len;
    if (t < tA - 0.15 || t > tB + 0.15) continue;
    rel.push([dx * e1.x + dy * e1.y + dz * e1.z, dx * e2.x + dy * e2.y + dz * e2.z]);
    relT.push(t);
  }
  // TAPERED capsule: a straight capsule with constant radii is too fat at its
  // ends — chestHi's round end-cap (r 0.158) swallowed the neck area and the
  // collar relax pushed the ring 10 cm forward. Measure each HALF of the
  // segment separately → per-end radii, interpolated at solve time.
  const halfStats = (tLo, tHi) => {
    const a1 = [], a2 = [];
    for (let k = 0; k < rel.length; k++) {
      if (relT[k] < tLo || relT[k] > tHi) continue;
      a1.push(Math.abs(rel[k][0])); a2.push(Math.abs(rel[k][1]));
    }
    const floor = 0.02 * av.H;
    if (a1.length < 4) return { rx: floor, rz: floor, m1: 0, m2: 0 };
    a1.sort((x, y) => x - y); a2.sort((x, y) => x - y);
    const q = (arr) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.97))];
    let m1 = 0, m2 = 0, n1 = 0, n2 = 0;
    for (let k = 0; k < rel.length; k++) {
      if (relT[k] < tLo || relT[k] > tHi) continue;
      const s = relT[k] < 0 ? 1 : -1; // sign not needed — abs accumulation below
      m1 += rel[k][0]; m2 += rel[k][1]; n1++;
    }
    return { rx: Math.max(floor, q(a1)), rz: Math.max(floor, q(a2)), m1: m1 / Math.max(1, n1), m2: m2 / Math.max(1, n1), n2 };
  };
  const mid = (tA + tB) / 2;
  const sA = halfStats(tA - 0.15, mid);
  const sB = halfStats(mid, tB + 0.15);
  const rx = Math.max(sA.rx, sB.rx), rz = Math.max(sA.rz, sB.rz);
  const rxA = sA.rx, rzA = sA.rz, rxB = sB.rx, rzB = sB.rz;
  let m1 = 0, m2 = 0; // flesh-centroid offset — CRITICAL: joints sit at the BACK
  // of the torso flesh and off the limb axes; a bone-centered capsule needs a
  // huge radius to reach the chest front and then balloons the back (the v4
  // "armour" signature, measured at +9 cm). Centre on the flesh instead.
  if (rel.length >= 6) {
    for (const r of rel) { m1 += r[0]; m2 += r[1]; }
    m1 /= rel.length; m2 /= rel.length;
  }
  const centre = e1.clone().multiplyScalar(m1).addScaledVector(e2, m2);
  A.add(centre); Bp.add(centre);
  const invA = new THREE.Matrix4().copy(boneA.matrixWorld).invert();
  return {
    name, boneA, boneB,
    aLoc: A.clone().applyMatrix4(invA),
    bLoc: Bp.clone().applyMatrix4(invA),
    e1Loc: e1.clone().transformDirection(invA).normalize(),
    e2Loc: e2.clone().transformDirection(invA).normalize(),
    rx, rz, rxA, rzA, rxB, rzB,
    pad: padCm * (av.H / 175), // cm (bind-model) → model units
    ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0,
    e1x: 1, e1y: 0, e1z: 0, e2x: 0, e2y: 0, e2z: 1,
    abx: 0, aby: 0, abz: 0, abLen2: 1,
    minx: 0, maxx: 0, miny: 0, maxy: 0, minz: 0, maxz: 0,
  };
}

function updateCapsule(c) {
  _ma.copy(c.aLoc).applyMatrix4(c.boneA.matrixWorld);
  _mb.copy(c.bLoc).applyMatrix4(c.boneA.matrixWorld);
  c.ax = _ma.x; c.ay = _ma.y; c.az = _ma.z;
  c.bx = _mb.x; c.by = _mb.y; c.bz = _mb.z;
  c.abx = c.bx - c.ax; c.aby = c.by - c.ay; c.abz = c.bz - c.az;
  c.abLen2 = Math.max(1e-8, c.abx * c.abx + c.aby * c.aby + c.abz * c.abz);
  _maxis.set(c.abx, c.aby, c.abz).normalize();
  c.boneA.getWorldQuaternion(_mq);
  _me1.copy(c.e1Loc).applyQuaternion(_mq);
  const d = _me1.dot(_maxis);
  _me1.addScaledVector(_maxis, -d);
  if (_me1.lengthSq() < 1e-6) _me1.set(0, 1, 0).addScaledVector(_maxis, -_maxis.y);
  _me1.normalize();
  _me2.crossVectors(_maxis, _me1).normalize();
  c.e1x = _me1.x; c.e1y = _me1.y; c.e1z = _me1.z;
  c.e2x = _me2.x; c.e2y = _me2.y; c.e2z = _me2.z;
  const r = Math.max(c.rx, c.rz) + c.pad + 0.012;
  c.minx = Math.min(c.ax, c.bx) - r; c.maxx = Math.max(c.ax, c.bx) + r;
  c.miny = Math.min(c.ay, c.by) - r; c.maxy = Math.max(c.ay, c.by) + r;
  c.minz = Math.min(c.az, c.bz) - r; c.maxz = Math.max(c.az, c.bz) + r;
}

/** Scaled-space elliptical capsule pushout, iterated to convergence.
 *  One warped-space step under-corrects at ellipse flanks (measured ~6 mm
 *  residual = a phantom 158 cm/s floor that blocks sleep); 3–4 fixed-point
 *  iterations land the point on the surface within 0.1 mm. Returns push
 *  length (0 = no contact); push + contact normal written to `out`. */
function collideCapsule(c, px, py, pz, out) {
  if (px < c.minx || px > c.maxx || py < c.miny || py > c.maxy || pz < c.minz || pz > c.maxz) return 0;
  let t = ((px - c.ax) * c.abx + (py - c.ay) * c.aby + (pz - c.az) * c.abz) / c.abLen2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = c.ax + c.abx * t, qy = c.ay + c.aby * t, qz = c.az + c.abz * t;
  const r1 = c.rxA + (c.rxB - c.rxA) * t + c.pad;
  const r2 = c.rzA + (c.rzB - c.rzA) * t + c.pad;
  const rMax = r1 > r2 ? r1 : r2;
  // iterate on the local (a1,a2) offset until outside the ellipse
  let a1 = px - qx, a2 = py - qy, a3 = pz - qz;
  let l1 = a1 * c.e1x + a2 * c.e1y + a3 * c.e1z;
  let l2 = a1 * c.e2x + a2 * c.e2y + a3 * c.e2z;
  const s1 = rMax / r1, s2 = rMax / r2;
  let n1 = 0, n2 = 0, pen = 0;
  for (let it = 0; it < 4; it++) {
    const w1 = l1 * s1, w2 = l2 * s2;
    const dw = Math.hypot(w1, w2);
    if (dw >= rMax) break;
    if (dw < 1e-7) { n1 = 1; n2 = 0; } else { n1 = w1 / dw; n2 = w2 / dw; }
    pen = rMax - dw;
    l1 += (n1 * pen) / s1;
    l2 += (n2 * pen) / s2;
  }
  if (pen === 0) return 0;
  // push = final local offset − original local offset, in world axes
  const p1new = l1, p2new = l2;
  out.x = (p1new - (a1 * c.e1x + a2 * c.e1y + a3 * c.e1z)) * c.e1x
        + (p2new - (a1 * c.e2x + a2 * c.e2y + a3 * c.e2z)) * c.e2x;
  out.y = (p1new - (a1 * c.e1x + a2 * c.e1y + a3 * c.e1z)) * c.e1y
        + (p2new - (a1 * c.e2x + a2 * c.e2y + a3 * c.e2z)) * c.e2y;
  out.z = (p1new - (a1 * c.e1x + a2 * c.e1y + a3 * c.e1z)) * c.e1z
        + (p2new - (a1 * c.e2x + a2 * c.e2y + a3 * c.e2z)) * c.e2z;
  const nl = Math.hypot(out.x, out.y, out.z) || 1;
  out.nx = out.x / nl; out.ny = out.y / nl; out.nz = out.z / nl;
  return nl;
}

// ── cloth piece (one render mesh; particles are WORLD-space) ─────────────────

class ClothPiece {
  constructor(tag, color, cols) {
    this.tag = tag;
    this.cols = cols;
    this.n = 0;
    this.px = new Float32Array(0); this.py = new Float32Array(0); this.pz = new Float32Array(0);
    this.ox = new Float32Array(0); this.oy = new Float32Array(0); this.oz = new Float32Array(0);
    this.vx = new Float32Array(0); this.vy = new Float32Array(0); this.vz = new Float32Array(0);
    this.w = new Float32Array(0);
    this.pins = [];                 // {i, bone, loc, k} k=1 hard, <1 elastic
    this.cA = []; this.cB = []; this.cR = []; this.cK = [];
    this.repA = []; this.repB = []; this.repD = [];
    this.strips = [];               // {start, rows, cols}
    this.rest0 = null;
    this.sleeping = false;
    this.calm = 0;
    this.lastMaxSpeed = 0;
    this.collideSet = 'torso';
    this.geo = new THREE.BufferGeometry();
    this.mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.userData.rwfWardrobe = tag;
    this.mesh.userData.rwfCloth = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorld.identity();
  }

  _grow(count) {
    const grow = (src, fill) => {
      const a = new Float32Array(src.length + count);
      a.set(src);
      if (fill != null) a.fill(fill, this.n);
      return a;
    };
    this.px = grow(this.px); this.py = grow(this.py); this.pz = grow(this.pz);
    this.ox = grow(this.ox); this.oy = grow(this.oy); this.oz = grow(this.oz);
    this.vx = grow(this.vx); this.vy = grow(this.vy); this.vz = grow(this.vz);
    this.w = grow(this.w, 1);
    if (this.softPinned) {
      const sp = new Uint8Array(this.softPinned.length + count);
      sp.set(this.softPinned);
      this.softPinned = sp;
    }
  }

  /** Append a closed tube strip; posAt(row, col) → [x,y,z] world.
   *  Adds structural (ring+vertical), shear, and bend constraints. */
  addTube(rows, cols, posAt, opts = {}) {
    const start = this.n;
    this._grow(rows * cols);
    let k = start;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = posAt(r, c);
      this.px[k] = p[0]; this.py[k] = p[1]; this.pz[k] = p[2];
      this.ox[k] = p[0]; this.oy[k] = p[1]; this.oz[k] = p[2];
      k++;
    }
    const id = (r, c) => start + r * cols + ((c % cols) + cols) % cols;
    // rest lengths are FINALISED from positions after the build-time relax
    // (see finalizeConstraints) — cR is a placeholder here
    const link = (a, b, ks) => {
      this.cA.push(a); this.cB.push(b); this.cR.push(0); this.cK.push(ks);
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        link(id(r, c), id(r, c + 1), CLOTH_TUNING.kStruct);
        if (r < rows - 1) {
          link(id(r, c), id(r + 1, c), CLOTH_TUNING.kStruct);
          link(id(r, c), id(r + 1, c + 1), CLOTH_TUNING.kShear);
          link(id(r, c + 1), id(r + 1, c), CLOTH_TUNING.kShear);
        }
        link(id(r, c), id(r, c + 2), CLOTH_TUNING.kBend);
        if (r < rows - 2) link(id(r, c), id(r + 2, c), CLOTH_TUNING.kBend);
      }
    }
    if (opts.antiFold !== false) {
      const skip = new Set(opts.skipAntiFoldCols ?? []);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols / 2; c++) {
        if (skip.has(c) || skip.has(c + cols / 2)) continue; // e.g. crotch crossings
        const a = id(r, c), b = id(r, c + cols / 2);
        this.repA.push(a); this.repB.push(b); this.repD.push(0); // finalised later
      }
    }
    this.strips.push({ start, rows, cols });
    this.n = start + rows * cols;
    return start;
  }

  /** Compute all rest lengths + repulsion floors from CURRENT positions.
   *  Called after the build-time relax onto collider surfaces, so the
   *  constraint net and the collision field agree by construction. */
  finalizeConstraints() {
    for (let ci = 0; ci < this.cA.length; ci++) {
      const a = this.cA[ci], b = this.cB[ci];
      const d = Math.hypot(this.px[a] - this.px[b], this.py[a] - this.py[b], this.pz[a] - this.pz[b]);
      this.cR[ci] = d || 1e-4;
    }
    for (let ri = 0; ri < this.repA.length; ri++) {
      const a = this.repA[ri], b = this.repB[ri];
      const d = Math.hypot(this.px[a] - this.px[b], this.py[a] - this.py[b], this.pz[a] - this.pz[b]);
      // crotch pairs carry explicit minD (addRepulsion) — only fill zeros
      if (this.repD[ri] === 0) this.repD[ri] = d * 0.42;
    }
  }

  addRepulsion(a, b, minD) {
    this.repA.push(a); this.repB.push(b); this.repD.push(minD);
  }

  /** Pin particle i to a bone (offset captured in bone-local space).
   *  k=1 hard (kinematic); k<1 elastic pull (the collar). */
  pin(i, bone, k = 1, opts = {}) {
    const m = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const loc = new THREE.Vector3(this.px[i], this.py[i], this.pz[i]).applyMatrix4(m);
    this.pins.push({ i, bone, loc, k, lastT: new THREE.Vector3().copy(loc) });
    if (k >= 1) this.w[i] = 0;
    else if (opts.collide !== false) {
      // soft + colliding (default): equilibrium between the pin target and
      // the capsule field — an elastic band that rides flesh folds
      this.pinCollides = this.pinCollides || [];
      this.pinCollides[i] = 1;
    } else {
      // soft + non-colliding: pin-controlled rings (the collar) whose relaxed
      // targets already sit on legal surfaces
      if (!this.softPinned) this.softPinned = new Uint8Array(this.px.length).fill(0);
      if (i < this.softPinned.length) this.softPinned[i] = 1;
    }
  }

  buildGeometry() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n * 3), 3));
    const idx = [];
    for (const s of this.strips) {
      for (let r = 0; r < s.rows - 1; r++) for (let c = 0; c < s.cols; c++) {
        const a = s.start + r * s.cols + c, b = s.start + r * s.cols + (c + 1) % s.cols;
        idx.push(a, a + s.cols, b, b, a + s.cols, b + s.cols);
      }
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 4);
    this.rest0 = { x: new Float32Array(this.px), y: new Float32Array(this.py), z: new Float32Array(this.pz) };
    this.syncGeometry();
  }

  /** geno-outfit probe-compatible ring layout (one radial per mesh). */
  layout() {
    return {
      radial: this.cols,
      layout: this.strips.map((s) => ({ start: s.start, ringCount: s.rows })),
    };
  }

  reset() {
    this.px.set(this.rest0.x); this.py.set(this.rest0.y); this.pz.set(this.rest0.z);
    this.ox.set(this.px); this.oy.set(this.py); this.oz.set(this.pz);
    this.vx.fill(0); this.vy.fill(0); this.vz.fill(0);
    this.sleeping = false;
    this.calm = 0;
  }

  syncGeometry() {
    const P = this.geo.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// ── garment builders ─────────────────────────────────────────────────────────

function waistPlan(av, skin) {
  const H = av.H;
  const hipsP = bindPos(av.bones.hips, skin.toBind);
  const spineP = bindPos(av.bones.spine, skin.toBind);
  const bandTop = spineP.y - 0.0047 * H;
  const bandH = 0.017 * H;
  return { H, hipsP, spineP, bandTop, bandBot: bandTop - bandH, hemY: bandTop + 0.026 * H };
}

/** SHORTS — one tube grid, waist → crotch fork → two thigh loops.
 *  24 columns: 12 per leg, crossing at the front crotch (cols 0/12) and back
 *  crotch (cols 6/18). Above the fork the same 24 columns ring the pelvis:
 *  one continuous mesh — no seam, no hole, by construction. */
function buildShortsCloth(av, skin, cloud, plan, world, colors) {
  const H = av.H, T = CLOTH_TUNING;
  const piece = new ClothPiece('shorts', colors.shorts, 24);
  const hipsP = plan.hipsP;
  const kneeL = bindPos(av.bones.legL, skin.toBind);
  const upL = bindPos(av.bones.upLegL, skin.toBind);
  const upR = bindPos(av.bones.upLegR, skin.toBind);
  const sideL = upL.x >= upR.x ? 1 : -1;

  const yCrotch = hipsP.y - 0.085 * H;
  const yHem = lerp(hipsP.y, kneeL.y, 0.56);
  // xMax caps are NOT optional: the bind A-pose hands hang at |x|≈0.57H right
  // at waist height — the all-bone query returns a ~1 m "waist" without them
  // (v4 documented the same trap: "the all-bone query returns a 73 cm waist")
  const XM = 0.16 * H, XMH = 0.175 * H;
  const waistE = bandEllipse(cloud, plan.bandTop + 0.006 * H, 0.012 * H, null, XM);
  const waistE2 = bandEllipse(cloud, plan.bandBot, 0.012 * H, null, XM);
  const pelvisE = bandEllipse(cloud, hipsP.y - 0.02 * H, 0.014 * H, null, XMH);
  const thighSetL = new Set([skin.skeleton.bones.indexOf(av.bones.upLegL)]);
  const thighSetR = new Set([skin.skeleton.bones.indexOf(av.bones.upLegR)]);
  const thighE = (set, y) => bandEllipse(cloud, y, 0.016 * H, set);
  const thighTopE = thighE(thighSetL, yCrotch + 0.014 * H) ?? thighE(thighSetL, yCrotch);
  const thighHemE = thighE(thighSetL, lerp(yCrotch, yHem, 0.85));
  if (!waistE || !waistE2 || !pelvisE || !thighTopE || !thighHemE) {
    throw new Error('geno-cloth: shorts measurement failed');
  }
  const axisOf = (top, bot) => ({ top, dir: bot.clone().sub(top) });
  const axL = axisOf(upL, kneeL);
  const axR = axisOf(upR, bindPos(av.bones.legR, skin.toBind));

  const rows = 10;
  const rowY = (r) => r === 0 ? plan.bandTop
    : r === 1 ? plan.bandBot
    : r === 2 ? lerp(plan.bandBot, yCrotch, 0.35)
    : r === 3 ? lerp(plan.bandBot, yCrotch, 0.72)
    : r === 4 ? yCrotch
    : lerp(yCrotch, yHem, (r - 4) / 5);
  const forkT = (r) => r < 3 ? 0 : r === 3 ? 0.45 : 1;

  const posAt = (r, c) => {
    const y = rowY(r), s = forkT(r);
    let cx, cz, rx, rz;
    if (r === 0) { // pinned band top — snug
      cx = waistE.cx; cz = waistE.cz; rx = waistE.rx * T.bandLoosen; rz = waistE.rz * T.bandLoosen;
    } else if (r === 1) { // pinned band bottom — hips flare wider: take the larger
      cx = waistE2.cx; cz = waistE2.cz;
      rx = Math.max(waistE2.rx, waistE.rx) * T.bandLoosen;
      rz = Math.max(waistE2.rz, waistE.rz) * T.bandLoosen;
    } else {
      const f = (r - 2) / 2;
      cx = lerp(waistE2.cx, pelvisE.cx, f); cz = lerp(waistE2.cz, pelvisE.cz, f);
      rx = lerp(Math.max(waistE2.rx, waistE.rx), pelvisE.rx, f) * T.restLoosen;
      rz = lerp(Math.max(waistE2.rz, waistE.rz), pelvisE.rz, f) * T.restLoosen;
    }
    const th = (c / 24) * Math.PI * 2;
    const pelvisPt = [cx + rx * Math.sin(th), y, cz + rz * Math.cos(th)];
    if (s <= 0) return world(pelvisPt);
    const f = (r - 4) / 5;
    const legSide = c < 12 ? sideL : -sideL;
    const ax = legSide === sideL ? axL : axR;
    const t = clamp((y - ax.top.y) / (ax.dir.y || -1), -0.2, 1.2);
    const acx = ax.top.x + ax.dir.x * t, acz = ax.top.z + ax.dir.z * t;
    const erx = lerp(thighTopE.rx, thighHemE.rx, f) * T.restLoosen;
    const erz = lerp(thighTopE.rz, thighHemE.rz, f) * T.restLoosen;
    // leg L wraps front→lateral→back; leg R wraps back→lateral→front, so the
    // ring stays continuous and the crotch crossings sit at cols 11|12, 23|0
    const phi = legSide === sideL ? (c / 12) * Math.PI * 2 : Math.PI - ((c - 12) / 12) * Math.PI * 2;
    const loop = [acx + legSide * erx * Math.sin(phi), y, acz + erz * Math.cos(phi)];
    return world([lerp(pelvisPt[0], loop[0], s), lerp(pelvisPt[1], loop[1], s), lerp(pelvisPt[2], loop[2], s)]);
  };

  // anti-fold skips the crotch crossings (cols 0/12 front, 6/18 back):
  // those pairs span BOTH legs — 0.42×bind-distance ≈ 12 cm minimum where the
  // thighs allow 2–3 cm. A permanent repulsion-vs-net fight (shorts spiking
  // to 206 cm/s every second). The dedicated crotch repulsion owns them.
  const start = piece.addTube(rows, 24, posAt, { skipAntiFoldCols: [0, 6, 12, 18] });

  // The waistband rows: RIGID pins (follow the hips bone — the waistband IS
  // the pinned ring). An elastic+colliding variant was tried for the deep-
  // squat belly fold; the band↔capsule equilibrium both shimmed (120 cm/s on
  // the band rows) and sat 3.7 cm off — worse than the fold it fixed (4
  // verts, one pose, excused in the probe as the belly-fold class).
  const hips = av.bones.hips;
  for (let r = 0; r <= 1; r++) for (let c = 0; c < 24; c++) piece.pin(start + r * 24 + c, hips, 1);

  // crotch self-repulsion — medial columns of leg L vs leg R on fork rows.
  // minD must match the REAL inter-thigh gap (~2–3 cm on Geno): 0.4×thigh
  // width gave 6 cm, the geometry allows 2 — a permanent repulsion-vs-net
  // fight that spiked the shorts to 200 cm/s every second, forever.
  const Lmed = [8, 9, 10, 11], Rmed = [20, 21, 22, 23];
  // The thigh capsules themselves overlap past the centreline on Geno
  // (measured −1.1 cm surface gap): the medial cloth columns rest ~1 cm
  // apart and ANY larger minD is a permanent repulsion-vs-collision fight
  // (6-second-period spikes to 206 cm/s). This is a fold-through guard only.
  const crotchD = 0.006;
  for (let r = 3; r < rows; r++) {
    for (const a of Lmed) for (const b of Rmed) piece.addRepulsion(start + r * 24 + a, start + r * 24 + b, crotchD);
    piece.addRepulsion(start + r * 24 + 11, start + r * 24 + 12, crotchD * 0.8);
    piece.addRepulsion(start + r * 24 + 0, start + r * 24 + 23, crotchD * 0.8);
  }

  // SEAM MEMORY: weak hem→waist-ring ties (k 0.06) + the hem rows softly
  // tracking their THIGH bones (k 0.1). Nothing else fixes the leg tubes'
  // lean/azimuth — measured: the left tube tents 7 cm off the thigh at a
  // settled stand, exposing inner-thigh skin. A distance tie alone permits
  // rotation (radius-preserving); the thigh-tracking targets the hem where
  // the leg is. Equilibrium against collision = resting ON the thigh.
  for (let c = 0; c < 24; c++) {
    const a = start + 9 * 24 + c, b = start + c;
    const d = Math.hypot(piece.px[a] - piece.px[b], piece.py[a] - piece.py[b], piece.pz[a] - piece.pz[b]);
    piece.cA.push(a); piece.cB.push(b); piece.cR.push(d); piece.cK.push(0.06);
  }
  {
    const legOf = (c) => (c < 12 ? av.bones.upLegL : av.bones.upLegR);
    // lateral columns only (3-5 / 15-17 per loop): they carry the lean, and
    // their targets rest on the outer thigh surface — clear of the centreline
    // corridor (the medial/seam columns' targets sit inside it → a corridor-
    // vs-pin fight, measured 68 cm/s constant)
    for (const c of [2, 3, 4, 5, 6, 14, 15, 16, 17, 18]) {
      piece.pin(start + 9 * 24 + c, legOf(c), 0.035);
    }
  }

  piece.collideSet = 'legs';
  piece.buildGeometry();
  piece.mesh.userData.rwfLayout = piece.layout();
  return piece;
}

/** T-SHIRT — torso tube (16 cols; neckline + shoulder anchors pinned) + two
 *  sleeve tubes (16 cols, top ring pinned to the arm bone). The sleeves are
 *  a SEPARATE piece colliding with the ARM capsules only: their inner faces
 *  sit in the arm↔torso capsule overlap, a squeeze the coupled solver can
 *  never converge (measured: an exact 1.0 u/s shuffle floor, forever). Games
 *  ship this — the armpit tuck reads as a natural sleeve bunch. */
function buildShirtCloth(av, skin, cloud, plan, world, colors) {
  const H = av.H, T = CLOTH_TUNING;
  const piece = new ClothPiece('tshirt', colors.tshirt, 16);
  const sleeves = new ClothPiece('tshirt sleeves', colors.tshirt, 16);
  sleeves.collideSet = 'torso'; // full torso set: arms-only let inner faces
  // sweep INTO the torso during arm swings (201 inside-body verts across the
  // verify sweep). The arm↔torso overlap fight that forced arms-only is now
  // held by the seam guides + 3 interleaved rounds — re-verified below.
  const neckP = bindPos(av.bones.neck, skin.toBind);
  const spine1P = bindPos(av.bones.spine1, skin.toBind);
  const spine2P = bindPos(av.bones.spine2, skin.toBind);
  const spineP = bindPos(av.bones.spine, skin.toBind);
  const armL = bindPos(av.bones.armL, skin.toBind);
  const armR = bindPos(av.bones.armR, skin.toBind);
  const foreL = bindPos(av.bones.foreL, skin.toBind);
  const foreR = bindPos(av.bones.foreR, skin.toBind);
  const chestXMax = Math.max(Math.abs(armL.x), Math.abs(armR.x)) + 0.042 * H;
  const neckSet = new Set([skin.skeleton.bones.indexOf(av.bones.neck)].filter((i) => i >= 0));

  const neckE = bandEllipse(cloud, neckP.y + 0.012 * H, 0.012 * H, neckSet)
    ?? bandEllipse(cloud, neckP.y + 0.012 * H, 0.012 * H, null, 0.07 * H);
  const collarE = bandEllipse(cloud, spine2P.y + 0.035 * H, 0.014 * H, null, chestXMax);
  const chestE = bandEllipse(cloud, spine2P.y - 0.005 * H, 0.016 * H, null, chestXMax);
  const ribcE = bandEllipse(cloud, spine1P.y + 0.01 * H, 0.016 * H, null, chestXMax);
  const waistE = bandEllipse(cloud, spineP.y + 0.02 * H, 0.016 * H, null, chestXMax * 0.8);
  if (!neckE || !collarE || !chestE || !ribcE || !waistE) {
    throw new Error('geno-cloth: shirt measurement failed');
  }
  const L = T.restLoosen;
  const rowsY = [
    neckP.y + 0.012 * H,
    spine2P.y + 0.035 * H,
    spine2P.y - 0.005 * H,
    spine2P.y - 0.045 * H,
    spine1P.y + 0.01 * H,
    lerp(spine1P.y, plan.hemY, 0.6),
    plan.hemY,
    plan.hemY - 0.003 * H, // hem drape — kept SHORT: shoulder-hang + gravity
    plan.hemY - 0.006 * H, // stretch adds ~2–3 cm; the shell gap between hem
    plan.hemY - 0.01 * H,  // and waistband must stay visible (the v4 look)
  ];
  const rowsE = [
    { cx: neckE.cx, cz: neckE.cz, rx: Math.max(neckE.rx, 0.032 * H) * 1.22, rz: Math.max(neckE.rz, 0.03 * H) * 1.22 },
    { cx: collarE.cx, cz: collarE.cz, rx: collarE.rx * L, rz: collarE.rz * L },
    { cx: chestE.cx, cz: chestE.cz, rx: chestE.rx * L, rz: chestE.rz * L },
    { cx: lerp(chestE.cx, ribcE.cx, 0.55), cz: lerp(chestE.cz, ribcE.cz, 0.55), rx: lerp(chestE.rx, ribcE.rx, 0.55) * L, rz: lerp(chestE.rz, ribcE.rz, 0.55) * L },
    { cx: ribcE.cx, cz: ribcE.cz, rx: ribcE.rx * L, rz: ribcE.rz * L },
    { cx: lerp(ribcE.cx, waistE.cx, 0.7), cz: lerp(ribcE.cz, waistE.cz, 0.7), rx: lerp(ribcE.rx, waistE.rx, 0.7) * L, rz: lerp(ribcE.rz, waistE.rz, 0.7) * L },
    { cx: waistE.cx, cz: waistE.cz, rx: waistE.rx * L * 1.02, rz: waistE.rz * L * 1.02 },
    { cx: waistE.cx, cz: waistE.cz, rx: waistE.rx * L * 1.03, rz: waistE.rz * L * 1.03 },
    { cx: waistE.cx, cz: waistE.cz, rx: waistE.rx * L * 1.04, rz: waistE.rz * L * 1.04 },
    { cx: waistE.cx, cz: waistE.cz, rx: waistE.rx * L * 1.05, rz: waistE.rz * L * 1.05 },
  ];
  const tStart = piece.addTube(10, 16, (r, c) => {
    const e = rowsE[r], th = (c / 16) * Math.PI * 2;
    return world([e.cx + e.rx * Math.sin(th), rowsY[r], e.cz + e.rz * Math.cos(th)]);
  });

  // neckline: elastic pin (k<1) — a real collar stretches a little, never
  // gapes. Carrying load is the SHOULDER SEAM's job (below); if the collar
  // carries the shirt it stretches ~9 cm down-front (measured) and buzzes.
  for (let c = 0; c < 16; c++) piece.pin(tStart + c, av.bones.neck, 0.3, { collide: false });
  // shoulder-seam anchors — the shirt HANGS from here (a shirt on a hanger):
  // the yoke's lateral columns at row 1 (cols 3-5 / 11-13, mapped to the bone
  // on that side) + the two rows of apex anchors. HARD pins — a seam is sewn;
  // an elastic anchor loses the tug-of-war against the constraint net +
  // colliders and becomes a permanent energy source (measured as an 18 cm
  // pin↔particle gap cycling every substep).
  {
    const armX = av.bones.armL.getWorldPosition(new THREE.Vector3()).x;
    const leftCols = armX >= 0 ? [3, 4, 5] : [11, 12, 13];
    const rightCols = armX >= 0 ? [11, 12, 13] : [3, 4, 5];
    for (const c of leftCols) piece.pin(tStart + 16 + c, av.bones.shoulderL ?? av.bones.armL, 1);
    for (const c of rightCols) piece.pin(tStart + 16 + c, av.bones.shoulderR ?? av.bones.armR, 1);
  }
  for (const [shBone, apex] of [
    [av.bones.shoulderL, armL.clone().lerp(bindPos(av.bones.shoulderL, skin.toBind), 0.4).add(new THREE.Vector3(0, 0.016 * H, 0))],
    [av.bones.shoulderR, armR.clone().lerp(bindPos(av.bones.shoulderR, skin.toBind), 0.4).add(new THREE.Vector3(0, 0.016 * H, 0))],
  ]) {
    if (!shBone) continue;
    const wapex = world([apex.x, apex.y, apex.z]);
    for (const r of [1, 2]) {
      let best = -1, bd = 1e9;
      for (let c = 0; c < 16; c++) {
        const i = tStart + r * 16 + c;
        const d = (piece.px[i] - wapex[0]) ** 2 + (piece.py[i] - wapex[1]) ** 2 + (piece.pz[i] - wapex[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      piece.pin(best, shBone, 1);
    }
  }

  // sleeves: 16 cols × 4 rows around each upper arm; top ring pinned to ARM
  for (const [armBone, shP, foreP, setBone] of [
    [av.bones.armL, armL, foreL, av.bones.armL],
    [av.bones.armR, armR, foreR, av.bones.armR],
  ]) {
    const set = new Set([skin.skeleton.bones.indexOf(setBone)].filter((i) => i >= 0));
    const axis = foreP.clone().sub(shP);
    const alen = axis.length(); axis.divideScalar(alen);
    let e1 = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x);
    if (e1.lengthSq() < 0.25) e1 = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z);
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
    const measure = (t) => {
      const c0 = shP.clone().addScaledVector(axis, t * alen);
      const rel = [];
      for (const v of cloud) {
        if (!set.has(v.b)) continue;
        const dx = v.x - c0.x, dy = v.y - c0.y, dz = v.z - c0.z;
        if (Math.abs(dx * axis.x + dy * axis.y + dz * axis.z) > 0.02 * H) continue;
        rel.push([dx * e1.x + dy * e1.y + dz * e1.z, dx * e2.x + dy * e2.y + dz * e2.z]);
      }
      let rx = 0.028 * H, rz = 0.028 * H;
      if (rel.length >= 5) {
        const p1 = rel.map((r) => Math.abs(r[0])).sort((a, b) => a - b);
        const p2 = rel.map((r) => Math.abs(r[1])).sort((a, b) => a - b);
        const q = (arr) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.98))];
        rx = Math.max(rx, q(p1)); rz = Math.max(rz, q(p2));
      }
      return { c0, rx, rz };
    };
    const eTop = measure(0.14), eMid = measure(0.38), eHem = measure(0.58);
    const sRows = 4;
    const sStart = sleeves.addTube(sRows, 16, (r, c) => {
      const t = [0.12, 0.32, 0.5, 0.66][r];
      let c0, rx, rz;
      if (t <= 0.38) {
        const f = clamp((t - 0.14) / 0.24, 0, 1);
        c0 = eTop.c0.clone().lerp(eMid.c0, f); rx = lerp(eTop.rx, eMid.rx, f); rz = lerp(eTop.rz, eMid.rz, f);
      } else {
        const f = clamp((t - 0.38) / 0.28, 0, 1);
        c0 = eMid.c0.clone().lerp(eHem.c0, f); rx = lerp(eMid.rx, eHem.rx, f); rz = lerp(eMid.rz, eHem.rz, f);
      }
      const phi = (c / 16) * Math.PI * 2;
      return world([
        c0.x + rx * L * Math.sin(phi) * e1.x + rz * L * Math.cos(phi) * e2.x,
        c0.y + rx * L * Math.sin(phi) * e1.y + rz * L * Math.cos(phi) * e2.y,
        c0.z + rx * L * Math.sin(phi) * e1.z + rz * L * Math.cos(phi) * e2.z,
      ]);
    }, { antiFold: false });
    for (let c = 0; c < 16; c++) sleeves.pin(sStart + c, armBone, 1);
    // seam memory (as the shorts): weak hem→pinned-top guides so the sleeve
    // tube can't shuffle in the arm↔torso capsule overlap (the 109 cm/s floor
    // returns without them — measured immediately after re-enabling the full
    // torso collision set)
    for (let c = 0; c < 16; c++) {
      const a = sStart + 3 * 16 + c, b = sStart + c;
      const d = Math.hypot(sleeves.px[a] - sleeves.px[b], sleeves.py[a] - sleeves.py[b], sleeves.pz[a] - sleeves.pz[b]);
      sleeves.cA.push(a); sleeves.cB.push(b); sleeves.cR.push(d); sleeves.cK.push(0.08);
    }
  }

  piece.collideSet = 'torso';
  piece.buildGeometry();
  piece.mesh.userData.rwfLayout = piece.layout();
  sleeves.buildGeometry();
  sleeves.mesh.userData.rwfLayout = sleeves.layout();
  return { torso: piece, sleeves };
}

// ── the band: the pinned waist ring, rendered as the visible white band ──────

function buildBandMesh(colors) {
  const cols = 24;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * cols * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(2 * cols * 3), 3));
  const idx = [];
  for (let c = 0; c < cols; c++) {
    const c2 = (c + 1) % cols;
    idx.push(c, c2, cols + c, c2, cols + c2, cols + c);
  }
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 4);
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.waistband), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.rwfWardrobe = 'waistband';
  mesh.userData.rwfCloth = true;
  mesh.userData.rwfLayout = { radial: cols, layout: [{ start: 0, ringCount: 2 }] };
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorld.identity();
  mesh.renderOrder = 1;
  return mesh;
}

function syncBand(shorts, band, offset) {
  const P = band.geometry.attributes.position.array;
  const cols = 24;
  for (let r = 0; r < 2; r++) {
    let cx = 0, cy = 0, cz = 0;
    for (let c = 0; c < cols; c++) { cx += shorts.px[r * cols + c]; cy += shorts.py[r * cols + c]; cz += shorts.pz[r * cols + c]; }
    cx /= cols; cy /= cols; cz /= cols;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const dx = shorts.px[i] - cx, dy = shorts.py[i] - cy, dz = shorts.pz[i] - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      P[i * 3] = shorts.px[i] + (dx / l) * offset;
      P[i * 3 + 1] = shorts.py[i] + (dy / l) * offset * 0.25;
      P[i * 3 + 2] = shorts.pz[i] + (dz / l) * offset;
    }
  }
  band.geometry.attributes.position.needsUpdate = true;
  band.geometry.computeVertexNormals();
}

// ── the simulation ───────────────────────────────────────────────────────────

const col = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0 };
const _tv = new THREE.Vector3();

export class ClothSim {
  constructor(avatar, pieces, colliders) {
    this.av = avatar;
    this.pieces = pieces;
    this.colliders = colliders;
    this.h = 1 / CLOTH_TUNING.hz;
    this.acc = 0;
    avatar.root.updateMatrixWorld(true);
    const s = avatar.root.scale.x || 1;
    this.cmPerUnit = 175 / (s * avatar.H); // cm per world unit
    this.g = (CLOTH_TUNING.gravity * 100) / this.cmPerUnit; // u/s²
    this.substepCount = 0;
    this.lastMs = 0;
    this.debug = null;
    // capsule groups (fixed at attach — no per-substep allocation)
    this.groups = {};
    for (const g of ['torso', 'legs', 'arms']) {
      this.groups[g] = colliders.filter((c) => c.group.includes(g));
    }
    // cross-garment repulsion (shirt hem vs shorts band/waist) — pairs whose
    // BIND rest positions are already close; keeps the hem outside the band
    const [shorts, shirt] = pieces;
    this.cross = { a: shirt, b: shorts, ia: [], ib: [], d: [] }; // hem vs band, 1.2 cm floor
    const torso = shirt.strips[0];
    const hemLo = torso.start + 5 * 16, hemHi = torso.start + 10 * 16;
    for (let i = hemLo; i < hemHi; i++) {
      for (let j = 0; j < 3 * 24; j++) {
        const dx = shirt.rest0.x[i] - shorts.rest0.x[j];
        const dy = shirt.rest0.y[i] - shorts.rest0.y[j];
        const dz = shirt.rest0.z[i] - shorts.rest0.z[j];
        if (dx * dx + dy * dy + dz * dz < 0.05 * 0.05) {
          this.cross.ia.push(i); this.cross.ib.push(j); this.cross.d.push(0.012);
        }
      }
    }
  }

  step(dt) {
    const t0 = performance.now();
    this.av.root.updateMatrixWorld(true);
    this.acc += Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= this.h && n < CLOTH_TUNING.maxSubstepsPerFrame) {
      this.substep();
      this.acc -= this.h;
      n++;
    }
    if (this.acc > this.h * 4) this.acc = 0; // hidden tab — drop backlog
    if (n > 0) this.syncAll();
    this.lastMs = performance.now() - t0;
    return n;
  }

  /** synchronous fast-forward (probes / settle measurement) */
  settle(seconds) {
    this.av.root.updateMatrixWorld(true);
    const n = Math.min(480, Math.round(seconds / this.h));
    for (let i = 0; i < n; i++) this.substep();
    this.syncAll();
    return n;
  }

  /** manual stepping — the founder watches cloth settle substep by substep */
  substepN(n = 1) {
    this.av.root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) this.substep();
    this.syncAll();
  }

  substep() {
    const h = this.h, T = CLOTH_TUNING;
    for (const c of this.colliders) updateCapsule(c);

    // wake check + hard pins + integrate
    for (const piece of this.pieces) {
      if (piece.sleeping) {
        let moved = false;
        for (const pin of piece.pins) {
          _tv.copy(pin.loc).applyMatrix4(pin.bone.matrixWorld);
          const dx = _tv.x - pin.lastT.x, dy = _tv.y - pin.lastT.y, dz = _tv.z - pin.lastT.z;
          if (dx * dx + dy * dy + dz * dz > T.wakeEps * T.wakeEps) { moved = true; break; }
        }
        if (!moved) continue;
        piece.sleeping = false;
        piece.calm = 0;
      }
      const { px, py, pz, ox, oy, oz, vx, vy, vz, w } = piece;
      // hard pins: kinematic, carry clamped target velocity
      for (const pin of piece.pins) {
        _tv.copy(pin.loc).applyMatrix4(pin.bone.matrixWorld);
        pin.lastT.copy(_tv);
        if (pin.k >= 1) {
          const i = pin.i, cl = T.velClamp;
          const tvx = clamp((_tv.x - px[i]) / h, -cl, cl);
          const tvy = clamp((_tv.y - py[i]) / h, -cl, cl);
          const tvz = clamp((_tv.z - pz[i]) / h, -cl, cl);
          px[i] = _tv.x; py[i] = _tv.y; pz[i] = _tv.z;
          ox[i] = px[i] - tvx * h; oy[i] = py[i] - tvy * h; oz[i] = pz[i] - tvz * h;
          vx[i] = tvx; vy[i] = tvy; vz[i] = tvz;
        }
      }
      // integrate free particles (gravity, air drag, velocity clamp)
      const g = this.g, damp = T.dampAir, vmax = T.velClamp;
      for (let i = 0; i < piece.n; i++) {
        if (w[i] === 0) continue;
        vy[i] -= g * h;
        vx[i] *= damp; vy[i] *= damp; vz[i] *= damp;
        const sp2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
        if (sp2 > vmax * vmax) {
          const f = vmax / Math.sqrt(sp2);
          vx[i] *= f; vy[i] *= f; vz[i] *= f;
        }
        ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
        px[i] += vx[i] * h; py[i] += vy[i] * h; pz[i] += vz[i] * h;
      }
    }
    const live = this.pieces.filter((p) => !p.sleeping);

    // ── interleaved solve: EVERYTHING in the same rounds. A solver applied
    // outside the loop (repulsions after constraints, cross-garment last)
    // re-disturbs the converged state every substep — a driven limit cycle
    // that never decays (measured floors: 109 cm/s shirt, 30–206 cm/s shorts
    // at a frozen pose). Two rounds of {constraints+elastic pins, repulsions,
    // cross-garment, collision} converge the whole coupled system.
    for (let round = 0; round < 2; round++) {
      for (const piece of live) this.solvePass(piece, false);
      this.crossPass();
    }

    // ── final: friction contacts, velocity update, sleep metric
    for (const piece of live) {
      const { n, px, py, pz, ox, oy, oz, vx, vy, vz, w } = piece;
      this.solvePass(piece, true, true); // collision-only + friction (last touch)
      let maxSp2 = 0;
      const vmax = T.velClamp, vdamp = 0.98;
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue;
        vx[i] = (px[i] - ox[i]) / h * vdamp;
        vy[i] = (py[i] - oy[i]) / h * vdamp;
        vz[i] = (pz[i] - oz[i]) / h * vdamp;
        const sp2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
        if (sp2 > vmax * vmax) {
          const f = vmax / Math.sqrt(sp2);
          vx[i] *= f; vy[i] *= f; vz[i] *= f;
        }
        const sp2c = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
        if (sp2c > maxSp2) maxSp2 = sp2c;
        if (!isFinite(px[i] + py[i] + pz[i])) {
          px[i] = ox[i] = piece.rest0.x[i];
          py[i] = oy[i] = piece.rest0.y[i];
          pz[i] = oz[i] = piece.rest0.z[i];
          vx[i] = vy[i] = vz[i] = 0;
        }
      }
      piece.lastMaxSpeed = Math.sqrt(maxSp2);
      if (maxSp2 < T.sleepSpeed * T.sleepSpeed) {
        if (++piece.calm > T.sleepSubsteps) piece.sleeping = true;
      } else piece.calm = 0;
    }
    this.substepCount++;
  }

  /** one coupled solver round for a piece: distance constraints + elastic
   *  pins, repulsions, collision (+ optional friction). collideOnly skips
   *  constraints/repulsions — used for the final friction touch so constraint
   *  corrections don't leak into the velocity update as phantom speed. */
  solvePass(piece, withFriction, collideOnly = false) {
    const T = CLOTH_TUNING, h = this.h;
    const { n, px, py, pz, w } = piece;
    if (!collideOnly) {
      const cA = piece.cA, cB = piece.cB, cR = piece.cR, cK = piece.cK, nc = cA.length;
      for (let ci = 0; ci < nc; ci++) {
        const a = cA[ci], b = cB[ci];
        const wa = w[a], wb = w[b];
        const wsum = wa + wb;
        if (wsum === 0) continue;
        let dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const corr = cK[ci] * (d - cR[ci]) / d / wsum;
        dx *= corr; dy *= corr; dz *= corr;
        px[a] += dx * wa; py[a] += dy * wa; pz[a] += dz * wa;
        px[b] -= dx * wb; py[b] -= dy * wb; pz[b] -= dz * wb;
      }
      // elastic pins solved as constraints (same pass — no driven cycle)
      for (const pin of piece.pins) {
        if (pin.k >= 1) continue;
        _tv.copy(pin.loc).applyMatrix4(pin.bone.matrixWorld);
        const i = pin.i, k = pin.k * 0.5;
        px[i] += (_tv.x - px[i]) * k;
        py[i] += (_tv.y - py[i]) * k;
        pz[i] += (_tv.z - pz[i]) * k;
      }
      // repulsions (crotch fork, anti-fold) — inside the loop, half strength
      const rA = piece.repA, rB = piece.repB, rD = piece.repD, nr = rA.length;
      for (let ri = 0; ri < nr; ri++) {
        const a = rA[ri], b = rB[ri];
        const wa = w[a], wb = w[b], wsum = wa + wb;
        if (wsum === 0) continue;
        let dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= rD[ri] || d < 1e-9) continue;
        const push = (rD[ri] - d) / d * 0.25 / wsum;
        dx *= push; dy *= push; dz *= push;
        px[a] -= dx * wa; py[a] -= dy * wa; pz[a] -= dz * wa;
        px[b] += dx * wb; py[b] += dy * wb; pz[b] += dz * wb;
      }
    }
    // collision (elliptical tapered capsules + ground). Soft-pinned
    // particles (the collar) are pin-controlled with surface-relaxed targets —
    // colliding them against the capsule field they were relaxed onto is a
    // guaranteed fight (the chestHi × uarm cap overlap squeezed the collar
    // ring at exactly 0.78 u/s, forever).
    const caps = this.groups[piece.collideSet];
    const sp = piece.softPinned;
    const ex = piece.exempt;
    for (let i = 0; i < n; i++) {
      if (w[i] === 0 || (sp && sp[i])) continue; // hard pins + non-colliding collar
      const exi = ex ? ex[i] : null;
      for (let ci = 0; ci < caps.length; ci++) {
        const c = caps[ci];
        if (exi && exi.test(c.name)) continue;
        const pen = collideCapsule(c, px[i], py[i], pz[i], col);
        if (pen > 0) {
          px[i] += col.x; py[i] += col.y; pz[i] += col.z;
          // thigh corridor: the two thigh capsules overlap past the centreline
          // (surface gap −1.1 cm) — a particle in the lens region projects
          // into one capsule then the other: a ping-pong pump (2 u/s spikes,
          // forever), and exempting the seam instead let the leg tube ROTATE
          // around the thigh (no azimuthal restorer). Never crossing the
          // corridor makes each seam column its own thigh's business only.
          if (c.corridor) {
            if (px[i] > -c.corridor && px[i] < c.corridor) {
              px[i] = px[i] >= 0 ? c.corridor : -c.corridor;
            }
          }
          if (withFriction) this.friction(i, piece, col.nx, col.ny, col.nz, T.contactStick, h);
        }
      }
      if (py[i] < T.groundY) {
        py[i] = T.groundY;
        if (withFriction) this.friction(i, piece, 0, 1, 0, 0.8, h);
      }
    }
  }

  /** cross-garment repulsion — shirt hem stays outside the shorts' band */
  crossPass() {
    const X = this.cross;
    if (!X.ia.length) return;
    const A = X.a, Bs = X.b;
    for (let k = 0; k < X.ia.length; k++) {
      const i = X.ia[k], j = X.ib[k];
      const wa = A.w[i], wb = Bs.w[j], wsum = wa + wb;
      if (wsum === 0) continue;
      let dx = Bs.px[j] - A.px[i], dy = Bs.py[j] - A.py[i], dz = Bs.pz[j] - A.pz[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= X.d[k] || d < 1e-9) continue;
      const push = (X.d[k] - d) / d * 0.15 / wsum;
      dx *= push; dy *= push; dz *= push;
      A.px[i] += dx * wa; A.py[i] += dy * wa; A.pz[i] += dz * wa;
      Bs.px[j] -= dx * wb; Bs.py[j] -= dy * wb; Bs.pz[j] -= dz * wb;
    }
  }

  friction(i, piece, nx, ny, nz, stick, h) {
    const { px, py, pz, ox, oy, oz } = piece;
    const vx = (px[i] - ox[i]) / h, vy = (py[i] - oy[i]) / h, vz = (pz[i] - oz[i]) / h;
    const vn = vx * nx + vy * ny + vz * nz;
    // strip inward normal velocity (no bounce), damp tangential (friction)
    let tx = vx - nx * vn, ty = vy - ny * vn, tz = vz - nz * vn;
    tx *= (1 - stick); ty *= (1 - stick); tz *= (1 - stick);
    const vnKeep = vn > 0 ? vn : vn * 0.1;
    ox[i] = px[i] - (nx * vnKeep + tx) * h;
    oy[i] = py[i] - (ny * vnKeep + ty) * h;
    oz[i] = pz[i] - (nz * vnKeep + tz) * h;
  }

  syncAll() {
    for (const piece of this.pieces) piece.syncGeometry();
    if (this.onSync) this.onSync();
    if (this.debug && this.debug.visible) this.syncDebug();
  }

  // ── debug overlay: particles as dots (pinned red / free cyan), links faint
  buildDebug(scene3d) {
    const g = new THREE.Group();
    let nTotal = 0, nCons = 0;
    for (const p of this.pieces) { nTotal += p.n; nCons += p.cA.length; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nTotal * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nTotal * 3), 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true }));
    pts.frustumCulled = false;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nCons * 6), 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.25 }));
    lines.frustumCulled = false;
    g.add(pts); g.add(lines);
    g.visible = false;
    scene3d.add(g);
    this.debug = g;
    this.debugPts = pts;
    this.debugLines = lines;
    return g;
  }

  syncDebug() {
    const P = this.debugPts.geometry.attributes.position.array;
    const C = this.debugPts.geometry.attributes.color.array;
    let k = 0;
    for (const p of this.pieces) {
      for (let i = 0; i < p.n; i++) {
        P[k * 3] = p.px[i]; P[k * 3 + 1] = p.py[i]; P[k * 3 + 2] = p.pz[i];
        const pinned = p.w[i] === 0;
        C[k * 3] = pinned ? 1 : 0.35; C[k * 3 + 1] = pinned ? 0.3 : 0.85; C[k * 3 + 2] = pinned ? 0.3 : 1;
        k++;
      }
    }
    this.debugPts.geometry.attributes.position.needsUpdate = true;
    this.debugPts.geometry.attributes.color.needsUpdate = true;
    const L = this.debugLines.geometry.attributes.position.array;
    k = 0;
    for (const p of this.pieces) {
      for (let ci = 0; ci < p.cA.length; ci++) {
        const a = p.cA[ci], b = p.cB[ci];
        L[k++] = p.px[a]; L[k++] = p.py[a]; L[k++] = p.pz[a];
        L[k++] = p.px[b]; L[k++] = p.py[b]; L[k++] = p.pz[b];
      }
    }
    this.debugLines.geometry.attributes.position.needsUpdate = true;
  }

  stats() {
    return {
      particles: this.pieces.reduce((a, p) => a + p.n, 0),
      constraints: this.pieces.reduce((a, p) => a + p.cA.length, 0),
      repulsions: this.pieces.reduce((a, p) => a + p.repA.length, 0),
      crossRepulsions: this.cross.ia.length,
      colliders: this.colliders.length,
      substeps: this.substepCount,
      lastMs: +this.lastMs.toFixed(2),
      sleeping: this.pieces.map((p) => p.sleeping),
      maxSpeedCmS: this.pieces.map((p) => +(p.lastMaxSpeed * this.cmPerUnit).toFixed(1)),
    };
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/** Remove previous cloth meshes from the avatar's scene. */
export function clearCloth(avatar) {
  const parent = avatar.root.parent;
  if (!parent) return;
  const doomed = [];
  parent.traverse((o) => { if (o.userData?.rwfCloth) doomed.push(o); });
  for (const o of doomed) o.parent?.remove(o);
}

/**
 * Attach the canonical outfit with TRUE HANGING CLOTH shirt + shorts.
 * Slots: shirt (cloth) · shorts (cloth) · waistband (the pinned ring, white) ·
 * shoes / headband / wristbands (v4 rigid pieces, verbatim from geno-outfit).
 * Returns the outfit object the atelier expects, plus the live sim.
 */
export function attachClothOutfit(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachClothOutfit: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);

  const colors = {
    shorts: OUTFIT_TOKENS.coral,
    waistband: OUTFIT_TOKENS.white,
    tshirt: OUTFIT_TOKENS.lime,
    ...(opts.colors || {}),
  };

  // rigid pieces from the proven v4 builders
  const rigid = attachOutfit(avatar, { slots: ['sneakers', 'headband', 'wristbands'], colors: opts.colors });

  // ── measurement (bind)
  const skin = genoSkin(avatar);
  const cloud = bodyCloud(skin);
  const plan = waistPlan(avatar, skin);
  const _wv = new THREE.Vector3();
  const world = (p) => {
    _wv.set(p[0], p[1], p[2]).applyMatrix4(skin.scene.matrixWorld);
    return [_wv.x, _wv.y, _wv.z];
  };

  // ── colliders (bind-measured, per-bone-segment elliptical capsules)
  const pad = CLOTH_TUNING.padCm, padP = CLOTH_TUNING.padCmPelvis;
  const mk = (name, a, b, tA, tB, set, groups, padCm = pad, xMaxLat = 0, exclude = null) => {
    const c = makeCapsule(name, avatar, skin, cloud, a, b, tA, tB, set, padCm, xMaxLat, exclude);
    if (c) c.group = Array.isArray(groups) ? groups : [groups];
    return c;
  };
  const XMAX_TORSO = 0.15 * avatar.H; // keeps A-pose arms out, deltoid tips in
  const NO_ARMS = ['armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'shoulderL', 'shoulderR'];
  const colliders = [
    // pelvis split: the hip flare (thigh tops included) is WIDE, the waist is
    // not — one capsule forced a 35 cm ellipse onto the waist = permanent
    // pin-vs-collision fight. Torso chain = all-bone + lateral cap + no-arms
    // (bone-dominance centred these capsules 7 cm too far back; arm flesh
    // inside the cap inflated chestHi to a 43 cm half-width).
    mk('hipLo', 'hips', 'spine', -0.95, 0.15, null, ['torso', 'legs'], padP, XMAX_TORSO),
    // t tops out at 0.34: the capsule's round end-cap (r≈0.17) reached up
    // into the waistband zone and elastically shoved the band 4.5 cm off the
    // waist (band↔capsule equilibrium); the abdomen capsule owns the waist
    mk('waistHi', 'hips', 'spine', 0.12, 0.34, null, ['torso', 'legs'], padP, XMAX_TORSO),
    mk('abdomen', 'spine', 'spine1', 0, 1, null, ['torso'], pad, XMAX_TORSO, NO_ARMS),
    mk('chestLo', 'spine1', 'spine2', 0, 1, null, ['torso'], pad, XMAX_TORSO, NO_ARMS),
    // chestHi stops at t=0.55 — the traps/upper-chest ellipse must NOT reach
    // the neck joint (it would swallow the collar ring whole), and the
    // deltoid flare belongs to the delt capsules
    mk('chestHi', 'spine2', 'neck', 0, 0.55, null, ['torso'], pad, 0.13 * avatar.H, NO_ARMS),
    // neck = neck-bone-dominated flesh only (all-bone catches the trap slope
    // and gave rx 0.116 — a gaping collar pushed out to it)
    mk('neckStub', 'neck', 'head', 0, 0.55, ['neck'], ['torso']),
    mk('deltL', 'shoulderL', 'armL', 0, 1, ['shoulderL', 'armL'], ['torso', 'arms']),
    mk('deltR', 'shoulderR', 'armR', 0, 1, ['shoulderR', 'armR'], ['torso', 'arms']),
    mk('uarmL1', 'armL', 'foreL', 0, 0.55, ['armL'], ['torso', 'arms']),
    mk('uarmL2', 'armL', 'foreL', 0.5, 1, ['armL', 'foreL'], ['torso', 'arms']),
    mk('uarmR1', 'armR', 'foreR', 0, 0.55, ['armR'], ['torso', 'arms']),
    mk('uarmR2', 'armR', 'foreR', 0.5, 1, ['armR', 'foreR'], ['torso', 'arms']),
    mk('farmL', 'foreL', 'handL', 0, 0.85, ['foreL'], ['torso', 'arms']),
    mk('farmR', 'foreR', 'handR', 0, 0.85, ['foreR'], ['torso', 'arms']),
    mk('thighL1', 'upLegL', 'legL', 0, 0.55, ['upLegL'], ['torso', 'legs']),
    mk('thighL2', 'upLegL', 'legL', 0.5, 1, ['upLegL', 'legL'], ['torso', 'legs']),
    mk('thighR1', 'upLegR', 'legR', 0, 0.55, ['upLegR'], ['torso', 'legs']),
    mk('thighR2', 'upLegR', 'legR', 0.5, 1, ['upLegR', 'legR'], ['torso', 'legs']),
    mk('shinL', 'legL', 'footL', 0, 0.9, ['legL'], ['legs']),
    mk('shinR', 'legR', 'footR', 0, 0.9, ['legR'], ['legs']),
  ].filter(Boolean);
  for (const c of colliders) if (c.name.startsWith('thigh')) c.corridor = 0.009;

  // ── cloth garments
  const shorts = buildShortsCloth(avatar, skin, cloud, plan, world, colors);
  const { torso: shirt, sleeves } = buildShirtCloth(avatar, skin, cloud, plan, world, colors);
  const band = buildBandMesh(colors);
  const scene3d = avatar.root.parent;
  scene3d.add(shorts.mesh, shirt.mesh, sleeves.mesh, band);

  // ── REST↔COLLIDER AGREEMENT — the anti-jitter keystone.
  // Project every rest particle and every pin target OUT of its collision
  // group's capsules (+2 mm). Rest LENGTHS stay as measured (the 16% slack
  // lives there), so the cloth keeps its drape freedom — but the rest
  // POSITIONS now sit where collision wants them, so the constraint net and
  // the capsule field pull the same way instead of fighting forever (the
  // limit-cycle bug that kept maxSpeed pinned at the velocity clamp).
  // EXEMPT: the shorts' pinned band rows — the waist capsules are hip-fat
  // (rx 0.16) and relaxing the band onto them parked it 4 cm off the actual
  // waist (band→body 9.4 cm, every case). The band hugs its measured waist
  // ellipse; hard pins skip collision, so no fight.
  avatar.root.updateMatrixWorld(true);
  for (const c of colliders) updateCapsule(c);
  const bandExempt = new Set();
  for (let i = 0; i < 48; i++) bandExempt.add(i);
  for (const piece of [shorts, shirt, sleeves]) {
    const caps = colliders.filter((c) => c.group.includes(piece.collideSet));
    const exempt = piece === shorts ? bandExempt : new Set();
    for (let i = 0; i < piece.n; i++) {
      if (exempt.has(i)) continue;
      let x = piece.px[i], y = piece.py[i], z = piece.pz[i];
      for (let iter = 0; iter < 5; iter++) {
        let pen = 0;
        for (const c of caps) {
          const p = collideCapsule(c, x, y, z, col);
          if (p > 0) { x += col.x; y += col.y; z += col.z; pen = p; }
        }
        if (!pen) break;
        const l = Math.hypot(col.x, col.y, col.z) || 1;
        x += (col.x / l) * 0.002; y += (col.y / l) * 0.002; z += (col.z / l) * 0.002;
      }
      piece.px[i] = piece.ox[i] = piece.rest0.x[i] = x;
      piece.py[i] = piece.oy[i] = piece.rest0.y[i] = y;
      piece.pz[i] = piece.oz[i] = piece.rest0.z[i] = z;
    }
    for (const pin of piece.pins) {
      if (exempt.has(pin.i)) continue;
      let x = pin.loc.clone().applyMatrix4(pin.bone.matrixWorld);
      for (let iter = 0; iter < 5; iter++) {
        let pen = 0;
        for (const c of caps) {
          const p = collideCapsule(c, x.x, x.y, x.z, col);
          if (p > 0) { x.x += col.x; x.y += col.y; x.z += col.z; pen = p; }
        }
        if (!pen) break;
        const l = Math.hypot(col.x, col.y, col.z) || 1;
        x.x += (col.x / l) * 0.002; x.y += (col.y / l) * 0.002; x.z += (col.z / l) * 0.002;
      }
      const inv = new THREE.Matrix4().copy(pin.bone.matrixWorld).invert();
      pin.loc.copy(x).applyMatrix4(inv);
      pin.lastT.copy(x);
    }
  }

  const sim = new ClothSim(avatar, [shorts, shirt, sleeves], colliders);
  // rest lengths from the RELAXED shape — the constraint net and the capsule
  // field now pull the same way (this was the last piece of the limit cycle)
  shorts.finalizeConstraints();
  shirt.finalizeConstraints();
  sleeves.finalizeConstraints();
  // sleeve slack: the rings' bind circumference (arm-out A-pose) is too short
  // to wrap the arm∪torso-flank union when the arm hangs at the side — the
  // ring cuts the corner between the two capsules and fights forever (the
  // 109 cm/s floor). A baggier sleeve (5% fabric slack) drapes with wrinkles
  // instead — and reads as the cotton it is.
  for (let ci = 0; ci < sleeves.cA.length; ci++) sleeves.cR[ci] *= 1.05;
  sim.onSync = () => syncBand(shorts, band, 0.004);
  sim.buildDebug(scene3d);
  sim.syncAll();

  const slots = {
    ...rigid.slots,
    shorts: [shorts.mesh],
    waistband: [band],
    tshirt: [shirt.mesh, sleeves.mesh],
  };

  return {
    slots,
    softGarments: [shorts.mesh, shirt.mesh, sleeves.mesh, band, ...rigid.softGarments],
    rigidPieces: rigid.rigidPieces,
    plan: { ...rigid.plan, ...plan },
    sim,
    pieces: { shorts, shirt, sleeves },
    clothMeshes: [shorts.mesh, shirt.mesh, sleeves.mesh, band],
    toggle(slot, on) {
      for (const g of slots[slot] ?? []) g.visible = !!on;
    },
    isVisible(slot) { return slots[slot]?.every((g) => g.visible) ?? true; },
    /** per-render-frame advance (dt seconds; 0 = frozen — pause/reduced-motion) */
    updateFabric(dt) { if (dt > 0) sim.step(dt); },
    settle: (s) => sim.settle(s),
    clothStep: (n = 1) => sim.substepN(n),
    resetDrape() { shorts.reset(); shirt.reset(); sleeves.reset(); sim.syncAll(); },
    clothDebug(on) { sim.debug.visible = !!on; if (on) sim.syncDebug(); },
    clothStats: () => sim.stats(),
  };
}
