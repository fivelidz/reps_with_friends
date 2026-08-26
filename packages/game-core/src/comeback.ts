// @rwf/game-core — comeback multiplier
// Mechanically enforces "everyone has a genuine shot": a player >30% behind
// the raw leader gets a one-time ×1.2 boost on their next entry.

import type { MatchState, RepEntry } from "./types.ts";
import { playerRawReps } from "./handicap.ts";

export const COMEBACK_MULTIPLIER = 1.2;
export const COMEBACK_THRESHOLD = 0.3; // >30% behind leader

export function comebackUsed(state: MatchState, playerId: string): boolean {
  return state.entries.some((e) => e.playerId === playerId && e.comeback);
}

export function comebackEligible(state: MatchState, playerId: string): boolean {
  if (state.status !== "live") return false;
  if (comebackUsed(state, playerId)) return false;
  const leader = Math.max(
    ...state.players.map((p) => playerRawReps(p.id, state.entries)),
    0
  );
  if (leader === 0) return false;
  const mine = playerRawReps(playerId, state.entries);
  return (leader - mine) / leader > COMEBACK_THRESHOLD;
}

/** Returns the entry tagged with comeback if eligible (once per player/match). */
export function applyComeback(state: MatchState, entry: RepEntry): RepEntry {
  return comebackEligible(state, entry.playerId)
    ? { ...entry, comeback: true }
    : entry;
}
