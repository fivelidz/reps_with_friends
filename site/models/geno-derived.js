// site/models/geno-derived.js — SKIN-DERIVED GARMENTS, v9.
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
// ── v8 (the founder's next note: "proper clothing separate fabric meshes")
// ────────────────────────────────────────────────────────────────────────────
//   • FABRIC MODE (default): the shirt and shorts are CONSTRUCTED garments
//     with their OWN ring-lattice topology — clothing patterns, not body
//     contours. Each ring is a REGULARISED section: the body's exact
//     cross-section is low-passed in polar coordinates (lats, pecs and the
//     spine groove smoothed away), lifted to dominate the raw flesh by the
//     graded offset in EVERY direction, and — below the chest — held at the
//     running max from the chest (real shirts hang STRAIGHT from the chest:
//     the side seam is near-vertical, no waist tuck). Sleeves are tapered
//     cylinders on the arm axis (+13→10 mm over the arm, not bicep-traced),
//     capped at the shoulder. Every fabric vert still copies skin weights
//     from its NEAREST body vert (srcIndex + bindDelta) — the Δsource gate
//     and the signed containment probe ride exactly the v7 machinery.
//   • FITTED MODE (fallback): the v7 body-triangle garments, verbatim.
//   • SHOES REBUILT (both modes): the v4 skinned sneakers are retired — the
//     upper is now the FOOT'S OWN TRIANGLES + 6.5 mm (wedge and toe tips
//     included by construction — the toe box ENCLOSES), and the sole is a
//     REAL slab: a flat bottom 8 mm under the foot, a perimeter wall that
//     wraps the ground outline (max-per-direction — the toe slab included)
//     8 mm proud of the upper, taller at the heel (counter) and toe box,
//     white against the charcoal upper.
//
// ── v9 (the founder's note: shoulder gaps · band gap · "fabrics should have
//     their own easy physics and flow") ───────────────────────────────────────
//   • SLEEVES REBUILT (defect 1, "invisible sections around the shoulders"):
//     the v8 sleeve's plane sections picked loops 'nearest' the arm axis —
//     near the shoulder the plane also cuts the TORSO and the merged/nearest
//     loop ballooned the root rings to 40-49 cm radius with half their
//     weights sourced from spine verts: the sleeve shredded at every pose.
//     v9 profiles the ARM CHAIN'S OWN FLESH (dominant-bone filtered, max
//     radial per θ bin along the axis), grades the offset with a ROOT TUCK
//     (4 mm at the joint — UNDER the torso tube's ~7-8 mm — rising to 12 mm
//     by t≈0.25), and sources weights from the arm chain only.
//   • SHORTS TUBE TOP TUCKED (defect 2, "invisible band under the band"):
//     v8's yTop = min(hipJoint + 3.2 cm, bandTop − 1 mm) took the hip branch
//     on Geno and left the tube top 5.6 cm BELOW the band bottom — a bare /
//     see-through strip under the charcoal band (a dark hole at squat). The
//     top rings now reach bandTop − 1 mm, inside the band shell, as designed.
//   • EASY FABRIC PHYSICS (the critical one): a lightweight secondary-motion
//     layer over the skinned base — per-vert spring-dampers on the FREE HEM
//     RINGS only (~770 verts), world-space, sag-biased, bounded ±3 cm, with
//     capsule push-out (the geno-cloth collider maths, minimally borrowed)
//     so hems never tunnel through the body. Dormant at rest (zero writes),
//     disabled under prefers-reduced-motion, converges via settle(s) for the
//     probe suites. See DERIVED_SPEC.physics + buildFabricPhysics.
//
// Slots: tshirt (torso + sleeves, one mesh) · shorts · waistband (solid
// charcoal, always proud) · head (SPECIES HEADS ported from geno-wardrobe.js:
// frog with crown by default, goblin/robot secondary) · sneakers (v8
// foot-derived) / headband / wristbands (founder-approved v4 pieces from
// geno-outfit.js).
// A species head swallows the headband — the headband auto-hides while a
// head is active (the crown is the head decoration).
//
// Self-contained and canonical for /atelier (default garment system).
// window-facing stats: attachDerivedOutfit(...).derived.stats.
//

import * as THREE from 'three';
import {
  OUTFIT_TOKENS, genoSkin, waistPlan,
  buildHeadband, buildWristbands,
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
  // v9 FIX 2c ("the band never reads at stand"): the v8 12/13 mm band face sat
  // between the shirt's snug hem lip (+11 mm) and the pelvis flap (+12 mm) —
  // a 0.3 mm z-fight the camera tilt resolved AGAINST the band, so the front
  // column read shirt→coral with no charcoal at all (pixel-measured). 15/16
  // puts the band face a decisive 4-5 mm in front of both: shirt lip →
  // CHARCOAL BAND → coral shorts, from any camera angle.
  band: { topMm: 15, bottomMm: 16 },                // decisively PROUD of the 10-12 mm neighbours
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
  lipDropCm: 1.6,        // waistband bottom lip drop (v8: 1.0→1.6 — the deeper lip
    //                         occludes the shorts-tube junction from above-cameras;
    //                         at 1.0 a sliver of belly read between lip and coral)
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
  // ── v8 FABRIC MODE — constructed garment topology ──────────────────────
  // The founder: "proper clothing separate fabric meshes". Rings of their
  // OWN topology; sections REGULARISED from the body cross-section (low-pass
  // in polar coords + a lift so the fabric dominates the flesh by the graded
  // offset in every direction); below the chest the section is the running
  // max from the chest — the shirt HANGS STRAIGHT, sides near-vertical.
  fabric: {
    torsoRings: 22, torsoSamples: 64,
    sectionPasses: 6,    // polar low-pass — kills pec/lats/groove detail (k≥6
    //                    harmonics), KEEPS the body's elliptic proportions
    hemFlareCm: 2.4,     // the lip must stand clear of the waistband — the band
    hemBandCm: 1.3,      // folded-hem band height (fabric)
    sleeveRings: 10, sleeveSamples: 48,
    sleeveTopMm: 13, sleeveHemMm: 10,   // +10–14 over the arm, tapering to hem
    sleeveFlareCm: 0.5,
    pelvisRings: 8, legRings: 9, legSamples: 48,
    legFlareCm: 1.5,
    gussetDropCm: 0.6,   // the pelvis shell's crotch-gusset lip
    gussetFlareCm: 0.8,
    // shoes (v8): the upper = the foot's own triangles + upperMm; the sole
    // = a real slab: flat bottom, perimeter wall around the ground outline
    // (max-per-direction), proud of the upper, wall taller at heel/toe.
    shoe: {
      upperMm: 6.5, soleThickMm: 8, soleRimMm: 8,
      shinH: 0.030,            // the ankle cut (×H above the Foot joint)
      collarDropCm: 1.0,       // the collar band rises above the cut
      collarMm: 4,
      wallHeelCm: 3.4, wallMidCm: 1.5, wallToeCm: 2.6,
      soleSamples: 40,
    },
    // v9 sleeves: ARM-HUGGING sections. The v8 sleeve sampled body plane∩
    // loops 'nearest' to the arm axis — near the shoulder the plane also
    // cuts the TORSO and the merged/nearest loop ballooned the root rings to
    // 40-49 cm radius (measured), sourcing half their weights from spine
    // verts: the sleeve shredded at every pose (the founder's "invisible
    // sections around the shoulders"). v9 profiles the ARM CHAIN'S OWN
    // flesh (dominant-bone filtered verts, max radial per θ bin, windowed
    // along the axis), grades the offset with a ROOT TUCK under the torso
    // tube (4 mm at the joint → 12 mm by t≈0.25), and sources weights from
    // the arm chain only — the sleeve rides the arm through every clip.
    sleeve: {
      rootT: -0.02,          // start slightly ABOVE the joint — dive under the torso tube
      rootMm: 4,             // tucked UNDER the torso tube's ~7-8 mm at the deltoid
      fullMm: 12,            // full stand-off by tFull
      tFull: 0.25,
      windowT: 0.12,         // arm-flesh sampling window along the axis (×arm len)
      passes: 2,             // profile smoothing passes (arm flesh is near-regular)
      // v9.2: the local-contour window for the per-θ profile (×arm len, ±) —
      // bins with flesh this close to the station take the LOCAL max (the
      // ring hugs the station's own contour) instead of the wide-window max
      // (which ballooned the root's shoulder-top sector 11.3 cm off the flesh)
      localWinT: 0.015,
      // v9.2: verts with an arm-chain source within this radius source from
      // the ARM chain (same side of the joint → rigid under arm swings);
      // beyond it they fall back to nearest-overall. Generous (8 cm — half
      // the arm): an armpit-sector vert that fell back to a CHEST vert while
      // its ring neighbours sourced ARM verts put adjacent verts on opposite
      // sides of the shoulder joint — the garment edge between them tore to
      // 7-10 cm under arm swings (measured at swagger@0.25). Root verts are
      // exempt via srcPin (the snap parks them on purpose-chosen verts).
      preferArmCm: 8,
      // v9.3 ROOT SNAP-BLEND: ring points that would float (nearest body
      // vert past snapLoCm) blend onto that vert + the graded tuck, fully by
      // snapHiCm — the shoulder-void / armpit-bridge fix (see snapRootRing).
      // snapArmCm: the snap prefers ARM-CHAIN verts within this radius (one
      // limb per sleeve — cross-joint park/edge pairs tore 7-10 cm)
      snapLoCm: 1.5,
      snapHiCm: 3.5,
      snapArmCm: 7,
    },
  },
  // ── v9 EASY FABRIC PHYSICS ─────────────────────────────────────────────
  // The founder: "critically bad the fabrics should have their own easy
  // physics and flow." NOT the failed full-PBD rebuild — a lightweight
  // secondary-motion layer ON TOP of the skinned base:
  //   • Only the FREE HEM rings participate (shirt hem + sleeve hems +
  //     shorts leg hems — the last 3 rings of each opening, graded
  //     looseness 0.2 / 0.5 / 1.0; ~770 verts total).
  //   • Per-vert spring-damper toward the CPU-skinned target (critically-
  //     near damped, ζ≈0.65 → a gentle settle wobble after stops), plus a
  //     small world-down sag bias — fabric lags the stride ~1-3 cm, trails
  //     motion, settles within ~1 s of pausing.
  //   • Bounded: |P−S| ≤ maxDispCm·looseness (no stretch past the flare, the
  //     Δsource gates stay meaningful), and capsule push-out (the geno-cloth
  //     collider maths, minimally borrowed) keeps hems off the flesh — no
  //     tunnelling through the body.
  //   • Zero cost idle: dormant unless the driver bones moved; the page's
  //     dirty-flag discipline is untouched (physics reports "still moving"
  //     and the app renders only while it settles).
  //   • prefers-reduced-motion: reduce → disabled (pure skinned).
  physics: {
    // v9.1 tuning (measured): ω=√k, velocity-lag ≈ (2ζ/ω)·v. k=26 gave a
    // sleeve-hem clamp-ride at 2 cm but only ~0.6 cm of SHIRT-hem lag at
    // 0.25× slow-mo (the founder's tuning bar: "the shirt hem visibly
    // lags the stride ~1-2 cm"). k=16 → ω=4.0, coef 0.325 s → shirt hem
    // ≈ 0.8-1.0 cm at slow-mo, sleeves bounded by the 2 cm clamp.
    k: 16,                 // spring stiffness (ω≈4.0 → ~1.2 s settle)
    zeta: 0.65,            // damping ratio (<1: one soft overshoot on settle)
    sagG: 0.12,            // gravity gain — ~0.5 cm droop at loose 1 (more buries
    //                       the waistband behind the shirt hem — the band must read)
    maxDispCm: 2.0,        // hard clamp vs the skinned target — TRUE cm (v9.1:
    //                       3.0 construction-cm measured 3.59 true; the brief's
    //                       band is 1.5-2.5 — "subtle flow, not flags")
    hemHystCm: 0.12,       // displacement hysteresis before a vert counts as asleep
    sleepVelMs: 0.025,     // m/s — ≈0.4 mm/frame: below this the layer sleeps
    substepHz: 60,         // fixed physics substep (accumulator, ≤4 per frame)
    padCm: { thigh: 0.2, arm: 0.3, pelvis: 0.5 },   // collider inflation (slim: hems rest 1.5-3 cm off the flesh)
    ringLoose: [0.2, 0.5, 1.0],   // last-3-rings looseness gradient into the garment
  },
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

// ── FABRIC SECTIONS (v8) — clothing patterns, not body contours ──────────────

/** Circular [0.25, 0.5, 0.25] low-pass, `passes` times (in place semantics:
 *  returns a new Float32Array). */
function smoothCircular(src, passes) {
  const n = src.length;
  let a = Float32Array.from(src), b = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      b[i] = 0.25 * a[(i - 1 + n) % n] + 0.5 * a[i] + 0.25 * a[(i + 1) % n];
    }
    const t = a; a = b; b = t;
  }
  return a;
}

/** Plane cross-section of a geometry as a polar MAX profile around `centre`
 *  (exported for the atelier verify suites). `which`: 'nearest' — the loop
 *  whose centroid is nearest `centre` (the torso loop, not the arms the same
 *  plane also cuts); 'union' — max-per-bin over the loops whose centroid is
 *  within `maxC` of `centre` (bridges both thighs at the crotch: the shorts'
 *  pelvis shell covers the horseshoe — while the bind A-pose HANDS at 0.5
 *  units lateral stay excluded; the first v8 build swallowed them and put
 *  the pelvis tube 22 cm in front of the belly). */
