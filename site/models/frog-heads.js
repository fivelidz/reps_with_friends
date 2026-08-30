// frog-heads.js — THE FROG HEAD SYSTEM for Reps With Friends.
//
// A proper frog head with EXPRESSIONS, replacing the single static frog in
// geno-wardrobe.js (which stays untouched for goblin/robot). Construction
// vocabulary borrowed from the anyCreature engine's spec language (read, not
// imported): relational placement on the host bone's frame, profile thinking
// for the tapered snout, per-part material discipline (one material per part
// family → O(1) recolour), and the doctrine that parts must read as parts —
// proud of the host surface, never flush bumps.
//
//   createFrogHead(avatar, { skin, expression, accessory })
//     → THREE.Group rigid on the Head bone (frame matches geno-wardrobe's
//       species heads: +Y up from the neck, +Z face-forward, authored in
//       world-at-bind; swallows Geno's head so no white skull pokes through).
//       The group carries userData.rwfWardrobe = 'head:frog' so the atelier's
//       remnant-cleaner catches it, and userData.frog = { setSkin,
//       setExpression, setAccessory, setThroat, metrics(), skullCentre } for
//       live re-posing with ZERO rebuilds.
//
//   previewFrogHead({ skin, expression, accessory })
//     → { root, head } detached H=1 build for thumbnail galleries (the fake
//       bone is an identity Group — the head frame comes out identity too).
//
// ── ANATOMY (all sizes ×H, H = avatar height) ────────────────────────────────
//   skull        wide flat cranium ellipsoid — same engulfing form the founder
//                approved (semi-axes 0.128H/0.100H/0.104H, centre 0.062H up)
//   snout        wide FLAT tapered muzzle (wider than the skull is deep), with
//                nostril bumps — the frog blunt face
//   throat sac   subtle skin sphere under the jaw (pulse hook: setThroat(k))
//   tympanums    round eardrum discs behind the eyes — the "that's a frog" tell
//   eye turrets  globes on TOP of the skull (left rides higher — character),
//                each an aimable Group: bulb + contact-lens pupil + glint +
//                an EYELID — a sphere-cap occluder that ROTATES over the globe
//                (never a scaled eye: a scaled bulb reads as a glitch, a
//                rotated cap reads as a lid at every coverage)
//   mouth        a tube swept along a quadratic Bézier whose three control
//                points shift per expression (smile ⌣ / frown ⌢ / flat / open
//                ellipse+throat-disc for the "oh" face) — the line rides
//                max(skull, snout) surface + a proud offset, so every width
//                sits ON the face, never buried in the muzzle
//   brow ridges  torus arcs riding the top-front of each eye turret —
//                rotate.z + translate.y per expression (angry inner-down,
//                surprise high)
//
// ── THE EXPRESSION SET (the point of this module) ───────────────────────────
//   happy      eyes wide, upturned corners, slight chin-up           😊
//   grumpy     heavy lids + furrowed brows, downturned mouth         😠
//   surprised  max-round eyes (turret scale up), open round mouth    😲
//   sleepy     lids at 80%, flat small mouth, head tilts down        😴
//   cheeky     one-eye wink, lopsided smirk, one brow up — THE       😉
//              taunt face for this game's Aussie banter (flagship)
//   determined brows down+forward, straight set mouth, jaw forward    😤
//
// All static poses of geometry — no runtime morphing, no per-frame cost.

import * as THREE from 'three';

// ── palettes ─────────────────────────────────────────────────────────────────
// green keeps the EXACT founder-approved hue (#4da33e renders ~hue 110 under
// the atelier's neutral rig — the head-tracker classifies against it).
export const FROG_SKINS = {
  green:    { base: '#4da33e', dark: '#39832f', label: 'green' },
  azure:    { base: '#3f9fae', dark: '#2e7c89', label: 'azure' },
  sunset:   { base: '#cf8f3f', dark: '#a76e2b', label: 'sunset' },
  golden:   { base: '#e3b341', dark: '#b8892a', label: 'golden' },   // NEW
  charcoal: { base: '#3a4148', dark: '#262b31', label: 'charcoal' }, // NEW
};

