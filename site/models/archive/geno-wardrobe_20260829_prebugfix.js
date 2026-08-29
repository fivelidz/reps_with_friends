// site/models/geno-wardrobe.js — GENO's clothes + species heads.
//
// v2 — SKINNED CLOTHES (the founder's verdict on v1: "frog head looks cool but
// clothes are not working properly on it at all"). v1 parented RIGID meshes to
// individual bones (shorts → thighs + a hips sphere, tank → separate spine
// tubes), and rigid segments on bending joints gap, tear and ride up through
// the mocap — the same failure mode as the early avatar joins. Worse, the tank
// chain referenced a spine3 key the bone map never exposed, so only ONE of
// three torso segments ever built: Geno's chest was bare with a "belly band".
//
// v2 rebuilds the soft garments as SkinnedMeshes bound to GENO'S OWN SKELETON:
//
//   • TANK  — one continuous ring tube from just above the belt to a shoulder
//     yoke, weights ramping smoothly Hips→Spine→Spine1→Spine2→Spine3 (zero
//     slope at each joint = classic smooth-skin falloff), plus blended sleeve
//     caps on the upper arms (top ring partly Spine3-weighted so the sleeve
//     stays anchored at the shoulder while the arm swings — a raglan sleeve).
//   • SHORTS — one continuous mesh: a pelvis shell (waistband → crotch, rides
//     the Hips) whose leg tubes start INSIDE the shell and blend Hips→UpLeg
//     across the upper-thigh rings, so the crotch deforms like fabric instead
//     of splitting. Continuity is structural: a single skinned mesh cannot
//     gap, tear, or leave its seam behind.
//   • Radii are MEASURED live off Geno's own skinned body (per-ring extents of
//     body vertices by dominant bone, plus a margin) — no more beach-ball
//     pelvis: v1's sphere was ~1.7× the body's waist because its proportions
//     were hand-guessed against the wrong reference height.
//   • Headband / wristbands / sneakers / belt stay BONE-PARENTED (rigid): each
//     sits across a single bone with no bend inside it, where rigid == 100%
//     single-bone skinning but cheaper. The belt is re-measured to hug the
//     waist. Species heads are unchanged (the founder approved those).
//
// BIND MATHS (the delicate part):
//   Geometry is authored in the glTF scene's LOCAL space — the skeleton's bind
//   space (boneInverses come from the loader at scene-identity; the body's own
//   bindMatrix is identity, verified by dump). The cloth SkinnedMesh is added
//   under that scene at identity and bound with an EXPLICIT identity
//   bindMatrix — never call bind() without one: the undefined-bindMatrix path
//   recalculates skeleton.boneInverses from the CURRENT pose and would corrupt
//   the body's skinning. With bindMode 'attached' (three's default) the mesh's
//   own transform cancels out every frame, so the bones' world matrices place
//   the fabric exactly as they place the body — BVH mocap, exercise poses and
//   the prone push-up tilt all carry it along with zero per-frame coupling.
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
const XAX = new THREE.Vector3(1, 0, 0);
const ZAX = new THREE.Vector3(0, 0, 1);

const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** hermite smoothstep — C1 at both ends, so weight ramps have zero slope at
 *  joints: the joint's own bone arrives at full weight exactly at the joint */
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

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

// ── SKINNED-CLOTHING CORE ────────────────────────────────────────────────────

/** Geno's own skin: the body SkinnedMesh's skeleton + a scene-local→bind
 *  converter. All clothing geometry is authored in THIS space. */
function genoSkin(av) {
  const scene = av.prone.children[0];
  let skeleton = null;
  scene.traverse((o) => { if (!skeleton && o.isSkinnedMesh && o.skeleton) skeleton = o.skeleton; });
  if (!skeleton) throw new Error('geno-wardrobe: model has no skinned body to bind clothes to');
  scene.updateMatrixWorld(true);
  const toBind = scene.matrixWorld.clone().invert();
  return { scene, skeleton, toBind };
}

/** bone by raw glTF name (normBone-style), searched live — reaches joints the
 *  logical bone map doesn't expose (Geno's Spine3) */
function findBone(av, rawName) {
  const norm = (n) => n.replace(/^mixamorig:/, '').replace(/^mixamorig/, '').replace(/[\[\].:/]/g, '');
  let hit = null;
  av.prone.children[0].traverse((o) => { if (!hit && o.isBone && norm(o.name) === rawName) hit = o; });
  return hit;
}

/** joint position in BIND space (scene-local) */
function bindPos(bone, toBind, out = new THREE.Vector3()) {
  return bone.getWorldPosition(out).applyMatrix4(toBind);
}

/**
 * Sampled body cloud: bind-space vertex positions tagged with the DOMINANT
 * bone index AND the full 4-bone weight vector — the measured "how thick is
 * the body here" oracle that clothing radii are offset from, AND the
 * deformation profile the clothing INHERITS (ring weights = the average of
 * the body weights it wraps, so fabric and skin can never disagree at a
 * bend — the v2.1 stripe-down-the-spine bug was exactly that disagreement).
 */