export function sectionProfile(geo, P0, n, centre, e1, e2, bins, which = 'nearest', maxC = 0.30) {
  const loops = planeLoops(geo, P0, n);
  let use = loops;
  if (which === 'union') {
    const c = new THREE.Vector3();
    use = loops.filter((loop) => {
      c.set(0, 0, 0);
      for (const p of loop) c.add(p);
      c.divideScalar(loop.length);
      return c.distanceTo(centre) <= maxC;
    });
  } else if (loops.length > 1) {
    use = [loopForOpening(loops, { P: P0.clone(), n: n.clone(), anchor: centre, tol: 1e9 })].filter(Boolean);
  }
  const r = new Float32Array(bins);
  const w = new Uint8Array(bins);
  for (const loop of use) {
    for (const p of loop) {
      const dx = p.x - centre.x, dy = p.y - centre.y, dz = p.z - centre.z;
      const a = dx * e1.x + dy * e1.y + dz * e1.z;
      const b2 = dx * e2.x + dy * e2.y + dz * e2.z;
      const bi = Math.min(bins - 1, Math.max(0, Math.round((Math.atan2(b2, a) + Math.PI) / (2 * Math.PI) * bins))) % bins;
      const rad = Math.hypot(a, b2);
      if (rad > r[bi]) r[bi] = rad;
      w[bi] = 1;
    }
  }
  for (let i = 0; i < bins; i++) {   // fill empty bins from the nearest hit
    if (w[i]) continue;
    for (let k = 1; k < bins; k++) {
      const lo = (i - k + bins) % bins, hi = (i + k) % bins;
      if (w[lo] || w[hi]) { r[i] = w[lo] && w[hi] ? Math.max(r[lo], r[hi]) : (w[lo] ? r[lo] : r[hi]); break; }
    }
  }
  return r;
}

/** A FABRIC section: the raw section low-passed, then floored POINTWISE at
 *  raw + needU. Where the flesh is CONVEX (pec shelf, lats) the floor holds
 *  the fabric at the graded offset; where it is CONCAVE (spine groove,
 *  sternum dip, waist) the smoothed profile wins — fabric CANNOT dip into
 *  grooves, it bridges them. Net: the section reads as cloth draped over
 *  the body (its convex envelope + the offset), keeps the body's elliptic
 *  proportions (a circle-fit would balloon the front by 5 cm — measured on
 *  the first v8 build), and the delta to flesh never exceeds the graded
 *  offset + the smoothing lift at concavities (a few mm). */
