/**
 * rig-core.js — shared skeleton, proportion solver, IK and animation for every
 * avatar STYLE.
 *
 * Why this exists
 * ---------------
 * The rejected avatar system baked proportions, geometry and animation into one
 * file, and every exercise hand-derived its own ground contact with trig. Two
 * whole classes of bug came out of that:
 *
 *   1. Proportions were a pile of independent magic numbers, so "arms thinner
 *      than the torso" and "hands stop at mid-thigh" were things you had to
 *      remember, not things the code enforced. They drifted. The result read as
 *      a gorilla.
 *   2. Contact was open-loop. Each exercise computed hip height from joint
 *      angles by hand. Get a sign wrong and the figure floats, sinks, or — in
 *      the push-up — folds its arms backwards toward its feet with the hands in
 *      mid-air.
 *
 * The fixes here are structural, not cosmetic:
 *
 *   • solveDims() DERIVES every length from a small ratio spec, so the
 *     proportion rules hold by construction for all five styles. Arm length is
 *     literally computed as "shoulder height minus mid-thigh height" — it
 *     cannot reach the knee. Limb radii are clamped against the torso radius —
 *     arms cannot out-bulk the chest.
 *   • Contact is CLOSED-LOOP. Pose the joints however you like, then call
 *     plantFeet()/anchor() which MEASURE the actual world position of a contact
 *     marker and translate the body to put it on the floor. No trig to get
 *     wrong, works for any style's geometry.
 *   • Limbs that must touch something use two-bone IK (solveTwoBone) with an
 *     explicit POLE VECTOR. The pole is what makes an elbow bend the right way,
 *     and it is stated as a direction in world space ("elbows point at the
 *     feet") rather than as a joint-angle sign you have to reason about.
 *
 * A style module supplies PROPORTION RATIOS + MESH FACTORIES. It never touches
 * animation. One push-up fix therefore fixes all five styles at once.
 */

import * as THREE from 'three';

export const REDUCED = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t * t * (3 - 2 * t);
const wrap = (p) => ((p % 1) + 1) % 1;

export { clamp, lerp, easeInOut, wrap };

// ── palette ──────────────────────────────────────────────────────────────────
export const TIER_COLORS = {
  rookie: '#8ea3b8', casual: '#4fc3f7', fit: '#c6f32e',
  strong: '#ffb020', elite: '#ff5c38',
};
export const TIER_ACCENTS = {
  rookie: '#e8eaed', casual: '#0f2b3a', fit: '#12202a',
  strong: '#2a1b06', elite: '#2a0f08',
};
export const SKIN_TONES = [
  '#f2d3b8', '#e9c49b', '#d9a97b', '#c08c5c', '#9c6b43', '#6f4629', '#4a2f1e',
];
export const OUTFIT_COLORS = [
  '#c6f32e', '#4fc3f7', '#ff5c38', '#ffb020', '#a78bfa', '#34d399', '#f472b6', '#e8eaed',
];
export const HAIR_COLORS = ['#2b2118', '#4a3524', '#7a4a22', '#c8a24a', '#8c8f96', '#1a1c20'];
export const HAIR_STYLES = ['none', 'short', 'bun', 'cap'];
export const ACCESSORIES = ['none', 'headband', 'wristbands', 'belt'];
export const BUILDS = ['slim', 'average', 'heavy'];

// ── proportions ──────────────────────────────────────────────────────────────
/**
 * Build modifiers only ever touch THICKNESS, never length. Build is "how much
 * mass is on the frame", height is "how big the frame is". Keeping those axes
 * separate is why slim/average/heavy stay recognisably the same character, and
 * why a heavy figure can't accidentally grow gorilla arms — every radius is
 * still clamped against the torso afterwards.
 */
export const BUILD_MODS = {
  slim:    { limb: 0.82, torso: 0.86, waist: 0.72, shoulder: 0.96 },
  average: { limb: 1.00, torso: 1.00, waist: 1.00, shoulder: 1.00 },
  heavy:   { limb: 1.22, torso: 1.20, waist: 1.46, shoulder: 1.07 },
};

/** Base standing height in world units. Everything scales off this one number. */
export const BASE_H = 0.42;

/**
 * A style's proportion spec. Every field is a FRACTION, so a style is described
 * by how it's shaped rather than by a table of lengths.
 *
 *   headCount    total height ÷ head height. 3 = chibi, 7 = athletic adult.
 *   hipFrac      hip pivot height ÷ total height. ~0.48 is a real human.
 *   neckFrac     visible gap between shoulder line and chin ÷ total height.
 *                  > 0 is what GUARANTEES a neck exists.
 *   thighFrac    thigh ÷ (leg minus ankle height).
 *   ankleFrac    ankle height ÷ total height.
 *   upperArmFrac upper arm ÷ total arm reach.
 *   torsoRFrac   chest radius ÷ total height.
 *   shoulderFrac half shoulder width ÷ total height.
 *   armThick     arm radius ÷ torso radius. HARD CLAMPED to 0.55 below.
 *   legThick     thigh radius ÷ torso radius.
 *   headWidth    head width ÷ head height (1 = round).
 */
