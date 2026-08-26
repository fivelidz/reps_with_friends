// @rwf/game-core — domain types
// The "300" format: a group agrees on a set of exercises; any reps, any order,
// any mix; the match closes when someone's RAW total hits the target (default
// 300). The WINNER is the highest HANDICAPPED (effort-adjusted) score at
// closure — the fittest player closing the match doesn't guarantee winning it.

export type FitnessTier = "couch" | "casual" | "fit" | "athlete";

export interface Exercise {
  id: string;
  name: string;
}

export interface Player {
  id: string;
  name: string;
  /** Self-set fitness tier (v1 handicap input). Adjustable, anti-gaming via history. */
  tier: FitnessTier;
  /** Optional: player's baseline %HRR for effort scoring (Phase 3, %HRR handicap v2). */
  baselineHrrPct?: number;
}

export interface RepEntry {
  playerId: string;
  exerciseId: string;
  reps: number;
  at: number; // epoch ms
  /** Camera pose-counted (MoveNet/BlazePose) or HR cross-checked. */
  verified: boolean;
  /** Average %HRR (Karvonen) during the set, if a strap/watch was connected. */
  avgHrrPct?: number;
  /** Comeback multiplier applied (once per player per match, when >30% behind). */
  comeback?: boolean;
}

export type MatchStatus = "open" | "live" | "complete";

export interface MatchConfig {
  id: string;
  exercises: Exercise[];
  targetReps: number; // default 300
  /** Days of week the group committed to (0=Sun). Groups pick their days. */
  playDays: number[];
}

export interface MatchState {
  config: MatchConfig;
  players: Player[];
  entries: RepEntry[];
  status: MatchStatus;
  startedAt?: number;
  completedAt?: number;
  closedBy?: string; // playerId whose raw total hit target
}

export interface StandingRow {
  player: Player;
  rawReps: number;
  adjustedScore: number;
  progressPct: number;
  verifiedPct: number;
}

// ── Charity pot (no cash to winner — winner directs the pot) ────────────────

export interface PotContribution {
  playerId: string;
  amountCents: number;
}

export interface CharityPot {
  id: string;
  matchId: string;
  contributions: PotContribution[];
  /** Winner's chosen charity from the championed set. */
  designatedCharityId?: string;
}

export interface Charity {
  id: string;
  name: string;
}