function fabricSection(raw, needU, passes) {
  const sm = smoothCircular(raw, passes);
  const out = new Float32Array(sm.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(sm[i], raw[i] + needU);
  return out;
}

/** Interpolated radius of a binned profile at angle θ (same convention as
 *  contourPoint: bin k holds angle −π + k·2π/bins). */
function profAt(prof, th) {
  const bins = prof.length;
  const t = (((th + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const f = t / (2 * Math.PI) * bins;
  const i0 = Math.floor(f) % bins, i1 = (i0 + 1) % bins;
  return prof[i0] + (prof[i1] - prof[i0]) * (f - Math.floor(f));
}

/**
 * Ring-lattice garment builder — fabric meshes with their OWN topology.
 * `tubes`: [{ rings: [{ pts: [Vector3 × samples], c: ring centre, tint }],
 *   axis (for the outward quad refs + caps), cap?: { at: 0|'last', dir } }]
 * Every vert copies skin weights from its NEAREST body vert (recorded as
 * srcIndex; bindDelta is measured against it — the Δsource gate rides this).
 * Returns the SkinnedMesh with userData.rwfDerived in the v7 shape.
 */
function fabricLattice(body, tag, mat, tubes, srcRadius = 0.5) {
  const geo = body.geometry;
  const P = geo.attributes.position;
  const SI = geo.attributes.skinIndex;
  const SW = geo.attributes.skinWeight;
  const pos = [], si4 = [], sw4 = [], tint = [], src = [], roles = [];
  const tris = [];
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3();
  const R = new THREE.Vector3();
  const emitTri = (a, b, c, refDir) => {
    A.fromArray(pos, a * 3); Bv.fromArray(pos, b * 3); Cv.fromArray(pos, c * 3);
    const cr = new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(Cv, A));
    if (cr.lengthSq() < 1e-14) { skipped++; return; }   // capped-wall slivers (centreline cap)
    if (cr.dot(refDir) < 0) tris.push(a, c, b); else tris.push(a, b, c);
  };
  let skipped = 0;
  const ringStarts = [];   // per tube: [startIdx per ring]
  for (const tube of tubes) {
    // candidate body verts near this tube (nearest-weight sourcing)
    const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
    for (const ring of tube.rings) for (const p of ring.pts) { lo.min(p); hi.max(p); }
    lo.addScalar(-srcRadius); hi.addScalar(srcRadius);
    const cands = [];
    const prefCands = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (x < lo.x || x > hi.x || y < lo.y || y > hi.y || z < lo.z || z > hi.z) continue;
      if (tube.srcFilter && !tube.srcFilter(i)) continue;
      cands.push(i);
      if (!tube.srcPrefer || tube.srcPrefer(i)) prefCands.push(i);
    }
    // v9.1 PREFERRED SOURCING: try the preferred subset first and take it
    // when it lands within preferRadius — otherwise fall back to the full
    // candidate set. For the sleeves this keeps every vert that CAN source
    // from the arm chain sourced from it (a Spine3 source 7-8 cm away —
    // "nearest overall" near the shoulder joint — tore 4.4 cm apart from
    // the arm-riding ring at arms-overhead, Δsource gate + strain gate).
    const prefR2 = (tube.preferRadius ?? Infinity) ** 2;
    const nearest = (p) => {
      let best = 0, bd = Infinity;
      if (prefCands.length && prefCands.length !== cands.length) {
        for (const i of prefCands) {
          const dx = P.getX(i) - p.x, dy = P.getY(i) - p.y, dz = P.getZ(i) - p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bd) { bd = d2; best = i; }
        }
        if (bd <= prefR2) return best;
      }
      bd = Infinity;
      for (const i of cands) {
        const dx = P.getX(i) - p.x, dy = P.getY(i) - p.y, dz = P.getZ(i) - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
      return best;
    };
    const starts = tube.rings.map((ring) => {
      const s0 = pos.length / 3;
      const pinSet = tube.srcPin ? new Set(cands) : null;
      for (const p of ring.pts) {
        // v9.3 SRC PIN: a builder that PARKED a vert on a specific body vert
        // (the sleeve root snap) pins the sourcing to that vert — the
        // preferred-arm search would otherwise re-source it to an arm vert a
        // few cm away the snap just pulled it OFF, re-inflating the bind
        // offset the snap existed to kill.
        let k = -1;
        if (tube.srcPin) { const pk = tube.srcPin.get(p); if (pk !== undefined && pinSet.has(pk)) k = pk; }
        if (k < 0) k = nearest(p);
        pos.push(p.x, p.y, p.z);
        for (let j = 0; j < 4; j++) {
          si4.push(SI.getComponent(k, j));
          sw4.push(SW.getComponent(k, j));
        }
        const t = ring.tint ?? 1;
        tint.push(t, t, t);
        src.push(k);
        roles.push('ring');
      }
      return s0;
    });
    // optional intra-tube weight blur (v4 blurRingWeights precedent): the
    // first `blurTopN` rings of a tube blend each vert's skin weights with
    // its ring neighbours' — edges crossing a JOINT (the hip, for the shorts'
    // top rings) strain beyond the body's own when they sit on constructed
    // offsets; shared blended weights make the boundary behave like one
    // panel. Δsource still measures vs each vert's own src (recorded before
    // the blur — the blend is a ≤1-ring local average).
    if (tube.blurTopN > 1 && starts) {
      const S2 = tube.rings[0].pts.length;
      const blurRings = Math.min(tube.blurTopN, tube.rings.length - 1);
      const readW = (vi) => {
        const m = new Map();
        for (let j = 0; j < 4; j++) {
          const b = si4[vi * 4 + j], w = sw4[vi * 4 + j];
          if (w > 0.003) m.set(b, (m.get(b) ?? 0) + w);
        }
        return m;
      };
      for (let ri = 0; ri < blurRings; ri++) {
        for (let s = 0; s < S2; s++) {
          const acc = new Map();
          const collect = (vi) => { for (const [b, w] of readW(vi)) acc.set(b, (acc.get(b) ?? 0) + w); };
          for (const rN of [ri - 1, ri, ri + 1]) {
            if (rN < 0 || rN >= tube.rings.length) continue;
            collect(starts[rN] + s);
            collect(starts[rN] + (s + 1) % S2);
            collect(starts[rN] + (s - 1 + S2) % S2);
          }
          const sorted = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
          const sum = sorted.reduce((a2, [, w]) => a2 + w, 0) || 1;
          const vi = starts[ri] + s;
          for (let j = 0; j < 4; j++) {
            si4[vi * 4 + j] = sorted[j]?.[0] ?? 0;
            sw4[vi * 4 + j] = sorted[j] ? sorted[j][1] / sum : 0;
          }
        }
      }
    }
    // quads between consecutive rings (outward refs: in-plane radial)
    const axis = tube.axis ?? UP;
    for (let r2 = 0; r2 + 1 < tube.rings.length; r2++) {
      const S = tube.rings[r2].pts.length;
      const cMid = new THREE.Vector3().add(tube.rings[r2].c).add(tube.rings[r2 + 1].c).multiplyScalar(0.5);
      for (let s = 0; s < S; s++) {
        const s2 = (s + 1) % S;
        const a = starts[r2] + s, b = starts[r2] + s2;
        const c = starts[r2 + 1] + s2, d = starts[r2 + 1] + s;
        R.set(0, 0, 0).add(tube.rings[r2].pts[s]).add(tube.rings[r2 + 1].pts[s]).multiplyScalar(0.5).sub(cMid);
        R.addScaledVector(axis, -R.dot(axis));
        if (R.lengthSq() < 1e-12) R.copy(tube.rings[r2].c).sub(cMid).addScaledVector(axis, -(tube.rings[r2].c.clone().sub(cMid).dot(axis)));
        if (R.lengthSq() < 1e-12) R.set(1, 0, 0);
        R.normalize();
        emitTri(a, b, c, R);
        emitTri(a, c, d, R);
      }
    }
    // cap: fan a disc over the first/last ring (sleeve shoulder caps close
    // the tube end; the sole's bottom closes the slab flat)
    if (tube.cap) {
      const ri = tube.cap.at === 'last' ? tube.rings.length - 1 : 0;
      const ring = tube.rings[ri];
      const S = ring.pts.length;
      const c0 = new THREE.Vector3().copy(ring.c);
      const centreIdx = pos.length / 3;
      pos.push(c0.x, c0.y, c0.z);
      const k0 = nearest(c0);
      for (let j = 0; j < 4; j++) { si4.push(SI.getComponent(k0, j)); sw4.push(SW.getComponent(k0, j)); }
      tint.push(1, 1, 1); src.push(k0); roles.push('ring');
      for (let s = 0; s < S; s++) {
        emitTri(centreIdx, starts[ri] + s, starts[ri] + (s + 1) % S, tube.cap.dir);
      }
    }
    ringStarts.push(starts);
  }
  // degenerates (report)
  let degenerate = 0;
  for (let t = 0; t < tris.length; t += 3) {
    A.fromArray(pos, tris[t] * 3); Bv.fromArray(pos, tris[t + 1] * 3); Cv.fromArray(pos, tris[t + 2] * 3);
    if (new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(Cv, A)).lengthSq() < 1e-14) degenerate++;
  }
  const bindDelta = new Float32Array(src.length * 3);
  for (let k = 0; k < src.length; k++) {
    bindDelta[k * 3] = pos[k * 3] - P.getX(src[k]);
    bindDelta[k * 3 + 1] = pos[k * 3 + 1] - P.getY(src[k]);
    bindDelta[k * 3 + 2] = pos[k * 3 + 2] - P.getZ(src[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(si4), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw4, 4));
  g.setIndex(tris);
  g.computeVertexNormals();
  const m = new THREE.SkinnedMesh(g, mat);
  m.userData.rwfWardrobe = tag;
  m.userData.baseColors = Float32Array.from(tint);
  m.userData.rwfDerived = {
    body, srcIndex: Int32Array.from(src), bindDelta,
    regionVerts: 0, frontierVerts: 0,
    fabric: true, skippedTris: skipped,
    tris: tris.length / 3, degenerate,
    roles,
    openings: [],       // populated by the garment builders (finish rings)
    tuckLoops: [],
  };
  m.frustumCulled = false;
  return { mesh: m, ringStarts };
}

/** Ring point cloud from a polar profile + fabric finishes (pleats, sag,
 *  flare, bulge). All offsets are in MODEL UNITS. */
function fabricRingPts(c, e1, e2, prof, S, o = {}) {
  const pts = [];
  const dir = new THREE.Vector3();
  for (let s = 0; s < S; s++) {
    const th = (s / S) * 2 * Math.PI;
    const rr = profAt(prof, th);
    dir.set(0, 0, 0).addScaledVector(e1, Math.cos(th)).addScaledVector(e2, Math.sin(th)).normalize();
    const p = c.clone().addScaledVector(dir, rr);
    if (o.pleat && o.pleat.env > 0) {
      p.addScaledVector(dir, o.pleat.ampU * Math.sin(o.pleat.k * th + (o.pleat.phase ?? 0)) * o.pleat.env);
    }
    if (o.sagU) p.y -= o.sagU * (o.env ?? 1);
    if (o.flareU) p.addScaledVector(dir, o.flareU);
    if (o.bulgeU) p.addScaledVector(dir, o.bulgeU);
    pts.push(p);
  }
  return pts;
}

/** Opening report entry for a fabric finish (the hemCheck angVar + ringStart
 *  contract the v7 openings carry — centreSrc is the body vert whose skin
 *  weights sit nearest the opening's axis centre; hemCheck skins it live to
 *  aim its camera). Angles are measured IN THE RING'S OWN PLANE (e1,e2) —
 *  XZ-projection angles are meaningless on tilted (arm-axis) rings. */
function fabricOpening(name, centreSrc, centre, ringStart, rings, lipPts, c, e1, e2) {
  const angOf = (p) => {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    return Math.atan2(dx * e2.x + dy * e2.y + dz * e2.z, dx * e1.x + dy * e1.y + dz * e1.z);
  };
  const angs = lipPts.map(angOf).sort((a, b) => a - b);
  const gaps = angs.map((a, i) => ((angs[(i + 1) % angs.length] - a) + 2 * Math.PI) % (2 * Math.PI));
  const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((x, y) => x + (y - mean) ** 2, 0) / gaps.length) / mean;
  return {
    name, matched: true, samples: lipPts.length, rings, ringStart,
    angVar: +sd.toFixed(4), lipStart: ringStart,
    centreBind: [c.x, c.y, c.z], centreSrc,
  };
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

// ── v8 FABRIC BUILDERS — the constructed garments ────────────────────────────

/** Nearest body vertex to a point (full scan; used for opening centreSrc). */
function nearestBodyVert(body, p) {
  const P = body.geometry.attributes.position;
  let best = 0, bd = Infinity;
  for (let i = 0; i < P.count; i++) {
    const dx = P.getX(i) - p.x, dy = P.getY(i) - p.y, dz = P.getZ(i) - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; best = i; }
  }
  return best;
}

/**
 * FABRIC SHIRT — constructed topology: a ribbed collar ring stack, a torso
 * tube of REGULARISED sections (low-passed + dominated by the graded offset,
 * hung STRAIGHT from the chest: below the chest ring each section is the
 * running max from the chest — the side seam is near-vertical, no waist
 * tuck), a folded hem band with a flared lip, and tapered-cylinder sleeves
 * (+13→10 mm over the arm — never bicep-traced) capped at the shoulder.
 */
function buildFabricShirt(body, anc, mat) {
  const S = DERIVED_SPEC, F = S.fabric, WK = S.wrinkle;
  const bins = S.contourBins, ST = F.torsoSamples;
  const up = planeBasis(UP.clone());   // e1 ≈ +Z (depth), e2 ≈ +X (lateral)
  const envAt = (y) => anc.envOf((anc.collarY - y) / Math.max(1e-4, anc.collarY - anc.hemLipY));
  const pleatOf = (env) => ({ k: WK.shirtPleats, ampU: WK.shirtAmpMm * anc.mm, phase: 0.35, env });

  // ── torso sections: raw → fabric, then the straight hang below the chest
  const N = F.torsoRings;
  const yTop = anc.collarY, yPre = anc.hemLipY - F.hemBandCm * anc.cm;
  const ys = [];
  for (let i = 0; i < N; i++) ys.push(yTop + (yPre - yTop) * Math.pow(i / (N - 1), 1.25)); // crowd the collar
  const sectionAt = (y) => {
    const c = anc.spineAnchor(y);
    const raw = sectionProfile(body.geometry, new THREE.Vector3(c.x, y, c.z), UP, c, up.e1, up.e2, bins, 'nearest');
    return { c, raw, reg: fabricSection(raw, anc.shirtMm(y) * anc.mm, F.sectionPasses) };
  };
  const secs = ys.map(sectionAt);
  let chestIdx = 0, bestD = Infinity;
  for (let i = 0; i < N; i++) { const d = Math.abs(ys[i] - anc.chestY); if (d < bestD) { bestD = d; chestIdx = i; } }
  for (let i = chestIdx + 1; i < N; i++) {           // STRAIGHT HANG (running max from the chest)
    for (let b = 0; b < bins; b++) secs[i].reg[b] = Math.max(secs[i].reg[b], secs[i - 1].reg[b]);
  }

  // ── the ring stack (one tube: collar ribs → torso → hem band; no seams)
  const rings = [];
  for (let k = 0; k < 4; k++) {                       // ribbed collar (snug)
    const y = anc.collarY + k * (S.collarRibHcm / 3) * anc.cm;
    const s = sectionAt(y);
    const prof = fabricSection(s.raw, (S.collarRibMm + (k % 2 ? S.collarRibStepMm : 0)) * anc.mm, F.sectionPasses);
    rings.push({ pts: fabricRingPts(s.c, up.e1, up.e2, prof, ST), c: s.c, tint: S.ribTint });
  }
  for (let i = 0; i < N; i++) {                       // torso (pleated drape)
    const y = ys[i], env = envAt(y);
    rings.push({
      pts: fabricRingPts(secs[i].c, up.e1, up.e2, secs[i].reg, ST, {
        pleat: pleatOf(env), sagU: WK.shirtSagMm * anc.mm * env, env,
      }),
      c: secs[i].c,
    });
  }
  // The hem finish TAPERS from the hanging prism to a SNUG lip (+collar-class
  // offset at the lip, no flare): the waistband (proud 13 mm + its own
  // drooping +2.2 mm lip) then reads BELOW the shirt hem — v7's silhouette.
  // A prism-width lip (+18 mm) hides the band behind the shirt wall from any
  // camera above the waist (measured: the band-lip edge probe lost its
  // charcoal-with-coral-below transition entirely).
  const lipProf = secs[N - 1].reg;
  const snugAt = (y) => {
    const s = sectionAt(y);
    return fabricSection(s.raw, 0.011, F.sectionPasses);   // +11 mm at the lip
  };
  const hemFin = [
    { dCm: F.hemBandCm * 0.6, bulgeMm: 1.0, mix: 0.55 },
    { dCm: 0, bulgeMm: S.bandExtraMm, mix: 1 },
  ].map((f) => {
    const y = anc.hemLipY - f.dCm * anc.cm, env = envAt(y);
    const c = anc.spineAnchor(y);
    const snug = snugAt(y);
    const prof = new Float32Array(bins);
    for (let b = 0; b < bins; b++) prof[b] = lipProf[b] * (1 - f.mix) + snug[b] * f.mix;
    return {
      pts: fabricRingPts(c, up.e1, up.e2, prof, ST, {
        pleat: pleatOf(env), sagU: WK.shirtSagMm * anc.mm * env, env,
        bulgeU: f.bulgeMm * anc.mm,
      }),
      c,
    };
  });
  rings.push(...hemFin);

  // ── sleeves (v9): ARM-HUGGING tapered cones, capped at the shoulder with
  // the root TUCKED UNDER the torso tube. See DERIVED_SPEC.fabric.sleeve —
  // v8's plane-section 'nearest' loop ballooned near the shoulder (the
  // torso is in the plane too); v9 profiles the arm chain's own flesh.
  const SS = F.sleeveSamples;
  const SL = F.sleeve ?? {};
  const sleeveTubes = [];
  for (const side of [1, 2]) {
    const a0 = side === 1 ? anc.armLs : anc.armRs, a1 = side === 1 ? anc.armLe : anc.armRe;
    const ax = new THREE.Vector3().subVectors(a1, a0).normalize();
    const basis = planeBasis(ax.clone());
    const armLen = a0.distanceTo(a1);
    // the ARM CHAIN's own flesh (bind): dominant bone in this side's chain,
    // (θ, r, t) around the arm axis — sampled once, profiled per station
    const pfx = side === 1 ? 'Left' : 'Right';
    const chain = new Set([pfx + 'Shoulder', pfx + 'Arm', pfx + 'ForeArm']);
    // v9.3 PROFILE CHAIN = the ARM only (…Arm + …ForeArm). The …Shoulder bone's
    // flesh is the TRAPEZIUS — torso, not arm. At the root's medial sector the
    // plane also cuts the trap: with it in the chain, the per-θ max took the
    // trap's ~10.5 cm radius (no arm flesh at that θ locally) and pushed ring
    // pts down-medial into the armpit void, 11.3 cm from ANY surface vert
    // (measured) — the dome that sheared 4.4 cm of Δsource at arms-overhead
    // and strained root ring edges 10 cm past the body's own. A sleeve wraps
    // the arm; the torso tube owns the trap up to the collar.
    const profChain = new Set([pfx + 'Arm', pfx + 'ForeArm']);
    const fleshTR = [];   // { t, th, r }
    {
      const P2 = body.geometry.attributes.position;
      const d = new THREE.Vector3();
      for (let i = 0; i < P2.count; i++) {
        const n = rawName(anc.skin.skeleton.bones[anc.dom[i]].name);
        if (!profChain.has(n)) continue;
        d.fromBufferAttribute(P2, i).sub(a0);
        const t = d.dot(ax) / armLen;
        if (t < -0.3 || t > 0.9) continue;
        const aa = d.dot(basis.e1), bb = d.dot(basis.e2);
        fleshTR.push({ t, th: Math.atan2(bb, aa), r: Math.hypot(aa, bb) });
      }
    }
    /** max radial profile of the ARM flesh around the axis at station t. */
    const armProfile = (t) => {
      const c = new THREE.Vector3().lerpVectors(a0, a1, t);
      const prof = new Float32Array(bins), w = new Uint8Array(bins);
      // near the root the window TIGHTENS: the wide window's per-θ max makes
      // the ring proud of the LOCAL contour at some angles, the nearest
      // arm-chain source drifts centimetres away across the shoulder joint,
      // and extreme arm poses shear it (measured Δsource 5.5 cm at
      // jumpingjack@0.5 on the first v9 build)
      const win = t < 0.08 ? 0.05 : (SL.windowT ?? 0.12);
      // v9.2 LOCAL-CONTOUR: the per-θ MAX over the window still ballooned the
      // ROOT rings' shoulder-top sector — the trap/deltoid flare 3-4 cm UP the
      // axis set every station's radius, so rings 0-2 floated up to 11.3 cm
      // off the flesh (measured), shearing 4.4 cm of Δsource at arms-overhead
      // and straining root ring edges 10 cm past the body's own. A ring should
      // hug the station's OWN contour: bins with flesh inside a ±winLocal
      // window (~±0.5 cm along the axis) take the LOCAL max; only void bins
      // (the armpit hollow) fall back to the wide-window max.
      const winLocal = SL.localWinT ?? 0.015;
      const profL = new Float32Array(bins), wL = new Uint8Array(bins);
      for (const f of fleshTR) {
        const dt = Math.abs(f.t - t);
        if (dt > win) continue;
        const bi = Math.min(bins - 1, Math.max(0, Math.round((f.th + Math.PI) / (2 * Math.PI) * bins))) % bins;
        if (dt <= winLocal) { if (f.r > profL[bi]) profL[bi] = f.r; wL[bi] = 1; }
        if (f.r > prof[bi]) prof[bi] = f.r;
        w[bi] = 1;
      }
      for (let i = 0; i < bins; i++) {       // fill empty bins from the nearest hit
        if (wL[i]) { prof[i] = profL[i]; continue; }   // local contour wins
        if (w[i]) continue;
        for (let k = 1; k < bins; k++) {
          const lo = (i - k + bins) % bins, hi = (i + k) % bins;
          if (w[lo] || w[hi]) { prof[i] = w[lo] && w[hi] ? Math.max(prof[lo], prof[hi]) : (w[lo] ? prof[lo] : prof[hi]); break; }
        }
      }
      return smoothCircular(prof, SL.passes ?? 2);
    };
    /** graded offset (mm): root tuck 4 → full 12 by tFull, hem taper to 10. */
    const offMm = (t) => {
      const rootT = SL.rootT ?? -0.02, rootMm = SL.rootMm ?? 4, fullMm = SL.fullMm ?? 12, tFull = SL.tFull ?? 0.25;
      let v = rootMm + (fullMm - rootMm) * Math.min(1, Math.max(0, (t - rootT) / (tFull - rootT)));
      if (t > S.sleeveT) v = fullMm + (F.sleeveHemMm - fullMm) * Math.min(1, (t - S.sleeveT) / 0.12);
      return v;
    };
    const t0 = SL.rootT ?? -0.02, t1 = S.sleeveT;
    const profAtT = {};   // station cache (rings + fins share stations)
    const profOf = (t) => {
      const key = t.toFixed(4);
      if (!profAtT[key]) {
        const prof = armProfile(t);
        const add = offMm(t) * anc.mm;
        for (let b = 0; b < bins; b++) prof[b] += add;
        profAtT[key] = prof;
      }
      return profAtT[key];
    };
    const sRings = [];
    // v9.3 ROOT SNAP-BLEND: at the root a circle around the ARM axis cannot
    // hug the crescent of arm flesh at the shoulder joint — the medial half
    // has no arm surface (the ring centre sits 3.1 cm from ANY body vert; the
    // joint interior is a mesh void), and no radial clamping can fix that.
    // Real tees solve it the other way: the sleeve's root rides the SHOULDER
    // ITSELF. So each ring point that would FLOAT (nearest body vert beyond
    // snapLoCm) blends onto that vert + the graded tuck (out along the ring
    // plane); points already on the flesh keep their constructed position.
    // The weight is per-vert adaptive: the sleeve stays a constructed circle
    // wherever the circle is on-flesh (lateral deltoid), and rides the body
    // wherever the circle would float (medial shoulder, armpit line) — the
    // v5/v7 fitted construction exactly where it's needed, including the
    // armpit BRIDGE (a sleeve spanning the deltoid↔pec hollow is what a tee
    // does). Sources end up ≈ the tuck offset away (Δsource ~0 by shared
    // skinning), bridging edges ride body edges (strain ~body), and the root
    // tucks UNDER the torso tube at the medial sector (the dive-under).
    const snapLoU = (SL.snapLoCm ?? 1.5) * anc.cm;
    const snapHiU = (SL.snapHiCm ?? 3.5) * anc.cm;
    const BPc = body.geometry.attributes.position;
    const nearestBodyVertIdx = (p) => {
      let bd = Infinity, bi = 0;
      for (let i = 0; i < BPc.count; i++) {
        const dx = BPc.getX(i) - p.x, dy = BPc.getY(i) - p.y, dz = BPc.getZ(i) - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; bi = i; }
      }
      return bi;
    };
    // pins: every vert the snap parked on a body vert sources FROM that vert
    // (fabricLattice srcPin) — the arm-preferred search must not un-park it
    const snapPins = new Map();
    // ARM-FIRST snap target: prefer the nearest ARM-CHAIN vert within
    // snapArmCm — a vert the snap parks on a CHEST vert while its ring
    // neighbours ride ARM verts puts adjacent verts across the shoulder
    // joint and the edge between them tears under arm swings (measured 7 cm
    // on a 1.5 cm edge). One limb per sleeve, root to hem.
    const armCandIdx = [];
    {
      const P2 = body.geometry.attributes.position;
      for (let i = 0; i < P2.count; i++) {
        if (chain.has(rawName(anc.skin.skeleton.bones[anc.dom[i]].name))) armCandIdx.push(i);
      }
    }
    const snapArmU = (SL.snapArmCm ?? 7) * anc.cm;
    const nearestIn = (p, idxList) => {
      let bd = Infinity, bi = -1;
      for (const i of idxList) {
        const dx = BPc.getX(i) - p.x, dy = BPc.getY(i) - p.y, dz = BPc.getZ(i) - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd) { bd = d2; bi = i; }
      }
      return { bi, d: Math.sqrt(bd) };
    };
    const snapRootRing = (ring, t) => {
      const c = ring.c;
      const v = new THREE.Vector3(), dir = new THREE.Vector3(), target = new THREE.Vector3();
      const pts = ring.pts, S = pts.length;
      let snapped = 0;
      for (const p of pts) {
        // arm-first target, chest fallback for the deep void verts
        const arm = nearestIn(p, armCandIdx);
        const vi = arm.d <= snapArmU ? arm.bi : nearestBodyVertIdx(p);
        v.fromBufferAttribute(BPc, vi);
        const d = p.distanceTo(v);
        if (d <= snapLoU) continue;                    // on the flesh — keep the circle
        snapped++;
        const w = Math.min(1, (d - snapLoU) / (snapHiU - snapLoU));
        // tuck direction: outward in the RING PLANE (drop the axis component,
        // not world-Y — the sleeve rings are perpendicular to the arm axis)
        dir.subVectors(p, c).addScaledVector(ax, -dir.dot(ax));
        if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
        dir.normalize();
        target.copy(v).addScaledVector(dir, offMm(t) * anc.mm);
        p.lerp(target, w);
        snapPins.set(p, vi);
      }
      // SMOOTH the snapped ring (circular [0.25, 0.5, 0.25], 2 passes): the
      // per-vert snap lands on individual mesh verts — angular jitter that
      // read in the silhouette probe (shirt σ 0.015 → 0.018, no longer
      // smoother than the body). Relaxation keeps the ring's bulk on the
      // shoulder while ironing the vert-level scatter.
      if (snapped > 0) {
        const tmp = pts.map((p) => p.clone());
        for (let pass = 0; pass < 2; pass++) {
          const src2 = pass === 0 ? tmp : pts.map((p) => p.clone());
          for (let i = 0; i < S; i++) {
            const a = src2[(i - 1 + S) % S], b = src2[i], q = src2[(i + 1) % S];
            pts[i].set(
              0.25 * a.x + 0.5 * b.x + 0.25 * q.x,
              0.25 * a.y + 0.5 * b.y + 0.25 * q.y,
              0.25 * a.z + 0.5 * b.z + 0.25 * q.z);
          }
        }
      }
      return ring;
    };
    for (let i = 0; i < F.sleeveRings; i++) {
      const t = t0 + (t1 - t0) * i / (F.sleeveRings - 1);
      const u = (t - t0) / (t1 - t0);
      const c = new THREE.Vector3().lerpVectors(a0, a1, t);
      const env = anc.envOf(u);
      const ring = {
        pts: fabricRingPts(c, basis.e1, basis.e2, profOf(t), SS, {
          pleat: { k: WK.sleevePleats, ampU: WK.sleeveAmpMm * anc.mm, phase: 0, env },
          sagU: WK.sleeveSagMm * anc.mm * env, env,
        }),
        c,
      };
      // body rings ride the shoulder where they'd float; the FIN rings (the
      // visible hem lip) stay purely constructed
      sRings.push(snapRootRing(ring, t));
    }
    const dt = (S.sleeveDropCm * anc.cm) / armLen;   // drop along the arm axis
    const fin = [
      { d: 0.45, bulgeMm: 1.0, flareCm: F.sleeveFlareCm * 0.4 },
      { d: 1.0, bulgeMm: S.bandExtraMm, flareCm: F.sleeveFlareCm },
    ].map((f) => {
      const t = t1 + dt * f.d;
      const c = new THREE.Vector3().lerpVectors(a0, a1, t);
      const env = 1;
      return {
        pts: fabricRingPts(c, basis.e1, basis.e2, profOf(t), SS, {
          pleat: { k: WK.sleevePleats, ampU: WK.sleeveAmpMm * anc.mm, phase: 0, env },
          sagU: WK.sleeveSagMm * anc.mm, env,
          bulgeU: f.bulgeMm * anc.mm, flareU: f.flareCm * anc.cm,
        }),
        c,
      };
    });
    sRings.push(...fin);
    // weights from this side's arm chain + the SPINE chain: the arm surface
    // dominates as the nearest source down the sleeve (it rides the arm),
    // while the ROOT ring's chest/trap side (Spine-dominated flesh at the
    // shoulder) sources LOCALLY instead of from 7-11 cm across the joint —
    // cross-joint bind deltas sheared 5.5 cm at arms-overhead (measured).
    // The root is tucked UNDER the torso tube, which carries the same spine
    // weights — the two move together, no seam.
    const srcChain = new Set([...chain, 'Spine', 'Spine1', 'Spine2', 'Spine3']);
    const srcFilter = (i) => srcChain.has(rawName(anc.skin.skeleton.bones[anc.dom[i]].name));
    // v9.2 ARM-PREFERRED SOURCING (wiring the v9.1 srcPrefer machinery to the
    // sleeves — it was built for exactly this and never connected): every
    // vert that CAN source from the ARM CHAIN within ~4 cm does — same side
    // of the shoulder joint, so arm swings keep the offset rigid (the mid-
    // sleeve inner sector was sourcing chest verts across the joint and its
    // ring edges strained 4.3-4.5 cm past the body's own at walk/headshake —
    // measured). Only the root's chest-side sector (no arm flesh within the
    // radius) falls back to the nearest overall — LOCAL spine flesh, short
    // offset, and the torso tube carries the same weights (no seam).
    const srcPrefer = (i) => chain.has(rawName(anc.skin.skeleton.bones[anc.dom[i]].name));
    sleeveTubes.push({
      rings: sRings, axis: ax.clone(), cap: { at: 0, dir: ax.clone().negate() }, side,
      srcFilter, srcPrefer, preferRadius: (SL.preferArmCm ?? 8) * anc.cm, srcPin: snapPins,
    });
  }

  // v9.3 note: a torso limb filter (spine/neck/shoulder only) was tried here
  // and REVERTED — the chest wall's armpit sector then sourced 5-10 cm away
  // (the nearest torso-chain vert is across the trap), re-inflating Δsource
  // to 10.3 cm. Nearest-overall torso sourcing stays: its worst in-ring edge
  // (armpit sector, arm↔spine sources) strains ~3 cm past the body's own —
  // inside the v8 bar, and the pair's own body edge absorbs most of it.
  const { mesh, ringStarts } = fabricLattice(body, 'tshirt', mat, [
    { rings, axis: UP.clone() },
    ...sleeveTubes.map((t) => ({ rings: t.rings, axis: t.axis, cap: t.cap, srcFilter: t.srcFilter, srcPrefer: t.srcPrefer, preferRadius: t.preferRadius, srcPin: t.srcPin })),
  ], 0.4);

  // opening reports (hemCheck + the v7 collar probe contracts)
  const d = mesh.userData.rwfDerived;
  const cC = anc.spineAnchor(anc.collarY);
  const hemStart = ringStarts[0][4 + N];              // first hem finish ring
  const cHem = anc.spineAnchor(anc.hemLipY);
  const openings = [
    fabricOpening('shirt-collar', nearestBodyVert(body, cC), cC, 0, 4, rings[3].pts, cC, up.e1, up.e2),
    fabricOpening('shirt-hem', nearestBodyVert(body, cHem), cHem, hemStart, 2, rings[rings.length - 1].pts, cHem, up.e1, up.e2),
  ];
  sleeveTubes.forEach((t, ti) => {
    const starts = ringStarts[1 + ti];
    const lipRing = t.rings[t.rings.length - 1];
    const basis = planeBasis(t.axis.clone());
    openings.push(fabricOpening(t.side === 1 ? 'sleeve-hem-L' : 'sleeve-hem-R',
      nearestBodyVert(body, lipRing.c), lipRing.c, starts[starts.length - 2], 2, lipRing.pts, lipRing.c, basis.e1, basis.e2));
  });
  d.openings = openings;
  d.fabric = { torsoRings: N, samples: ST, chestIdx, sleeveRings: F.sleeveRings, sleeveSamples: SS,
    sleeveV9: { rootT: (SL.rootT ?? -0.02), armProfile: true, armWeightSource: true } };
  // v9 physics: the FREE hem rings (last 3 of each opening) get secondary
  // motion — graded looseness into the garment (see DERIVED_SPEC.physics).
  // `caps`: per-ring colliders — the torso hem hangs OVER the shorts (no
  // bare flesh to tunnel into), sleeves collide with their OWN arm capsule.
  const LO = S.physics.ringLoose;
  d.physRings = [
    { start: ringStarts[0][4 + N - 1], samples: ST, loose: LO[0], caps: [] },   // last torso ring
    { start: ringStarts[0][4 + N], samples: ST, loose: LO[1], caps: [] },       // hem finish 1
    { start: ringStarts[0][4 + N + 1], samples: ST, loose: LO[2], caps: [] },   // the lip
  ];
  // TUCK CLASS: the sleeve ROOT rings (t ≤ 0.05) sit under the torso tube
  // (deltoid + 4 mm vs the tube's +7-8 mm) — same hidden-by-construction
  // class as the shorts' tucked top; their cross-joint (Spine↔Arm) blends
  // shear at extreme arm poses and report as tuckDeltaCm, not the core gate.
  d.tuckRings = [];
  {
    const t0 = SL.rootT ?? -0.02, t1 = S.sleeveT;
    const rootRings = Math.max(1, Math.round((0.05 - t0) / ((t1 - t0) / (F.sleeveRings - 1))) + 1);
    sleeveTubes.forEach((t, ti) => {
      const starts = ringStarts[1 + ti];
      for (let ri = 0; ri < Math.min(rootRings, starts.length); ri++) {
        d.tuckRings.push({ start: starts[ri], samples: SS });
      }
    });
  }
  sleeveTubes.forEach((t, ti) => {
    const starts = ringStarts[1 + ti];
    const last = starts.length - 1;
    // no sleeve colliders: the sleeve rides ~100% on its arm's weights
    // (rigid with the arm — no relative motion to catch), and the
    // constructed ring profile can bulge past a percentile-fitted capsule
    // (armpit flesh in the max-per-bin profile, measured 11 cm off-axis)
    // which reads as permanent deep contact. Bounded by the ±3 cm clamp.
    d.physRings.push(
      { start: starts[last - 2], samples: SS, loose: LO[0], caps: [] },
      { start: starts[last - 1], samples: SS, loose: LO[1], caps: [] },
      { start: starts[last], samples: SS, loose: LO[2], caps: [] },
    );
  });
  return mesh;
}

