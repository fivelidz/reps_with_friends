//
// geno-outfit.js — THE CANONICAL GARMENT SYSTEM for Geno (Reps With Friends).
//
// Built for the OUTFIT ATELier (apps/atelier, /atelier) after the founder's
// defect report on geno-wardrobe.js v2: "shirt and shorts have holes in them.
// shirt looks like a singlet and the shorts is missing a band that appears
// invisible on the model. animations should be fixed too."
//
// WHY THE OLD KIT FAILED (measured, not guessed):
//   • TANK → singlet: the "sleeves" were two 2-ring caps at t=0.30–0.42 along
//     the upper arm — a floating open tube around mid-bicep, detached from
//     the torso at BOTH ends. From the front you see bare deltoid above it
//     and bare arm below it: a singlet with a decorative ring. Each cap's
//     open edges are literal holes into the garment interior.
//   • HOLES: holes live at BUTT-JOINS — anywhere one garment edge approaches
//     another edge instead of passing UNDER a continuous surface. The old
//     kit was full of them (sleeve caps, shorts-top↔tank-hem junction where
//     the shell "tucked under" a hem at the same height the belt overlapped,
//     raw tube cuts at neck/hem/leg openings).
//   • INVISIBLE BAND: the "waistband" was just the shorts' top ring tucked
//     UNDER the tank's bottom ring (same radius class, same height band as
//     the belt above it) — three overlapping layers of coral/charcoal at the
//     waist, nothing that READS as a band.
//
// THE NEW CONSTRUCTION — structural anti-hole rules, enforced everywhere:
//   1. NO EDGE EVER FACES ANOTHER EDGE. Where two garment surfaces meet they
//      overlap volumetrically: one passes INSIDE the other by ≥1 cm of depth.
//      (tee hem floats 3 cm above the band with the shorts shell continuing
//      up beneath it; sleeves dive under the torso wall; band overlays shell.)
//   2. EVERY TUBE END IS FINISHED. Neck: shoulder-slope rings close onto a
//      2-ring pinched collar. Sleeves/legs/hem: a visible finish ring
//      (pinch or flare). Openings read as openings, not as rips.
//   3. SLEEVES ARE RAGLAN CAPS, not butt-joined tubes: each sleeve starts
//      with CONVERGING rings that ride OVER the deltoid (t<0 along the arm
//      axis = above the shoulder joint), each cap column CLAMPED inside the
//      torso silhouette at bind (limit = torso radius at that height), so
//      the cap's open top is buried under the shoulder-slope surface. The
//      sleeve then follows the arm — D-shaped where it enters the torso
//      wall (flat side inside the chest tube, round side on the arm), the
//      same shape a set-in sleeve makes at the armhole.
//   4. WEIGHTS INTERLEAVE AT EVERY SEAM: ring weights are the AVERAGED BODY
//      WEIGHTS of the exact flesh each ring column fronts (columnWeights),
//      so fabric and skin share deformation. Cap rings draw from an
//      all-bone slab (naturally Spine3+Arm blended — the spec's "spine+arm
//      mix"); rings down the arm draw from arm-dominant flesh (arm-led with
//      the body's own shoulder blend riding along).
//   5. MEASURED, NEVER GUESSED: every radius is hugged off Geno's own bind
//      mesh (hugRing/radialProfile), waist populations are PELVIS-SET
//      FILTERED (the A-pose hands cross the waist slab: an all-bone query
//      returns a 73 cm "waist" — the v1 beach-ball bug).
//
// KIT (contrast scheme, design tokens): lime tee · coral shorts · WHITE
// waistband stripe (proud, +5 mm over the shell) · charcoal sneakers ·
// coral headband · lime wristbands. The waistband is its own slot so the
// atelier's build-up mode can prove it reads.
//
// BIND MATHS: identical to geno-wardrobe v2 — geometry authored in the glTF
// scene's local (bind) space, bound with an EXPLICIT identity bindMatrix
// (never call bind() without one — it would recalc boneInverses from the
// live pose and corrupt the body's own skinning). bindMode 'attached' makes
// the bones' world matrices place the fabric exactly as they place the body
// through BVH mocap and every exercise pose.
//
// This module is SELF-CONTAINED and canonical: the /avatars gallery keeps
// geno-wardrobe.js untouched and switches AFTER founder approval.
//

import * as THREE from 'three';

// ── palette & slots ──────────────────────────────────────────────────────────
export const OUTFIT_TOKENS = {
  lime: '#c6f32e',     // tee / wristbands (--lime)
  coral: '#ff5c38',    // shorts / headband (--coral)
  white: '#e8ebef',    // WAISTBAND stripe — bright neutral, pixel-distinct
  charcoal: '#2a3038', // sneakers
  ink: '#141820',
};

export const OUTFIT_SLOTS = ['shorts', 'waistband', 'tshirt', 'sneakers', 'headband', 'wristbands'];

export const SLOT_LABELS = {
  shorts: 'shorts', waistband: 'band', tshirt: 't-shirt', sneakers: 'shoes',
  headband: 'headband', wristbands: 'wristbands',
};

/** Build-up mode: each step STAYS on screen until advanced (atelier UX). */
export const BUILDUP_STEPS = [
  { label: 'naked', slots: [] },
  { label: 'shorts', slots: ['shorts'] },
  { label: '+ t-shirt', slots: ['shorts', 'tshirt'] },
  { label: '+ waistband', slots: ['shorts', 'tshirt', 'waistband'] },
  { label: '+ shoes', slots: ['shorts', 'tshirt', 'waistband', 'sneakers'] },
  { label: '+ head & wrist bands', slots: ['shorts', 'tshirt', 'waistband', 'sneakers', 'headband', 'wristbands'] },
  { label: 'full kit', slots: OUTFIT_SLOTS },
];

const lam = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(color), ...extra });

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1); // model forward — toes +Z
const XAX = new THREE.Vector3(1, 0, 0);
const ZAX = new THREE.Vector3(0, 0, 1);

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ── rig measurement (copied from geno-wardrobe v2 — proven) ─────────────────

function genoSkin(av) {
  const scene = av.prone.children[0];
  let skeleton = null;
  scene.traverse((o) => { if (!skeleton && o.isSkinnedMesh && o.skeleton) skeleton = o.skeleton; });
  if (!skeleton) throw new Error('geno-outfit: model has no skinned body to bind clothes to');
  scene.updateMatrixWorld(true);
  const toBind = scene.matrixWorld.clone().invert();
  return { scene, skeleton, toBind };
}

function findBone(av, rawName) {
  const norm = (n) => n.replace(/^mixamorig:/, '').replace(/^mixamorig/, '').replace(/[\[\].:/]/g, '');
  let hit = null;
  av.prone.children[0].traverse((o) => { if (!hit && o.isBone && norm(o.name) === rawName) hit = o; });
  return hit;
}

function bindPos(bone, toBind, out = new THREE.Vector3()) {
  return bone.getWorldPosition(out).applyMatrix4(toBind);
}