export function solveDims(spec, build, heightMul, scale = 1) {
  const b = BUILD_MODS[build] ?? BUILD_MODS.average;
  const H = BASE_H * clamp(heightMul, 0.72, 1.35) * clamp(scale, 0.2, 4);

  const headH = H / spec.headCount;
  const headR = headH / 2;
  const chinY = H - headH;                       // bottom of the head
  const neckLen = H * spec.neckFrac;
  // Shoulder line sits BELOW the chin by neckLen. The head therefore always
  // clears the shoulders — the "no neck, head bolted to the chest" defect is
  // impossible to express in this system.
  const shoulderY = chinY - neckLen;

  const hipY = H * spec.hipFrac;                 // pelvis pivot above the floor
  const torsoLen = shoulderY - hipY;

  // ---- legs. legLen === hipY, so the sole lands exactly on y=0 by definition.
  const ankleY = H * spec.ankleFrac;
  const legSpan = hipY - ankleY;
  const legUp = legSpan * spec.thighFrac;        // hip → knee
  const legLo = legSpan * (1 - spec.thighFrac);  // knee → ankle
  const kneeY = ankleY + legLo;

  // ---- thickness FIRST, because arm length depends on hand size.
  // Torso radius, then limbs as a fraction OF the torso, then a hard ceiling.
  // This is the direct fix for "arms thicker than the torso" — the constraint
  // is arithmetic, not a number someone has to remember.
  const torsoR = H * spec.torsoRFrac * b.torso;
  const armThick = Math.min(spec.armThick * b.limb, 0.55);
  const legThick = Math.min(spec.legThick * b.limb, 0.78);
  const armUpR = torsoR * armThick;
  const armLoR = armUpR * 0.84;
  const legUpR = torsoR * legThick;
  const legLoR = legUpR * 0.76;
  const handR = armLoR * 1.18;
  const handLen = handR * 2;              // wrist → fingertip

  // ---- arms. THE RULE, expressed as arithmetic instead of as a hope:
  // the FINGERTIPS land at mid-thigh. Note "fingertips", not "wrist" — putting
  // the wrist there makes the arm ~10% of body height too long and drops the
  // hand to the knee, which is precisely the gorilla silhouette that got the
  // last version rejected. Because armTotal is DERIVED, no combination of
  // build/height/style can produce hands past the knee.
  const midThighY = (hipY + kneeY) / 2;
  const wristY = midThighY + handLen;
  const armTotal = shoulderY - wristY;
  const armUp = armTotal * spec.upperArmFrac;
  const armLo = armTotal * (1 - spec.upperArmFrac);

  const footLen = H * spec.footFrac;
  const footH = ankleY;                          // sole sits on y=0

  const D = {
    H, spec, buildMod: b, build,
    headH, headR, headW: headR * (spec.headWidth ?? 1),
    chinY, neckLen, shoulderY, hipY, torsoLen,
    ankleY, legUp, legLo, kneeY, legUpR, legLoR,
    armTotal, armUp, armLo, armUpR, armLoR, handR, handLen, wristY,
    torsoR, waistR: torsoR * 0.84 * b.waist,
    shoulderX: H * spec.shoulderFrac * b.shoulder,
    hipX: H * spec.hipXFrac,
    footLen, footH, footW: legLoR * 1.5,
    midThighY,
  };

  // Self-check ratios, surfaced so the gallery can PRINT them rather than the
  // developer eyeballing a render and guessing.
  // 0% = fingertips at the knee, 100% = at the hip. Want ≈ 50 (mid-thigh).
  D.ratios = {
    heads: +(H / headH).toFixed(2),
    legPct: +((hipY / H) * 100).toFixed(1),          // want ≈ 50
    reachPct: +(((midThighY - kneeY) / (hipY - kneeY)) * 100).toFixed(1),
    armVsTorso: +(armUpR / torsoR).toFixed(2),       // must be < 1
    neckPct: +((neckLen / H) * 100).toFixed(2),      // must be > 0
  };
  return D;
}

/**
 * Assertions the styles must satisfy. Run in the gallery; failures are loud.
 * Kept as data (not thrown) so one bad style can't blank the whole page.
 */
export function auditDims(D) {
  const fail = [];
  if (D.armUpR >= D.torsoR) fail.push(`arm radius ${D.armUpR.toFixed(4)} ≥ torso ${D.torsoR.toFixed(4)}`);
  // Fingertips, not the wrist — that's where "past the knee" actually happens.
  const tipY = D.shoulderY - D.armTotal - D.handLen;
  if (tipY <= D.kneeY) fail.push(`fingertips (${tipY.toFixed(3)}) at or below knee (${D.kneeY.toFixed(3)})`);
  if (D.neckLen <= 0) fail.push('no neck gap');
  if (D.torsoLen <= 0) fail.push('torso has no length');
  if (D.headH > D.H * 0.42) fail.push(`head is ${(D.headH / D.H * 100).toFixed(0)}% of height`);
  return fail;
}

// ── materials ────────────────────────────────────────────────────────────────
let _gradient = null;
export function toonGradient() {
  if (_gradient) return _gradient;
  const steps = [0.30, 0.50, 0.68, 0.85, 1.0];
  const c = document.createElement('canvas');
  c.width = steps.length; c.height = 1;
  const ctx = c.getContext('2d');
  steps.forEach((v, i) => {
    const n = Math.round(v * 255);
    ctx.fillStyle = `rgb(${n},${n},${n})`;
    ctx.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  _gradient = tex;
  return tex;
}

export function toonMat(color, emissiveMix = 0.10) {
  const c = new THREE.Color(color);
  return new THREE.MeshToonMaterial({
    color: c, emissive: c.clone().multiplyScalar(emissiveMix), gradientMap: toonGradient(),
  });
}
export function flatMat(color, emissiveMix = 0.06) {
  const c = new THREE.Color(color);
  return new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(emissiveMix) });
}
export function facetMat(color, emissiveMix = 0.08) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c, emissive: c.clone().multiplyScalar(emissiveMix),
    roughness: 0.78, metalness: 0.0, flatShading: true,
  });
}
export function smoothMat(color, emissiveMix = 0.10) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c, emissive: c.clone().multiplyScalar(emissiveMix), roughness: 0.44, metalness: 0.02,
  });
}

