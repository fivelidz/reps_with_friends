// site/models/photo_avatars/index.js — PHOTO AVATARS registry.
//
// Prototype strip for docs/23_IMG2THREEJS_INVESTIGATION.md §3: three
// img2threejs-style code-only avatars (procedural THREE.Group factories with
// pivots, sockets and userData.tick idle — the skill's runtime contract),
// built from the img2threejs-showcase reference images by a LIGHTWEIGHT
// manual pass (palette-sampled + showcase text-analysis driven; the full
// vision-gated pipeline costs ~150k–350k tokens/avatar — see docs/23 §3.1).

export { createPanteraModel, PANTERA_DESC } from './pantera.js';
export { createMouseModel, MOUSE_DESC } from './mouse.js';
export { createMonsterModel, MONSTER_DESC } from './monster.js';

import { createPanteraModel, PANTERA_DESC } from './pantera.js';
import { createMouseModel, MOUSE_DESC } from './mouse.js';
import { createMonsterModel, MONSTER_DESC } from './monster.js';

export const PHOTO_AVATARS = [
  { ...PANTERA_DESC, create: createPanteraModel, spin: 0.25 },
  { ...MOUSE_DESC, create: createMouseModel, spin: 0.35 },
  { ...MONSTER_DESC, create: createMonsterModel, spin: 0.18 },
];