function bodyCloud(skin) {
  const pts = [];
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

/** All-bone slab verts within a lateral (|x|) bound of the centre — the v4
 *  chest/shoulder population. Bone-set filters are what shrank the v3 shirt
 *  inside the deltoids: upper-arm flesh is dominated by the ARM bones, so a
 *  torso-bone-only slab never measured the shoulder flare. Here EVERYTHING
 *  near the torso counts (deltoids included — the shirt must cover the
 *  shoulder flare; the sleeves then overlap the deltoids outside it), while
 *  far-lateral flesh (the free-hanging arm, the bind A-pose hands out at
 *  |x|≈0.57H) stays excluded — the only pollution that is real, exactly as
 *  at the waist. */
function slabVertsNearTorso(cloud, xMax, c, n, slab) {
  const out = [];
  for (const v of cloud) {
    if (Math.abs(v.x - c.x) > xMax) continue;
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    if (Math.abs(dx * n.x + dy * n.y + dz * n.z) > slab) continue;
    out.push(v);
  }
  return out;
}

/** Ring sides from a raw vert list (same maths as ringSides). */
function sidesOf(verts, c, e1, e2) {
  let p1 = 0, m1 = 0, p2 = 0, m2 = 0;
  for (const v of verts) {
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    const a = dx * e1.x + dy * e1.y + dz * e1.z;
    const b = dx * e2.x + dy * e2.y + dz * e2.z;
    if (a > p1) p1 = a; else if (a < m1) m1 = a;
    if (b > p2) p2 = b; else if (b < m2) m2 = b;
  }
  return { p1, m1, p2, m2 };
}

/** Radial profile from a raw vert list (same maths as radialProfile). */
function profileOf(verts, c, e1, e2, rx, rz, radial, lo = 0.85, hi = 1.35) {
  const prof = new Array(radial).fill(1);
  const d = new THREE.Vector3();
  for (let k = 0; k < radial; k++) {
    const a = (k / radial) * Math.PI * 2;
    d.set(0, 0, 0).addScaledVector(e1, rx * Math.cos(a)).addScaledVector(e2, rz * Math.sin(a));
    const R = d.length();
    if (R < 1e-6) continue;
    d.divideScalar(R);
    let ext = 0;
    for (const v of verts) {
      const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
      const pv = dx * d.x + dy * d.y + dz * d.z;
      if (pv > ext) ext = pv;
    }
    prof[k] = Math.min(hi, Math.max(lo, ext / R));
  }
  return prof;
}

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

function ringSides(cloud, boneSet, c, e1, e2, n, slab) {
  let p1 = 0, m1 = 0, p2 = 0, m2 = 0;
  for (const v of slabVerts(cloud, boneSet, c, n, slab)) {
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    const a = dx * e1.x + dy * e1.y + dz * e1.z;
    const b = dx * e2.x + dy * e2.y + dz * e2.z;
    if (a > p1) p1 = a; else if (a < m1) m1 = a;
    if (b > p2) p2 = b; else if (b < m2) m2 = b;
  }
  return { p1, m1, p2, m2 };
}

function hugRing(cloud, boneSet, c, e1, e2, n, slab, margin, floor1 = 0, floor2 = 0) {
  const { p1, m1, p2, m2 } = ringSides(cloud, boneSet, c, e1, e2, n, slab);
  const cc = c.clone().addScaledVector(e1, (p1 + m1) / 2).addScaledVector(e2, (p2 + m2) / 2);
  return {
    c: cc,
    rx: Math.max((p1 - m1) / 2 + margin, floor1),
    rz: Math.max((p2 - m2) / 2 + margin, floor2),
  };
}

function radialProfile(cloud, boneSet, c, e1, e2, n, slab, rx, rz, radial, lo = 0.85, hi = 1.35) {
  const prof = new Array(radial).fill(1);
  const d = new THREE.Vector3();
  for (let k = 0; k < radial; k++) {
    const a = (k / radial) * Math.PI * 2;
    d.set(0, 0, 0).addScaledVector(e1, rx * Math.cos(a)).addScaledVector(e2, rz * Math.sin(a));
    const R = d.length();
    if (R < 1e-6) continue;
    d.divideScalar(R);
    let ext = 0;
    for (const v of slabVerts(cloud, boneSet, c, n, slab)) {
      const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
      const p = dx * d.x + dy * d.y + dz * d.z;
      if (p > ext) ext = p;
    }
    prof[k] = Math.min(hi, Math.max(lo, ext / R));
  }
  return prof;
}

function columnWeights(cloud, boneSet, c, e1, e2, n, slab, radial, fallback = null) {
  const bins = Array.from({ length: radial }, () => []);
  for (const v of slabVerts(cloud, boneSet, c, n, slab)) {
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z;
    const a = Math.atan2(dx * e2.x + dy * e2.y + dz * e2.z, dx * e1.x + dy * e1.y + dz * e1.z);
    const k = Math.round(((a / (Math.PI * 2)) + 1) % 1 * radial) % radial;
    bins[k].push(v);
  }
  const all = [].concat(...bins);
  const fallbackW = fallback ?? (all.length ? avgWeights(all) : [[0, 1]]);
  return bins.map((b) => (b.length >= 3 ? avgWeights(b) : fallbackW));
}

/** blend two normalised weight vectors (bone-index space) — the controlled
 *  seam-weight interleaver (e.g. sleeve cap = mostly-arm + a slice of spine) */
function mixWeights(a, b, tB) {
  const acc = new Map();
  for (const [bi, w] of a) acc.set(bi, (acc.get(bi) ?? 0) + w * (1 - tB));
  for (const [bi, w] of b) acc.set(bi, (acc.get(bi) ?? 0) + w * tB);
  const sorted = [...acc.entries()].filter(([, w]) => w > 0.02).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const sum = sorted.reduce((s, [, w]) => s + w, 0) || 1;
  return sorted.map(([bi, w]) => [bi, w / sum]);
}

/** Collapse a strip to ONE weight vector per column (the strip-average):
 *  identical weights ⇒ LBS is a rigid transform ⇒ ZERO ring-to-ring strain
 *  by construction. Use for pieces that shouldn't bend internally (a
 *  waistband, shoe parts, thigh tubes) — bending happens between strips. */
function rigidifyStrip(rings, radial = 18) {
  if (!rings.length) return;
  const cols = rings.map((r) => {
    const scalar = !Array.isArray(r.w) || !Array.isArray(r.w[0]?.[0]);
    const base = scalar ? r.w : null;
    return Array.from({ length: radial }, (_, k) =>
      (base ? base : r.w[k] ?? r.w[0]).map(([bi, w]) => [bi, w]));
  });
  const avg = Array.from({ length: radial }, (_, k) => {
    const acc = new Map();
    for (const c of cols) for (const [bi, w] of c[k]) acc.set(bi, (acc.get(bi) ?? 0) + w / cols.length);
    const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const sum = sorted.reduce((a, [, w]) => a + w, 0) || 1;
    return sorted.map(([bi, w]) => [bi, w / sum]);
  });
  for (const r of rings) r.w = avg.map((c) => c.map(([bi, w]) => [bi, w]));
}

/** ring-to-ring weight blur within a strip — adjacent rings share deformation
 *  (kills inter-ring stretch at joint boundaries; a fabric wrinkle proxy).
 *  Rings may carry scalar or per-column weights — normalise to per-column. */
function blurRingWeights(rings, radial = 18) {
  if (rings.length < 2) return;
  const cols = rings.map((r) => {
    const scalar = !Array.isArray(r.w) || !Array.isArray(r.w[0]?.[0]);
    const base = scalar ? r.w : null;
    return Array.from({ length: radial }, (_, k) =>
      (base ? base : r.w[k] ?? r.w[0]).map(([bi, w]) => [bi, w]));
  });
  const out = rings.map(() => null);
  for (let ri = 0; ri < rings.length; ri++) {
    const prev = cols[Math.max(0, ri - 1)], cur = cols[ri], next = cols[Math.min(rings.length - 1, ri + 1)];
    out[ri] = cur.map((c, k) => mixWeights(mixWeights(c, prev[k], 0.3), next[k], 0.3));
  }
  rings.forEach((r, ri) => { r.w = out[ri]; });
}

/**
 * Build one SkinnedMesh from ring strips, bound to Geno's own skeleton with an
 * EXPLICIT identity bindMatrix (see bind-maths note). Layout recorded on the
 * mesh for the ring-by-ring continuity probe + heatmap.
 */
function skinnedTube(skin, mat, strips, radial = 18, tag = '') {
  const pos = [], si = [], sw = [], idx = [];
  const layout = [];
  let base = 0;
  for (const rings of strips) {
    if (rings.length < 2) { layout.push(null); continue; }
    layout.push({ start: base, ringCount: rings.length });
    for (const r of rings) {
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const pr = r.prof ? r.prof[k] : 1;
        pos.push(
          r.c.x + pr * r.rx * ca * r.e1.x + pr * r.rz * sa * r.e2.x,
          r.c.y + pr * r.rx * ca * r.e1.y + pr * r.rz * sa * r.e2.y,
          r.c.z + pr * r.rx * ca * r.e1.z + pr * r.rz * sa * r.e2.z,
        );
        const colW = Array.isArray(r.w) && Array.isArray(r.w[0]?.[0]);
        const wv = colW ? (r.w[k] ?? r.w[0]) : r.w;
        si.push(wv[0]?.[0] ?? 0, wv[1]?.[0] ?? 0, wv[2]?.[0] ?? 0, 0);
        sw.push(wv[0]?.[1] ?? 0, wv[1]?.[1] ?? 0, wv[2]?.[1] ?? 0, 0);
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
  m.frustumCulled = false;
  skin.scene.add(m);
  m.bind(skin.skeleton, new THREE.Matrix4());
  return m;
}

// ── rigid-piece helpers (founder-approved pieces, ported verbatim) ───────────

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

function wdir(a, b, out = new THREE.Vector3()) {
  const _a = a.getWorldPosition(new THREE.Vector3());
  const _b = b.getWorldPosition(new THREE.Vector3());
  return out.copy(_b).sub(_a);
}

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

/** limb frame — capture `len` BEFORE normalise (the 93 cm wristband bug) */
function limbFrame(bone) {
  const c = childBone(bone);
  const up = c ? wdir(bone, c, new THREE.Vector3()) : UP.clone();
  if (up.lengthSq() < 1e-9) up.copy(UP);
  const len = up.length();
  return { g: frameOnBone(bone, up.normalize(), FWD), len };
}

function tube(rx, rz, rTopScale, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rx * rTopScale, rx, h, 12, 1), mat);
  m.scale.z = rz / rx;
  return m;
}

function headUp(av) {
  const d = wdir(av.bones.neck ?? av.bones.head, av.bones.head, new THREE.Vector3());
  if (d.lengthSq() < 1e-9) return UP.clone();
  return d.normalize();
}

// ── shared waist plan (shorts + band + tee all agree on these heights) ───────
// Measured geometry (Geno, H≈1.707 scene units ≈ 1.75 m → 0.01H ≈ 1.75 cm):
//   hips joint y=0.855 · spine (natural waist) y=0.943 · shoulders y=1.385.
// Heights are FRACTIONS OF H so they hold at any normalising scale.

function pelvisSet(av, skin) {
  const B = av.bones;
  return new Set(
    [B.hips, B.spine, B.upLegL, B.upLegR, B.legL, B.legR]
      .filter(Boolean).map((b) => skin.skeleton.bones.indexOf(b)),
  );
}

function waistPlan(av, skin) {
  const H = av.H;
  const hipsP = bindPos(av.bones.hips, skin.toBind);
  const spineP = bindPos(av.bones.spine, skin.toBind);
  const bandTop = spineP.y - 0.0047 * H;   // band's top edge, just under the waist joint
  const bandH = 0.017 * H;                 // ≈3 cm band
  return {
    H,
    hipsP, spineP,
    bandTop,
    bandMid: bandTop - bandH / 2,
    bandBot: bandTop - bandH,
    shellTop: bandTop + 0.048 * H,         // shell tucks UP under the tee hem (no skin gap)
    hemY: bandTop + 0.026 * H,             // tee hem ring — 3 cm of shell shows above the band
    hemFlareY: bandTop + 0.017 * H,        // rolled-hem finish ring (the hem's bottom edge)
    // spine line extended for waist rings (x/z drift with the spine)
    line(y) {
      const t = (y - hipsP.y) / Math.max(1e-6, spineP.y - hipsP.y);
      return new THREE.Vector3().lerpVectors(hipsP, spineP, clamp01(t));
    },
  };
}

// ── SHORTS: shell (tucked to the tee hem) + seat bridge + mid-thigh legs ─────

function buildShorts(av, colors, plan, env = {}) {
  const skin = env.skin ?? genoSkin(av);
  const cloud = env.cloud ?? bodyCloud(skin);
  const H = av.H;
  const pop = pelvisSet(av, skin);
  const { shellTop, bandTop, bandMid, bandBot, hipsP, line } = plan;
  const ySeat = hipsP.y - 0.085 * H; // full crotch depth — bridges a wide stride

  // shell rings: tucked top (UNDER the tee, above it nothing shows) → seat.
  // Radii hug the pelvis+thigh cross-section (A-pose hands excluded — the
  // all-bone query returns a 73 cm "waist"), weights are per-column so leg
  // columns follow legs and the seat follows the pelvis through strides.
  const shellYs = [shellTop, lerp(shellTop, bandTop, 0.5), bandTop, bandMid, bandBot,
    lerp(bandBot, ySeat, 0.35), lerp(bandBot, ySeat, 0.7), ySeat];
  const shell = shellYs.map((y) => {
    const c0 = line(y);
    const { c, rx, rz } = hugRing(cloud, pop, c0, XAX, ZAX, UP, 0.018 * H, 0.011 * H, 0.05, 0.05);
    return {
      c, e1: XAX, e2: ZAX, n: UP, rx, rz,
      prof: radialProfile(cloud, pop, c, XAX, ZAX, UP, 0.018 * H, rx, rz, 18),
      w: columnWeights(cloud, pop, c, XAX, ZAX, UP, 0.030 * H, 18,
        [[skin.skeleton.bones.indexOf(av.bones.hips), 1]]),
    };
  });
  for (let i = 0; i < 5; i++) blurRingWeights(shell); // rings share deformation (anti-stretch)

  // leg tubes (v4 SIZING): each ring is measured from the IPSILATERAL thigh
  // + buttock — the thigh's own verts PLUS pelvis/lower-back verts on that
  // leg's side. The v3 upLeg-only population missed the glute wrap at the
  // top rings (the slab flesh extends ~9 cm behind the hug), so the upper
  // tubes rode inside the buttock crease — the founder's "shorts invisible
  // around the upper thighs". The contralateral thigh stays excluded (a
  // different limb, real pollution), and the measured radius now reaches
  // past the body centreline at the top rings, closing the crotch naturally.
  const radial = 18;
  const legStrips = [];
  for (const [upLegName, kneeName] of [['upLegL', 'legL'], ['upLegR', 'legR']]) {
    const upLeg = av.bones[upLegName], knee = av.bones[kneeName];
    if (!upLeg || !knee) continue;
    const hip = bindPos(upLeg, skin.toBind), kn = bindPos(knee, skin.toBind);
    const axis = new THREE.Vector3().subVectors(kn, hip);
    const L = axis.length(); axis.normalize();
    const n = axis.clone();
    let e1 = new THREE.Vector3().crossVectors(UP, n);
    if (e1.lengthSq() < 1e-6) e1 = XAX.clone();
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    const upLegIdx = skin.skeleton.bones.indexOf(upLeg);
    const hipsIdx = skin.skeleton.bones.indexOf(av.bones.hips);
    const spineIdx = skin.skeleton.bones.indexOf(av.bones.spine);
    const side = Math.sign(hip.x) || 1; // which side this leg is on
    // ipsilateral population: this thigh's flesh + glute/lower-back flesh
    // on the same side of the body centreline
    const legPop = [];
    for (const v of cloud) {
      if (v.b === upLegIdx) { legPop.push(v); continue; }
      if ((v.b === hipsIdx || v.b === spineIdx) && (v.x * side) > -0.01 * H) legPop.push(v);
    }
    const ts = [0.10, 0.22, 0.34, 0.46, 0.56]; // 0.56·thigh ≈ mid-thigh hem
    const rings = [];
    for (let k = 0; k < ts.length; k++) {
      const c0 = new THREE.Vector3().copy(hip).addScaledVector(axis, ts[k] * L);
      const slab = 0.024 * H;
      const pop = legPop.filter((v) => {
        const d = new THREE.Vector3(v.x - c0.x, v.y - c0.y, v.z - c0.z);
        return Math.abs(d.dot(n)) <= slab;
      });
      const last = k === ts.length - 1;
      const m = 0.013 * H + (last ? 0.004 * H : 0); // finish ring flares a touch
      const floor = k <= 1 ? 0.055 * H : 0.04 * H;  // crotch overlap / hem sanity
      const { c, rx, rz } = hugRing(legPop, null, c0, e1, e2, n, slab, m, floor, floor * 0.95);
      rings.push({
        c, e1, e2, n, rx, rz,
        prof: radialProfile(legPop, null, c, e1, e2, n, slab, rx, rz, 18),
        w: avgWeights(pop.length ? pop : slabVerts(cloud, new Set([upLegIdx]), c0, n, slab)),
      });
    }
    for (let i = 0; i < 5; i++) blurRingWeights(rings);
    rigidifyStrip(rings); // a thigh tube doesn't bend internally — zero strain
    legStrips.push(rings);
  }

  const mesh = skinnedTube(skin, lam(colors.shorts, { side: THREE.DoubleSide }),
    [shell, ...legStrips], radial, 'shorts');
  return [mesh];
}

// ── WAISTBAND: the visible band (its own slot, own material, PROUD) ──────────
// Sits on the shorts shell with radius +0.005H (≈9 mm) over it — proud of both
// the shell and the tee hem above — as a WHITE stripe with a rolled top lip.
// The tee hem ends ≈3 cm ABOVE the band top, so the band can never be covered.

function buildWaistband(av, colors, plan, env = {}) {
  const skin = env.skin ?? genoSkin(av);
  const cloud = env.cloud ?? bodyCloud(skin);
  const H = av.H;
  const pop = pelvisSet(av, skin);
  const { bandTop, bandMid, bandBot, line } = plan;
  const shellAt = (y) => hugRing(cloud, pop, line(y), XAX, ZAX, UP, 0.018 * H, 0.011 * H, 0.05, 0.05);
  const ys = [bandTop, bandMid, bandBot];
  const lips = [1.035, 1.0, 1.0]; // rolled top lip
  const rings = ys.map((y, k) => {
    const s = shellAt(y);
    return {
      c: s.c, e1: XAX, e2: ZAX, n: UP,
      rx: (s.rx + 0.005 * H) * lips[k], // PROUD: +9 mm over the shell
      rz: (s.rz + 0.005 * H) * lips[k],
      prof: radialProfile(cloud, pop, s.c, XAX, ZAX, UP, 0.018 * H, s.rx, s.rz, 18),
      w: columnWeights(cloud, pop, s.c, XAX, ZAX, UP, 0.030 * H, 18),
    };
  });
  for (let i = 0; i < 5; i++) blurRingWeights(rings);
  rigidifyStrip(rings); // an elastic band is rigid around the waist — zero strain
  return [skinnedTube(skin, lam(colors.waistband, { side: THREE.DoubleSide }), [rings], 18, 'waistband')];
}

// ── T-SHIRT: torso tube → shoulder slope → collar, + raglan-capped sleeves ──

function buildTee(av, colors, plan, env = {}) {
  const skin = env.skin ?? genoSkin(av);
  const cloud = env.cloud ?? bodyCloud(skin);
  const H = av.H;
  const B = av.bones;
  const spine3 = findBone(av, 'Spine3') ?? B.spine2;
  const chainBones = [B.hips, B.spine, B.spine1, B.spine2, spine3].filter(Boolean);
  const torsoSet = new Set(chainBones.map((b) => skin.skeleton.bones.indexOf(b)));
  const chain = chainBones.map((b) => bindPos(b, skin.toBind));
  const neckP = bindPos(B.neck, skin.toBind);
  if (neckP.y > chain[chain.length - 1].y) chain.push(neckP.clone()); // v4: the
  // spine line must reach the NECK — v3 clamped at Spine3, stacking the whole
  // shoulder slope + collar 12 cm below the neckline (every ring above
  // Spine3.y returned Spine3's position; measured in the atelier dump)
  const armL = B.armL, armR = B.armR;
  const shoulderY = (armL && armR)
    ? (bindPos(armL, skin.toBind).y + bindPos(armR, skin.toBind).y) / 2
    : chain[chain.length - 1].y + 0.11 * H;
  const { hemY, hemFlareY } = plan;

  // spine line (piecewise through the chain joints)
  const line = (y) => {
    if (y <= chain[0].y) return chain[0].clone();
    for (let k = 0; k < chain.length - 1; k++) {
      if (y >= chain[k].y && y <= chain[k + 1].y) {
        const t = smooth((y - chain[k].y) / Math.max(1e-6, chain[k + 1].y - chain[k].y));
        return new THREE.Vector3().lerpVectors(chain[k], chain[k + 1], t);
      }
    }
    return chain[chain.length - 1].clone();
  };

  // ── torso rings: hem → chest → yoke. v4 SIZING: population is ALL-BONE
  //    NEAR THE TORSO (slabVertsNearTorso, |x| ≤ ARMHOLE) — deltoids and the
  //    medial upper arm INCLUDED, bind A-pose hands (|x|≈0.57H) excluded.
  //    The v3 torso-bone-only slab measured the chest at 0.14H half-width
  //    while the deltoids flare to 0.24H — every upper ring sat up to 5 cm
  //    INSIDE the flesh ("shirt absent around the shoulders and upper
  //    chest"). Weights keep the v3 wide-slab torso-set blend (proven
  //    anti-shear at Spine2/3).
  // lateral population cap, ramped by height: below the armpit the free
  // arm (bind A-pose, |x| up to 0.35H) is pollution → torso-only width;
  // above it the deltoid flare is REAL shirt coverage → everything near the
  // torso counts. A flat cap let the free arm widen ring 8 by 12 cm in one
  // step (measured) — the ramp keeps the chest a chest and the shoulders
  // shoulders.
  const armpitY = shoulderY - 0.135 * H;
  const capAt = (y) => 0.105 * H + 0.043 * H * smooth(clamp01((y - armpitY) / (0.07 * H)));
  const yokeY = Math.min(neckP.y - 0.030 * H, shoulderY + 0.012 * H);
  const N = 15;
  const slabT = ((yokeY - hemY) / (N - 1)) * 1.4;
  const torso = [];
  for (let k = 0; k < N; k++) {
    const f = k / (N - 1);
    const y = hemY + (yokeY - hemY) * f;
    const c0 = line(y);
    const pop = slabVertsNearTorso(cloud, capAt(y), c0, UP, slabT);
    const { p1, m1, p2, m2 } = sidesOf(pop, c0, XAX, ZAX);
    const ox = (p1 + m1) / 2, oz = (p2 + m2) / 2;
    const hx = (p1 - m1) / 2, hz = (p2 - m2) / 2;
    // 0.014H of the margin is POSE allowance: the spine-weighted rings lag
    // the flesh's own rotation through walk/drag torso sway (measured 3.8–5
    // cm sink at the mid-chest columns by the signed probe); a relaxed-fit
    // tee absorbs it without reading baggy at bind.
    const margin = (0.013 + 0.008 * f + 0.014) * H;
    const c = c0.clone().addScaledVector(XAX, ox).addScaledVector(ZAX, oz);
    let rx = hx + margin, rz = hz + margin;
    // yoke flare: the last ring clears the shoulder joints so the arm
    // rotates INSIDE the tee wall and the sleeve caps dive under it
    if (k === N - 1 && armL && armR) {
      const sx = Math.max(
        Math.abs(bindPos(armL, skin.toBind).x - c.x),
        Math.abs(bindPos(armR, skin.toBind).x - c.x));
      rx = Math.max(rx, sx + 0.016 * H);
    }
    torso.push({
      c, e1: XAX, e2: ZAX, n: UP, rx, rz, y,
      prof: profileOf(pop, c, XAX, ZAX, rx, rz, 18),
      // WEIGHTS from a 2.2× WIDER slab: independent per-ring slabs flip the
      // dominant bone abruptly across the Spine2/Spine3 joint — adjacent
      // rings then displace apart when the spine bends there (3.3 cm shear
      // measured at one_arm). Overlapping populations force a graded blend.
      // The top 3 rings (the SHOULDER BAND, k≥N−3) take the flesh's own
      // ALL-BONE blend instead: their lateral columns sit over the deltoids,
      // and spine-only weights left them hanging 12 cm in the air when the
      // arm raised (measured at one_arm by the attachment probe) — with the
      // flesh blend the shoulder fabric slings with the deltoid like real
      // cloth. The ring-weight blur grades the k=N−4 transition.
      // NOTE: the shoulder band keeps the pure torso-set weights. All-bone
      // blends (deltoid-following, tried for the sling distance) shear up to
      // 16.9 cm against the chest columns at one_arm's spine+arm twist — the
      // attachment bar carries the sling slack instead (see atelier bars).
      w: columnWeights(cloud, torsoSet, c, XAX, ZAX, UP, slabT * 2.2, 18),
    });
  }

  // (sleeve-cap clamping needs the radius-vs-height curve INCLUDING the
  //  shoulder slope — defined after the slope rings below)

  // ── shoulder slope + collar (v4 SIZING). v3 lerped these rings from the
  //    yoke straight onto the NECK ellipse, but the flesh at these heights
  //    (traps + deltoid tops, y≈1.41–1.46 m) spans |x|≈0.23H — the closing
  //    cone ran INSIDE the shoulders and the neckline simply vanished. v4:
  //    the slope now closes onto the CROSS-SECTION at collar height (same
  //    near-torso population as the torso rings), and the 2-ring collar is
  //    a short cone from that cross-section onto the neck — it covers the
  //    traps; the lateral deltoid tops tuck under the raglan caps (the
  //    signed probe excuses them via the cap surface). WEIGHTS keep the
  //    torso+neck bone set (the arm-swing collar-drag guard).
  const neck1 = findBone(av, 'Neck1');
  const torsoNeckSet = new Set([...chainBones, B.neck, neck1].filter(Boolean)
    .map((b) => skin.skeleton.bones.indexOf(b)));
  const slopeY0 = torso[torso.length - 1].y;              // yoke
  const collarTopY = neckP.y - 0.010 * H;                // collar band top
  const collarBotY = neckP.y - 0.022 * H;                 // collar band bottom
  // neck hug: the closing target (narrow population — the neck itself)
  const neckHug = hugRing(cloud, torsoNeckSet, line(collarBotY), XAX, ZAX, UP, 0.012 * H,
    0.013 * H, 0.05 * H, 0.045 * H); // floors: a sane collar even on a thin neck population
  // cross-section at collar height (near-torso population: traps included)
  const collarPop = slabVertsNearTorso(cloud, capAt(collarBotY + 0.02 * H), line(collarBotY), UP, 0.012 * H);
  const cs = sidesOf(collarPop, line(collarBotY), XAX, ZAX);
  const collarC = line(collarBotY).clone()
    .addScaledVector(XAX, (cs.p1 + cs.m1) / 2).addScaledVector(ZAX, (cs.p2 + cs.m2) / 2);
  const collarSection = {
    rx: (cs.p1 - cs.m1) / 2 + 0.016 * H,
    rz: (cs.p2 - cs.m2) / 2 + 0.016 * H,
  };
  const spine3Idx = skin.skeleton.bones.indexOf(spine3);
  const slopeYs = [];
  for (let k = 1; k <= 3; k++) slopeYs.push(lerp(slopeY0, collarBotY, k / 4));
  const slope = slopeYs.map((y) => {
    const t = (y - slopeY0) / Math.max(1e-6, collarBotY - slopeY0);
    const yoke = torso[torso.length - 1];
    const c0 = line(y);
    const pop = slabVertsNearTorso(cloud, capAt(y + 0.014 * H), c0, UP, 0.014 * H);
    const ss = sidesOf(pop, c0, XAX, ZAX);
    const c = c0.clone().addScaledVector(XAX, (ss.p1 + ss.m1) / 2).addScaledVector(ZAX, (ss.p2 + ss.m2) / 2);
    // ease from the yoke ellipse onto the collar-height cross-section
    const sx = lerp(yoke.rx, collarSection.rx, smooth(t));
    const sz = lerp(yoke.rz, collarSection.rz, smooth(t));
    return {
      c, e1: XAX, e2: ZAX, n: UP, rx: sx, rz: sz, y,
      prof: profileOf(pop, c, XAX, ZAX, sx, sz, 18),
      w: columnWeights(cloud, torsoNeckSet, c, XAX, ZAX, UP, 0.026 * H, 18, [[spine3Idx, 1]]),
    };
  });
  // collar: 3 rings closing from the collar-height section onto the neck —
  // a short cone over the traps (never inside them)
  const neckIdx = skin.skeleton.bones.indexOf(B.neck);
  const collar = [collarBotY, lerp(collarBotY, collarTopY, 0.5), collarTopY].map((y, k, arr) => {
    const last = slope[slope.length - 1];
    const t = arr.length > 1 ? k / (arr.length - 1) : 0;
    const pinch = smooth(t) * 0.85;
    // pinch floor = half the section: the traps slope laterally past the
    // neck, and pinching onto the bare neck ellipse dives inside them
    const floorX = Math.max(neckHug.rx + 0.016 * H, last.rx * 0.50);
    const floorZ = Math.max(neckHug.rz + 0.018 * H, last.rz * 0.50);
    // re-centre on the neck/nape flesh at this height (the spine line alone
    // sits ahead of the nape — the back collar columns grazed inside it)
    const cc0 = line(y);
    const cpop = slabVerts(cloud, torsoNeckSet, cc0, UP, 0.012 * H);
    const csw = cpop.length ? sidesOf(cpop, cc0, XAX, ZAX) : { p1: 0, m1: 0, p2: 0, m2: 0 };
    const cc = cc0.clone().addScaledVector(XAX, (csw.p1 + csw.m1) / 2).addScaledVector(ZAX, (csw.p2 + csw.m2) / 2);
    return {
      c: cc, e1: XAX, e2: ZAX, n: UP,
      rx: lerp(last.rx, floorX, pinch),
      rz: lerp(last.rz, floorZ, pinch),
      prof: radialProfile(cloud, torsoNeckSet, cc, XAX, ZAX, UP, 0.010 * H,
        Math.max(last.rx, lerp(last.rx, floorX, pinch)), Math.max(last.rz, lerp(last.rz, floorZ, pinch)), 18, 0.9),
      // neck-led: a collar is the NECK's garment — with spine-only weights it
      // lags neck bends and grazes the nape/neck sides (measured 1–2.2 cm at
      // one_arm/walk by the signed probe)
      w: last.w.map((col) => neckIdx >= 0 ? mixWeights(col, [[neckIdx, 1]], 0.35 + 0.15 * (arr.length > 1 ? k / (arr.length - 1) : 0)) : col),
    };
  });

  // silhouette-radius interpolation vs torso AND slope rings (the sleeve-cap
  // clamp must respect the slope shrinking above the yoke, not just the yoke)
  const profileRings = [...torso, ...slope];
  const torsoRxAt = (y) => {
    if (y <= profileRings[0].y) return profileRings[0].rx;
    for (let k = 0; k < profileRings.length - 1; k++) {
      if (y >= profileRings[k].y && y <= profileRings[k + 1].y) {
        const t = (y - profileRings[k].y) / Math.max(1e-6, profileRings[k + 1].y - profileRings[k].y);
        return lerp(profileRings[k].rx, profileRings[k + 1].rx, t);
      }
    }
    return profileRings[profileRings.length - 1].rx;
  };

  // ── rolled hem: ONE wider finish ring below the hem edge (reads as a
  //    folded hem; its bottom edge is the hem edge, ≈3 cm above the
  //    waistband top so the white band always shows below it).
  const hemHug = torso[0];
  const off = new THREE.Vector3().subVectors(hemHug.c, line(hemY));
  const flare = {
    c: line(hemFlareY).add(off),
    e1: XAX, e2: ZAX, n: UP,
    rx: hemHug.rx + 0.010 * H, rz: hemHug.rz + 0.010 * H, y: hemFlareY,
    prof: hemHug.prof, w: hemHug.w,
  };

  // ── SLEEVES (the fix for the singlet read): raglan caps. Rings run from
  //    t<0 (ABOVE the shoulder joint — over the deltoid) down to mid-upper-
  //    arm. The entry ring (t=0.02) hugs the ARM's own flesh and is
  //    D-clamped where it enters the torso wall. The cap rings above it are
  //    a CONE derived from the entry ring's radius (never an all-bone hug —
  //    the shoulder cross-section spans the whole chest, and chest-side cap
  //    columns flying with the arm were the 8–14 cm defects), slid toward
  //    the neck, per-column clamped INSIDE the torso silhouette so the
  //    cap's open top is buried under the shoulder-slope surface. WEIGHTS:
  //    arm-led everywhere with a decaying Spine3 slice at the cap (max
  //    30%) — the interleaved seam flexes instead of tearing.
  const armFallback = (arm) => [[skin.skeleton.bones.indexOf(arm), 1]];
  const ts = [0.02, 0.16, 0.30, 0.42, 0.50];
  const tsScale = [1.16, 1.08, 0.99, 0.95, 0.90];
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
    const armIdx = skin.skeleton.bones.indexOf(arm);

    const clampInsideTorso = (ring) => {
      const inside = Math.abs(ring.c.x) < torsoRxAt(ring.c.y);
      if (!inside) return ring;
      for (let col = 0; col < 18; col++) {
        const a = (col / 18) * Math.PI * 2;
        const px = ring.c.x + (ring.prof ? ring.prof[col] : 1) * ring.rx * Math.cos(a) * e1.x
          + (ring.prof ? ring.prof[col] : 1) * ring.rz * Math.sin(a) * e2.x;
        const limit = torsoRxAt(ring.c.y) - 0.004 * H;
        if (Math.abs(px) > limit && Math.abs(px) > 1e-6) {
          ring.prof[col] *= Math.max(0.25, limit / Math.abs(px));
        }
      }
      return ring;
    };

    // entry + arm rings: hug the arm's own flesh, D-clamped at the torso
    // wall. Weights are arm-LED: the body's own arm weights blend Spine3 /
    // Shoulder / ForeArm near the joints, and any of those in an edge
    // shears it when that bone diverges from the arm (measured 5 cm at the
    // hem in one_arm) — so rings DOWN the arm stay pure-arm. The ENTRY ring
    // (t=0.02, the armhole) carries a small Spine3 slice like the caps: with
    // the arm raised overhead (one_arm, jumping jacks) a pure-arm armhole
    // flies up the humerus into the neck (measured 6–7 cm inside the chin
    // flesh by the signed probe); the slice anchors it to the shoulder.
    const rings = [];
    for (let k = 0; k < ts.length; k++) {
      const c0 = new THREE.Vector3().copy(sh).addScaledVector(axis, ts[k] * L);
      const slab = 0.022 * H;
      const m = 0.012 * H;
      const { p1, m1, p2, m2 } = ringSides(cloud, armSet, c0, e1, e2, n, slab);
      const c = c0.clone().addScaledVector(e1, (p1 + m1) / 2).addScaledVector(e2, (p2 + m2) / 2);
      // the entry armhole carries extra room: a raised arm bunches the
      // deltoid short and wide (cross-section +1–3 cm, measured by the probe
      // at one_arm) — a bind-tight armhole sinks into the bunch. The floor
      // makes the armhole a relaxed-tee opening that clears the whole
      // shoulder ball through any arm angle.
      const armhole = k === 0 ? 0.062 * H : 0;
      const rx = Math.max(Math.max((p1 - m1) / 2, 0.02) * tsScale[k] + m + (k === 0 ? 0.014 * H : 0), armhole);
      const rz = Math.max(Math.max((p2 - m2) / 2, 0.02) * tsScale[k] + m + (k === 0 ? 0.012 * H : 0), armhole * 0.92);
      // ENTRY ring (t=0.02, the armhole): the flesh's own all-bone blend at
      // its slab — clavicle+arm+spine, the bones that carry the deltoid.
      // (Pure-arm dragged it up a raised arm into the neck; fixed spine
      // slices sheared it at arms-out; clavicle-only lagged the swing —
      // all measured by the signed probe. The flesh blend is the compromise
      // that tracks the armhole itself.)
      const ring = {
        c, e1, e2, n, rx, rz,
        prof: radialProfile(cloud, armSet, c, e1, e2, n, slab, rx, rz, 18, 0.78),
        w: k === 0
          ? columnWeights(cloud, null, c0, e1, e2, n, slab, 18, [[armIdx, 1]])
          : Array.from({ length: 18 }, () => [[armIdx, 1]]),
      };
      rings.push(clampInsideTorso(ring));
    }

    // v4: NO separate cap cone. The v3/v2 caps existed to cover a slope that
    // never actually covered the shoulders (it closed onto the neck inside
    // the traps). The v4 slope + collar genuinely span the deltoid band, so
    // the sleeve is a SET-IN sleeve: its entry ring (t=0.02) dives under the
    // torso wall (D-clamped columns inside the tube — rule: no edge faces an
    // edge), and the arm rings run pure-arm down the sleeve. Every extreme
    // arm pose that dragged cap rings into the neck/chin or sheared them at
    // arms-out (measured 3–9 cm by the signed probe) no longer has caps to
    // drag; the entry's flesh-blend weights track the armhole instead.
    sleeves.push(rings);
  }

  const bodyStrip = [flare, ...torso, ...slope, ...collar];
  for (let i = 0; i < 5; i++) blurRingWeights(bodyStrip);
  for (const s2 of sleeves) for (let i = 0; i < 5; i++) blurRingWeights(s2);
  const mesh = skinnedTube(skin, lam(colors.tshirt, { side: THREE.DoubleSide }),
    [bodyStrip, ...sleeves], 18, 'tshirt');
  return [mesh];
}