export const FROG_EXPRESSIONS = ['happy', 'grumpy', 'surprised', 'sleepy', 'cheeky', 'determined'];
export const FROG_EXPRESSION_LABELS = {
  happy: '😊 happy', grumpy: '😠 grumpy', surprised: '😲 surprised',
  sleepy: '😴 sleepy', cheeky: '😉 cheeky', determined: '😤 determined',
};
export const FROG_ACCESSORIES = ['none', 'crown', 'headband', 'cap'];
export const FROG_ACCESSORY_LABELS = { none: '∅ none', crown: '👑 crown', headband: '🎽 headband', cap: '🧢 cap' };

const TOK = { // design tokens (mirrors geno-wardrobe WARDROBE_TOKENS)
  lime: '#c6f32e', coral: '#ff5c38', amber: '#ffb020',
  ink: '#141820', charcoal: '#2a3038', white: '#e8ebef',
};

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1); // ModelAvatar faces toes +Z

const lam = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(color), ...extra });

// ── head-frame helpers (local mirrors of geno-wardrobe's, which does not
//    export them — kept in sync by eye, ~15 lines each) ──────────────────────
function frameOnBone(bone, upW, fwdW) {
  bone.updateWorldMatrix(true, false);
  const invQ = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const up = upW.clone().applyQuaternion(invQ).normalize();
  const fwd = fwdW.clone().applyQuaternion(invQ);
  fwd.addScaledVector(up, -fwd.dot(up));
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1).applyQuaternion(invQ);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  fwd.crossVectors(right, up).normalize();
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
  bone.add(g);
  return g;
}
function headUp(avatar) {
  const neck = avatar.bones.neck ?? avatar.bones.head;
  const head = avatar.bones.head;
  const a = neck.getWorldPosition(new THREE.Vector3());
  const b = head.getWorldPosition(new THREE.Vector3());
  const d = b.sub(a);
  if (d.lengthSq() < 1e-9) return UP.clone();
  return d.normalize();
}

// ── face surface query — where does the face END at (x, y)? ─────────────────
// Two ellipsoids: the cranium and the snout. The mouth line rides the MAX of
// the two (+ a proud offset), so it wraps the muzzle instead of burying in it.
const SKULL = { cx: 0, cy: 0.062, cz: 0.005, rx: 0.1275, ry: 0.1003, rz: 0.1037 };
const SNOUT = { cx: 0, cy: 0.020, cz: 0.058, rx: 0.0754, ry: 0.0286, rz: 0.0458 };
function ellipsoidZ(e, x, y) {
  const t = 1 - ((x - e.cx) / e.rx) ** 2 - ((y - e.cy) / e.ry) ** 2;
  return t <= 0 ? -Infinity : e.cz + e.rz * Math.sqrt(t);
}
function faceZ(x, y) {
  return Math.max(ellipsoidZ(SKULL, x, y), ellipsoidZ(SNOUT, x, y));
}

// turret + brow anchors (×H)
const EYE_X = 0.098, EYE_Y = 0.148, EYE_Y_LIFT = 0.013;  // side+1 rides higher
const BROW_Y = 0.168, BROW_Z = 0.058;

// ── expression table ─────────────────────────────────────────────────────────
// lids:   [side+1, side-1] coverage 0..1 (negative = retracted wide). Lid =
//         sphere-cap rotating over the globe: rx = LID_OPEN + coverage*LID_SWING.
// lidTilt:+ = inner-edge-down (angry slant), applied mirrored per side.
// brow:   rotZ (+ = inner-down / angry), dy (up), per side [side+1, side-1].
// aim:    { out, up } subtle turret yaw/pitch so the pupils help the read.
// mouth:  { kind:'arc', w, corner:[+1side, -1side], mid, skew } | { kind:'open', r }
// tilt:   core head tilt — x = pitch (+nose-down), z = roll (cheeky lean).
const LID_OPEN = -0.55;   // rx at coverage 0 — cap back, globe clear
const LID_SWING = 1.70;   // rx at coverage 1 — front fully covered (wink)
const lidRx = (coverage) => LID_OPEN + Math.max(-0.25, Math.min(1, coverage)) * LID_SWING;

