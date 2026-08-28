// site/models/geno-wardrobe.js — attachable wardrobe + species heads for Geno.
//
// The founder's ask: "GENO with clothes and frog heads". Everything here is
// BONE-PARENTED: each piece is a Group added as a child of the bone it dresses
// (shorts → UpLeg, tank → Spine chain, head → Head bone), oriented ONCE at
// attach time from the rig's own bind geometry, then never touched again. BVH
// mocap playback and the procedural exercise poses only write bone locals, so
// the wardrobe just rides along — no per-frame coupling, nothing to break.
//
// Placement maths is done in intuitive world-aligned axes: frameOnBone() builds
// a group whose local +Y matches a given world direction (usually bone→child)
// and +Z a world forward, so pieces are authored as if in world space ("up the
// limb", "toward the toes") regardless of Geno's FBX-rotated bone frames.
//
// Proportions are fractions of avatar.H (measured live); the radii below come
// from measuring Geno's skinned-mesh vertex extents per dominant bone weight
// (head 0.163w×0.228h×0.206d, thigh r≈0.053H, waist semi-axes 0.075H/0.028H,
// chest 0.092H/0.073H, foot 0.267 long — H≈1.71 units), so the clothes sit
// OUTSIDE the body with a believable margin instead of floating or clipping.
//
// Colours are the design tokens (design/tokens.css): lime/coral/amber/sky.
// Materials: flat MeshLambertMaterial — the same game-art treatment as the
// Geno flat tints (no specular glow, colour reads as colour on the dark stage).
import * as THREE from 'three';

// ── tokens & palette ─────────────────────────────────────────────────────────
export const WARDROBE_TOKENS = {
  lime: '#c6f32e',   // --lime   (primary — tank / wristbands / visor line)
  coral: '#ff5c38',  // --coral  (effort — shorts / headband / antenna tip)
  amber: '#ffb020',  // --amber  (crown / charity-pot charm)
  sky: '#6ec1ff',    // --sky    (info — spare accent)
  ink: '#141820',    // near-black details (mouth, pupils, soles)
  charcoal: '#2a3038', // sneakers / belt
  white: '#e8ebef',  // shoe sole / eye highlights
};

export const WARDROBE_SLOTS = ['shorts', 'tank', 'headband', 'wristbands', 'sneakers', 'belt'];
export const SLOT_LABELS = {
  shorts: 'shorts', tank: 'tank', headband: 'band', wristbands: 'bands',
  sneakers: 'shoes', belt: 'belt',
};

const lam = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(color), ...extra });

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1); // model forward — ModelAvatar faces toes +Z

// ── rig measurement (all at bind, all live) ──────────────────────────────────
const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();

/** world direction from bone a to bone b (bind pose) */
function wdir(a, b, out = new THREE.Vector3()) {
  a.getWorldPosition(_wa); b.getWorldPosition(_wb);
  return out.copy(_wb).sub(_wa);
}

/** primary chain child of a bone (digit-increment rule, else first bone child) */
function childBone(bone) {
  const kids = bone.children.filter((c) => c.isBone);
  if (!kids.length) return null;
  const m = bone.name.match(/^(\D+)(\d+)$/);
  if (m) {
    const cont = kids.find((c) => c.name === m[1] + (Number(m[2]) + 1));
    if (cont) return cont;
  }
  return kids[0];
}

/**
 * Group parented to `bone` whose local axes match world directions at bind:
 * +Y ≈ upW (usually bone→chain-child), +Z ≈ fwdW (orthogonalised), right-handed.
 * Author children as if in world space; the group rides the bone forever after.
 */
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

/** limb frame: +Y from bone toward its chain child, +Z world-forward */
function limbFrame(bone) {
  const c = childBone(bone);
  const up = c ? wdir(bone, c, new THREE.Vector3()) : UP.clone();
  if (up.lengthSq() < 1e-9) up.copy(UP);
  return { g: frameOnBone(bone, up.normalize(), FWD), len: up.length() };
}

/** elliptical tube along a frame's +Y: radii are (rx, rz) semi-axes */
function tube(rx, rz, rTopScale, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rx * rTopScale, rx, h, 12, 1), mat);
  m.scale.z = rz / rx;
  return m;
}

/** remove wardrobe groups inherited through loadModel()'s clone(true) —
 *  attachments are per-card; a clone of an attached scene must start clean.
 *  Call ONCE before attaching anything (attachHead after attachWardrobe must
 *  not strip the fresh wardrobe — that's how the full-kit card lost its clothes). */
export function clearWardrobe(avatar) {
  stripInherited(avatar.prone.children[0]);
}