// ── rigid pieces (ported from geno-wardrobe.js — founder-approved) ───────────

function buildHeadband(av, colors) {
  const H = av.H;
  const g = frameOnBone(av.bones.head, headUp(av), FWD);
  g.userData.rwfWardrobe = 'headband';
  // hugged band: the ported 0.068H ring floated up to 7.8 cm off the
  // narrowing upper skull (atelier probe). 0.058H rides the temples, still
  // visibly crossing the forehead (head semi-depth ≈ 0.060H).
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.058 * H, 0.013 * H, 8, 18), lam(colors.headband));
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.068 * H, 0.012 * H);
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

function buildSneakers(av, colors, _plan, env = {}) {
  const skin = env.skin ?? genoSkin(av);
  const cloud = env.cloud ?? bodyCloud(skin);
  const H = av.H;
  const roots = [];
  for (const side of ['footL', 'footR']) {
    const foot = av.bones[side];
    const toe = av.bones[side === 'footL' ? 'toeL' : 'toeR'];
    if (!foot || !toe) continue;
    // ── SKINNED, MEASURED shoe (a wedge foot defeats every box: max-extent
    //    boxes put corners 10–13 cm off the sloping instep / narrow heel —
    //    atelier probe, three box iterations). Same ring-tube system as the
    //    garments: sole + upper strips measured ring-by-ring off the foot's
    //    own flesh, weights inherited from the flesh they wrap (ankle rings
    //    blend Leg — the shoe BENDS with the ankle through mocap).
    const fp = bindPos(foot, skin.toBind), tp = bindPos(toe, skin.toBind);
    const axis = new THREE.Vector3().subVectors(tp, fp);
    const L = axis.length(); axis.normalize();
    const n = axis.clone();
    let e1 = new THREE.Vector3().crossVectors(UP, n);
    if (e1.lengthSq() < 1e-6) e1 = XAX.clone();
    e1.normalize(); // lateral
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize(); // ⊥ axis, vertical-ish
    const footSet = new Set([skin.skeleton.bones.indexOf(foot), skin.skeleton.bones.indexOf(toe)]
      .filter((i) => i >= 0));
    void footSet;
    const down2 = e2.y < 0 ? e2 : e2.clone().negate(); // the downward ring direction

    // per-foot sub-cloud (v4 SIZING): keep only verts near THIS foot's
    // ankle↔toe segment — all-bone slabs at the feet measure BOTH feet
    // (the waist-hands pollution class) — AND drop the SHIN above the
    // ankle. v3 kept the low shin in the cloud and then CAPPED every ring
    // (min(rx, 0.058H) / min(rz, 0.05H) / taper / vertical cap) to fight
    // the balloon; caps that can fall below flesh are exactly how the
    // charcoal upper ended up inside the foot. With the shin excluded at
    // the source, every ring hugs the true cross-section — no caps at all.
    const footCloud = [];
    const shinCut = fp.y + 0.034 * H; // the shoe never covers the shin
    for (const v of cloud) {
      if (v.y > shinCut) continue;
      const rel = new THREE.Vector3(v.x - fp.x, v.y - fp.y, v.z - fp.z);
      const along = rel.dot(axis);
      const rad = rel.clone().addScaledVector(axis, -Math.min(L, Math.max(0, along))).length();
      if (rad < 0.072 * H) footCloud.push(v);
    }

    // shoe rings: plain measured hugs. The mid-span centre shift stays
    // damped toward the axis point (smooths the foot's centreline curl).
    // Profile hi is 1.25 (the malleolus bulge is real flesh — a ring that
    // caps BELOW it is inside the ankle).
    const ringAt = (t, margin, drop, popMaxY = shinCut) => {
      const c0 = new THREE.Vector3().copy(fp).addScaledVector(axis, t * L);
      const slab = 0.02 * H;
      const pop = popMaxY >= shinCut ? footCloud : footCloud.filter((v) => v.y <= popMaxY);
      const { c, rx, rz } = hugRing(pop, null, c0, e1, e2, n, slab, margin, 0.024 * H, 0.016 * H);
      const cc = c0.clone().lerp(c, 0.4).addScaledVector(down2, drop);
      const prof = radialProfile(pop, null, c, e1, e2, n, slab, rx, rz, 18, 0.85, 1.25);
      // vertical clamp at the population's own ceiling — a flesh-derived
      // limit (it sits above every vert the ring measured), so unlike v3's
      // fixed capY it can never drop a column below flesh; it only stops
      // rings from towering past the flesh they wrap (heel/collar into the
      // shin, measured 6–17 cm inside the calf).
      for (let col = 0; col < 18; col++) {
        const a = (col / 18) * Math.PI * 2;
        const py = cc.y + prof[col] * (rx * Math.cos(a) * e1.y + (rz + drop) * Math.sin(a) * e2.y);
        if (py > popMaxY && py > cc.y + 1e-6) {
          prof[col] *= Math.max(0.25, (popMaxY - cc.y) / (py - cc.y));
        }
      }
      return {
        c: cc, e1, e2, n,
        rx, rz: rz + drop,
        prof,
        w: columnWeights(pop, null, cc, e1, e2, n, 0.03 * H, 18),
      };
    };
    // sole (WHITE, reads as the sole rim): measured rings along the foot,
    // dropped toward the ground so its bottom edge pokes below the upper.
    // The heel ring is HUGGED (v3's derived 0.55× cone sat 3–18 cm inside
    // the heel flesh — measured by the signed probe).
    // the sole's back finish: a pinched ring just BEHIND the ankle joint —
    // real heel flesh to hug there (t=-0.10), so the tube end reads as a
    // finished edge over the heel instead of an open pipe. Nothing lives in
    // the retrocalcaneal hollow further back: every ellipse tried there
    // either sank 1.6+ cm into the calf's shadow or clipped the heel
    // (signed probe, measured) — the hollow gets NO ring, by design.
    const soleRings = [
      ...[0.0, 0.02, 0.2, 0.38, 0.56, 0.74, 0.92, 1.06].map((t) => ringAt(t, 0.004 * H, 0.008 * H)),
    ];
    // back finish: a pinch on the ankle-station ring (t=0.0) — the ankle
    // cross-section is fully flesh-anchored (every probe clean); stations
    // behind the ankle all graze the retrocalcaneal hollow, so the sole's
    // back edge lives AT the ankle, pinched to read finished.
    soleRings[0] = {
      ...soleRings[0],
      rx: soleRings[0].rx * 0.94, rz: soleRings[0].rz * 0.94,
      prof: soleRings[0].prof.map((v) => Math.min(1, v)),
    };
    // upper (CHARCOAL, the visible shoe): ankle collar → instep → toe box.
    // No taper — the wedge foot's own cross-section tapers toward the toes,
    // so the hugs taper naturally; the toe-end rings enclose the wide toe
    // box per-axis (the founder's "shoes invisible around the toes").
    const upRings = [0.0, 0.18, 0.38, 0.58, 0.78, 1.0]
      .map((t, k) => ringAt(t, 0.007 * H, k === 0 ? 0.004 * H : 0.001 * H));
    // WELD the shoe to the foot the way the old rigid shoes were welded: a
    // strip-average weight would blend Leg into the ankle rings and the shoe
    // rotates only HALF with the foot at toe-off — the sole swept 15 cm off
    // the flesh in the prone push-up (measured). Sole = pure Foot, upper =
    // Foot with a graded toe share at the cap (toe-off flexes the cap).
    const footIdx = skin.skeleton.bones.indexOf(foot);
    const toeIdx = skin.skeleton.bones.indexOf(toe);
    for (const r of soleRings) {
      r.w = Array.from({ length: 18 }, () => [[footIdx, 1]]);
    }
    // whole shoe rigid with the Foot (like the approved old shoes): a toe
    // blend landed BETWEEN foot and toe at toe-off, 7.3 cm off both (pushup)
    const toeShare = [0, 0, 0, 0, 0, 0];
    upRings.forEach((r, k) => {
      const ts = toeShare[k] ?? 0;
      r.w = Array.from({ length: 18 }, () =>
        ts > 0 ? [[footIdx, 1 - ts], [toeIdx, ts]] : [[footIdx, 1]]);
    });
    roots.push(skinnedTube(skin, lam(OUTFIT_TOKENS.white, { side: THREE.DoubleSide }),
      [soleRings], 18, 'sneakers'));
    roots.push(skinnedTube(skin, lam(colors.sneakers, { side: THREE.DoubleSide }),
      [upRings], 18, 'sneakers'));
  }
  return roots;
}

