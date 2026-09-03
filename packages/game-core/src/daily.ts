// @rwf/game-core — DAILY BATTLE (Engine v4 · the SOT model)
//
// Supersedes the 300-format match (src/match.ts, archived in use by the
// v1/v2/v3 app forks). Canonical rules per the master Source of Truth
// (design/references/90e253a1…pdf §1.5, §3.1, flow 4.4):
//
//   · A group plays on agreed ACTIVE DAYS (playDays). Rest days are penalty-
//     free — the app simply never opens a battle on them.
//   · On a play day every player races to the ADJUSTED (RUF) daily target —
//     default 200, group-configurable. Handicap multipliers change what each
//     physical rep is WORTH (SOT §3.2 conflict note), so the same 200-RUF
//     target is a different physical target per player (see
//     handicap.dailyTargetAdjusted).
//   · The FIRST ELIGIBLE player to reach the target earns the DAILY WIN.
//     The battle DOES NOT END when someone wins.
//   · Every later completer still BANKS the day: completion, streak +1,
//     participation, history (and team/long-term metrics at higher layers).
//   · At the deadline, players who never reached target record a FAILED DAY
//     (streak resets at the season layer) — unless an armed Group Shield
//     saves the affected players' streaks (consumed at the close it saves).
//
// Power-up state lives ON the day (a day is one battle): lightning windows,
// steal credits, freeze extensions, bombs, rescue credits, the group shield.
// Semantics live in src/powerups.ts (SOT canon); this module owns the loop.

import type { Player, Exercise } from "./types.ts";
import { effortMultiplier } from "./handicap.ts";
import { DEFAULT_DAILY_TARGET_RUF, roundRuf } from "./ruf.ts";
import {
  LIGHTNING_MULTIPLIER,
  SURPRISE_BOMB_RUF,
  SURPRISE_BOMB_BONUS_RUF,
  ASSIST_BONUS_RUF,
  entryRufValue,
  lightningActive,
  resolveExpiredBombs,
} from "./powerups.ts";

// ── Configuration ───────────────────────────────────────────────────────────

export interface DayFlags {
  /**
   * Can a Rep Steal's detached bonus credit trigger a Daily Win?
   * OPEN (SOT Q237). Default NO — stolen credit is scoreboard padding only.
   */
  stealCanTriggerWin?: boolean;
  /**
   * Does an active Double Down (2× target) delay Daily Win eligibility until
   * the doubled target is reached? OPEN (SOT Q244). Default NO — the
   * volunteer stays eligible at the base target; the 2× bar is for the
   * reward, not the win.
   */
  doubleDownAffectsDailyWin?: boolean;
  /**
   * How many Time Freezes may stack on one day (SOT Q235 open). Default 1.
   */
  freezeStackLimit?: number;
}

export interface ComboDefinition {
  id: string;
  /** Prescribed exercise sequence (exerciseIds) that earns the bonus. */
  sequence: string[];
  bonusRuf: number;
}

export interface DailyConfig {
  id: string;
  /** Adjusted (RUF) target. Default 200 (SOT §1.5, open Q222). */
  targetReps?: number;
  /** Days of week the group committed to (0=Sun … 6=Sat). */
  playDays: number[];
  /** Battle deadline, epoch ms (before any Time Freeze extensions). */
  deadlineAt: number;
  /** Optional allowed-exercise set. Empty/omitted = anything goes. */
  exercises?: Exercise[];
  /** Prescribed combos for the (post-launch) Combo Boost card. */
  combos?: ComboDefinition[];
  flags?: DayFlags;
}

// ── State ───────────────────────────────────────────────────────────────────

export interface DayEntry {
  playerId: string;
  exerciseId: string;
  /** Physical reps logged (player-facing number). */
  reps: number;
  /** Handicap-adjusted value banked (incl. lightning ×3 / combo / bomb bonus). */
  ruf: number;
  at: number; // epoch ms
  verified?: boolean;
  /** Power-ups whose effect is folded into `ruf` (audit trail). */
  powerUps?: string[];
}