const EXPR = {
  happy: {
    tilt: [-0.05, 0],
    lids: [0.04, 0.04], lidTilt: 0,
    brow: { rotZ: [0, 0], dy: [0.002, 0.002] },
    aim: { out: 0.05, up: 0.02 }, eyeScale: 1,
    mouth: { kind: 'arc', w: 0.150, corner: [0.010, 0.010], mid: -0.006, skew: 0 },
    jawFwd: 0,
  },
  grumpy: {
    tilt: [0.05, 0],
    lids: [0.55, 0.55], lidTilt: 0.32,
    brow: { rotZ: [0.42, 0.42], dy: [-0.010, -0.010] },
    aim: { out: 0.09, up: -0.09 },
    mouth: { kind: 'arc', w: 0.105, corner: [-0.007, -0.007], mid: 0.005, skew: 0 },
    jawFwd: 0,
  },
  surprised: {
    tilt: [-0.08, 0],
    lids: [-0.18, -0.18], lidTilt: -0.10,      // retracted + outer-up = widest eye
    brow: { rotZ: [-0.10, -0.10], dy: [0.018, 0.018] },
    aim: { out: 0.13, up: 0.10 }, eyeScale: 1.12,
    mouth: { kind: 'open', r: 0.021 },
    jawFwd: 0,
  },
  sleepy: {
    tilt: [0.07, 0.02],
    lids: [0.82, 0.82], lidTilt: 0,
    brow: { rotZ: [0.05, 0.05], dy: [0.004, 0.004] },
    aim: { out: 0.02, up: -0.12 },
    mouth: { kind: 'arc', w: 0.075, corner: [0.001, 0.001], mid: 0.0005, skew: 0 },
    jawFwd: 0,
  },
  cheeky: {
    tilt: [-0.03, 0.05],
    lids: [1.0, 0.05],                            // side+1 WINKS
    lidTilt: 0.15,
    brow: { rotZ: [-0.26, 0.14], dy: [0.010, -0.002] },  // side+1 brow UP
    aim: { out: 0.12, up: 0.06 },
    mouth: { kind: 'arc', w: 0.128, corner: [0.013, -0.001], mid: -0.003, skew: 0.012 },
    jawFwd: 0,
  },
  determined: {
    tilt: [0.06, 0],
    lids: [0.30, 0.30], lidTilt: 0.20,
    brow: { rotZ: [0.52, 0.52], dy: [-0.012, -0.012] },
    aim: { out: 0.0, up: -0.04 },
    mouth: { kind: 'arc', w: 0.122, corner: [0.0005, 0.0005], mid: 0.0005, skew: 0 },
    jawFwd: 0.006,                                 // jaw pushes forward
  },
};

