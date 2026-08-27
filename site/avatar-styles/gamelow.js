/**
 * gamelow.js — "Game low-poly": the stylised game-character look.
 *
 * Reference: the rigged low-poly characters in the goblin-village project
 * (orc.glb — ~2.2k tris, ONE continuous skinned mesh, a flat 256px palette
 * atlas, zero painted detail). Two things make those read as "game character"
 * rather than "primitives glued together":
 *
 *   1. FLAT PALETTE COLOUR. No gradients, no texture noise — big areas of one
 *      colour, separated by clean silhouette edges.
 *   2. CONTINUOUS SURFACE AT THE JOINTS. A skinned mesh deforms; it can never
 *      crack open at an elbow.
 *
 * We are NOT skinned (the rig is parented Groups, which the exercise solver
 * drives directly), so a naive port cracks at every pivot when the joint bends
 * — exactly the "joins are not great" complaint about `lowpoly`.
 *
 * THE FIX — ball joints, done properly:
 *   • Every limb segment carries a faceted SPHERE centred exactly on its pivot,
 *     with a radius matched to the limb's radius at that end. Rotate the joint
 *     to any angle and the sphere fills the wedge — the seam cannot open,
 *     because the joint geometry is rotationally symmetric about the pivot.
 *   • Limb tubes start slightly ABOVE their pivot (overshoot into the parent),
 *     so even at extreme angles there is overlap rather than a butt-join.
 *   • Hands/feet are palette-contrasted (gloves/boots), which is how game
 *     characters hide the wrist/ankle transition — a design solution, not a
 *     geometric one.
 *
 * Faceting: low radial counts (6) + flatShading, with per-part rotational
 * offsets so facet seams don't line up between neighbours (aligned seams read
 * as a modelling error).
 */

import * as THREE from 'three';
import { facetMat } from './rig-core.js';

export const spec = {
  headCount: 5.8,       // gamified: chunkier than realistic 6.8, still adult
  hipFrac: 0.485,
  neckFrac: 0.030,
  thighFrac: 0.505,
  ankleFrac: 0.040,
  upperArmFrac: 0.470,
  torsoRFrac: 0.104,    // broader chest — game-hero silhouette
  shoulderFrac: 0.118,
  hipXFrac: 0.050,
  footFrac: 0.150,
  armThick: 0.46,       // still < 0.5 of torso: proportion rules hold
  legThick: 0.62,
  headWidth: 0.94,
};

export const materials = ({ skin, outfit, accent, hair }) => ({
  skin: facetMat(skin, 0.05),
  outfit: facetMat(outfit, 0.06),
  accent: facetMat(accent, 0.13),
  hair: facetMat(hair, 0.04),
  eye: facetMat('#14161a', 0),
  // Gear tone: a dark neutral for gloves/boots/belt. Reads as leather kit and
  // gives the palette a third value so the figure isn't two flat colours.
  gear: facetMat('#2f3238', 0.03),
});

const SIDES = 6;

/**
 * A faceted limb tube that OVERSHOOTS its pivot.
 * `over` extends the tube above y=0 (into the parent segment) so a bent joint
 * always has overlapping geometry instead of a visible butt-join.
 */
function limbTube(len, rTop, rMid, rBot, over) {
  const pts = [
    new THREE.Vector2(rTop * 0.97, over),
    new THREE.Vector2(rTop, 0),
    new THREE.Vector2(rMid, -len * 0.46),
    new THREE.Vector2(rBot, -len),
    new THREE.Vector2(rBot * 0.86, -len - rBot * 0.16),
  ];
  const g = new THREE.LatheGeometry(pts, SIDES);
  g.computeVertexNormals();
  return g;
}

/** Faceted ball joint, centred on the pivot. Low-poly on purpose. */
function ballJoint(r) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * Build a limb segment: tube + ball joint at the pivot, in one Group.
 * This pairing is the entire join fix — every segment brings its own socket.
 */