function bodyCloud(skin) {
  const pts = []; // {x,y,z, b, w: [[boneIndex, weight], …]}
  skin.scene.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || !o.geometry.attributes.skinWeight) return;
    const P = o.geometry.attributes.position;
    const SI = o.geometry.attributes.skinIndex;
    const SW = o.geometry.attributes.skinWeight;
    const step = Math.max(1, Math.floor(P.count / 5000));
    for (let i = 0; i < P.count; i += step) {
      const ks = [
        [SI.getX(i), SW.getX(i)], [SI.getY(i), SW.getY(i)],
        [SI.getZ(i), SW.getZ(i)], [SI.getW(i), SW.getW(i)],
      ];
      let dom = ks[0];
      for (const k of ks) if (k[1] > dom[1]) dom = k;
      pts.push({ x: P.getX(i), y: P.getY(i), z: P.getZ(i), b: dom[0], w: ks });
    }
  });
  return pts;
}

/** verts within `slab` of a ring plane (dominant bone ∈ boneSet, or all) —
 *  the exact population a ring wraps, shared by the extent + weight queries */
function slabVerts(cloud, boneSet, c, n, slab) {
  const out = [];
  for (const v of cloud) {
    if (boneSet && !boneSet.has(v.b)) continue;
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    if (Math.abs(dx * n.x + dy * n.y + dz * n.z) > slab) continue;
    out.push(v);
  }
  return out;
}

/** average the body's own skin weights over a vert population → the ring's
 *  weights. The fabric then deforms EXACTLY like the skin it wraps: at any
 *  bone bend, ring and surface move together (hand-tuned ramps lag the
 *  surface and let it poke through — the v2.1 mid-spine stripe). */
function avgWeights(verts) {
  const acc = new Map();
  for (const v of verts) {
    for (const [bi, w] of v.w) {
      if (w <= 0.001) continue;
      acc.set(bi, (acc.get(bi) ?? 0) + w);
    }
  }
  let total = 0;
  for (const w of acc.values()) total += w;
  if (total <= 0) return [[0, 1]];
  const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const sum = sorted.reduce((a, [, w]) => a + w, 0);
  return sorted.map(([bi, w]) => [bi, w / sum]);
}

/** max extent of cloud points (dominant bone ∈ boneSet, or ALL when null,
 *  within `slab` of the ring plane) along the ring's e1/e2 axes — the
 *  measured body semi-axes. All-bone mode is for garments that wrap the
 *  WHOLE cross-section (shorts at the hips wrap pelvis + both thigh tops —
 *  the hip saddle is thigh-dominant, so a torso-only query under-measures
 *  by ~2× and buries the garment inside the body). */
function ringExtent(cloud, boneSet, c, e1, e2, n, slab) {
  let rx = 0, rz = 0;
  for (const v of slabVerts(cloud, boneSet, c, n, slab)) {
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    const a = Math.abs(dx * e1.x + dy * e1.y + dz * e1.z);
    const b = Math.abs(dx * e2.x + dy * e2.y + dz * e2.z);
    if (a > rx) rx = a;
    if (b > rz) rz = b;
  }
  return { rx, rz };
}

/**
 * Build one SkinnedMesh from ring strips and bind it to Geno's skeleton.
 * rings: [{ c, e1, e2, n, rx, rz, w: [[boneIndex, weight], …] (sums to 1) }]
 * strips: array of ring arrays (each strip is tube-connected internally).
 */
function skinnedTube(skin, mat, strips, radial = 18, tag = '') {
  const pos = [], si = [], sw = [], idx = [];
  const layout = [];   // per-strip vertex map — hem pinning needs ring vertices
  let base = 0;
  for (const rings of strips) {
    if (rings.length < 2) { layout.push(null); continue; }
    layout.push({ start: base, ringCount: rings.length });
    for (const r of rings) {
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        pos.push(
          r.c.x + r.rx * ca * r.e1.x + r.rz * sa * r.e2.x,
          r.c.y + r.rx * ca * r.e1.y + r.rz * sa * r.e2.y,
          r.c.z + r.rx * ca * r.e1.z + r.rz * sa * r.e2.z,
        );
        si.push(r.w[0]?.[0] ?? 0, r.w[1]?.[0] ?? 0, r.w[2]?.[0] ?? 0, 0);
        sw.push(r.w[0]?.[1] ?? 0, r.w[1]?.[1] ?? 0, r.w[2]?.[1] ?? 0, 0);
      }
    }
    for (let ri = 0; ri < rings.length - 1; ri++) {
      for (let k = 0; k < radial; k++) {
        const a = base + ri * radial + k;
        const b = base + ri * radial + (k + 1) % radial;
        idx.push(a, a + radial, b, b, a + radial, b + radial);
      }
    }
    base += rings.length * radial;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.SkinnedMesh(g, mat);
  m.userData.rwfWardrobe = tag;
  m.userData.rwfLayout = { radial, layout };
  m.frustumCulled = false; // bind-pose bounds would cull mid-animation
  skin.scene.add(m);
  // EXPLICIT identity bindMatrix — see the bind-maths note at the top. The
  // undefined path would recalc boneInverses from the live pose and corrupt
  // the body's own skinning.
  m.bind(skin.skeleton, new THREE.Matrix4());
  return m;
}