// ── two-bone IK ──────────────────────────────────────────────────────────────
// Scratch objects — module level so a full gallery frame allocates nothing.
// NOTE: the IK gets its OWN named set. An earlier version reused a numbered
// pool and `xA` silently clobbered the target vector `t` before the forearm
// direction was computed from it, which sent every arm off in a garbage
// direction. Named, non-overlapping scratch makes that class of bug visible.
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UNIT_X = new THREE.Vector3(1, 0, 0);

const _ikT = new THREE.Vector3(), _ikPole = new THREE.Vector3(), _ikDir = new THREE.Vector3();
const _ikN = new THREE.Vector3(), _ikUp = new THREE.Vector3(), _ikElbow = new THREE.Vector3();
const _ikFore = new THREE.Vector3();
const _ikX = new THREE.Vector3(), _ikY = new THREE.Vector3(), _ikZ = new THREE.Vector3();

/**
 * Analytic two-bone IK. Bones rest along local -Y: `mid` sits at (0,-L1,0)
 * inside `root`, and the effector at (0,-L2,0) inside `mid`.
 *
 * @param root       shoulder / hip joint (Object3D)
 * @param mid        elbow / knee joint
 * @param L1, L2     bone lengths
 * @param targetW    world-space point the effector must reach
 * @param poleW      world-space point the mid joint should aim AT. This is the
 *                   entire anatomical-correctness knob: for a push-up the pole
 *                   is behind the athlete (toward the feet), so elbows bend
 *                   backwards along the ribs. For a squat it's in front of the
 *                   shins, so knees track over the toes.
 *
 * The bend angle is recovered with atan2 of the true forearm direction
 * expressed in the constructed basis — never a hand-picked sign. That is what
 * makes the inverted-elbow bug structurally unable to come back.
 */
export function solveTwoBone(root, mid, L1, L2, targetW, poleW) {
  const parent = root.parent;
  parent.updateWorldMatrix(true, false);
  // Everything in the root joint's own parent space, relative to the joint.
  const t = parent.worldToLocal(_ikT.copy(targetW)).sub(root.position);
  const pole = parent.worldToLocal(_ikPole.copy(poleW)).sub(root.position);

  const rawLen = t.length() || 1e-6;
  // Clamp reach: keep a hair of bend at full extension so the elbow plane stays
  // defined, and never let the triangle invert through its minimum.
  const len = clamp(rawLen, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
  const dir = _ikDir.copy(t).normalize();

  // Component of the pole perpendicular to the limb axis — the direction the
  // mid joint should bulge toward.
  const n = _ikN.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (n.lengthSq() < 1e-10) {
    // Degenerate pole (co-linear with the limb). Fall back to any perpendicular
    // rather than emitting NaNs.
    n.set(0, 0, 1).addScaledVector(dir, -dir.z);
    if (n.lengthSq() < 1e-10) n.set(1, 0, 0).addScaledVector(dir, -dir.x);
  }
  n.normalize();

  // Triangle: angle at the root between (root→effector) and (root→mid).
  const a = Math.acos(clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1));

  // Upper bone direction = target direction, swung by `a` toward the pole.
  const upper = _ikUp.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a)).normalize();

  // Basis for the root joint: bones rest along local -Y, so Y = -upper. Local X
  // is the bend axis, which makes the mid joint a pure rotation.x and keeps any
  // additive tweak (flare, twist) legible afterwards.
  const yA = _ikY.copy(upper).multiplyScalar(-1);
  const xA = _ikX.copy(dir).cross(n).normalize();
  const zA = _ikZ.copy(xA).cross(yA).normalize();
  _m.makeBasis(xA, yA, zA);
  root.quaternion.setFromRotationMatrix(_m);

  // Bend angle recovered from the ACTUAL forearm direction in that basis —
  // never an authored sign. Rx(φ)·(0,-1,0) = (0,-cosφ,-sinφ) ⇒ φ = atan2(-z,-y).
  // Note `t` must still be intact here; that is why the IK owns private scratch.
  const fore = _ikFore.copy(t).sub(_ikElbow.copy(upper).multiplyScalar(L1)).normalize();
  mid.quaternion.setFromAxisAngle(UNIT_X, Math.atan2(-fore.dot(zA), -fore.dot(yA)));
}

// ── contact resolution ───────────────────────────────────────────────────────
/**
 * Move the whole body so `marker` sits at world height `y`. Measured, not
 * predicted: no matter what the joints did, or what shape a style's foot is,
 * the contact is right. Replaces the per-exercise hip-height trig that used to
 * sink feet through the floor.
 */
export function anchorY(rig, marker, y = 0) {
  rig.root.updateMatrixWorld(true);
  marker.getWorldPosition(_v1);
  rig.orient.position.y += y - _v1.y;
}

/** As above but for a full 3-axis anchor (used by the push-up's toe pivot). */
export function anchorPoint(rig, marker, x, y, z) {
  rig.root.updateMatrixWorld(true);
  marker.getWorldPosition(_v1);
  rig.root.getWorldPosition(_v2);
  rig.orient.position.x += x - (_v1.x - _v2.x);
  rig.orient.position.y += y - (_v1.y - _v2.y);
  rig.orient.position.z += z - (_v1.z - _v2.z);
}

/** Plant BOTH soles: whichever is lower defines the floor. */
export function plantFeet(rig, y = 0) {
  rig.root.updateMatrixWorld(true);
  rig.soleL.getWorldPosition(_v1);
  rig.soleR.getWorldPosition(_v2);
  rig.orient.position.y += y - Math.min(_v1.y, _v2.y);
}

