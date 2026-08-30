// site/models/geno-derived.js — SKIN-DERIVED GARMENTS, v6.
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
//   3. Offset every garment vertex along its OWN bind-pose normal by a
//      HEIGHT-GRADED amount (v6: shirt +5 mm at the collar → +9 mm at the
//      chest → +12 mm at the hem — "hanging loose a tiny bit out from the
//      skin", not baggy). By construction the garment is the body shape +
//      millimetres: it cannot be inside the flesh and cannot be armour.
//   4. Copy skinIndex/skinWeight unchanged → a new SkinnedMesh sharing the
//      body's skeleton deforms IDENTICALLY to the body through every BVH
//      clip and pose. No solver, no per-frame cost beyond skinning ~5k
//      triangles.
//
// THE v6 HEM SYSTEM (kills the "apocalypse survivor" torn ends):
// v5 dropped the FRONTIER ring 2.8 cm — but bone-dominance selection makes
// that frontier JAGGED, so the dropped hem shredded into teeth. v6 replaces
// frontier hems with CONTOUR hems:
//
//   • Every opening is cut at a SMOOTH PLANE (level planes for the shirt hem,
//     the collar, the shorts legs; axis-perpendicular planes for the sleeves).
//     Garment verts past the plane are SNAPPED onto it, so the garment's cut
//     edge is a level/straight line, never a jagged one.
//   • The hem extension is a REGULAR sampled ring: the body mesh is
//     intersected with the cut plane (exact triangle-plane intersection →
//     cross-section loops), each loop is polar-binned + smoothed, and 64
//     UNIFORM angular samples are taken — smooth by construction, at every
//     ring's own height (the contour tracks the flesh down the drop).
//   • The jagged-but-level cut boundary is zipped to the regular ring with a
//     watertight triangle bridge (both loops sorted by angle; classic
//     two-pointer merge). Watertightness is ASSERTED at build time (every
//     opening's boundary edges must close).
//   • A FINISHED-EDGE BAND at every opening: the last 1.4 cm of the hem is
//     bulged (+2.2 mm) and vertex-tinted darker — the folded-hem look that
//     makes an opening read as a garment edge instead of a cut. The collar
//     gets a ribbed band (rings alternating +3.0/+3.4 mm up the neck line).
//
// Ring/bridge verts copy the skin weights of their NEAREST body vertex
// (srcIndex), so each constructed vert rides exactly one body vert — the
// Δsource probe ("garment verts track their body verts") stays meaningful
// and measures ≈0 through shared skinning.
//
// ── v7 (the founder's four fixes) ────────────────────────────────────────────
//   • COLLAR AT THE NECK BASE: the collar line is measured from the anatomy
//     (flesh cross-sections — the narrow ring above the trapezius flare),
//     not a spine-top heuristic. v6 cut 2.2%H below the Neck joint, which on
//     Geno sat ~4 cm down the traps ("around the shoulders, not the neck").
//   • WAISTBAND CHARCOAL: token-white (#e8ebef) was ~2ΔE from the body tint
//     (#eceef1) — the band read as flesh. It is now solid charcoal, no
//     vertex tint, distinct from both the pale body and the coral shorts.
//   • LOOSER + DRAPE: graded offsets up (collar 6 → chest 12 → hem 18 mm;
//     sleeves 8→12; shorts 10→16; band stays proud at 12/13), hem flare
//     3 cm, and low-frequency vertical PLEATS + sag bias baked into the
//     bind offset (DERIVED_SPEC.wrinkle) — a fabric read at zero runtime
//     cost (skinning unchanged, Δsource measures vs the constructed offset).
//
// Slots: tshirt (torso + sleeves, one mesh) · shorts · waistband (solid
// charcoal, always proud) · head (SPECIES HEADS ported from geno-wardrobe.js:
// frog with crown by default, goblin/robot secondary) · sneakers/headband/
// wristbands stay the founder-approved v4 pieces from geno-outfit.js.
// A species head swallows the headband — the headband auto-hides while a
// head is active (the crown is the head decoration).
//
// Self-contained and canonical for /atelier (default garment system).
// window-facing stats: attachDerivedOutfit(...).derived.stats.
//

import * as THREE from 'three';
import {
  OUTFIT_TOKENS, genoSkin, bodyCloud, waistPlan,
  buildSneakers, buildHeadband, buildWristbands,
} from './geno-outfit.js';
import { attachHead } from './geno-wardrobe.js';

// ── construction constants (metric — converted via the model's own height) ──
export const DERIVED_SPEC = {
  // v7 height-graded offsets (mm) — "all clothes should hang or be loose like
  // fabric": collar +6 → chest +12 → hem +18 (v6 was 5/9/12). Anti-armour
  // still holds: chest 12 mm + ≤1.8 mm of wrinkle crest < the +15 mm bar.
  shirt: { collarMm: 6, chestMm: 12, hemMm: 18 },   // a tee hangs looser lower
  sleeve: { topMm: 8, hemMm: 12 },                  // grade along the arm
  shorts: { waistMm: 10, hemMm: 16 },               // graded slack down the leg
  band: { topMm: 12, bottomMm: 13 },                // stays PROUD of the 10 mm shorts shell
  // contour-hem construction
  ringSamples: 64,       // uniform angular samples per ring
  contourBins: 64,       // polar bins for the smoothed cross-section profile
  hemDropCm: 2.8,        // shirt hem ring drop
  hemFlareCm: 3.0,       // v7: shirt hem outward flare at the lip (was 1.0) —
  //                         openings visibly stand off the body
  sleeveDropCm: 2.0,     // sleeve hem drop along the arm axis
  sleeveFlareCm: 2.0,    // was 0.8
  legDropCm: 2.4,        // shorts leg hem drop
  legFlareCm: 3.0,       // was 0.8
  lipDropCm: 1.0,        // waistband bottom lip drop
  bandHcm: 1.4,          // finished-edge band height (folded-hem strip)
  bandExtraMm: 2.2,      // band bulge at the lip (double-thickness read)
  bandTint: 1,           // v7: the waistband is a SOLID charcoal — no vertex
  //                         tint (the old 0.82 tint over a near-body white
  //                         read as flesh; see colors.waistband below)
  collarRibMm: 3.0,      // ribbed collar band offset
  collarRibStepMm: 0.4,  // alternating rib bulge
  collarRibHcm: 1.5,     // rib band height (3 rings up the neck line)
  ribTint: 0.86,
  // v7 FIX 1: the collar is cut at the MEASURED NECK BASE — the narrow flesh
  // ring above the trapezius flare (profiled from the body's own
  // cross-sections at build) — plus this much clearance above the flare line.
  collarRiseCm: 0.4,
  // v7 FIX 3: DRAPE WRINKLES — purely geometric, baked into the bind offset
  // (zero runtime cost, inherited skinning unchanged). Low-frequency vertical
  // pleats: radial sin around the garment axis, amplitude deeper near the hem
  // and fading to 0 at the collar/seams, plus a slight vertical sag bias.
  wrinkle: {
    shirtPleats: 10, shirtAmpMm: 2.6, shirtSagMm: 2.0,
    sleevePleats: 8, sleeveAmpMm: 2.2, sleeveSagMm: 1.2,
    shortsPleats: 11, shortsAmpMm: 2.6, shortsSagMm: 1.6,
    envPow: 1.3,         // envelope curvature: slow build, deep at the hem
  },
  // region geometry (v5 values — the approved fit planes)
  bandTopH: 0.0047,      // band top below the spine/waist joint (×H, v4 value)
  bandHcmWaist: 2.5,     // waistband height
  shirtHemH: 0.018,      // shirt region bottom above the band top
  sleeveT: 0.42,         // sleeve covers shoulder→mid-bicep
  thighT: 0.61,          // shorts leg cut — BELOW the crotch line so the
  // cross-section plane meets two SEPARATE thigh loops (a cut above it
  // yields one merged horseshoe loop and the polar profile puts ring verts
  // on the far leg — measured 16 cm off the flesh)
  crotchH: 0.088,        // pelvis region reaches below the hip joint
};

const UP = new THREE.Vector3(0, 1, 0);

/** mm/cm → model units for THIS avatar (model height H units = 1.75 m human). */
const unitPerMm = (H) => 0.001 * 1.75 / H;   // 1 mm in scene units
const unitPerCm = (H) => 0.01 * 1.75 / H;    // 1 cm in scene units

// ── region machinery (v5 — unchanged, pose-independent at bind) ──────────────

