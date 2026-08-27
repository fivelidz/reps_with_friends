/**
 * chibi.js — cute mascot.
 *
 * 3.0 heads tall. The big head is the POINT here, not a bug — but the rejected
 * avatar proved that chibi proportions plus bodybuilder limbs reads as a
 * gorilla, not as a mascot. The rule that makes it work:
 *
 *   BIG HEAD ⇒ TINY, SIMPLE LIMBS.
 *
 * So armThick is 0.30 (vs athletic's 0.42) and every limb is a plain tapered
 * capsule with no muscle belly. The eye is meant to go head → body → "cute",
 * and stop. Any limb detail competes with the head and the whole thing turns
 * into a chunky monster.
 *
 * The neck is deliberately short (mascots have almost none) but it is NOT zero:
 * the head still clears the shoulder line, so the silhouette has a notch and
 * the head can turn.
 */

import * as THREE from 'three';
import { toonMat } from './rig-core.js';

export const spec = {
  headCount: 3.0,      // unmistakably chibi
  hipFrac: 0.400,      // shorter legs suit the style, but still a real stance
  neckFrac: 0.016,     // short — but present, so there IS a jaw/shoulder gap
  thighFrac: 0.500,
  ankleFrac: 0.045,
  upperArmFrac: 0.480,
  torsoRFrac: 0.105,
  shoulderFrac: 0.098,
  hipXFrac: 0.048,
  footFrac: 0.150,
  armThick: 0.30,      // THE fix: tiny arms against a big head
  legThick: 0.46,
  headWidth: 1.06,     // slightly wide — reads friendlier
};

export const materials = ({ skin, outfit, accent, hair }) => ({
  skin: toonMat(skin), outfit: toonMat(outfit), accent: toonMat(accent, 0.20), hair: toonMat(hair),
});

/** Plain tapered capsule. No belly bulge — that's the anti-gorilla rule. */
function tube(len, rTop, rBot, radial = 12) {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop * Math.sin(a), rTop * Math.cos(a) * 0.8));
  }
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    pts.push(new THREE.Vector2(rTop + (rBot - rTop) * t, -len * t));
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot * Math.cos(a), -len - rBot * Math.sin(a) * 0.8));
  }
  return new THREE.LatheGeometry(pts, radial);
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    // A rounded bean — barely tapered, since a mascot has no waist to speak of.
    const w = 0.94 * D.buildMod.waist;
    const R = D.torsoR, H = D.torsoLen;
    const raw = [
      [0.00, -0.04], [0.72, -0.02], [0.98, 0.10],
      [w, 0.38], [0.99, 0.64], [1.00, 0.80],
      [0.82, 0.94], [0.44, 1.02], [0.00, 1.05],
    ];
    return new THREE.Mesh(
      keep(new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x * R, y * H)), 18)),
      mats.outfit
    );
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.34, D.torsoR * 0.42, D.neckLen * 2.2, 10)), mats.skin
    );
    m.position.y = D.neckLen * 0.4;
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR, 22, 18)), mats.skin);
    skull.scale.set(D.headW / D.headR, 0.98, 0.96);
    g.add(skull);

    // Big eyes ARE correct for chibi — but they must sit ON the face curve, not
    // bulge off a flat plane, and they need a highlight to read as eyes rather
    // than as holes. Placed at radius 0.86 with a squash, so they follow the
    // skull's curvature.
    const eyeG = keep(new THREE.SphereGeometry(D.headR * 0.20, 14, 12));
    const gloG = keep(new THREE.SphereGeometry(D.headR * 0.072, 8, 6));
    const white = toonMat('#ffffff', 0.35);
    ctxMats(mats).push?.(white);
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(eyeG, mats.eye);
      e.position.set(s * D.headR * 0.36, D.headR * 0.02, D.headR * 0.80);
      e.scale.set(0.92, 1.10, 0.50);
      g.add(e);
      const gl = new THREE.Mesh(gloG, mats.gloss);
      gl.position.set(s * D.headR * 0.30, D.headR * 0.13, D.headR * 0.90);
      g.add(gl);
    }
    // A tiny smile arc — a mascot without a mouth reads blank.
    const mouth = new THREE.Mesh(
      keep(new THREE.TorusGeometry(D.headR * 0.17, D.headR * 0.028, 6, 14, Math.PI * 0.9)), mats.eye
    );
    mouth.position.set(0, -D.headR * 0.34, D.headR * 0.83);
    mouth.rotation.set(0.30, 0, Math.PI + Math.PI * 0.05);
    g.add(mouth);
    // Blush — cheap, and it's most of what makes it read "cute" not "creepy".
    const blushG = keep(new THREE.SphereGeometry(D.headR * 0.14, 8, 6));
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(blushG, mats.blush);
      b.position.set(s * D.headR * 0.60, -D.headR * 0.18, D.headR * 0.62);
      b.scale.set(1, 0.62, 0.24);
      g.add(b);
    }

    if (cfg.hair !== 'none') {
      const mat = cfg.hair === 'cap' ? mats.accent : mats.hair;
      const cap = new THREE.Mesh(
        keep(new THREE.SphereGeometry(D.headR * 1.04, 20, 14, 0, Math.PI * 2, 0, Math.PI * (cfg.hair === 'cap' ? 0.50 : 0.58))),
        mat
      );
      cap.position.y = D.headR * 0.06;
      cap.scale.set(D.headW / D.headR, 1, 0.98);
      g.add(cap);
      if (cfg.hair === 'bun') {
        const bun = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR * 0.30, 12, 10)), mats.hair);
        bun.position.set(0, D.headR * 0.86, -D.headR * 0.52);
        g.add(bun);
      }
      if (cfg.hair === 'short') {
        // one cowlick tuft — asymmetry stops the head reading as a helmet
        const tuft = new THREE.Mesh(keep(new THREE.ConeGeometry(D.headR * 0.16, D.headR * 0.44, 8)), mats.hair);
        tuft.position.set(D.headR * 0.20, D.headR * 0.96, -D.headR * 0.10);
        tuft.rotation.set(-0.3, 0, -0.5);
        g.add(tuft);
      }
    }
    return g;
  },

  upperArm: ({ D, mats, keep }) => new THREE.Mesh(keep(tube(D.armUp, D.armUpR, D.armUpR * 0.94)), mats.skin),
  foreArm: ({ D, mats, keep }) => new THREE.Mesh(keep(tube(D.armLo, D.armLoR, D.armLoR * 0.90)), mats.skin),
  hand: ({ D, mats, keep }) => {
    // Mitten — no fingers. Simplicity is the style.
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.handR * 1.22, 12, 10)), mats.skin);
    m.position.y = -D.handR * 0.55;
    m.scale.set(0.92, 1.02, 0.78);
    return m;
  },

  thigh: ({ D, mats, keep }) => new THREE.Mesh(keep(tube(D.legUp, D.legUpR, D.legUpR * 0.90)), mats.skin),
  shin: ({ D, mats, keep }) => new THREE.Mesh(keep(tube(D.legLo, D.legLoR, D.legLoR * 0.80)), mats.skin),
  foot: ({ D, mats, keep }) => {
    // Oversized rounded boot — chibi feet are big, and it gives the tiny legs a
    // visual anchor so the figure doesn't look like it's balancing on pins.
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.footLen * 0.50, 14, 10)), mats.accent);
    m.position.set(0, -D.footH + D.footLen * 0.22, D.footLen * 0.16);
    m.scale.set(D.footW / (D.footLen * 0.5) * 1.05, 0.50, 1.00);
    return m;
  },
};

