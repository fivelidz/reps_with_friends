// @rwf/game-core — handicap scoring
// Thesis: effort and consistency compete, not raw fitness.
//
// v1 (MVP): tier multiplier — a "couch" player's reps are worth more than an
//   "athlete"'s. Self-set, adjustable; gaming it is socially punished (your
//   mates know what you can do) and history-corrected later.
// v2 (Phase 3): %HRR (Karvonen) ratio — reps × (your %HRR ÷ your baseline %HRR
//   for that exercise). Effort becomes measurable, not declared. See
//   docs/05_RESEARCH_WEARABLES.md.

import type { Player, RepEntry } from "./types.ts";

export const TIER_MULTIPLIERS: Record<Player["tier"], number> = {
  couch: 1.5,
  casual: 1.25,
  fit: 1.0,
  athlete: 0.85,
};

/** Weight of live HR evidence vs declared tier when both exist (v2 blend). */
const HRR_WEIGHT = 0.7;

export function tierMultiplier(player: Player): number {
  return TIER_MULTIPLIERS[player.tier];
}

/**
 * Effort multiplier for a single entry.
 * - v1: tier only.
 * - v2 blend: when the entry carries avgHrrPct AND the player has a baseline,
 *   blend the measured effort ratio with the tier prior.
 */
export function effortMultiplier(player: Player, entry: RepEntry): number {
  const tier = tierMultiplier(player);
  if (entry.avgHrrPct == null || player.baselineHrrPct == null) return tier;
  const hrrRatio = entry.avgHrrPct / player.baselineHrrPct;
  return HRR_WEIGHT * hrrRatio + (1 - HRR_WEIGHT) * tier;
}

/** Adjusted (handicapped) value of one logged entry. */
export function scoreEntry(player: Player, entry: RepEntry): number {
  return entry.reps * effortMultiplier(player, entry);
}

/** Total adjusted score across all of a player's entries. */
export function playerScore(player: Player, entries: RepEntry[]): number {
  return entries
    .filter((e) => e.playerId === player.id)
    .reduce((sum, e) => sum + scoreEntry(player, e), 0);
}

/** Raw rep total (drives match closure at targetReps). */
export function playerRawReps(playerId: string, entries: RepEntry[]): number {
  return entries
    .filter((e) => e.playerId === playerId)
    .reduce((sum, e) => sum + e.reps, 0);
}
