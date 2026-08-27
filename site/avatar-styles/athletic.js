/**
 * athletic.js — "serious fitness app" option.
 *
 * 6.8 heads tall, real human proportions. This is the style that has to survive
 * being looked at next to a photo of a person, so every ratio is anchored to an
 * actual anthropometric figure rather than to taste:
 *   • head ≈ 1/7 of stature
 *   • hip joint at ≈ 49% of stature (legs are half of you)
 *   • shoulder-to-wrist ≈ 0.44 of stature — which is exactly what the derived
 *     "wrist at mid-thigh" rule produces, so the maths agrees with the anatomy
 *   • upper arm slightly shorter than forearm+hand
 *
 * Limbs are lathed with a belly bulge so they read as muscle rather than pipe,
 * but the radius is a fraction OF the torso radius, so they can never out-bulk
 * the chest the way the rejected version's arms did.
 */

import * as THREE from 'three';
import { toonMat, lerp, easeInOut } from './rig-core.js';

export const spec = {
  headCount: 6.8,
  hipFrac: 0.490,      // hip at the midpoint — legs are half the body
  neckFrac: 0.038,     // a real, visible neck
  thighFrac: 0.520,
  ankleFrac: 0.036,
  upperArmFrac: 0.470,
  torsoRFrac: 0.088,
  shoulderFrac: 0.104,
  hipXFrac: 0.046,
  footFrac: 0.140,
  armThick: 0.42,      // arms are 42% of the chest radius — clearly thinner
  legThick: 0.58,
  headWidth: 0.90,
};

/**
 * Revolve a profile that closes at both ends, with a mid-shaft "belly" radius.
 * That one control is the whole reason these read as limbs and not as tubes.
 */
function limbGeo(len, rTop, rBelly, rBot, bellyAt = 0.38, radial = 14) {
  const pts = [];
  const cap = 4;
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop * Math.sin(a), rTop * Math.cos(a) * 0.75));
  }
  const shaft = 9;
  for (let i = 1; i <= shaft; i++) {
    const t = i / shaft;
    const r = t < bellyAt
      ? lerp(rTop, rBelly, easeInOut(t / bellyAt))
      : lerp(rBelly, rBot, easeInOut((t - bellyAt) / (1 - bellyAt)));
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = 1; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot * Math.cos(a), -len - rBot * Math.sin(a) * 0.75));
  }
  return new THREE.LatheGeometry(pts, radial);
}

/** Chest→waist profile. The waist fraction is most of what separates builds. */
function torsoGeo(D) {
  const R = D.torsoR, H = D.torsoLen;
  const w = 0.80 * D.buildMod.waist;
  const raw = [
    [0.00, -0.02], [0.60, -0.01], [0.92, 0.05], [0.96, 0.16],
    [w, 0.36], [lerp(w, 0.90, 0.5), 0.54], [1.00, 0.74],
    [0.96, 0.86], [0.70, 0.95], [0.34, 1.00], [0.00, 1.02],
  ];
  return new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x * R, y * H)), 18);
}

export const materials = ({ skin, outfit, accent, hair }) => ({
  skin: toonMat(skin), outfit: toonMat(outfit), accent: toonMat(accent, 0.18), hair: toonMat(hair),
});

