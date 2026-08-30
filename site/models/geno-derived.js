// geno-derived.js — SKIN-DERIVED GARMENTS: the body's own triangles, offset.
//
// THE CONSTRUCTION (the founder's answer, implemented literally):
// A garment is not an approximation of the body — it IS the body's surface:
//
//   1. Region-select VERTICES of the Geno body SkinnedMesh (dominant bone +
//      y-band / limb-parameter t — pose-independent at bind).
//   2. Build each garment as a sub-mesh of WHOLE triangles (a triangle joins
//      the garment iff ≥2 of its verts are in the region; the boundary ring
//      is closed by the 1-ring frontier, so no pinholes are possible — the
//      topology is inherited from the body).
//   3. Offset every garment vertex +6 mm along its OWN bind-pose normal
//      (collar +3 mm, waistband +9 mm). By construction the garment is the
//      body shape + 6 mm: it cannot be inside the flesh (the "invisible
//      region" class dies) and cannot be armour (uniform 6 mm, not
//      measured+margined radii).
//   4. Copy skinIndex/skinWeight unchanged → a new SkinnedMesh sharing the
//      body's skeleton (identity bindMatrix, same parent scene) deforms
//      IDENTICALLY to the body through every BVH clip and pose. No solver,
//      no per-frame cost beyond skinning ~4k more triangles.
//   5. Hems: each opening's frontier ring is dropped 2.5–3 cm and flared
//      ~1 cm outward (weights inherited) — finished-looking openings, still
//      welded to the garment because they are body triangles too.
//
// Slots: tshirt (torso + both sleeves, one mesh) · shorts (pelvis + both
// upper thighs in ONE region — the crotch is covered by body triangles, the
// crotch-bridge problem disappears) · waistband (the shorts' top strip as
// its own mesh at +9 mm, contrast colour, always proud). Sneakers,
// headband, wristbands stay the founder-approved v4 pieces from
// geno-outfit.js.
//
// Self-contained and canonical for /atelier (default garment system).
// window-facing stats: attachDerivedOutfit(...).derived.stats.
//

import * as THREE from 'three';
import {
  OUTFIT_TOKENS, genoSkin, bodyCloud, waistPlan,
  buildSneakers, buildHeadband, buildWristbands,
} from './geno-outfit.js';

// ── construction constants (metric — converted via the model's own height) ──
export const DERIVED_SPEC = {
  garmentMm: 6,        // uniform outward offset along the vertex normal
  collarMm: 3,         // the shirt's top ring sits close at the neck
  bandMm: 9,           // waistband rides proud of the shorts shell
  collarDropH: 0.022,  // collar line: this far BELOW the neck joint (×H)
  bandTopH: 0.0047,    // band top: this far BELOW the spine/waist joint (×H, v4 value)
  bandHcm: 2.5,        // waistband height
  shirtHemH: 0.018,    // shirt region bottom above the band top (hem lip lands at the band)
  hemDropCm: 2.8,      // hem ring drop
  hemFlareCm: 1.0,     // hem ring outward flare
  sleeveT: 0.42,       // sleeve covers shoulder→mid-bicep of the upper-arm segment
  sleeveDropCm: 2.0,   // sleeve hem drop along the arm axis
  sleeveFlareCm: 0.8,  // sleeve hem radial flare
  thighT: 0.55,        // shorts cover the thigh to just past mid-thigh
  legHemDropCm: 2.4,   // shorts leg hem drop
  legHemFlareCm: 0.8,  // shorts leg hem flare
  crotchH: 0.088,      // pelvis region reaches this far below the hip joint (full crotch depth)
};

const UP = new THREE.Vector3(0, 1, 0);

/** mm/cm → model units for THIS avatar (model height H units = 1.75 m human). */
const unitPerMm = (H) => 0.001 * 1.75 / H;   // 1 mm in scene units
const unitPerCm = (H) => 0.01 * 1.75 / H;    // 1 cm in scene units

// ── region machinery ─────────────────────────────────────────────────────────

/** The body SkinnedMesh to derive from: the largest skinned mesh in the scene
 *  (Geno: one 10.8k-vert "Geno" mesh; eyes etc. are separate small skeletons
 *  and are excluded by size + skeleton match). */
function bodyMeshOf(skin) {
  let best = null;
  skin.scene.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex || !o.geometry.index) return;
    if (o.skeleton !== skin.skeleton) return;
    if (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count) best = o;
  });
  if (!best) throw new Error('geno-derived: no skinned body mesh found');
  return best;
}