/** Level a foot so its sole is parallel to the floor whatever the leg did. */
export function levelFoot(ankle) {
  ankle.quaternion.identity();
  ankle.parent.updateWorldMatrix(true, false);
  ankle.parent.getWorldQuaternion(_q);
  ankle.quaternion.copy(_q).invert();
}

// ── rep shaping ──────────────────────────────────────────────────────────────
/** 0→1→0 over the cycle with a slow eccentric and a snappier concentric. */
export function rep(p, dn = 0.55) {
  p = wrap(p);
  return p < dn ? easeInOut(p / dn) : easeInOut(1 - (p - dn) / (1 - dn));
}
/** Small overshoot after the concentric — the "pop" at lockout. */
export function bounce(p, from = 0.72) {
  p = wrap(p);
  if (p < from) return 0;
  const t = (p - from) / (1 - from);
  return Math.sin(t * Math.PI) * (1 - t) * 1.6;
}

// ── the skeleton ─────────────────────────────────────────────────────────────
/**
 * Assemble the shared bone hierarchy and hang a style's meshes on it.
 *
 * root → shadow
 *      → orient (whole-body placement) → pelvis → torso → neck → head
 *                                                       → shoulder → elbow → hand
 *                                               → hip → knee → ankle → foot
 *
 * Contact markers (soleL/R, toeL/R, palmL/R) are empty Object3Ds placed by the
 * STYLE at the true contact point of its own geometry, so the shared contact
 * code works for a chunky boot and a bare capsule alike.
 */
export function buildSkeleton(style, cfg) {
  const D = solveDims(style.spec, cfg.build, cfg.height, cfg.scale);
  const geoms = new Set();
  const mats = [];
  const keep = (g) => { geoms.add(g); return g; };

  const palette = style.materials({
    skin: cfg.skinTone, outfit: cfg.outfitColor, accent: cfg.accentColor, hair: cfg.hairColor,
  });
  for (const m of Object.values(palette)) if (m && m.isMaterial) mats.push(m);

  const ctx = { D, cfg, mats: palette, keep, style };

  const root = new THREE.Group();
  const orient = new THREE.Group();
  root.add(orient);
  const pelvis = new THREE.Group();
  pelvis.position.y = 0;                 // orient sits AT the hip pivot
  orient.add(pelvis);

  const pelvisMesh = style.parts.pelvis?.(ctx);
  if (pelvisMesh) pelvis.add(pelvisMesh);

  // ---- torso: origin at the hip, grows +Y to the shoulder line
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = style.parts.torso?.(ctx);
  if (torsoMesh) torso.add(torsoMesh);

  // ---- neck + head. The neck joint is AT the shoulder line, the head centre
  // sits neckLen + headR above it — that gap is the visible neck.
  const neck = new THREE.Group();
  neck.position.y = D.torsoLen;
  torso.add(neck);
  const neckMesh = style.parts.neck?.(ctx);
  if (neckMesh) neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.y = D.neckLen + D.headR;
  neck.add(head);
  const headMesh = style.parts.head?.(ctx);
  if (headMesh) head.add(headMesh);

  // ---- arms
  function arm(side) {
    const s = side === 'L' ? 1 : -1;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * D.shoulderX, D.torsoLen, 0);
    torso.add(shoulder);
    const up = style.parts.upperArm?.(ctx, s);
    if (up) shoulder.add(up);

    const elbow = new THREE.Group();
    elbow.position.y = -D.armUp;
    shoulder.add(elbow);
    const lo = style.parts.foreArm?.(ctx, s);
    if (lo) elbow.add(lo);

    const wrist = new THREE.Group();
    wrist.position.y = -D.armLo;
    elbow.add(wrist);
    const hand = style.parts.hand?.(ctx, s);
    if (hand) wrist.add(hand);

    // Palm contact: the underside of the hand, which is what meets the floor.
    const palm = new THREE.Object3D();
    palm.position.y = -D.handR * 0.85;
    wrist.add(palm);
    return { shoulder, elbow, wrist, palm };
  }
  const armL = arm('L'), armR = arm('R');

  // ---- legs
  function leg(side) {
    const s = side === 'L' ? 1 : -1;
    const hip = new THREE.Group();
    hip.position.set(s * D.hipX, 0, 0);
    pelvis.add(hip);
    const th = style.parts.thigh?.(ctx, s);
    if (th) hip.add(th);

    const knee = new THREE.Group();
    knee.position.y = -D.legUp;
    hip.add(knee);
    const sh = style.parts.shin?.(ctx, s);
    if (sh) knee.add(sh);

    const ankle = new THREE.Group();
    ankle.position.y = -D.legLo;
    knee.add(ankle);
    const ft = style.parts.foot?.(ctx, s);
    if (ft) ankle.add(ft);

    const sole = new THREE.Object3D();
    sole.position.set(0, -D.footH, D.footLen * 0.18);
    ankle.add(sole);
    const toe = new THREE.Object3D();
    toe.position.set(0, -D.footH, D.footLen * 0.78);
    ankle.add(toe);
    return { hip, knee, ankle, sole, toe };
  }
  const legL = leg('L'), legR = leg('R');

  style.decorate?.(ctx, { torso, head, neck, armL, armR, legL, legR, pelvis });

  // ---- contact shadow (a sprite, not a shadow map — a gallery of five can't
  // afford real shadows and this reads better at small sizes anyway)
  const shCanvas = document.createElement('canvas');
  shCanvas.width = shCanvas.height = 64;
  const sg = shCanvas.getContext('2d');
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.24)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
  const shTex = new THREE.CanvasTexture(shCanvas);
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.85 });
  mats.push(shMat);
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(D.torsoR * 7, D.torsoR * 7)), shMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0015;
  root.add(shadow);

  root.traverse((o) => { if (o.geometry) geoms.add(o.geometry); });

  return {
    D, style, root, orient, pelvis, torso, neck, head, shadow,
    shoulderL: armL.shoulder, elbowL: armL.elbow, wristL: armL.wrist, palmL: armL.palm,
    shoulderR: armR.shoulder, elbowR: armR.elbow, wristR: armR.wrist, palmR: armR.palm,
    hipL: legL.hip, kneeL: legL.knee, ankleL: legL.ankle, soleL: legL.sole, toeL: legL.toe,
    hipR: legR.hip, kneeR: legR.knee, ankleR: legR.ankle, soleR: legR.sole, toeR: legR.toe,
    mats, geoms, palette,
    sh: { w: 1, l: 1, o: 1 },
  };
}