// ── FABRIC SECONDARY MOTION ──────────────────────────────────────────────────
// The garments above are weight-inherited SkinnedMeshes — they follow the body
// EXACTLY, which is correct but stiff: real fabric lags, flares and settles.
// Each hem (the tank's hem, both shorts leg openings) additionally gets a
// light verlet cloth strip:
//
//   • 12 particles around × 2 free rings = 24 simulated particles per hem
//     (72 per fully-dressed card — deliberate "tiny", the gallery renders
//     20+ cards from one rAF loop).
//   • The TOP ring is pinned to the skinned garment's bottom edge, sampled by
//     CPU-skinning the garment's own ring vertices each frame
//     (SkinnedMesh.applyBoneTransform — the exact shader maths, so the pin
//     follows BVH mocap / exercise poses / the prone tilt precisely).
//   • Free rings integrate under scaled gravity with heavy damping (fabric
//     that settles, not a flag), held by structural (vertical + ring
//     circumference) and shear constraints, and pushed out of bone-segment
//     capsules (thighs for the shorts hems; pelvis + thighs for the tank hem)
//     approximated as distance constraints.
//   • Motion reactivity comes free: the anchors ride the bones, so strides
//     SWING the hems (they lag a frame behind the thigh), squats FLARE them
//     (thigh capsules shove the fabric outward as they rotate up), and at
//     rest everything hangs still. Amplitude is tuned subtle: ~2-4 cm of
//     lag/settle at human scale, never billowing.
//
// The strip is a plain (non-skinned) Mesh whose position attribute is
// rewritten every frame — world-space sim, written back through the mesh's
// inverse world matrix so it inherits the prone/root transforms for free.

const HEM_STEP = 1 / 90;   // fixed sim substep (s) — verlet hates varying dt
const HEM_DAMP = 0.82;     // per-substep damping — low enough that strides swing
                           // the hems, high enough that they settle in ~½ s
const HEM_ITERS = 3;       // constraint relaxation iterations per substep
const HEM_SHEAR = 0.35;    // shear stiffness < 1: the strip may skew (sway)
                           // without changing circumference
const HEM_STRUCT = 0.22;   // vertical structure stiffness: a FULL-strength
                           // anchor constraint snaps the hem onto the bone
                           // motion every substep — the sim reads rigid (measured:
                           // ~0.5 cm flex). Soft verticals give the strip real
                           // inertia: it lags the stride, then settles.