/**
 * FABRIC SHORTS — a pelvis shell of UNION sections (bridges both thighs at
 * the crotch — the horseshoe covered, gusset lip at the bottom) plus one
 * STRAIGHT cylinder per leg (running max from the top of the thigh: no
 * thigh-taper trace) with folded, flared hems. Tucked under the waistband
 * and the shirt lip at the top. The waistband itself is unchanged (v7).
 */
function buildFabricShorts(body, anc, mat) {
  const S = DERIVED_SPEC, F = S.fabric, WK = S.wrinkle;
  const bins = S.contourBins;
  const LS = F.legSamples;
  const up = planeBasis(UP.clone());
  // ONE LEVEL-RING TUBE PER LEG (the v4 architecture, fabric topology):
  // rings are LEVEL sections around the leg's own centreline, dense through
  // the waist/hip zone (the wall hugs each height's own contour — sparse or
  // tilted rings let the belly bulge poke through: measured), the top rings
  // tucked INSIDE the waistband shell (coral meets charcoal with no gap),
  // the hem rings level at the v7 landing. NO bridging pelvis block: a panel
  // spanning both thighs sources weights from both legs and tears at a
  // stride (measured 13.7–19 cm edge strain), while pelvis-rigid weights
  // shear at folds (Δsource 5.9 cm). One tube per leg, same-limb weights:
  // strain−body ≈ 0 by construction. The crotch closes the v4 way — each
  // tube's inner wall is CAPPED just past the body centreline (x ∓1.5 cm),
  // the two tubes' inner walls OVERLAP at the centre front/back (the
  // centre-seam look of real shorts), and the open top is CAPPED (hidden
  // under the band — an open mouth shows the belly through the ring gap).
  const legLipY = anc.legCut - S.legDropCm * anc.cm;
  const envOfY = (y) => anc.envOf((anc.bandTop - y) / Math.max(1e-4, anc.bandTop - legLipY));
  // each tube sources weights from ITS leg's flesh ONLY (thigh + shin): the
  // centreline-capped verts sit over the crotch, where the nearest flesh is
  // the STABLE Hips/crotch — an edge between a crotch-sourced vert and its
  // thigh-sourced neighbour tears ~20 cm when the thigh swings at a stride
  // (measured 22 cm garment strain at sprint@0.75). One bone family per tube
  // = the tube rides its limb; verbatim weights keep Δsource ≈ 0.
  const boneNameOf = (i) => rawName(anc.skin.skeleton.bones[anc.dom[i]].name);
  const sameSideThigh = (side) => {
    const pfx = side === 1 ? 'Left' : 'Right';
    return (i) => {
      const n = boneNameOf(i);
      return n.startsWith(pfx + 'UpLeg') || n === pfx + 'Leg';
    };
  };
  const legTubes = [];
  for (const side of [1, 2]) {
    const l0 = side === 1 ? anc.legLs : anc.legRs, l1 = side === 1 ? anc.legLe : anc.legRe;
    // v9: EXTRAPOLATE past the joints (±35% of the thigh) — the v8 clamp
    // collapsed every waist ring above the hip joint onto l0's height
    // (rings 0-2 measured co-planar AT the joint), so the "tucked under the
    // band" top never rose past the hip: the tube top sat 5.4 cm below the
    // band bottom (the founder's gap strip).
    const legAnchor = (y) => {
      const t = (y - l0.y) / ((l1.y - l0.y) || 1);
      const tc = Math.min(1.35, Math.max(-0.35, t));
      return new THREE.Vector3().lerpVectors(l0, l1, tc);
    };
    const signX = Math.sign(l0.x) || 1;
    const boundX = -signX * 0.015;
    // v9 FIX ("invisible band under the band"): the top rings must reach UP
    // INSIDE the waistband shell (bandTop − 1 mm). The v8 code took
    // min(l0.y + 3.2 cm, bandTop − 0.1 cm) — for Geno the hip-joint branch
    // won and the tube top landed 5.6 cm BELOW the band bottom: a bare /
    // see-through strip under the charcoal band (4 cm at the waist, a dark
    // hole at squat when the thighs fold forward).
    const yTop = anc.bandTop - 0.1 * anc.cm;   // inside the band shell
    // DENSE stations through the waist/hip zone, sparser down the thigh
    const ys = [];
    {
      const waistLo = l0.y - 1.5 * anc.cm;
      for (let i = 0; i <= 5; i++) ys.push(yTop - (yTop - waistLo) * i / 5);
      const nThigh = F.legRings - 1;
      for (let i = 1; i <= nThigh; i++) ys.push(waistLo - (waistLo - legLipY) * i / nThigh);
    }
    const regs = ys.map((y) => {
      const c = legAnchor(y);
      const raw = sectionProfile(body.geometry, new THREE.Vector3(c.x, y, c.z), UP, c, up.e1, up.e2, bins, 'nearest');
      return fabricSection(raw, anc.shortsMm(y) * anc.mm, F.sectionPasses);
    });
    for (let i = 1; i < regs.length; i++) {          // STRAIGHT LEG (running max down)
      for (let b = 0; b < bins; b++) regs[i][b] = Math.max(regs[i][b], regs[i - 1][b]);
    }
    const ringAt = (prof, y, extra) => {
      const c = legAnchor(y);
      const env = envOfY(y);
      const pts = fabricRingPts(c, up.e1, up.e2, prof, LS, {
        pleat: { k: WK.shortsPleats, ampU: WK.shortsAmpMm * anc.mm, phase: 1.1, env },
        sagU: WK.shortsSagMm * anc.mm * env, env,
        bulgeU: (extra?.bulgeMm ?? 0) * anc.mm,
        flareU: (extra?.flareCm ?? 0) * anc.cm,
      });
      // the CENTRELINE CAP: pull any point that crosses the centre bound
      // back along its own in-plane radial (the inner wall is a wall).
      const dir = new THREE.Vector3();
      for (const p of pts) {
        if (signX * p.x > signX * boundX) continue;
        dir.subVectors(p, c);
        if (dir.lengthSq() < 1e-12) continue;
        dir.normalize();
        if (dir.x * signX >= 0) continue;            // pointing outward — no cap
        const rMax = (boundX - c.x) / dir.x;         // reach exactly the centre bound
        const r = p.distanceTo(c);
        if (r > rMax && rMax > 0) p.copy(c).addScaledVector(dir, rMax);
      }
      return { pts, c };
    };
    const rings = ys.map((y, i) => ringAt(regs[i], y));
    const fin = [
      { dCm: S.legDropCm * 0.4, bulgeMm: 1.0, flareCm: F.legFlareCm * 0.4 },
      { dCm: S.legDropCm, bulgeMm: S.bandExtraMm, flareCm: F.legFlareCm },
    ].map((f) => ringAt(regs[regs.length - 1], anc.legCut - f.dCm * anc.cm, f));
    rings.push(...fin);
    legTubes.push({ rings, side, srcFilter: sameSideThigh(side) });
  }

  const { mesh, ringStarts } = fabricLattice(body, 'shorts', mat,
    legTubes.map((t) => ({
      rings: t.rings, axis: UP.clone(), srcFilter: t.srcFilter, blurTopN: 6,
      cap: { at: 'first', dir: new THREE.Vector3(0, 1, 0) },
    })), 0.4);

  const d = mesh.userData.rwfDerived;
  const openings = legTubes.map((t, ti) => {
    const starts = ringStarts[ti];
    const lip = t.rings[t.rings.length - 1];
    return fabricOpening(t.side === 1 ? 'shorts-hem-L' : 'shorts-hem-R',
      nearestBodyVert(body, lip.c), lip.c, starts[starts.length - 2], 2, lip.pts, lip.c, up.e1, up.e2);
  });
  d.openings = openings;
  d.fabric = { legRings: F.legRings + 2, samples: LS, centreCapCm: 1.5, slantedTubes: true,
    tubeTopTucked: true };
  // the rings ABOVE the band bottom are TUCKED under the waistband shell +
  // the pelvis flap (hidden by construction): they source weights from the
  // thigh flesh several cm below, so deep folds shear them past the core
  // Δsource bar — the gate classifies them as tuckVerts (reported, bar'd
  // separately) instead of loosening the core gate.
  d.tuckRings = [];
  for (const t of legTubes) {
    const starts = ringStarts[legTubes.indexOf(t)];
    t.rings.forEach((ring, ri) => {
      let y = 0;
      for (const q of ring.pts) y += q.y;
      y /= ring.pts.length;
      if (y >= anc.bandBot) d.tuckRings.push({ start: starts[ri], samples: LS });
    });
  }
  // v9 physics: the leg-hem rings (last 3 per leg) — colliders: the leg's
  // OWN thigh capsule (the hem blends knee weights, so the knee bend has
  // relative motion to collide against; cross-leg checks false-positived
  // at the centreline caps on the first v9 builds).
  const LO = S.physics.ringLoose;
  d.physRings = [];
  legTubes.forEach((t, ti) => {
    const starts = ringStarts[ti];
    const last = starts.length - 1;
    const legCap = t.side === 1 ? 'LeftUpLeg' : 'RightUpLeg';
    d.physRings.push(
      { start: starts[last - 2], samples: LS, loose: LO[0], caps: [legCap] },
      { start: starts[last - 1], samples: LS, loose: LO[1], caps: [legCap] },
      { start: starts[last], samples: LS, loose: LO[2], caps: [legCap] },
    );
  });
  return mesh;
}

