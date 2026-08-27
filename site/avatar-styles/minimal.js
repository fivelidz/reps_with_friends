/**
 * minimal.js — abstract geometric icon.
 *
 * 6.0 heads tall. Sphere head, rounded-slab body, capsule limbs. NO FACE AT
 * ALL — and that is the single most important decision in this style.
 *
 * Why no face: a face is the thing that dates an avatar system and the thing
 * users argue about ("that doesn't look like me"). Remove it and what's left is
 * pure silhouette + colour, which scales to a 24px list row without turning to
 * mush, never looks wrong for any user, and reads as a deliberate brand mark
 * rather than as a low-budget character.
 *
 * Consequently this style IGNORES `hair` entirely — hair on a faceless icon
 * reads as a hat that lost its head. `accessory` is honoured, because a band or
 * belt is a colour accent rather than a facial feature.
 *
 * A capsule head-turn still works: the head is very slightly ovoid and offset,
 * so the neutral idle's head rotation is visible even without eyes.
 */

import * as THREE from 'three';
import { smoothMat } from './rig-core.js';

export const spec = {
  headCount: 6.0,
  hipFrac: 0.500,      // exactly half — the icon-clean choice
  neckFrac: 0.040,
  thighFrac: 0.500,
  ankleFrac: 0.030,
  upperArmFrac: 0.500,
  torsoRFrac: 0.086,
  shoulderFrac: 0.100,
  hipXFrac: 0.042,
  footFrac: 0.100,
  armThick: 0.36,
  legThick: 0.52,
  headWidth: 0.96,
};

export const materials = ({ skin, outfit, accent }) => ({
  // "skin" becomes the limb colour. On a faceless icon a literal skin tone
  // still works, and it keeps the same config API meaningful.
  skin: smoothMat(skin), outfit: smoothMat(outfit), accent: smoothMat(accent, 0.20),
  hair: null,
});

/** Capsule with hemispherical caps, hanging from y=0 down to -len. */
function capsule(len, r, radial = 12) {
  const shaft = Math.max(len - r * 2, 1e-4);
  const g = new THREE.CapsuleGeometry(r, shaft, 4, radial);
  g.translate(0, -len / 2, 0);
  return g;
}

/** Rounded slab: a box swollen toward an ellipsoid. Reads as "body", not "cube". */
function slab(w, h, d, seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // superellipse-ish: push each axis toward its extreme so corners squareoff
    const k = 1.35;
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 1 / k);
    const sy = Math.sign(v.y) * Math.pow(Math.abs(v.y), 1 / k);
    const sz = Math.sign(v.z) * Math.pow(Math.abs(v.z), 1 / k);
    pos.setXYZ(i, sx * w / 2, sy * h / 2, sz * d / 2);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    const g = new THREE.Group();
    const w = D.torsoR * 2.0 * (0.94 + D.buildMod.waist * 0.10);
    const body = new THREE.Mesh(keep(slab(w, D.torsoLen * 1.02, D.torsoR * 1.34)), mats.outfit);
    body.position.y = D.torsoLen * 0.50;
    g.add(body);
    // One accent band. The whole style's decoration budget, spent in one place.
    const band = new THREE.Mesh(
      keep(slab(w * 1.01, D.torsoLen * 0.13, D.torsoR * 1.36)), mats.accent
    );
    band.position.y = D.torsoLen * 0.36;
    g.add(band);
    return g;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(capsule(D.neckLen * 1.8, D.torsoR * 0.28, 10)), mats.skin);
    m.position.y = D.neckLen * 1.5;
    return m;
  },

  head: ({ D, mats, keep }) => {
    // Sphere. That's it — no eyes, no mouth, no hair. The slight Z-scale and a
    // tiny forward offset give it a front so head-turns still read.
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR, 24, 18)), mats.skin);
    m.scale.set(D.headW / D.headR, 1.04, 0.96);
    m.position.z = D.headR * 0.02;
    return m;
  },

  upperArm: ({ D, mats, keep }) => new THREE.Mesh(keep(capsule(D.armUp, D.armUpR)), mats.skin),
  foreArm: ({ D, mats, keep }) => new THREE.Mesh(keep(capsule(D.armLo, D.armLoR)), mats.skin),
  hand: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.handR * 0.98, 12, 10)), mats.skin);
    m.position.y = -D.handR * 0.30;
    return m;
  },

  thigh: ({ D, mats, keep }) => new THREE.Mesh(keep(capsule(D.legUp, D.legUpR)), mats.outfit),
  shin: ({ D, mats, keep }) => new THREE.Mesh(keep(capsule(D.legLo, D.legLoR)), mats.skin),
  foot: ({ D, mats, keep }) => {
    // A small rounded pad. Big enough to read as contact, small enough not to
    // become a "shoe" — shoes are detail, and detail is what this style avoids.
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.footLen * 0.52, 12, 9)), mats.accent);
    m.position.set(0, -D.footH + D.footH * 0.35, D.footLen * 0.14);
    m.scale.set(D.footW / (D.footLen * 0.52) * 0.95, 0.52, 1.05);
    return m;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  // `hair` is deliberately ignored — see the header. Accessories are colour, so
  // they stay.
  if (cfg.accessory === 'headband') {
    // Radius matched to the sphere's width at the band's height, so it sits ON
    // the head rather than hovering as two side lobes.
    const y = D.headR * 0.32;
    const r = Math.sqrt(Math.max(D.headR * D.headR - y * y, 1e-6));
    const b = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.02, D.headR * 0.09, 10, 26)), mats.accent);
    b.rotation.x = Math.PI / 2;
    b.position.y = y;
    b.scale.set(D.headW / D.headR, 1, 0.98);
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.TorusGeometry(D.armLoR * 1.24, D.armLoR * 0.34, 8, 16));
    for (const a of [j.armL, j.armR]) {
      const w = new THREE.Mesh(wg, mats.accent);
      w.rotation.x = Math.PI / 2;
      a.wrist.add(w);
    }
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(keep(slab(D.torsoR * 2.06, D.torsoLen * 0.09, D.torsoR * 1.38)), mats.skin);
    belt.position.y = D.torsoLen * 0.14;
    j.torso.add(belt);
  }
}

export default {
  id: 'minimal',
  name: 'Minimal geometric',
  blurb: 'Sphere head, rounded-slab body, capsule limbs. No face — icon-like, ages well, scales down perfectly. Ignores hair by design.',
  spec, materials, parts, decorate,
  ignores: ['hair'],
};