function stripInherited(root) {
  const doomed = [];
  root.traverse((o) => { if (o.userData?.rwfWardrobe) doomed.push(o); });
  for (const o of doomed) o.parent?.remove(o);
}

// ── CLOTHES ──────────────────────────────────────────────────────────────────
// Each builder attaches piece groups DIRECTLY to their bones (a piece must
// ride ITS bone through the mocap), and returns the list of attached roots.
// The slot "container" is that list — a virtual group, NOT a scene node
// (Object3D.add() reparents, so an outer container would yank pieces off
// their bones and they'd never render).

function buildShorts(av, colors) {
  const H = av.H;
  const mat = lam(colors.shorts);
  const roots = [];

  // pelvis shell — engulfs the hips joint so the seat/hip seam reads covered
  const hips = av.bones.hips, spine = av.bones.spine;
  const pf = frameOnBone(hips, wdir(hips, spine, new THREE.Vector3()).normalize(), FWD);
  pf.userData.rwfWardrobe = 'shorts';
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
  pelvis.scale.set(0.125 * H, 0.098 * H, 0.088 * H);
  pelvis.position.y = 0.028 * H;
  pf.add(pelvis);
  roots.push(pf);

  // leg tubes — tapered, parented to each thigh, hip → mid-thigh
  for (const side of ['upLegL', 'upLegR']) {
    const bone = av.bones[side];
    if (!bone) continue;
    const { g: lf, len } = limbFrame(bone);
    lf.userData.rwfWardrobe = 'shorts';
    const h = 0.46 * len;
    const leg = tube(0.063 * H, 0.056 * H, 0.86, h, mat); // taper narrower toward the knee
    leg.position.y = 0.02 * len + h / 2;
    lf.add(leg);
    roots.push(lf);
  }
  return roots;
}

function buildTank(av, colors) {
  const H = av.H;
  const mat = lam(colors.tank);
  const roots = [];

  // stacked tubes on the spine chain — bends with Spine1/2/3 during squats
  const chain = [
    ['spine1', 'spine2', 0.089, 0.046, 0.098, 0.062], // waist → (semi-axes ×H)
    ['spine2', 'spine3', 0.098, 0.068, 0.104, 0.082],
    ['spine3', 'neck', 0.104, 0.082, 0.108, 0.09],    // chest, shoulder-width top
  ];
  for (const [aName, bName, rxB, rzB, rxT, rzT] of chain) {
    const a = av.bones[aName], b = av.bones[bName];
    if (!a || !b) continue;
    const { g: sf } = limbFrame(a);
    sf.userData.rwfWardrobe = 'tank';
    const len = wdir(a, b, new THREE.Vector3()).length();
    const h = len + 0.075 * H; // overlap the joints so no skin peeks through
    const seg = tube(rxB * H, rzB * H, rxT / rxB, h, mat);
    seg.position.y = -0.03 * H + h / 2;
    sf.add(seg);
    roots.push(sf);
  }

  // shoulder caps — short tubes on the upper arms so the shoulder seam reads
  for (const side of ['armL', 'armR']) {
    const bone = av.bones[side];
    if (!bone) continue;
    const { g: af, len } = limbFrame(bone);
    af.userData.rwfWardrobe = 'tank';
    const cap = tube(0.052 * H, 0.042 * H, 0.92, 0.34 * len, mat);
    cap.position.y = 0.16 * len;
    af.add(cap);
    roots.push(af);
  }
  return roots;
}

function buildHeadband(av, colors) {
  const H = av.H;
  const g = frameOnBone(av.bones.head, headUp(av), FWD);
  g.userData.rwfWardrobe = 'headband';
  // radius > head semi-depth so the band visibly crosses the forehead (the
  // head is 0.060H deep — a flush torus hides inside it from the front)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.068 * H, 0.0145 * H, 8, 18), lam(colors.headband));
  band.rotation.x = Math.PI / 2; // lie in the local XZ plane (around the skull)
  band.position.set(0, 0.072 * H, 0.014 * H);
  g.add(band);
  return g;
}

function buildWristbands(av, colors) {
  const H = av.H;
  const roots = [];
  for (const side of ['foreL', 'foreR']) {
    const bone = av.bones[side];
    if (!bone) continue;
    const { g: ff, len } = limbFrame(bone);
    ff.userData.rwfWardrobe = 'wristbands';
    const band = tube(0.038 * H, 0.034 * H, 0.94, 0.13 * len, lam(colors.wristbands));
    band.position.y = 0.8 * len;
    ff.add(band);
    roots.push(ff);
  }
  return roots;
}