export interface DayPlayerState {
  playerId: string;
  /** Entry-banked RUF (earned activity — counts toward the target). */
  ruf: number;
  /** Detached credits that COUNT toward the target (Rescue Rope). */
  creditRuf: number;
  /** Detached bonuses that DON'T count toward the target by default (Rep Steal). */
  bonusRuf: number;
  /** When this player crossed their effective target (completion). */
  completedAt?: number;
}

export type DayOutcomeKind = "win" | "completed" | "shielded" | "failed";

export interface DayOutcome {
  outcome: DayOutcomeKind;
  completed: boolean;
  /** True unless the outcome breaks the streak (failed days only). */
  streakPreserved: boolean;
}

export interface SurpriseBomb {
  id: string;
  fromId: string; // the bomber
  targetId: string; // who must do +20 RUF-equivalent
  issuedAt: number;
  deadline: number; // issuedAt + window
  resolved?: { at: number; hit: boolean; bankedRuf: number };
}

export interface AssistLink {
  fromId: string;
  toId: string;
  until: number;
  resolved?: { at: number };
}

export interface GroupShieldState {
  armedBy: string;
  armedAt: number;
  /** Set when consumed; kind says whether it saved streaks or was bashed. */
  consumedAt?: number;
  consumedKind?: "save" | "bash";
}

export interface PowerEvent {
  kind: string;
  playerId: string;
  at: number;
  detail?: Record<string, unknown>;
}

export interface DailyBattleState {
  config: DailyConfig;
  players: Player[];
  entries: DayEntry[];
  status: "live" | "closed";
  progress: Record<string, DayPlayerState>;
  /** First eligible player to target → the Daily Win (battle continues). */
  winnerId?: string;
  wonAt?: number;
  /** Accumulated Time Freeze extension, ms. */
  freezesMs: number;
  freezeCount: number;
  // power-up state (semantics: src/powerups.ts)
  inventory: Record<string, string[]>;
  lightning: Record<string, number>; // playerId → window-until
  lightningUsed: Record<string, boolean>;
  stealUsed: Record<string, boolean>;
  rescueUsed: Record<string, boolean>;
  doubleDowns: Record<string, { at: number; targetMultiplier: number }>;
  comboArmed: Record<string, { comboId: string; progressed: number }>;
  bombs: SurpriseBomb[];
  assists: AssistLink[];
  groupShield?: GroupShieldState;
  powerLog: PowerEvent[];
  closedAt?: number;
  outcomes?: Record<string, DayOutcome>;
}

// ── Construction & reads ────────────────────────────────────────────────────

export function isPlayDay(config: DailyConfig, date: Date): boolean {
  return config.playDays.includes(date.getDay());
}

export function baseTargetOf(day: DailyBattleState): number {
  return day.config.targetReps ?? DEFAULT_DAILY_TARGET_RUF;
}

/** A player's completion threshold — the base RUF target for everyone.
 * (Double Down does NOT move the completion bar: the 2× commitment is a
 * reward-side quest + an optional win bar per SOT Q244's open flag.) */
export function effectiveTargetOf(day: DailyBattleState, playerId: string): number {
  return baseTargetOf(day);
}

/** RUF counted toward the target (entry ruf + credits; steal only if flagged). */
export function targetProgressOf(day: DailyBattleState, playerId: string): number {
  const p = day.progress[playerId];
  if (!p) return 0;
  const stealCounts = day.config.flags?.stealCanTriggerWin === true;
  return roundRuf(p.ruf + p.creditRuf + (stealCounts ? p.bonusRuf : 0));
}

/** Deadline including Time Freeze extensions. */
export function effectiveDeadline(day: DailyBattleState): number {
  return day.config.deadlineAt + day.freezesMs;
}

export function createDay(config: DailyConfig, players: Player[]): DailyBattleState {
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("duplicate player ids");
  if (players.length === 0) throw new Error("a battle needs players");
  return {
    config,
    players,
    entries: [],
    status: "live",
    progress: Object.fromEntries(
      players.map((p) => [p.id, { playerId: p.id, ruf: 0, creditRuf: 0, bonusRuf: 0 }])
    ),
    freezesMs: 0,
    freezeCount: 0,
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    lightning: {},
    lightningUsed: {},
    stealUsed: {},
    rescueUsed: {},
    doubleDowns: {},
    comboArmed: {},
    bombs: [],
    assists: [],
    powerLog: [],
  };
}