// ── the builder ──────────────────────────────────────────────────────────────
export function createFrogHead(avatar, opts = {}) {
  if (!avatar?.bones?.head) throw new Error('createFrogHead: no Head bone');
  avatar.root.updateMatrixWorld?.(true);

  const H = avatar.H ?? 1;
  const skinName = FROG_SKINS[opts.skin] ? opts.skin : 'green';
  const exprName = EXPR[opts.expression] ? opts.expression : 'happy';
  // legacy geno-wardrobe call style: { crown: true } → crown accessory
  let accName = FROG_ACCESSORIES.includes(opts.accessory) ? opts.accessory
    : (opts.crown ? 'crown' : 'none');

  // one material per family → recolour is O(1), every skin mesh swaps together
  const skinMat = lam(FROG_SKINS[skinName].base);
  const skinDarkMat = lam(FROG_SKINS[skinName].dark);
  const lidMat = lam(FROG_SKINS[skinName].base, { side: THREE.DoubleSide });
  const bulbMat = lam('#eef2c0', { emissive: new THREE.Color('#6a7433'), emissiveIntensity: 0.55 });
  const pupilMat = lam(TOK.ink);
  const glintMat = lam(TOK.white);
  const inkMat = lam(TOK.ink);

  // head frame on the bone + an inner "core" that tilts per expression
  // (the frame quaternion belongs to the bone bind — never touched again)
  const g = frameOnBone(avatar.bones.head, headUp(avatar), FWD);
  g.userData.rwfWardrobe = 'head:frog';
  const core = new THREE.Group();
  g.add(core);

  const m = (geom, mat) => new THREE.Mesh(geom, mat);

  // ── skull + snout + throat + tympanums ────────────────────────────────────
  const skull = m(new THREE.SphereGeometry(0.085 * H, 20, 14), skinMat);
  skull.scale.set(SKULL.rx / 0.085, SKULL.ry / 0.085, SKULL.rz / 0.085);
  skull.position.set(SKULL.cx * H, SKULL.cy * H, SKULL.cz * H);
  core.add(skull);

  const snout = m(new THREE.SphereGeometry(0.052 * H, 16, 12), skinMat);
  snout.scale.set(SNOUT.rx / 0.052, SNOUT.ry / 0.052, SNOUT.rz / 0.052);
  snout.position.set(SNOUT.cx * H, SNOUT.cy * H, SNOUT.cz * H);
  core.add(snout);

  const throat = m(new THREE.SphereGeometry(0.040 * H, 14, 10), skinMat);
  throat.scale.set(1.0, 0.62, 0.75);
  throat.position.set(0, -0.020 * H, 0.028 * H);
  core.add(throat);

  for (const s of [-1, 1]) {
    const bump = m(new THREE.SphereGeometry(0.008 * H, 8, 6), skinDarkMat);
    bump.position.set(0.024 * H * s, 0.040 * H, 0.096 * H);
    const dot = m(new THREE.SphereGeometry(0.0042 * H, 6, 5), inkMat);
    dot.position.set(0.025 * H * s, 0.040 * H, 0.1015 * H);
    core.add(bump, dot);
  }

  for (const s of [-1, 1]) {
    const disc = m(new THREE.CylinderGeometry(0.019 * H, 0.019 * H, 0.006 * H, 14), skinDarkMat);
    disc.rotation.z = Math.PI / 2;
    disc.position.set(0.123 * H * s, 0.075 * H, -0.008 * H);
    core.add(disc);
  }

  // ── eye turrets (index 0 = side +1, index 1 = side −1) ────────────────────
  // Each turret is an aimable Group at the globe centre: bulb, contact-lens
  // pupil (the proven geno-wardrobe coverage maths — reads from front AND
  // profile through the walk cycle's head yaw), glint, and the LID cap.
  const SIDES = [1, -1];
  const turrets = [], lids = [];
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const turret = new THREE.Group();
    turret.position.set(EYE_X * H * side, (EYE_Y + (side === 1 ? EYE_Y_LIFT : 0)) * H, 0.030 * H);

    const bulb = m(new THREE.SphereGeometry(0.036 * H, 14, 10), bulbMat);
    turret.add(bulb);

    const dir = new THREE.Vector3(0.42 * side, 0.55, 0.72).normalize();
    const pupil = m(new THREE.SphereGeometry(0.030 * H, 12, 8), pupilMat);
    pupil.quaternion.setFromUnitVectors(UP, dir);
    pupil.scale.set(1, 0.6, 1);
    pupil.position.copy(dir).multiplyScalar(0.027 * H);
    turret.add(pupil);

    const glint = m(new THREE.SphereGeometry(0.006 * H, 6, 6), glintMat);
    glint.position.copy(dir).multiplyScalar(0.030 * H).add(new THREE.Vector3(0.002 * H, 0.010 * H, 0.006 * H));
    turret.add(glint);

    // the LID — sphere-cap occluder, pole +Y, pivoting at the globe centre.
    // rotation.x sweeps it forward (closing); rotation.z slants it (angry).
    // Own material (DoubleSide, the shell's inside shows when closed) that
    // setSkin recolours alongside the base skin.
    const lid = new THREE.Group();
    const cap = m(
      new THREE.SphereGeometry(0.0376 * H, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.60),
      lidMat);
    lid.add(cap);
    turret.add(lid);

    core.add(turret);
    turrets.push(turret);
    lids.push(lid);
  }

  // ── brow ridges — torus arcs riding each turret's top-front ───────────────
  const brows = [];
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const arc = Math.PI * 0.66;
    const brow = m(new THREE.TorusGeometry(0.030 * H, 0.0085 * H, 6, 14, arc), skinDarkMat);
    brow.rotation.z = Math.PI / 2 - arc / 2;   // arc centred at local +Y (⌢)
    const holder = new THREE.Group();
    holder.position.set(EYE_X * H * side, BROW_Y * H, BROW_Z * H);
    holder.add(brow);
    core.add(holder);
    brows.push(holder);
  }

  // ── mouth (rebuilt per expression — control points shift) ─────────────────
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.004 * H, 0);
  core.add(mouthGroup);
  let mouthMeshes = [];

  function buildMouth(spec) {
    for (const mesh of mouthMeshes) {
      mouthGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    mouthMeshes = [];
    if (!spec) return;
    if (spec.kind === 'open') {
      const zc = faceZ(0, -0.006) * H + 0.006 * H;
      const ring = m(new THREE.TorusGeometry(spec.r * H, 0.0085 * H, 8, 18), inkMat);
      ring.position.set(0, -0.006 * H, zc);
      const disc = m(new THREE.CircleGeometry((spec.r - 0.002) * H, 18), lam('#1d242e'));
      disc.position.set(0, -0.006 * H, zc - 0.002 * H);
      mouthGroup.add(ring, disc);
      mouthMeshes.push(ring, disc);
      return;
    }
    // arc: quadratic Bézier P0(corner, side+1) → P1(solved mid) → P2(corner, side-1).
    // Corners ride the face surface +4 mm proud; the mid +8 mm (wraps the snout).
    const w = spec.w;
    const zcP = faceZ(w / 2, spec.corner[0]) * H + 0.004 * H;
    const zcM = faceZ(-w / 2, spec.corner[1]) * H + 0.004 * H;
    const zm = faceZ(0, spec.mid) * H + 0.008 * H;
    const p0 = new THREE.Vector3(w / 2 * H + (spec.skew ?? 0) * H, spec.corner[0] * H, zcP);
    const p2 = new THREE.Vector3(-w / 2 * H + (spec.skew ?? 0) * H, spec.corner[1] * H, zcM);
    // Bézier passes 0.25·P0 + 0.5·P1 + 0.25·P2 at t=0.5 — solve P1 so the drawn
    // midpoint lands exactly at (skew, mid, zm):
    const p1 = new THREE.Vector3(
      2 * ((spec.skew ?? 0) * H) - 0.5 * (p0.x + p2.x),
      2 * (spec.mid * H) - 0.5 * (p0.y + p2.y),
      2 * zm - 0.5 * (p0.z + p2.z));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const tube = m(new THREE.TubeGeometry(curve, 22, 0.0115 * H, 6), inkMat);
    mouthGroup.add(tube);
    mouthMeshes.push(tube);
  }

  // ── accessories (pre-built; setAccessory flips visibility) ────────────────
  const accessories = {};

  { // crown — the founder's pick, copied exact from geno-wardrobe
    const crown = new THREE.Group();
    const gold = lam(TOK.amber);
    const base = m(new THREE.CylinderGeometry(0.048 * H, 0.052 * H, 0.024 * H, 10), gold);
    base.position.set(0, 0.168 * H, 0);
    crown.add(base);
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]]) {
      const spike = m(new THREE.ConeGeometry(0.011 * H, 0.038 * H, 6), gold);
      spike.position.set(0.034 * H * sx, 0.198 * H, 0.034 * H * sz);
      crown.add(spike);
    }
    accessories.crown = crown;
  }

  { // headband — coral sweatband hugging the cranium + side knot
    const hb = new THREE.Group();
    const coral = lam(TOK.coral);
    const band = m(new THREE.TorusGeometry(0.121 * H, 0.013 * H, 8, 28), coral);
    band.rotation.x = Math.PI / 2;          // horizontal ring around the skull
    band.scale.set(1, 0.86, 1);             // hug the shallower z depth
    band.position.y = 0.066 * H;
    band.rotation.z = 0.05;                 // worn slightly crooked — character
    const knot = m(new THREE.SphereGeometry(0.015 * H, 8, 7), coral);
    knot.position.set(0.121 * H, 0.070 * H, -0.030 * H);
    hb.add(band, knot);
    accessories.headband = hb;
  }

  { // cap — charcoal dome perched between the eye turrets, brim forward
    const cap = new THREE.Group();
    const dark = lam(TOK.charcoal);
    const dome = m(new THREE.SphereGeometry(0.064 * H, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    dome.scale.set(1.0, 0.72, 1.05);
    dome.position.set(0, 0.150 * H, -0.018 * H);
    const brim = m(new THREE.CylinderGeometry(0.082 * H, 0.082 * H, 0.011 * H, 16, 1, false, -0.55, 1.1), dark);
    brim.scale.set(1, 1, 1.15);             // wedge centred on +Z, elongated fwd
    brim.position.set(0, 0.150 * H, 0.040 * H);
    brim.rotation.x = 0.14;                 // brim dips forward
    const button = m(new THREE.SphereGeometry(0.010 * H, 8, 6), lam(TOK.lime));
    button.position.set(0, 0.200 * H, -0.018 * H);
    cap.add(dome, brim, button);
    accessories.cap = cap;
  }

  for (const name of Object.keys(accessories)) {
    accessories[name].visible = false;
    core.add(accessories[name]);
  }
  accessories.none = new THREE.Group(); // marker — nothing to draw

  // ── expression / skin / accessory application ─────────────────────────────
  let curExpr = exprName, curSkin = skinName, curAcc = accName;
  let curMouth = null;

  function setExpression(name) {
    const e = EXPR[name];
    if (!e) return curExpr;
    curExpr = name;
    core.rotation.set(e.tilt[0], 0, e.tilt[1]);

    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      lids[i].rotation.set(lidRx(e.lids[i]), 0, side * e.lidTilt);
      brows[i].rotation.z = side * e.brow.rotZ[i];
      brows[i].position.y = BROW_Y * H + e.brow.dy[i] * H;
      turrets[i].rotation.set(e.aim.up, side * e.aim.out, 0);
      turrets[i].scale.setScalar(e.eyeScale ?? 1);
    }

    curMouth = e.mouth;
    buildMouth(e.mouth);
    mouthGroup.position.z = e.jawFwd * H;   // jaw forward (determined)
    return curExpr;
  }

  function setSkin(name) {
    const s = FROG_SKINS[name];
    if (!s) return curSkin;
    curSkin = name;
    skinMat.color.set(s.base);
    skinDarkMat.color.set(s.dark);
    lidMat.color.set(s.base);
    return curSkin;
  }

  function setAccessory(name) {
    if (!(name in accessories)) return curAcc;
    for (const k of ['crown', 'headband', 'cap']) accessories[k].visible = (k === name);
    curAcc = name;
    return curAcc;
  }

  /** throat sac pulse hook — k in [0..1] → up to +7% swell. Not wired to an
   *  idle loop yet; the geometry supports it (croak later). */
  function setThroat(k) {
    const s = 1 + Math.max(0, Math.min(1, k)) * 0.07;
    throat.scale.set(1.0 * s, 0.62 * s, 0.75 * s);
  }

  /** numeric distinctness metrics — the verify table reads these directly. */
  function metrics() {
    const e = EXPR[curExpr];
    const mouth = curMouth?.kind === 'open'
      ? { kind: 'open', r: +curMouth.r.toFixed(4) }
      : {
        kind: 'arc', w: +curMouth.w.toFixed(4),
        cornerP: +curMouth.corner[0].toFixed(4), cornerM: +curMouth.corner[1].toFixed(4),
        mid: +curMouth.mid.toFixed(4),
        curvature: +(curMouth.corner[0] - curMouth.mid).toFixed(4), // + = ⌣ smile, − = ⌢ frown
      };
    return {
      expression: curExpr, skin: curSkin, accessory: curAcc,
      lidCoverage: e.lids.map((v) => +v.toFixed(2)),           // [side+1, side-1]
      lidRotX: lids.map((l) => +l.rotation.x.toFixed(3)),
      browRotZ: brows.map((b) => +b.rotation.z.toFixed(3)),
      browY: brows.map((b) => +(b.position.y / H).toFixed(4)),
      tilt: e.tilt.map((v) => +v.toFixed(3)),
      eyeScale: e.eyeScale ?? 1,
      mouth,
    };
  }

  setExpression(exprName);
  setSkin(skinName);
  setAccessory(accName);

  g.userData.frog = {
    setSkin, setExpression, setAccessory, setThroat, metrics,
    /** skull centre in head-frame coords — the atelier head-tracker aims its
     *  pixel zone here (same anchor the geno-wardrobe frog used). */
    skullCentre: new THREE.Vector3(SKULL.cx * H, SKULL.cy * H, SKULL.cz * H),
    get skin() { return curSkin; },
    get expression() { return curExpr; },
    get accessory() { return curAcc; },
    mats: { skin: skinMat, skinDark: skinDarkMat },
    parts: { core, turrets, lids, brows, throat, accessories, mouthGroup },
  };
  return g;
}

/** Detached H=1 build for gallery thumbnails — the fake bone is an identity
 *  Group, so the head frame comes out identity: author/aim in plain space. */
export function previewFrogHead(opts = {}) {
  const bone = new THREE.Group();
  const fakeAvatar = { H: 1, bones: { head: bone }, root: bone };
  const head = createFrogHead(fakeAvatar, opts);
  return { root: bone, head };
}