// ── verification hooks (the atelier's instruments) ───────────────────────────

/** Fresh per-bone skinning matrices: bone.matrixWorld × boneInverse.
 *  Deliberately NOT skeleton.boneMatrices: those are refreshed by the
 *  RENDERER, so probing without a render between poses would measure a
 *  stale mixed-pose state (measured: phantom 10–14 cm offsets). */
function freshBoneMatrices(skeleton) {
  return skeleton.bones.map((b, i) =>
    new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skeleton.boneInverses[i]));
}

/** CPU-skin one vertex to WORLD space. NOTE the full shader chain is
 *  modelMatrix · bindMatrixInverse · Σ(boneMat · bindMatrix · v); in
 *  'attached' bind mode three keeps bindMatrixInverse = inverse(matrixWorld)
 *  fresh every updateMatrixWorld, so modelMatrix·bindMatrixInverse cancels
 *  and the world position is JUST Σ w·(bone.matrixWorld·boneInverse)·v —
 *  multiplying mesh.matrixWorld on top double-applies root scale/prone/yaw
 *  (measured: garments rendered at S², every distance garbage). */
function skinnedVert(mesh, i, out, M) {
  out.fromBufferAttribute(mesh.geometry.attributes.position, i);
  const SI = mesh.geometry.attributes.skinIndex;
  const SW = mesh.geometry.attributes.skinWeight;
  const x = out.x, y = out.y, z = out.z;
  let px = 0, py = 0, pz = 0;
  for (let j = 0; j < 4; j++) {
    const w = SW.getComponent(i, j);
    if (w <= 0) continue;
    const m = M[SI.getComponent(i, j)];
    if (!m) continue;
    px += w * (m.elements[0] * x + m.elements[4] * y + m.elements[8] * z + m.elements[12]);
    py += w * (m.elements[1] * x + m.elements[5] * y + m.elements[9] * z + m.elements[13]);
    pz += w * (m.elements[2] * x + m.elements[6] * y + m.elements[10] * z + m.elements[14]);
  }
  out.set(px, py, pz);
  return out;
}