export interface LogSetInput {
  playerId: string;
  exerciseId: string;
  reps: number;
  at: number; // epoch ms
  verified?: boolean;
  avgHrrPct?: number;
}

export interface LogSetResult {
  state: DailyBattleState;
  /** Adjusted value banked by this set. */
  ruf: number;
  /** True if this set crossed the player's effective target. */
  completed: boolean;
  /** True if this set made the player the FIRST to target (Daily Win). */
  wonDay: boolean;
  /** Bonus RUF awarded by resolved power-ups alongside this set. */
  bonusRuf: number;
}

/**
 * Log one exercise set. Applies handicap effort (tier/HRR blend) and any
 * active Lightning window, detects completion and the Daily Win, then
 * resolves any Surprise Bomb/Assist consequences that this set triggers.
 * Logging after the (extended) deadline is rejected — the day is over.
 */
export function logSet(day: DailyBattleState, input: LogSetInput): LogSetResult {
  if (day.status !== "live") throw new Error("day is closed");
  const player = day.players.find((p) => p.id === input.playerId);
  if (!player) throw new Error(`player ${input.playerId} not in battle`);
  if (day.config.exercises && day.config.exercises.length > 0 &&
      !day.config.exercises.some((e) => e.id === input.exerciseId))
    throw new Error(`exercise ${input.exerciseId} not allowed today`);
  if (!Number.isInteger(input.reps) || input.reps <= 0)
    throw new Error("reps must be a positive integer");
  if (input.at >= effectiveDeadline(day)) throw new Error("past the battle deadline");

  const bolt = lightningActive(day, input.playerId, input.at);
  const ruf = entryRufValue(day, player, input, bolt);
  const powerUps = bolt ? ["lightning"] : undefined;

  let state: DailyBattleState = {
    ...day,
    entries: [...day.entries, { ...input, ruf, powerUps }],
    progress: {
      ...day.progress,
      [input.playerId]: {
        ...day.progress[input.playerId],
        ruf: roundRuf(day.progress[input.playerId].ruf + ruf),
      },
    },
  };

  // Combo Boost: prescribed-sequence progress (post-launch card).
  let bonusRuf = 0;
  const armed = state.comboArmed[input.playerId];
  if (armed) {
    const combo = state.config.combos?.find((c) => c.id === armed.comboId);
    if (combo) {
      const next = input.exerciseId === combo.sequence[armed.progressed]
        ? armed.progressed + 1
        : input.exerciseId === combo.sequence[0] ? 1 : 0;
      if (next >= combo.sequence.length) {
        bonusRuf += combo.bonusRuf;
        const { [input.playerId]: _drop, ...restArmed } = state.comboArmed;
        state = addEarnedRuf(state, input.playerId, combo.bonusRuf, input.at, "combo_boost");
        state = { ...state, comboArmed: restArmed, powerLog: [...state.powerLog, { kind: "combo_boost", playerId: input.playerId, at: input.at, detail: { comboId: combo.id, bonusRuf: combo.bonusRuf } }] };
      } else {
        state = { ...state, comboArmed: { ...state.comboArmed, [input.playerId]: { comboId: armed.comboId, progressed: next } } };
      }
    }
  }

  // Surprise Bombs whose window this set could have satisfied. A bomb HITS
  // when the target banks ≥ SURPRISE_BOMB_RUF within the window — the reward
  // is a matching bonus credited as earned RUF (counts toward target). A
  // miss = nothing. Resolved BEFORE the completion check so the bonus can
  // legitimately carry the target over the line.
  const bombHitBefore = state.bombs.find((b) => b.targetId === input.playerId && b.resolved?.hit);
  state = resolveBombsOnEntry(state, input);
  const bombHitAfter = state.bombs.find((b) => b.targetId === input.playerId && b.resolved?.hit);
  if (bombHitAfter && bombHitBefore !== bombHitAfter) bonusRuf += SURPRISE_BOMB_BONUS_RUF;

  // Completion / Daily Win detection (after ALL earned credit this set).
  // Completion = crossing the effective target: the day is BANKED.
  const target = effectiveTargetOf(state, input.playerId);
  const progress = targetProgressOf(state, input.playerId);
  const p = state.progress[input.playerId];
  let completed = false;
  let wonDay = false;
  if (p.completedAt == null && progress >= target) {
    completed = true;
    state = { ...state, progress: { ...state.progress, [input.playerId]: { ...p, completedAt: input.at } } };
    // Assist Boost: a live assist aimed at the finisher rewards BOTH players.
    for (const a of state.assists) {
      if (a.toId === input.playerId && a.resolved == null && a.until > input.at) {
        bonusRuf += 2 * ASSIST_BONUS_RUF; // reported; one each below
        state = addBonusRuf(state, a.fromId, ASSIST_BONUS_RUF);
        state = addBonusRuf(state, a.toId, ASSIST_BONUS_RUF);
        state = {
          ...state,
          assists: state.assists.map((x) => x === a ? { ...x, resolved: { at: input.at } } : x),
          powerLog: [...state.powerLog, { kind: "assist_boost", playerId: a.fromId, at: input.at, detail: { toId: a.toId, bonusRufEach: ASSIST_BONUS_RUF } }],
        };
      }
    }
  }

  // Daily Win = FIRST ELIGIBLE player to the win bar. The bar is the base
  // target, EXCEPT a Double Down volunteer under the Q244 flag (default
  // off: eligibility untouched, the 2× is a reward-side quest).
  const dd = state.doubleDowns[input.playerId];
  const winBar = dd && state.config.flags?.doubleDownAffectsDailyWin
    ? roundRuf(baseTargetOf(state) * dd.targetMultiplier)
    : baseTargetOf(state);
  const progressNow = targetProgressOf(state, input.playerId);
  if (state.winnerId == null && progressNow >= winBar && progressNow >= target) {
    wonDay = true;
    state = { ...state, winnerId: input.playerId, wonAt: input.at };
  }

  return { state, ruf, completed, wonDay, bonusRuf: roundRuf(bonusRuf) };
}

