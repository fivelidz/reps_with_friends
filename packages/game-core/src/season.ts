// @rwf/game-core — BATTLE SEASONS + STAKES (Engine v4 · SOT model)
//
// Supersedes the archived 4-week/3-2-1 season (src/legacy300.ts). Canonical
// per the master Source of Truth (§1.6, §1.7, §3.7, flows 4.13–4.16):
//
//   · Weekly season is the DEFAULT (rapid resets, comeback narrative);
//     Monthly is the opt-in longer cycle. Both are the SAME engine — the
//     only difference is how many play days the group schedules.
//   · Standings = DAILY WIN COUNT. One Daily Win = one season point (1:1,
//     open Q223 ruled clean-default). Ties are OPEN (Q224): they are
//     recorded as ties on the season + stake resolution; no tiebreaker.
//   · Stakes resolve at SEASON end, never on a day. Four types: dinner,
//     dare, deliverable, charity pot. A stake object carries declaration,
//     value, per-player agreement states, resolution (winner / responsible
//     loser(s) = fewest Daily Wins, ties joint), and fulfilment states.
//   · Charity: contributions are POINTS for the trial (money later per the
//     SOT — legal/payment review outstanding), the winner DIRECTS the pot
//     to an eligible charity, and a disclosed platform-fee field rides
//     along (rate TBD — 0 for the trial).
//
// The legacy module stays exported (index.ts → legacy300.ts) for the v1/v2/v3
// app forks; do not port this file into those forks.

import type { Player } from "./types.ts";
import { DEFAULT_DAILY_TARGET_RUF } from "./ruf.ts";
import { DOUBLE_DOWN_REWARD_MULTIPLIER } from "./powerups.ts";
import { doubleDownFinishers } from "./daily.ts";

// ── Season ──────────────────────────────────────────────────────────────────

export type SeasonLength = "weekly" | "monthly";

export interface BattleSeasonConfig {
  id: string;
  name: string;
  /**
   * Weekly is the SOT DEFAULT; monthly is the same engine, longer arc.
   * Omit for weekly.
   */
  length?: SeasonLength;
  /** Agreed active days (0=Sun … 6=Sat) — rest days never break streaks. */
  playDays: number[];
  /** Default daily target in RUF (default 200, SOT §1.5 / Q222). */
  targetReps?: number;
  /**
   * Do Double Down finishers earn 2× season points for that day? OPEN
   * (SOT Q244). Default false — keeps the 1:1 Daily Win rule canonical.
   */
  doubleDownDoublesPoints?: boolean;
}

/** One recorded play day, produced by closing a DailyBattleState. */
export interface DayRecord {
  /** ISO date (YYYY-MM-DD) — the day's identity in the season. */
  date: string;
  /** Daily Win holder(s). Normally one; two = simultaneous cross, a recorded tie (Q224 TODO). */
  winnerIds: string[];
  /** Everyone who reached target (banked the day), winner included. */
  completed: string[];
  /** Short of target at the deadline, no shield. */
  failed: string[];
  /** Failed the target but an armed Group Shield preserved the streak. */
  shielded: string[];
  /** Double Down volunteers who cleared their 2× target (from daily.doubleDownFinishers). */
  doubleDownFulfilled?: string[];
}

export interface StreakState {
  length: number;
  best: number;
  lastDate: string | null;
}

export interface BattleSeasonState {
  config: BattleSeasonConfig;
  players: Player[];
  days: DayRecord[];
  points: Record<string, number>;
  streaks: Record<string, StreakState>;
  /** Set by endBattleSeason; undefined + tie=true means a recorded tie (Q224 open). */
  champion?: string;
  tie?: boolean;
  endedAt?: number;
  stake?: StakeObject;
}

export function createBattleSeason(
  config: BattleSeasonConfig,
  players: Player[]
): BattleSeasonState {
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("duplicate player ids");
  if (players.length === 0) throw new Error("a season needs players");
  return {
    config: { length: "weekly", ...config },
    players,
    days: [],
    points: Object.fromEntries(players.map((p) => [p.id, 0])),
    streaks: Object.fromEntries(
      players.map((p) => [p.id, { length: 0, best: 0, lastDate: null }])
    ),
  };
}

/**
 * Record one closed day into the season:
 *   · +1 point per Daily Win (1:1 — Q223's clean default). Multiple
 *     winnerIds each get the point; the tie is recorded for Q224.
 *   · Double Down finishers earn one EXTRA point when the season flag is on
 *     (2× reward; default off).
 *   · Streaks: completed → +1 · shielded → preserved · failed → reset.
 *     Rest days produce no record and never break a streak.
 */
