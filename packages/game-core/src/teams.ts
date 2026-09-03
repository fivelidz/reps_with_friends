// @rwf/game-core — TEAM MODE SCAFFOLD (Engine v4)
//
// SOT §1.4 Mode 2 / flow 4.5: players are allocated to two or more sides,
// MINIMUM TWO PER TEAM, uneven sizes explicitly allowed (3v2, three teams
// of two, …). Each player keeps a PERSONAL adjusted target; individual
// completions still bank streaks (canonical). Exactly how team score is
// normalised is OPEN (SOT Q229-231 — "pooled adjusted reps versus average
// completion versus another normalisation method"), so the scoring rule is
// PLUGGABLE:
//
//   · pooled  — team score = Σ member progress RUF; win = first team whose
//               running total crosses the team target (target × team size).
//   · average — team score = mean member completion; win = first team at
//               100% average completion (i.e. all members finished).
//   · quota   — RESERVED (throws): the "best-N / team quota" family the SOT
//               lists as a candidate. Not implemented until Q229-231 close.
//
// Default rule = "average" (the uneven-team-fair reading). This module is a
// scaffold: it computes team results from a closed/ongoing day; it does not
// own day state (daily.ts does) or season standings (season.ts does).

import type { DailyBattleState } from "./daily.ts";
import { targetProgressOf, baseTargetOf, effectiveTargetOf } from "./daily.ts";
import { roundRuf } from "./ruf.ts";

export type TeamScoringRule = "pooled" | "average" | "quota";

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

export interface TeamModeConfig {
  teams: Team[];
  scoringRule: TeamScoringRule;
  /** Per-player RUF target for pooled team totals (default: the day's target). */
  targetRufPerPlayer?: number;
}

export const MIN_TEAM_SIZE = 2;

/** Structural validation. Uneven team sizes are ALLOWED (SOT §1.4). */
export function validateTeamMode(config: TeamModeConfig): string[] {
  const errors: string[] = [];
  if (config.teams.length < 2) errors.push("team mode needs at least two teams");
  const seen = new Set<string>();
  for (const t of config.teams) {
    if (t.playerIds.length < MIN_TEAM_SIZE)
      errors.push(`team ${t.id}: minimum ${MIN_TEAM_SIZE} players per side (SOT canonical)`);
    for (const id of t.playerIds) {
      if (seen.has(id)) errors.push(`player ${id} is on more than one team`);
      seen.add(id);
    }
  }
  return errors;
}

export interface TeamScoreRow {
  team: Team;
  /** Σ member target-progress RUF (pooled view — always computed). */
  pooledRuf: number;
  /** Mean member completion of personal target, % (average view — always computed). */
  avgCompletionPct: number;
  /** Members who crossed their personal target. */
  completedCount: number;
}

/** Team scores for a day, both normalisations computed regardless of rule. */
export function teamScores(day: DailyBattleState, config: TeamModeConfig): TeamScoreRow[] {
  quotaCheck(config); // reserved rule must throw even on reads
  return config.teams.map((team) => {
    const members = team.playerIds.filter((id) => day.progress[id] != null);
    const perTarget = config.targetRufPerPlayer ?? baseTargetOf(day);
    const pooled = members.reduce((sum, id) => sum + targetProgressOf(day, id), 0);
    const completion = members.reduce(
      (sum, id) => sum + Math.min(1, targetProgressOf(day, id) / effectiveTargetOf(day, id)),
      0
    );
    return {
      team,
      pooledRuf: roundRuf(pooled),
      avgCompletionPct: members.length === 0 ? 0 : roundRuf((completion / members.length) * 100),
      completedCount: members.filter((id) => day.progress[id].completedAt != null).length,
    };
  });
}

export interface TeamWinResult {
  teamId: string;
  crossedAt: number;
}

/**
 * Which team FIRST satisfied the day's win condition under the configured
 * rule (SOT flow 4.5 / open Q231 "what exact condition creates a Team Daily
 * Win" — these two readings are the live proposals):
 *
 *   pooled  — replay entries in time order; the first team whose running
 *             pooled RUF crosses (target × team size) wins.
 *   average — the first team whose LAST member completes (mean completion
 *             hits 100%) wins; crossedAt = that member's completion time.
 *
 * Returns null when no team crossed (everyone failed the condition).
 */
export function teamDailyWin(
  day: DailyBattleState,
  config: TeamModeConfig
): TeamWinResult | null {
  quotaCheck(config);
  const perTarget = config.targetRufPerPlayer ?? baseTargetOf(day);

  if (config.scoringRule === "average") {
    let best: TeamWinResult | null = null;
    for (const team of config.teams) {
      const members = team.playerIds.filter((id) => day.progress[id] != null);
      if (members.length === 0) continue;
      if (members.every((id) => day.progress[id].completedAt != null)) {
        const crossedAt = Math.max(...members.map((id) => day.progress[id].completedAt!));
        if (!best || crossedAt < best.crossedAt) best = { teamId: team.id, crossedAt };
      }
    }
    return best;
  }

  // pooled: replay the day chronologically
  const timeline = [...day.entries].sort((a, b) => a.at - b.at);
  const pooled: Record<string, number> = Object.fromEntries(config.teams.map((t) => [t.id, 0]));
  const teamOf = new Map<string, string>();
  for (const t of config.teams) for (const id of t.playerIds) teamOf.set(id, t.id);
  const thresholds = Object.fromEntries(
    config.teams.map((t) => [t.id, perTarget * t.playerIds.length])
  );
  for (const e of timeline) {
    const tid = teamOf.get(e.playerId);
    if (!tid) continue;
    pooled[tid] = roundRuf(pooled[tid] + e.ruf);
    if (pooled[tid] >= thresholds[tid]) return { teamId: tid, crossedAt: e.at };
  }
  return null;
}

function quotaCheck(config: TeamModeConfig): void {
  if (config.scoringRule === "quota")
    throw new Error(
      "quota team scoring is RESERVED — unimplemented until SOT Q229-231 (team normalisation) close"
    );
}