function buildSneakers(av, colors) {
  const H = av.H;
  const upper = lam(colors.sneakers);
  const sole = lam(WARDROBE_TOKENS.white);
  const roots = [];
  for (const side of ['footL', 'footR']) {
    const bone = av.bones[side];
    if (!bone) continue;
    const toe = av.bones[side === 'footL' ? 'toeL' : 'toeR'];
    const fwdW = toe ? wdir(bone, toe, new THREE.Vector3()).normalize() : FWD.clone();
    fwdW.y = 0;
    if (fwdW.lengthSq() < 1e-8) fwdW.copy(FWD);
    const sf = frameOnBone(bone, UP, fwdW.normalize()); // +Y world-up, +Z toward toes
    sf.userData.rwfWardrobe = 'sneakers';
    // ankle sits ~0.053H above the floor; shoe engulfs heel→toe
    const soleM = new THREE.Mesh(new THREE.BoxGeometry(0.096 * H, 0.03 * H, 0.2 * H), sole);
    soleM.position.set(0, -0.038 * H, 0.012 * H);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.086 * H, 0.055 * H, 0.185 * H), upper);
    body.position.set(0, 0, 0.008 * H);
    const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.082 * H, 0.032 * H, 0.05 * H), sole);
    toeCap.position.set(0, -0.026 * H, 0.1 * H);
    sf.add(soleM, body, toeCap);
    roots.push(sf);
  }
  return roots;
}

function buildBelt(av, colors) {
  const H = av.H;
  const hips = av.bones.hips, spine = av.bones.spine;
  const g = frameOnBone(hips, wdir(hips, spine, new THREE.Vector3()).normalize(), FWD);
  g.userData.rwfWardrobe = 'belt';
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.128 * H, 0.017 * H, 8, 20), lam(colors.belt));
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.72; // elliptical — the body is deeper than wide at the waist? no: narrower
  belt.position.y = 0.075 * H;
  g.add(belt);
  // charity-pot charm: a tiny amber pot hanging at the right-front hip
  const charm = new THREE.Group();
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.011 * H, 0.004 * H, 6, 10), lam(WARDROBE_TOKENS.amber));
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.016 * H, 10, 8), lam(WARDROBE_TOKENS.amber));
  pot.scale.y = 0.8;
  pot.position.y = -0.03 * H;
  charm.add(loop, pot);
  charm.position.set(0.082 * H, 0.058 * H, 0.086 * H);
  g.add(charm);
  return g;
}

/** world "up" of the head: neck→head direction (Head has no chain child) */
function headUp(av) {
  const d = wdir(av.bones.neck ?? av.bones.head, av.bones.head, new THREE.Vector3());
  if (d.lengthSq() < 1e-9) return UP.clone();
  return d.normalize();
}

// ── SPECIES HEADS ────────────────────────────────────────────────────────────
// One engulfing skull + species features, all in a Head-bone frame (+Y up from
// the neck, +Z face-forward). Sized to swallow Geno's head (semi-extents
// 0.048H/0.133H/0.060H) so no white skull pokes through.

function frogEye(H, side, raised) {
  const eye = new THREE.Group();
  // emissive lift: eyes must READ as eyes from any angle/lighting — a
  // shadow-side sphere renders mud-green otherwise (probe-verified)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.036 * H, 12, 10),
    lam('#eef2c0', { emissive: new THREE.Color('#6a7433'), emissiveIntensity: 0.55 }));
  // pupil = a contact-lens cap ON the bulb, facing out-up-FORWARD. Coverage
  // maths: the cap's rim subtends ~48° from the eye centre, and its axis sits
  // ~41° off both the front view and the profile view direction — so black
  // reads from the front AND side-on through the walk cycle's head yaw (a
  // small sphere or a purely lateral cap grazes the bulb's horizon instead).
  const dir = new THREE.Vector3(0.42 * side, 0.55, 0.72).normalize();
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03 * H, 12, 8), lam(WARDROBE_TOKENS.ink));
  pupil.quaternion.setFromUnitVectors(UP, dir); // local +Y (the flat axis) → dir
  pupil.scale.set(1, 0.6, 1);                   // lens-shaped cap
  pupil.position.copy(dir).multiplyScalar(0.027 * H); // pole 0.045H, rim 0.040H — sits proud of the 0.036H bulb
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006 * H, 6, 6), lam(WARDROBE_TOKENS.white));
  // just off the cap's axis, on the pale rim — a sparkle next to the pupil
  glint.position.copy(dir).multiplyScalar(0.03 * H).add(new THREE.Vector3(0.002 * H, 0.01 * H, 0.006 * H));
  eye.add(bulb, pupil, glint);
  // crowns the skull: centre ABOVE the ellipsoid surface so the bulb reads
  // as a separate globe from the front, not a bump behind the brow
  eye.position.set(0.098 * H * side, (0.148 + (raised ? 0.013 : 0)) * H, 0.03 * H);
  return eye;
}