/** Reset every joint to the neutral standing pose. */
export function neutral(rig) {
  const D = rig.D;
  rig.orient.position.set(0, D.hipY, 0);
  rig.orient.rotation.set(0, 0, 0);
  rig.orient.scale.set(1, 1, 1);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.torso.scale.set(1, 1, 1);
  rig.neck.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  rig.head.scale.set(1, 1, 1);
  for (const j of [rig.shoulderL, rig.shoulderR, rig.elbowL, rig.elbowR,
    rig.hipL, rig.hipR, rig.kneeL, rig.kneeR, rig.ankleL, rig.ankleR]) {
    j.quaternion.identity();
    j.rotation.set(0, 0, 0);
  }
  // Arms hang with a natural few degrees of outward carry, not pinned to the ribs.
  rig.shoulderL.rotation.z = 0.09;
  rig.shoulderR.rotation.z = -0.09;
  rig.sh.w = rig.sh.l = rig.sh.o = 1;
}

function squash(rig, v) {
  rig.torso.scale.set(1 + v * 0.45, 1 - v, 1 + v * 0.45);
  rig.head.scale.set(1 + v * 0.30, 1 - v * 0.6, 1 + v * 0.30);
}

const _tgtA = new THREE.Vector3(), _tgtB = new THREE.Vector3();
const _polA = new THREE.Vector3(), _polB = new THREE.Vector3();
const _axisZ = new THREE.Vector3(0, 0, 1);
const _prone = new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2);
// Dedicated scratch for the push-up hand calibration. It calls anchorPoint(),
// which itself uses _v1/_v2/_q — sharing them would corrupt the measurement.
const _qTmp = new THREE.Quaternion();
const _calQ = new THREE.Quaternion();
const _calP = new THREE.Vector3();
const _calS = new THREE.Vector3();
const _calT = new THREE.Vector3();

