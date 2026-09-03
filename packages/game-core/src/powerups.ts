// @rwf/game-core — POWER-UPS (Engine v4 · SOT canon semantics)
//
// Four LAUNCH cards (SOT §3.6 + canonical decisions §7), reworked to the
// master Source of Truth — note the two semantics our earlier build got
// wrong, now fixed per docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md:
//
//   · Rep Steal — the activator GAINS 10% equivalent of the target's
//     completed score; THE TARGET KEEPS THEIRS. Pure gain, not a transfer.
//     Whether the gained credit can itself trigger a Daily Win is OPEN
//     (Q237): flag `stealCanTriggerWin`, default NO.
//   · Group Shield — protects the affected players' STREAKS from one failed
//     day (the streak-protection reading of Q232), consumed at the day close
//     it saves. It no longer blocks steals.
//
// Time Freeze: +30 min to the deadline, group-wide (Q233 open — group-wide
// is the flow-4.12 reading: the whole battle clock extends). Stacking limit
// is a flag, default 1 (Q235 open).
//
// The POST-LAUNCH set (second tier) is implemented here too: Combo Boost,
// Double Down, Assist Boost, Surprise Bomb (+20 reps / 10 min — hit → bonus,
// miss → nothing), Rescue Rope (instant 50-rep credit to an inactive
// teammate, limited), Shield Bash (cancel an active shield).
//
// Our earlier extras (Second Wind, Rabbit's Foot, …) are PRESERVED in the
// catalog under `experimental: true` — their mechanics stay in the v1/v2/v3
// app engine forks, not here.

import type { Player } from "./types.ts";
import { effortMultiplier } from "./handicap.ts";
import { roundRuf } from "./ruf.ts";
import type {
  DailyBattleState,
  LogSetInput,
  SurpriseBomb,
  PowerEvent,
} from "./daily.ts";

// ── Tuning constants (one home so engine, tests and the app agree) ──────────

export const LIGHTNING_MS = 10 * 60 * 1000;       // window: 10 minutes
export const LIGHTNING_MULTIPLIER = 3;            // ×3 RUF while the window is open
export const STEAL_SHARE = 0.1;                   // gain 10% of the target's completed score
export const STEAL_DAILY_LIMIT = 1;               // per activator per day (cap itself OPEN: Q236)
export const FREEZE_MS = 30 * 60 * 1000;          // +30 min to the deadline
export const FREEZE_STACK_LIMIT_DEFAULT = 1;      // stacking OPEN (Q235); default 1
export const SURPRISE_BOMB_RUF = 20;              // "+20 reps" (RUF-equivalent; player copy says reps)
export const SURPRISE_BOMB_WINDOW_MS = 10 * 60 * 1000;
export const SURPRISE_BOMB_BONUS_RUF = 20;        // defusal reward — provisional number
export const RESCUE_ROPE_RUF = 50;                // instant credit to an inactive teammate
export const RESCUE_ROPE_DAILY_LIMIT = 1;         // per giver per day ("limited" — exact cap open)
export const ASSIST_BONUS_RUF = 25;               // reward EACH when the assisted mate finishes — provisional
export const ASSIST_WINDOW_MS = 30 * 60 * 1000;   // provisional
export const DOUBLE_DOWN_TARGET_MULTIPLIER = 2;   // volunteer for 2× target…
export const DOUBLE_DOWN_REWARD_MULTIPLIER = 2;   // …for 2× season reward (flag at season layer)

// ── Catalog ─────────────────────────────────────────────────────────────────

export type PowerUpTier = "launch" | "post-launch" | "experimental";

export interface PowerUpDef {
  kind: string;
  name: string;
  tier: PowerUpTier;
  rarity: "common" | "rare" | "epic" | "legendary"; // cosmetic (loot UI)
  blurb: string;
  experimental?: boolean;
  /** SOT open question guarding this card's undecided details, if any. */
  openQuestion?: string;
}