function buildFrogHead(av, { crown = false } = {}) {
  const H = av.H;
  const g = frameOnBone(av.bones.head, headUp(av), FWD);
  g.userData.rwfWardrobe = 'head:frog';
  const skin = lam('#4da33e');

  // wide flattened skull — engulfs Geno's head entirely
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.085 * H, 16, 12), skin);
  skull.scale.set(1.5, 1.18, 1.22);
  skull.position.set(0, 0.062 * H, 0.005 * H);
  g.add(skull);

  // TWO BULBOUS eyes on top — the left rides a touch higher (character)
  g.add(frogEye(H, 1, true), frogEye(H, -1, false));

  // wide mouth — a smile ARC riding the skull surface (reads from front AND
  // profile: a flat box foreshortens to nothing edge-on, probe-verified).
  // Euler XYZ applies Rz first: spin the arc mid to local +Y, then Rx(π/2)
  // maps it to world +Z (face-forward); scale.y hugs the shallower snout.
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.1 * H, 0.012 * H, 6, 20, Math.PI * 0.8),
    lam(WARDROBE_TOKENS.ink));
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.z = Math.PI * 0.1;
  mouth.scale.y = 0.82; // front of the arc clears the snout surface (skull semi-z ≈0.080H here)
  mouth.position.set(0, -0.004 * H, 0.005 * H);
  g.add(mouth);

  // nostrils
  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.007 * H, 6, 6), lam(WARDROBE_TOKENS.ink));
    n.position.set(0.024 * H * s, 0.052 * H, 0.104 * H);
    g.add(n);
  }

  if (crown) {
    const gold = lam(WARDROBE_TOKENS.amber);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.048 * H, 0.052 * H, 0.024 * H, 10), gold);
    base.position.set(0, 0.168 * H, 0);
    g.add(base);
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.011 * H, 0.038 * H, 6), gold);
      spike.position.set(0.034 * H * sx, 0.198 * H, 0.034 * H * sz);
      g.add(spike);
    }
  }
  return g;
}

function buildGoblinHead(av) {
  const H = av.H;
  const g = frameOnBone(av.bones.head, headUp(av), FWD);
  g.userData.rwfWardrobe = 'head:goblin';
  const skin = lam('#598c1f');       // the game's goblin green
  const skinLite = lam('#6da832');

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.082 * H, 16, 12), skin);
  skull.scale.set(1.28, 1.12, 1.18);
  skull.position.set(0, 0.058 * H, 0.01 * H);
  g.add(skull);

  // pointy ears, out + up + back
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.024 * H, 0.098 * H, 8), skin);
    const dir = new THREE.Vector3(0.82 * s, 0.45, -0.35).normalize();
    ear.quaternion.setFromUnitVectors(UP, dir);
    ear.position.set(0.102 * H * s, 0.078 * H, -0.012 * H);
    g.add(ear);
  }

  // snout
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.038 * H, 12, 10), skinLite);
  snout.scale.set(1.1, 0.85, 1.3);
  snout.position.set(0, 0.004 * H, 0.094 * H);
  g.add(snout);
  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.008 * H, 6, 6), lam(WARDROBE_TOKENS.ink));
    n.position.set(0.018 * H * s, 0.018 * H, 0.138 * H);
    g.add(n);
    // tusk — tiny white cone pointing up from under the snout
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.006 * H, 0.022 * H, 6), lam(WARDROBE_TOKENS.white));
    tusk.position.set(0.016 * H * s, -0.026 * H, 0.112 * H);
    tusk.rotation.x = Math.PI; // point down→up flip: cone +Y is up already; flip to point up from below
    g.add(tusk);
  }

  // amber eyes under heavy brows — pushed forward of the skull surface so
  // they read as eyes, not green bumps (skull front ≈0.089H at eye x/y);
  // emissive lift keeps them glowing out of the head's shadow side
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.024 * H, 10, 8),
      lam(WARDROBE_TOKENS.amber, { emissive: new THREE.Color('#8a4400'), emissiveIntensity: 0.65 }));
    eye.position.set(0.052 * H * s, 0.088 * H, 0.104 * H);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01 * H, 8, 6), lam(WARDROBE_TOKENS.ink));
    pupil.position.set(0.052 * H * s, 0.088 * H, 0.122 * H);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.052 * H, 0.013 * H, 0.022 * H), lam('#3c6316'));
    brow.position.set(0.052 * H * s, 0.118 * H, 0.102 * H);
    brow.rotation.z = 0.22 * s;
    g.add(eye, pupil, brow);
  }
  return g;
}