// ── exercises ────────────────────────────────────────────────────────────────
export const EXERCISES = {

  stand: {
    label: 'Stand (idle)', cycle: 3.6,
    fn(rig, p, t) {
      neutral(rig);
      const br = Math.sin(t * 1.5) * 0.5 + 0.5;
      rig.torso.scale.set(1 + br * 0.012, 1 + br * 0.008, 1 + br * 0.012);
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -br * 0.05;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.14 - br * 0.05;
      rig.neck.rotation.y = Math.sin(t * 0.6) * 0.10;
      rig.neck.rotation.x = -0.02;
      plantFeet(rig);
    },
  },

  squat: {
    label: 'Squat', cycle: 1.5,
    fn(rig, p, t) {
      neutral(rig);
      const d = rep(p, 0.56);
      const lag = rep(wrap(p - 0.04), 0.56);
      const bnc = bounce(p, 0.70);

      // Hip flexes (thigh swings forward/up relative to the torso) and the knee
      // folds back. Shins stay near vertical-ish, so the knee ends up over the
      // toes rather than shooting past them.
      const hipA = -d * 1.30;
      const kneeA = d * 1.66;
      rig.hipL.rotation.x = rig.hipR.rotation.x = hipA;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = kneeA;
      // knees track OUT over the toes, never collapsing inward
      rig.hipL.rotation.z = d * 0.17;
      rig.hipR.rotation.z = -d * 0.17;

      // Chest stays proud: the torso counter-leans forward less than the hip
      // flexes, which is what keeps the back from rounding.
      rig.torso.rotation.x = lag * 0.40 - bnc * 0.06;
      rig.neck.rotation.x = -lag * 0.30 + bnc * 0.05;
      rig.neck.rotation.y = Math.sin(t * 0.9) * 0.05;

      // arms counterweight forward
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -lag * 1.40;
      rig.shoulderL.rotation.z = 0.10 + d * 0.12;
      rig.shoulderR.rotation.z = -0.10 - d * 0.12;
      const fore = rep(wrap(p - 0.07), 0.56);
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.12 - fore * 0.34;

      // Heels planted, soles flat — measured, so it holds at every depth.
      levelFoot(rig.ankleL); levelFoot(rig.ankleR);
      plantFeet(rig, 0);
      rig.orient.position.y += bnc * 0.005;

      squash(rig, d * 0.06 - bnc * 0.04);
      rig.sh.w = rig.sh.l = 1 + d * 0.16;
      rig.sh.o = 1 + d * 0.22;
    },
  },

  /**
   * PUSH-UP — rebuilt.
   *
   * What was broken: the old version drove the elbow with a POSITIVE
   * rotation.x. In the prone frame (body +Y → world +X toward the head) that
   * sends the forearm along body −Y, i.e. toward the FEET, with the hand
   * swinging up into the air. The figure ended up face-planted with its arms
   * folded backwards and nothing supporting it. Verified numerically before
   * touching the code: at bend 1.0 the old forearm direction had a body-Y
   * component of −0.84 (feet-ward); it needs to be +0.84 (head-ward).
   *
   * What it does now:
   *  1. The body is a rigid plank pivoting about the TOES, which are pinned to
   *     a fixed point on the floor. Tilt is driven by the target chest height.
   *  2. The HANDS ARE FIXED IN WORLD SPACE for the whole rep — planted on the
   *     floor, slightly wider than the shoulders, under the chest. They are
   *     anchors, not animated parts.
   *  3. Each arm is solved by IK to its planted hand with the POLE placed
   *     BEHIND the athlete (toward the feet) and a little out to the side. That
   *     is what makes the elbow travel backward along the ribs, which is the
   *     anatomically correct direction — and it can't invert, because the bend
   *     angle is recovered from the true bone direction rather than authored.
   *
   * Because the hands are IK targets, the chest can move anywhere and the arms
   * still support it. The failure mode is gone by construction.
   */
  pushup: {
    label: 'Push-up', cycle: 1.4,
    fn(rig, p, t) {
      const D = rig.D;
      neutral(rig);
      const d = rep(p, 0.52);
      const bnc = bounce(p, 0.76);

      // Prone frame: body +Y → world +X (head), body +Z → world −Y (chest down).
      rig.orient.quaternion.setFromEuler(_prone);

      // Toe→shoulder distance along the body (the plank's lever arm).
      const lever = D.legUp + D.legLo + D.torsoLen;

      // ---- drive the rep by ELBOW BEND, not by shoulder height.
      //
      // Height-driven was the wrong parameterisation. Whatever height you pick,
      // the arm still has to span shoulder→hand, and that span also depends on
      // the forward/outboard hand offset, the torso sag and each style's mesh —
      // so the target kept landing out of range, the IK clamped, and the palms
      // hovered off the floor at lockout.
      //
      // Bend-driven inverts the dependency. Pick the elbow angle φ; the
      // shoulder→hand distance is then FIXED by the law of cosines:
      //     dist(φ) = √(L1² + L2² + 2·L1·L2·cos φ)
      // and we simply place the body so the shoulder sits exactly that far from
      // the planted hand. The target is reachable by construction, for every
      // style and build, at every phase. φ never reaches 0, so the elbow plane
      // is always defined and the joint never hits its singularity.
      const L1 = D.armUp, L2 = D.armLo + D.handR * 0.85;
      const bend = lerp(0.22, 1.85, d);          // near-straight → deep
      const dist = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(bend));

      const handY = D.handR * 0.15;              // palm rides just off the floor
      const dxFwd = D.torsoR * 0.30;             // hands forward of the shoulder
      const HZ = D.shoulderX * 1.35;             // slightly wider than shoulders

      // A plank isn't rigid — slight hip sag, and the chin tucks on the descent.
      const sag = Math.sin(t * 1.3) * 0.02;
      rig.torso.rotation.x = -0.04 + sag;
      rig.pelvis.rotation.x = sag * 0.5;
      // Look down at the floor, then UNTUCK slightly at the bottom. A real
      // athlete lifts the chin a touch as the chest nears the floor; tucking
      // further (the obvious "chin tucks on the descent" instinct) buries the
      // head inside the chest mesh at depth, which is what the first render of
      // this pose showed.
      rig.neck.rotation.x = 0.34 - d * 0.16;
      rig.hipL.rotation.z = 0.10; rig.hipR.rotation.z = -0.10;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = 0.05;
      // Toes tucked under: in the prone frame "down" for the foot is a big flex.
      rig.ankleL.rotation.x = rig.ankleR.rotation.x = -1.05;

      const place = (tl) => {
        rig.orient.quaternion.setFromEuler(_prone);
        rig.orient.quaternion.premultiply(_qTmp.setFromAxisAngle(_axisZ, tl));
        // Pin the toes to a fixed floor point — the body pivots about them,
        // exactly as a real push-up pivots about the toes.
        anchorPoint(rig, rig.toeL, 0, 0, D.hipX);
        rig.root.updateMatrixWorld(true);
      };

      // ---- calibrate the plank ONCE, then solve the tilt in closed form.
      //
      // The toe→shoulder vector is FIXED in body space (the leg and torso
      // angles don't change during the rep), so its length and its angle within
      // the prone frame are invariants. Measure them a single time and the
      // shoulder's height at any tilt is exactly
      //     shY(tilt) = lever · sin(tilt + φ₀)
      // which inverts directly. No iteration, no convergence to babysit, and it
      // uses the REAL lever — the nominal legUp+legLo+torsoLen ignores ankle
      // flex, knee bend and hip sag, which is what left the palms floating ~4%
      // of body height above the floor.
      if (!rig._plank || rig._plankKey !== D.H) {
        place(0);
        rig.shoulderL.getWorldPosition(_calS);
        rig.toeL.getWorldPosition(_calT);
        const vx = _calS.x - _calT.x, vy = _calS.y - _calT.y;
        rig._plank = {
          lever: Math.hypot(vx, vy) || lever,
          phi0: Math.atan2(vy, vx),
          shZ: Math.abs(_calS.z),
        };
        rig._plankKey = D.H;
      }
      const P = rig._plank;

      // Shoulder height that puts it exactly `dist` from the planted hand.
      const horiz = dxFwd * dxFwd + (HZ - P.shZ) ** 2;
      const shY = handY + Math.sqrt(Math.max(dist * dist - horiz, 1e-6));
      const tilt = Math.asin(clamp(shY / P.lever, -0.999, 0.999)) - P.phi0;

      place(tilt);
      rig.orient.position.y += bnc * 0.003;
      rig.root.updateMatrixWorld(true);
      rig.shoulderL.getWorldPosition(_calS);
      const HX = _calS.x + dxFwd;

      const y = handY;

      // Pole BEHIND the athlete (−X, toward the feet) and outboard. This single
      // choice is what makes the elbows sweep BACK along the ribs — the
      // anatomically correct direction — instead of folding forward. It is
      // stated as a direction in world space rather than as a joint-angle sign,
      // which is why the inverted-elbow bug cannot recur.
      const back = -lever * 1.2;
      const poleY = y + D.armTotal * 0.35;
      _tgtA.set(HX, y, HZ);  _polA.set(back, poleY, HZ * 2.4);
      _tgtB.set(HX, y, -HZ); _polB.set(back, poleY, -HZ * 2.4);
      // Solve to the PALM, not the wrist: L2 carries the palm offset so the
      // hand's UNDERSIDE — not the wrist joint — is what meets the floor.
      solveTwoBone(rig.shoulderL, rig.elbowL, L1, L2, _tgtA, _polA);
      solveTwoBone(rig.shoulderR, rig.elbowR, L1, L2, _tgtB, _polB);

      rig.sh.w = 2.5; rig.sh.l = 1.15;
      rig.sh.o = 1 - d * 0.12;
    },
  },

  jumpingjack: {
    label: 'Jumping jack', cycle: 1.3,
    fn(rig, p, t) {
      const D = rig.D;
      neutral(rig);
      const d = rep(p, 0.5);
      const air = Math.pow(Math.abs(Math.sin(p * Math.PI * 2)), 0.7);
      const land = 1 - air;
      const hop = air * D.hipY * 0.16;

      // Arms lead, forearms trail — overlapping action is what sells the swing.
      const armD = rep(wrap(p - 0.03), 0.5);
      rig.shoulderL.rotation.z = 0.10 + armD * 2.74;
      rig.shoulderR.rotation.z = -0.10 - armD * 2.74;
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -0.12 * air;
      const foreD = rep(wrap(p - 0.09), 0.5);
      rig.elbowL.rotation.z = (1 - foreD) * 0.20;
      rig.elbowR.rotation.z = -(1 - foreD) * 0.20;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.10 - (1 - foreD) * 0.14;

      const splay = d * 0.42;
      const kneeA = 0.06 + land * 0.34;
      const hipA = -land * 0.16;
      rig.hipL.rotation.z = splay;  rig.hipR.rotation.z = -splay;
      rig.hipL.rotation.x = rig.hipR.rotation.x = hipA;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = kneeA;

      rig.torso.rotation.x = land * 0.13 - air * 0.04;
      rig.neck.rotation.x = -land * 0.10;
      rig.neck.rotation.z = Math.sin(t * 1.1) * 0.04;

      levelFoot(rig.ankleL); levelFoot(rig.ankleR);
      plantFeet(rig, 0);
      rig.orient.position.y += hop;

      squash(rig, land * 0.09 - air * 0.05);
      rig.sh.w = rig.sh.l = 1.25 - air * 0.34;
      rig.sh.o = 1.05 - air * 0.45;
    },
  },

  curl: {
    label: 'Bicep curl', cycle: 1.6,
    fn(rig, p, t) {
      neutral(rig);
      // Alternating arms — far more watchable than both moving as one, and it
      // gives the torso something to counter-rotate against.
      const a = rep(p, 0.42);
      const b = rep(wrap(p + 0.5), 0.42);

      rig.elbowL.rotation.x = -0.14 - a * 2.10;
      rig.elbowR.rotation.x = -0.14 - b * 2.10;
      rig.shoulderL.rotation.x = -a * 0.18;
      rig.shoulderR.rotation.x = -b * 0.18;
      rig.shoulderL.rotation.z = 0.13 + a * 0.09;
      rig.shoulderR.rotation.z = -0.13 - b * 0.09;

      const twist = (a - b) * 0.13;
      rig.torso.rotation.y = twist;
      rig.pelvis.rotation.y = -twist * 0.35;
      rig.torso.rotation.z = -twist * 0.28;
      rig.torso.rotation.x = -Math.max(a, b) * 0.05;
      rig.neck.rotation.y = -twist * 0.55;
      rig.neck.rotation.x = Math.max(a, b) * 0.08 + Math.sin(t * 1.6) * 0.02;

      const dip = Math.max(a, b);
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = 0.09 + dip * 0.06;
      rig.hipL.rotation.x = rig.hipR.rotation.x = -0.05 - dip * 0.03;
      levelFoot(rig.ankleL); levelFoot(rig.ankleR);
      plantFeet(rig, 0);

      squash(rig, dip * 0.03);
      rig.sh.o = 1 + dip * 0.06;
    },
  },
};

