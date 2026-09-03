/* ═══════════════════════════════════════════════════════════════════════
   RWF SOT ENGINE (V4 · the Source-of-Truth app engine)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Faithful buildless-JS port of packages/game-core ENGINE V4 — the daily-200
   model from the master Source of Truth (design/references/90e253a1…pdf,
   reconciliation in docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md). The TS core
   is the reference implementation; apps/sot-engine.test.js proves parity by
   running BOTH side by side.

   FORK DISCIPLINE: the v1/v2/v3 apps (apps/figma-app, apps/board, apps/v3)
   run the LEGACY 300-match engine on their own independent forks — they are
   untouched by this file and must never be "re-synced" onto it. This engine
   is for the SOT app (v4) only. Re-sync from packages/game-core/src
   (ruf.ts, daily.ts, powerups.ts, season.ts, teams.ts, handicap.ts
   additions) deliberately, never blindly.

   ── API SURFACE (everything the app UI needs) ──────────────────────────
   UNITS & DISPLAY
     RUF_UNIT, PLAYER_FACING_UNIT ("reps"), DEFAULT_DAILY_TARGET_RUF (200),
     rufToDisplay(ruf) → "184 reps"

   HANDICAP
     TIER_MULTIPLIERS, tierMultiplier(player), effortMultiplier(p, entry),
     dailyTargetAdjusted(targetRuf, multiplier) → physical reps needed,
     recalibrateMultiplier(player, history?) → no-op hook (SOT Q217-221)

   DAILY BATTLE  (a day is one battle; create on play days only)
     isPlayDay(config, date)
     createDay(config, players)            config: { id, playDays[0-6],
                                            deadlineAt(ms), targetReps?=200,
                                            exercises?, combos?, flags? }
       flags: { stealCanTriggerWin?=false (Q237), doubleDownAffectsDailyWin?
               =false (Q244), freezeStackLimit?=1 (Q235) }
     baseTargetOf(day) / effectiveTargetOf(day, id) → RUF target
     targetProgressOf(day, id) → RUF progress toward target
     effectiveDeadline(day) → deadlineAt + freeze extensions
     logSet(day, {playerId, exerciseId, reps, at, verified?, avgHrrPct?})
       → { state, ruf, completed, wonDay, bonusRuf }   (throws when closed /
         unknown player / bad reps / past deadline)
     closeDay(day, at) → { state, outcomes{id:{outcome:'win'|'completed'|
       'shielded'|'failed', completed, streakPreserved}}, shieldConsumed }
     doubleDownFinishers(day) → ids clearing their 2× quest
     dayLeaderboard(day) → rows sorted (earliest finish first)

   POWER-UPS  (SOT canon; state lives on the day)
     POWER_UP_CATALOG (launch ×4, post-launch ×6, experimental preserved ×9)
     LIGHTNING_MS/LIGHTNING_MULTIPLIER, STEAL_SHARE, FREEZE_MS,
       SURPRISE_BOMB_*, RESCUE_ROPE_*, ASSIST_*, DOUBLE_DOWN_*
     grantPowerUp(day, playerId, kind)     inventory/draft economy hook
     inventoryOf(day, playerId)
     activatePowerUp(day, playerId, kind, {at?, targetId?|teammateId?, comboId?})
       → { state, result:{ok, reason?|…} }  — steal: PURE GAIN (target keeps
         theirs); shield: GROUP streak protection consumed at the close it
         saves; freeze: group-wide +30 min; bomb: +20 RUF in 10 min or
         nothing; rescue: 50 credit to an INACTIVE mate (counts to target);
         experimental cards refuse (they live in the v1-v3 forks)
     stealPreview(day, activatorId, targetId) → expected gain
     lightningActive(day, playerId, at)

   BATTLE SEASONS + STAKES  (weekly default, 1 Daily Win = 1 point)
     createBattleSeason({id, name, length?'weekly'|'monthly', playDays,
       targetReps?, doubleDownDoublesPoints?}, players)
     dayRecordFrom(closedDay, "YYYY-MM-DD") → DayRecord glue
     recordBattleDay(season, {date, winnerIds[], completed[], failed[],
       shielded[], doubleDownFulfilled?})   (points +1/win; streaks: +1 /
       preserved / reset)
     battleStandings(season) → rows by points, completions, best streak
     endBattleSeason(season, at?) → champion | {tie:true} (Q224 open)
     Stakes (resolve at season end, never daily):
       proposeStake(s, {type:'dinner'|'dare'|'deliverable'|'charity',
         declaration, valuePoints?, charity?{perPlayerPoints?,
         platformFeeRate?}}, participants?)   — one per season, terms locked
         up front, nothing owed until ALL accept
       agreeToStake(s, id) / declineStake(s, id) → void
       contributeToCharityStake(s, id, points)  (POINTS = trial currency)
       charityPotTotal(stake)
       resolveSeasonStake(s, at?) → winner = most wins; LOSER(S) = fewest
         (bottom tie = JOINT, Q255); dinner/dare/deliverable set fulfilment
         pending on the losers
       designateCharity(s, charityId, byWinnerId) — only the winner directs
       processCharityDonation(s, at?) → donation = pot − disclosed fee
       markStakeFulfilled(s, playerId, evidence?)

   TEAMS  (scaffold — SOT Q229-231 scoring left open)
     MIN_TEAM_SIZE (2/side, uneven 3v2 ALLOWED), validateTeamMode(cfg),
     teamScores(day, {teams, scoringRule:'pooled'|'average'|'quota',
       targetRufPerPlayer?}), teamDailyWin(day, cfg) — pooled: first team
       past target×size; average: first team fully complete; quota: throws
       (reserved). Default rule: average.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── RUF — the interim ruling (SOT §3.3 conflict, Q216) ──────────────────
   RUF (Reps With Friends Units) is the INTERNAL scoring unit: the
   handicap-adjusted value of a logged set. Player-facing copy says "reps".
   No UI surface should ever print "RUF". */
