/**
 * goblinfit.js — the goblin-village game's character aesthetic, as workout
 * avatars.
 *
 * SOURCE OF TRUTH: game_goblin_village/game/src/entities/goblin.js
 * _buildProceduralMesh() — the game's own characters are procedural (the GLB
 * orcs were disabled there: "persistent rendering issues"). What makes them
 * read as *that game*:
 *
 *   • MeshLambertMaterial — flat, cheap, zero PBR. No metalness, no roughness,
 *     no toon bands. Pure lambert diffuse.
 *   • Capsule body (3 cap segments, 6 radial) + flattened sphere head (7×5)
 *   • Pointy cone ears, cone nose, GLOWING eyes (MeshBasicMaterial — they
 *     emit, no lighting)
 *   • Gene-driven proportions: constitution → body radius, strength → height
 *     (we map build slim/average/heavy onto the same gene ranges)
 *   • _darkenColor(col, 0.75) skin, 0.5 for limbs — a two-tone figure from ONE
 *     base colour
 *
 * This port keeps all of that but puts the limbs on our jointed rig so the
 * exercise solver can drive squats/push-ups properly (the game's goblins bob
 * as whole bodies; we need articulated limbs). Ball joints in the dark tone
 * keep the bends sealed — same trick as gamelow.
 */

import * as THREE from 'three';
import { lerp } from './rig-core.js';

// the game's colour helper (ported verbatim in spirit)
function darken(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}

export const spec = {
  headCount: 3.4,        // the game's goblins are ~3 heads tall — chunky
  hipFrac: 0.46,
  neckFrac: 0.022,       // barely any neck — the head sits low like the game
  thighFrac: 0.52,
  ankleFrac: 0.045,
  upperArmFrac: 0.48,
  torsoRFrac: 0.135,     // broad capsule body
  shoulderFrac: 0.10,    // arms hang close — goblins don't have wide shoulders
  hipXFrac: 0.055,
  footFrac: 0.16,
  armThick: 0.30,        // THIN arms — bodyR*0.28 in the game
  legThick: 0.34,
  headWidth: 1.08,       // flattened-wide head
};

export const materials = ({ skin, outfit, accent, hair }) => {
  // Two-tone from the outfit colour, exactly like the game derives skin/limb
  // tones from the goblin's base colour.
  const base = new THREE.Color(outfit);
  const skinC = base.clone().multiplyScalar(0.75);
  const darkC = base.clone().multiplyScalar(0.5);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  return {
    skin: lam(skinC),
    outfit: lam(base),
    accent: lam(new THREE.Color(accent)),
    dark: lam(darkC),
    hair: lam(new THREE.Color(hair)),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent) }), // GLOWS
  };
};

const RAD = 6; // the game's radial counts: 6 on the body, 4 on limbs

/** Capsule limb in the game's proportions, overshooting its pivot. */
function capsuleLimb(len, r, over) {
  const g = new THREE.CapsuleGeometry(r, len + over, 2, RAD);
  g.translate(0, -(len + over) / 2 + over, 0); // pivot at top, overshoot up
  return g;
}