export function recordBattleDay(s: BattleSeasonState, day: DayRecord): BattleSeasonState {
  if (s.endedAt != null) throw new Error("season is over");
  if (s.days.some((d) => d.date === day.date)) throw new Error(`day ${day.date} already recorded`);
  const known = new Set(s.players.map((p) => p.id));
  // tolerate partial records (apps may omit empty arrays)
  const winnerIds = day.winnerIds ?? [];
  const completed = day.completed ?? [];
  const failed = day.failed ?? [];
  const shielded = day.shielded ?? [];
  const all = [...winnerIds, ...completed, ...failed, ...shielded];
  for (const id of all) if (!known.has(id)) throw new Error(`player ${id} not in season`);
  for (const w of winnerIds) if (!completed.includes(w))
    throw new Error(`winner ${w} must be in the day's completions`);

  const points = { ...s.points };
  for (const w of winnerIds) points[w] += 1;
  if (s.config.doubleDownDoublesPoints) {
    for (const id of day.doubleDownFulfilled ?? []) {
      if (!known.has(id)) throw new Error(`player ${id} not in season`);
      points[id] += DOUBLE_DOWN_REWARD_MULTIPLIER - 1; // 1 base + 1 extra = 2×
    }
  }

  const streaks: Record<string, StreakState> = {};
  for (const p of s.players) {
    const st = s.streaks[p.id];
    if (completed.includes(p.id)) {
      const length = st.length + 1;
      streaks[p.id] = { length, best: Math.max(st.best, length), lastDate: day.date };
    } else if (shielded.includes(p.id)) {
      streaks[p.id] = { ...st, lastDate: day.date }; // preserved, not extended
    } else if (failed.includes(p.id)) {
      streaks[p.id] = { ...st, length: 0, lastDate: day.date };
    } else {
      streaks[p.id] = st; // didn't play this day (not recorded) — streak untouched
    }
  }

  const tie = winnerIds.length > 1 ? true : s.tie;
  return { ...s, points, streaks, days: [...s.days, day], tie };
}

export interface BattleStandingRow {
  playerId: string;
  points: number;
  dailyWins: number;
  completions: number;
  failures: number;
  streak: number;
  bestStreak: number;
}