/**
 * v8 SNEAKERS — the v4 skinned rings retired. The upper is the FOOT'S OWN
 * TRIANGLES + 6.5 mm (the wedge and toe tips included by construction — the
 * toe box ENCLOSES, the heel is wrapped), cut at the ankle with an elastic
 * collar band; the sole is a REAL slab: flat bottom 8 mm under the foot, a
 * perimeter wall around the ground outline (max-per-direction — the toe slab
 * measured per axis) 8 mm proud of the upper, taller at the heel (counter)
 * and the toe box, white against the charcoal upper. All verts copy foot
 * flesh weights — the shoe bends with the foot through toe-off.
 */
function buildDerivedSneakers(body, anc, upperMat, soleMat) {
  const S = DERIVED_SPEC, SH = S.fabric.shoe;
  const geo = body.geometry;
  const P = geo.attributes.position;
  const sk = anc.skin;
  const out = [];
  for (const side of [1, 2]) {
    const footBone = side === 1 ? anc.B.footL : anc.B.footR;
    const toeBone = side === 1 ? anc.B.toeL : anc.B.toeR;
    if (!footBone || !toeBone) continue;
    const fp = anc.bp(footBone), tp = anc.bp(toeBone);
    const axis = new THREE.Vector3().subVectors(tp, fp);
    const Lf = axis.length(); axis.normalize();
    const sidePfx = side === 1 ? 'Left' : 'Right';
    // The region includes the LOWER SHIN (Leg bone) up to the cut: the whole-
    // triangle rule + territory can only extend a region by ONE ring of
    // triangles (a triangle joins only with a region vert in it), so the
    // calf flesh up to the collar line must be IN the region — that is also
    // honest: the collar wraps the ankle, the shoe ENDS at the cut.
    const isFootFlesh = (i) => {
      const n = rawName(sk.skeleton.bones[anc.dom[i]].name);
      return n === sidePfx + 'Foot' || n === sidePfx + 'Leg' || n.startsWith(sidePfx + 'Toe');
    };
    // unclamped axis parameter + radial distance from the infinite axis line
    const axisRaw = (p) => {
      const dx = p.x - fp.x, dy = p.y - fp.y, dz = p.z - fp.z;
      const t = (dx * axis.x + dy * axis.y + dz * axis.z) / (Lf || 1e-9);
      const cx = dx - axis.x * t, cy = dy - axis.y * t, cz = dz - axis.z * t;
      return { t, r: Math.hypot(cx, cy, cz) };
    };
    // measure the envelope from the foot's own verts (wedge + toe tips)
    let footEnv = 0, footMinY = Infinity, fwdMin = Infinity, fwdMax = -Infinity;
    const footPts = [];
    for (let i = 0; i < P.count; i++) {
      const n = rawName(sk.skeleton.bones[anc.dom[i]].name);
      if (n !== sidePfx + 'Foot' && !n.startsWith(sidePfx + 'Toe')) continue;   // foot bones only (envelope truth)
      const p = new THREE.Vector3().fromBufferAttribute(P, i);
      const info = axisRaw(p);
      if (info.t < -0.6 || info.t > 1.6) continue;
      footEnv = Math.max(footEnv, info.r);
      if (p.y < footMinY) footMinY = p.y;
      footPts.push(p);
    }
    footEnv += 0.012;                                // capture frontier strays (≈1.2 cm)
    const fwd = axis.clone(); fwd.y = 0; fwd.normalize();
    for (const p of footPts) {
      const f = (p.x - fp.x) * fwd.x + (p.z - fp.z) * fwd.z;
      fwdMin = Math.min(fwdMin, f); fwdMax = Math.max(fwdMax, f);
    }
    const shinCutY = fp.y + SH.shinH * anc.H;
    const v3 = new THREE.Vector3();

    // ── UPPER: the foot's own triangles + offset, collar at the ankle cut
    const inFoot = (i) => {
      if (!isFootFlesh(i)) return false;
      const p = v3.fromBufferAttribute(P, i);
      if (p.y > shinCutY + 0.012) return false;      // the shoe never covers the shin above the cut
      const info = axisRaw(p);
      return info.t >= -0.55 && info.t <= 1.55 && info.r <= footEnv;
    };
    const territory = (i) => {
      const p = v3.fromBufferAttribute(P, i);
      const info = axisRaw(p);
      if (info.t < -0.55 || info.t > 1.55 || info.r > footEnv + 0.012) return false;
      if (p.y > shinCutY || p.y < footMinY - 0.012) return false;
      return !/Hand|Arm|Head|Neck|Spine/.test(rawName(sk.skeleton.bones[anc.dom[i]].name));
    };
    const snapY = (yPlane) => (p) => new THREE.Vector3(p.x, yPlane, p.z);
    // the collar axis point: the foot axis (ankle→toe) points DOWN-forward —
    // extrapolating it to heights ABOVE the ankle lands 12 cm behind the heel
    // (measured: the collar ring locked onto a bogus loop out at z −0.27).
    // Heights above the ankle extrapolate along the SHIN axis (ankle→knee).
    const kneeP = side === 1 ? anc.legLe : anc.legRe;   // the Leg joint = the knee
    const axisPt = (y) => {
      if (y >= fp.y) {
        return new THREE.Vector3().lerpVectors(fp, kneeP, (y - fp.y) / ((kneeP.y - fp.y) || 1e-9));
      }
      return new THREE.Vector3().lerpVectors(fp, tp, (y - fp.y) / ((tp.y - fp.y) || 1e-9));
    };
    const collarAnchor = axisPt(shinCutY);
    const collar = {
      name: `shoe-collar-${side === 1 ? 'L' : 'R'}`, kind: 'hem',
      P: new THREE.Vector3(collarAnchor.x, shinCutY, collarAnchor.z), n: UP.clone(),
      dropDir: UP.clone(), dropCm: SH.collarDropCm, flareCm: -0.15, gMm: SH.collarMm,
      anchor: collarAnchor.clone(), tol: 0.9 * anc.cm, tint: 1,
    };
    const upper = extractGarment(body, inFoot, {
      vertRole: (i) => {
        const p = v3.fromBufferAttribute(P, i);
        if (p.y > shinCutY) {
          return { kind: 'snap', offMm: SH.upperMm, snap: snapY(shinCutY) };
        }
        // TOE BUMPER: a graded proud cap over the last stretch of the foot —
        // the toe box reads ENCLOSED (the v4 rings read 45–60% at the toes;
        // the bumper + the foot's own triangles fix it)
        const bump = 3.5 * Math.min(1, Math.max(0, (axisRaw(p).t - 0.72) / 0.5));
        return { kind: 'region', offMm: SH.upperMm + bump };
      },
      openings: [collar],
      territory,
    }, 'sneakers', upperMat, anc.ctx);
    out.push(upper);

    // ── SOLE: real slab — wall around the ground outline + flat bottom cap
    const lat = new THREE.Vector3().crossVectors(UP, fwd).normalize();
    const c0 = new THREE.Vector3();
    for (const p of footPts) c0.add(p);
    c0.divideScalar(footPts.length);
    const SS = SH.soleSamples;
    const outlineRaw = new Float32Array(SS);
    const ow = new Uint8Array(SS);
    for (const p of footPts) {
      const dx = p.x - c0.x, dz = p.z - c0.z;
      const a = dx * fwd.x + dz * fwd.z, b = dx * lat.x + dz * lat.z;
      const bi = Math.min(SS - 1, Math.max(0, Math.round((Math.atan2(b, a) + Math.PI) / (2 * Math.PI) * SS))) % SS;
      const rad = Math.hypot(a, b);
      if (rad > outlineRaw[bi]) outlineRaw[bi] = rad;
      ow[bi] = 1;
    }
    for (let i = 0; i < SS; i++) {
      if (ow[i]) continue;
      for (let k = 1; k < SS; k++) {
        const lo = (i - k + SS) % SS, hi = (i + k) % SS;
        if (ow[lo] || ow[hi]) { outlineRaw[i] = ow[lo] && ow[hi] ? Math.max(outlineRaw[lo], outlineRaw[hi]) : (ow[lo] ? outlineRaw[lo] : outlineRaw[hi]); break; }
      }
    }
    const outline = smoothCircular(outlineRaw, 3);
    const rim = SH.soleRimMm * anc.mm;
    // wall height profile: tall at the heel (counter) and toe box, low at the waist
    const hTopOf = (th) => {
      const ell = (Math.cos(th) + 1) / 2;            // 0 = heel direction, 1 = toe
      const seg = (a, b, ha, hb) => ha + (hb - ha) * Math.min(1, Math.max(0, (ell - a) / (b - a)));
      if (ell < 0.3) return seg(0, 0.3, SH.wallHeelCm, SH.wallMidCm);
      if (ell < 0.7) return SH.wallMidCm;
      return seg(0.7, 1, SH.wallMidCm, SH.wallToeCm);
    };
    const soleBottom = footMinY - SH.soleThickMm * anc.mm;
    const soleRing = (yOf, rAdj) => {
      const pts = [];
      for (let s = 0; s < SS; s++) {
        const th = (s / SS) * 2 * Math.PI;
        const dir = new THREE.Vector3().addScaledVector(fwd, Math.cos(th)).addScaledVector(lat, Math.sin(th)).normalize();
        const p = new THREE.Vector3(c0.x, 0, c0.z).addScaledVector(dir, profAt(outline, th) + rim + (rAdj ?? 0));
        p.y = yOf(th);
        pts.push(p);
      }
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;   // representative height (quad refs)
      return { pts, c: new THREE.Vector3(c0.x, cy, c0.z) };
    };
    const wallRings = [
      soleRing((th) => footMinY + hTopOf(th) * anc.cm, -0.001),   // lip, tucked under the upper
      soleRing(() => footMinY + 0.7 * anc.cm, 0),                 // mid wall
      soleRing(() => soleBottom, 0),                              // bottom edge (flat plane)
    ];
    const { mesh: sole } = fabricLattice(body, 'sneakers', soleMat,
      [{ rings: wallRings, axis: UP.clone(), cap: { at: 'last', dir: new THREE.Vector3(0, -1, 0) } }], 0.3);
    sole.userData.rwfDerived.fabric = { sole: true, samples: SS, rimMm: SH.soleRimMm, thickMm: SH.soleThickMm };
    out.push(sole);
  }
  return out;
}