/** Live CPU-skinned garment vertices in WORLD space, tagged by kind.
 *  Soft garments: fresh bone-matrix skinning (the exact shader maths).
 *  Rigid: matrixWorld. */
export function garmentVerts(garment, out = []) {
  out.length = 0;
  garment.updateWorldMatrix(true, false);
  const P = garment.geometry.attributes.position;
  const v = new THREE.Vector3();
  if (garment.isSkinnedMesh && garment.geometry.attributes.skinIndex) {
    const M = freshBoneMatrices(garment.skeleton);
    for (let i = 0; i < P.count; i++) out.push(skinnedVert(garment, i, new THREE.Vector3(), M).clone());
  } else {
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(garment.matrixWorld);
      out.push(v.clone());
    }
  }
  return out;
}

/** Bounding snapshot of a garment (live, world space) + its skinned verts. */
export function garmentBounds(garment) {
  const verts = garmentVerts(garment);
  const box = new THREE.Box3();
  for (const v of verts) box.expandByPoint(v);
  return {
    kind: garment.isSkinnedMesh ? 'soft' : 'rigid',
    tag: garment.userData?.rwfWardrobe ?? '',
    min: box.min.toArray(), max: box.max.toArray(),
    verts: verts.map((v) => v.toArray()),
    layout: garment.userData?.rwfLayout ?? null,
  };
}

