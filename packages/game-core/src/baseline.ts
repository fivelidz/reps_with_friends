// @rwf/game-core — baseline learning / anti-sandbagging
// Closes the self-reported tier loophole: baselines drift toward observed
// effort. HR path: baselineHrrPct drifts to rolling average (max 10%/update).
// No-HR path: consistently logging >1.3× your tier's expected volume drifts
// your tier one step fitter (max one step per call — callers gate per week).

import type { Player, RepEntry, FitnessTier } from "./types.ts";

const TIER_ORDER: FitnessTier[] = ["couch", "casual", "fit", "athlete"];

/** Expected weekly rep volume per tier (tunable; calibrated from play data later). */
export const TIER_EXPECTED_WEEKLY_REPS: Record<FitnessTier, number> = {
  couch: 150,
  casual: 250,
  fit: 400,
  athlete: 550,
};

const HR_DRIFT_MAX = 0.1; // max 10% per update
const VOLUME_SANDBAG_RATIO = 1.3;

export function updateBaseline(player: Player, recentEntries: RepEntry[]): Player {
  const mine = recentEntries.filter((e) => e.playerId === player.id);

  // HR path: drift baselineHrrPct toward rolling average.
  const hrSamples = mine.filter((e) => e.avgHrrPct != null) as (RepEntry & { avgHrrPct: number })[];
  if (hrSamples.length >= 3) {
    const avg = hrSamples.reduce((s, e) => s + e.avgHrrPct, 0) / hrSamples.length;
    const current = player.baselineHrrPct ?? avg;
    const next = current + (avg - current) * HR_DRIFT_MAX;
    return { ...player, baselineHrrPct: Math.round(next * 10) / 10 };
  }

  // Volume path: sandbagging check against tier expectations.
  const totalReps = mine.reduce((s, e) => s + e.reps, 0);
  const expected = TIER_EXPECTED_WEEKLY_REPS[player.tier];
  if (totalReps > expected * VOLUME_SANDBAG_RATIO) {
    const idx = TIER_ORDER.indexOf(player.tier);
    if (idx < TIER_ORDER.length - 1) {
      return { ...player, tier: TIER_ORDER[idx + 1] };
    }
  }
  return player;
}