// ── Day close ───────────────────────────────────────────────────────────────

export interface DayCloseResult {
  state: DailyBattleState;
  outcomes: Record<string, DayOutcome>;
  /** True if an armed Group Shield was consumed saving streaks this close. */
  shieldConsumed: boolean;
}

/**
 * Close the day at its (extended) deadline. Completers are done (the first
 * of them is the Daily Win); players short of target FAIL the day — streak
 * breaks at the season layer — unless an armed Group Shield saves them
 * (the shield is consumed at the close it saves; SOT flow 4.11, open Q232).
 */
export function closeDay(day: DailyBattleState, at: number): DayCloseResult {
  if (day.status !== "live") throw new Error("day already closed");
  if (at < effectiveDeadline(day)) throw new Error("deadline not reached yet");

  // Resolve any outstanding bombs against the final timeline.
  let state = resolveExpiredBombs(day, at);
  state = { ...state, status: "closed", closedAt: at };

  // Sweep-completions: a defused Surprise Bomb can carry a player over the
  // line without a further log (the award lands at the sweep). Honour the
  // completion — the reps happened inside the deadline — but the DAILY WIN
  // is a live race event and is never assigned retroactively at close.
  for (const p of state.players) {
    const st = state.progress[p.id];
    if (st.completedAt == null && targetProgressOf(state, p.id) >= effectiveTargetOf(state, p.id)) {
      state = { ...state, progress: { ...state.progress, [p.id]: { ...st, completedAt: at } } };
    }
  }

  const outcomes: Record<string, DayOutcome> = {};
  const failures: string[] = [];
  for (const p of state.players) {
    const st = state.progress[p.id];
    if (st.completedAt != null) {
      outcomes[p.id] = {
        outcome: p.id === state.winnerId ? "win" : "completed",
        completed: true,
        streakPreserved: true,
      };
    } else {
      failures.push(p.id);
    }
  }

  let shieldConsumed = false;
  if (failures.length > 0 && state.groupShield && state.groupShield.consumedAt == null) {
    shieldConsumed = true;
    state = {
      ...state,
      groupShield: { ...state.groupShield, consumedAt: at, consumedKind: "save" },
    };
    for (const id of failures) {
      outcomes[id] = { outcome: "shielded", completed: false, streakPreserved: true };
    }
  } else {
    for (const id of failures) {
      outcomes[id] = { outcome: "failed", completed: false, streakPreserved: false };
    }
  }

  state = { ...state, outcomes };
  return { state, outcomes, shieldConsumed };
}