export const POWER_UP_CATALOG: Record<string, PowerUpDef> = {
  // — launch canon (SOT §3.6) —
  lightning:    { kind: "lightning", name: "Lightning Round", tier: "launch", rarity: "legendary", blurb: "Your reps count ×3 for the next 10 minutes · once per day", openQuestion: "Q240-242 economy open" },
  steal:        { kind: "steal", name: "Rep Steal", tier: "launch", rarity: "epic", blurb: "Gain 10% of a rival's completed score — they keep theirs", openQuestion: "Q236-237 cap/win-trigger open" },
  shield:       { kind: "shield", name: "Group Shield", tier: "launch", rarity: "common", blurb: "Protect everyone's streak from one failed day", openQuestion: "Q232 exact scope open" },
  freeze:       { kind: "freeze", name: "Time Freeze", tier: "launch", rarity: "rare", blurb: "The battle clock extends 30 minutes, group-wide", openQuestion: "Q233-235 stacking open" },
  // — post-launch set (SOT §3.6 "agreed post-launch") —
  combo_boost:  { kind: "combo_boost", name: "Combo Boost", tier: "post-launch", rarity: "rare", blurb: "Bonus for nailing a prescribed exercise combo" },
  double_down:  { kind: "double_down", name: "Double Down", tier: "post-launch", rarity: "epic", blurb: "Volunteer for 2× target; 2× season reward if you make it", openQuestion: "Q244 win-eligibility open" },
  assist_boost: { kind: "assist_boost", name: "Assist Boost", tier: "post-launch", rarity: "common", blurb: "Help a mate finish — you both get rewarded when they do" },
  surprise_bomb:{ kind: "surprise_bomb", name: "Surprise Bomb", tier: "post-launch", rarity: "epic", blurb: "Drop +20 reps on a rival: 10 minutes to deliver or it fizzles" },
  rescue_rope:  { kind: "rescue_rope", name: "Rescue Rope", tier: "post-launch", rarity: "rare", blurb: "Instant 50-rep credit to an inactive teammate · limited" },
  shield_bash:  { kind: "shield_bash", name: "Shield Bash", tier: "post-launch", rarity: "rare", blurb: "Cancel the active Group Shield · Pro/competitive" },
  // — our earlier extras, preserved (mechanics stay in the v1-v3 app forks) —
  second_wind:      { kind: "second_wind", name: "Second Wind", tier: "experimental", rarity: "rare", blurb: "Comeback boost ×1.2 → ×1.5 for 15 minutes", experimental: true },
  anchor:           { kind: "anchor", name: "Anchor", tier: "experimental", rarity: "rare", blurb: "24h wall — no steals from you, vetoes rival freezes", experimental: true },
  sprint:           { kind: "sprint", name: "Sprint", tier: "experimental", rarity: "common", blurb: "Your next 3 logs score ×2", experimental: true },
  rabbits_foot:     { kind: "rabbits_foot", name: "Rabbit's Foot", tier: "experimental", rarity: "epic", blurb: "Your next draft is guaranteed Rare or better", experimental: true },
  sandbag_detector: { kind: "sandbag_detector", name: "Sandbag Detector", tier: "experimental", rarity: "common", blurb: "The leading rival's next 3 logs go public", experimental: true },
  handicap_swap:    { kind: "handicap_swap", name: "Handicap Swap", tier: "experimental", rarity: "epic", blurb: "Swap tier multipliers with the leading rival for 1 day", experimental: true },
  pit_crew:         { kind: "pit_crew", name: "Pit Crew", tier: "experimental", rarity: "common", blurb: "Your next 0-rep day keeps your streak", experimental: true },
  photo_finish:     { kind: "photo_finish", name: "Photo Finish", tier: "experimental", rarity: "rare", blurb: "+25 points if you win by a <5% margin", experimental: true },
  wildcard:         { kind: "wildcard", name: "Wildcard", tier: "experimental", rarity: "legendary", blurb: "Copy the last power-up card played against you", experimental: true },
};

// ── Reads ───────────────────────────────────────────────────────────────────

export function lightningActive(day: DailyBattleState, playerId: string, at: number): boolean {
  return (day.lightning[playerId] ?? 0) > at;
}

export function inventoryOf(day: DailyBattleState, playerId: string): string[] {
  return day.inventory[playerId] ?? [];
}

/**
 * Adjusted (RUF) value of a logged set: physical reps × handicap effort
 * multiplier (tier, optionally blended with live %HRR evidence) × Lightning
 * when the window is open. THE single conversion point of the engine.
 */
