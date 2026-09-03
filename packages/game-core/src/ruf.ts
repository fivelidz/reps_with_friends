// @rwf/game-core — RUF: the internal scoring unit (Engine v4)
//
// ── INTERIM RULING (SOT §3.3 "RUF conflict" · open Q216) ────────────────────
// The SOT's earlier architecture used RUF (Reps With Friends Units) as the
// universal internal score; the latest product language says "adjusted reps".
// Interim interpretation (per docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md):
//
//   · Internally — in this engine's code, state, and tests — the unit is the
//     RUF: the HANDICAP-ADJUSTED value of a logged set
//     (physical reps × handicap effort multiplier × active power-up effects).
//   · Player-facing copy says "reps". No UI surface should ever print "RUF".
//
// This ruling stands until the product owner closes Q216; when it closes,
// rename here (one module) and keep every other call site on
// PLAYER_FACING_UNIT for display strings.

export const RUF_UNIT = "RUF" as const;

/** What the UI calls the unit. Player-facing copy is always "reps". */
export const PLAYER_FACING_UNIT = "reps" as const;

/**
 * Default daily battle target, in RUF (SOT §1.5: "working base target: 200
 * adjusted reps" — configurable per group, open Q222 keeps 200 the default).
 */
export const DEFAULT_DAILY_TARGET_RUF = 200;

/** Round a RUF amount to 2dp — the engine never carries floating fuzz. */
export function roundRuf(ruf: number): number {
  return Math.round(ruf * 100) / 100;
}

/** Player-facing display string: `rufToDisplay(184)` → "184 reps". */
export function rufToDisplay(ruf: number): string {
  const n = Number.isInteger(ruf) ? ruf.toString() : roundRuf(ruf).toString();
  return `${n} ${PLAYER_FACING_UNIT}`;
}
