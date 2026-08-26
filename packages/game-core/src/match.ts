// @rwf/game-core — match engine (300 format)

import type {
  MatchConfig,
  MatchState,
  Player,
  RepEntry,
  StandingRow,
} from "./types.ts";
import { playerRawReps, playerScore } from "./handicap.ts";

export function createMatch(
  config: MatchConfig,
  players: Player[]
): MatchState {
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("duplicate player ids");
  return {
    config,
    players,
    entries: [],
    status: "open",
  };
}

export function startMatch(state: MatchState, at = Date.now()): MatchState {
  if (state.status !== "open") throw new Error("match already started");
  return { ...state, status: "live", startedAt: at };
}

export interface LogResult {
  state: MatchState;
  /** True if this entry closed the match (player's raw total reached target). */
  closedMatch: boolean;
}

export function logReps(state: MatchState, entry: RepEntry): LogResult {
  if (state.status !== "live") throw new Error("match is not live");
  if (!state.players.some((p) => p.id === entry.playerId))
    throw new Error(`player ${entry.playerId} not in match`);
  if (!state.config.exercises.some((e) => e.id === entry.exerciseId))
    throw new Error(`exercise ${entry.exerciseId} not in match set`);
  if (!Number.isInteger(entry.reps) || entry.reps <= 0)
    throw new Error("reps must be a positive integer");

  const entries = [...state.entries, entry];
  const raw = playerRawReps(entry.playerId, entries);
  const target = state.config.targetReps;

  if (raw >= target) {
    return {
      state: {
        ...state,
        entries,
        status: "complete",
        completedAt: entry.at,
        closedBy: entry.playerId,
      },
      closedMatch: true,
    };
  }
  return { state: { ...state, entries }, closedMatch: false };
}

export function standings(state: MatchState): StandingRow[] {
  const target = state.config.targetReps;
  return state.players
    .map((player) => {
      const mine = state.entries.filter((e) => e.playerId === player.id);
      const raw = playerRawReps(player.id, state.entries);
      const verified = mine.filter((e) => e.verified).reduce((s, e) => s + e.reps, 0);
      return {
        player,
        rawReps: raw,
        adjustedScore: Math.round(playerScore(player, state.entries) * 10) / 10,
        progressPct: Math.min(100, Math.round((raw / target) * 1000) / 10),
        verifiedPct: raw === 0 ? 0 : Math.round((verified / raw) * 100),
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/**
 * Winner = highest ADJUSTED score at closure. The closer (first to raw target)
 * gets a small closure bonus — someone must have urgency to finish, but raw
 * speed alone shouldn't own the day.
 */
export const CLOSURE_BONUS = 15;

export function winner(state: MatchState): {
  playerId: string;
  adjustedScore: number;
  closedMatch: boolean;
} | null {
  if (state.status !== "complete") return null;
  // Apply the closure bonus, THEN rank — the bonus must be able to decide
  // the winner, so standings' pre-bonus ordering can't be trusted here.
  const rows = standings(state)
    .map((r) => ({
      ...r,
      adjustedScore:
        r.player.id === state.closedBy
          ? r.adjustedScore + CLOSURE_BONUS
          : r.adjustedScore,
    }))
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
  const top = rows[0];
  return {
    playerId: top.player.id,
    adjustedScore: top.adjustedScore,
    closedMatch: top.player.id === state.closedBy,
  };
}
