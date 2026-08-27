/**
 * Style registry. Adding a style = writing one module and adding it here;
 * nothing else in the codebase needs to know it exists.
 */

import athletic from './athletic.js';
import chibi from './chibi.js';
import blocky from './blocky.js';
import lowpoly from './lowpoly.js';
import minimal from './minimal.js';
import gamelow from './gamelow.js';
import goblinfit from './goblinfit.js';
import dragon from './dragon.js';
import { solveDims, auditDims } from './rig-core.js';

export const STYLES = { athletic, chibi, blocky, lowpoly, minimal, gamelow, goblinfit, dragon };

/** Gallery order: the game look first — it is the current direction. */
export const STYLE_IDS = ['goblinfit', 'dragon', 'gamelow', 'athletic', 'lowpoly', 'blocky', 'chibi', 'minimal'];

export const STYLE_LIST = STYLE_IDS.map((id) => STYLES[id]);

export function getStyle(id) { return STYLES[id] ?? STYLES.athletic; }

/**
 * Proportion summary per style, for the gallery card labels. Computed from the
 * SAME solver the meshes use, so a label can never disagree with the render.
 */
export function styleSummary(id, build = 'average', height = 1) {
  const s = getStyle(id);
  const D = solveDims(s.spec, build, height);
  return {
    id: s.id, name: s.name, blurb: s.blurb, ignores: s.ignores ?? [],
    ...D.ratios,
    audit: auditDims(D),
  };
}

export default STYLES;