class HemCloth {
  /**
   * spec: {
   *   garment: SkinnedMesh (pins read its bottom ring),
   *   ringStart: flat vertex index of the pin ring's column 0,
   *   columns: hem particles around (12), rows: free rings (2),
   *   gap: ring spacing in scene (bind) units,
   *   capsules: [{ a: Bone, b: Bone, r: radius scene units }],
   *   tag: wardrobe slot tag, scene: skin scene (parent), height: av.H,
   * }
   */
  constructor(spec) {
    const { garment, ringStart, radial, columns: C, rows: R, gap } = spec;
    this.spec = spec;
    this.C = C; this.R = R; this.gap = gap;
    this.frozen = false; this.seeded = false; this.acc = 0; this.dead = false;

    // ── pin ring sampling: bind positions + (j0, j1, blend) per column.
    // The garment ring has `radial` verts; the hem wants C columns — sample
    // the ring ellipse at C angles by blending the two nearest ring verts.
    const posA = garment.geometry.attributes.position;
    this.pinCols = [];
    this.pinBind = [];
    for (let k = 0; k < C; k++) {
      const u = (k / C) * radial;
      const j0 = Math.floor(u) % radial, j1 = (j0 + 1) % radial, f = u - Math.floor(u);
      this.pinCols.push([ringStart + j0, ringStart + j1, f]);
      const a = new THREE.Vector3().fromBufferAttribute(posA, ringStart + j0);
      const b = new THREE.Vector3().fromBufferAttribute(posA, ringStart + j1);
      this.pinBind.push(a.lerp(b, f)); // scene-space bind anchor
    }

    // ── constraints (rest lengths in scene units, scaled at solve time)
    // flat particle index i = row*C + col; row 0 is the pin ring (immovable)
    // By default the free rings keep the pin ring's circumference (a cylinder
    // hem, e.g. the shorts legs). A skirt hem that drapes OVER something wider
    // (the tank over the shorts waistband) passes restRadius instead, so the
    // ring constraints and the collision capsule agree at rest.
    let chordR = 0;
    {
      const ctr = new THREE.Vector3();
      for (const v of this.pinBind) ctr.add(v);
      ctr.multiplyScalar(1 / C);
      for (const v of this.pinBind) chordR += v.distanceTo(ctr);
      chordR /= C; // mean ring radius (ellipses: close enough for a chord rest)
    }
    const ringR = spec.restRadius ?? chordR;
    const chord = 2 * ringR * Math.sin(Math.PI / C);
    const diag = Math.hypot(chord, gap);
    this.cons = []; // [i, j, restScene, stiffness]
    for (let r = 0; r < R; r++) {
      for (let k = 0; k < C; k++) {
        const i = r * C + k;
        this.cons.push([i, i + C, gap, HEM_STRUCT]);                  // vertical structure
        this.cons.push([i, r * C + (k + 1) % C, chord, 1]);           // ring circumference
        this.cons.push([i, (r + 1) * C + (k + 1) % C, diag, HEM_SHEAR]); // shear
        this.cons.push([(r + 1) * C + k, r * C + (k + 1) % C, diag, HEM_SHEAR]); // shear′
      }
    }

    // ── world-space state: rows 0..R × C. Row 0 mirrors the anchors.
    const N = (R + 1) * C;
    this.p = new Float32Array(N * 3);  // positions (world)
    this.q = new Float32Array(N * 3);  // previous positions (velocity carry)

    // ── the visible strip: plain Mesh, positions rewritten every frame
    const g = new THREE.BufferGeometry();
    this.gpos = new Float32Array(N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.gpos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let r = 0; r < R; r++) {
      for (let k = 0; k < C; k++) {
        const a = r * C + k, b = r * C + (k + 1) % C;
        const c = (r + 1) * C + k, d = (r + 1) * C + (k + 1) % C;
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, garment.material); // shares the garment's colour
    this.mesh.userData.rwfWardrobe = spec.tag;
    this.mesh.frustumCulled = false; // bounds are stale until the first write
    spec.scene.add(this.mesh);

    // scratch
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
    this._capA = new THREE.Vector3();
    this._capB = new THREE.Vector3();
  }

  /** CPU-skin the garment's pin ring → world-space anchors into p[row 0] */
  _updateAnchors() {
    const { garment } = this.spec;
    const mw = garment.matrixWorld;
    const C = this.C;
    for (let k = 0; k < C; k++) {
      const [vi0, vi1, f] = this.pinCols[k];
      this._a.fromBufferAttribute(garment.geometry.attributes.position, vi0);
      garment.applyBoneTransform(vi0, this._a);
      this._b.fromBufferAttribute(garment.geometry.attributes.position, vi1);
      garment.applyBoneTransform(vi1, this._b);
      this._a.lerp(this._b, f).applyMatrix4(mw);
      const o = k * 3;
      this.p[o] = this._a.x; this.p[o + 1] = this._a.y; this.p[o + 2] = this._a.z;
    }
  }

  /** push free particles out of the bone capsules + off the floor */
  _collide(scale) {
    const { p, C, R } = this;
    const caps = this.spec.capsules;
    for (const cap of caps) {
      cap.a.getWorldPosition(this._capA);
      cap.b.getWorldPosition(this._capB);
      const rad = cap.r * scale;
      const abx = this._capB.x - this._capA.x, aby = this._capB.y - this._capA.y, abz = this._capB.z - this._capA.z;
      const ab2 = abx * abx + aby * aby + abz * abz || 1e-9;
      for (let i = C; i < (R + 1) * C; i++) {
        const o = i * 3;
        const px = p[o] - this._capA.x, py = p[o + 1] - this._capA.y, pz = p[o + 2] - this._capA.z;
        let t = (px * abx + py * aby + pz * abz) / ab2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = this._capA.x + abx * t, qy = this._capA.y + aby * t, qz = this._capA.z + abz * t;
        let dx = p[o] - qx, dy = p[o + 1] - qy, dz = p[o + 2] - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rad * rad) {
          const d = Math.sqrt(d2) || 1e-6;
          const push = (rad - d) / d;
          p[o] += dx * push; p[o + 1] += dy * push; p[o + 2] += dz * push;
        }
      }
    }
    for (let i = C; i < (R + 1) * C; i++) { // floor (push-up prone drapes hems low)
      const o = i * 3 + 1;
      if (p[o] < 0.006) p[o] = 0.006;
    }
  }

  _substep(g, scale) {
    const { p, q, C, R } = this;
    const h2 = HEM_STEP * HEM_STEP;
    // integrate free rows (row 0 is anchors — never integrated)
    for (let i = C; i < (R + 1) * C; i++) {
      const o = i * 3;
      for (let d = 0; d < 3; d++) {
        const cur = p[o + d];
        p[o + d] = cur + (cur - q[o + d]) * HEM_DAMP;
        q[o + d] = cur;
      }
      p[o + 1] -= g * h2; // gravity (world)
    }
    // relax constraints (rest lengths scaled from scene to world units)
    const cons = this.cons;
    for (let it = 0; it < HEM_ITERS; it++) {
      for (let c = 0; c < cons.length; c++) {
        const [i, j, rest, stiff = 1] = cons[c];
        const oi = i * 3, oj = j * 3;
        const dx = p[oj] - p[oi], dy = p[oj + 1] - p[oi + 1], dz = p[oj + 2] - p[oi + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const diff = (dist - rest * scale) / dist * stiff;
        const iFree = i >= C, jFree = j >= C;
        if (iFree && jFree) {
          const half = diff * 0.5;
          p[oi] += dx * half; p[oi + 1] += dy * half; p[oi + 2] += dz * half;
          p[oj] -= dx * half; p[oj + 1] -= dy * half; p[oj + 2] -= dz * half;
        } else if (jFree) { // i is the pinned anchor — j takes the full correction
          p[oj] -= dx * diff; p[oj + 1] -= dy * diff; p[oj + 2] -= dz * diff;
        } else if (iFree) {
          p[oi] += dx * diff; p[oi + 1] += dy * diff; p[oi + 2] += dz * diff;
        }
      }
    }
    this._collide(scale);
  }

  /** hang the free rings straight down from the anchors (seed / frozen pose) */
  _drape(scale) {
    const { p, q, C, R, gap } = this;
    for (let r = 1; r <= R; r++) {
      for (let k = 0; k < C; k++) {
        const o = (r * C + k) * 3, a = k * 3;
        p[o] = p[a];
        p[o + 1] = p[a + 1] - gap * r * scale;
        p[o + 2] = p[a + 2];
        q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2]; // zero velocity
      }
    }
    this._collide(scale);
  }