/** The body SkinnedMesh to derive from: the largest skinned mesh in the scene. */
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

// ── CONTOUR MACHINERY (v6) ────────────────────────────────────────────────────
// Exact plane ∩ body-mesh cross-sections → smooth regular hem rings.

/** In-plane right-handed basis for a plane normal n (e1 × e2 = n). */
function planeBasis(n) {
  const e1 = new THREE.Vector3(0, 0, 1);
  if (Math.abs(n.z) > 0.9) e1.set(1, 0, 0);
  e1.addScaledVector(n, -e1.dot(n)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  return { e1, e2 };
}

/** Intersect every body triangle with the plane (P, n). Returns closed loops
 *  of points. The body mesh is positionally watertight but index-split, so
 *  segments are chained by QUANTIZED position keys (0.1 mm), which merges the
 *  duplicated vertices along UV seams. */
function planeLoops(geo, P, n) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const d = (i) => {
    const x = pos.getX(i) - P.x, y = pos.getY(i) - P.y, z = pos.getZ(i) - P.z;
    return x * n.x + y * n.y + z * n.z;
  };
  const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
  const segs = [];               // { a: Vector3, b: Vector3, ka, kb }
  const ends = new Map();        // key → [seg, ...]
  const tri = geo.index ? geo.index.count / 3 : pos.count / 3;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  for (let t = 0; t < tri; t++) {
    const vi = geo.index
      ? [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)]
      : [t * 3, t * 3 + 1, t * 3 + 2];
    const dv = vi.map(d);
    if ((dv[0] > 0) === (dv[1] > 0) && (dv[1] > 0) === (dv[2] > 0)) continue;
    // collect crossing-edge intersection points (a triangle cut by a plane
    // through its interior crosses exactly 2 edges; vertices ON the plane are
    // nudged by 1e-7 to the positive side so the parity stays strict)
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const i0 = vi[e], i1 = vi[(e + 1) % 3];
      let d0 = dv[e], d1 = dv[(e + 1) % 3];
      if (d0 === 0) d0 = 1e-7;
      if (d1 === 0) d1 = 1e-7;
      if ((d0 > 0) === (d1 > 0)) continue;
      const s = d0 / (d0 - d1);
      pa.fromBufferAttribute(pos, i0);
      pb.fromBufferAttribute(pos, i1);
      pts.push(new THREE.Vector3().lerpVectors(pa, pb, s));
    }
    if (pts.length !== 2) continue; // grazing corner — skip (neighbour covers it)
    const seg = { a: pts[0], b: pts[1], ka: key(pts[0]), kb: key(pts[1]), used: false };
    if (seg.ka === seg.kb) continue;
    segs.push(seg);
    if (!ends.has(seg.ka)) ends.set(seg.ka, []);
    if (!ends.has(seg.kb)) ends.set(seg.kb, []);
    ends.get(seg.ka).push(seg);
    ends.get(seg.kb).push(seg);
  }
  // chain segments into closed loops
  const loops = [];
  for (const seg of segs) {
    if (seg.used) continue;
    seg.used = true;
    const loop = [seg.a, seg.b];
    let tailKey = seg.kb;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      if (tailKey === seg.ka) break; // closed
      const next = (ends.get(tailKey) ?? []).find((s) => !s.used);
      if (!next) break; // numerical dangle — drop this loop
      next.used = true;
      const nk = next.ka === tailKey ? next.kb : next.ka;
      loop.push(nk === next.kb ? next.b : next.a);
      tailKey = nk;
    }
    if (tailKey === seg.ka && loop.length >= 8) loops.push(loop);
  }
  return loops;
}

/** The loop that belongs to an opening: near the plane ON AVERAGE (straggler
 *  frontier verts sit one mesh-edge past the cut — fine) but never far as a
 *  whole (a different opening's loop is uniformly off-plane), and centroid
 *  near the anchor (e.g. the spine point — keeps the torso loop, not the arms
 *  the same plane also cuts). */
function loopForOpening(loops, opening) {
  let best = null, bestScore = -Infinity;
  const c = new THREE.Vector3();
  for (const loop of loops) {
    c.set(0, 0, 0);
    for (const p of loop) c.add(p);
    c.divideScalar(loop.length);
    let sum = 0, maxOff = 0;
    for (const p of loop) {
      const d = Math.abs(p.clone().sub(opening.P).dot(opening.n));
      sum += d; maxOff = Math.max(maxOff, d);
    }
    const mean = sum / loop.length;
    if (mean > opening.tol || maxOff > opening.tol * 2.5) continue;
    const score = -c.distanceTo(opening.anchor) - loop.length * 1e-4;
    if (score > bestScore) { bestScore = score; best = loop; }
  }
  return best;
}

/** Polar radius profile of a loop around `centre`, binned + circularly
 *  smoothed — the regular rings are sampled from THIS, so they are smooth by
 *  construction even where the mesh contour is noisy. */
function polarProfile(loop, centre, e1, e2, bins, passes = 3) {
  const r = new Float32Array(bins);
  const w = new Float32Array(bins);
  for (const p of loop) {
    const dx = p.x - centre.x, dy = p.y - centre.y, dz = p.z - centre.z;
    const a = dx * e1.x + dy * e1.y + dz * e1.z;
    const b = dx * e2.x + dy * e2.y + dz * e2.z;
    const ang = Math.atan2(b, a);
    const rad = Math.hypot(a, b);
    const bi = Math.min(bins - 1, Math.max(0, Math.round((ang + Math.PI) / (2 * Math.PI) * bins))) % bins;
    r[bi] += rad; w[bi] += 1;
  }
  for (let i = 0; i < bins; i++) if (w[i] > 0) r[i] /= w[i];
  // fill empty bins from the nearest non-empty (circular)
  for (let i = 0; i < bins; i++) {
    if (w[i] > 0) continue;
    for (let k = 1; k < bins; k++) {
      const lo = (i - k + bins) % bins, hi = (i + k) % bins;
      if (w[lo] > 0 || w[hi] > 0) {
        r[i] = w[lo] > 0 && w[hi] > 0 ? (r[lo] + r[hi]) / 2 : (w[lo] > 0 ? r[lo] : r[hi]);
        break;
      }
    }
  }
  // circular smoothing [0.25, 0.5, 0.25]
  let src = r, dst = new Float32Array(bins);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < bins; i++) {
      dst[i] = 0.25 * src[(i - 1 + bins) % bins] + 0.5 * src[i] + 0.25 * src[(i + 1) % bins];
    }
    const t = src; src = dst; dst = t;
  }
  return src;
}

/** Uniform-angle sample of a smoothed polar profile: the point ON the smooth
 *  contour plus its in-plane outward normal (from the numeric tangent). */