// ── v9 EASY FABRIC PHYSICS ──────────────────────────────────────────────────
// Capsule colliders (the geno-cloth.js maths, minimally borrowed: bind-
// measured elliptical tapered capsules, boneA-transported frames, scaled-
// space pushout) + a per-vert spring-damper secondary-motion layer over the
// skinned base. See DERIVED_SPEC.physics for the tuning contract.

const _pq = new THREE.Quaternion();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pe1 = new THREE.Vector3(), _pe2 = new THREE.Vector3();
const _paxis = new THREE.Vector3();

/**
 * One capsule: segment boneA→boneB (param tA..tB), elliptical cross-section
 * measured at BIND from the body mesh (dominant-bone population, per-half
 * tapered radii at the 97th percentile, flesh-centroid offset — joints sit
 * at the back/off-axis of the flesh). Runtime frame transported by boneA.
 * boneSet: Set of bone indices whose verts populate the capsule (a limb
 * chain), or null for the all-bone lateral-capped mode (the torso chain —
 * excludes the A-pose hands via xMaxLat).
 */
function makePhysCapsule(body, dom, skeleton, boneA, boneB, aPos, bPos, tA, tB, boneSet, padU, xMaxLat, exclTest) {
  const axis = new THREE.Vector3().subVectors(bPos, aPos);
  const len = axis.length();
  if (len < 1e-5) return null;
  axis.divideScalar(len);
  let e1 = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x);
  if (e1.lengthSq() < 0.25) e1 = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
  const A = aPos.clone().addScaledVector(axis, tA * len);
  const Bp = aPos.clone().addScaledVector(axis, tB * len);
  const P = body.geometry.attributes.position;
  const rel = [], relT = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    if (boneSet) { if (!boneSet.has(dom[i])) continue; }
    else if (exclTest && exclTest(rawName(skeleton.bones[dom[i]].name))) continue;
    v.fromBufferAttribute(P, i);
    if (xMaxLat && Math.abs(v.x - aPos.x) > xMaxLat) continue;   // A-pose hands stay out
    const d = v.clone().sub(aPos);
    // NORMALISED axial parameter (tA/tB are 0..1 over the segment — the
    // first v9 builds compared raw units, the ±0.15 window covered the
    // whole limb and the 97th percentile ballooned the radii)
    const tn = d.dot(axis) / len / len;
    if (tn < tA - 0.15 || tn > tB + 0.15) continue;
    rel.push([d.dot(e1), d.dot(e2)]);
    relT.push(tn);
  }
  const halfStats = (tLo, tHi) => {
    const a1 = [], a2 = [];
    for (let k = 0; k < rel.length; k++) {
      if (relT[k] < tLo || relT[k] > tHi) continue;
      a1.push(Math.abs(rel[k][0])); a2.push(Math.abs(rel[k][1]));
    }
    const floor = 0.02;
    if (a1.length < 4) return { rx: floor, rz: floor };
    a1.sort((x, y) => x - y); a2.sort((x, y) => x - y);
    const q = (arr) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.97))];
    return { rx: Math.max(floor, q(a1)), rz: Math.max(floor, q(a2)) };
  };
  const mid = (tA + tB) / 2;
  const sA = halfStats(tA - 0.15, mid), sB = halfStats(mid, tB + 0.15);
  let m1 = 0, m2 = 0;
  if (rel.length >= 6) {
    for (const r of rel) { m1 += r[0]; m2 += r[1]; }
    m1 /= rel.length; m2 /= rel.length;   // centre on the flesh, not the joint
  }
  const centre = e1.clone().multiplyScalar(m1).addScaledVector(e2, m2);
  A.add(centre); Bp.add(centre);
  // anchor in the bone's BIND-LOCAL frame (skeleton.boneInverse), NOT
  // matrixWorld⁻¹: the runtime transport is matrixWorld·aLoc, and only the
  // bind-inverse makes that EXACTLY the skinning chain (matrixWorld⁻¹ pulls
  // the avatar root's transform in and the capsule rides a different frame
  // than the verts — measured 5-9 cm off on the third v9 build).
  const bi = skeleton.bones.indexOf(boneA);
  const invA = skeleton.boneInverses[bi];
  return {
    name: rawName(boneA.name),
    boneA,
    aLoc: A.clone().applyMatrix4(invA),
    bLoc: Bp.clone().applyMatrix4(invA),
    e1Loc: e1.clone().transformDirection(invA).normalize(),
    e2Loc: e2.clone().transformDirection(invA).normalize(),
    rxA: sA.rx, rzA: sA.rz, rxB: sB.rx, rzB: sB.rz,
    rx: Math.max(sA.rx, sB.rx), rz: Math.max(sA.rz, sB.rz),
    pad: padU,
    ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0,
    e1x: 1, e1y: 0, e1z: 0, e2x: 0, e2y: 0, e2z: 1,
    abx: 0, aby: 0, abz: 0, abLen2: 1,
    minx: 0, maxx: 0, miny: 0, maxy: 0, minz: 0, maxz: 0,
  };
}

/** World-space refresh of a capsule (boneA's current frame). */
function updatePhysCapsule(c) {
  _pa.copy(c.aLoc).applyMatrix4(c.boneA.matrixWorld);
  _pb.copy(c.bLoc).applyMatrix4(c.boneA.matrixWorld);
  c.ax = _pa.x; c.ay = _pa.y; c.az = _pa.z;
  c.bx = _pb.x; c.by = _pb.y; c.bz = _pb.z;
  c.abx = c.bx - c.ax; c.aby = c.by - c.ay; c.abz = c.bz - c.az;
  c.abLen2 = Math.max(1e-8, c.abx * c.abx + c.aby * c.aby + c.abz * c.abz);
  _paxis.set(c.abx, c.aby, c.abz).normalize();
  c.boneA.getWorldQuaternion(_pq);
  _pe1.copy(c.e1Loc).applyQuaternion(_pq);
  const d = _pe1.dot(_paxis);
  _pe1.addScaledVector(_paxis, -d);
  if (_pe1.lengthSq() < 1e-6) _pe1.set(0, 1, 0).addScaledVector(_paxis, -_paxis.y);
  _pe1.normalize();
  _pe2.crossVectors(_paxis, _pe1).normalize();
  c.e1x = _pe1.x; c.e1y = _pe1.y; c.e1z = _pe1.z;
  c.e2x = _pe2.x; c.e2y = _pe2.y; c.e2z = _pe2.z;
  const r = Math.max(c.rx, c.rz) + c.pad + 0.012;
  c.minx = Math.min(c.ax, c.bx) - r; c.maxx = Math.max(c.ax, c.bx) + r;
  c.miny = Math.min(c.ay, c.by) - r; c.maxy = Math.max(c.ay, c.by) + r;
  c.minz = Math.min(c.az, c.bz) - r; c.maxz = Math.max(c.az, c.bz) + r;
}

/** Scaled-space elliptical capsule pushout (3-4 fixed-point iterations land
 *  within 0.1 mm — measured in geno-cloth). Push written to `out`; returns
 *  push length (0 = free). */
function collidePhysCapsule(c, px, py, pz, out) {
  if (px < c.minx || px > c.maxx || py < c.miny || py > c.maxy || pz < c.minz || pz > c.maxz) return 0;
  let t = ((px - c.ax) * c.abx + (py - c.ay) * c.aby + (pz - c.az) * c.abz) / c.abLen2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = c.ax + c.abx * t, qy = c.ay + c.aby * t, qz = c.az + c.abz * t;
  const r1 = c.rxA + (c.rxB - c.rxA) * t + c.pad;
  const r2 = c.rzA + (c.rzB - c.rzA) * t + c.pad;
  const rMax = r1 > r2 ? r1 : r2;
  const a1 = px - qx, a2 = py - qy, a3 = pz - qz;
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
  const b1 = a1 * c.e1x + a2 * c.e1y + a3 * c.e1z;
  const b2 = a1 * c.e2x + a2 * c.e2y + a3 * c.e2z;
  out.x = (l1 - b1) * c.e1x + (l2 - b2) * c.e2x;
  out.y = (l1 - b1) * c.e1y + (l2 - b2) * c.e2y;
  out.z = (l1 - b1) * c.e1z + (l2 - b2) * c.e2z;
  return Math.hypot(out.x, out.y, out.z);
}

/**
 * The secondary-motion layer. `garments`: [{ mesh, rings: physRings }] —
 * each ring { start, samples, loose }. Springs run in WORLD space against
 * the CPU-skinned rest position; results bake back into the bind-space
 * position attribute (rest + invDominant·(P − S)) so the GPU skinning of
 * the displaced verts stays first-order exact. Dormant = zero writes.
 */