  /** world positions → mesh-local, then normals */
  _write() {
    this.mesh.updateWorldMatrix(true, false);
    this._inv.copy(this.mesh.matrixWorld).invert();
    const { p, gpos, C, R } = this;
    const n = (R + 1) * C;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      this._v.set(p[o], p[o + 1], p[o + 2]).applyMatrix4(this._inv);
      gpos[o] = this._v.x; gpos[o + 1] = this._v.y; gpos[o + 2] = this._v.z;
    }
    const attr = this.mesh.geometry.attributes.position;
    attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  /** call once per frame after the skeleton has been posed */
  step(dt) {
    this._updateAnchors();
    const scale = this.mesh.getWorldScale(this._v).x || 1;
    // gravity at the figure's world scale: a 1.5-unit card is a 1.75 m human
    const g = 9.81 * (this.spec.height * scale) / 1.75;
    if (!this.seeded) { this._drape(scale); this.seeded = true; this._write(); return; }
    if (this.frozen) { this._drape(scale); this._write(); return; }
    this.acc = Math.min(this.acc + dt, HEM_STEP * 4);
    let steps = 0;
    while (this.acc >= HEM_STEP && steps < 4) { this.acc -= HEM_STEP; this._substep(g, scale); steps++; }
    this._write();
  }
}

// ── CLOTHES ──────────────────────────────────────────────────────────────────

function buildShorts(av, colors) {
  const skin = genoSkin(av);
  const H = av.H;
  const B = av.bones;
  const cloud = bodyCloud(skin);
  const hips = B.hips, spine = B.spine;
  const hipsP = bindPos(hips, skin.toBind), spineP = bindPos(spine, skin.toBind);

  // pelvis line: hips→spine, extended down past the hips for the seat
  const line = (y) => {
    const t = (y - hipsP.y) / Math.max(1e-6, spineP.y - hipsP.y);
    return new THREE.Vector3().lerpVectors(hipsP, spineP, clamp01(t));
  };

  // ── pelvis shell: waistband → seat. The waistband rides UP past the belt
  //    line to tuck under the tank's bottom ring (belt over shorts over
  //    skin — no gap band at the waist). Extents AND weights come from ALL
  //    body verts in each ring's slab: at hip height the cross-section is
  //    pelvis + both thigh saddles (thigh-dominant — a torso-only query
  //    under-measures ~2× and buries the shell), and the averaged body
  //    weights make the shell ride the pelvis exactly like the skin does.
  const yTop = spineP.y + 0.030 * H;         // tucks under the tank's hem
  const ySeat = hipsP.y - 0.085 * H;         // full crotch depth — the shell
  //  bridges the thighs so a wide stride can't open a gap between the legs
  const margin = 0.018 * H;
  const shell = [];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const y = yTop + (ySeat - yTop) * (k / (N - 1));
    const c = line(y);
    const verts = slabVerts(cloud, null, c, UP, 0.035 * H);
    const rx = Math.max(...verts.map((v) => Math.abs(v.x - c.x)), 0.05);
    const rz = Math.max(...verts.map((v) => Math.abs(v.z - c.z)), 0.05);
    // seat rings (the last two) take the CROTCH SKIN's own weights — the
    // Hips+both-UpLegs blend cancels a unilateral stride and stays centred
    // through a bilateral spread (jumping jacks), so the crotch bridge
    // follows the body instead of tearing open between the abducted thighs
    const w = k >= N - 2
      ? avgWeights(verts.filter((v) => Math.abs(v.x - c.x) < 0.055))
      : avgWeights(verts);
    shell.push({
      c, e1: XAX, e2: ZAX, n: UP,
      rx: rx + margin, rz: rz + margin,
      w,
    });
  }

  // ── leg tubes: top rings INSIDE the shell and wide enough that the pair
  //    overlaps at the centre (the crotch closes between them). Weights are
  //    the averaged weights of THIS thigh's verts in each ring's slab — the
  //    tube follows its own leg exactly, and near the hip the natural
  //    Hips↔UpLeg blend in Geno's own weights provides the stretch zone.
  //    The tube stops at 0.44 of the thigh: the last 0.12 is FABRIC — the
  //    verlet hem strip hangs from the final ring (see rwfHemSpecs below).
  const legStrips = [];
  const hemSpecs = [];
  const radial = 18, hemCols = 12, hemRows = 2;
  for (const [upLegName, kneeName] of [['upLegL', 'legL'], ['upLegR', 'legR']]) {
    const upLeg = B[upLegName], knee = B[kneeName];
    if (!upLeg || !knee) continue;
    const hip = bindPos(upLeg, skin.toBind), kn = bindPos(knee, skin.toBind);
    const axis = new THREE.Vector3().subVectors(kn, hip);
    const L = axis.length(); axis.normalize();
    const n = axis.clone();
    let e1 = new THREE.Vector3().crossVectors(UP, n);
    if (e1.lengthSq() < 1e-6) e1 = XAX.clone();
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    const legSet = new Set([skin.skeleton.bones.indexOf(upLeg)]);
    const rings = [];
    const ts = [0.10, 0.20, 0.32, 0.44];   // along the thigh (hem covers 0.44→0.56)
    for (let k = 0; k < ts.length; k++) {
      const c = new THREE.Vector3().copy(hip).addScaledVector(axis, ts[k] * L);
      const verts = slabVerts(cloud, legSet, c, n, 0.045 * H);
      const rx = Math.max(...verts.map((v) => Math.abs((v.x - c.x) * e1.x + (v.y - c.y) * e1.y + (v.z - c.z) * e1.z)), 0.04);
      const rz = Math.max(...verts.map((v) => Math.abs((v.x - c.x) * e2.x + (v.y - c.y) * e2.y + (v.z - c.z) * e2.z)), 0.04);
      const m = 0.015 * H;
      // top rings get a floor radius so the pair overlaps at the crotch
      const floor = k <= 1 ? 0.085 * H : 0.05 * H;
      rings.push({
        c, e1, e2, n,
        rx: Math.max(rx + m, floor),
        rz: Math.max(rz + m, floor * 0.95),
        bodyRx: rx, // measured BODY semi-axis (before garment margin) — capsule radius source
        w: avgWeights(verts),
      });
    }
    legStrips.push(rings);
    // Collision capsules = the BODY limbs + a few mm: at rest the hem (a ring
    // at body + 1.5 cm garment margin) hangs CLEAR of them and swings free;
    // contact happens only when a limb sweeps into the fabric — the thigh
    // rotating up in a squat shoves it outward (flare), the shin brushes it
    // mid-stride (sway). A capsule near the GARMENT radius glues the hem to
    // the limb (measured: rides the capsule at every walk phase, reads rigid).
    const lastBody = rings[rings.length - 1].bodyRx;
    const capR = Math.max(lastBody + 0.004 * H, 0.030 * H);
    hemSpecs.push({
      capsules: [
        { a: upLeg, b: knee, r: capR },                             // thigh
        { a: knee, b: B[upLegName === 'upLegL' ? 'footL' : 'footR'], r: capR * 0.85 }, // shin sweeps the hem in squats
      ],
      gap: 0.075 * L,           // hem depth 0.15·thigh ≈ 5.5 cm at human scale —
                                // deep enough that its swing READS at card scale
      side: upLegName,
    });
  }

  const mesh = skinnedTube(skin, lam(colors.shorts, { side: THREE.DoubleSide }), [shell, ...legStrips], radial, 'shorts');
  // hem pin specs: garment + the bottom ring of each leg strip (layout gives
  // the flat vertex starts). HemCloth instances are built by attachWardrobe.
  const layout = mesh.userData.rwfLayout;
  mesh.userData.rwfHemSpecs = hemSpecs.map((h, si) => ({
    garment: mesh,
    ringStart: layout.layout[si + 1].start + (legStrips[si].length - 1) * radial,
    radial, columns: hemCols, rows: hemRows, gap: h.gap,
    capsules: h.capsules,
    tag: 'shorts', scene: skin.scene, height: H,
  }));
  return [mesh];
}