export function battleStandings(s: BattleSeasonState): BattleStandingRow[] {
  return s.players
    .map((p) => {
      let dailyWins = 0, completions = 0, failures = 0;
      for (const d of s.days) {
        if ((d.winnerIds ?? []).includes(p.id)) dailyWins++;
        if ((d.completed ?? []).includes(p.id)) completions++;
        if ((d.failed ?? []).includes(p.id)) failures++;
      }
      const st = s.streaks[p.id];
      return {
        playerId: p.id,
        points: s.points[p.id] ?? 0,
        dailyWins,
        completions,
        failures,
        streak: st.length,
        bestStreak: st.best,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.completions - a.completions ||
        b.bestStreak - a.bestStreak ||
        a.playerId.localeCompare(b.playerId)
    );
}

/**
 * Glue for apps: fold a CLOSED DailyBattleState into the DayRecord shape
 * recordBattleDay consumes (winner/completions/failures/shields + Double
 * Down finishers). `date` is the play day's ISO date (YYYY-MM-DD).
 */
export function dayRecordFrom(day: import("./daily.ts").DailyBattleState, date: string): DayRecord {
  if (day.status !== "closed" || !day.outcomes)
    throw new Error("day is not closed — closeDay first");
  const completed: string[] = [];
  const failed: string[] = [];
  const shielded: string[] = [];
  for (const [id, o] of Object.entries(day.outcomes)) {
    if (o.completed) completed.push(id);
    else if (o.outcome === "shielded") shielded.push(id);
    else failed.push(id);
  }
  return {
    date,
    winnerIds: day.winnerId != null ? [day.winnerId] : [],
    completed,
    failed,
    shielded,
    doubleDownFulfilled: doubleDownFinishers(day),
  };
}

/**
 * Lock the season. Champion = most points; a tie at the top crowns NOBODY —
 * the tie is recorded (SOT Q224 open: no tiebreaker policy yet).
 */
export function endBattleSeason(s: BattleSeasonState, at = Date.now()): BattleSeasonState {
  if (s.days.length === 0) throw new Error("no days recorded");
  if (s.endedAt != null) return s;
  const rows = battleStandings(s);
  const top = rows.filter((r) => r.points === rows[0].points);
  return top.length === 1
    ? { ...s, champion: top[0].playerId, tie: false, endedAt: at }
    : { ...s, tie: true, endedAt: at };
}

// ── Stakes (resolve at SEASON end — SOT §1.7/§3.7) ──────────────────────────

export type StakeType = "none" | "dinner" | "dare" | "deliverable" | "charity";

export type StakeAgreement = "pending" | "accepted" | "declined";

export type StakeStatus = "proposed" | "active" | "resolved" | "void";

export type FulfilmentState = "pending" | "fulfilled" | "overdue" | "disputed" | "waived";

export interface CharityLedger {
  /** Agreed per-player contribution, in POINTS (trial currency — money later per SOT). */
  perPlayerPoints?: number;
  contributions: Record<string, number>;
  /** Disclosed platform/operational fee rate — TBD per SOT, 0 for the trial. */
  platformFeeRate: number;
  /** The approved charity the season winner directs the pot to. */
  designatedCharityId?: string;
  /** Set when the donation is processed: pot − fee. */
  donationPoints?: number;
  feePoints?: number;
  processedAt?: number;
}

export interface StakeResolution {
  winnerIds: string[];
  loserIds: string[];
  tie: boolean;
  resolvedAt: number;
}

export interface StakeFulfilment {
  state: FulfilmentState;
  evidence?: string;
  at?: number;
}

export interface StakeObject {
  id: string;
  seasonId: string;
  type: StakeType;
  /** The pre-agreed declaration text (dare wording, meal, favour, charity terms). */
  declaration: string;
  /** Value in POINTS (trial) — dinner spend cap, charity contribution size, etc. */
  valuePoints?: number;
  participants: string[];
  agreements: Record<string, StakeAgreement>;
  status: StakeStatus;
  charity?: CharityLedger;
  resolution?: StakeResolution;
  /** Loser(s) owe fulfilment for dinner/dare/deliverable, keyed by playerId. */
  fulfilment: Record<string, StakeFulfilment>;
}

export interface StakeDeclarationInput {
  type: StakeType;
  declaration: string;
  valuePoints?: number;
  charity?: { perPlayerPoints?: number; platformFeeRate?: number };
}

/**
 * Propose the season stake. Nothing is at stake until every participant
 * AGREES (agreement gating — SOT flow 4.13: terms agreed in advance). One
 * stake per season.
 */
export function proposeStake(
  s: BattleSeasonState,
  input: StakeDeclarationInput,
  participants: string[],
  stakeId = `${s.config.id}-stake`
): BattleSeasonState {
  if (input.type === "none") throw new Error(`stake type "none" needs no stake object`);
  if (s.stake && s.stake.status !== "void") throw new Error("season already has a stake");
  const known = new Set(s.players.map((p) => p.id));
  const parts = participants.length > 0 ? participants : s.players.map((p) => p.id);
  for (const id of parts) if (!known.has(id)) throw new Error(`player ${id} not in season`);
  if (parts.length < 2) throw new Error("a stake needs at least two participants");
  if (!input.declaration.trim()) throw new Error("a stake needs a declaration (locked before the season)");

  const stake: StakeObject = {
    id: stakeId,
    seasonId: s.config.id,
    type: input.type,
    declaration: input.declaration,
    ...(input.valuePoints != null ? { valuePoints: input.valuePoints } : {}),
    participants: parts,
    agreements: Object.fromEntries(parts.map((id) => [id, "pending" as StakeAgreement])),
    status: "proposed",
    ...(input.type === "charity"
      ? {
          charity: {
            contributions: {},
            platformFeeRate: input.charity?.platformFeeRate ?? 0,
            ...(input.charity?.perPlayerPoints != null
              ? { perPlayerPoints: input.charity.perPlayerPoints }
              : {}),
          },
        }
      : {}),
    fulfilment: {},
  };
  return { ...s, stake };
}

/** A participant accepts. The stake goes ACTIVE the moment all have accepted. */
export function agreeToStake(s: BattleSeasonState, playerId: string): BattleSeasonState {
  return updateAgreement(s, playerId, "accepted");
}

/** A participant declines → the stake is void (nothing agreed, nothing owed). */
export function declineStake(s: BattleSeasonState, playerId: string): BattleSeasonState {
  return updateAgreement(s, playerId, "declined", true);
}

function updateAgreement(
  s: BattleSeasonState,
  playerId: string,
  agreement: StakeAgreement,
  voidOnDecline = false
): BattleSeasonState {
  if (!s.stake) throw new Error("season has no stake");
  const stake = s.stake;
  if (stake.status !== "proposed" && stake.status !== "active")
    throw new Error(`stake is ${stake.status}`);
  if (!stake.participants.includes(playerId)) throw new Error(`${playerId} is not a stake participant`);
  const agreements = { ...stake.agreements, [playerId]: agreement };
  if (voidOnDecline && agreement === "declined") {
    return { ...s, stake: { ...stake, agreements, status: "void" } };
  }
  const allAccepted = stake.participants.every((id) => agreements[id] === "accepted");
  return { ...s, stake: { ...stake, agreements, status: allAccepted ? "active" : "proposed" } };
}

/** Charity contributions — POINTS for the trial (money later per the SOT). */
export function contributeToCharityStake(
  s: BattleSeasonState,
  playerId: string,
  points: number
): BattleSeasonState {
  if (!s.stake || s.stake.type !== "charity" || !s.stake.charity)
    throw new Error("season has no charity stake");
  if (s.stake.status !== "active") throw new Error("charity pot is not open (all participants must agree first)");
  if (!s.stake.participants.includes(playerId)) throw new Error(`${playerId} is not a stake participant`);
  if (!Number.isFinite(points) || points <= 0) throw new Error("contribution must be positive");
  const charity = s.stake.charity;
  return {
    ...s,
    stake: {
      ...s.stake,
      charity: { ...charity, contributions: { ...charity.contributions, [playerId]: points } },
    },
  };
}

export function charityPotTotal(stake: StakeObject): number {
  if (!stake.charity) return 0;
  return Object.values(stake.charity.contributions).reduce((a, b) => a + b, 0);
}

/**
 * Resolve the stake at season end (flow 4.13/4.16). Winner = most Daily Win
 * points; the responsible LOSER(S) = fewest (SOT Q254: Daily Wins is the
 * default metric). Ties at the bottom are JOINT (Q255) — every player tied
 * at the minimum owes. A tie at the top is recorded (Q224 open).
 */
export function resolveSeasonStake(s: BattleSeasonState, at = Date.now()): BattleSeasonState {
  if (!s.stake) throw new Error("season has no stake");
  const stake = s.stake;
  if (stake.status !== "active") throw new Error(`stake is ${stake.status} — nothing to resolve`);
  if (s.days.length === 0) throw new Error("no days recorded");

  const rows = battleStandings(s);
  const topPts = rows[0].points;
  const winners = rows.filter((r) => r.points === topPts).map((r) => r.playerId);
  const minPts = Math.min(...rows.map((r) => r.points));
  const losers = rows.filter((r) => r.points === minPts).map((r) => r.playerId);
  const tie = winners.length > 1;

  const owesFulfilment = stake.type === "dinner" || stake.type === "dare" || stake.type === "deliverable";
  const fulfilment: Record<string, StakeFulfilment> = owesFulfilment
    ? Object.fromEntries(losers.map((id) => [id, { state: "pending" as FulfilmentState }]))
    : {};

  return {
    ...s,
    stake: {
      ...stake,
      status: "resolved",
      resolution: { winnerIds: winners, loserIds: losers, tie, resolvedAt: at },
      fulfilment,
    },
  };
}

/** The season winner directs the charity pot (no cash to the winner — SOT §1.7). */
export function designateCharity(
  s: BattleSeasonState,
  charityId: string,
  byPlayerId: string
): BattleSeasonState {
  const stake = s.stake;
  if (!stake || stake.type !== "charity" || !stake.charity)
    throw new Error("season has no charity stake");
  if (stake.status !== "resolved" || !stake.resolution)
    throw new Error("stake must be resolved before designating a charity");
  if (!stake.resolution.winnerIds.includes(byPlayerId))
    throw new Error("only the season winner directs the charity pot");
  if (!charityId.trim()) throw new Error("charityId required");
  return { ...s, stake: { ...stake, charity: { ...stake.charity, designatedCharityId: charityId } } };
}

/** Process the donation: pot − disclosed platform fee (rate TBD; 0 in trial). */
export function processCharityDonation(s: BattleSeasonState, at = Date.now()): BattleSeasonState {
  const stake = s.stake;
  if (!stake || stake.type !== "charity" || !stake.charity)
    throw new Error("season has no charity stake");
  const charity = stake.charity;
  if (charity.designatedCharityId == null)
    throw new Error("the winner must designate a charity first");
  const total = charityPotTotal(stake);
  const feePoints = Math.floor(total * charity.platformFeeRate);
  return {
    ...s,
    stake: {
      ...stake,
      charity: { ...charity, donationPoints: total - feePoints, feePoints, processedAt: at },
    },
  };
}

/** Record stake fulfilment (dinner paid, dare done, favour delivered, …). */
export function markStakeFulfilled(
  s: BattleSeasonState,
  playerId: string,
  evidence?: string
): BattleSeasonState {
  if (!s.stake) throw new Error("season has no stake");
  const stake = s.stake;
  const f = stake.fulfilment[playerId];
  if (!f) throw new Error(`${playerId} owes nothing on this stake`);
  return {
    ...s,
    stake: {
      ...stake,
      fulfilment: { ...stake.fulfilment, [playerId]: { state: "fulfilled", ...(evidence ? { evidence } : {}), at: Date.now() } },
    },
  };
}
