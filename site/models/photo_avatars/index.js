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
export { createBeaconModel, BEACON_DESC } from './generated/beacon.js';

import { createPanteraModel, PANTERA_DESC } from './pantera.js';
import { createMouseModel, MOUSE_DESC } from './mouse.js';
import { createMonsterModel, MONSTER_DESC } from './monster.js';
import { createBeaconModel, BEACON_DESC } from './generated/beacon.js';

export const PHOTO_AVATARS = [
  { ...PANTERA_DESC, create: createPanteraModel, spin: 0.25 },
  { ...MOUSE_DESC, create: createMouseModel, spin: 0.35 },
  { ...MONSTER_DESC, create: createMonsterModel, spin: 0.18 },
  // #4 — first REAL vision-driven run (docs/23 §5): glm-4.6v intake →
  // glm-5.3 codegen → pixel gate 11/11 + glm review 0.95/pass.
  { ...BEACON_DESC, create: createBeaconModel, spin: 0.22 },
];

// ── PHOTO BOOTH avatars (apps/booth, /api/booth) ─────────────────────────────
// Generated on this machine from selfies/Photos (palette + silhouette only —
// no likeness). The pipeline appends to booth_index.json; this loader pulls it
// with no-cache so freshly generated busts appear in the strip on next visit.
// Every module follows the same contract (createBoothModel + BOOTH_DESC), so
// the strip needs no per-avatar wiring. Entries marked in the localStorage set
// `rwf_my_booth_avatars` (the booth's ADD TO MY AVATARS) get the YOURS badge.
export async function loadBoothAvatars() {
  try {
    const r = await fetch('/models/photo_avatars/booth_index.json', { cache: 'no-cache' });
    if (!r.ok) return [];
    const { avatars = [] } = await r.json();
    const out = [];
    for (const e of avatars) {
      try {
        const mod = await import(`/models/photo_avatars/${e.module}`);
        if (typeof mod.createBoothModel !== 'function') continue;
        out.push({
          id: e.id, name: e.name, blurb: e.blurb, module: e.module,
          create: mod.createBoothModel, spin: 0.22, booth: true, mode: e.mode,
        });
      } catch { /* module missing — skip, keep the strip alive */ }
    }
    return out;
  } catch { return []; }
}