function buildTank(av, colors) {
  const skin = genoSkin(av);
  const H = av.H;
  const B = av.bones;
  const cloud = bodyCloud(skin);
  const spine3 = findBone(av, 'Spine3') ?? B.spine2; // Geno has it; map doesn't
  const chainBones = [B.hips, B.spine, B.spine1, B.spine2, spine3].filter(Boolean);
  const torsoSet = new Set(chainBones.map((b) => skin.skeleton.bones.indexOf(b)));
  const chain = chainBones.map((b) => {
    const p = bindPos(b, skin.toBind);
    return { bone: b, p, y: p.y };
  });
  const spineP = chain[1].p, spine3P = chain[chain.length - 1].p;
  const neckP = bindPos(B.neck, skin.toBind);
  const armL = B.armL, armR = B.armR;
  const shoulderY = (armL && armR)
    ? (bindPos(armL, skin.toBind).y + bindPos(armR, skin.toBind).y) / 2
    : spine3P.y + 0.11 * H;

  // torso line: piecewise through the chain joints (x/z drift with the spine)
  const line = (y) => {
    if (y <= chain[0].y) return chain[0].p.clone();
    for (let k = 0; k < chain.length - 1; k++) {
      if (y >= chain[k].y && y <= chain[k + 1].y) {
        const t = smooth((y - chain[k].y) / Math.max(1e-6, chain[k + 1].y - chain[k].y));
        return new THREE.Vector3().lerpVectors(chain[k].p, chain[k + 1].p, t);
      }
    }
    return chain[chain.length - 1].p.clone();
  };

  // ── torso tube: belt top → shoulder yoke. Radii measured from TORSO
  //    verts (arms excluded — the tank must not follow them); weights are
  //    the AVERAGED body weights of those same verts, so the tank bends
  //    with the spine exactly as the skin does — no lag, no poke-through.
  const y0 = spineP.y + 0.022 * H;                    // just above the belt
  const y1 = Math.min(neckP.y - 0.030 * H, shoulderY + 0.012 * H); // yoke
  const N = 18;
  const slab = ((y1 - y0) / (N - 1)) * 1.4;
  const torso = [];
  const raw = [];
  const wts = [];
  for (let k = 0; k < N; k++) {
    const y = y0 + (y1 - y0) * (k / (N - 1));
    const c = line(y);
    const verts = slabVerts(cloud, torsoSet, c, UP, slab);
    raw.push({
      rx: Math.max(...verts.map((v) => Math.abs(v.x - c.x)), 0.03),
      rz: Math.max(...verts.map((v) => Math.abs(v.z - c.z)), 0.03),
    });
    wts.push(avgWeights(verts));
  }
  // 1-2-1 smooth the measured profile (sparse sampling noise → smooth fabric)
  const sm = raw.map((_, k) => {
    const a = raw[Math.max(0, k - 1)], b = raw[k], c = raw[Math.min(N - 1, k + 1)];
    return { rx: (a.rx + 2 * b.rx + c.rx) / 4, rz: (a.rz + 2 * b.rz + c.rz) / 4 };
  });
  for (let k = 0; k < N; k++) {
    const y = y0 + (y1 - y0) * (k / (N - 1));
    const f = k / (N - 1);
    const margin = (0.013 + 0.008 * f) * H; // a touch more room at the chest
    const c = line(y);
    let rx = sm[k].rx + margin;
    let rz = sm[k].rz + margin;
    // shoulder yoke: the last ring flares to clear the shoulder joints so the
    // arm rotates INSIDE the tank wall (the sleeve covers the pierce point)
    if (k === N - 1 && armL && armR) {
      const sx = Math.max(Math.abs(bindPos(armL, skin.toBind).x - c.x), Math.abs(bindPos(armR, skin.toBind).x - c.x));
      rx = Math.max(rx, sx + 0.012 * H);
    }
    torso.push({ c, e1: XAX, e2: ZAX, n: UP, rx, rz, w: wts[k] });
  }

  // ── sleeve caps: rings along each upper arm. Weights = averaged weights
  //    of the arm verts in each ring's slab — Geno already blends the
  //    shoulder-area arm verts with Spine3, so the sleeve anchors itself at
  //    the shoulder and follows the arm exactly like the skin does.
  const sleeves = [];
  for (const armName of ['armL', 'armR']) {
    const arm = B[armName];
    const fore = B[armName === 'armL' ? 'foreL' : 'foreR'];
    if (!arm || !fore) continue;
    const sh = bindPos(arm, skin.toBind), el = bindPos(fore, skin.toBind);
    const axis = new THREE.Vector3().subVectors(el, sh);
    const L = axis.length(); axis.normalize();
    const n = axis.clone();
    let e1 = new THREE.Vector3().crossVectors(UP, n);
    if (e1.lengthSq() < 1e-6) e1 = XAX.clone();
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    const armSet = new Set([skin.skeleton.bones.indexOf(arm)]);
    const ts = [0.05, 0.16, 0.30, 0.46];      // along the upper arm
    const rings = [];
    for (let k = 0; k < ts.length; k++) {
      const c = new THREE.Vector3().copy(sh).addScaledVector(axis, ts[k] * L);
      const verts = slabVerts(cloud, armSet, c, n, 0.05 * H);
      const rx = Math.max(...verts.map((v) => Math.abs((v.x - c.x) * e1.x + (v.y - c.y) * e1.y + (v.z - c.z) * e1.z)), 0.03);
      const rz = Math.max(...verts.map((v) => Math.abs((v.x - c.x) * e2.x + (v.y - c.y) * e2.y + (v.z - c.z) * e2.z)), 0.03);
      const m = 0.014 * H;
      rings.push({
        c, e1, e2, n,
        rx: rx * (1 - 0.08 * k) + m,
        rz: rz * (1 - 0.08 * k) + m,
        w: avgWeights(verts),
      });
    }
    sleeves.push(rings);
  }

  const mesh = skinnedTube(skin, lam(colors.tank, { side: THREE.DoubleSide }), [torso, ...sleeves], 18, 'tank');

  // ── hem spec: a flounced band hanging from the torso's bottom ring, draping
  //    OVER the shorts' waistband like a real tank hem.
  //    The waist is measured from TORSO-dominant verts only — an all-bone
  //    query catches Geno's bind-pose arms crossing the waist slab and returns
  //    a ~0.42H "waist" (a 77 cm pelvis capsule that explodes the hem into a
  //    tutu — measured and rejected). The pelvis capsule sits just outside the
  //    shorts shell so the resting hem forms a slight skirt-cone over the
  //    waistband; the ring circumference rests at that same radius (restRadius)
  //    so constraints and collision agree instead of fighting.
  const waistC = line(chain[1].p.y);
  const { rx: waistRx } = ringExtent(cloud, torsoSet, waistC, XAX, ZAX, UP, 0.03 * H);
  const pelvisR = (waistRx || 0.07 * H) + 0.018 * H + 0.006 * H;
  const capsules = [{ a: B.hips, b: B.spine, r: pelvisR }];
  for (const [upLegName, kneeName] of [['upLegL', 'legL'], ['upLegR', 'legR']]) {
    const upLeg = B[upLegName], knee = B[kneeName];
    if (!upLeg || !knee) continue;
    const hip = bindPos(upLeg, skin.toBind), kn = bindPos(knee, skin.toBind);
    const c = new THREE.Vector3().lerpVectors(hip, kn, 0.3); // mid-thigh measure
    const { rx: thighRx } = ringExtent(cloud, new Set([skin.skeleton.bones.indexOf(upLeg)]), c, XAX, ZAX, UP, 0.03 * H);
    // body thigh + clearance: brushes the hem only at stride extremes
    capsules.push({ a: upLeg, b: knee, r: (thighRx || 0.05 * H) + 0.006 * H });
  }
  mesh.userData.rwfHemSpecs = [{
    garment: mesh,
    ringStart: mesh.userData.rwfLayout.layout[0].start, // torso ring 0 = the hem edge
    radial: 18, columns: 12, rows: 2, gap: 0.009 * H,    // ~3 cm flounce at human scale
    restRadius: pelvisR + 0.005 * H,                     // skirt hangs ~1 cm clear of the capsule
    capsules, tag: 'tank', scene: skin.scene, height: H,
  }];
  return [mesh];
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
  const skin = genoSkin(av);
  const cloud = bodyCloud(skin);
  const idx = (bone) => skin.skeleton.bones.indexOf(bone);
  const hips = av.bones.hips, spine = av.bones.spine;
  const hipsP = bindPos(hips, skin.toBind), spineP = bindPos(spine, skin.toBind);
  // measure the waist where the belt sits: just above the Spine joint, where
  // the shorts' waistband top ring is — the belt hugs the SAME measured body
  const yB = spineP.y - 0.004 * H;
  const c = new THREE.Vector3().lerpVectors(hipsP, spineP, (yB - hipsP.y) / Math.max(1e-6, spineP.y - hipsP.y));
  const { rx, rz } = ringExtent(cloud, null, c, XAX, ZAX, UP, 0.03 * H);
  const Rx = Math.max((rx || 0.07) + 0.014 * H, 0.08);
  const Rz = Math.max((rz || 0.06) + 0.014 * H, 0.07);

  const g = frameOnBone(hips, wdir(hips, spine, new THREE.Vector3()).normalize(), FWD);
  g.userData.rwfWardrobe = 'belt';
  const belt = new THREE.Mesh(new THREE.TorusGeometry(Rx, 0.016 * H, 8, 24), lam(colors.belt));
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = Rz / Rx; // elliptical to the measured waist
  // place along the hips→spine axis at the measured height
  const up = wdir(hips, spine, new THREE.Vector3()).normalize();
  const beltH = hipsP.distanceTo(spineP) > 1e-6
    ? (yB - hipsP.y) / Math.max(1e-6, spineP.y - hipsP.y) * hipsP.distanceTo(spineP)
    : 0.09 * H;
  belt.position.y = beltH;
  g.add(belt);
  // charity-pot charm: a tiny amber pot hanging at the right-front hip
  const charm = new THREE.Group();
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.011 * H, 0.004 * H, 6, 10), lam(WARDROBE_TOKENS.amber));
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.016 * H, 10, 8), lam(WARDROBE_TOKENS.amber));
  pot.scale.y = 0.8;
  pot.position.y = -0.03 * H;
  charm.add(loop, pot);
  charm.position.set(Rx * 0.62, beltH + 0.004 * H, Rz * 0.72);
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
 * opts.fabric: false → skip the verlet hem strips entirely (reduced motion).
 * Returns { slots, toggle(slot, on), isVisible, hems, updateFabric(dt, frozen) }
 * — toggle flips visibility per slot; updateFabric steps every hem's cloth sim
 * once per frame (call after posing/animating, before rendering).
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

  // ── fabric secondary motion: collect the hem specs the skinned builders
  //    recorded and build their verlet sims. Hems join their slot's toggle
  //    group so slot visibility covers garment + hem together.
  const hems = [];
  if (opts.fabric !== false) {
    for (const name of WARDROBE_SLOTS) {
      for (const root of slots[name] ?? []) {
        for (const spec of root.userData?.rwfHemSpecs ?? []) {
          const hem = new HemCloth(spec);
          hems.push(hem);
          slots[name].push(hem.mesh);
        }
      }
    }
  }
  const skinScene = avatar.prone.children[0];

  const isVisible = (slot) => slots[slot]?.every((g) => g.visible) ?? true;
  return {
    slots,
    isVisible,
    hems,
    toggle(slot, on) {
      for (const g of slots[slot] ?? []) g.visible = !!on;
    },
    /** step every hem's cloth sim; frozen=true → drape statically (gallery
     *  paused / prefers-reduced-motion) — anchors still track the body.
     *  A throwing hem is isolated + logged once: the gallery renders 20+ cards
     *  from one rAF loop, so one bad hem must not freeze the rest. */
    updateFabric(dt, frozen = false) {
      if (!hems.length) return;
      skinScene.updateMatrixWorld(true); // bones + garments current before pinning
      for (const hem of hems) {
        hem.frozen = frozen;
        try {
          hem.step(dt);
        } catch (e) {
          if (!hem.dead) { console.error('rwf fabric hem failed:', e); hem.dead = true; }
          hem.mesh.visible = false;
        }
      }
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