function contourPoint(prof, centre, e1, e2, theta) {
  const bins = prof.length;
  // ANGLE CONVENTION: profile bin k holds angle (−π + k·2π/bins) — atan2's
  // range — so sampling maps θ through the same (θ+π) shift
  const radiusAt = (th) => {
    const t = (((th + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const f = t / (2 * Math.PI) * bins;
    const i0 = Math.floor(f) % bins, i1 = (i0 + 1) % bins;
    return prof[i0] + (prof[i1] - prof[i0]) * (f - Math.floor(f));
  };
  const ptAt = (th) => {
    const rr = radiusAt(th);
    return new THREE.Vector3()
      .copy(centre)
      .addScaledVector(e1, Math.cos(th) * rr)
      .addScaledVector(e2, Math.sin(th) * rr);
  };
  const p = ptAt(theta);
  const eps = 0.01;
  const t1 = ptAt(theta - eps), t2 = ptAt(theta + eps);
  const tang = new THREE.Vector3().subVectors(t2, t1).normalize();
  const n2 = new THREE.Vector3().crossVectors(tang, new THREE.Vector3().crossVectors(e1, e2)).normalize();
  const radial = new THREE.Vector3().subVectors(p, centre);
  if (n2.dot(radial) < 0) n2.negate(); // outward, always
  return { p, n2 };
}

// ── the garment builder (v6) ──────────────────────────────────────────────────

/**
 * Extract a garment sub-mesh from the body mesh and finish its openings.
 *
 * plan.vertRole(i) → { offMm, snap } — the graded offset for vertex i and the
 *   plane it snaps to (openings' cut). `snap` is null for interior verts.
 * plan.openings → [opening] where an opening is:
 *   { name, kind: 'hem'|'collar'|'lip', P, n, dropDir, dropCm, flareCm, gMm,
 *     anchor, tol, tint, bandCm?, bandExtraMm?, ribMm?, ribStepMm?, ribHcm?,
 *     contourShift? (dCm → new P, for rings that follow tapering flesh) }
 *
 * Base verts (body verts) get the snap + graded offset; each opening then
 * grows a REGULAR ring set (its own contour per ring height), zipped to the
 * garment's (now level) cut boundary with a watertight bridge, with a
 * finished-edge band / ribbed collar at the lip. All constructed verts copy
 * the skin weights of their nearest body vertex and record it as srcIndex.
 */
function extractGarment(body, inRegion, plan, tag, mat, ctx) {
  const { mm, cm } = ctx;
  const geo = body.geometry;
  const P = geo.attributes.position;
  const N = geo.attributes.normal;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  const IDX = geo.index;

  const region = new Uint8Array(P.count);
  const count = { region: 0 };
  // POSITION-DEDUP representative: Geno's body is index-split (duplicated
  // verts along seams) and the copies can disagree on dominant bone — one
  // copy joins the region, its twin does not, and the seam opens a slit.
  // Region and roles are therefore evaluated once per unique position.
  const rep = new Int32Array(P.count);
  {
    const seen = new Map();
    const keyOf = (i) => `${Math.round(P.getX(i) * 2500)},${Math.round(P.getY(i) * 2500)},${Math.round(P.getZ(i) * 2500)}`;  // ~0.4 mm cells
    for (let i = 0; i < P.count; i++) {
      const k = keyOf(i);
      if (!seen.has(k)) seen.set(k, i);
      rep[i] = seen.get(k);
    }
  }
  for (let i = 0; i < P.count; i++) if (inRegion(rep[i])) { region[i] = 1; count.region++; }

  // pass 1 — region triangles (≥2 R verts); collect the frontier F
  const frontier = new Uint8Array(P.count);
  const triCount = IDX.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = IDX.getX(t * 3), b = IDX.getX(t * 3 + 1), c = IDX.getX(t * 3 + 2);
    const r = region[a] + region[b] + region[c];
    if (r >= 2) {
      if (!region[a]) frontier[a] = 1;
      if (!region[b]) frontier[b] = 1;
      if (!region[c]) frontier[c] = 1;
    }
  }
  // pass 2 — garment triangles: all verts in R∪F, at least one in R; plus a
  // TERRITORY pass (plan.territory) that fills the wedge slits where two
  // regions meet on shared flesh (the armpit between torso and sleeve, the
  // crotch between pelvis and thighs) — without it the boundary loops merge
  // into long snakes through the slit and no opening can be finished.
  const used = new Uint8Array(P.count);
  const idx = [];
  const inTerr = plan.territory ? new Uint8Array(P.count) : null;
  if (inTerr) for (let i = 0; i < P.count; i++) inTerr[i] = plan.territory(rep[i]) ? 1 : 0;
  for (let t = 0; t < triCount; t++) {
    const a = IDX.getX(t * 3), b = IDX.getX(t * 3 + 1), c = IDX.getX(t * 3 + 2);
    const inSet = (v) => region[v] || frontier[v] || (inTerr && inTerr[v]);
    if (!inSet(a) || !inSet(b) || !inSet(c)) continue;
    if (!(region[a] || region[b] || region[c])) continue;
    idx.push(a, b, c);
    used[a] = 1; used[b] = 1; used[c] = 1;
  }

  // compact: garment vertex = the body vertex itself (same skin weights)
  const map = new Int32Array(P.count).fill(-1);
  const src = [];
  for (let i = 0; i < P.count; i++) if (used[i]) { map[i] = src.length; src.push(i); }

  // growable buffers for the constructed ring/bridge verts
  const nBase = src.length;
  const pos = [], nrm = [], si4 = [], sw4 = [], tint = [];
  const roles = new Array(nBase);
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), out = new THREE.Vector3();
  const wOut = new THREE.Vector3();
  let wrinkleCalls = 0, wrinkleMag = 0;   // instrumented (v7): wrinkle reach
  for (let k = 0; k < nBase; k++) {
    const i = src[k];
    v.fromBufferAttribute(P, i);
    nv.fromBufferAttribute(N, i);
    const role = plan.vertRole(rep[i]);   // dedup: twins share the role
    roles[k] = role.kind;
    if (role.snap) v.copy(role.snap(v));            // cut at the smooth plane
    out.copy(v).addScaledVector(nv, role.offMm * mm);
    // v7 DRAPE WRINKLE: radial pleats + vertical sag, purely geometric at
    // bind (see DERIVED_SPEC.wrinkle). Baked into the offset — skinning and
    // the Δsource probe see it as part of the constructed bind offset.
    if (plan.wrinkleAt) {
      plan.wrinkleAt(rep[i], nv, v, wOut);
      out.add(wOut);
      wrinkleCalls++; wrinkleMag = Math.max(wrinkleMag, wOut.length());
    }
    pos.push(out.x, out.y, out.z);
    nrm.push(nv.x, nv.y, nv.z);
    for (let j = 0; j < 4; j++) {
      si4.push(SI.getComponent(i, j));
      sw4.push(SW.getComponent(i, j));
    }
    tint.push(1, 1, 1);
  }
  const remapped = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) remapped[t] = map[idx[t]];
  const tris = Array.from(remapped);

  // ── boundary loops of the cut sub-mesh (edges with exactly 1 triangle).
  //    EDGE-based walk (never reuses an edge): pinwheel junctions — a vertex
  //    shared by two openings — would splice separate loops together under a
  //    vertex-based walk (measured: the hem+collar rings merged into two
  //    bogus front/back snakes on the first v6 build).
  function boundaryLoops() {
    const edgeCount = new Map();
    const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
    const edgeList = [];
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = tris[t + e], b = tris[t + (e + 1) % 3];
        const k = edgeKey(a, b);
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
        edgeList.push([k, a, b]);
      }
    }
    const adj = new Map();
    for (const [k, a, b] of edgeList) {
      if (edgeCount.get(k) !== 1) continue;
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push([b, k]); adj.get(b).push([a, k]);
    }
    const usedEdge = new Set();
    const loops = [];
    for (const [k0, a0, b0] of edgeList) {
      if (edgeCount.get(k0) !== 1 || usedEdge.has(k0)) continue;
      usedEdge.add(k0);
      const loop = [a0, b0];
      let cur = b0, prev = a0;
      for (let guard = 0; guard < edgeList.length + 2; guard++) {
        const nbrs = (adj.get(cur) ?? []).filter(([v, k]) => !usedEdge.has(k));
        let pick = nbrs.find(([v]) => v !== prev);
        if (!pick) pick = nbrs[0];
        if (!pick) break;
        usedEdge.add(pick[1]);
        if (pick[0] === a0) break;
        loop.push(pick[0]);
        prev = cur; cur = pick[0];
      }
      if (loop.length >= 8) loops.push(loop);
    }
    return loops;
  }

  // ── constructed-vert helper: nearest body vertex → weights + srcIndex ─────
  function nearestVertFactory(candidates) {
    const list = candidates; // [bodyVertIdx, ...]
    return (p) => {
      let best = list[0], bd = Infinity;
      for (const i of list) {
        const dx = P.getX(i) - p.x, dy = P.getY(i) - p.y, dz = P.getZ(i) - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
      return best;
    };
  }
  // body verts near a point (ring verts are always near their opening)
  const vertsNear = (centre, radius) => {
    const r2 = radius * radius;
    const outList = [];
    for (let i = 0; i < P.count; i++) {
      const dx = P.getX(i) - centre.x, dy = P.getY(i) - centre.y, dz = P.getZ(i) - centre.z;
      if (dx * dx + dy * dy + dz * dz < r2) outList.push(i);
    }
    return outList;
  };

  /** append a constructed vert; returns its index in the growing buffers */
  function addVert(p, normal, srcIdx, tintMul = 1) {
    pos.push(p.x, p.y, p.z);
    nrm.push(normal.x, normal.y, normal.z);
    for (let j = 0; j < 4; j++) {
      si4.push(SI.getComponent(srcIdx, j));
      sw4.push(SW.getComponent(srcIdx, j));
    }
    tint.push(tintMul, tintMul, tintMul);
    roles.push('ring');
    src.push(srcIdx);
    return pos.length / 3 - 1;
  }
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const E1 = new THREE.Vector3(), E2 = new THREE.Vector3();
  function emitTri(a, b, c, refDir) {
    A.fromArray(pos, a * 3); B.fromArray(pos, b * 3); C.fromArray(pos, c * 3);
    E1.subVectors(B, A); E2.subVectors(C, A);
    const cr = new THREE.Vector3().crossVectors(E1, E2);
    if (cr.dot(refDir) < 0) tris.push(a, c, b);
    else tris.push(a, b, c);
  }

  const loops = boundaryLoops();
  const openingsReport = [];
  for (const opening of plan.openings) {
    // ── the opening's cut boundary as a POLYLINE SEGMENT of the boundary
    //    loops. At bind the arm pulls away from the torso and the legs part,
    //    so a garment's openings are not isolated loops — they are runs of
    //    near-plane verts inside longer boundary loops whose remaining arcs
    //    run up the underarm / inter-leg seams (which close visually when the
    //    live pose brings the limbs back beside the body).
    const near2 = (vi) => {
      A.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      return Math.abs(A.clone().sub(opening.P).dot(opening.n)) <= opening.tol * 2.5;
    };
    let poly = null, polyScore = -Infinity;
    for (const loop of loops) {
      const n = loop.length;
      const nearArr = loop.map(near2);
      // rotate the walk to start at a far vert so no near-run straddles the
      // wrap; an all-near loop (fully closed ring) stays whole
      const start = nearArr.findIndex((v) => !v);
      const runs = [];
      let run = [];
      for (let k = 0; k < n; k++) {
        const idx = start < 0 ? k : (start + k) % n;
        if (nearArr[idx]) run.push(loop[idx]);
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) {
        if (runs.length && start >= 0) runs[0] = run.concat(runs[0]); // wrapped continuation
        else runs.push(run);
      }
      for (const r of runs) {
        if (r.length < 10) continue;
        // pick by ANCHOR PROXIMITY: mirrored limbs produce near-equal runs
        // (both legs, both sleeves) and "longest" is a coin flip that built
        // the left hem ring around the right leg's contour (measured 30 cm
        // radii). The opening's anchor names which limb this is.
        const c = new THREE.Vector3();
        for (const vi of r) c.add(new THREE.Vector3().fromArray(pos, vi * 3));
        c.divideScalar(r.length);
        const score = -c.distanceTo(opening.anchor) + r.length * 1e-5;
        if (score > polyScore) { poly = r; polyScore = score; }
      }
    }
    const polyLen = poly ? poly.length : 0;
    if (!polyLen) {
      openingsReport.push({ name: opening.name, matched: false, reason: 'no near-plane boundary run' });
      continue;
    }

    // polar centre = the opening's ANCHOR (the spine/limb AXIS point on the
    // plane). The boundary polyline's centroid is NOT a valid pole: the
    // underarm seam arcs join the hem run and drag the centroid off-axis
    // (measured z −7.6 cm), the cross-section stops being star-shaped from
    // the pole, and the sampled ring pinches (radii down to 3 cm).
    const centre = opening.anchor.clone();
    const { e1, e2 } = planeBasis(opening.n);
    const angOf = (p) => {
      const dx = p.x - centre.x, dy = p.y - centre.y, dz = p.z - centre.z;
      return Math.atan2(dx * e2.x + dy * e2.y + dz * e2.z, dx * e1.x + dy * e1.y + dz * e1.z);
    };

    // ring layout per kind: [dCm along dropDir, extraMm at that ring]
    let layout;
    if (opening.kind === 'collar') {
      const h = (opening.ribHcm ?? DERIVED_SPEC.collarRibHcm) / 3;
      layout = [
        { dCm: 0, extra: 0 },
        { dCm: h, extra: opening.ribStepMm ?? DERIVED_SPEC.collarRibStepMm },
        { dCm: 2 * h, extra: 0 },
        { dCm: 3 * h, extra: opening.ribStepMm ?? DERIVED_SPEC.collarRibStepMm },
      ];
    } else if (opening.kind === 'lip') {
      layout = [
        { dCm: 0, extra: 0 },
        { dCm: opening.dropCm, extra: opening.bandExtraMm ?? DERIVED_SPEC.bandExtraMm },
      ];
    } else { // hem
      const bandH = opening.bandCm ?? DERIVED_SPEC.bandHcm;
      layout = [
        { dCm: 0, extra: 0 },
        { dCm: Math.max(0.4, opening.dropCm - bandH), extra: (opening.bandExtraMm ?? DERIVED_SPEC.bandExtraMm) * 0.45 },
        { dCm: opening.dropCm, extra: opening.bandExtraMm ?? DERIVED_SPEC.bandExtraMm },
      ];
    }

    // each ring samples the body contour AT ITS OWN HEIGHT (tracks taper);
    // the nearest-body-vert weight source is built once per opening
    const S = ctx.ringSamples;
    const nearest = nearestVertFactory(vertsNear(centre, 0.45));
    const ringIdx = [];
    for (const lay of layout) {
      const Pk = opening.contourShift
        ? opening.contourShift(lay.dCm)
        : opening.P.clone().addScaledVector(opening.dropDir, lay.dCm * cm);
      const loopsK = planeLoops(geo, Pk, opening.n);
      const loopK = loopForOpening(loopsK, { ...opening, P: Pk });
      const prof = loopK
        ? polarProfile(loopK, centre, e1, e2, ctx.contourBins)
        : null;
      const row = [];
      for (let s = 0; s < S; s++) {
        const th = (s / S) * 2 * Math.PI;
        let pt, n2;
        if (prof) {
          const cp = contourPoint(prof, centre, e1, e2, th);
          pt = cp.p; n2 = cp.n2;
        } else {
          // degenerate fallback: circle from the boundary loop's mean radius
          const rr = poly.reduce((a2, vi) => a2 + new THREE.Vector3().fromArray(pos, vi * 3).sub(centre).length(), 0) / poly.length;
          pt = centre.clone().addScaledVector(e1, Math.cos(th) * rr).addScaledVector(e2, Math.sin(th) * rr);
          n2 = pt.clone().sub(centre).setLength(1);
        }
        const sK = opening.flareCm !== undefined ? (lay.dCm / Math.max(1e-6, opening.dropCm)) : 0;
        const p = pt.clone()
          .addScaledVector(opening.dropDir, lay.dCm * cm)
          .addScaledVector(n2, (opening.gMm + lay.extra) * mm + (opening.flareCm ?? 0) * sK * cm);
        // v7 drape: the hem lips wrinkle too (full envelope at the opening) so
        // the zipper seam between the cut boundary and ring 0 stays smooth —
        // the boundary verts carry the same sin(kθ) at env 1.
        if (opening.wrinkle) {
          const w = opening.wrinkle;
          p.addScaledVector(n2, w.ampMm * Math.sin(w.pleats * th + (w.phase ?? 0)) * mm);
          p.y -= w.sagMm * mm;
        }
        row.push(addVert(p, n2, nearest(pt), opening.tint ?? 1));
      }
      ringIdx.push(row);
    }

    // zipper: jagged (but level) cut boundary ↔ regular ring 0 — watertight
    const bAng = poly.map((vi) => ({ vi, ang: angOf(new THREE.Vector3().fromArray(pos, vi * 3)) }));
    bAng.sort((x, y) => x.ang - y.ang);
    const rAng = ringIdx[0].map((vi, s) => ({ vi, ang: (s / S) * 2 * Math.PI }));
    // rotate ring so rAng[0] is just BELOW bAng[0]
    let j0 = 0;
    for (let s = 0; s < S; s++) if (rAng[s].ang <= bAng[0].ang) j0 = s;
    const R = rAng.slice(j0).concat(rAng.slice(0, j0));
    const gap = (arr, i, n) => (i + 1 < n ? arr[i + 1].ang - arr[i].ang : arr[0].ang + 2 * Math.PI - arr[n - 1].ang);
    const annulusRef = opening.kind === 'collar'
      ? opening.n.clone()                       // collar annulus faces up
      : opening.n.clone().negate();             // hems face down (seen from below)
    let iB = 0, iR = 0;
    const nB = bAng.length, nR = R.length;
    while (iB < nB || iR < nR) {
      const advB = iB < nB ? gap(bAng, iB, nB) : Infinity;
      const advR = iR < nR ? gap(R, iR, nR) : Infinity;
      if (advB <= advR) {
        emitTri(bAng[iB % nB].vi, bAng[(iB + 1) % nB].vi, R[iR % nR].vi, annulusRef);
        iB++;
      } else {
        emitTri(bAng[iB % nB].vi, R[iR % nR].vi, R[(iR + 1) % nR].vi, annulusRef);
        iR++;
      }
    }
    // walls between consecutive rings (outward-facing quads; the outward ref
    // is the in-plane radial — the dropDir component is removed so horizontal
    // sleeve walls orient correctly too)
    for (let k = 0; k + 1 < ringIdx.length; k++) {
      const lo = ringIdx[k], hi = ringIdx[k + 1];
      for (let s = 0; s < S; s++) {
        const s2 = (s + 1) % S;
        const mid = new THREE.Vector3().fromArray(pos, lo[s] * 3)
          .add(new THREE.Vector3().fromArray(pos, hi[s] * 3)).multiplyScalar(0.5)
          .sub(centre);
        mid.addScaledVector(opening.dropDir, -mid.dot(opening.dropDir));
        if (mid.lengthSq() < 1e-9) mid.copy(e1);
        mid.normalize();
        emitTri(lo[s], lo[s2], hi[s2], mid);
        emitTri(lo[s], hi[s2], hi[s], mid);
      }
    }
    // construction-quality report: angular regularity of ring 0 (uniform by
    // construction — the lip's flare offset along the contour normal shifts
    // its angles smoothly and would mask the metric) + the ring vert ranges
    const lip = ringIdx[0];
    const lipAng = lip.map((vi) => angOf(new THREE.Vector3().fromArray(pos, vi * 3))).sort((a, b) => a - b);
    const dAng = lipAng.map((a, i2) => ((lipAng[(i2 + 1) % lip.length] - a) + 2 * Math.PI) % (2 * Math.PI));
    const mean = dAng.reduce((a2, b2) => a2 + b2, 0) / dAng.length;
    const varr = Math.sqrt(dAng.reduce((a2, b2) => a2 + (b2 - mean) ** 2, 0) / dAng.length) / mean;
    openingsReport.push({
      name: opening.name, matched: true, samples: S, rings: ringIdx.length,
      angVar: +varr.toFixed(4),
      ringStart: ringIdx[0][0], ringCount: ringIdx.length * S,
      lipStart: lip[0],
      // the ring's polar origin (bind space) + the body vert whose skin
      // weights carry it — angular regularity is uniform AROUND THIS CENTRE
      // by construction; measuring around any other point distorts.
      centreBind: [centre.x, centre.y, centre.z],
      centreSrc: nearest(new THREE.Vector3().copy(centre)),
    });
  }

  // ── watertight assertion: only TUCK loops may remain open ─────────────────
  const afterLoops = boundaryLoops();
  const openReport = afterLoops.map((loop) => {
    const c = new THREE.Vector3();
    for (const vi of loop) c.add(new THREE.Vector3().fromArray(pos, vi * 3));
    c.divideScalar(loop.length);
    return { n: loop.length, y: +c.y.toFixed(3) };
  });

  // degenerates (report only)
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  let degenerate = 0;
  for (let t = 0; t < tris.length; t += 3) {
    va.fromArray(pos, tris[t] * 3); vb.fromArray(pos, tris[t + 1] * 3); vc.fromArray(pos, tris[t + 2] * 3);
    if (new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).lengthSq() < 1e-14) degenerate++;
  }

  // bindDelta (probe truth): garment − SOURCE body vert, per vertex
  const bindDelta = new Float32Array(src.length * 3);
  for (let k = 0; k < src.length; k++) {
    bindDelta[k * 3] = pos[k * 3] - P.getX(src[k]);
    bindDelta[k * 3 + 1] = pos[k * 3 + 1] - P.getY(src[k]);
    bindDelta[k * 3 + 2] = pos[k * 3 + 2] - P.getZ(src[k]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(si4), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw4, 4));
  g.setIndex(tris);
  const m = new THREE.SkinnedMesh(g, mat);
  m.userData.rwfWardrobe = tag;
  m.userData.baseColors = Float32Array.from(tint);   // heat-off restore copy
  m.userData.rwfDerived = {
    body, srcIndex: Int32Array.from(src), bindDelta,
    regionVerts: count.region, frontierVerts: nBase - count.region,
    wrinkleCalls, wrinkleMagMaxUnits: +wrinkleMag.toFixed(5),
    tris: tris.length / 3, degenerate,
    roles,
    openings: openingsReport,
    tuckLoops: openReport,
  };
  m.frustumCulled = false;
  return m;
}