export function entryRufValue(
  day: DailyBattleState,
  player: Player,
  input: LogSetInput,
  bolt: boolean
): number {
  const base = input.reps * effortMultiplier(player, {
    playerId: input.playerId,
    exerciseId: input.exerciseId,
    reps: input.reps,
    at: input.at,
    verified: input.verified ?? false,
    ...(input.avgHrrPct != null ? { avgHrrPct: input.avgHrrPct } : {}),
  });
  return roundRuf(bolt ? base * LIGHTNING_MULTIPLIER : base);
}

/** Expected Rep Steal gain: 10% of the target's completed score (they keep it). */
export function stealPreview(day: DailyBattleState, _activatorId: string, targetId: string): number {
  const t = day.progress[targetId];
  if (!t) return 0;
  return roundRuf(STEAL_SHARE * (t.ruf + t.creditRuf));
}

// ── Grant & activation ──────────────────────────────────────────────────────

export function grantPowerUp(day: DailyBattleState, playerId: string, kind: string): DailyBattleState {
  if (!POWER_UP_CATALOG[kind]) throw new Error(`unknown power-up ${kind}`);
  if (!day.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in battle`);
  return { ...day, inventory: { ...day.inventory, [playerId]: [...inventoryOf(day, playerId), kind] } };
}

export interface ActivateOptions {
  at?: number;
  /** Target of a targeted card (steal / surprise_bomb). */
  targetId?: string;
  /** Teammate for rescue_rope / assist_boost (alias of targetId). */
  teammateId?: string;
  comboId?: string;
}

export interface ActivateResult {
  ok: boolean;
  kind: string;
  playerId: string;
  reason?: string;
  [k: string]: unknown;
}

/**
 * Activate a power-up from the player's inventory. Returns the new day state
 * plus a result object ({ok, …} or {ok:false, reason}). All cards are
 * once-held-and-spent; per-day limits are enforced per SOT canon above.
 */
export function activatePowerUp(
  day: DailyBattleState,
  playerId: string,
  kind: string,
  opts: ActivateOptions = {}
): { state: DailyBattleState; result: ActivateResult } {
  const at = opts.at ?? Date.now();
  const def = POWER_UP_CATALOG[kind];
  const fail = (reason: string) => ({ state: day, result: { ok: false, kind, playerId, reason } });
  if (!def) return fail(`unknown power-up ${kind}`);
  if (day.status !== "live") return fail("day is closed");
  if (!day.players.some((p) => p.id === playerId)) return fail(`player ${playerId} not in battle`);

  const held = inventoryOf(day, playerId);
  const idx = held.indexOf(kind);
  const spend = () => ({ ...day.inventory, [playerId]: held.filter((_, i) => i !== idx) });
  const log = (e: PowerEvent) => [...day.powerLog, e];
  const targetId = opts.targetId ?? opts.teammateId;
  const needTarget = () => {
    if (!targetId) return fail("this card needs a target player");
    if (!day.players.some((p) => p.id === targetId)) return fail(`target ${targetId} not in battle`);
    if (targetId === playerId) return fail("can't target yourself");
    return null;
  };

  if (def.experimental)
    return fail("experimental card — mechanics live in the v1-v3 app forks, not the v4 engine");
  if (idx < 0) return fail(`no ${kind} card held`);

  // ── Lightning Round (launch canon) ──
  if (kind === "lightning") {
    if (day.lightningUsed[playerId]) return fail("lightning already used today (one per day)");
    const until = at + LIGHTNING_MS;
    return {
      state: { ...day, lightning: { ...day.lightning, [playerId]: until }, lightningUsed: { ...day.lightningUsed, [playerId]: true }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { until, multiplier: LIGHTNING_MULTIPLIER } }) },
      result: { ok: true, kind, playerId, until, multiplier: LIGHTNING_MULTIPLIER, ms: LIGHTNING_MS },
    };
  }

  // ── Rep Steal (launch canon · PURE GAIN) ──
  if (kind === "steal") {
    const bad = needTarget();
    if (bad) return bad;
    if (day.stealUsed[playerId]) return fail(`steal already used today (limit ${STEAL_DAILY_LIMIT})`);
    const gain = stealPreview(day, playerId, targetId!);
    if (gain <= 0) return fail(`${targetId} has no completed score to skim yet`);
    const t = day.progress[playerId];
    return {
      state: {
        ...day,
        progress: { ...day.progress, [playerId]: { ...t, bonusRuf: roundRuf(t.bonusRuf + gain) } },
        stealUsed: { ...day.stealUsed, [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, at, detail: { targetId, gain, targetKept: true } }),
      },
      result: { ok: true, kind, playerId, targetId, gain, targetKept: true },
    };
  }

  // ── Group Shield (launch canon · streak protection) ──
  if (kind === "shield") {
    if (day.groupShield && day.groupShield.consumedAt == null) return fail("a Group Shield is already armed");
    return {
      state: { ...day, groupShield: { armedBy: playerId, armedAt: at }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { armed: true, protects: "streaks at day close" } }) },
      result: { ok: true, kind, playerId, armed: true, protects: "streaks at day close" },
    };
  }

  // ── Time Freeze (launch canon · group-wide +30 min) ──
  if (kind === "freeze") {
    const limit = day.config.flags?.freezeStackLimit ?? FREEZE_STACK_LIMIT_DEFAULT;
    if (day.freezeCount >= limit) return fail(`freeze stack limit reached (${limit})`);
    return {
      state: { ...day, freezesMs: day.freezesMs + FREEZE_MS, freezeCount: day.freezeCount + 1, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { addedMs: FREEZE_MS, groupWide: true } }) },
      result: { ok: true, kind, playerId, addedMs: FREEZE_MS, groupWide: true, newDeadline: day.config.deadlineAt + day.freezesMs + FREEZE_MS },
    };
  }

  // ── Combo Boost (post-launch) ──
  if (kind === "combo_boost") {
    const combos = day.config.combos ?? [];
    if (combos.length === 0) return fail("no prescribed combo configured for today");
    if (day.comboArmed[playerId]) return fail("a combo is already armed");
    const combo = combos.find((c) => c.id === (opts.comboId ?? combos[0].id))!;
    return {
      state: { ...day, comboArmed: { ...day.comboArmed, [playerId]: { comboId: combo.id, progressed: 0 } }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { comboId: combo.id, sequence: combo.sequence, bonusRuf: combo.bonusRuf } }) },
      result: { ok: true, kind, playerId, comboId: combo.id, sequence: combo.sequence, bonusRuf: combo.bonusRuf },
    };
  }

  // ── Double Down (post-launch · 2× target for 2× reward) ──
  if (kind === "double_down") {
    if (day.doubleDowns[playerId]) return fail("already doubled down today");
    if (day.progress[playerId].completedAt != null) return fail("can't double down after completing the day");
    return {
      state: { ...day, doubleDowns: { ...day.doubleDowns, [playerId]: { at, targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER } }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER, rewardMultiplier: DOUBLE_DOWN_REWARD_MULTIPLIER } }) },
      result: { ok: true, kind, playerId, targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER, rewardMultiplier: DOUBLE_DOWN_REWARD_MULTIPLIER },
    };
  }

  // ── Assist Boost (post-launch · reward when the assisted mate finishes) ──
  if (kind === "assist_boost") {
    const bad = needTarget();
    if (bad) return bad;
    const mate = targetId!;
    if (day.progress[mate].completedAt != null) return fail(`${mate} already finished the day`);
    const until = at + ASSIST_WINDOW_MS;
    return {
      state: { ...day, assists: [...day.assists, { fromId: playerId, toId: mate, until }], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { toId: mate, until, bonusRufEach: ASSIST_BONUS_RUF } }) },
      result: { ok: true, kind, playerId, toId: mate, until, bonusRufEach: ASSIST_BONUS_RUF },
    };
  }

  // ── Surprise Bomb (post-launch · +20 reps / 10 min: deliver or fizzle) ──
  if (kind === "surprise_bomb") {
    const bad = needTarget();
    if (bad) return bad;
    const victim = targetId!;
    if (day.progress[victim].completedAt != null) return fail(`${victim} already finished the day`);
    const bomb: SurpriseBomb = {
      id: `bomb-${day.bombs.length}-${at}`,
      fromId: playerId,
      targetId: victim,
      issuedAt: at,
      deadline: at + SURPRISE_BOMB_WINDOW_MS,
    };
    return {
      state: { ...day, bombs: [...day.bombs, bomb], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { targetId: victim, reps: SURPRISE_BOMB_RUF, windowMs: SURPRISE_BOMB_WINDOW_MS } }) },
      result: { ok: true, kind, playerId, targetId: victim, reps: SURPRISE_BOMB_RUF, deadline: bomb.deadline },
    };
  }

  // ── Rescue Rope (post-launch · 50-rep credit to an inactive teammate) ──
  if (kind === "rescue_rope") {
    const bad = needTarget();
    if (bad) return bad;
    const mate = targetId!;
    if (day.rescueUsed[playerId]) return fail(`rescue rope already used today (limit ${RESCUE_ROPE_DAILY_LIMIT})`);
    const mateState = day.progress[mate];
    const inactive = mateState.ruf === 0 && mateState.creditRuf === 0 && day.entries.every((e) => e.playerId !== mate);
    if (!inactive) return fail(`${mate} isn't inactive today (rescue ropes reach idle mates only)`);
    if (mateState.completedAt != null) return fail(`${mate} already finished the day`);
    return {
      state: {
        ...day,
        progress: { ...day.progress, [mate]: { ...mateState, creditRuf: roundRuf(mateState.creditRuf + RESCUE_ROPE_RUF) } },
        rescueUsed: { ...day.rescueUsed, [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, at, detail: { toId: mate, creditRuf: RESCUE_ROPE_RUF } }),
      },
      result: { ok: true, kind, playerId, toId: mate, creditRuf: RESCUE_ROPE_RUF },
    };
  }

  // ── Shield Bash (post-launch · cancel an armed shield) ──
  if (kind === "shield_bash") {
    if (!day.groupShield || day.groupShield.consumedAt != null) return fail("no armed shield to bash");
    return {
      state: { ...day, groupShield: { ...day.groupShield, consumedAt: at, consumedKind: "bash" }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { bashed: day.groupShield.armedBy } }) },
      result: { ok: true, kind, playerId, bashed: day.groupShield.armedBy },
    };
  }

  return fail(`power-up ${kind} has no v4 activation path`);
}

