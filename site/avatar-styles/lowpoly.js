/**
 * lowpoly.js — angular faceted planes, flat-shaded.
 *
 * 6.2 heads tall: near-human, so it can carry the same "this is a real workout"
 * weight as the athletic style, but rendered as hard facets rather than smooth
 * surfaces. The look comes from THREE things working together:
 *
 *   1. flatShading: true — every triangle gets one normal, so each facet is a
 *      distinct flat plane rather than part of a gradient.
 *   2. Low radial counts (5–7 sides) on every lathe/cone. A 6-sided limb has
 *      visible edges from any angle; a 14-sided one just looks like a slightly
 *      cheap cylinder.
 *   3. Rotational offsets so the facet seams DON'T line up between adjacent
 *      parts — aligned seams read as a modelling mistake.
 *
 * MeshStandardMaterial (not Toon) because faceted geometry wants a continuous
 * light response to show off the plane angles; toon banding would fight it.
 */

import * as THREE from 'three';
import { facetMat, lerp } from './rig-core.js';

export const spec = {
  headCount: 6.2,
  hipFrac: 0.485,
  neckFrac: 0.034,
  thighFrac: 0.515,
  ankleFrac: 0.038,
  upperArmFrac: 0.480,
  torsoRFrac: 0.092,
  shoulderFrac: 0.106,
  hipXFrac: 0.046,
  footFrac: 0.145,
  armThick: 0.44,
  legThick: 0.60,
  headWidth: 0.92,
};

export const materials = ({ skin, outfit, accent, hair }) => ({
  skin: facetMat(skin), outfit: facetMat(outfit), accent: facetMat(accent, 0.14), hair: facetMat(hair),
  eye: facetMat('#14161a', 0),
});