function buildRobotHead(av) {
  const H = av.H;
  const g = frameOnBone(av.bones.head, headUp(av), FWD);
  g.userData.rwfWardrobe = 'head:robot';
  const shell = lam('#b7bfc9');
  const dark = lam(WARDROBE_TOKENS.charcoal);

  // neck collar hides the body/head seam
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.046 * H, 0.05 * H, 0.05 * H, 10), dark);
  collar.position.y = -0.005 * H;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.21 * H, 0.19 * H, 0.2 * H), shell);
  box.position.set(0, 0.062 * H, 0.005 * H);
  g.add(collar, box);

  // visor: dark plate + emissive lime scanline (scan sits clearly in front —
  // a coplanar box z-fights and reads black)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16 * H, 0.046 * H, 0.016 * H), lam('#10141a'));
  visor.position.set(0, 0.078 * H, 0.106 * H);
  const scan = new THREE.Mesh(
    new THREE.BoxGeometry(0.148 * H, 0.011 * H, 0.02 * H),
    lam(WARDROBE_TOKENS.ink, { emissive: new THREE.Color(WARDROBE_TOKENS.lime), emissiveIntensity: 1 }));
  scan.position.set(0, 0.078 * H, 0.112 * H);
  g.add(visor, scan);

  // mouth grill
  for (const x of [-0.024, 0, 0.024]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.011 * H, 0.024 * H, 0.012 * H), dark);
    bar.position.set(x * H, 0.008 * H, 0.106 * H);
    g.add(bar);
  }

  // ear pods
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.032 * H, 0.032 * H, 0.02 * H, 10), dark);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(0.114 * H * s, 0.06 * H, 0.01 * H);
    g.add(pod);
  }

  // antenna with coral tip
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * H, 0.005 * H, 0.056 * H, 6), dark);
  stem.position.set(0.048 * H, 0.185 * H, -0.02 * H);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.013 * H, 8, 8),
    lam(WARDROBE_TOKENS.coral, { emissive: new THREE.Color(WARDROBE_TOKENS.coral), emissiveIntensity: 0.35 }));
  tip.position.set(0.048 * H, 0.218 * H, -0.02 * H);
  g.add(stem, tip);
  return g;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Attach wardrobe pieces to a loaded ModelAvatar (Geno, mixamo rig).
 * opts.slots: array of WARDROBE_SLOTS, or 'full' (default: everything).
 * opts.colors: overrides keyed by slot (defaults: token colours).
 * Returns { slots, toggle(slot, on) } — toggle flips visibility per slot.
 */
export function attachWardrobe(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachWardrobe: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);

  const colors = {
    shorts: WARDROBE_TOKENS.coral,
    tank: WARDROBE_TOKENS.lime,
    headband: WARDROBE_TOKENS.coral,
    wristbands: WARDROBE_TOKENS.lime,
    sneakers: WARDROBE_TOKENS.charcoal,
    belt: WARDROBE_TOKENS.charcoal,
    ...(opts.colors || {}),
  };
  const wanted = opts.slots === 'full' || !opts.slots ? WARDROBE_SLOTS : opts.slots;

  const builders = {
    shorts: buildShorts, tank: buildTank, headband: buildHeadband,
    wristbands: buildWristbands, sneakers: buildSneakers, belt: buildBelt,
  };
  const slots = {};
  for (const name of WARDROBE_SLOTS) {
    if (!wanted.includes(name)) continue;
    const built = builders[name](avatar, colors);
    slots[name] = Array.isArray(built) ? built : [built]; // roots, each on its bone
  }
  const isVisible = (slot) => slots[slot]?.every((g) => g.visible) ?? true;
  return {
    slots,
    isVisible,
    toggle(slot, on) {
      for (const g of slots[slot] ?? []) g.visible = !!on;
    },
  };
}

/**
 * Attach a species head ('frog' | 'frog-crown' | 'goblin' | 'robot').
 * Returns the head Group (already parented to the Head bone).
 */
export function attachHead(avatar, species = 'frog') {
  const B = avatar.bones;
  if (!B?.head) throw new Error('attachHead: no Head bone');
  avatar.root.updateMatrixWorld(true);
  if (species === 'frog') return buildFrogHead(avatar);
  if (species === 'frog-crown') return buildFrogHead(avatar, { crown: true });
  if (species === 'goblin') return buildGoblinHead(avatar);
  if (species === 'robot') return buildRobotHead(avatar);
  throw new Error('attachHead: unknown species ' + species);
}