// ── Sweepers ────────────────────────────────────────────────────────────────

/**
 * Resolve Surprise Bombs whose window has expired. A bomb whose target
 * banked ≥ SURPRISE_BOMB_RUF inside the window awards the defusal bonus
 * (as earned RUF — it counts toward the target); a miss resolves to nothing.
 * Called at day close and safe to call any time.
 */
export function resolveExpiredBombs(day: DailyBattleState, at: number): DailyBattleState {
  let state = day;
  for (const bomb of state.bombs) {
    if (bomb.resolved || at < bomb.deadline) continue;
    const banked = state.entries
      .filter((e) => e.playerId === bomb.targetId && e.at >= bomb.issuedAt && e.at <= bomb.deadline)
      .reduce((s, e) => s + e.ruf, 0);
    const hit = roundRuf(banked) >= SURPRISE_BOMB_RUF;
    if (hit) {
      const t = state.progress[bomb.targetId];
      state = {
        ...state,
        entries: [...state.entries, { playerId: bomb.targetId, exerciseId: "surprise_bomb", reps: 0, ruf: SURPRISE_BOMB_BONUS_RUF, at: bomb.deadline, powerUps: ["surprise_bomb"] }],
        progress: { ...state.progress, [bomb.targetId]: { ...t, ruf: roundRuf(t.ruf + SURPRISE_BOMB_BONUS_RUF) } },
        powerLog: [...state.powerLog, { kind: "surprise_bomb", playerId: bomb.fromId, at: bomb.deadline, detail: { targetId: bomb.targetId, hit: true, bonusRuf: SURPRISE_BOMB_BONUS_RUF } }],
      };
    }
    state = {
      ...state,
      bombs: state.bombs.map((b) => b === bomb ? { ...b, resolved: { at, hit, bankedRuf: roundRuf(banked) } } : b),
    };
  }
  return state;
}
