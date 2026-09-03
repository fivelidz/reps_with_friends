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
import { COMEBACK_MULTIPLIER } from "./comeback.ts";

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
  const base = entry.reps * effortMultiplier(player, entry);
  return entry.comeback ? base * COMEBACK_MULTIPLIER : base;
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

// ── Engine v4 (SOT daily-200 model) ─────────────────────────────────────────
//
// SOT §3.2 conflict note: "earlier concepts sometimes changed player targets
// rather than rep value; latest direction specifically says the handicap
// multiplier changes what reps are worth." Our tier multipliers ALREADY do
// exactly that (scoreEntry multiplies rep value), so v4 keeps them and the
// daily battle races everyone to the same ADJUSTED (RUF) target.

/**
 * The player-facing PHYSICAL rep target implied by a RUF target: the number
 * of raw reps this player must log for their adjusted total to reach
 * `targetRuf` (physical × multiplier = RUF, so physical = target ÷ multiplier).
 * A couch player (×1.5) faces ~134 physical reps for a 200-RUF target; an
 * athlete (×0.85) faces ~236.
 */
export function dailyTargetAdjusted(targetRuf: number, multiplier: number): number {
  if (multiplier <= 0) throw new Error("multiplier must be positive");
  return Math.ceil(targetRuf / multiplier);
}

/**
 * Recalibration hook (SOT §3.2 "Recalibration" / flow 4.7, open Q217-221:
 * starting formula, trigger and season-boundary behaviour are all undecided).
 * Default implementation is a NO-OP returning the player's current multiplier.
 * Wire a real formula here once the product owner rules — the season layer
 * is expected to call this at season boundaries only.
 */
export function recalibrateMultiplier(
  player: Player,
  _history?: RepEntry[]
): number {
  return tierMultiplier(player);
}