/** Dense live body surface (world space) — the distance oracle. `maxVerts`
 *  budgets sampling (probe = full resolution; heatmap = cheaper). Uses the
 *  same FRESH bone-matrix skinning as garmentVerts (render-independent). */
export function bodySurface(avatar, maxVerts = 26000) {
  const pts = [];
  avatar.prone.children[0].traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || o.userData?.rwfWardrobe) return;
    o.updateWorldMatrix(true, false);
    const M = freshBoneMatrices(o.skeleton);
    const P = o.geometry.attributes.position;
    const st = Math.max(1, Math.floor(P.count / maxVerts));
    for (let i = 0; i < P.count; i += st) {
      pts.push(skinnedVert(o, i, new THREE.Vector3(), M).toArray());
    }
  });
  return pts;
}

/** Live CPU-skinned body TRIANGLES as one flat Float32Array [ax,ay,az, bx,
 *  by,bz, cx,cy,cz, ...] (world space, wardrobe meshes excluded). Vertex
 *  sampling cannot drive occlusion probes (Geno's samples land ~1.2 cm apart);
 *  the atelier's signed inside-body oracle renders this exact triangle soup. */
export function bodyTriangles(avatar) {
  const chunks = [];
  let total = 0;
  avatar.prone.children[0].traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || !o.geometry.attributes.position
      || o.userData?.rwfWardrobe) return;
    o.updateWorldMatrix(true, false);
    const M = freshBoneMatrices(o.skeleton);
    const P = o.geometry.attributes.position;
    const I = o.geometry.index;
    const tri = Math.floor((I ? I.count : P.count) / 3);
    const out = new Float32Array(tri * 9);
    let w = 0;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    for (let t = 0; t < tri; t++) {
      const ia = I ? I.getX(t * 3) : t * 3;
      const ib = I ? I.getX(t * 3 + 1) : t * 3 + 1;
      const ic = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      skinnedVert(o, ia, va, M); skinnedVert(o, ib, vb, M); skinnedVert(o, ic, vc, M);
      out[w++] = va.x; out[w++] = va.y; out[w++] = va.z;
      out[w++] = vb.x; out[w++] = vb.y; out[w++] = vb.z;
      out[w++] = vc.x; out[w++] = vc.y; out[w++] = vc.z;
    }
    chunks.push(out);
    total += w;
  });
  const all = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return all;
}

