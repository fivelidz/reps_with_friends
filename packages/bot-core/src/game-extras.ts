// @rwf/bot-core — bridge to lane 6's game-core extras (comeback + season).
//
// Lane 6 is adding to @rwf/game-core, in parallel with this lane:
//   comeback.ts — COMEBACK_MULTIPLIER=1.2, comebackEligible, applyComeback,
//                 RepEntry.comeback
//   season.ts   — createSeason, recordMatch, seasonLadder, forgiveStreak,
//                 endSeason (SeasonState / SeasonConfig / SeasonMatchResult)
//   baseline.ts — updateBaseline
//
// Those exports may not exist yet while the lanes race, so we bind via a
// dynamic import (missing named exports are simply `undefined` on the
// namespace — no throw) and fall back to local prototypes with the same
// names and semantics. The moment lane 6 lands, the real implementations
// take over automatically — no changes needed here. Every lane-6 call is
// wrapped so a signature drift degrades to the local path instead of
// breaking the bot.

import type { MatchState, StandingRow } from "@rwf/game-core";
import { standings } from "@rwf/game-core";

const gameCore: any = await import("@rwf/game-core");

/** Which engine is actually serving each feature (for logs/sims). */
export const usingLane6Comeback = typeof gameCore?.comebackEligible === "function";
export const usingLane6Season =
  typeof gameCore?.createSeason === "function" &&
  typeof gameCore?.recordMatch === "function" &&
  typeof gameCore?.seasonLadder === "function";

// ── comeback ────────────────────────────────────────────────────────────────

/** Lane-6 constant when present; spec value (1.2) as the local fallback. */
export const COMEBACK_MULTIPLIER: number =
  typeof gameCore?.COMEBACK_MULTIPLIER === "number" ? gameCore.COMEBACK_MULTIPLIER : 1.2;

/**
 * Is this player comeback-eligible? Prefers lane-6 `comebackEligible(state,
 * playerId)`; local rule (matching the lane-6 spec) until it lands: live
 * match, 2+ players, and the player is >30% of progress behind the leader.
 */
export function comebackEligible(state: MatchState, playerId: string): boolean {
  if (usingLane6Comeback) {
    try {
      const r = gameCore.comebackEligible(state, playerId);
      if (typeof r === "boolean") return r;
    } catch {
      /* signature drift — local rule below */
    }
  }
  if (state.status !== "live" || state.players.length < 2) return false;
  const rows = standings(state);
  const leader = rows[0]?.progressPct ?? 0;
  const mine = rows.find((r) => r.player.id === playerId)?.progressPct ?? 0;
  return leader - mine > 30;
}

/** Player ids in `state` that are comeback-eligible right now. */
export function comebackEligibleIds(state: MatchState): Set<string> {
  const ids = new Set<string>();
  for (const p of state.players) {
    if (comebackEligible(state, p.id)) ids.add(p.id);
  }
  return ids;
}

// ── season (local prototype shapes; lane-6 types replace these at the call
//    sites below — everything is duck-typed through the wrappers) ────────────

export interface SeasonMatchResult {
  matchId: string;
  winnerId: string;
  at: number;
  rows: { playerId: string; name: string; adjustedScore: number; rawReps: number }[];
}

export interface SeasonConfig {
  name?: string;
  lengthWeeks?: number;
}

export interface SeasonState {
  id: string;
  name: string;
  startedAt: number;
  matches: SeasonMatchResult[];
  endedAt?: number;
}

/** Start a season — lane-6 `createSeason(config)` when available. */
export function createSeason(config: SeasonConfig = {}): SeasonState {
  if (usingLane6Season) {
    try {
      const s = gameCore.createSeason(config);
      if (s && typeof s === "object") return s as SeasonState;
    } catch {
      /* fall through to local */
    }
  }
  return {
    id: `season-${Date.now().toString(36)}`,
    name: config.name ?? "Season 1",
    startedAt: Date.now(),
    matches: [],
  };
}

/** Record a completed match into a season — lane-6 `recordMatch(season, result)`. */
export function recordMatch(season: SeasonState, result: SeasonMatchResult): SeasonState {
  if (usingLane6Season) {
    try {
      const s = gameCore.recordMatch(season, result);
      if (s && typeof s === "object") return s as SeasonState;
    } catch {
      /* fall through to local */
    }
  }
  return { ...season, matches: [...season.matches, result] };
}

export interface LadderRow {
  name: string;
  points: number;
  wins?: number;
  played?: number;
}

/** Season ladder — lane-6 `seasonLadder(season)`, normalised to LadderRow[]. */
export function seasonLadder(season: SeasonState): LadderRow[] {
  if (usingLane6Season) {
    try {
      const rows = gameCore.seasonLadder(season);
      if (Array.isArray(rows)) {
        return rows.map((r: any) => ({
          name: String(r?.player?.name ?? r?.name ?? r?.playerId ?? "?"),
          points: Number(r?.points ?? r?.score ?? r?.pts ?? 0),
          wins: r?.wins != null ? Number(r.wins) : undefined,
          played: r?.matches != null ? Number(r.matches) : r?.played != null ? Number(r.played) : undefined,
        }));
      }
    } catch {
      /* fall through to local */
    }
  }
  // local ladder: 3 pts per win, 1 pt per played match
  const agg = new Map<string, LadderRow & { id: string }>();
  for (const m of season.matches ?? []) {
    for (const r of m.rows ?? []) {
      const cur = agg.get(r.playerId) ?? { id: r.playerId, name: r.name, points: 0, wins: 0, played: 0 };
      cur.name = r.name; // latest spelling wins
      cur.played = (cur.played ?? 0) + 1;
      cur.points += 1;
      if (m.winnerId === r.playerId) {
        cur.wins = (cur.wins ?? 0) + 1;
        cur.points += 3;
      }
      agg.set(r.playerId, cur);
    }
  }
  return [...agg.values()].sort((a, b) => b.points - a.points);
}