export const RUF_UNIT = "RUF";
export const PLAYER_FACING_UNIT = "reps";
export const DEFAULT_DAILY_TARGET_RUF = 200;

export function roundRuf(ruf) {
  return Math.round(ruf * 100) / 100;
}
export function rufToDisplay(ruf) {
  const n = Number.isInteger(ruf) ? ruf.toString() : roundRuf(ruf).toString();
  return `${n} ${PLAYER_FACING_UNIT}`;
}

/* ── Handicap (spec: game-core/src/handicap.ts) ───────────────────────────
   SOT §3.2: the multiplier changes what reps are WORTH, not the target. */
export const TIER_MULTIPLIERS = { couch: 1.5, casual: 1.25, fit: 1.0, athlete: 0.85 };
const HRR_WEIGHT = 0.7;

export function tierMultiplier(player) {
  return TIER_MULTIPLIERS[player.tier];
}

export function effortMultiplier(player, entry) {
  const tier = tierMultiplier(player);
  if (entry.avgHrrPct == null || player.baselineHrrPct == null) return tier;
  const hrrRatio = entry.avgHrrPct / player.baselineHrrPct;
  return HRR_WEIGHT * hrrRatio + (1 - HRR_WEIGHT) * tier;
}

/** Player-facing PHYSICAL target implied by a RUF target (÷ multiplier). */
export function dailyTargetAdjusted(targetRuf, multiplier) {
  if (multiplier <= 0) throw new Error("multiplier must be positive");
  return Math.ceil(targetRuf / multiplier);
}

/** Recalibration hook — NO-OP default, formula open (SOT Q217-221). */
export function recalibrateMultiplier(player, _history) {
  return tierMultiplier(player);
}

/* ── Power-up tuning constants ─────────────────────────────────────────── */
export const LIGHTNING_MS = 10 * 60 * 1000;
export const LIGHTNING_MULTIPLIER = 3;
export const STEAL_SHARE = 0.1;
export const STEAL_DAILY_LIMIT = 1;
export const FREEZE_MS = 30 * 60 * 1000;
export const FREEZE_STACK_LIMIT_DEFAULT = 1;
export const SURPRISE_BOMB_RUF = 20;
export const SURPRISE_BOMB_WINDOW_MS = 10 * 60 * 1000;
export const SURPRISE_BOMB_BONUS_RUF = 20;
export const RESCUE_ROPE_RUF = 50;
export const RESCUE_ROPE_DAILY_LIMIT = 1;
export const ASSIST_BONUS_RUF = 25;
export const ASSIST_WINDOW_MS = 30 * 60 * 1000;
export const DOUBLE_DOWN_TARGET_MULTIPLIER = 2;
export const DOUBLE_DOWN_REWARD_MULTIPLIER = 2;