function buildFabricPhysics(root, skeleton, body, garments, allCapList, PH, unitPerMmU) {
  const capByName = new Map(allCapList.map((c) => [c.name, c]));
  const caps = allCapList;               // the frames of ALL are kept fresh
  const parts = [];
  for (const g of garments) {
    const mesh = g.isMesh ? g : g.mesh;    // accepts bare meshes or {mesh} specs
    const d = mesh.userData.rwfDerived;
    const rings = d.physRings ?? [];
    if (!rings.length) continue;
    const idx = [], loose = [], vcaps = [];
    for (const r of rings) {
      const rcaps = (r.caps ?? []).map((n2) => capByName.get(n2)).filter(Boolean);
      for (let i = 0; i < r.samples; i++) { idx.push(r.start + i); loose.push(r.loose); vcaps.push(rcaps); }
    }
    const GP = mesh.geometry.attributes.position;
    const n = idx.length;
    const rest = new Float32Array(n * 3);
    const domB = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      rest[k * 3] = GP.getX(idx[k]); rest[k * 3 + 1] = GP.getY(idx[k]); rest[k * 3 + 2] = GP.getZ(idx[k]);
      // dominant bone of the vert's copied weights
      const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
      const vi = idx[k];
      let b = 0, bw = -1;
      for (let j = 0; j < 4; j++) { const w = SW.getComponent(vi, j); if (w > bw) { bw = w; b = SI.getComponent(vi, j); } }
      domB[k] = b;
    }
    parts.push({
      mesh, GP, idx, loose, vcaps, rest, domB, n,
      vel: new Float32Array(n * 3), pushed: new Float32Array(n),
      S: new Float32Array(n * 3),          // skinned rest (world) — per frame
      P: new Float32Array(n * 3),          // sim position (world)
    });
  }
  const totalVerts = parts.reduce((a, p) => a + p.n, 0);

  // driver bones: any of these moving wakes the layer (hips/spine/limbs)
  const driverNames = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck',
    'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
    'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
  const drivers = driverNames
    .map((n2) => skeleton.bones.find((b) => rawName(b.name) === n2))
    .filter(Boolean);
  const driverPos = new Float32Array(drivers.length * 3);

  const state = {
    enabled: true, awake: false, verts: totalVerts,
    maxDispCm: 0, maxSpeedCmS: 0, sleepFrames: 0, settledAt: 0,
  };
  const omega = Math.sqrt(PH.k), damp = 2 * PH.zeta * omega;
  const h = 1 / PH.substepHz;
  // NOTE: unitPerMmU here is TRUE units-per-mm (H/1750, passed at the call
  // site) — NOT the construction's 0.001·1.75/H mm (which is calibrated for
  // H=1.75-unit models and runs 1.198× large on Geno's H=1.6; fine for the
  // approved garment offsets, wrong for a clamp that must read TRUE cm in
  // the probe conversions 175/H). ×1000 → units per metre.
  const maxDispU = PH.maxDispCm * 0.01 * unitPerMmU * 1000;   // cm → model units
  const sagU = PH.sagG * unitPerMmU * 1000;                   // m/s² → model/s²
  const hystU = PH.hemHystCm * 0.01 * unitPerMmU * 1000;
  const slopU = 0.014 * unitPerMmU * 1000;   // 1.4 cm collider slop
  const sleepVelU = PH.sleepVelMs * unitPerMmU * 1000;   // m/s → units/s (×units-per-METRE)
  let acc = 0;
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
  const push = new THREE.Vector3();
  const invByBone = new Map();    // boneIdx → Matrix4 inverse (per frame)

  function computeSkinning() {
    // fresh bone matrices (the exact shader maths — see skinnedVert)
    const M = skeleton.bones.map((b, i) =>
      new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skeleton.boneInverses[i]));
    invByBone.clear();
    for (const part of parts) {
      const SI = part.mesh.geometry.attributes.skinIndex;
      const SW = part.mesh.geometry.attributes.skinWeight;
      for (let k = 0; k < part.n; k++) {
        const x = part.rest[k * 3], y = part.rest[k * 3 + 1], z = part.rest[k * 3 + 2];
        let px = 0, py = 0, pz = 0;
        for (let j = 0; j < 4; j++) {
          const w = SW.getComponent(part.idx[k], j);
          if (w <= 0) continue;
          const m = M[SI.getComponent(part.idx[k], j)];
          if (!m) continue;
          const e = m.elements;
          px += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
          py += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
          pz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        part.S[k * 3] = px; part.S[k * 3 + 1] = py; part.S[k * 3 + 2] = pz;
      }
      for (let k = 0; k < part.n; k++) {
        const b = part.domB[k];
        if (!invByBone.has(b)) {
          _inv.copy(M[b]).invert();
          invByBone.set(b, _inv.clone());
        }
      }
    }
    return M;
  }

  /** per-frame world refresh: fresh capsule frames + skinned targets. The
   *  bones move while the layer is awake — a stale target makes the springs
   *  chase a ghost (measured 8.9 cm leak), and capsules that miss their
   *  world refresh sit at their origin-defaults and swallow whatever comes
   *  near (0,0,0) — the second v9 build bug. */
  function refreshWorld() {
    root.updateMatrixWorld(true);
    for (const c of caps) updatePhysCapsule(c);
    computeSkinning();
  }

  /** attach/re-attach the layer. `reset`: P=S (first-ever wake, or the
   *  probe settle path — deterministic convergence from rest). Otherwise P
   * persists: re-waking after a driver nudge must not pop the sag state. */
  function wakeInit(reset = false) {
    for (const part of parts) {
      if (reset || !part.inited) {
        for (let k = 0; k < part.n; k++) {
          part.P[k * 3] = part.S[k * 3]; part.P[k * 3 + 1] = part.S[k * 3 + 1]; part.P[k * 3 + 2] = part.S[k * 3 + 2];
        }
        part.vel.fill(0);
        part.inited = true;
      }
      // else: keep P/vel — the springs re-converge to the new targets
    }
    state.awake = true;
    state.sleepFrames = 0;
  }

  function wake() {
    refreshWorld();
    wakeInit();
  }

  function writeback() {
    for (const part of parts) {
      for (let k = 0; k < part.n; k++) {
        const inv = invByBone.get(part.domB[k]);
        _p.set(part.P[k * 3] - part.S[k * 3], part.P[k * 3 + 1] - part.S[k * 3 + 1], part.P[k * 3 + 2] - part.S[k * 3 + 2]);
        // LINEAR part only (rotation+scale): applyMatrix4 on a DISPLACEMENT
        // must not carry the inverse's translation (the bone origin — cm of
        // phantom offset, measured on the first v9 build)
        _d.copy(_p).applyMatrix4(inv);
        const e = inv.elements;
        _d.x -= e[12]; _d.y -= e[13]; _d.z -= e[14];
        part.GP.setXYZ(part.idx[k],
          part.rest[k * 3] + _d.x, part.rest[k * 3 + 1] + _d.y, part.rest[k * 3 + 2] + _d.z);
      }
      part.GP.needsUpdate = true;
    }
  }

  function restback() {   // dormant: exact constructed positions
    for (const part of parts) {
      for (let k = 0; k < part.n; k++) {
        part.GP.setXYZ(part.idx[k], part.rest[k * 3], part.rest[k * 3 + 1], part.rest[k * 3 + 2]);
      }
      part.GP.needsUpdate = true;
    }
  }

  function driversMoved() {
    let moved = false;
    for (let i = 0; i < drivers.length; i++) {
      drivers[i].getWorldPosition(_p);
      const dx = _p.x - driverPos[i * 3], dy = _p.y - driverPos[i * 3 + 1], dz = _p.z - driverPos[i * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > (0.0012 * unitPerMmU * 1000) ** 2) moved = true;
      driverPos[i * 3] = _p.x; driverPos[i * 3 + 1] = _p.y; driverPos[i * 3 + 2] = _p.z;
    }
    return moved;
  }

  let dbgMaxPush = 0;
  const dbgPushByName = {};
  let prevMaxDisp = 0;
  let dbgWorst = null;
  function substep() {
    let maxSpd = 0, maxDisp = 0;
    dbgMaxPush = 0;
    for (const k2 of Object.keys(dbgPushByName)) delete dbgPushByName[k2];
    for (const part of parts) {
      for (let k = 0; k < part.n; k++) {
        const k3 = k * 3;
        const sx = part.S[k3], sy = part.S[k3 + 1], sz = part.S[k3 + 2];
        let px = part.P[k3], py = part.P[k3 + 1], pz = part.P[k3 + 2];
        let vx = part.vel[k3], vy = part.vel[k3 + 1], vz = part.vel[k3 + 2];
        // spring toward the skinned target + gravity sag (world −Y)
        const fx = -PH.k * (px - sx);
        const fy = -PH.k * (py - sy) - sagU * part.loose[k];
        const fz = -PH.k * (pz - sz);
        vx += fx * h; vy += fy * h; vz += fz * h;
        const dv = Math.max(0, 1 - damp * h);
        vx *= dv; vy *= dv; vz *= dv;
        px += vx * h; py += vy * h; pz += vz * h;
        // bounded displacement vs the skinned target (the flare is the limit)
        const ddx = px - sx, ddy = py - sy, ddz = pz - sz;
        const dLen = Math.hypot(ddx, ddy, ddz);
        const maxD = maxDispU * part.loose[k];
        // TELEPORT SNAP: a clip seek (probe p.time jumps, setAnim swaps) can
        // move S by tens of cm in one frame — that is not fabric physics,
        // it is a discontinuity; springs chasing it read as a 45 cm "lag"
        // transient (measured on the first v9 verify run). Anything past
        // 2.5× the clamp snaps P onto S and forgets the velocity.
        if (dLen > 2.5 * maxD) {
          px = sx; py = sy; pz = sz;
          vx = 0; vy = 0; vz = 0;
        } else if (dLen > maxD && dLen > 1e-9) {
          const c2 = maxD / dLen;
          px = sx + ddx * c2; py = sy + ddy * c2; pz = sz + ddz * c2;
          // kill the outward radial velocity + damp the tangential creep
          // (a vert riding the clamp under the sag bias keeps a ~1.5 cm/s
          // tangential micro-oscillation alive forever without this)
          const rdot = ((px - sx) * vx + (py - sy) * vy + (pz - sz) * vz) / (maxD * maxD);
          if (rdot > 0) { vx -= rdot * (px - sx); vy -= rdot * (py - sy); vz -= rdot * (pz - sz); }
          vx *= 0.9; vy *= 0.9; vz *= 0.9;
        }
        // capsule pushout — hems never tunnel through the body (per-ring
        // collider masks: sleeves↔own arm, leg hems↔own thigh). SLOP: the
        // constructed rings ride 0-1 cm inside the 97th-pct collider in
        // places (max-per-bin section vs windowed percentile) — shallow
        // overlap is construction tolerance, NOT tunnelling; resting on it
        // made a permanent 4 cm contact equilibrium + jitter (measured).
        // Real incursions (≥ slop) resolve hard.
        let pushedThis = 0;
        for (const c of part.vcaps[k]) {
          const pushLen = collidePhysCapsule(c, px, py, pz, push);
          if (pushLen > dbgMaxPush) dbgMaxPush = pushLen;
          if (pushLen > (dbgPushByName[c.name] ?? 0)) dbgPushByName[c.name] = pushLen;
          // SOFT RAMP over the slop (0.7-1.3 ×): a hard threshold is a cliff
          // the verts chatter on forever (measured 1.2 cm/s limit cycle)
          if (pushLen > 0.7 * slopU) {
            const gain = Math.min(1, (pushLen - 0.7 * slopU) / (0.6 * slopU));
            px += push.x * gain; py += push.y * gain; pz += push.z * gain;
            pushedThis += pushLen * gain;
            const pl = push.length();
            if (pl > 1e-9) {
              const vn = (vx * push.x + vy * push.y + vz * push.z) / pl;
              if (vn < 0) { vx -= vn * gain * push.x / pl; vy -= vn * gain * push.y / pl; vz -= vn * gain * push.z / pl; }
              const cdm = 1 - 0.15 * gain;
              vx *= cdm; vy *= cdm; vz *= cdm;   // contact damping (kills resting-contact jitter)
            }
          }
        }
        part.pushed[k] = pushedThis;
        // STATIC FRICTION at contact: on a sloped capsule surface the sag's
        // tangential component sleds the vert at the damping-limited terminal
        // velocity forever (measured a constant 1.56 cm/s drift). Below the
        // sleep velocity while in contact, the vert STOPS.
        if (pushedThis > 0) {
          const v2 = vx * vx + vy * vy + vz * vz;
          const fk = sleepVelU * 0.8;
          if (v2 < fk * fk) { vx = 0; vy = 0; vz = 0; }
        }
        // v9.3 POST-PUSH CLAMP: the collider exit is unbounded — a lagging
        // hem vert deep inside the SWINGING arm capsule gets shoved along the
        // shortest exit, which for adjacent verts on opposite sides of the
        // arm is TANGENTIAL WRAPAROUND: a 1.6 cm hem edge measured 10.5 cm at
        // swagger@0.25 (a torn-looking ring). Fabric cannot do that: TOTAL
        // displacement from the skinned target — spring lag AND collider exit
        // together — stays within the clamp + the construction slop (the
        // rings legitimately ride up to slop inside the collider anyway).
        {
          const ddx2 = px - sx, ddy2 = py - sy, ddz2 = pz - sz;
          const dLen2 = Math.hypot(ddx2, ddy2, ddz2);
          const maxD2 = maxD + slopU;
          if (dLen2 > maxD2 && dLen2 > 1e-9) {
            const c3 = maxD2 / dLen2;
            px = sx + ddx2 * c3; py = sy + ddy2 * c3; pz = sz + ddz2 * c3;
            // kill the excess velocity too, or the spring re-inflates it
            const rdot2 = ((px - sx) * vx + (py - sy) * vy + (pz - sz) * vz) / (maxD2 * maxD2);
            if (rdot2 > 0) { vx -= rdot2 * (px - sx); vy -= rdot2 * (py - sy); vz -= rdot2 * (pz - sz); }
          }
        }
        part.P[k3] = px; part.P[k3 + 1] = py; part.P[k3 + 2] = pz;
        part.vel[k3] = vx; part.vel[k3 + 1] = vy; part.vel[k3 + 2] = vz;
        const spd = Math.hypot(vx, vy, vz);
        if (spd > maxSpd) {
          maxSpd = spd;
          state.dbgSpd = { vi: part.idx[k], mesh: part.mesh.userData.rwfWardrobe, loose: part.loose[k],
            spdCmS: +(spd / (unitPerMmU * 1000) / 0.01).toFixed(3), dispCm: +(Math.hypot(px - sx, py - sy, pz - sz) / (unitPerMmU * 1000) / 0.01).toFixed(3),
            v: [+(vx / (unitPerMmU * 1000)).toFixed(4), +(vy / (unitPerMmU * 1000)).toFixed(4), +(vz / (unitPerMmU * 1000)).toFixed(4)] };
        }
        const disp = Math.hypot(px - sx, py - sy, pz - sz);
        if (disp > maxDisp) {
          maxDisp = disp;
          dbgWorst = { vi: part.idx[k], mesh: part.mesh.userData.rwfWardrobe, loose: part.loose[k],
            dispCm: +(disp / (unitPerMmU * 1000) / 0.01).toFixed(2), spdCmS: +(spd / (unitPerMmU * 1000) / 0.01).toFixed(2),
            maxDCm: +(maxD / (unitPerMmU * 1000) / 0.01).toFixed(2), pushedCm: +(pushedThis / (unitPerMmU * 1000) / 0.01).toFixed(2),
            sCm: +Math.hypot(sx, sy, sz).toFixed(2) };
        }
      }
    }
    state.maxSpeedCmS = maxSpd / (unitPerMmU * 1000) / 0.01;
    state.maxDispCm = maxDisp / (unitPerMmU * 1000) / 0.01;
    state.maxPushCm = dbgMaxPush / (unitPerMmU * 1000) / 0.01;
    state.pushByNameCm = Object.fromEntries(Object.entries(dbgPushByName).map(([k2, v]) => [k2, +(v / (unitPerMmU * 1000) / 0.01).toFixed(2)]));
    // SLEEP = no VISIBLE motion (speed only): the sag equilibrium holds a
    // steady ~1.3 cm offset (absolute-displacement can never sleep), and
    // the collider ramp leaves an invisible ~0.25 mm/frame micro cycle —
    // both steady states, not motion.
    const calm = maxSpd < sleepVelU;
    state.dbg = { worst: dbgWorst, pushBy: { ...dbgPushByName }, maxPushCm: +(dbgMaxPush / (unitPerMmU * 1000) / 0.01).toFixed(2) };
    prevMaxDisp = maxDisp;
    return calm;
  }

  /** per-frame step; returns true while the layer is visibly moving */
  function step(dt) {
    if (!state.enabled || !parts.length) return false;
    if (!state.awake) {
      if (!driversMoved()) return false;
    }
    refreshWorld();           // capsule frames + skinned targets, every step
    if (!state.awake) wakeInit();
    // TELEPORT SNAP (frame level): after ANY S refresh a clip seek can leave
    // |P−S| in the tens of cm until the next substep runs — consumers reading
    // displacement between substeps (the probes' dispOf, the Δsource gate)
    // would see the transient. Snap here so the arrays are always sane.
    for (const part of parts) {
      for (let k = 0; k < part.n; k++) {
        const k3 = k * 3;
        const dx = part.P[k3] - part.S[k3], dy = part.P[k3 + 1] - part.S[k3 + 1], dz = part.P[k3 + 2] - part.S[k3 + 2];
        if (dx * dx + dy * dy + dz * dz > (2.5 * maxDispU * part.loose[k]) ** 2) {
          part.P[k3] = part.S[k3]; part.P[k3 + 1] = part.S[k3 + 1]; part.P[k3 + 2] = part.S[k3 + 2];
          part.vel[k3] = 0; part.vel[k3 + 1] = 0; part.vel[k3 + 2] = 0;
        }
      }
    }
    acc += Math.max(0, dt);
    let steps = 0;
    let calm = false;
    while (acc >= h && steps < 4) { calm = substep(); acc -= h; steps++; }
    if (steps === 4) acc = 0;   // tab-hidden backlog — dump it
    state.dbg2 = { steps, calm: !!calm, sf: state.sleepFrames };
    if (calm) {
      if (++state.sleepFrames >= 4) {
        state.awake = false;
        writeback();        // keep the settled (sagged) positions — no snap-back pop
        return false;
      }
    } else state.sleepFrames = 0;
    writeback();
    return true;
  }

  /** synchronous fast-forward (probes: dwell state at the current pose) */
  function settle(seconds) {
    if (!state.enabled || !parts.length) return true;
    const reinit = driversMoved() || !state.awake;
    refreshWorld();           // fresh capsule frames + targets first
    if (reinit) wakeInit(true);
    const t0 = performance.now();
    let simT = 0;
    let calm = false;
    while (simT < seconds) {
      calm = substep();
      simT += h;
      if (calm && simT > 0.12) break;
      if (performance.now() - t0 > 400) break;   // hard guard
    }
    if (calm) { state.awake = false; writeback(); }   // keep the sagged state
    else { state.awake = true; writeback(); }
    state.settledAt = simT;
    return calm;
  }

  /** world displacement (P − S) per participating vert — the Δsource probe
   *  subtracts this so the attachment gate measures skinning, not physics.
   *  Reports the LIVE arrays even while ASLEEP: sleep keeps the sagged
   *  positions baked into the geometry (writeback-before-sleep), so the
   *  probe must still subtract them (zeroing here charged the ~0.5-2 cm
   *  resting sag to the skinning gate). Only a DISABLED layer (restback,
   *  geometry = constructed rest) reports all-zeros. */
  function dispOf(mesh) {
    const part = parts.find((p2) => p2.mesh === mesh);
    if (!part) return null;
    const disp = new Float32Array(part.n * 3);
    if (!state.enabled) return { idx: part.idx, disp };
    for (let k = 0; k < part.n; k++) {
      disp[k * 3] = part.P[k * 3] - part.S[k * 3];
      disp[k * 3 + 1] = part.P[k * 3 + 1] - part.S[k * 3 + 1];
      disp[k * 3 + 2] = part.P[k * 3 + 2] - part.S[k * 3 + 2];
    }
    return { idx: part.idx, disp };
  }

  return {
    state, step, settle, dispOf,
    verts: totalVerts,
    setEnabled(on) {
      state.enabled = !!on;
      if (!on) { state.awake = false; restback(); }   // off = pure skinned
      return state.enabled;
    },
    /** probes: per-vert collider masks can be swapped wholesale (debug). */
    setCaps(filter) {
      const want = filter ? new Set(filter) : null;
      for (const part of parts) {
        for (let k = 0; k < part.n; k++) {
          part.vcaps[k] = want
            ? part.vcaps[k].filter((c) => want.has(c.name))
            : part.vcaps[k];
        }
      }
      return caps.length;
    },
  };
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
 * Attach the outfit (DEFAULT garment system for /atelier).
 * opts.head: HEAD_SPECIES entry (default 'frog' = frog WITH crown).
 * opts.mode: 'fabric' (default — v8 constructed garment topology) or
 *   'fitted' (the v7 body-triangle garments, kept as the fallback).
 * Shoes are v8 foot-derived in BOTH modes.
 * Returns the atelier outfit object: { slots, toggle, isVisible, softGarments,
 * rigidPieces, plan, mode:'derived', garment, derived, setHead, head,
 * updateFabric, settle, fabricPhysics } — v9: updateFabric(dt) steps the
 * easy fabric-physics layer (returns true while moving), settle(s) is its
 * synchronous fast-forward, fabricPhysics exposes the layer for probes.
 */