export const parts = {
  pelvis: ({ D, mats, keep }) => {
    // The pelvis is a SHORTS-COLOURED block that stops at the hip line. An
    // earlier version used the outfit colour and a domed lathe cap, which hung
    // below the shorts as a lime point between the legs — it read as a nappy.
    // Flat-bottomed, accent-coloured, and short enough that the hip sleeves
    // cover it.
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.80, D.torsoR * 0.74, D.torsoLen * 0.20, 16)),
      mats.accent
    );
    m.position.y = D.torsoLen * 0.06;
    return m;
  },

  torso: (ctx) => {
    const { D, mats, keep } = ctx;
    const g = new THREE.Group();
    const body = new THREE.Mesh(keep(torsoGeo(D)), mats.outfit);
    g.add(body);
    // Bare shoulders/upper chest above the singlet line — the skin/outfit split
    // is what stops the figure reading as a solid painted lump.
    const chest = new THREE.Mesh(
      keep(new THREE.SphereGeometry(D.torsoR * 0.99, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      mats.skin
    );
    chest.position.y = D.torsoLen * 0.80;
    chest.scale.set(1, 0.62, 0.82);
    g.add(chest);
    return g;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.30, D.torsoR * 0.38, D.neckLen * 1.5, 12)),
      mats.skin
    );
    m.position.y = D.neckLen * 0.5;
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR, 20, 16)), mats.skin);
    skull.scale.set(D.headW / D.headR, 1, 0.94);
    g.add(skull);
    // Jaw: a slightly narrower ellipsoid low and forward. Without it the head
    // is a ball, and a ball has no facing direction.
    const jaw = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR * 0.80, 14, 10)), mats.skin);
    jaw.position.set(0, -D.headR * 0.30, D.headR * 0.10);
    jaw.scale.set(0.86, 0.72, 0.96);
    g.add(jaw);

    // Eyes: small, dark, SET INTO the face. The rejected version used big white
    // spheres sitting proud of a flat face, which is most of why it read wrong.
    const eyeG = keep(new THREE.SphereGeometry(D.headR * 0.115, 10, 8));
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(eyeG, mats.accent);
      e.position.set(s * D.headR * 0.34, D.headR * 0.06, D.headR * 0.80);
      e.scale.set(1, 1.15, 0.55);
      g.add(e);
    }
    const brow = keep(new THREE.BoxGeometry(D.headR * 0.30, D.headR * 0.055, D.headR * 0.10));
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(brow, mats.hair);
      b.position.set(s * D.headR * 0.34, D.headR * 0.26, D.headR * 0.80);
      b.rotation.z = -s * 0.12;
      g.add(b);
    }

    if (cfg.hair !== 'none') {
      if (cfg.hair === 'cap') {
        const cap = new THREE.Mesh(
          keep(new THREE.SphereGeometry(D.headR * 1.05, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)),
          mats.accent
        );
        cap.position.y = D.headR * 0.10;
        g.add(cap);
        const peak = new THREE.Mesh(keep(new THREE.CylinderGeometry(D.headR * 0.92, D.headR * 0.92, D.headR * 0.07, 16, 1, false, 0, Math.PI)), mats.accent);
        peak.position.set(0, D.headR * 0.42, D.headR * 0.42);
        peak.rotation.set(0.18, Math.PI / 2, 0);
        peak.scale.set(1, 1, 0.72);
        g.add(peak);
      } else {
        const cap = new THREE.Mesh(
          keep(new THREE.SphereGeometry(D.headR * 1.035, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.60)),
          mats.hair
        );
        cap.position.y = D.headR * 0.055;
        cap.scale.set(D.headW / D.headR, 1, 0.96);
        g.add(cap);
        if (cfg.hair === 'bun') {
          const bun = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR * 0.34, 12, 10)), mats.hair);
          bun.position.set(0, D.headR * 0.72, -D.headR * 0.72);
          g.add(bun);
        }
      }
    }
    return g;
  },

  upperArm: ({ D, mats, keep }) => new THREE.Mesh(
    // belly at 0.34: the bicep peak sits high on the bone, as it does on a person
    keep(limbGeo(D.armUp, D.armUpR * 1.06, D.armUpR * 1.14, D.armLoR * 1.02, 0.34)), mats.skin
  ),
  foreArm: ({ D, mats, keep }) => new THREE.Mesh(
    keep(limbGeo(D.armLo, D.armLoR * 1.02, D.armLoR * 1.05, D.armLoR * 0.72, 0.26)), mats.skin
  ),
  hand: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.handR, 10, 8)), mats.skin);
    m.position.y = -D.handR * 0.35;
    m.scale.set(0.82, 1.20, 0.56);
    return m;
  },

  thigh: ({ D, mats, keep }) => new THREE.Mesh(
    keep(limbGeo(D.legUp, D.legUpR * 1.10, D.legUpR * 1.16, D.legLoR * 1.06, 0.30)), mats.skin
  ),
  shin: ({ D, mats, keep }) => new THREE.Mesh(
    // calf belly high (0.24) then a hard taper to a narrow ankle
    keep(limbGeo(D.legLo, D.legLoR * 1.06, D.legLoR * 1.10, D.legLoR * 0.58, 0.24)), mats.skin
  ),
  foot: ({ D, mats, keep }) => {
    const g = new THREE.Group();
    const shoe = new THREE.Mesh(keep(new THREE.SphereGeometry(D.footLen * 0.5, 12, 9)), mats.accent);
    shoe.position.set(0, -D.footH + D.footLen * 0.20, D.footLen * 0.20);
    shoe.scale.set(D.footW / (D.footLen * 0.5) * 0.92, 0.44, 1.05);
    g.add(shoe);
    return g;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  // Shorts hang off each hip so they swing with the thigh, the way shorts do.
  const r = D.legUpR;
  const shortsPts = [
    new THREE.Vector2(0, 0.012 * D.H / 0.42),
    new THREE.Vector2(r * 1.30, 0.010 * D.H / 0.42),
    new THREE.Vector2(r * 1.36, -D.legUp * 0.22),
    new THREE.Vector2(r * 1.48, -D.legUp * 0.46),
    new THREE.Vector2(r * 1.46, -D.legUp * 0.50),
    new THREE.Vector2(r * 1.00, -D.legUp * 0.48),
    new THREE.Vector2(0, -D.legUp * 0.44),
  ];
  const sg = keep(new THREE.LatheGeometry(shortsPts, 14));
  for (const leg of [j.legL, j.legR]) leg.hip.add(new THREE.Mesh(sg, mats.accent));

  if (cfg.accessory === 'headband') {
    // Radius matched to the skull's actual width AT the band's height —
    // r = R·√(1−(y/R)²). A band sized for the equator but placed above it only
    // touches at two points and reads as floating lobes.
    const y = D.headR * 0.34;
    const r = Math.sqrt(Math.max(D.headR * D.headR - y * y, 1e-6));
    const b = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.03, D.headR * 0.09, 8, 22)), mats.accent);
    b.rotation.x = Math.PI / 2;
    b.position.y = y;
    b.scale.set(D.headW / D.headR, 1, 0.94);
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.TorusGeometry(D.armLoR * 1.16, D.armLoR * 0.30, 7, 14));
    for (const a of [j.armL, j.armR]) {
      const w = new THREE.Mesh(wg, mats.accent);
      w.rotation.x = Math.PI / 2;
      w.position.y = D.armLoR * 0.4;
      a.wrist.add(w);
    }
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(keep(new THREE.TorusGeometry(D.waistR * 1.02, D.torsoR * 0.13, 8, 22)), mats.accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = D.torsoLen * 0.14;
    belt.scale.set(1, 1, 0.74);
    j.torso.add(belt);
  }
}

export default {
  id: 'athletic',
  name: 'Athletic realistic',
  blurb: 'Correct human proportions, slim limbs, toon-shaded. The "serious fitness app" option.',
  spec, materials, parts, decorate,
};