export const POWER_UP_CATALOG = {
  // launch canon (SOT §3.6)
  lightning:     { kind: "lightning", name: "Lightning Round", tier: "launch", rarity: "legendary", blurb: "Your reps count ×3 for the next 10 minutes · once per day" },
  steal:         { kind: "steal", name: "Rep Steal", tier: "launch", rarity: "epic", blurb: "Gain 10% of a rival's completed score — they keep theirs" },
  shield:        { kind: "shield", name: "Group Shield", tier: "launch", rarity: "common", blurb: "Protect everyone's streak from one failed day" },
  freeze:        { kind: "freeze", name: "Time Freeze", tier: "launch", rarity: "rare", blurb: "The battle clock extends 30 minutes, group-wide" },
  // post-launch set
  combo_boost:   { kind: "combo_boost", name: "Combo Boost", tier: "post-launch", rarity: "rare", blurb: "Bonus for nailing a prescribed exercise combo" },
  double_down:   { kind: "double_down", name: "Double Down", tier: "post-launch", rarity: "epic", blurb: "Volunteer for 2× target; 2× season reward if you make it" },
  assist_boost:  { kind: "assist_boost", name: "Assist Boost", tier: "post-launch", rarity: "common", blurb: "Help a mate finish — you both get rewarded when they do" },
  surprise_bomb: { kind: "surprise_bomb", name: "Surprise Bomb", tier: "post-launch", rarity: "epic", blurb: "Drop +20 reps on a rival: 10 minutes to deliver or it fizzles" },
  rescue_rope:   { kind: "rescue_rope", name: "Rescue Rope", tier: "post-launch", rarity: "rare", blurb: "Instant 50-rep credit to an inactive teammate · limited" },
  shield_bash:   { kind: "shield_bash", name: "Shield Bash", tier: "post-launch", rarity: "rare", blurb: "Cancel the active Group Shield · Pro/competitive" },
  // our earlier extras — preserved (mechanics stay in the v1-v3 forks)
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

export function lightningActive(day, playerId, at) {
  return (day.lightning[playerId] ?? 0) > at;
}

export function inventoryOf(day, playerId) {
  return day.inventory[playerId] ?? [];
}

/** The single conversion point: physical reps → RUF (handicap × lightning). */
export function entryRufValue(day, player, input, bolt) {
  const base = input.reps * effortMultiplier(player, {
    playerId: input.playerId,
    exerciseId: input.exerciseId,
    reps: input.reps,
    at: input.at,
    verified: input.verified,
    ...(input.avgHrrPct != null ? { avgHrrPct: input.avgHrrPct } : {}),
  });
  return roundRuf(bolt ? base * LIGHTNING_MULTIPLIER : base);
}

/** Expected Rep Steal gain — 10% of the target's completed score. */
export function stealPreview(day, _activatorId, targetId) {
  const t = day.progress[targetId];
  if (!t) return 0;
  return roundRuf(STEAL_SHARE * (t.ruf + t.creditRuf));
}

export function grantPowerUp(day, playerId, kind) {
  if (!POWER_UP_CATALOG[kind]) throw new Error(`unknown power-up ${kind}`);
  if (!day.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in battle`);
  return { ...day, inventory: { ...day.inventory, [playerId]: [...inventoryOf(day, playerId), kind] } };
}

export function activatePowerUp(day, playerId, kind, opts = {}) {
  const at = opts.at ?? Date.now();
  const def = POWER_UP_CATALOG[kind];
  const fail = (reason) => ({ state: day, result: { ok: false, kind, playerId, reason } });
  if (!def) return fail(`unknown power-up ${kind}`);
  if (day.status !== "live") return fail("day is closed");
  if (!day.players.some((p) => p.id === playerId)) return fail(`player ${playerId} not in battle`);

  const held = inventoryOf(day, playerId);
  const idx = held.indexOf(kind);
  const spend = () => ({ ...day.inventory, [playerId]: held.filter((_, i) => i !== idx) });
  const log = (e) => [...day.powerLog, e];
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

  if (kind === "lightning") {
    if (day.lightningUsed[playerId]) return fail("lightning already used today (one per day)");
    const until = at + LIGHTNING_MS;
    return {
      state: { ...day, lightning: { ...day.lightning, [playerId]: until }, lightningUsed: { ...day.lightningUsed, [playerId]: true }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { until, multiplier: LIGHTNING_MULTIPLIER } }) },
      result: { ok: true, kind, playerId, until, multiplier: LIGHTNING_MULTIPLIER, ms: LIGHTNING_MS },
    };
  }

  if (kind === "steal") {
    const bad = needTarget();
    if (bad) return bad;
    if (day.stealUsed[playerId]) return fail(`steal already used today (limit ${STEAL_DAILY_LIMIT})`);
    const gain = stealPreview(day, playerId, targetId);
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

  if (kind === "shield") {
    if (day.groupShield && day.groupShield.consumedAt == null) return fail("a Group Shield is already armed");
    return {
      state: { ...day, groupShield: { armedBy: playerId, armedAt: at }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { armed: true, protects: "streaks at day close" } }) },
      result: { ok: true, kind, playerId, armed: true, protects: "streaks at day close" },
    };
  }

  if (kind === "freeze") {
    const limit = day.config.flags?.freezeStackLimit ?? FREEZE_STACK_LIMIT_DEFAULT;
    if (day.freezeCount >= limit) return fail(`freeze stack limit reached (${limit})`);
    return {
      state: { ...day, freezesMs: day.freezesMs + FREEZE_MS, freezeCount: day.freezeCount + 1, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { addedMs: FREEZE_MS, groupWide: true } }) },
      result: { ok: true, kind, playerId, addedMs: FREEZE_MS, groupWide: true, newDeadline: day.config.deadlineAt + day.freezesMs + FREEZE_MS },
    };
  }

  if (kind === "combo_boost") {
    const combos = day.config.combos ?? [];
    if (combos.length === 0) return fail("no prescribed combo configured for today");
    if (day.comboArmed[playerId]) return fail("a combo is already armed");
    const combo = combos.find((c) => c.id === (opts.comboId ?? combos[0].id));
    return {
      state: { ...day, comboArmed: { ...day.comboArmed, [playerId]: { comboId: combo.id, progressed: 0 } }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { comboId: combo.id, sequence: combo.sequence, bonusRuf: combo.bonusRuf } }) },
      result: { ok: true, kind, playerId, comboId: combo.id, sequence: combo.sequence, bonusRuf: combo.bonusRuf },
    };
  }

  if (kind === "double_down") {
    if (day.doubleDowns[playerId]) return fail("already doubled down today");
    if (day.progress[playerId].completedAt != null) return fail("can't double down after completing the day");
    return {
      state: { ...day, doubleDowns: { ...day.doubleDowns, [playerId]: { at, targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER } }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER, rewardMultiplier: DOUBLE_DOWN_REWARD_MULTIPLIER } }) },
      result: { ok: true, kind, playerId, targetMultiplier: DOUBLE_DOWN_TARGET_MULTIPLIER, rewardMultiplier: DOUBLE_DOWN_REWARD_MULTIPLIER },
    };
  }

  if (kind === "assist_boost") {
    const bad = needTarget();
    if (bad) return bad;
    const mate = targetId;
    if (day.progress[mate].completedAt != null) return fail(`${mate} already finished the day`);
    const until = at + ASSIST_WINDOW_MS;
    return {
      state: { ...day, assists: [...day.assists, { fromId: playerId, toId: mate, until }], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { toId: mate, until, bonusRufEach: ASSIST_BONUS_RUF } }) },
      result: { ok: true, kind, playerId, toId: mate, until, bonusRufEach: ASSIST_BONUS_RUF },
    };
  }

  if (kind === "surprise_bomb") {
    const bad = needTarget();
    if (bad) return bad;
    const victim = targetId;
    if (day.progress[victim].completedAt != null) return fail(`${victim} already finished the day`);
    const bomb = {
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

  if (kind === "rescue_rope") {
    const bad = needTarget();
    if (bad) return bad;
    const mate = targetId;
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

  if (kind === "shield_bash") {
    if (!day.groupShield || day.groupShield.consumedAt == null) return fail("no armed shield to bash");
    return {
      state: { ...day, groupShield: { ...day.groupShield, consumedAt: at, consumedKind: "bash" }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { bashed: day.groupShield.armedBy } }) },
      result: { ok: true, kind, playerId, bashed: day.groupShield.armedBy },
    };
  }

  return fail(`power-up ${kind} has no v4 activation path`);
}

/** Resolve expired bombs: hit (≥ SURPRISE_BOMB_RUF banked in window) pays
 *  the defusal bonus as earned RUF; a miss resolves to nothing. */
export function resolveExpiredBombs(day, at) {
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

/* ── Daily battle (spec: game-core/src/daily.ts) ────────────────────────── */

export function isPlayDay(config, date) {
  return config.playDays.includes(date.getDay());
}

export function baseTargetOf(day) {
  return day.config.targetReps ?? DEFAULT_DAILY_TARGET_RUF;
}

/** Completion threshold — the base target for everyone (Double Down is a
 *  reward-side quest + optional win bar, not a completion bar). */
export function effectiveTargetOf(day, _playerId) {
  return baseTargetOf(day);
}

/** RUF counted toward the target (entry ruf + credits; steal only if flagged). */
export function targetProgressOf(day, playerId) {
  const p = day.progress[playerId];
  if (!p) return 0;
  const stealCounts = day.config.flags?.stealCanTriggerWin === true;
  return roundRuf(p.ruf + p.creditRuf + (stealCounts ? p.bonusRuf : 0));
}

export function effectiveDeadline(day) {
  return day.config.deadlineAt + day.freezesMs;
}

export function createDay(config, players) {
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

export function logSet(day, input) {
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

  let state = {
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

  // Combo Boost: prescribed-sequence progress.
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
        const restArmed = { ...state.comboArmed };
        delete restArmed[input.playerId];
        state = addEarnedRuf(state, input.playerId, combo.bonusRuf, input.at, "combo_boost");
        state = { ...state, comboArmed: restArmed, powerLog: [...state.powerLog, { kind: "combo_boost", playerId: input.playerId, at: input.at, detail: { comboId: combo.id, bonusRuf: combo.bonusRuf } }] };
      } else {
        state = { ...state, comboArmed: { ...state.comboArmed, [input.playerId]: { comboId: armed.comboId, progressed: next } } };
      }
    }
  }

  // Surprise Bombs this set could decide — resolved BEFORE the completion
  // check so a defusal bonus can legitimately carry the target over.
  const bombHitBefore = state.bombs.find((b) => b.targetId === input.playerId && b.resolved?.hit);
  state = resolveBombsOnEntry(state, input);
  const bombHitAfter = state.bombs.find((b) => b.targetId === input.playerId && b.resolved?.hit);
  if (bombHitAfter && bombHitBefore !== bombHitAfter) bonusRuf += SURPRISE_BOMB_BONUS_RUF;

  // Completion (bank the day)…
  const target = effectiveTargetOf(state, input.playerId);
  const progress = targetProgressOf(state, input.playerId);
  const p = state.progress[input.playerId];
  let completed = false;
  let wonDay = false;
  if (p.completedAt == null && progress >= target) {
    completed = true;
    state = { ...state, progress: { ...state.progress, [input.playerId]: { ...p, completedAt: input.at } } };
    // Assist Boost: rewards BOTH when the assisted mate finishes in-window.
    for (const a of state.assists) {
      if (a.toId === input.playerId && a.resolved == null && a.until > input.at) {
        bonusRuf += 2 * ASSIST_BONUS_RUF;
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

  // …then the Daily Win: first ELIGIBLE player to the win bar (base target,
  // doubled only for a Double Down volunteer under the Q244 flag, default off).
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

export function closeDay(day, at) {
  if (day.status !== "live") throw new Error("day already closed");
  if (at < effectiveDeadline(day)) throw new Error("deadline not reached yet");

  let state = resolveExpiredBombs(day, at);
  state = { ...state, status: "closed", closedAt: at };

  // Sweep-completions: a defused bomb may carry a player over the line
  // without another log — honour the completion, never a retroactive win.
  for (const p of state.players) {
    const st = state.progress[p.id];
    if (st.completedAt == null && targetProgressOf(state, p.id) >= effectiveTargetOf(state, p.id)) {
      state = { ...state, progress: { ...state.progress, [p.id]: { ...st, completedAt: at } } };
    }
  }

  const outcomes = {};
  const failures = [];
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
    state = { ...state, groupShield: { ...state.groupShield, consumedAt: at, consumedKind: "save" } };
    for (const id of failures) outcomes[id] = { outcome: "shielded", completed: false, streakPreserved: true };
  } else {
    for (const id of failures) outcomes[id] = { outcome: "failed", completed: false, streakPreserved: false };
  }

  state = { ...state, outcomes };
  return { state, outcomes, shieldConsumed };
}

export function doubleDownFinishers(day) {
  return Object.entries(day.doubleDowns)
    .filter(([id, dd]) => {
      const p = day.progress[id];
      return p.completedAt != null && targetProgressOf(day, id) >= baseTargetOf(day) * dd.targetMultiplier;
    })
    .map(([id]) => id);
}

export function dayLeaderboard(day) {
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
        (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity) ||
        b.progressPct - a.progressPct ||
        a.player.id.localeCompare(b.player.id)
    );
}

function addEarnedRuf(day, playerId, ruf, at, kind) {
  return {
    ...day,
    entries: [...day.entries, { playerId, exerciseId: kind, reps: 0, ruf, at, powerUps: [kind] }],
    progress: {
      ...day.progress,
      [playerId]: { ...day.progress[playerId], ruf: roundRuf(day.progress[playerId].ruf + ruf) },
    },
  };
}

function addBonusRuf(day, playerId, ruf) {
  return {
    ...day,
    progress: {
      ...day.progress,
      [playerId]: { ...day.progress[playerId], bonusRuf: roundRuf(day.progress[playerId].bonusRuf + ruf) },
    },
  };
}

function resolveBombsOnEntry(day, input) {
  let state = day;
  for (const bomb of state.bombs) {
    if (bomb.resolved || bomb.targetId !== input.playerId) continue;
    if (input.at > bomb.deadline) continue;
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

/* ── Battle seasons + stakes (spec: game-core/src/season.ts) ────────────── */

export function createBattleSeason(config, players) {
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

/** Glue: fold a closed day into the record recordBattleDay consumes. */
export function dayRecordFrom(day, date) {
  if (day.status !== "closed" || !day.outcomes) throw new Error("day is not closed — closeDay first");
  const completed = [];
  const failed = [];
  const shielded = [];
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

export function recordBattleDay(s, day) {
  if (s.endedAt != null) throw new Error("season is over");
  if (s.days.some((d) => d.date === day.date)) throw new Error(`day ${day.date} already recorded`);
  const known = new Set(s.players.map((p) => p.id));
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
      points[id] += DOUBLE_DOWN_REWARD_MULTIPLIER - 1;
    }
  }

  const streaks = {};
  for (const p of s.players) {
    const st = s.streaks[p.id];
    if (completed.includes(p.id)) {
      const length = st.length + 1;
      streaks[p.id] = { length, best: Math.max(st.best, length), lastDate: day.date };
    } else if (shielded.includes(p.id)) {
      streaks[p.id] = { ...st, lastDate: day.date };
    } else if (failed.includes(p.id)) {
      streaks[p.id] = { ...st, length: 0, lastDate: day.date };
    } else {
      streaks[p.id] = st;
    }
  }

  const tie = winnerIds.length > 1 ? true : s.tie;
  return { ...s, points, streaks, days: [...s.days, day], tie };
}

export function battleStandings(s) {
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

export function endBattleSeason(s, at = Date.now()) {
  if (s.days.length === 0) throw new Error("no days recorded");
  if (s.endedAt != null) return s;
  const rows = battleStandings(s);
  const top = rows.filter((r) => r.points === rows[0].points);
  return top.length === 1
    ? { ...s, champion: top[0].playerId, tie: false, endedAt: at }
    : { ...s, tie: true, endedAt: at };
}

export function proposeStake(s, input, participants, stakeId = `${s.config.id}-stake`) {
  if (input.type === "none") throw new Error(`stake type "none" needs no stake object`);
  if (s.stake && s.stake.status !== "void") throw new Error("season already has a stake");
  const known = new Set(s.players.map((p) => p.id));
  const parts = participants.length > 0 ? participants : s.players.map((p) => p.id);
  for (const id of parts) if (!known.has(id)) throw new Error(`player ${id} not in season`);
  if (parts.length < 2) throw new Error("a stake needs at least two participants");
  if (!input.declaration.trim()) throw new Error("a stake needs a declaration (locked before the season)");

  const stake = {
    id: stakeId,
    seasonId: s.config.id,
    type: input.type,
    declaration: input.declaration,
    ...(input.valuePoints != null ? { valuePoints: input.valuePoints } : {}),
    participants: parts,
    agreements: Object.fromEntries(parts.map((id) => [id, "pending"])),
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

export function agreeToStake(s, playerId) {
  return updateAgreement(s, playerId, "accepted");
}

export function declineStake(s, playerId) {
  return updateAgreement(s, playerId, "declined", true);
}

function updateAgreement(s, playerId, agreement, voidOnDecline = false) {
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

export function contributeToCharityStake(s, playerId, points) {
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

export function charityPotTotal(stake) {
  if (!stake.charity) return 0;
  return Object.values(stake.charity.contributions).reduce((a, b) => a + b, 0);
}

export function resolveSeasonStake(s, at = Date.now()) {
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
  const fulfilment = owesFulfilment
    ? Object.fromEntries(losers.map((id) => [id, { state: "pending" }]))
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

export function designateCharity(s, charityId, byPlayerId) {
  if (!s.stake || s.stake.type !== "charity" || !s.stake.charity)
    throw new Error("season has no charity stake");
  const stake = s.stake;
  if (stake.status !== "resolved" || !stake.resolution)
    throw new Error("stake must be resolved before designating a charity");
  if (!stake.resolution.winnerIds.includes(byPlayerId))
    throw new Error("only the season winner directs the charity pot");
  if (!charityId.trim()) throw new Error("charityId required");
  return { ...s, stake: { ...stake, charity: { ...stake.charity, designatedCharityId: charityId } } };
}

export function processCharityDonation(s, at = Date.now()) {
  if (!s.stake || s.stake.type !== "charity" || !s.stake.charity)
    throw new Error("season has no charity stake");
  const stake = s.stake;
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

export function markStakeFulfilled(s, playerId, evidence) {
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

/* ── Team mode scaffold (spec: game-core/src/teams.ts) ──────────────────── */

export const MIN_TEAM_SIZE = 2;

export function validateTeamMode(config) {
  const errors = [];
  if (config.teams.length < 2) errors.push("team mode needs at least two teams");
  const seen = new Set();
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

export function teamScores(day, config) {
  quotaCheck(config);
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

export function teamDailyWin(day, config) {
  quotaCheck(config);
  const perTarget = config.targetRufPerPlayer ?? baseTargetOf(day);

  if (config.scoringRule === "average") {
    let best = null;
    for (const team of config.teams) {
      const members = team.playerIds.filter((id) => day.progress[id] != null);
      if (members.length === 0) continue;
      if (members.every((id) => day.progress[id].completedAt != null)) {
        const crossedAt = Math.max(...members.map((id) => day.progress[id].completedAt));
        if (!best || crossedAt < best.crossedAt) best = { teamId: team.id, crossedAt };
      }
    }
    return best;
  }

  const timeline = [...day.entries].sort((a, b) => a.at - b.at);
  const pooled = Object.fromEntries(config.teams.map((t) => [t.id, 0]));
  const teamOf = new Map();
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

function quotaCheck(config) {
  if (config.scoringRule === "quota")
    throw new Error(
      "quota team scoring is RESERVED — unimplemented until SOT Q229-231 (team normalisation) close"
    );
}