/**
 * Players who volunteered a Double Down AND crossed the doubled target —
 * the season layer doubles their day reward when configured (flag).
 */
export function doubleDownFinishers(day: DailyBattleState): string[] {
  return Object.entries(day.doubleDowns)
    .filter(([id, dd]) => {
      const p = day.progress[id];
      return p.completedAt != null && targetProgressOf(day, id) >= baseTargetOf(day) * dd.targetMultiplier;
    })
    .map(([id]) => id);
}

export interface DayLeaderRow {
  player: Player;
  ruf: number;
  bonusRuf: number;
  progressPct: number; // toward effective target
  completed: boolean;
  completedAt?: number;
}

export function dayLeaderboard(day: DailyBattleState): DayLeaderRow[] {
  return day.players
    .map((player) => {
      const p = day.progress[player.id];
      const target = effectiveTargetOf(day, player.id);
      const progress = targetProgressOf(day, player.id);
      return {
        player,
        ruf: roundRuf(p.ruf + p.creditRuf),
        bonusRuf: p.bonusRuf,
        progressPct: Math.min(100, Math.round((progress / target) * 1000) / 10),
        completed: p.completedAt != null,
        completedAt: p.completedAt,
      };
    })
    .sort(
      (a, b) =>
        (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity) || // earlier finish first
        b.progressPct - a.progressPct ||
        a.player.id.localeCompare(b.player.id)
    );
}

// ── internal helpers ────────────────────────────────────────────────────────

/** Credit earned-activity RUF (counts toward target) as a synthetic entry. */
function addEarnedRuf(
  day: DailyBattleState,
  playerId: string,
  ruf: number,
  at: number,
  kind: string
): DailyBattleState {
  return {
    ...day,
    entries: [...day.entries, { playerId, exerciseId: kind, reps: 0, ruf, at, powerUps: [kind] }],
    progress: {
      ...day.progress,
      [playerId]: { ...day.progress[playerId], ruf: roundRuf(day.progress[playerId].ruf + ruf) },
    },
  };
}

/** Credit detached bonus RUF (scoreboard only unless flagged to count). */
function addBonusRuf(day: DailyBattleState, playerId: string, ruf: number): DailyBattleState {
  return {
    ...day,
    progress: {
      ...day.progress,
      [playerId]: { ...day.progress[playerId], bonusRuf: roundRuf(day.progress[playerId].bonusRuf + ruf) },
    },
  };
}

/**
 * Resolve a bomb for the player who just logged, if their entry decided it.
 * (Deferred expiry sweeps happen via powerups.resolveExpiredBombs at close.)
 */
function resolveBombsOnEntry(day: DailyBattleState, input: LogSetInput): DailyBattleState {
  let state = day;
  for (const bomb of state.bombs) {
    if (bomb.resolved || bomb.targetId !== input.playerId) continue;
    if (input.at > bomb.deadline) continue; // expired: resolved by the sweeper
    const banked = state.entries
      .filter((e) => e.playerId === bomb.targetId && e.at >= bomb.issuedAt && e.at <= bomb.deadline)
      .reduce((s, e) => s + e.ruf, 0);
    if (roundRuf(banked) >= SURPRISE_BOMB_RUF) {
      state = addEarnedRuf(state, bomb.targetId, SURPRISE_BOMB_BONUS_RUF, input.at, "surprise_bomb");
      state = {
        ...state,
        bombs: state.bombs.map((b) => b === bomb
          ? { ...b, resolved: { at: input.at, hit: true, bankedRuf: roundRuf(banked) } }
          : b),
        powerLog: [...state.powerLog, {
          kind: "surprise_bomb", playerId: bomb.fromId, at: input.at,
          detail: { targetId: bomb.targetId, hit: true, bonusRuf: SURPRISE_BOMB_BONUS_RUF },
        }],
      };
    }
  }
  return state;
}
