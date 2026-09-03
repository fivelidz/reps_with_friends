// @rwf/game-core — ARCHIVED v1–v3 SEASON MODULE ("season300")
//
// ARCHIVED 2026-09-03 when Engine v4 (the SOT daily-200 model) rewrote
// src/season.ts. This is the legacy 4-week season with 3/2/1 + MVP points,
// A/B division relegation and charity streak-forgiveness — the module the
// v1/v2/v3 app engine forks (apps/figma-app, apps/board, apps/v3) were built
// against. Kept verbatim and re-exported from index.ts so every existing
// consumer (tests, sims, forks) keeps running. Do not extend — new work
// goes in src/season.ts (Engine v4).

import type { Player } from "./types.ts";

export interface SeasonConfig {
  id: string;
  name: string;
  weeks: number; // default 4
}

export interface SeasonMatchResult {
  matchId: string;
  week: number;
  standings: { playerId: string; adjustedScore: number }[];
  mvpPlayerId?: string;
}

export interface SeasonState {
  config: SeasonConfig;
  players: Player[];
  week: number; // current week, 1..weeks
  points: Record<string, number>;
  results: SeasonMatchResult[];
  divisions: Record<"A" | "B", string[]>; // playerIds
  streaks: Record<string, { length: number; lastWeekPlayed: number | null }>;
  champion?: string;
  /** Charity top-ups used this season (playerId → cents). Once per player. */
  forgivenessUsed: Record<string, number>;
}

export const FORGIVE_MIN_CENTS = 200; // $2 minimum charity top-up

export function createSeason(config: SeasonConfig, players: Player[]): SeasonState {
  const ids = players.map((p) => p.id);
  return {
    config: { ...config, weeks: config.weeks ?? 4 },
    players,
    week: 1,
    points: Object.fromEntries(ids.map((id) => [id, 0])),
    results: [],
    divisions: { A: ids, B: [] },
    streaks: Object.fromEntries(
      ids.map((id) => [id, { length: 0, lastWeekPlayed: null as number | null }])
    ),
    forgivenessUsed: {},
  };
}

/** Points: 1st=3, 2nd=2, 3rd=1; MVP +1. Streak: played this week → +1. */
export function recordMatch(s: SeasonState, r: SeasonMatchResult): SeasonState {
  if (s.champion != null) throw new Error("season is over");
  const week = Math.min(Math.max(1, r.week), s.config.weeks);
  const points = { ...s.points };
  const streaks = { ...s.streaks };

  [...r.standings.slice(0, 3)].forEach((row, i) => {
    if (points[row.playerId] == null) return;
    points[row.playerId] += [3, 2, 1][i];
  });
  if (r.mvpPlayerId && points[r.mvpPlayerId] != null) points[r.mvpPlayerId] += 1;

  for (const p of s.players) {
    const played = r.standings.some((row) => row.playerId === p.id);
    if (!played) continue;
    const st = streaks[p.id] ?? { length: 0, lastWeekPlayed: null };
    streaks[p.id] =
      st.lastWeekPlayed === week
        ? st
        : { length: st.length + 1, lastWeekPlayed: week };
  }

  const nextWeek = s.results.length > 0 && week >= s.config.weeks ? s.config.weeks : week;
  return { ...s, points, streaks, results: [...s.results, r], week: nextWeek };
}

export interface LadderRow {
  playerId: string;
  points: number;
  played: number;
  wins: number;
  mvpCount: number;
}

export function seasonLadder(s: SeasonState): LadderRow[] {
  return s.players
    .map((p) => {
      let played = 0;
      let wins = 0;
      let mvpCount = 0;
      for (const r of s.results) {
        if (r.standings.some((row) => row.playerId === p.id)) played++;
        if (r.standings[0]?.playerId === p.id) wins++;
        if (r.mvpPlayerId === p.id) mvpCount++;
      }
      return { playerId: p.id, points: s.points[p.id] ?? 0, played, wins, mvpCount };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.mvpCount - a.mvpCount ||
        a.playerId.localeCompare(b.playerId)
    );
}

/** Charity top-up preserves a streak that would otherwise break. Once per season. */
export function forgiveStreak(
  s: SeasonState,
  playerId: string,
  charityCents: number
): SeasonState {
  if (charityCents < FORGIVE_MIN_CENTS)
    throw new Error(`forgiveness needs at least $${FORGIVE_MIN_CENTS / 100} to the pot`);
  if (s.forgivenessUsed[playerId] != null)
    throw new Error("streak forgiveness already used this season");
  const st = s.streaks[playerId];
  if (!st) throw new Error("player not in season");
  // Streak preserved at current length (no +1 — forgiveness, not a free play).
  return {
    ...s,
    forgivenessUsed: { ...s.forgivenessUsed, [playerId]: charityCents },
  };
}

/** Crown champion (top points) + relegate/promote between divisions. */
export function endSeason(s: SeasonState): SeasonState {
  if (s.results.length === 0) throw new Error("no matches recorded");
  const ladder = seasonLadder(s);
  const champion = ladder[0].playerId;

  // Relegation/promotion: bottom of A ↔ top of B (only if B is populated).
  let divisions = s.divisions;
  if (s.divisions.B.length > 0) {
    const aSorted = [...s.divisions.A].sort(
      (x, y) => (ladder.find((r) => r.playerId === y)?.points ?? 0) -
                (ladder.find((r) => r.playerId === x)?.points ?? 0)
    );
    const bSorted = [...s.divisions.B].sort(
      (x, y) => (ladder.find((r) => r.playerId === y)?.points ?? 0) -
                (ladder.find((r) => r.playerId === x)?.points ?? 0)
    );
    const relegated = aSorted[aSorted.length - 1];
    const promoted = bSorted[0];
    divisions = {
      A: [...aSorted.slice(0, -1), promoted],
      B: [...bSorted.slice(1), relegated],
    };
  }
  return { ...s, champion, divisions };
}