// ── the outfit ───────────────────────────────────────────────────────────────

/** Species heads ported from geno-wardrobe.js (founder-approved rigid
 *  bone-parented pieces) + their skin colour options. */
export const HEAD_SPECIES = ['none', 'frog', 'goblin', 'robot'];
export const FROG_SKINS = { green: '#4da33e', azure: '#3f9fae', sunset: '#cf8f3f' };

function removeSpeciesHead(avatar) {
  const doomed = [];
  avatar.prone.children[0].traverse((o) => {
    if (o.userData?.rwfWardrobe && String(o.userData.rwfWardrobe).startsWith('head:')) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
}

/**
 * Attach the skin-derived outfit (DEFAULT garment system for /atelier).
 * opts.head: HEAD_SPECIES entry (default 'frog' = frog WITH crown).
 * Returns the atelier outfit object: { slots, toggle, isVisible, softGarments,
 * rigidPieces, plan, mode:'derived', derived, setHead, head, updateFabric,
 * settle } — updateFabric/settle are no-ops (there is no sim).
 */
export function attachDerivedOutfit(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachDerivedOutfit: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);
  const S = DERIVED_SPEC;

  const colors = {
    shorts: OUTFIT_TOKENS.coral,
    // v7 FIX 2: the waistband is SOLID CHARCOAL. The old token-white
    // (#e8ebef) sits ~2ΔE from the body tint (#eceef1) — with the band's
    // 0.82–0.92 vertex tints over it, the strip read as FLESH ("same colour
    // as skin?"). Charcoal is unambiguous against BOTH the pale body and the
    // coral shorts (it is the founder-approved sneaker tone), and the band
    // now carries NO vertex tint — material colour only.
    waistband: OUTFIT_TOKENS.charcoal,
    tshirt: OUTFIT_TOKENS.lime,
    headband: OUTFIT_TOKENS.coral,
    wristbands: OUTFIT_TOKENS.lime,
    sneakers: OUTFIT_TOKENS.charcoal,
    ...(opts.colors || {}),
  };
  const lam = (color) => new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    vertexColors: true,           // band/rib tints live in the color attribute
    side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });

  removeSpeciesHead(avatar);     // idempotent re-attach
  const skin = genoSkin(avatar);
  const body = bodyMeshOf(skin);

  // TRUE model height: the body mesh's own bind bounding box. av.H (a live
  // bbox of the scene graph) measured three different values for the same
  // Geno across page states (2.53 / 1.96 / 1.71 — loadModel clones share and
  // re-bind skeletons, and the first caller animates the cached original);
  // every mm/cm constant and height fraction below is defined against the
  // BIND GEOMETRY, so the geometry's own bbox is the only honest scale.
  if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
  const H = body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y;
  const mm = unitPerMm(H), cm = unitPerCm(H);
  const plan = waistPlan(avatar, skin);

  // TRUE bind joints, in the body mesh's local (geometry) frame — from
  // skeleton.boneInverses, NOT the live pose: Geno's GLB loads with the arms
  // lowered while the skin's bind pose is an A-pose (arms ~45° out). Every
  // region predicate and cut plane below is evaluated against the GEOMETRY,
  // so the joints must be the bind ones or arm-space maths lands on the wrong
  // flesh (measured: the load pose put the "elbow" 12 cm from the bind elbow).
  skin.scene.updateMatrixWorld(true);
  const bindJoint = new Map();
  skin.skeleton.bones.forEach((b, i) => {
    bindJoint.set(b, new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().copy(skin.skeleton.boneInverses[i]).invert()));
  });
  const bp = (b) => bindJoint.get(b) ?? new THREE.Vector3();
  const hipsP = bp(B.hips), spineP = bp(B.spine), spine1P = B.spine1 ? bp(B.spine1) : null;
  const neckP = bp(B.neck);
  const armLs = bp(B.armL), armLe = bp(B.foreL), armRs = bp(B.armR), armRe = bp(B.foreR);
  const legLs = bp(B.upLegL), legLe = bp(B.legL), legRs = bp(B.upLegR), legRe = bp(B.legR);

  // per-vertex body data (needed by the neck profile below — declared early)
  const dom = dominantBones(body);
  const P = body.geometry.attributes.position;
  const vTmp = new THREE.Vector3();
  const yOf = (i) => P.getY(i);
  const DOWN = new THREE.Vector3(0, -1, 0);

  // heights (body-local y)
  // v7 FIX 1 — the collar line is the MEASURED NECK BASE, not a spine-top
  // heuristic. The old collarDropH cut 2.2%H below the Neck joint, which on
  // Geno lands ~4 cm down the trapezius shelf (measured: joint 147.8 cm,
  // narrow neck ring 150 cm r≈9.4 cm, flare starts ≈148.6 cm — the cut sat
  // at 143.9 cm, r≈17.6 cm = ON the shoulders). Profile the upper-torso
  // flesh around the hips→neck axis; the neck is the narrow cylinder near
  // the joint; the base is where the section flares past 1.28× that radius
  // walking DOWN. The ribbed band then rings the base and rises above it.
  const neckBaseY = (() => {
    const upperNames = new Set(['Neck', 'Neck1', 'Head', 'Spine3', 'Spine2', 'LeftShoulder', 'RightShoulder']);
    const upper = new Set();
    skin.skeleton.bones.forEach((b) => { if (upperNames.has(rawName(b.name))) upper.add(b); });
    const yLo = (B.spine2 ? bp(B.spine2).y : hipsP.y) + 0.04 * H;   // chest up
    const yHi = neckP.y + 0.045 * H;                                 // mid-neck up
    const NB = 36, bh = (yHi - yLo) / NB;
    const binR = new Array(NB).fill(0);
    const vv = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const b = skin.skeleton.bones[dom[i]];
      if (!b || !upper.has(b)) continue;
      vv.fromBufferAttribute(P, i);
      if (vv.y < yLo || vv.y >= yHi) continue;
      const t = (vv.y - hipsP.y) / ((neckP.y - hipsP.y) || 1);
      const ax = hipsP.x + (neckP.x - hipsP.x) * t, az = hipsP.z + (neckP.z - hipsP.z) * t;
      const bi = Math.min(NB - 1, Math.max(0, Math.floor((vv.y - yLo) / bh)));
      const r = Math.hypot(vv.x - ax, vv.z - az);
      if (r > binR[bi]) binR[bi] = r;
    }
    // neck radius: the narrowest section in the joint's neighbourhood
    const w0 = neckP.y - 0.008 * H, w1 = neckP.y + 0.03 * H;
    let neckR = Infinity;
    for (let b = 0; b < NB; b++) {
      const y = yLo + (b + 0.5) * bh;
      if (y >= w0 && y <= w1) neckR = Math.min(neckR, binR[b] || Infinity);
    }
    if (!isFinite(neckR) || neckR < 1e-4) neckR = 0.075;   // degenerate fallback
    const thr = neckR * 1.28;
    let base = neckP.y;                                // default: at the joint
    for (let b = NB - 1; b >= 0; b--) {                // walk DOWN from above
      const y = yLo + (b + 0.5) * bh;
      if (y <= neckP.y + 0.002 * H && binR[b] > thr) { base = y + bh * 0.5; break; }
    }
    const floor = (B.spine2 ? bp(B.spine2).y : hipsP.y) + 0.08 * H;
    return Math.min(neckP.y + 0.03 * H, Math.max(floor, base));
  })();
  const collarY = neckBaseY + S.collarRiseCm * cm;
  const bandTop = spineP.y - S.bandTopH * H;
  const bandBot = bandTop - S.bandHcmWaist * cm;
  const hipY = bandTop + S.shirtHemH * H;              // shirt region bottom
  const crotchY = hipsP.y - S.crotchH * H;
  const chestP = B.spine2 ? bp(B.spine2) : (spine1P ?? neckP);
  const chestY = Math.min(collarY - 1e-3, Math.max(hipY + 1e-3, chestP.y)); // grade anchor, inside (hipY, collarY)

  // graded offsets (mm) — height-parameterised slack: looser lower
  const shirtMm = (y) => {
    if (y <= chestY) return S.shirt.collarMm + (S.shirt.chestMm - S.shirt.collarMm) * (y - collarY) / (chestY - collarY);
    return S.shirt.chestMm + (S.shirt.hemMm - S.shirt.chestMm) * (y - chestY) / (hipY - chestY);
  };
  const shortsMm = (y) => S.shorts.waistMm + (S.shorts.hemMm - S.shorts.waistMm) * (bandTop - y) / (bandTop - legCutY());
  const bandMm = (y) => S.band.topMm + (S.band.bottomMm - S.band.topMm) * (bandTop - y) / (bandTop - bandBot);
  function legCutY() {
    return (legLs.y + S.thighT * (legLe.y - legLs.y) + legRs.y + S.thighT * (legRe.y - legRs.y)) / 2;
  }
  const legCut = legCutY();

  // ── limb envelopes (measured from the mesh, bind space) ──────────────────
  // The whole-triangle rule pulls frontier verts of NEIGHBOUR bones into the
  // garment (a deltoid vert past the sleeve cut is LeftShoulder-dominated).
  // Cut snapping is therefore GEOMETRIC: any garment vert inside a limb's
  // measured radial envelope and past the cut parameter snaps to the plane.
  const axisInfo = (a, b, p) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2;
    const cx = a.x + dx * Math.min(1, Math.max(0, t)), cy = a.y + dy * Math.min(1, Math.max(0, t)), cz = a.z + dz * Math.min(1, Math.max(0, t));
    return { t, r: Math.hypot(p.x - cx, p.y - cy, p.z - cz) };
  };
  const measureRadial = (boneNames, a, b, tLo, tHi) => {
    let max = 0;
    for (let i = 0; i < P.count; i++) {
      const n = rawName(skin.skeleton.bones[dom[i]].name);
      if (!boneNames.includes(n)) continue;
      const info = axisInfo(a, b, vTmp.fromBufferAttribute(P, i));
      if (info.t >= tLo && info.t <= tHi) max = Math.max(max, info.r);
    }
    return max;
  };
  const sleeveEnv = {
    1: measureRadial(['LeftArm', 'LeftForeArm', 'LeftShoulder'], armLs, armLe, 0.15, S.sleeveT) + 0.010,
    2: measureRadial(['RightArm', 'RightForeArm', 'RightShoulder'], armRs, armRe, 0.15, S.sleeveT) + 0.010,
  };
  const legEnv = {
    1: measureRadial(['LeftUpLeg', 'LeftLeg'], legLs, legLe, 0.2, S.thighT) + 0.012,
    2: measureRadial(['RightUpLeg', 'RightLeg'], legRs, legRe, 0.2, S.thighT) + 0.012,
  };

  // ── region predicates (bind-geometry, dominant-bone — pose-independent) ──
  const inShirt = (i) => {
    const y = yOf(i);
    if (y < hipY || y > collarY + 0.002 * H) return false;
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (isTorsoBone(n)) return y <= collarY;
    if (n === 'Neck' || n === 'LeftShoulder' || n === 'RightShoulder') return y <= collarY;
    return false;
  };
  const sleeveOf = (i) => { // 0 = none, 1 = left, 2 = right (bind-axis t + envelope)
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n !== 'LeftArm' && n !== 'LeftForeArm' && n !== 'RightArm' && n !== 'RightForeArm') return 0;
    vTmp.fromBufferAttribute(P, i);
    const side = n.startsWith('Left') ? 1 : 2;
    // RAW axis parameter + radial envelope: segT alone CLAMPS to [0,1], which
    // made far-side flesh (the whole forearm, measured 456 verts) project at
    // t=0 onto the opposite arm's axis and join the region — v6's torn ends.
    const info = axisInfo(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, vTmp);
    if (info.t < -0.02 || info.t > S.sleeveT) return 0;
    if (info.r > sleeveEnv[side]) return 0;
    return side;
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
      const info = axisInfo(side === 1 ? legLs : legRs, side === 1 ? legLe : legRe, vTmp.fromBufferAttribute(P, i));
      return info.t <= S.thighT;
    }
    return false;
  };
  const inBand = (i) => inShorts(i) && yOf(i) >= bandBot;

  // ── v7 drape wrinkles (FIX 3) ─────────────────────────────────────────────
  // Low-frequency vertical pleats, PURELY GEOMETRIC at bind: radial
  // sin(pleats·θ) around the garment's own axis + a slight world-down sag
  // bias, amplitude deeper near the hem and fading to 0 at the collar and
  // the top seams. Baked into the constructed offset → skinning, Δsource and
  // the runtime cost are exactly what they were. θ uses the SAME planeBasis
  // + axis-anchor convention as the ring builders, so the cut boundary and
  // ring 0 wrinkle coherently and the zipper seam stays smooth.
  const WK = S.wrinkle;
  const envOf = (u) => Math.pow(Math.min(1, Math.max(0, u)), WK.envPow);
  const upBasis = planeBasis(UP.clone());               // torso/leg ring basis
  const sleeveBasis = { 1: planeBasis(armAxisV(1).clone().negate()), 2: planeBasis(armAxisV(2).clone().negate()) };
  const thetaAround = (p, centre, basis) => {
    const dx = p.x - centre.x, dy = p.y - centre.y, dz = p.z - centre.z;
    return Math.atan2(dx * basis.e2.x + dy * basis.e2.y + dz * basis.e2.z,
                      dx * basis.e1.x + dy * basis.e1.y + dz * basis.e1.z);
  };
  const armPointAt = (side, t) => new THREE.Vector3().lerpVectors(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, t);
  const legPointAt = (side, t) => new THREE.Vector3().lerpVectors(side === 1 ? legLs : legRs, side === 1 ? legLe : legRe, t);
  /** shirt wrinkle: sleeves by arm-axis t, torso by height (0 at collar →
   *  1 at hem). Writes the displacement (model units) into `out2`. */
  const shirtWrinkleAt = (i, nv, v, out2) => {
    out2.set(0, 0, 0);
    for (const side of [1, 2]) {
      const info = axisInfo(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, v);
      if (info.t < -0.05 || info.t > 1.1 || info.r > sleeveEnv[side]) continue;
      const env = envOf((info.t - 0.12) / Math.max(1e-4, S.sleeveT - 0.12));
      const th = thetaAround(v, armPointAt(side, info.t), sleeveBasis[side]);
      out2.addScaledVector(nv, WK.sleeveAmpMm * env * Math.sin(WK.sleevePleats * th) * mm);
      out2.y -= WK.sleeveSagMm * env * mm;
      return;
    }
    // NOTE: the span is SIGNED (collarY > hipY) — write both terms the same
    // way round, never Math.max-clamp the denominator (a negative span clamped
    // to +1e-4 zeroed this envelope for the whole torso in the first v7 build)
    const env = envOf((collarY - v.y) / Math.max(1e-4, collarY - hipY));
    const th = thetaAround(v, spineAnchor(v.y), upBasis);
    out2.addScaledVector(nv, WK.shirtAmpMm * env * Math.sin(WK.shirtPleats * th + 0.35) * mm);
    out2.y -= WK.shirtSagMm * env * mm;
  };
  /** shorts wrinkle: 0 at the waistband → full at the leg hems; legs around
   *  their own axis, pelvis around the spine axis. */
  const shortsWrinkleAt = (i, nv, v, out2) => {
    out2.set(0, 0, 0);
    const env = envOf((bandTop - v.y) / Math.max(1e-4, bandTop - legCut));
    const side = sideOfLeg(i);
    const th = side
      ? thetaAround(v, legPointAt(side, 0.5), upBasis)
      : thetaAround(v, spineAnchor(v.y), upBasis);
    out2.addScaledVector(nv, WK.shortsAmpMm * env * Math.sin(WK.shortsPleats * th + 1.1) * mm);
    out2.y -= WK.shortsSagMm * env * mm;
  };

  // ── openings (cut planes + regular-ring specs) ───────────────────────────
  const spineAnchor = (y) => new THREE.Vector3(hipsP.x + (neckP.x - hipsP.x) * ((y - hipsP.y) / (neckP.y - hipsP.y || 1)), y, hipsP.z + (neckP.z - hipsP.z) * ((y - hipsP.y) / (neckP.y - hipsP.y || 1)));

  const shirtOpenings = [
    { // shirt hem — level plane at the hip line, lip lands at the band top
      name: 'shirt-hem', kind: 'hem',
      P: new THREE.Vector3(0, hipY, 0), n: UP.clone(), dropDir: DOWN.clone(),
      dropCm: S.hemDropCm, flareCm: S.hemFlareCm, gMm: S.shirt.hemMm,
      anchor: spineAnchor(hipY), tol: 0.9 * cm, tint: S.bandTint,
      wrinkle: { pleats: WK.shirtPleats, ampMm: WK.shirtAmpMm, sagMm: WK.shirtSagMm, phase: 0.35 },
    },
    { // collar — level plane at the MEASURED NECK BASE (v7); ribbed rings
      // rise above it and ring the neck. No wrinkle: the collar is a snug
      // elastic band (amplitude fades to 0 here by the envelope anyway).
      name: 'shirt-collar', kind: 'collar',
      P: new THREE.Vector3(0, collarY, 0), n: UP.clone(), dropDir: UP.clone(),
      ribMm: S.collarRibMm, gMm: S.collarRibMm,
      anchor: new THREE.Vector3(neckP.x, collarY, neckP.z), tol: 0.9 * cm, tint: S.ribTint,
    },
  ];
  for (const side of [1, 2]) {
    const ax = armAxisV(side), P0 = armPlaneP(side);
    shirtOpenings.push({
      name: side === 1 ? 'sleeve-hem-L' : 'sleeve-hem-R', kind: 'hem',
      P: P0.clone(), n: ax.clone().negate(), dropDir: ax.clone(),
      dropCm: S.sleeveDropCm, flareCm: S.sleeveFlareCm, gMm: S.sleeve.hemMm,
      anchor: P0.clone(), tol: 0.9 * cm, tint: S.bandTint,
      wrinkle: { pleats: WK.sleevePleats, ampMm: WK.sleeveAmpMm, sagMm: WK.sleeveSagMm, phase: 0 },
    });
  }
  const shortsOpenings = [1, 2].map((side) => ({
    name: side === 1 ? 'shorts-hem-L' : 'shorts-hem-R', kind: 'hem',
    P: new THREE.Vector3(0, legCut, 0), n: UP.clone(), dropDir: DOWN.clone(),
    dropCm: S.legDropCm, flareCm: S.legFlareCm, gMm: S.shorts.hemMm,
    anchor: new THREE.Vector3((side === 1 ? legLs : legRs).x, legCut, (side === 1 ? legLs : legRs).z),
    tol: 0.9 * cm, tint: S.bandTint,
    wrinkle: { pleats: WK.shortsPleats, ampMm: WK.shortsAmpMm, sagMm: WK.shortsSagMm, phase: 1.1 },
  }));
  const bandOpenings = [{
    name: 'band-lip', kind: 'lip',
    P: new THREE.Vector3(0, bandBot, 0), n: UP.clone(), dropDir: DOWN.clone(),
    dropCm: S.lipDropCm, gMm: S.band.bottomMm,
    anchor: spineAnchor(bandBot), tol: 0.9 * cm, tint: 1,   // v7: solid charcoal, untinted
  }];

  // ── per-vertex roles: graded offset + cut-plane snaps ────────────────────
  // Sleeve membership is GEOMETRIC (bind axis + measured radial envelope):
  // frontier verts past the cut are often Shoulder/ForeArm-dominated, and a
  // bone-name test would leave them dangling past the plane (the v5 teeth).
  const snapY = (yPlane) => (p) => new THREE.Vector3(p.x, yPlane, p.z);
  const snapPlane = (P0, n) => (p) => {
    const d = p.clone().sub(P0).dot(n);
    return p.clone().addScaledVector(n, -d);
  };
  function armAxisV(side) { return new THREE.Vector3().subVectors(side === 1 ? armLe : armRe, side === 1 ? armLs : armRs).normalize(); }
  function armPlaneP(side) { return new THREE.Vector3().lerpVectors(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, S.sleeveT); }
  const shirtRole = (i) => {
    const p = vTmp.fromBufferAttribute(P, i);
    for (const side of [1, 2]) {
      const info = axisInfo(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, p);
      if (info.t < -0.05 || info.t > 1.1 || info.r > sleeveEnv[side]) continue;
      if (info.t > S.sleeveT) {
        return { kind: 'snap', offMm: S.sleeve.hemMm, snap: snapPlane(armPlaneP(side), armAxisV(side)) };
      }
      return { kind: 'region', offMm: S.sleeve.topMm + (S.sleeve.hemMm - S.sleeve.topMm) * (info.t / S.sleeveT) };
    }
    const y = yOf(i);
    if (y > collarY) return { kind: 'snap', offMm: S.shirt.collarMm, snap: snapY(collarY) };
    if (y < hipY) return { kind: 'snap', offMm: S.shirt.hemMm, snap: snapY(hipY) };
    return { kind: 'region', offMm: shirtMm(y) };
  };
  const shortsRole = (i) => {
    const p = vTmp.fromBufferAttribute(P, i);
    const y = yOf(i);
    if (y < legCut) {
      for (const side of [1, 2]) {
        const info = axisInfo(side === 1 ? legLs : legRs, side === 1 ? legLe : legRe, p);
        if (info.r <= legEnv[side] && info.t > -0.1 && info.t <= 1.1) {
          return { kind: 'snap', offMm: S.shorts.hemMm, snap: snapY(legCut) };
        }
      }
    }
    return { kind: 'region', offMm: shortsMm(y) };
  };
  const bandRole = (i) => {
    const y = yOf(i);
    if (y < bandBot) return { kind: 'snap', offMm: S.band.bottomMm, snap: snapY(bandBot) };
    return { kind: 'region', offMm: bandMm(y) };
  };

  // ── build (shirt torso + sleeves are ONE mesh — the armpit boundary is
  //    internal, nothing to close) ──────────────────────────────────────────
  const ctx = { mm, cm, ringSamples: S.ringSamples, contourBins: S.contourBins };
  const inShirtAll = (i) => inShirt(i) || sleeveOf(i) !== 0;
  // territories: fill triangle gaps where a region meets neighbour flesh on
  // shared surface (the 1.8 cm waistband strip missed 1R+2non-F triangles
  // otherwise — its top edge rendered as separate arcs with slits between)
  const shirtTerritory = (i) => {
    const y = yOf(i);
    if (y < hipY - 0.006 || y > collarY + 0.005) return false;
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (n.startsWith('LeftHand') || n.startsWith('RightHand')) return false;
    if (n.includes('Arm') || n.includes('Shoulder')) {
      const side = n.startsWith('Left') ? 1 : 2;
      const info = axisInfo(side === 1 ? armLs : armRs, side === 1 ? armLe : armRe, vTmp.fromBufferAttribute(P, i));
      return info.t <= S.sleeveT + 0.06 && info.r <= sleeveEnv[side] + 0.012;
    }
    return true; // torso flesh inside the y-band
  };
  const shortsTerritory = (i) => {
    const y = yOf(i);
    if (y > bandTop || y < crotchY - 0.008) return false;
    const n = rawName(skin.skeleton.bones[dom[i]].name);
    if (/Hand|Arm|Shoulder|Neck|Head/.test(n)) return false;
    const side = sideOfLeg(i);
    if (side) {
      const info = axisInfo(side === 1 ? legLs : legRs, side === 1 ? legLe : legRe, vTmp.fromBufferAttribute(P, i));
      return info.t <= S.thighT + 0.06 && info.r <= legEnv[side] + 0.012;
    }
    return true; // pelvis flesh inside the y-band
  };
  const bandTerritory = (i) => {
    const y = yOf(i);
    return y >= bandBot - 0.006 && y <= bandTop + 0.006
      && !/Hand|Arm|Shoulder|Neck|Head/.test(rawName(skin.skeleton.bones[dom[i]].name));
  };
  const shirtMesh = extractGarment(body, inShirtAll, { vertRole: shirtRole, openings: shirtOpenings, territory: shirtTerritory, wrinkleAt: shirtWrinkleAt }, 'tshirt', lam(colors.tshirt), ctx);
  const shortsMesh = extractGarment(body, inShorts, { vertRole: shortsRole, openings: shortsOpenings, territory: shortsTerritory, wrinkleAt: shortsWrinkleAt }, 'shorts', lam(colors.shorts), ctx);
  const bandMesh = extractGarment(body, inBand, { vertRole: bandRole, openings: bandOpenings, territory: bandTerritory }, 'waistband', lam(colors.waistband), ctx);
  for (const m of [shirtMesh, shortsMesh, bandMesh]) {
    skin.scene.add(m);
    m.bind(skin.skeleton, new THREE.Matrix4());
  }

  // v4 rigid pieces (founder-approved): skinned sneakers, headband, wristbands.
  const rigidEnv = { skin, cloud: bodyCloud(skin) };
  const sneakers = buildSneakers(avatar, colors, plan, rigidEnv);
  const headband = buildHeadband(avatar, colors);
  const wristbands = buildWristbands(avatar, colors);

  // ── species head (FIX 3): frog-with-crown default, rigid on the Head bone ─
  let headGroup = null;
  let headSpecies = 'none';
  let frogSkin = 'green';
  const slots = {
    tshirt: [shirtMesh],
    shorts: [shortsMesh],
    waistband: [bandMesh],
    sneakers,
    headband: [headband],
    wristbands,
    head: [],
  };
  function applyFrogSkin() {
    if (!headGroup || !headSpecies.startsWith('frog')) return;
    const skull = headGroup.children[0];
    if (skull?.isMesh && skull.material?.color) skull.material.color.set(FROG_SKINS[frogSkin] ?? FROG_SKINS.green);
  }
  function setHead(species) {
    removeSpeciesHead(avatar);
    headGroup = null;
    headSpecies = 'none';
    if (species && species !== 'none') {
      const sp = species === 'frog' ? 'frog-crown' : species; // frog = WITH crown
      headGroup = attachHead(avatar, sp);
      applyFrogSkin();
      headSpecies = species;
    }
    slots.head = headGroup ? [headGroup] : [];
    // a species head swallows the headband (its skull is wider than the band
    // ring) — hide it while a head is active; the crown is the decoration
    for (const h of slots.headband) h.visible = !headGroup;
    return headGroup;
  }
  setHead(opts.head ?? 'frog');

  const softGarments = [shirtMesh, shortsMesh, bandMesh, ...sneakers];
  const rigidPieces = [];
  for (const root of [headband, ...wristbands, ...(headGroup ? [headGroup] : [])]) {
    if (root.isMesh) rigidPieces.push(root);
    else root.traverse((o) => { if (o.isMesh) rigidPieces.push(o); });
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
        ringVerts: d.roles.filter((r) => r === 'ring').length,
        degenerate: d.degenerate,
        openings: d.openings,
        tuckLoops: d.tuckLoops,
      }];
    })),
    gradedOffsetsMm: {
      shirt: S.shirt, sleeve: S.sleeve, shorts: S.shorts, band: S.band,
      chestYH: +(chestY / H).toFixed(4),
    },
    head: { species: headSpecies, skin: frogSkin },
    heightsH: {
      collarY: +(collarY / H).toFixed(4), bandTop: +(bandTop / H).toFixed(4),
      bandBot: +(bandBot / H).toFixed(4), hipY: +(hipY / H).toFixed(4),
      legCutY: +(legCut / H).toFixed(4), crotchY: +(crotchY / H).toFixed(4),
      // v7 FIX 1: the neck-base measurement the collar is cut from
      neckBaseY: +(neckBaseY / H).toFixed(4), neckJointY: +(neckP.y / H).toFixed(4),
      collarCmAboveJoint: +((collarY - neckP.y) / cm).toFixed(2),
    },
    wrinkle: WK,
  };

  return {
    slots,
    mode: 'derived',
    head: { get species() { return headSpecies; }, get skin() { return frogSkin; } },
    setHead,
    setFrogSkin(name) { frogSkin = name; applyFrogSkin(); return frogSkin; },
    isVisible: (slot) => slots[slot]?.every((g) => g.visible) ?? true,
    softGarments,
    rigidPieces,
    plan,
    derived: { body, meshes: [shirtMesh, shortsMesh, bandMesh], stats },
    toggle(slot, on) {
      for (const g of slots[slot] ?? []) g.visible = !!on;
      if (slot === 'headband') for (const h of slots.headband) h.visible = !!on && !headGroup;
    },
    updateFabric() {},   // the garment IS skinned body surface — nothing to step
    settle() {},         // no drape to converge
  };
}

/** Remove derived garments (rwfWardrobe-tagged children of the body scene). */
export function clearDerived(avatar) {
  const doomed = [];
  avatar.prone.children[0].traverse((o) => {
    if (o.userData?.rwfDerived) doomed.push(o);
    if (o.userData?.rwfWardrobe && String(o.userData.rwfWardrobe).startsWith('head:')) doomed.push(o);
  });
  for (const o of doomed) o.parent?.remove(o);
}