/** Skeleton samples (world space): every bone segment every ~2 cm + a
 *  terminal extension for tips (toes/fingers/head). Sparse low-poly flesh
 *  (Geno's feet: a heel corner can be 15 cm from the nearest SURFACE vert)
 *  makes surface-only distance dishonest for BONE-WELDED rigid pieces —
 *  their attachment truth is proximity to the skeleton they ride. */
export function skeletonSamples(avatar) {
  const pts = [];
  const bones = [];
  avatar.prone.children[0].traverse((o) => { if (o.isBone) bones.push(o); });
  for (const b of bones) {
    b.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const kids = b.children.filter((c) => c.isBone);
    for (const c of kids) {
      c.updateWorldMatrix(true, false);
      const q = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
      const seg = q.clone().sub(p);
      const n = Math.max(2, Math.ceil(seg.length() / 0.02));
      for (let i = 0; i <= n; i++) pts.push([p.x + seg.x * i / n, p.y + seg.y * i / n, p.z + seg.z * i / n]);
    }
    if (!kids.length && b.parent?.isBone) { // terminal bone → extend to the tip
      b.parent.updateWorldMatrix(true, false);
      const pp = new THREE.Vector3().setFromMatrixPosition(b.parent.matrixWorld);
      const tip = p.clone().addScaledVector(p.clone().sub(pp), 0.5);
      pts.push([tip.x, tip.y, tip.z]);
    }
  }
  return pts;
}

