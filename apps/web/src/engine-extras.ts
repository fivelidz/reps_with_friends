// Bridge to the lane-06 game-core modules: comeback / seasons / baseline.
//
// Lane 6 is landing `comeback.ts`, `season.ts` and `baseline.ts` in
// packages/game-core. This module re-exports them THROUGH our engine.ts
// re-export when they exist, and otherwise substitutes local fallbacks with
// the same documented behaviour — so the app always builds and demos.
//
// Detection is RUNTIME (namespace import + typeof/shape checks), NOT named
// imports: a named import of a not-yet-landed export fails the bundle while
// lane 6 is mid-flight. The moment lane 6 lands, a plain rebuild swaps every
// fallback for the real engine function with zero app-side changes.
//
// NOTE (lane 2): if lane 6's real signatures differ from the fallbacks below,
// adjust ONLY the delegation blocks in this file — app code never touches
// game-core season/comeback functions directly.
import * as core from "./engine.ts";
import { standings, type MatchState, type Player, type RepEntry } from "./engine.ts";

// ── comeback (×1.2 when >30% behind the leader, once per match) ──────────────

export const COMEBACK_MULTIPLIER: number =
  typeof (core as any).COMEBACK_MULTIPLIER === "number"
    ? (core as any).COMEBACK_MULTIPLIER
    : 1.2;

/** True when `score` is >30% behind `leaderScore` (and there's a score to chase). */
export function comebackEligible(score: number, leaderScore: number): boolean {
  const fn = (core as any).comebackEligible;
  if (typeof fn === "function") {
    try {
      const r = fn(score, leaderScore);
      if (typeof r === "boolean") return r;
    } catch {
      /* fall through to local rule */
    }
  }
  return leaderScore > 0 && score < leaderScore * 0.7;
}

/** Flag an entry as the player's once-per-match comeback set (×1.2). */
export function applyComeback(entry: RepEntry): RepEntry {
  const fn = (core as any).applyComeback;
  if (typeof fn === "function") {
    try {
      const r = fn(entry);
      if (r && typeof r === "object" && typeof (r as RepEntry).reps === "number") {
        return r as RepEntry;
      }
    } catch {
      /* fall through */
    }
  }
  return { ...entry, comeback: true };
}

/** Has this player already spent their once-per-match comeback? */
export function comebackUsed(playerId: string, entries: RepEntry[]): boolean {
  return entries.some((e) => e.playerId === playerId && (e as any).comeback === true);
}

/** Player is >30% behind the leader AND hasn't used their comeback yet. */
export function comebackArmed(match: MatchState, playerId: string): boolean {
  if (match.status !== "live") return false;
  if (comebackUsed(playerId, match.entries)) return false;
  const rows = standings(match);
  const leader = rows[0];
  const mine = rows.find((r) => r.player.id === playerId);
  if (!leader || !mine || leader.player.id === playerId) return false;
  return comebackEligible(mine.adjustedScore, leader.adjustedScore);
}

// ── seasons (4-week series: points, ladder, champion belt, streaks) ─────────

export interface SeasonConfig {
  id: string;
  name: string;
  weeks: number;
  startedAt: number; // epoch ms
}

export interface SeasonMatchRow {
  playerId: string;
  points: number;
  won: boolean;
}

export interface SeasonMatchResult {
  matchId: string;
  at: number;
  winnerId: string;
  mvpPlayerId?: string;
  rows: SeasonMatchRow[];
}

export interface SeasonForgiveness {
  playerId: string;
  day: string; // YYYY-MM-DD the streak was saved for
  at: number;
  amountCents: number;
}

export interface SeasonState {
  config: SeasonConfig;
  matches: SeasonMatchResult[];
  /** Streak-forgiveness top-ups ($2 each) → charity. */
  potCents: number;
  forgiven: SeasonForgiveness[];
  endedAt?: number;
  championId?: string;
}

export interface LadderRow {
  playerId: string;
  points: number;
  played: number;
  wins: number;
  mvps: number;
}

export const SEASON_WIN_POINTS = 3;
export const SEASON_PLAY_POINTS = 1;
export const SEASON_MVP_POINTS = 1;
export const FORGIVE_CENTS = 200; // "$2 to pot"