const rawName = (n) => n.replace(/^mixamorig:/, '');
const isSpineBone = (n) => /^Spine\d*$/.test(n);
const isTorsoBone = (n) => n === 'Hips' || isSpineBone(n);

/** Dominant-bone index per vertex (4-way max skin weight — pose-independent). */
function dominantBones(mesh) {
  const SI = mesh.geometry.attributes.skinIndex;
  const SW = mesh.geometry.attributes.skinWeight;
  const dom = new Int32Array(SI.count);
  for (let i = 0; i < SI.count; i++) {
    let d = 0, dw = -1;
    for (let j = 0; j < 4; j++) {
      const w = SW.getComponent(i, j);
      if (w > dw) { dw = w; d = SI.getComponent(i, j); }
    }
    dom[i] = d;
  }
  return dom;
}

/** Signed parameter of p along segment a→b, clamped to [0,1]. */
function segT(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const L2 = dx * dx + dy * dy + dz * dz || 1e-9;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2;
  return Math.min(1, Math.max(0, t));
}

/**
 * Extract a garment sub-mesh from the body mesh.
 *   inRegion(i) → vertex membership (the R set)
 *   roleOf(i, isFrontier) → { offMm, drop, dropDir, flare, outwardAt } — how to
 *   displace a vertex (region verts and frontier verts can differ: hems).
 * Whole-triangle rule: a triangle is included iff ≥2 verts ∈ R; the frontier F
 * is every non-R vertex of those triangles; triangles with 1 R + 2 F verts
 * (the first ring past the boundary) are also included, so the garment closes
 * with the body's own connectivity — no pinholes, no welding.
 */
function extractGarment(body, inRegion, roleOf, tag, mat, uPerMm) {
  const geo = body.geometry;
  const P = geo.attributes.position;
  const N = geo.attributes.normal;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  const IDX = geo.index;

  const region = new Uint8Array(P.count);
  const count = { region: 0 };
  for (let i = 0; i < P.count; i++) if (inRegion(i)) { region[i] = 1; count.region++; }

  // pass 1 — region triangles (≥2 R verts); collect the frontier F
  const frontier = new Uint8Array(P.count);
  const triCount = IDX.count / 3;
  const regionTri = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = IDX.getX(t * 3), b = IDX.getX(t * 3 + 1), c = IDX.getX(t * 3 + 2);
    const r = region[a] + region[b] + region[c];
    if (r >= 2) {
      regionTri[t] = 1;
      if (!region[a]) frontier[a] = 1;
      if (!region[b]) frontier[b] = 1;
      if (!region[c]) frontier[c] = 1;
    }
  }
  // pass 2 — garment triangles: all verts in R∪F, at least one in R
  const used = new Uint8Array(P.count);
  const idx = [];
  for (let t = 0; t < triCount; t++) {
    const a = IDX.getX(t * 3), b = IDX.getX(t * 3 + 1), c = IDX.getX(t * 3 + 2);
    const inSet = (v) => region[v] || frontier[v];
    if (!inSet(a) || !inSet(b) || !inSet(c)) continue;
    if (!(region[a] || region[b] || region[c])) continue;
    idx.push(a, b, c);
    used[a] = 1; used[b] = 1; used[c] = 1;
  }

  // compact: garment vertex = the body vertex itself (same skin weights)
  const map = new Int32Array(P.count).fill(-1);
  const src = [];
  for (let i = 0; i < P.count; i++) if (used[i]) { map[i] = src.length; src.push(i); }

  const n = src.length;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const siArr = new Uint16Array(n * 4);
  const swArr = new Float32Array(n * 4);
  const bindDelta = new Float32Array(n * 3);   // garment − body, at bind (probe truth)
  const roles = [];
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), out = new THREE.Vector3();
  let degenerate = 0;

  for (let k = 0; k < n; k++) {
    const i = src[k];
    v.fromBufferAttribute(P, i);
    nv.fromBufferAttribute(N, i);
    const role = roleOf(i, !!frontier[i]);
    roles.push(role.kind);
    // displace: base normal offset, then the role's drop/flare (absolute units)
    const u = uPerMm * role.offMm;
    out.copy(v).addScaledVector(nv, u);
    if (role.drop) out.addScaledVector(role.dropDir, role.drop);
    if (role.flare && role.outwardAt) {
      const ow = role.outwardAt(v, nv);
      out.addScaledVector(ow, role.flare);
    }
    pos[k * 3] = out.x; pos[k * 3 + 1] = out.y; pos[k * 3 + 2] = out.z;
    nrm[k * 3] = nv.x; nrm[k * 3 + 1] = nv.y; nrm[k * 3 + 2] = nv.z;
    bindDelta[k * 3] = out.x - v.x; bindDelta[k * 3 + 1] = out.y - v.y; bindDelta[k * 3 + 2] = out.z - v.z;
    for (let j = 0; j < 4; j++) {
      siArr[k * 4 + j] = SI.getComponent(i, j);
      swArr[k * 4 + j] = SW.getComponent(i, j);
    }
  }
  const remapped = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) remapped[t] = map[idx[t]];
  // degenerates (inherited topology should give none — assert/report)
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let t = 0; t < remapped.length; t += 3) {
    va.fromArray(pos, remapped[t] * 3); vb.fromArray(pos, remapped[t + 1] * 3); vc.fromArray(pos, remapped[t + 2] * 3);
    ab.subVectors(vb, va); ac.subVectors(vc, va);
    if (ab.cross(ac).lengthSq() < 1e-14) degenerate++;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(siArr, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(swArr, 4));
  g.setIndex(new THREE.BufferAttribute(remapped, 1));
  const m = new THREE.SkinnedMesh(g, mat);
  m.userData.rwfWardrobe = tag;
  m.userData.rwfDerived = {
    body, srcIndex: Int32Array.from(src), bindDelta,
    regionVerts: count.region, frontierVerts: n - count.region,
    tris: remapped.length / 3, degenerate,
    roles,
  };
  m.frustumCulled = false;
  return m;
}