export function attachDerivedOutfit(avatar, opts = {}) {
  const B = avatar.bones;
  if (!B?.hips || !B?.head) throw new Error('attachDerivedOutfit: not a humanoid ModelAvatar');
  avatar.root.updateMatrixWorld(true);
  const S = DERIVED_SPEC;

  const colors = {
    shorts: OUTFIT_TOKENS.coral,
    // v7 FIX 2: the waistband is SOLID CHARCOAL (#2a3038 renders in the
    // pixel-classifier's 'band' window under the probe rig's neutral light —
    // verified by differential render; the v8 band-lip probe failure was the
    // BELLY showing through the shorts tube's open top, not the colour).
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
  // ── build. v8: 'fabric' mode (default) constructs the shirt + shorts with
  //    their OWN ring-lattice topology; 'fitted' keeps the v7 body-triangle
  //    garments verbatim (the fallback). The waistband is unchanged (v7).
  const garmentMode = opts.mode === 'fitted' ? 'fitted' : 'fabric';
  // the lip LANDS ON the band (2 mm overlap): a clearance gap between the
  // shirt lip and the band top shows the dark scene through backfaces from
  // any slightly-below camera (measured 1.5 cm of see-through on v8 build 1)
  const hemLipY = bandTop - 0.2 * cm;
  const anc = {
    B, skin, dom, P, ctx, H, mm, cm, bp,
    collarY, chestY, hipY, hemLipY, bandTop, bandBot, crotchY, legCut,
    spineAnchor, armLs, armLe, armRs, armRe, legLs, legLe, legRs, legRe,
    shirtMm, shortsMm, envOf,
  };
  let shirtMesh, shortsMesh, pelvisFlap = null;
  if (garmentMode === 'fabric') {
    shirtMesh = buildFabricShirt(body, anc, lam(colors.tshirt));
    shortsMesh = buildFabricShorts(body, anc, lam(colors.shorts));
    // PELVIS FLAP (body-derived, v7 technology): a pelvis-band shell over
    // the waist/hip zone. The fabric leg tubes' inner walls ride THIGH
    // weights — after any clip, pose('stand') leaves the legs at a stale
    // rotation and the walls swing back ~3 cm, letting the BELLY BULGE poke
    // through between them (measured post-verify). The flap IS the belly
    // +12 mm (inherited topology — tracks the flesh through every pose,
    // strain−body ≈ 0), sits 2 mm PROUD of the tubes (+10 mm), and its
    // bottom lip TUCKS inward under them. The crotch keeps the v7
    // founder-approved body-triangle cover.
    const flapBotY = bandBot - 1.6 * cm;
    pelvisFlap = extractGarment(body, (i) => inShorts(i) && yOf(i) >= flapBotY, {
      vertRole: (i) => {
        const y = yOf(i);
        return y < flapBotY + 0.25 * cm
          ? { kind: 'snap', offMm: 12, snap: (p) => new THREE.Vector3(p.x, flapBotY + 0.25 * cm, p.z) }
          : { kind: 'region', offMm: 12 };
      },
      openings: [{
        name: 'flap-lip', kind: 'hem',
        P: new THREE.Vector3(0, flapBotY + 0.25 * cm, 0), n: UP.clone(), dropDir: DOWN.clone(),
        dropCm: 0.6, flareCm: -0.45, gMm: 12,
        anchor: spineAnchor(flapBotY), tol: 0.9 * cm, tint: 1,
      }],
      territory: (i) => shortsTerritory(i) && yOf(i) >= flapBotY - 0.006,
    }, 'shorts', lam(colors.shorts), ctx);
  } else {
    shirtMesh = extractGarment(body, inShirtAll, { vertRole: shirtRole, openings: shirtOpenings, territory: shirtTerritory, wrinkleAt: shirtWrinkleAt }, 'tshirt', lam(colors.tshirt), ctx);
    shortsMesh = extractGarment(body, inShorts, { vertRole: shortsRole, openings: shortsOpenings, territory: shortsTerritory, wrinkleAt: shortsWrinkleAt }, 'shorts', lam(colors.shorts), ctx);
  }
  const bandMesh = extractGarment(body, inBand, { vertRole: bandRole, openings: bandOpenings, territory: bandTerritory }, 'waistband', lam(colors.waistband), ctx);
  // v8 sneakers: foot's own triangles + a real sole slab (both modes — the
  // v4 ring shoes are retired; buildSneakers stays in geno-outfit.js).
  const sneakers = buildDerivedSneakers(body, anc, lam(colors.sneakers), lam(OUTFIT_TOKENS.white));
  const shortsPieces = pelvisFlap ? [pelvisFlap, shortsMesh] : [shortsMesh];
  for (const m of [shirtMesh, ...shortsPieces, bandMesh, ...sneakers]) {
    skin.scene.add(m);
    m.bind(skin.skeleton, new THREE.Matrix4());
  }

  // ── v9 EASY FABRIC PHYSICS: capsules + the secondary-motion layer ──────
  const PHP = DERIVED_SPEC.physics;
  const skBones = skin.skeleton.bones;
  const boneIdxSet = (names) => {
    const set = new Set();
    for (const n2 of names) {
      const b = skBones.find((x) => rawName(x.name) === n2);
      if (b) set.add(skBones.indexOf(b));
    }
    return set.size ? set : null;
  };
  // the torso capsule excludes the whole upper-limb/neck/head FAMILIES by
  // NAME PATTERN — exact names missed the finger bones (LeftHandIndex1…)
  // and the A-pose hand flesh poisoned the first v9 build's radii to 0.6.
  const notLimbOrHead = (n2) => /Hand|Arm|Shoulder|Neck|Head/.test(n2);
  const mkCap = (bA, bB, tA, tB, setNames, padCm, xLat = 0, excl = null) => {
    if (!bA || !bB) return null;
    return makePhysCapsule(body, dom, skin.skeleton, bA, bB, bp(bA), bp(bB), tA, tB,
      setNames ? boneIdxSet(setNames) : null, padCm * cm, xLat * H, excl ? notLimbOrHead : null);
  };
  // coverage: the thigh capsules run past the KNEE into the shin (the shorts
  // leg hems land below the knee at t≈1.3 of the thigh segment), the arm
  // capsules past the elbow — hems always have a collider to swing against.
  // (no torso/pelvis capsule: the shirt hem hangs OVER the shorts — there
  // is no bare flesh for it to tunnel into, and a torso-scale capsule is a
  // blob at resting contact — measured 8 cm phantom pushes on the v9 builds)
  // tA starts BELOW the glute/deltoid bulge — a capsule measured from the
  // joint is butt/deltoid-sized at the top and the hem rings (which ride
  // 1.5-3 cm off the mid-limb flesh) sit inside it at rest (measured: a
  // permanent 4 cm contact equilibrium + jitter). tB runs past the knee/
  // elbow so the hems always have a collider.
  const physCaps = [
    mkCap(B.upLegL, B.legL, 0.25, 1.35, ['LeftUpLeg', 'LeftLeg'], PHP.padCm.thigh),
    mkCap(B.upLegR, B.legR, 0.25, 1.35, ['RightUpLeg', 'RightLeg'], PHP.padCm.thigh),
    mkCap(B.armL, B.foreL, 0.1, 1.1, ['LeftArm', 'LeftForeArm'], PHP.padCm.arm),
    mkCap(B.armR, B.foreR, 0.1, 1.1, ['RightArm', 'RightForeArm'], PHP.padCm.arm),
  ].filter(Boolean);
  const physGarments = garmentMode === 'fabric'
    ? [shirtMesh, shortsMesh].filter((m) => m.userData.rwfDerived?.physRings?.length)
    : [];
  const reducedMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phys = physGarments.length
    ? buildFabricPhysics(avatar.root, skin.skeleton, body, physGarments, physCaps, PHP, H / 1750)
    : null;   // TRUE units-per-mm — see the NOTE in buildFabricPhysics
  if (phys && reducedMotion) phys.setEnabled(false);   // reduced motion → pure skinned

  // v4 rigid pieces (founder-approved): headband, wristbands.
  const headband = buildHeadband(avatar, colors);
  const wristbands = buildWristbands(avatar, colors);

  // ── species head (FIX 3): frog-with-crown default, rigid on the Head bone ─
  let headGroup = null;
  let headSpecies = 'none';
  let frogSkin = 'green';
  const slots = {
    tshirt: [shirtMesh],
    shorts: shortsPieces,
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

  const softGarments = [shirtMesh, ...shortsPieces, bandMesh, ...sneakers];
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
    // (flap first so the TUBES' stats win the 'shorts' key — ringVerts, openings)
    perGarment: Object.fromEntries([shirtMesh, ...shortsPieces, bandMesh].map((m) => {
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
    // v9: which garment construction shipped + the shoe build
    garmentMode,
    // v9: the fabric-physics layer (null = disabled / fitted mode)
    physics: phys ? {
      verts: phys.verts, caps: physCaps.length,
      enabled: phys.state.enabled, reducedMotion,
      spec: { k: PHP.k, zeta: PHP.zeta, sagG: PHP.sagG, maxDispCm: PHP.maxDispCm },
      hemRings: { shirt: shirtMesh.userData.rwfDerived?.physRings?.length ?? 0,
        shorts: shortsMesh.userData.rwfDerived?.physRings?.length ?? 0 },
    } : null,
    fabric: garmentMode === 'fabric' ? {
      shirt: shirtMesh.userData.rwfDerived.fabric ?? null,
      shorts: shortsMesh.userData.rwfDerived.fabric ?? null,
      shoe: sneakers.filter((m) => m.userData.rwfDerived?.fabric?.sole)
        .map((m) => ({ samples: m.userData.rwfDerived.fabric.samples })),
      shoeUpper: sneakers.filter((m) => !m.userData.rwfDerived?.fabric?.sole)
        .map((m) => ({ verts: m.geometry.attributes.position.count, openings: m.userData.rwfDerived.openings.map((o) => o.name + ':' + (o.matched ? 'ok' : 'MISS')) })),
    } : null,
  };

  return {
    slots,
    mode: 'derived',
    garment: garmentMode,
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
    // v9: the easy fabric-physics layer. step(dt) returns true while the
    // fabric is visibly moving (the app renders only then — the dirty-flag
    // discipline holds; dormant = zero writes, zero cost).
    updateFabric(dt) { return phys ? phys.step(dt ?? 0) : false; },
    settle(seconds) { phys?.settle(seconds ?? 0.4); },
    fabricPhysics: {
      get state() { return phys ? { ...phys.state, verts: phys.verts, caps: physCaps.length } : null; },
      setEnabled(on) { return phys ? phys.setEnabled(on) : false; },
      dispOf: (mesh) => (phys ? phys.dispOf(mesh) : null),
      poke() { if (phys) { phys.state.sleepFrames = 0; phys.step(1 / 60); } },   // force a wake check
      setCaps: (filter) => (phys ? phys.setCaps(filter) : 0),   // probes: capsule bisect
      // probes only: live capsule world state
      debugCaps: () => physCaps.map((c) => ({ name: c.name, a: [c.ax, c.ay, c.az], b: [c.bx, c.by, c.bz],
        rx: +(c.rx + c.pad).toFixed(4), rz: +(c.rz + c.pad).toFixed(4),
        rxA: +(c.rxA + c.pad).toFixed(4), rzA: +(c.rzA + c.pad).toFixed(4),
        rxB: +(c.rxB + c.pad).toFixed(4), rzB: +(c.rzB + c.pad).toFixed(4),
        e1: [c.e1x, c.e1y, c.e1z], e2: [c.e2x, c.e2y, c.e2z],
        pad: c.pad, nan: !isFinite(c.ax + c.ay + c.az + c.bx + c.by + c.bz + c.e1x + c.e2x + c.rx + c.rz) })),
    },
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