function segment({ keep, mats }, { len, rTop, rMid, rBot, mat, spin = 0, jointR }) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(keep(limbTube(len, rTop, rMid, rBot, rTop * 0.55)), mat);
  tube.rotation.y = spin;
  g.add(tube);
  const ball = new THREE.Mesh(keep(ballJoint(jointR ?? rTop * 1.04)), mat);
  ball.rotation.set(spin * 0.7, spin, 0.3);   // break facet alignment with the tube
  g.add(ball);                                 // centred at the pivot (0,0,0)
  return g;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    const R = D.torsoR, H = D.torsoLen;
    const w = 0.80 * D.buildMod.waist;
    // Few control points ⇒ big readable facets. Chest wider than waist for the
    // game-hero V, but the ratio still comes from buildMod so heavy reads heavy.
    const raw = [
      [0.00, -0.04], [0.88, 0.02], [w, 0.34], [1.02, 0.68], [0.88, 0.93], [0.00, 1.02],
    ];
    const g = keep(new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x * R, y * H)), 7));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.outfit);
    m.rotation.y = Math.PI / 7;
    return m;
  },

  neck: ({ D, mats, keep }) => {
    // NOTE: there is no D.neckR — neck thickness is derived from the torso,
    // as in the other styles. (Referencing a non-existent dim yields NaN
    // vertices, which silently blanks the whole figure.)
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.32, D.torsoR * 0.42, D.neckLen * 1.8, SIDES)),
      mats.skin
    );
    m.position.y = D.neckLen * 0.45;
    m.geometry.computeVertexNormals();
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    const R = D.headR;
    // Slightly boxy head — a sphere reads generic, a low-subdiv icosahedron
    // scaled on Z reads "character".
    const skull = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(R, 1)), mats.skin);
    skull.scale.set(D.headW / R, 1.02, 0.94);
    skull.rotation.y = 0.4;
    g.add(skull);

    // Eyes: small, dark, set into the face. Big white spheres read as bug-eyed.
    const eg = keep(new THREE.IcosahedronGeometry(R * 0.15, 0));
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(eg, mats.eye);
      e.position.set(s * R * 0.34, R * 0.06, R * 0.82);
      e.scale.set(1, 1.25, 0.6);
      g.add(e);
    }

    if (cfg.hair === 'short' || cfg.hair === 'bun') {
      const cap = new THREE.Mesh(
        keep(new THREE.SphereGeometry(R * 1.045, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.52)),
        mats.hair
      );
      cap.position.y = R * 0.06;
      cap.rotation.y = 0.7;
      cap.geometry.computeVertexNormals();
      g.add(cap);
      if (cfg.hair === 'bun') {
        const bun = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(R * 0.32, 0)), mats.hair);
        bun.position.set(0, R * 0.72, -R * 0.72);
        g.add(bun);
      }
    } else if (cfg.hair === 'cap') {
      const cap = new THREE.Mesh(
        keep(new THREE.SphereGeometry(R * 1.05, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        mats.accent
      );
      cap.position.y = R * 0.08;
      cap.geometry.computeVertexNormals();
      g.add(cap);
      const brim = new THREE.Mesh(keep(new THREE.CylinderGeometry(R * 0.86, R * 0.86, R * 0.10, 7, 1, false, 0, Math.PI)), mats.accent);
      brim.position.set(0, R * 0.10, R * 0.42);
      brim.rotation.y = Math.PI / 2;
      brim.scale.set(1, 1, 1.35);
      brim.geometry.computeVertexNormals();
      g.add(brim);
    }
    return g;
  },

  // ---- arms: sleeve (outfit) → skin forearm → dark glove.
  upperArm: (ctx) => {
    const { D, mats } = ctx;
    return segment(ctx, {
      len: D.armUp, rTop: D.armUpR * 1.06, rMid: D.armUpR * 1.10, rBot: D.armLoR * 1.02,
      mat: mats.outfit, spin: 0.30, jointR: D.armUpR * 1.16,   // deltoid ball
    });
  },
  foreArm: (ctx) => {
    const { D, mats } = ctx;
    return segment(ctx, {
      len: D.armLo, rTop: D.armLoR * 1.02, rMid: D.armLoR * 1.04, rBot: D.armLoR * 0.74,
      mat: mats.skin, spin: -0.52, jointR: D.armLoR * 1.05,    // elbow ball
    });
  },
  hand: ({ D, mats, keep }) => {
    // Glove: contrasting palette value, which is how game characters break the
    // wrist seam without geometry tricks.
    const m = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.handR * 1.18, 0)), mats.gear);
    m.position.y = -D.handR * 0.42;
    m.scale.set(0.88, 1.18, 0.66);
    m.rotation.y = 0.5;
    return m;
  },

  // ---- legs: shorts (accent) → skin shin → dark boot.
  thigh: (ctx) => {
    const { D, mats } = ctx;
    return segment(ctx, {
      len: D.legUp, rTop: D.legUpR * 1.08, rMid: D.legUpR * 1.12, rBot: D.legLoR * 1.04,
      mat: mats.accent, spin: 0.26, jointR: D.legUpR * 1.14,   // hip ball
    });
  },
  shin: (ctx) => {
    const { D, mats } = ctx;
    return segment(ctx, {
      len: D.legLo, rTop: D.legLoR * 1.02, rMid: D.legLoR * 1.06, rBot: D.legLoR * 0.66,
      mat: mats.skin, spin: -0.42, jointR: D.legLoR * 1.06,    // knee ball
    });
  },
  foot: ({ D, mats, keep }) => {
    const g = keep(new THREE.BoxGeometry(D.footW * 1.95, D.footH * 1.45, D.footLen * 0.98));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) { pos.setX(i, pos.getX(i) * 0.70); pos.setY(i, pos.getY(i) * 0.66); }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.gear);
    m.position.set(0, -D.footH + D.footH * 0.62, D.footLen * 0.20);
    return m;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  if (cfg.accessory === 'headband') {
    const b = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.headR * 1.02, D.headR * 1.02, D.headR * 0.22, 7)), mats.accent
    );
    b.position.y = D.headR * 0.28;
    b.scale.set(1, 1, 0.93);
    b.geometry.computeVertexNormals();
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.CylinderGeometry(D.armLoR * 1.34, D.armLoR * 1.34, D.armLoR * 1.05, SIDES));
    for (const a of [j.armL, j.armR]) {
      const m = new THREE.Mesh(wg, mats.accent);
      m.geometry.computeVertexNormals();
      a.wrist.add(m);
    }
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.waistR * 1.12, D.waistR * 1.12, D.torsoLen * 0.10, 7)), mats.gear
    );
    belt.position.y = D.torsoLen * 0.33;
    belt.rotation.y = Math.PI / 7;
    belt.geometry.computeVertexNormals();
    j.torso.add(belt);
  }
}

export default {
  id: 'gamelow',
  name: 'Game low-poly',
  blurb: 'Faceted planes with ball joints and a flat game palette — the goblin-village look. Joins stay sealed at any angle.',
  spec, materials, parts, decorate,
};