/** Dark ball joint at the pivot — sealed bends in the game's dark tone. */
function jointBall(r) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  return g;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    // The game: CapsuleGeometry(bodyR, bodyH, 3, 6), wider at shoulders.
    const R = D.torsoR, H = D.torsoLen;
    const g = keep(new THREE.CapsuleGeometry(R, H * 0.72, 3, RAD));
    g.scale(1.06, 1, 0.82); // slightly flattened front-to-back like the game
    const m = new THREE.Mesh(g, mats.outfit);
    m.position.y = H * 0.5;
    return m;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.26, D.torsoR * 0.34, D.neckLen * 2.4, RAD)),
      mats.dark
    );
    m.position.y = D.neckLen * 0.4;
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    const R = D.headR;

    // Flattened sphere, 7×5 segments — straight from the game
    const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(R, 7, 5)), mats.skin);
    skull.scale.set(D.spec.headWidth, 0.92, 0.95);
    g.add(skull);

    // Pointy cone ears, rotated outward
    const earG = keep(new THREE.ConeGeometry(R * 0.25, R * 0.7, 4));
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(earG, mats.skin);
      ear.position.set(s * R * 0.95, R * 0.3, 0);
      ear.rotation.z = s * Math.PI * 0.35;
      g.add(ear);
    }

    // GLOWING eyes — MeshBasicMaterial, the game's signature
    const eyeG = keep(new THREE.SphereGeometry(R * 0.18, 4, 3));
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeG, mats.eye);
      eye.position.set(s * R * 0.38, R * 0.05, R * 0.82);
      g.add(eye);
    }

    // Cone nose
    const nose = new THREE.Mesh(keep(new THREE.ConeGeometry(R * 0.12, R * 0.35, 4)), mats.dark);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.set(0, -R * 0.1, R * 0.92);
    g.add(nose);

    if (cfg.hair === 'short' || cfg.hair === 'bun') {
      const cap = new THREE.Mesh(
        keep(new THREE.SphereGeometry(R * 1.02, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        mats.hair
      );
      cap.position.y = R * 0.1;
      g.add(cap);
      if (cfg.hair === 'bun') {
        const bun = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.3, 5, 4)), mats.hair);
        bun.position.set(0, R * 0.6, -R * 0.7);
        g.add(bun);
      }
    } else if (cfg.hair === 'cap') {
      const cap = new THREE.Mesh(
        keep(new THREE.SphereGeometry(R * 1.04, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        mats.accent
      );
      cap.position.y = R * 0.12;
      g.add(cap);
    }
    return g;
  },

  // thin capsule arms with dark ball joints — game proportions, articulated
  upperArm: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    const arm = new THREE.Mesh(keep(capsuleLimb(D.armUp, D.armUpR, D.armUpR * 0.6)), mats.outfit);
    grp.add(arm);
    grp.add(new THREE.Mesh(keep(jointBall(D.armUpR * 1.12)), mats.dark));
    return grp;
  },
  foreArm: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    const arm = new THREE.Mesh(keep(capsuleLimb(D.armLo, D.armLoR, D.armLoR * 0.6)), mats.skin);
    grp.add(arm);
    grp.add(new THREE.Mesh(keep(jointBall(D.armLoR * 1.08)), mats.dark));
    return grp;
  },
  hand: ({ D, mats, keep }) => {
    // mitten sphere hands — the game has no hands, these read at distance
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(D.handR * 1.05, 5, 4)), mats.dark);
    m.position.y = -D.handR * 0.4;
    m.scale.set(0.9, 1.1, 0.75);
    return m;
  },

  thigh: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    const leg = new THREE.Mesh(keep(capsuleLimb(D.legUp, D.legUpR, D.legUpR * 0.6)), mats.dark);
    grp.add(leg);
    grp.add(new THREE.Mesh(keep(jointBall(D.legUpR * 1.1)), mats.dark));
    return grp;
  },
  shin: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    const leg = new THREE.Mesh(keep(capsuleLimb(D.legLo, D.legLoR, D.legLoR * 0.6)), mats.dark);
    grp.add(leg);
    grp.add(new THREE.Mesh(keep(jointBall(D.legLoR * 1.08)), mats.dark));
    return grp;
  },
  foot: ({ D, mats, keep }) => {
    // chunky wedge feet, dark tone
    const g = keep(new THREE.BoxGeometry(D.footW * 1.7, D.footH * 1.5, D.footLen));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) { pos.setX(i, pos.getX(i) * 0.72); pos.setY(i, pos.getY(i) * 0.6); }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.dark);
    m.position.set(0, -D.footH + D.footH * 0.6, D.footLen * 0.22);
    return m;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  if (cfg.accessory === 'headband') {
    const b = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.headR * 1.0, D.headR * 1.0, D.headR * 0.22, RAD)), mats.accent
    );
    b.position.y = D.headR * 0.3;
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.CylinderGeometry(D.armLoR * 1.3, D.armLoR * 1.3, D.armLoR, RAD));
    for (const a of [j.armL, j.armR]) a.wrist.add(new THREE.Mesh(wg, mats.accent));
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.waistR * 1.08, D.waistR * 1.08, D.torsoLen * 0.12, RAD)), mats.accent
    );
    belt.position.y = D.torsoLen * 0.3;
    j.torso.add(belt);
  }
}

export default {
  id: 'goblinfit',
  name: 'Goblin-fit (game style)',
  blurb: 'The goblin-village characters as workout avatars: flat lambert capsules, pointy ears, glowing eyes, gene proportions — articulated for exercise.',
  spec, materials, parts, decorate,
};