// tiny helper so the eye/gloss/blush materials get registered for disposal
function ctxMats(mats) { return mats._extra || (mats._extra = []); }

export function decorate({ D, cfg, mats, keep }, j) {
  if (cfg.accessory === 'headband') {
    // A torus of radius ≈ headR sits on the head's EQUATOR; raised to y=0.40·R
    // it's wider than the skull there, so only its two side lobes poke out and
    // it reads as a pair of floating orbs. Match the sphere's actual radius at
    // that height — r = R·√(1−(y/R)²) — and it hugs the head as a band should.
    const y = D.headR * 0.38;
    const r = Math.sqrt(Math.max(D.headR * D.headR - y * y, 1e-6));
    const b = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.02, D.headR * 0.085, 8, 22)), mats.accent);
    b.rotation.x = Math.PI / 2;
    b.position.y = y;
    b.scale.set(D.headW / D.headR, 1, 0.98);
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.TorusGeometry(D.armLoR * 1.30, D.armLoR * 0.38, 7, 14));
    for (const a of [j.armL, j.armR]) {
      const w = new THREE.Mesh(wg, mats.accent);
      w.rotation.x = Math.PI / 2;
      a.wrist.add(w);
    }
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(keep(new THREE.TorusGeometry(D.torsoR * 0.92, D.torsoR * 0.14, 8, 22)), mats.accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = D.torsoLen * 0.34;
    belt.scale.set(1, 1, 0.90);
    j.torso.add(belt);
  }
}

export default {
  id: 'chibi',
  name: 'Chibi mascot',
  blurb: 'Deliberately cute: big head, tiny simple limbs, no muscle detail. Reads as a mascot, not a bodybuilder.',
  spec,
  materials: ({ skin, outfit, accent, hair }) => {
    const m = materials({ skin, outfit, accent, hair });
    // Extra fixed-colour materials the head needs. Registered on the palette so
    // makeAvatar() disposes them with everything else.
    m.eye = toonMat('#1b1f26', 0.0);
    m.gloss = toonMat('#ffffff', 0.6);
    m.blush = toonMat('#ff7a8a', 0.3);
    return m;
  },
  parts, decorate,
};