const isSeason = (x: unknown): x is SeasonState =>
  !!x && typeof x === "object" && Array.isArray((x as SeasonState).matches);

export function createSeason(config: SeasonConfig): SeasonState {
  const fn = (core as any).createSeason;
  if (typeof fn === "function") {
    try {
      const r = fn(config);
      if (isSeason(r)) return r;
    } catch {
      /* fall through */
    }
  }
  return { config, matches: [], potCents: 0, forgiven: [] };
}

/** Upsert a completed match's result into the season (keyed by matchId). */
export function recordSeasonMatch(season: SeasonState, result: SeasonMatchResult): SeasonState {
  const fn = (core as any).recordMatch;
  if (typeof fn === "function") {
    try {
      const r = fn(season, result);
      if (isSeason(r)) return r;
    } catch {
      /* fall through */
    }
  }
  return { ...season, matches: [...season.matches.filter((m) => m.matchId !== result.matchId), result] };
}

function ladderFromMatches(matches: SeasonMatchResult[]): LadderRow[] {
  const acc = new Map<string, LadderRow>();
  const touch = (pid: string): LadderRow => {
    let r = acc.get(pid);
    if (!r) {
      r = { playerId: pid, points: 0, played: 0, wins: 0, mvps: 0 };
      acc.set(pid, r);
    }
    return r;
  };
  for (const m of matches) {
    const counted = new Set<string>();
    for (const row of m.rows) {
      const r = touch(row.playerId);
      if (!counted.has(row.playerId)) {
        r.played++;
        counted.add(row.playerId);
      }
      r.points += row.points;
      if (row.won) r.wins++;
    }
    if (m.mvpPlayerId) touch(m.mvpPlayerId).mvps++;
  }
  return [...acc.values()].sort(
    (a, b) =>
      b.points - a.points || b.wins - a.wins || b.mvps - a.mvps || a.playerId.localeCompare(b.playerId)
  );
}

/** Aggregate ladder: points / played / wins / MVPs, best first. */
export function seasonLadder(season: SeasonState): LadderRow[] {
  const fn = (core as any).seasonLadder;
  if (typeof fn === "function") {
    try {
      const r = fn(season);
      if (
        Array.isArray(r) &&
        r.every((x: unknown) => !!x && typeof x === "object" && typeof (x as LadderRow).points === "number")
      ) {
        return r as LadderRow[];
      }
    } catch {
      /* fall through */
    }
  }
  return ladderFromMatches(season.matches);
}

export function todayKey(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Forgive a player's streak for today: $2 into the season pot, streak saved. */
export function forgiveStreak(season: SeasonState, playerId: string): SeasonState {
  const fn = (core as any).forgiveStreak;
  if (typeof fn === "function") {
    try {
      const r = fn(season, playerId);
      if (isSeason(r) && typeof r.potCents === "number") return r;
    } catch {
      /* fall through */
    }
  }
  const day = todayKey();
  if (season.forgiven.some((f) => f.playerId === playerId && f.day === day)) return season;
  return {
    ...season,
    potCents: season.potCents + FORGIVE_CENTS,
    forgiven: [...season.forgiven, { playerId, day, at: Date.now(), amountCents: FORGIVE_CENTS }],
  };
}

/** End the season: stamp the champion from the top of the ladder. */
export function endSeason(season: SeasonState): SeasonState {
  const fn = (core as any).endSeason;
  if (typeof fn === "function") {
    try {
      const r = fn(season);
      if (isSeason(r) && r.endedAt) return r;
    } catch {
      /* fall through */
    }
  }
  if (season.endedAt) return season;
  const top = ladderFromMatches(season.matches)[0];
  return { ...season, endedAt: Date.now(), championId: top?.playerId };
}

// ── baseline (wearables / %HRR — lane 07 data; no-op without HR entries) ────

export function updateBaseline(player: Player, entries: RepEntry[]): Player {
  const fn = (core as any).updateBaseline;
  if (typeof fn === "function") {
    try {
      const r = fn(player, entries);
      if (r && typeof r === "object" && typeof (r as Player).id === "string") return r as Player;
    } catch {
      /* fall through */
    }
  }
  return player; // app has no HR data yet — baseline learning is a no-op here
}
