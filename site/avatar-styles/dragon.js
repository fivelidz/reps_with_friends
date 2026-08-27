/**
 * dragon.js — DRAGON avatars: a Tamagotchi-style creature that EVOLVES with
 * your fitness. Concept (founder's, from a prior game): dragons level through
 * health performance and activity — hatchling → fledgling → elder.
 *
 * In the gallery, the BUILD selector drives the evolution stage:
 *   slim   = HATCHLING  — round little thing, stub wings, no horns
 *   average= FLEDGLING  — balanced, nub horns, real wings
 *   heavy  = ELDER      — big wings, long horns, tail spikes, darker tone
 * In the product, the stage would come from the player's actual activity data
 * (matches played, effort %HRR, streaks) — the avatar IS the fitness record.
 *
 * Anatomy: a wyvern mapped onto the humanoid rig — the ARMS are the WINGS
 * (flap on jumping-jacks, press on push-ups), legs are chunky digitigrade
 * stilts, head carries snout + horns + glowing eyes, tail hangs off the
 * pelvis. Same lambert-flat game aesthetic as goblinfit.
 */

import * as THREE from 'three';

export const spec = {
  headCount: 3.8,        // chunky creature, not humanoid
  hipFrac: 0.44,
  neckFrac: 0.05,        // longer neck — dragons reach
  thighFrac: 0.5,
  ankleFrac: 0.05,
  upperArmFrac: 0.5,
  torsoRFrac: 0.125,
  shoulderFrac: 0.13,    // wide wing roots
  hipXFrac: 0.06,
  footFrac: 0.17,
  armThick: 0.22,        // thin wing bones
  legThick: 0.40,        // chunky legs
  headWidth: 1.0,
};

export const materials = ({ skin, outfit, accent, hair }) => {
  // The dragon is one scale colour (outfit) + belly/wing membrane (accent) +
  // darker limbs/horns. Eyes glow.
  const lam = (c, mult = 1) => new THREE.MeshLambertMaterial({
    color: new THREE.Color(c).multiplyScalar(mult),
  });
  return {
    skin: lam(outfit),          // scales
    outfit: lam(outfit),
    accent: lam(accent),        // wing membrane + belly
    dark: lam(outfit, 0.55),    // limbs, snout, horns base
    hair: lam(hair),
    horn: lam('#e8d9b0'),       // bone tone
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent) }),
  };
};

const RAD = 6;

/** Stage lookup: build selector → evolution stage params. */
function stageOf(build) {
  if (build === 'slim') return { name: 'hatchling', wing: 0.55, horn: 0, tail: 0.5, spikes: 0, headBoost: 1.15 };
  if (build === 'heavy') return { name: 'elder', wing: 1.35, horn: 1, tail: 1.25, spikes: 4, headBoost: 0.92 };
  return { name: 'fledgling', wing: 1.0, horn: 0.45, tail: 0.9, spikes: 0, headBoost: 1.0 };
}

function capsuleLimb(len, r, over) {
  const g = new THREE.CapsuleGeometry(r, len + over, 2, RAD);
  g.translate(0, -(len + over) / 2 + over, 0);
  return g;
}

/**
 * Wing: a bone arm (the rig drives it) + a membrane silhouette hung behind it.
 * Built as a flat Shape → ShapeGeometry, double-sided, in the accent colour.
 * Membrane spans shoulder→elbow→wingtip with scalloped trailing edge.
 */