/** Uniform-grid nearest-distance oracle over a point cloud (cell = `cell`).
 *  Expands the search ring (±1 → ±2 → ±4 cells) while nothing is found, so a
 *  query on a relaxed-fit garment ring 10–15 cm off the flesh returns its
 *  true distance instead of Infinity (measured on the v4 tee at BVH-bind
 *  arms-out, where the old ±1-only search poisoned the attachment bars). */
export function nearestDistanceFactory(cloud, cell = 0.05) {
  const grid = new Map();
  const key = (i, j, k) => i + ',' + j + ',' + k;
  for (const [x, y, z] of cloud) {
    const kk = key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
    let a = grid.get(kk);
    if (!a) { a = []; grid.set(kk, a); }
    a.push(x, y, z);
  }
  return (x, y, z) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    for (const ring of [1, 2, 4, 8, 12]) { // cloth hems swing 20-60 cm off the body mid-stride
      let best = Infinity;
      for (let di = -ring; di <= ring; di++) for (let dj = -ring; dj <= ring; dj++) for (let dk = -ring; dk <= ring; dk++) {
        const a = grid.get(key(ci + di, cj + dj, ck + dk));
        if (!a) continue;
        for (let i = 0; i < a.length; i += 3) {
          const dx = a[i] - x, dy = a[i + 1] - y, dz = a[i + 2] - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < best) best = d2;
        }
      }
      if (best < Infinity) return Math.sqrt(best);
    }
    return Infinity;
  };
}

// ── public API (mirrors attachWardrobe so the gallery can swap 1:1) ──────────

/**
 * Attach the canonical outfit to a loaded Geno ModelAvatar.
 * opts.slots: array of OUTFIT_SLOTS or 'full' (default).
 * opts.colors: per-slot colour overrides.
 * Returns { slots, toggle, isVisible, updateFabric (no-op — skinned hems),
 *           softGarments, rigidPieces, plan }.
 */
export function attachOutfit(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachOutfit: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);

  const colors = {
    shorts: OUTFIT_TOKENS.coral,
    waistband: OUTFIT_TOKENS.white,
    tshirt: OUTFIT_TOKENS.lime,
    headband: OUTFIT_TOKENS.coral,
    wristbands: OUTFIT_TOKENS.lime,
    sneakers: OUTFIT_TOKENS.charcoal,
    ...(opts.colors || {}),
  };
  const wanted = !opts.slots || opts.slots === 'full' ? OUTFIT_SLOTS : opts.slots;

  const skin = genoSkin(avatar);
  const cloud = bodyCloud(skin);
  const plan = waistPlan(avatar, skin);
  const env = { skin, cloud };

  const builders = {
    shorts: buildShorts, waistband: buildWaistband, tshirt: buildTee,
    sneakers: buildSneakers, headband: buildHeadband, wristbands: buildWristbands,
  };
  const slots = {};
  const softGarments = [];   // skinned meshes (probe targets, x-ray, heatmap)
  const rigidPieces = [];    // bone-parented MESHES (groups expanded)
  for (const name of OUTFIT_SLOTS) {
    if (!wanted.includes(name)) continue;
    const built = builders[name](avatar, colors, plan, env);
    slots[name] = Array.isArray(built) ? built : [built]; // roots, each on its bone
    for (const root of slots[name]) {
      if (root.isSkinnedMesh) softGarments.push(root);
      else if (root.isMesh) rigidPieces.push(root);
      else root.traverse((o) => { if (o.isMesh) rigidPieces.push(o); }); // group → meshes
    }
  }

  const isVisible = (slot) => slots[slot]?.every((g) => g.visible) ?? true;
  return {
    slots,
    isVisible,
    softGarments,
    rigidPieces,
    plan,
    toggle(slot, on) {
      for (const g of slots[slot] ?? []) g.visible = !!on;
    },
    /** API compat with attachWardrobe — the outfit's hems are skinned
     *  (skin-follow), so there is no cloth sim to step. */
    updateFabric() {},
  };
}

/** Remove outfit groups inherited through loadModel()'s clone(true). */
export function clearOutfit(avatar) {
  const doomed = [];
  avatar.prone.children[0].traverse((o) => { if (o.userData?.rwfWardrobe) doomed.push(o); });
  for (const o of doomed) o.parent?.remove(o);
}
