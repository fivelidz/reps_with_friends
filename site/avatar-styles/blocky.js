/**
 * blocky.js — voxel / Minecraft-adjacent.
 *
 * 4.5 heads tall (the classic blocky-game ratio: chunkier than a human, far
 * short of chibi). Everything is a BoxGeometry, flat-shaded, zero smoothing.
 *
 * Why this style is worth having: it is by far the cheapest to render (12
 * triangles a limb), it stays legible at 32px where the smooth styles turn to
 * mush, and its silhouette survives any colour scheme. The tradeoff is that
 * boxes hide bad posing — hence the proportion audit in rig-core runs on this
 * style too, and the same IK drives it, so it cannot quietly drift.
 *
 * Limb boxes are sized off torso WIDTH rather than torso radius so the "arms
 * thinner than the torso" rule reads correctly for a rectangular chest.
 */

import * as THREE from 'three';
import { flatMat } from './rig-core.js';

export const spec = {
  headCount: 4.5,
  hipFrac: 0.470,
  neckFrac: 0.026,
  thighFrac: 0.500,
  ankleFrac: 0.030,
  upperArmFrac: 0.500,   // blocky arms split evenly — reads as "two blocks"
  torsoRFrac: 0.098,
  shoulderFrac: 0.100,
  hipXFrac: 0.044,
  footFrac: 0.130,
  armThick: 0.40,
  legThick: 0.50,
  headWidth: 1.0,
};

export const materials = ({ skin, outfit, accent, hair }) => ({
  skin: flatMat(skin), outfit: flatMat(outfit), accent: flatMat(accent, 0.16), hair: flatMat(hair),
  eye: flatMat('#16181c', 0), white: flatMat('#f2f4f6', 0.1),
});

/** A box whose TOP face sits at y=0 and which hangs down — matches bone convention. */
function hang(w, h, d, keep) {
  const g = keep(new THREE.BoxGeometry(w, h, d));
  g.translate(0, -h / 2, 0);
  return g;
}

export const parts = {
  torso: ({ D, mats, keep }) => {
    const w = D.torsoR * 2.0 * (0.98 + D.buildMod.waist * 0.06);
    const g = new THREE.Group();
    // Two stacked blocks: chest (wider) and waist. Two beats one — a single box
    // torso has no waistline at all and the builds become indistinguishable.
    const chest = new THREE.Mesh(hang(w, D.torsoLen * 0.56, D.torsoR * 1.20, keep), mats.outfit);
    chest.position.y = D.torsoLen;
    g.add(chest);
    const waist = new THREE.Mesh(
      hang(w * 0.88 * D.buildMod.waist, D.torsoLen * 0.46, D.torsoR * 1.10 * D.buildMod.waist, keep), mats.accent
    );
    waist.position.y = D.torsoLen * 0.46;
    g.add(waist);
    return g;
  },

  neck: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(hang(D.torsoR * 0.66, D.neckLen * 1.6, D.torsoR * 0.66, keep), mats.skin);
    m.position.y = D.neckLen * 1.4;
    return m;
  },

  head: ({ D, cfg, mats, keep }) => {
    const g = new THREE.Group();
    const s = D.headR * 2;
    const cube = new THREE.Mesh(keep(new THREE.BoxGeometry(s, s, s * 0.96)), mats.skin);
    g.add(cube);

    // Flat quads pinned just proud of the face — the voxel-game eye.
    const wG = keep(new THREE.BoxGeometry(s * 0.17, s * 0.17, s * 0.03));
    const pG = keep(new THREE.BoxGeometry(s * 0.085, s * 0.17, s * 0.04));
    for (const side of [1, -1]) {
      const w = new THREE.Mesh(wG, mats.white);
      w.position.set(side * s * 0.20, s * 0.06, s * 0.485);
      g.add(w);
      const p = new THREE.Mesh(pG, mats.eye);
      p.position.set(side * s * 0.24, s * 0.06, s * 0.495);
      g.add(p);
    }
    const mouth = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 0.24, s * 0.06, s * 0.03)), mats.eye);
    mouth.position.set(0, -s * 0.20, s * 0.485);
    g.add(mouth);

    if (cfg.hair !== 'none') {
      const mat = cfg.hair === 'cap' ? mats.accent : mats.hair;
      // A shell: slab on top plus a thin band round the back/sides. Cheaper and
      // crisper than trying to carve a fringe out of voxels.
      const top = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 1.04, s * 0.22, s * 1.00)), mat);
      top.position.y = s * 0.42;
      g.add(top);
      const back = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 1.04, s * 0.52, s * 0.16)), mat);
      back.position.set(0, s * 0.16, -s * 0.46);
      g.add(back);
      if (cfg.hair === 'cap') {
        const peak = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 1.00, s * 0.07, s * 0.34)), mats.accent);
        peak.position.set(0, s * 0.33, s * 0.62);
        g.add(peak);
      }
      if (cfg.hair === 'bun') {
        const bun = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 0.34, s * 0.34, s * 0.34)), mats.hair);
        bun.position.set(0, s * 0.62, -s * 0.52);
        g.add(bun);
      }
    }
    return g;
  },

  upperArm: ({ D, mats, keep }) => {
    const w = D.armUpR * 2;
    return new THREE.Mesh(hang(w, D.armUp, w, keep), mats.skin);
  },
  foreArm: ({ D, mats, keep }) => {
    const w = D.armLoR * 2;
    return new THREE.Mesh(hang(w, D.armLo, w, keep), mats.skin);
  },
  hand: ({ D, mats, keep }) => {
    const w = D.handR * 1.7;
    const m = new THREE.Mesh(hang(w, w * 1.1, w * 0.85, keep), mats.skin);
    return m;
  },

  thigh: ({ D, mats, keep }) => {
    const w = D.legUpR * 2;
    return new THREE.Mesh(hang(w, D.legUp, w, keep), mats.accent);
  },
  shin: ({ D, mats, keep }) => {
    const w = D.legLoR * 2;
    return new THREE.Mesh(hang(w, D.legLo, w, keep), mats.skin);
  },
  foot: ({ D, mats, keep }) => {
    const m = new THREE.Mesh(
      keep(new THREE.BoxGeometry(D.footW * 2.0, D.footH * 1.5, D.footLen * 0.9)), mats.outfit
    );
    m.position.set(0, -D.footH + D.footH * 0.75, D.footLen * 0.16);
    return m;
  },
};

export function decorate({ D, cfg, mats, keep }, j) {
  const s = D.headR * 2;
  if (cfg.accessory === 'headband') {
    const b = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 1.03, s * 0.13, s * 1.00)), mats.accent);
    b.position.y = s * 0.26;
    j.head.add(b);
  } else if (cfg.accessory === 'wristbands') {
    const wg = keep(new THREE.BoxGeometry(D.armLoR * 2.3, D.armLoR * 1.1, D.armLoR * 2.3));
    for (const a of [j.armL, j.armR]) a.wrist.add(new THREE.Mesh(wg, mats.accent));
  } else if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.BoxGeometry(D.torsoR * 2.1 * D.buildMod.waist, D.torsoLen * 0.10, D.torsoR * 1.25)), mats.eye
    );
    belt.position.y = D.torsoLen * 0.50;
    j.torso.add(belt);
  }
}

export default {
  id: 'blocky',
  name: 'Blocky voxel',
  blurb: 'Clean boxes, flat-shaded, Minecraft-adjacent. Cheapest to render and the most readable at small sizes.',
  spec, materials, parts, decorate,
};