function wingMembrane(len1, len2, span, mats, keep) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-span * 0.35, -len1 * 0.9);            // elbow-ish point
  s.lineTo(-span * 0.55, -len1 - len2 * 0.55);    // mid scallop dip
  s.lineTo(-span * 0.42, -len1 - len2 * 0.8);     // scallop peak
  s.lineTo(-span * 0.22, -len1 - len2);           // wingtip
  s.lineTo(0, -len1 - len2 * 0.6);                // inner edge back to wrist
  s.lineTo(0, 0);
  const g = keep(new THREE.ShapeGeometry(s, 4));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    color: mats.accent.color, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
  }));
  return m;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    const R = D.torsoR, H = D.torsoLen;
    const g = keep(new THREE.CapsuleGeometry(R, H * 0.7, 3, RAD));
    g.scale(1.0, 1, 0.9);
    const m = new THREE.Mesh(g, mats.skin);
    m.position.y = H * 0.5;
    // belly plate in accent — wraps the front
    const belly = new THREE.Mesh(
      keep(new THREE.CapsuleGeometry(R * 0.72, H * 0.55, 2, RAD)),
      mats.accent
    );
    belly.scale.set(1, 1, 0.42);
    belly.position.set(0, H * 0.48, R * 0.55);
    const grp = new THREE.Group();
    grp.add(m, belly);
    return grp;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.torsoR * 0.3, D.torsoR * 0.42, D.neckLen * 2.6, RAD)),
      mats.skin
    );
    m.position.y = D.neckLen * 0.5;
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const st = stageOf(cfg.build ?? 'average');
    const g = new THREE.Group();
    const R = D.headR * st.headBoost;

    const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(R, 7, 5)), mats.skin);
    skull.scale.set(1.0, 0.9, 1.1);
    g.add(skull);

    // SNOUT — box muzzle + nostril bumps
    const snout = new THREE.Mesh(keep(new THREE.BoxGeometry(R * 0.7, R * 0.5, R * 0.9)), mats.dark);
    snout.position.set(0, -R * 0.12, R * 0.95);
    g.add(snout);
    const nostril = keep(new THREE.SphereGeometry(R * 0.08, 4, 3));
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(nostril, mats.horn);
      n.position.set(s * R * 0.2, R * 0.02, R * 1.35);
      g.add(n);
    }

    // GLOWING eyes
    const eyeG = keep(new THREE.SphereGeometry(R * 0.16, 4, 3));
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(eyeG, mats.eye);
      eye.position.set(s * R * 0.45, R * 0.12, R * 0.62);
      g.add(eye);
    }

    // HORNS — cones at the back of the skull, stage-scaled
    if (st.horn > 0) {
      const hornG = keep(new THREE.ConeGeometry(R * 0.14, R * (0.5 + st.horn * 0.9), 5));
      for (const s of [1, -1]) {
        const horn = new THREE.Mesh(hornG, mats.horn);
        horn.position.set(s * R * 0.42, R * 0.72, -R * 0.25);
        horn.rotation.set(-0.5, 0, s * 0.45);
        g.add(horn);
      }
      if (st.horn >= 1) { // elder brow horns
        const browG = keep(new THREE.ConeGeometry(R * 0.1, R * 0.45, 4));
        for (const s of [1, -1]) {
          const b = new THREE.Mesh(browG, mats.horn);
          b.position.set(s * R * 0.55, R * 0.35, R * 0.35);
          b.rotation.x = 0.4;
          g.add(b);
        }
      }
    }

    // EARS/fins for the hatchling (no horns yet — it has fin ears instead)
    if (st.horn === 0) {
      const finG = keep(new THREE.ConeGeometry(R * 0.2, R * 0.55, 4));
      for (const s of [1, -1]) {
        const f = new THREE.Mesh(finG, mats.accent);
        f.position.set(s * R * 0.85, R * 0.3, 0);
        f.rotation.z = s * Math.PI * 0.4;
        g.add(f);
      }
    }
    return g;
  },

  // WINGS on the arm chain: bone + membrane. The solver's arm rotations flap them.
  upperArm: ({ D, cfg, mats, keep }) => {
    const st = stageOf(cfg.build ?? 'average');
    const grp = new THREE.Group();
    const bone = new THREE.Mesh(keep(capsuleLimb(D.armUp, D.armUpR, D.armUpR * 0.6)), mats.dark);
    grp.add(bone);
    grp.add(new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.armUpR * 1.15, 0)), mats.dark));
    const mem = wingMembrane(D.armUp, D.armLo, D.armUp * 2.2 * st.wing, mats, keep);
    mem.rotation.y = Math.PI / 2; // membrane hangs behind the bone
    grp.add(mem);
    return grp;
  },
  foreArm: ({ D, cfg, mats, keep }) => {
    const st = stageOf(cfg.build ?? 'average');
    const grp = new THREE.Group();
    const bone = new THREE.Mesh(keep(capsuleLimb(D.armLo, D.armLoR, D.armLoR * 0.6)), mats.dark);
    grp.add(bone);
    grp.add(new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.armLoR * 1.1, 0)), mats.dark));
    const mem = wingMembrane(D.armLo, D.armLo * 0.6, D.armLo * 1.9 * st.wing, mats, keep);
    mem.rotation.y = Math.PI / 2;
    grp.add(mem);
    return grp;
  },
  hand: ({ D, mats, keep }) => {
    // wing CLAW — one little hook at the wrist
    const m = new THREE.Mesh(keep(new THREE.ConeGeometry(D.handR * 0.4, D.handR * 1.6, 4)), mats.horn);
    m.position.y = -D.handR * 0.5;
    m.rotation.x = Math.PI; // points down
    return m;
  },

  // chunky digitigrade legs
  thigh: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(keep(capsuleLimb(D.legUp, D.legUpR, D.legUpR * 0.6)), mats.dark));
    grp.add(new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.legUpR * 1.12, 0)), mats.dark));
    return grp;
  },
  shin: ({ D, mats, keep }) => {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(keep(capsuleLimb(D.legLo, D.legLoR, D.legLoR * 0.6)), mats.dark));
    grp.add(new THREE.Mesh(keep(new THREE.IcosahedronGeometry(D.legLoR * 1.1, 0)), mats.dark));
    return grp;
  },
  foot: ({ D, mats, keep }) => {
    // big reptile foot + toe claws
    const g = keep(new THREE.BoxGeometry(D.footW * 1.9, D.footH * 1.4, D.footLen * 1.1));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) { pos.setX(i, pos.getX(i) * 0.7); pos.setY(i, pos.getY(i) * 0.55); }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const grp = new THREE.Group();
    const foot = new THREE.Mesh(g, mats.dark);
    foot.position.set(0, -D.footH + D.footH * 0.6, D.footLen * 0.24);
    grp.add(foot);
    const clawG = keep(new THREE.ConeGeometry(D.footW * 0.22, D.footW * 0.7, 4));
    for (const x of [-0.5, 0, 0.5]) {
      const claw = new THREE.Mesh(clawG, mats.horn);
      claw.position.set(x * D.footW, -D.footH * 0.5, D.footLen * 0.85);
      claw.rotation.x = Math.PI / 2.2;
      grp.add(claw);
    }
    return grp;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  const st = stageOf(cfg.build ?? 'average');

  // TAIL — tapered cone chain off the pelvis, stage-scaled
  const tailLen = D.H * 0.42 * st.tail;
  const segs = 4;
  let parent = j.pelvis;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const seg = new THREE.Mesh(
      keep(new THREE.CapsuleGeometry(D.torsoR * (0.42 - t * 0.3), tailLen / segs, 2, RAD)),
      mats.skin
    );
    seg.position.set(0, -tailLen / segs * 0.4, -D.torsoR * 0.5 - (tailLen / segs) * 0.8);
    seg.rotation.x = 0.5 + t * 0.35; // curves down and back
    const holder = new THREE.Group();
    holder.add(seg);
    if (i === 0) { j.pelvis.add(holder); parent = holder; }
    else parent.add(holder);
    parent = holder;
    // elder: tail spikes
    if (st.spikes > 0 && i < st.spikes) {
      const spike = new THREE.Mesh(keep(new THREE.ConeGeometry(D.torsoR * 0.08, D.torsoR * 0.3, 4)), mats.horn);
      spike.position.y = D.torsoR * 0.35;
      holder.add(spike);
    }
  }

  if (cfg.accessory === 'headband') {
    const b = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.headR * 1.0, D.headR * 1.0, D.headR * 0.2, RAD)), mats.accent
    );
    b.position.y = D.headR * 0.25;
    j.head.add(b);
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(D.waistR * 1.1, D.waistR * 1.1, D.torsoLen * 0.12, RAD)), mats.accent
    );
    belt.position.y = D.torsoLen * 0.28;
    j.torso.add(belt);
  }
}

export default {
  id: 'dragon',
  name: 'Dragon (evolves)',
  blurb: 'Tamagotchi dragon: hatchling → fledgling → elder via the BUILD selector (in-product: your activity data). Wings flap on jumping-jacks, wyvern push-ups, glowing eyes.',
  spec, materials, parts, decorate,
};