/** Faceted limb: few sides, straight segments, no smoothing. */
function facetLimb(len, rTop, rMid, rBot, sides = 6) {
  const pts = [
    new THREE.Vector2(0, rTop * 0.5),
    new THREE.Vector2(rTop, 0),
    new THREE.Vector2(rMid, -len * 0.42),
    new THREE.Vector2(rBot, -len),
    new THREE.Vector2(0, -len - rBot * 0.5),
  ];
  const g = new THREE.LatheGeometry(pts, sides);
  g.computeVertexNormals();
  return g;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    const R = D.torsoR, H = D.torsoLen;
    const w = 0.78 * D.buildMod.waist;
    // Few control points ⇒ few horizontal bands ⇒ big readable facets. A dense
    // profile here would look smooth no matter how low the radial count is.
    const raw = [
      [0.00, -0.03], [0.86, 0.02], [w, 0.36], [0.99, 0.70], [0.80, 0.94], [0.00, 1.02],
    ];
    const g = keep(new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x * R, y * H)), 7));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.outfit);
    m.rotation.y = Math.PI / 7;    // offset the seam from the limbs'
    return m;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.30, D.torsoR * 0.40, D.neckLen * 1.6, 6)), mats.skin
    );
    m.position.y = D.neckLen * 0.5;
    m.geometry.computeVertexNormals();
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    // An icosahedron IS the low-poly head — 20 equal triangles, no seam, and it
    // reads as a crystal rather than a sphere approximation.
    const skull = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.headR * 1.06, 1)), mats.skin);
    skull.scale.set(D.headW / D.headR * 0.98, 1.06, 0.94);
    skull.rotation.y = 0.4;
    g.add(skull);
    // Faceted wedge jaw, so the head has a front.
    const jaw = new THREE.Mesh(keep(new THREE.ConeGeometry(D.headR * 0.74, D.headR * 0.78, 5)), mats.skin);
    jaw.position.set(0, -D.headR * 0.44, D.headR * 0.10);
    jaw.rotation.set(Math.PI, Math.PI / 5, 0);
    jaw.scale.set(1, 0.72, 0.92);
    g.add(jaw);

    // Angular eye slits — flat planes, not spheres.
    const eG = keep(new THREE.BoxGeometry(D.headR * 0.30, D.headR * 0.10, D.headR * 0.06));
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(eG, mats.eye);
      e.position.set(s * D.headR * 0.36, D.headR * 0.08, D.headR * 0.82);
      e.rotation.z = -s * 0.18;
      g.add(e);
    }

    if (cfg.hair !== 'none') {
      const mat = cfg.hair === 'cap' ? mats.accent : mats.hair;
      const cap = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.headR * 1.12, 1)), mat);
      cap.scale.set(D.headW / D.headR * 0.99, 0.72, 0.96);
      cap.position.y = D.headR * 0.34;
      cap.rotation.y = 0.9;
      g.add(cap);
      if (cfg.hair === 'bun') {
        const bun = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.headR * 0.32, 0)), mats.hair);
        bun.position.set(0, D.headR * 0.74, -D.headR * 0.70);
        g.add(bun);
      }
      if (cfg.hair === 'cap') {
        const peak = new THREE.Mesh(keep(new THREE.ConeGeometry(D.headR * 0.80, D.headR * 0.10, 4)), mats.accent);
        peak.position.set(0, D.headR * 0.40, D.headR * 0.58);
        peak.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        peak.scale.set(1, 1, 0.5);
        g.add(peak);
      }
    }
    return g;
  },

  upperArm: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(facetLimb(D.armUp, D.armUpR * 1.04, D.armUpR * 1.10, D.armLoR, 6)), mats.skin);
    m.rotation.y = 0.3;
    return m;
  },
  foreArm: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(facetLimb(D.armLo, D.armLoR, D.armLoR * 1.02, D.armLoR * 0.68, 6)), mats.skin);
    m.rotation.y = -0.5;
    return m;
  },
  hand: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(new THREE.OctahedronGeometry(D.handR * 1.14, 0)), mats.skin);
    m.position.y = -D.handR * 0.5;
    m.scale.set(0.86, 1.16, 0.60);
    return m;
  },

  thigh: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(facetLimb(D.legUp, D.legUpR * 1.06, D.legUpR * 1.12, D.legLoR * 1.02, 6)), mats.accent);
    m.rotation.y = 0.25;
    return m;
  },
  shin: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(facetLimb(D.legLo, D.legLoR, D.legLoR * 1.06, D.legLoR * 0.58, 6)), mats.skin);
    m.rotation.y = -0.4;
    return m;
  },
  foot: ({ D, mats, keep }) => {
    const g = keep(new THREE.BoxGeometry(D.footW * 1.9, D.footH * 1.3, D.footLen * 0.95));
    // Taper the toe end by shifting the front vertices inward — a wedge shoe,
    // which is far more low-poly than a plain box.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) { pos.setX(i, pos.getX(i) * 0.68); pos.setY(i, pos.getY(i) * 0.62); }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.outfit);
    m.position.set(0, -D.footH + D.footH * 0.65, D.footLen * 0.20);
    return m;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  if (cfg.accessory === 'headband') {
    const b = new THREE.Mesh(keep(new THREE.CylinderGeometry(D.headR * 1.02, D.headR * 1.02, D.headR * 0.20, 7)), mats.accent);
    b.position.y = D.headR * 0.30;
    b.scale.set(1, 1, 0.92);
    b.geometry.computeVertexNormals();
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.CylinderGeometry(D.armLoR * 1.30, D.armLoR * 1.30, D.armLoR * 1.0, 6));
    for (const a of [j.armL, j.armR]) a.wrist.add(new THREE.Mesh(wg, mats.accent));
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.waistR * 1.10, D.waistR * 1.10, D.torsoLen * 0.09, 7)), mats.accent
    );
    belt.position.y = D.torsoLen * 0.34;
    belt.rotation.y = Math.PI / 7;
    j.torso.add(belt);
  }
}

export default {
  id: 'lowpoly',
  name: 'Low-poly faceted',
  blurb: 'Angular planes, flat-shaded, near-human proportions. Stylised gaming look with real weight.',
  spec, materials, parts, decorate,
};