// ── the outfit ───────────────────────────────────────────────────────────────

/**
 * Attach the skin-derived outfit (DEFAULT garment system for /atelier).
 * Returns the atelier outfit object: { slots, toggle, isVisible, softGarments,
 * rigidPieces, plan, mode:'derived', derived } — updateFabric/settle are no-ops
 * (there is no sim: the garments ARE skinned body surface).
 */
export function attachDerivedOutfit(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachDerivedOutfit: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);
  const H = avatar.H;
  const mm = unitPerMm(H), cm = unitPerCm(H);
  const S = DERIVED_SPEC;

  const colors = {
    shorts: OUTFIT_TOKENS.coral,
    waistband: OUTFIT_TOKENS.white,
    tshirt: OUTFIT_TOKENS.lime,
    headband: OUTFIT_TOKENS.coral,
    wristbands: OUTFIT_TOKENS.lime,
    sneakers: OUTFIT_TOKENS.charcoal,
    ...(opts.colors || {}),
  };
  const lam = (color) => new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });

  const skin = genoSkin(avatar);
  const body = bodyMeshOf(skin);
  const plan = waistPlan(avatar, skin);

  // bind-pose joints in the body mesh's local frame
  skin.scene.updateMatrixWorld(true);
  const bp = (b) => {
    b.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(skin.toBind);
  };
  const hipsP = bp(B.hips), spineP = bp(B.spine), spine1P = B.spine1 ? bp(B.spine1) : null;
  const neckP = bp(B.neck);
  const armLs = bp(B.armL), armLe = bp(B.foreL), armRs = bp(B.armR), armRe = bp(B.foreR);
  const legLs = bp(B.upLegL), legLe = bp(B.legL), legRs = bp(B.upLegR), legRe = bp(B.legR);

  // heights (body-local y)
  const collarY = neckP.y - S.collarDropH * H;
  const bandTop = spineP.y - S.bandTopH * H;
  const bandBot = bandTop - S.bandHcm * cm;
  const hipY = bandTop + S.shirtHemH * H;              // shirt region bottom
  const crotchY = hipsP.y - S.crotchH * H;

  // spine line for "outward" (horizontal radial) at a given y
  const knots = [hipsP, spineP, ...(spine1P ? [spine1P] : []), neckP].sort((a, b) => a.y - b.y);
  const lineAt = (y) => {
    for (let k = 0; k < knots.length - 1; k++) {
      if (y <= knots[k + 1].y || k === knots.length - 2) {
        const t = Math.min(1, Math.max(0, (y - knots[k].y) / (knots[k + 1].y - knots[k].y || 1)));
        return new THREE.Vector3().lerpVectors(knots[k], knots[k + 1], t);
      }
    }
    return knots[0].clone();
  };
  const radialFromLine = (p, nrm) => {
    const c = lineAt(p.y);
    const o = new THREE.Vector3(p.x - c.x, 0, p.z - c.z);
    if (o.lengthSq() < 1e-8) o.set(nrm.x, 0, nrm.z);
    if (o.lengthSq() < 1e-8) o.set(0, 0, 1);
    return o.normalize();
  };
  const radialFromAxis = (a, b, p, nrm) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2));
    const o = new THREE.Vector3(p.x - (a.x + dx * t), p.y - (a.y + dy * t), p.z - (a.z + dz * t));
    o.y = 0; // hem flare reads horizontal even when the limb slopes
    if (o.lengthSq() < 1e-8) o.set(nrm.x, 0, nrm.z);
    if (o.lengthSq() < 1e-8) o.set(0, 0, 1);
    return o.normalize();
  };

  // bone name → index on the body's skeleton
  const boneIdx = {};
  skin.skeleton.bones.forEach((b, i) => { boneIdx[rawName(b.name)] = i; });
  const dom = dominantBones(body);
  const P = body.geometry.attributes.position;
  const vTmp = new THREE.Vector3();

  const yOf = (i) => P.getY(i);

  // ── region predicates (bind-pose, dominant-bone — pose-independent) ──────
  const inShirt = (i) => {
    const y = yOf(i);
    if (y < hipY || y > collarY + 0.006 * H) return false;
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (isTorsoBone(n)) return y <= collarY;
    if (n === 'Neck' || n === 'LeftShoulder' || n === 'RightShoulder') return y <= collarY;
    return false;
  };
  const sleeveOf = (i) => { // 0 = none, 1 = left, 2 = right
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n !== 'LeftArm' && n !== 'LeftForeArm' && n !== 'RightArm' && n !== 'RightForeArm') return 0;
    vTmp.fromBufferAttribute(P, i);
    const side = n.startsWith('Left') ? 1 : 2;
    const t = segT(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, vTmp);
    return t <= S.sleeveT ? side : 0;
  };
  const thighT = (i, side) => {
    vTmp.fromBufferAttribute(P, i);
    return segT(side === 1 ? legLs : legRs, side === 1 ? legLe : legRe, vTmp);
  };
  const sideOfLeg = (i) => {
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n === 'LeftUpLeg' || n === 'LeftLeg') return 1;
    if (n === 'RightUpLeg' || n === 'RightLeg') return 2;
    return 0;
  };
  const inShorts = (i) => {
    const y = yOf(i);
    if (y > bandTop) return false;
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n === 'Hips') return y >= crotchY;
    if (isSpineBone(n)) return y >= bandBot; // waist-ring flesh is Spine-dominated
    const side = sideOfLeg(i);
    if (side) {
      const x = P.getX(i);
      return thighT(i, side) <= S.thighT;
    }
    return false;
  };
  const inBand = (i) => inShorts(i) && yOf(i) >= bandBot;

  // ── role tables (region verts vs frontier verts per garment) ─────────────
  // The shirt mesh is torso + both sleeves merged: a frontier vert must be
  // routed by WHICH region it fronts — sleeve hems drop along the arm axis,
  // the shirt hem drops toward the hips, the collar sits close.
  const DOWN = new THREE.Vector3(0, -1, 0);
  const armSideOf = (i) => {
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n === 'LeftArm' || n === 'LeftForeArm') return 1;
    if (n === 'RightArm' || n === 'RightForeArm') return 2;
    return 0;
  };
  const armT = (i, side) => {
    vTmp.fromBufferAttribute(P, i);
    return segT(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, vTmp);
  };
  const shirtRole = (i, isF) => {
    const side = armSideOf(i);
    if (side) {
      // sleeve-region vert, or the sleeve's hem frontier (t past the cut)
      if (!isF) return { kind: 'region', offMm: S.garmentMm };
      const t = armT(i, side);
      if (t > S.sleeveT - 0.10) {
        const a = side === 1 ? armLs : armRs, b = side === 1 ? armLe : armRe;
        const axis = new THREE.Vector3().subVectors(b, a).normalize();
        return {
          kind: 'hem', offMm: S.garmentMm,
          drop: S.sleeveDropCm * cm, dropDir: axis,
          flare: S.sleeveFlareCm * cm,
          outwardAt: (p, nrm) => radialFromAxis(a, b, p, nrm),
        };
      }
      return { kind: 'tuck', offMm: S.garmentMm }; // shoulder-side frontier
    }
    const y = yOf(i);
    if (!isF) return { kind: 'region', offMm: S.garmentMm };
    if (y < hipY - 1e-4) {
      // hem frontier: drop toward the hips + outward flare
      return {
        kind: 'hem', offMm: S.garmentMm,
        drop: S.hemDropCm * cm, dropDir: DOWN,
        flare: S.hemFlareCm * cm, outwardAt: radialFromLine,
      };
    }
    if (y > collarY - 0.004 * H) return { kind: 'collar', offMm: S.collarMm }; // sits close at the neck
    return { kind: 'tuck', offMm: S.garmentMm }; // internal/shoulder frontier
  };
  const shortsRole = (i, isF) => {
    if (!isF) return { kind: 'region', offMm: S.garmentMm };
    const side = sideOfLeg(i);
    const y = yOf(i);
    if (side && thighT(i, side) > S.thighT - 0.12) {
      const a = side === 1 ? legLs : legRs, b = side === 1 ? legLe : legRe;
      return {
        kind: 'hem', offMm: S.garmentMm,
        drop: S.legHemDropCm * cm, dropDir: DOWN,
        flare: S.legHemFlareCm * cm,
        outwardAt: (p, nrm) => radialFromAxis(a, b, p, nrm),
      };
    }
    return { kind: 'tuck', offMm: S.garmentMm }; // waist frontier — tucks under the shirt
  };

  // ── build (shirt torso + sleeves are ONE mesh — the armpit boundary is
  //    internal, nothing to close) ──────────────────────────────────────────
  const inShirtAll = (i) => inShirt(i) || sleeveOf(i) !== 0;
  const shirtMesh = extractGarment(body, inShirtAll, shirtRole, 'tshirt', lam(colors.tshirt), mm);
  const shortsMesh = extractGarment(body, inShorts, shortsRole, 'shorts', lam(colors.shorts), mm);
  const bandMesh = extractGarment(body, inBand, () => ({ kind: 'region', offMm: S.bandMm }), 'waistband', lam(colors.waistband), mm);
  for (const m of [shirtMesh, shortsMesh, bandMesh]) {
    skin.scene.add(m);
    m.bind(skin.skeleton, new THREE.Matrix4());
  }

  // v4 rigid pieces (founder-approved): skinned sneakers, headband, wristbands.
  // Their groups carry the wardrobe tag; propagate it to the child meshes so
  // probe reports name them (and their v4 distance allowances apply).
  const rigidEnv = { skin, cloud: bodyCloud(skin) };
  const sneakers = buildSneakers(avatar, colors, plan, rigidEnv);
  const headband = buildHeadband(avatar, colors);
  const wristbands = buildWristbands(avatar, colors);

  const slots = {
    tshirt: [shirtMesh],
    shorts: [shortsMesh],
    waistband: [bandMesh],
    sneakers,
    headband: [headband],
    wristbands,
  };
  const softGarments = [shirtMesh, shortsMesh, bandMesh, ...sneakers];
  const rigidPieces = [];
  for (const root of [headband, ...wristbands]) {
    if (root.isMesh) rigidPieces.push(root);
    else root.traverse((o) => { if (o.isMesh) rigidPieces.push(o); }); // group → meshes (v4 pattern)
  }
  for (const m of rigidPieces) {
    if (!m.userData.rwfWardrobe) {
      let p = m.parent, tag = null;
      while (p) { if (p.userData?.rwfWardrobe) { tag = p.userData.rwfWardrobe; break; } p = p.parent; }
      if (tag) m.userData.rwfWardrobe = tag;
    }
  }

  const stats = {
    garmentVerts: softGarments.reduce((a, m) => a + m.geometry.attributes.position.count, 0),
    garmentTris: softGarments.reduce((a, m) => a + m.geometry.index.count / 3, 0),
    perGarment: Object.fromEntries([shirtMesh, shortsMesh, bandMesh].map((m) => {
      const d = m.userData.rwfDerived;
      return [m.userData.rwfWardrobe, {
        verts: m.geometry.attributes.position.count, tris: d.tris,
        regionVerts: d.regionVerts, frontierVerts: d.frontierVerts,
        degenerate: d.degenerate,
      }];
    })),
    heightsH: {
      collarY: +(collarY / H).toFixed(4), bandTop: +(bandTop / H).toFixed(4),
      bandBot: +(bandBot / H).toFixed(4), hipY: +(hipY / H).toFixed(4),
      crotchY: +(crotchY / H).toFixed(4),
    },
  };

  return {
    slots,
    mode: 'derived',
    isVisible: (slot) => slots[slot]?.every((g) => g.visible) ?? true,
    softGarments,
    rigidPieces,
    plan,
    derived: { body, meshes: [shirtMesh, shortsMesh, bandMesh], stats },
    toggle(slot, on) { for (const g of slots[slot] ?? []) g.visible = !!on; },
    updateFabric() {},   // the garment IS skinned body surface — nothing to step
    settle() {},         // no drape to converge
  };
}

/** Remove derived garments (rwfWardrobe-tagged children of the body scene). */
export function clearDerived(avatar) {
  const doomed = [];
  avatar.prone.children[0].traverse((o) => { if (o.userData?.rwfDerived) doomed.push(o); });
  for (const o of doomed) o.parent?.remove(o);
}