export const EXERCISE_NAMES = Object.keys(EXERCISES);

// ── config ───────────────────────────────────────────────────────────────────
export const AVATAR_DEFAULTS = {
  style: 'athletic',
  tier: 'fit',
  skinTone: '#e9c49b',
  outfitColor: null,
  accentColor: null,
  hairColor: '#2b2118',
  build: 'average',
  height: 1,
  hair: 'short',
  accessory: 'none',
  exercise: 'squat',
  cycle: null,
  scale: 1,
};

export function hex(v, fallback) {
  if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0');
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) {
    const s = v.trim();
    return s[0] === '#' ? s.toLowerCase() : '#' + s.toLowerCase();
  }
  return fallback;
}
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

export function normalizeAvatarConfig(opts = {}, styleIds = []) {
  const tier = oneOf(opts.tier, Object.keys(TIER_COLORS), AVATAR_DEFAULTS.tier);
  const tierHex = hex(TIER_COLORS[tier], '#c6f32e');
  const legacy = opts.color != null ? hex(opts.color, tierHex) : null;
  return {
    style: styleIds.length ? oneOf(opts.style, styleIds, styleIds[0]) : (opts.style ?? AVATAR_DEFAULTS.style),
    tier,
    skinTone: hex(opts.skinTone, AVATAR_DEFAULTS.skinTone),
    outfitColor: hex(opts.outfitColor ?? legacy, tierHex),
    accentColor: hex(opts.accentColor, TIER_ACCENTS[tier] ?? '#e8eaed'),
    hairColor: hex(opts.hairColor, AVATAR_DEFAULTS.hairColor),
    build: oneOf(opts.build, BUILDS, AVATAR_DEFAULTS.build),
    height: Math.round(clamp(Number(opts.height ?? 1) || 1, 0.72, 1.35) * 1000) / 1000,
    hair: oneOf(opts.hair, HAIR_STYLES, AVATAR_DEFAULTS.hair),
    accessory: oneOf(opts.accessory, ACCESSORIES, AVATAR_DEFAULTS.accessory),
    exercise: oneOf(opts.exercise, EXERCISE_NAMES, AVATAR_DEFAULTS.exercise),
    cycle: opts.cycle == null ? null : Math.round(clamp(Number(opts.cycle) || 1.5, 0.4, 6) * 100) / 100,
    scale: Math.round(clamp(Number(opts.scale ?? 1) || 1, 0.2, 4) * 1000) / 1000,
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function avatarConfigFromSeed(seed, overrides = {}, styleIds = []) {
  const rnd = mulberry32(hashSeed(seed));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const tier = overrides.tier ?? pick(Object.keys(TIER_COLORS));
  const cfg = {
    tier,
    skinTone: pick(SKIN_TONES),
    outfitColor: hex(TIER_COLORS[tier], '#c6f32e'),
    accentColor: pick(OUTFIT_COLORS),
    hairColor: pick(HAIR_COLORS),
    build: pick(BUILDS),
    height: Math.round((0.88 + rnd() * 0.32) * 100) / 100,
    hair: pick(HAIR_STYLES),
    accessory: pick(ACCESSORIES),
    exercise: pick(EXERCISE_NAMES.filter((n) => n !== 'stand')),
  };
  if (cfg.accentColor === cfg.outfitColor) {
    cfg.accentColor = OUTFIT_COLORS[(OUTFIT_COLORS.indexOf(cfg.accentColor) + 3) % OUTFIT_COLORS.length];
  }
  return normalizeAvatarConfig({ ...cfg, ...overrides }, styleIds);
}

// ── avatar factory ───────────────────────────────────────────────────────────
/**
 * Wrap a style + config into the SAME public API the old createAvatar exposed,
 * so a style is a drop-in swap anywhere an avatar is used.
 */
export function makeAvatar(style, opts, styleIds = []) {
  const config = normalizeAvatarConfig({ ...opts, style: style.id }, styleIds);
  const rig = buildSkeleton(style, config);
  const audit = auditDims(rig.D);
  if (audit.length) console.warn(`RWF avatar style "${style.id}" proportion audit:`, audit);

  let exercise = EXERCISES[config.exercise] ?? EXERCISES.squat;
  let cycle = config.cycle ?? exercise.cycle;
  let phase = 0, clockT = 0, reps = 0;
  const baseShadow = { w: rig.shadow.scale.x, l: rig.shadow.scale.y };

  function applyPose(p) {
    exercise.fn(rig, p, clockT);
    rig.shadow.scale.set(baseShadow.w * rig.sh.w, baseShadow.l * rig.sh.l, 1);
    rig.shadow.material.opacity = clamp(0.85 * rig.sh.o, 0, 1);
  }

  const api = {
    group: rig.root,
    config, dims: rig.D, rig,
    style, styleId: style.id, styleName: style.name,
    audit,
    get exercise() { return exercise; },
    get exerciseName() { return config.exercise; },
    get cycle() { return cycle; },
    get reps() { return reps; },

    setExercise(name, cycleOverride) {
      const ex = EXERCISES[name];
      if (!ex) return false;
      exercise = ex;
      config.exercise = name;
      cycle = cycleOverride ?? config.cycle ?? ex.cycle;
      phase = 0;
      applyPose(0);
      return true;
    },
    setCycle(v) {
      cycle = clamp(Number(v) || exercise.cycle, 0.3, 8);
      config.cycle = Math.round(cycle * 100) / 100;
    },
    setColors(partial = {}) {
      const map = {
        skinTone: rig.palette.skin, outfitColor: rig.palette.outfit,
        accentColor: rig.palette.accent, hairColor: rig.palette.hair,
      };
      for (const [key, mat] of Object.entries(map)) {
        if (partial[key] == null || !mat) continue;
        const h = hex(partial[key], config[key]);
        config[key] = h;
        mat.color.set(h);
        if (mat.emissive) mat.emissive.set(h).multiplyScalar(mat === rig.palette.accent ? 0.18 : 0.09);
        mat.needsUpdate = true;
      }
    },
    update(dt) {
      clockT += dt; phase += dt;
      if (phase >= cycle) {
        phase %= cycle; reps++;
        if (typeof opts.onRep === 'function') opts.onRep(reps, api);
      }
      applyPose(phase / cycle);
    },
    pose(p = 0.34) { phase = p * cycle; applyPose(p); },
    reset() { reps = 0; phase = 0; applyPose(0); },
    toJSON() { return { ...config }; },
    dispose() {
      for (const g of rig.geoms) g.dispose();
      for (const m of rig.mats) { if (m.map) m.map.dispose(); m.dispose(); }
      rig.geoms.clear(); rig.mats.length = 0;
    },
  };

  applyPose(0);
  return api;
}
