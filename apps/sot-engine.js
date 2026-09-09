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
      activatePowerUp(day, playerId, kind, {at?, targetId?|teammateId?, comboId?,
        exerciseId?, memberIds?, rng?})
        → { state, result:{ok, reason?|…} }  — steal: PURE GAIN (target keeps
          theirs); shield: GROUP streak protection consumed at the close it
          saves; freeze: group-wide +30 min; bomb: +20 RUF in 10 min or
          nothing; rescue: 50 credit to an INACTIVE mate (counts to target);
          experimental cards refuse (they live in the v1-v3 forks)
      stealPreview(day, activatorId, targetId) → expected gain
      lightningActive(day, playerId, at)

    THE CARD STACK  (v4.1 — the founder's card system: deal 3, pick 1)
      CARD_CATALOG — the full dealable stack (~21 kinds) with family / rarity /
        target / expiry / counter notes (doc table below the catalog)
      STACK_POOL — kinds a draft can deal
      HAND_CAP (3), STARTING_POINTS (500), REROLL_COSTS (50/100/200 → pot)
      BASE_DRAFT_ODDS (50/30/15/5), CATCH_UP_MAX_SHIFT, catchUpBehind(day, id),
        defaultCatchUpCurve(behind) — behind players draft BETTER cards
      draftOptions(day, id, {count=3, at, rng, curve, reason='open'|'halfway',
        pool}) → { options, state }   3 face-down candidates, odds by curve
      draftPick(day, id, kind, {at}) → pick one (hand cap enforced)
      rerollCostFor(day, id) / pointsOf(day, id) / potTotal(day)
      rerollDraft(day, id, {at, rng, curve}) — pays escalating points TO THE POT
      sweepExpiredCards(day, at) — expired drafts/modifier windows sweep
      proofsOf(day) / voteProof(day, proofId, voterId, 'accept'|'contest')
        — the Prove It / Spot Check group review (settles on majority or when
          all others voted; contested logs score 0 but never un-bank the day)

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
  if (!POWER_UP_CATALOG[kind] && !CARD_CATALOG[kind]) throw new Error(`unknown power-up ${kind}`);
  if (!day.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in battle`);
  return { ...day, inventory: { ...day.inventory, [playerId]: [...inventoryOf(day, playerId), kind] } };
}

export function activatePowerUp(day, playerId, kind, opts = {}) {
  const at = opts.at ?? Date.now();
  const def = CARD_CATALOG[kind] ?? POWER_UP_CATALOG[kind];
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
  const modOf = (pid) => day.modifiers?.[pid] ?? {};
  const setMod = (patch) => ({
    ...day,
    modifiers: { ...(day.modifiers ?? {}), [playerId]: { ...modOf(playerId), ...patch } },
  });

  if (def.experimental && kind !== "second_wind")
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
    const state = maybeCompleteAndWin({
      ...day,
      progress: { ...day.progress, [playerId]: { ...t, bonusRuf: roundRuf(t.bonusRuf + gain) } },
      stealUsed: { ...day.stealUsed, [playerId]: true },
      inventory: spend(),
      powerLog: log({ kind, playerId, at, detail: { targetId, gain, targetKept: true } }),
    }, playerId, at).state;
    return {
      state,
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
    if (!combo) return fail(`unknown combo ${opts.comboId}`);
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
    if (!day.groupShield || day.groupShield.consumedAt != null) return fail("no armed shield to bash");
    return {
      state: { ...day, groupShield: { ...day.groupShield, consumedAt: at, consumedKind: "bash" }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { bashed: day.groupShield.armedBy } }) },
      result: { ok: true, kind, playerId, bashed: day.groupShield.armedBy },
    };
  }

  /* ── the card stack (v4.1) ─────────────────────────────────────────── */

  if (kind === "double_exercise") {
    const exId = opts.exerciseId;
    if (!exId) return fail("name one exercise — this card needs an exercise");
    if (modOf(playerId).doubleExerciseId) return fail("an exercise is already doubled today");
    if (day.config.exercises && day.config.exercises.length > 0 &&
        !day.config.exercises.some((e) => e.id === exId))
      return fail(`exercise ${exId} is not in today's library`);
    const state = { ...setMod({ doubleExerciseId: exId }), inventory: spend(), powerLog: log({ kind, playerId, at, detail: { exerciseId: exId, multiplier: DOUBLE_EXERCISE_MULTIPLIER, until: "end of day" } }) };
    return { state, result: { ok: true, kind, playerId, exerciseId: exId, multiplier: DOUBLE_EXERCISE_MULTIPLIER } };
  }

  if (kind === "specialist") {
    if (modOf(playerId).specialistIds) return fail("the Specialist is already riding your top three");
    const byEx = {};
    for (const e of day.entries) {
      if (e.playerId !== playerId || e.reps <= 0) continue;
      byEx[e.exerciseId] = (byEx[e.exerciseId] ?? 0) + e.ruf;
    }
    const top = Object.entries(byEx).sort((a, b) => b[1] - a[1]).slice(0, SPECIALIST_TOP_N).map(([id]) => id);
    if (top.length === 0) return fail("log a set first — the Specialist rides your top three");
    const state = { ...setMod({ specialistIds: top }), inventory: spend(), powerLog: log({ kind, playerId, at, detail: { exercises: top, multiplier: SPECIALIST_MULTIPLIER } }) };
    return { state, result: { ok: true, kind, playerId, exercises: top, multiplier: SPECIALIST_MULTIPLIER } };
  }

  if (kind === "wildcard_workout") {
    if (modOf(playerId).wildcard) return fail("the Wildcard is already live for you today");
    const state = { ...setMod({ wildcard: true }), inventory: spend(), powerLog: log({ kind, playerId, at, detail: { anyCountsAsAny: true, until: "end of day" } }) };
    return { state, result: { ok: true, kind, playerId, anyCountsAsAny: true } };
  }

  if (kind === "rivalry") {
    const bad = needTarget();
    if (bad) return bad;
    const already = (day.rivalries ?? []).some((r) => r.a === targetId && r.b === playerId);
    if (already) return fail("this rivalry is already live");
    return {
      state: { ...day, rivalries: [...(day.rivalries ?? []), { a: playerId, b: targetId, at, bonusRuf: RIVALRY_BONUS_RUF }], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { rivalId: targetId, bonusRuf: RIVALRY_BONUS_RUF, settles: "end of day" } }) },
      result: { ok: true, kind, playerId, rivalId: targetId, bonusRuf: RIVALRY_BONUS_RUF },
    };
  }

  if (kind === "training_partners") {
    const bad = needTarget();
    if (bad) return bad;
    const taken = (day.partnerships ?? []).some((p) => p.a === playerId || p.b === playerId || p.a === targetId || p.b === targetId);
    if (taken) return fail("one partner per day — a partnership is already live");
    return {
      state: { ...day, partnerships: [...(day.partnerships ?? []), { a: playerId, b: targetId, at, bonusRuf: PARTNERSHIP_BONUS_RUF }], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { partnerId: targetId, bothMustBank: true, bonusRufEach: PARTNERSHIP_BONUS_RUF } }) },
      result: { ok: true, kind, playerId, partnerId: targetId, bonusRufEach: PARTNERSHIP_BONUS_RUF },
    };
  }

  if (kind === "pack_bond") {
    if (day.packBond) return fail("the pack is already bonded today");
    const members = [...new Set(opts.memberIds ?? [])].filter((id) => day.players.some((p) => p.id === id));
    if (members.length < 2) return fail("team card — pick your pack (2+ members)");
    return {
      state: { ...day, packBond: { by: playerId, memberIds: members, at, thresholdRuf: PACK_BOND_THRESHOLD_RUF, share: PACK_BOND_SHARE }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { members, thresholdRuf: PACK_BOND_THRESHOLD_RUF, share: PACK_BOND_SHARE } }) },
      result: { ok: true, kind, playerId, members, thresholdRuf: PACK_BOND_THRESHOLD_RUF },
    };
  }

  if (kind === "prove_it") {
    const bad = needTarget();
    if (bad) return bad;
    const awaiting = (day.proofs ?? []).find((p) => p.targetId === targetId && (p.status === "awaiting_log" || p.status === "review"));
    if (awaiting) return fail(`${targetId} is already under a proof request`);
    const proof = { id: `proof-${(day.proofs ?? []).length}-${at}`, fromId: playerId, targetId, issuedAt: at, status: "awaiting_log", bonusRuf: PROVE_IT_BONUS_RUF };
    return {
      state: { ...day, proofs: [...(day.proofs ?? []), proof], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { targetId, watches: "next log", bonusRuf: PROVE_IT_BONUS_RUF } }) },
      result: { ok: true, kind, playerId, targetId, proofId: proof.id, bonusRuf: PROVE_IT_BONUS_RUF },
    };
  }

  if (kind === "spot_check") {
    const rows = day.players.map((p) => ({ id: p.id, prog: targetProgressOf(day, p.id) })).sort((a, b) => b.prog - a.prog);
    const leader = rows[0];
    if (!leader || leader.prog <= 0) return fail("no leader on the board yet — nothing to check");
    if (leader.id === playerId) return fail("you're leading — nothing to spot check");
    const real = day.entries.filter((e) => e.playerId === leader.id && e.reps > 0 && !e.powerUps);
    if (!real.length) return fail("the leader has no real log to check yet");
    let biggest = real[0];
    for (const e of real) if (e.ruf > biggest.ruf) biggest = e;
    if (biggest.verified) return fail("the leader's biggest log is already verified");
    const entryIndex = day.entries.indexOf(biggest);
    const proof = { id: `proof-${(day.proofs ?? []).length}-${at}`, fromId: playerId, targetId: leader.id, issuedAt: at, status: "review", entryIndex, bonusRuf: PROVE_IT_BONUS_RUF, votes: {}, spot: true };
    const entries = day.entries.map((e, i) => (i === entryIndex ? { ...e, underReview: proof.id } : e));
    return {
      state: { ...day, entries, proofs: [...(day.proofs ?? []), proof], inventory: spend(), powerLog: log({ kind, playerId, at, detail: { targetId: leader.id, entryIndex, reviews: "biggest log" } }) },
      result: { ok: true, kind, playerId, targetId: leader.id, proofId: proof.id, entryRuf: biggest.ruf },
    };
  }

  if (kind === "second_wind") {
    const behind = catchUpBehind(day, playerId);
    if (behind < SECOND_WIND_MIN_BEHIND) return fail(`you're too close to the front — Second Wind is for comebacks (need ${Math.round(SECOND_WIND_MIN_BEHIND * 100)}% behind, you're ${Math.round(behind * 100)}%)`);
    const until = at + SECOND_WIND_MS;
    return {
      state: { ...day, secondWinds: { ...(day.secondWinds ?? {}), [playerId]: { until } }, inventory: spend(), powerLog: log({ kind, playerId, at, detail: { until, multiplier: SECOND_WIND_MULTIPLIER, behind } }) },
      result: { ok: true, kind, playerId, until, multiplier: SECOND_WIND_MULTIPLIER },
    };
  }

  if (kind === "mulligan") {
    const discarded = held.filter((_, i) => i !== idx);
    const base = { ...day, inventory: { ...day.inventory, [playerId]: [] } };
    const odds = defaultCatchUpCurve(catchUpBehind(base, playerId));
    const rng = opts.rng ?? Math.random;
    const options = [];
    let guard = 0;
    while (options.length < 3 && guard++ < 200) {
      const k = randomKindByOdds(odds, rng);
      if (!options.includes(k)) options.push(k);
    }
    const state = {
      ...base,
      drafts: { ...(base.drafts ?? {}), [playerId]: { options, openedAt: at, rerolls: base.drafts?.[playerId]?.rerolls ?? 0, reason: "mulligan", expiresAt: effectiveDeadline(base) } },
      powerLog: log({ kind, playerId, at, detail: { discarded: discarded.length, dealt: 3 } }),
    };
    return { state, result: { ok: true, kind, playerId, discarded: discarded.length, options } };
  }

  if (kind === "underdog") {
    if (modOf(playerId).underdog) return fail("the Underdog is already riding for you today");
    const mine = targetProgressOf(day, playerId);
    const others = day.players.filter((p) => p.id !== playerId).map((p) => targetProgressOf(day, p.id));
    if (others.some((o) => o < mine)) return fail("you're not last — the Underdog rides at the back of the pack");
    const state = { ...setMod({ underdog: true }), inventory: spend(), powerLog: log({ kind, playerId, at, detail: { multiplier: UNDERDOG_MULTIPLIER, until: "end of day" } }) };
    return { state, result: { ok: true, kind, playerId, multiplier: UNDERDOG_MULTIPLIER } };
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

/* ═══════════════════════════════════════════════════════════════════════
   THE CARD STACK (v4.1 — the founder's directives, made real)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   "When cards are given players should have the option of which card to
   pick out of three dealt" — draftOptions/draftPick below.
   "A stack of many different cards — making an exercise or relationship
   worth more, or making another player prove they did the exercise which
   other players have to accept" — the exercise / rivalry / proof families.

   STATE DISCIPLINE (parity guard): every stack field (drafts, modifiers,
   proofs, rivalries, partnerships, packBond, points, pot, rerolls, deals,
   secondWinds) is created LAZILY by the API that needs it. A day that never
   touches the stack carries NONE of these keys — the TS-core parity harness
   (apps/sot-engine.test.js) snapshots whole day objects and must stay green.

   ── THE DECK (21 dealable kinds · CARD_CATALOG) ──────────────────────────
   ┌ family     ─ card ─────────┬ rar ───┬ target ──┬ expiry ──┬ notes ─────┐
   │ CANON (SOT §3.6 launch 4)                                                │
   │ lightning    Lightning Round │ leg │ self     │ 10 min   │ ×3 window  │
   │ steal        Rep Steal       │ epi │ rival    │ instant  │ pure gain; │
   │              │                │     │          │          │ counters: │
   │              │                │     │          │          │ anchor(v3)│
   │ shield       Group Shield    │ com │ group    │ day close│ bashable  │
   │ freeze       Time Freeze     │ rar │ group    │ instant  │ stack cap │
   │ POST-LAUNCH (SOT §3.6 — already specced)                                 │
   │ combo_boost  Combo Boost     │ rar │ self     │ day      │ combo armed│
   │ double_down  Double Down     │ epi │ self     │ day      │ 2× quest   │
   │ assist_boost Assist Boost    │ com │ mate     │ 30 min   │ both paid  │
   │ surprise_bomb Surprise Bomb  │ epi │ rival    │ 10 min   │ defusal +20│
   │ rescue_rope  Rescue Rope     │ rar │ mate     │ instant  │ inactive   │
   │ shield_bash  Shield Bash     │ rar │ group    │ instant  │ needs armed│
   │ EXERCISE (founder-named — "make an exercise worth more")                 │
   │ double_exercise Double Exer. │ rar │ exercise │ end of   │ name one   │
   │              │                │     │          │ day      │ exercise; │
   │              │                │     │          │          │ yours ×2  │
   │ specialist   Specialist      │ epi │ self     │ end of   │ top-3 most │
   │              │                │     │          │ day      │ logged ×1.5│
   │ wildcard_workout Wildcard W. │ leg │ self     │ end of   │ any counts │
   │              │                │     │          │ day      │ as any    │
   │ RIVALRY (founder-named — "make a relationship worth more")              │
   │ rivalry      Rivalry         │ com │ rival    │ end of   │ more reps  │
   │              │                │     │          │ day      │ today:    │
   │              │                │     │          │          │ +30 RUF   │
   │ training_partners Training   │ rar │ mate     │ end of   │ both bank: │
   │              Partners        │     │          │ day      │ +25 each +│
   │              │                │     │          │          │ bonus stat│
   │ pack_bond    Pack Bond       │ epi │ team     │ end of   │ ≥20 RUF →  │
   │              │                │     │          │ day      │ +10% each │
   │ PROOF (SOT §2.11 — "others have to accept")                             │
   │ prove_it     Prove It        │ rar │ rival    │ next log │ verified → │
   │              │                │     │          │          │ THEY +15; │
   │              │                │     │          │          │ else group│
   │              │                │     │          │          │ accept/   │
   │              │                │     │          │          │ contest   │
   │ spot_check   Spot Check      │ epi │ leader   │ biggest  │ same flow, │
   │              │                │     │          │ log      │ auto-aim  │
   │ CATCH-UP / UTILITY (never shame — the comeback lane)                    │
   │ second_wind  Second Wind     │ rar │ self     │ 15 min   │ ≥40% behind│
   │              │                │     │          │          │ → ×1.5    │
   │ mulligan     Mulligan        │ com │ self     │ instant  │ discard    │
   │              │                │     │          │          │ hand, new │
   │              │                │     │          │          │ deal of 3 │
   │ underdog     Underdog        │ epi │ self     │ end of   │ last place │
   │              │                │     │          │ day      │ → ×1.25   │
   └────────────────────────────────────────────────────────────────────────┘
   Rarity odds in a deal: common 50% / rare 30% / epic 15% / legendary 5%,
   shifted by the CATCH-UP CURVE (ported from the v1 draft economy): a player
   100% behind the leader drafts at 10/50/27/13. Every reroll pays points TO
   THE POT (50 → 100 → 200, then holds). ═══════════════════════════════ */

export const HAND_CAP = 3;
export const STARTING_POINTS = 500;
export const REROLL_COSTS = [50, 100, 200];
export const BASE_DRAFT_ODDS = { common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 };
export const CATCH_UP_MAX_SHIFT = 0.4;

export const DOUBLE_EXERCISE_MULTIPLIER = 2;
export const SPECIALIST_MULTIPLIER = 1.5;
export const SPECIALIST_TOP_N = 3;
export const UNDERDOG_MULTIPLIER = 1.25;
export const RIVALRY_BONUS_RUF = 30;
export const PARTNERSHIP_BONUS_RUF = 25;
export const PACK_BOND_THRESHOLD_RUF = 20;
export const PACK_BOND_SHARE = 0.1;
export const PROVE_IT_BONUS_RUF = 15;
export const SECOND_WIND_MS = 15 * 60 * 1000;
export const SECOND_WIND_MULTIPLIER = 1.5;
export const SECOND_WIND_MIN_BEHIND = 0.4;

export const CARD_CATALOG = {
  // canon (SOT §3.6 launch four)
  lightning:     { kind: "lightning", name: "Lightning Round", family: "canon", rarity: "legendary", target: "self", expiry: "10-minute window", blurb: "Your reps count ×3 for the next 10 minutes · once per day", counters: "none — the storm is fair" },
  steal:         { kind: "steal", name: "Rep Steal", family: "canon", rarity: "epic", target: "rival", expiry: "instant", blurb: "Gain 10% of a rival's completed score — they keep theirs", counters: "Anchor (v3 lane)" },
  shield:        { kind: "shield", name: "Group Shield", family: "canon", rarity: "common", target: "group", expiry: "consumed at the close it saves", blurb: "Protect everyone's streak from one failed day", counters: "Shield Bash" },
  freeze:        { kind: "freeze", name: "Time Freeze", family: "canon", rarity: "rare", target: "group", expiry: "instant (+30 min)", blurb: "The battle clock extends 30 minutes, group-wide", counters: "stack limit 1" },
  // post-launch set (SOT §3.6 — already specced, mechanics live above)
  combo_boost:   { kind: "combo_boost", name: "Combo Boost", family: "post-launch", rarity: "rare", target: "self", expiry: "end of day", blurb: "Bonus for nailing a prescribed exercise combo", counters: "wrong order resets progress" },
  double_down:   { kind: "double_down", name: "Double Down", family: "post-launch", rarity: "epic", target: "self", expiry: "end of day", blurb: "Volunteer for 2× target; 2× season reward if you make it", counters: "completion bar unchanged" },
  assist_boost:  { kind: "assist_boost", name: "Assist Boost", family: "post-launch", rarity: "common", target: "mate", expiry: "30-minute window", blurb: "Help a mate finish — you both get rewarded when they do", counters: "mate must finish in-window" },
  surprise_bomb: { kind: "surprise_bomb", name: "Surprise Bomb", family: "post-launch", rarity: "epic", target: "rival", expiry: "10-minute fuse", blurb: "Drop +20 reps on a rival: 10 minutes to deliver or it fizzles", counters: "defusal pays the victim" },
  rescue_rope:   { kind: "rescue_rope", name: "Rescue Rope", family: "post-launch", rarity: "rare", target: "mate", expiry: "instant", blurb: "Instant 50-rep credit to an inactive teammate · limited", counters: "inactive mates only" },
  shield_bash:   { kind: "shield_bash", name: "Shield Bash", family: "post-launch", rarity: "rare", target: "group", expiry: "instant", blurb: "Cancel the active Group Shield · Pro/competitive", counters: "needs an armed shield" },
  // exercise modifiers (founder-named: "making an exercise worth more")
  double_exercise: { kind: "double_exercise", name: "Double Exercise", family: "exercise", rarity: "rare", target: "exercise", expiry: "end of day", blurb: "Name one exercise — your reps of it count ×2 today", counters: "one exercise per day" },
  specialist:      { kind: "specialist", name: "Specialist", family: "exercise", rarity: "epic", target: "self", expiry: "end of day", blurb: `Your ${SPECIALIST_TOP_N} most-logged exercises' reps +50% today`, counters: "top-3 frozen at play time" },
  wildcard_workout:{ kind: "wildcard_workout", name: "Wildcard Workout", family: "exercise", rarity: "legendary", target: "self", expiry: "end of day", blurb: "Any exercise counts as any other for you today", counters: "the group sees the wild log" },
  // relationship / rivalry (founder-named: "making a relationship worth more")
  rivalry:          { kind: "rivalry", name: "Rivalry", family: "rivalry", rarity: "common", target: "rival", expiry: "end of day", blurb: "Pick a rival — whoever logs more today takes +30 reps", counters: "tie pays nobody" },
  training_partners:{ kind: "training_partners", name: "Training Partners", family: "rivalry", rarity: "rare", target: "mate", expiry: "end of day", blurb: "Pick a partner — if you BOTH bank today, you both earn the partner bonus", counters: "one partner per day · bonus stat, not a season point (open Q)" },
  pack_bond:        { kind: "pack_bond", name: "Pack Bond", family: "rivalry", rarity: "epic", target: "team", expiry: "end of day", blurb: `Team card: every member who logs ≥${PACK_BOND_THRESHOLD_RUF} reps gets +10% today`, counters: "team mode only" },
  // proof / integrity (SOT §2.11 — flag, peer review, trust)
  prove_it:   { kind: "prove_it", name: "Prove It", family: "proof", rarity: "rare", target: "rival", expiry: "target's next log", blurb: `Target's next log must be verified — verify and THEY bank +${PROVE_IT_BONUS_RUF}; skip and the crew accepts or contests`, counters: "contested logs score 0 but still bank the day" },
  spot_check: { kind: "spot_check", name: "Spot Check", family: "proof", rarity: "epic", target: "leader", expiry: "biggest log", blurb: "Random proof check on the current leader's biggest log — the crew accepts or contests", counters: "verified logs are immune" },
  // catch-up / utility (never shame — comeback framing)
  second_wind: { kind: "second_wind", name: "Second Wind", family: "catch-up", rarity: "rare", target: "self", expiry: "15-minute window", blurb: "Behind the pack? Your reps count ×1.5 for 15 minutes", counters: `needs ≥${Math.round(SECOND_WIND_MIN_BEHIND * 100)}% gap to the leader` },
  mulligan:    { kind: "mulligan", name: "Mulligan", family: "catch-up", rarity: "common", target: "self", expiry: "instant", blurb: "Discard your hand — a fresh deal of 3 is on the table", counters: "the discarded cards are gone" },
  underdog:    { kind: "underdog", name: "Underdog", family: "catch-up", rarity: "epic", target: "self", expiry: "end of day", blurb: "Last place at the deal? Your reps count ×1.25 today", counters: "front-runners can't ride it" },
};

export const STACK_POOL = Object.keys(CARD_CATALOG);

/** How far behind the leader a player is, 0..1 (target progress basis). */
export function catchUpBehind(day, playerId) {
  const rows = day.players.map((p) => targetProgressOf(day, p.id));
  const leader = Math.max(...rows, 0);
  if (leader <= 0) return 0;
  return Math.min(1, Math.max(0, (leader - targetProgressOf(day, playerId)) / leader));
}

/** THE CATCH-UP CURVE (default, injectable — ported from the v1 draft
 *  economy): behind 0 → 50/30/15/5, behind 1 → 10/50/27/13, linear between.
 *  A player 50% behind drafts ~26% epic vs the leader's 15%. */
export function defaultCatchUpCurve(behind) {
  const b = Math.min(1, Math.max(0, behind));
  const shift = b * CATCH_UP_MAX_SHIFT;
  return {
    common: BASE_DRAFT_ODDS.common - shift,
    rare: BASE_DRAFT_ODDS.rare + shift * 0.5,
    epic: BASE_DRAFT_ODDS.epic + shift * 0.3,
    legendary: BASE_DRAFT_ODDS.legendary + shift * 0.2,
  };
}

/** Sample a card kind from an odds table (injectable rng). Rarity bands walk
 *  best-first; kinds draw uniformly within the rarity inside `pool`. */
export function randomKindByOdds(odds, rng = Math.random, pool = STACK_POOL) {
  const r = rng();
  const bands = [
    ["legendary", odds.legendary],
    ["epic", odds.epic],
    ["rare", odds.rare],
    ["common", odds.common],
  ];
  let acc = 0;
  let rarity = "common";
  for (const [name, p] of bands) {
    acc += p;
    if (r < acc) { rarity = name; break; }
  }
  let kinds = pool.filter((k) => CARD_CATALOG[k]?.rarity === rarity);
  if (!kinds.length) kinds = pool.filter((k) => CARD_CATALOG[k]); // degenerate pool
  if (!kinds.length) return "shield";
  return kinds[Math.floor(rng() * kinds.length) % kinds.length];
}

/** Deal 3 face-down candidates (the founder's "pick out of three dealt").
 *  Odds ride the catch-up curve; options stored on the day until picked /
 *  rerolled / swept. reason: "open" (day open) | "halfway" (the earned 50%
 *  bonus deal — once per player per day). Pure: { options, state }. */
export function draftOptions(day, playerId, { count = 3, at = Date.now(), rng = Math.random, curve = defaultCatchUpCurve, reason = "open", pool = STACK_POOL } = {}) {
  const fail = (reasonText) => ({ options: [], state: day, result: { ok: false, playerId, reason: reasonText } });
  if (!day.players.some((p) => p.id === playerId)) return fail(`player ${playerId} not in battle`);
  if (day.status !== "live") return fail("day is closed");
  if (day.drafts?.[playerId]) return fail("a deal is already on the table");
  if (inventoryOf(day, playerId).length >= HAND_CAP) return fail("hand full — play a card first");
  if (reason === "halfway" && day.deals?.[playerId]?.halfway) return fail("the halfway bonus deal is already used today");
  const usable = pool.filter((k) => CARD_CATALOG[k]);
  if (!usable.length) return fail("no cards enabled for this group");
  const odds = curve(catchUpBehind(day, playerId));
  const options = [];
  let guard = 0;
  while (options.length < Math.min(count, usable.length) && guard++ < 200) {
    const kind = randomKindByOdds(odds, rng, usable);
    if (!options.includes(kind)) options.push(kind);
  }
  let state = {
    ...day,
    drafts: {
      ...(day.drafts ?? {}),
      [playerId]: { options, openedAt: at, rerolls: day.drafts?.[playerId]?.rerolls ?? 0, reason, expiresAt: effectiveDeadline(day) },
    },
  };
  if (reason === "halfway") {
    state = { ...state, deals: { ...(day.deals ?? {}), [playerId]: { ...(day.deals?.[playerId] ?? {}), halfway: true } } };
  }
  return { options, state, result: { ok: true, playerId, options, reason } };
}

/** Pick one of the dealt cards → into the hand (cap HAND_CAP). */
export function draftPick(day, playerId, kind, { at = Date.now() } = {}) {
  const draft = day.drafts?.[playerId];
  const fail = (reason) => ({ state: day, result: { ok: false, kind, playerId, reason } });
  if (!draft) return fail("no deal on the table");
  if (!draft.options.includes(kind)) return fail("card not offered in this deal");
  if (inventoryOf(day, playerId).length >= HAND_CAP) return fail(`hand full (max ${HAND_CAP}) — play a card first`);
  const def = CARD_CATALOG[kind];
  let state = grantPowerUp(day, playerId, kind);
  const drafts = { ...(state.drafts ?? {}) };
  delete drafts[playerId];
  state = {
    ...state,
    drafts,
    powerLog: [...state.powerLog, { kind, playerId, at, event: "draft_pick", rarity: def.rarity, family: def.family, expiresAt: effectiveDeadline(state) }],
  };
  return { state, result: { ok: true, kind, name: def.name, rarity: def.rarity, family: def.family, playerId, expiresAt: effectiveDeadline(state) } };
}

/** Reroll price right now — 50 → 100 → 200 per player per day, then holds. */
export function rerollCostFor(day, playerId) {
  const n = day.rerolls?.[playerId] ?? 0;
  return REROLL_COSTS[Math.min(n, REROLL_COSTS.length - 1)];
}

/** Trial points balance (every player starts the day with STARTING_POINTS).
 *  Lazy: days that never touch points carry no `points` key. */
export function pointsOf(day, playerId) {
  return day.points?.[playerId] ?? STARTING_POINTS;
}

/** The pot — fed by rerolls (the "pay to the pot" mechanic). Day-scoped. */
export function potTotal(day) {
  return day.pot?.points ?? 0;
}

/** Reroll the pending deal: player pays the escalating cost, the POT grows,
 *  three fresh candidates hit the table. Refuses on no draft / short balance. */
export function rerollDraft(day, playerId, { at = Date.now(), rng = Math.random, curve = defaultCatchUpCurve, pool = STACK_POOL } = {}) {
  const fail = (reason) => ({ state: day, result: { ok: false, playerId, reason } });
  const draft = day.drafts?.[playerId];
  if (!draft) return fail("no deal on the table");
  const cost = rerollCostFor(day, playerId);
  const balance = pointsOf(day, playerId);
  if (balance < cost) return fail(`reroll costs ${cost} points (you have ${balance})`);
  const rest = { ...day, drafts: { ...(day.drafts ?? {}) }, points: { ...(day.points ?? {}), [playerId]: balance - cost }, pointsLedger: { ...(day.pointsLedger ?? {}), [playerId]: [...(day.pointsLedger?.[playerId] ?? []), { delta: -cost, reason: "reroll", at, balance: balance - cost }] }, pot: { points: potTotal(day) + cost, ledger: [...(day.pot?.ledger ?? []), { playerId, amount: cost, reason: "reroll", at }] } };
  delete rest.drafts[playerId];
  const re = draftOptions(rest, playerId, { count: draft.options.length, at, rng, curve, reason: draft.reason, pool });
  if (!re.result.ok) return fail(re.result.reason);
  const state = {
    ...re.state,
    rerolls: { ...(day.rerolls ?? {}), [playerId]: (day.rerolls?.[playerId] ?? 0) + 1 },
    powerLog: [...re.state.powerLog, { playerId, at, event: "reroll", cost }],
  };
  return { state, result: { ok: true, cost, options: re.options, balance: balance - cost, pot: potTotal(state), playerId } };
}

/** Sweep expired stack state: past-deadline drafts vanish (never pickable). */
export function sweepExpiredCards(day, at) {
  let changed = false;
  const drafts = { ...(day.drafts ?? {}) };
  for (const [pid, d] of Object.entries(drafts)) {
    if (d.expiresAt != null && at >= d.expiresAt) { delete drafts[pid]; changed = true; }
  }
  if (!changed) return day;
  return { ...day, drafts };
}

/** Open proofs (Prove It / Spot Check review state), newest last. */
export function proofsOf(day) {
  return day.proofs ?? [];
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
  const mods = day.modifiers?.[input.playerId];
  if (day.config.exercises && day.config.exercises.length > 0 &&
      !day.config.exercises.some((e) => e.id === input.exerciseId)) {
    // Wildcard Workout: any exercise counts as any other for the holder
    if (!mods?.wildcard) throw new Error(`exercise ${input.exerciseId} not allowed today`);
  }
  if (!Number.isInteger(input.reps) || input.reps <= 0)
    throw new Error("reps must be a positive integer");
  if (input.at >= effectiveDeadline(day)) throw new Error("past the battle deadline");

  const bolt = lightningActive(day, input.playerId, input.at);
  let ruf = entryRufValue(day, player, input, bolt);
  const stack = [];
  if (mods?.doubleExerciseId === input.exerciseId) {
    ruf = roundRuf(ruf * DOUBLE_EXERCISE_MULTIPLIER); stack.push("double_exercise");
  }
  if (mods?.specialistIds?.includes(input.exerciseId)) {
    ruf = roundRuf(ruf * SPECIALIST_MULTIPLIER); stack.push("specialist");
  }
  if (mods?.underdog) {
    ruf = roundRuf(ruf * UNDERDOG_MULTIPLIER); stack.push("underdog");
  }
  const sw = day.secondWinds?.[input.playerId];
  if (sw && input.at < sw.until) {
    ruf = roundRuf(ruf * SECOND_WIND_MULTIPLIER); stack.push("second_wind");
  }
  if (mods?.wildcard) stack.push("wildcard_workout");
  const powerUps = bolt ? ["lightning"] : undefined;

  let state = {
    ...day,
    entries: [...day.entries, { ...input, ruf, powerUps, ...(stack.length ? { stack } : {}) }],
    progress: {
      ...day.progress,
      [input.playerId]: {
        ...day.progress[input.playerId],
        ruf: roundRuf(day.progress[input.playerId].ruf + ruf),
      },
    },
  };

  // Prove It: bind the target's next log to its proof. A verified log pays
  // the TARGET the honest-incentive bonus on the spot (it counts toward
  // their day); an unverified log goes to group review instead.
  if (state.proofs?.length) {
    const proof = state.proofs.find((p) => p.targetId === input.playerId && p.status === "awaiting_log");
    if (proof) {
      const entryIndex = state.entries.length - 1;
      if (input.verified) {
        state = {
          ...state,
          entries: state.entries.map((e, i) => (i === entryIndex ? { ...e, proof: proof.id, verified: true } : e)),
          proofs: state.proofs.map((p) => (p === proof ? { ...p, status: "verified", entryIndex, settledAt: input.at } : p)),
        };
        state = addEarnedRuf(state, input.playerId, PROVE_IT_BONUS_RUF, input.at, "prove_it");
        state = { ...state, powerLog: [...state.powerLog, { kind: "prove_it", playerId: proof.fromId, at: input.at, detail: { targetId: input.playerId, verified: true, bonusRuf: PROVE_IT_BONUS_RUF } }] };
      } else {
        state = {
          ...state,
          entries: state.entries.map((e, i) => (i === entryIndex ? { ...e, underReview: proof.id } : e)),
          proofs: state.proofs.map((p) => (p === proof ? { ...p, status: "review", entryIndex, votes: {} } : p)),
        };
      }
    }
  }

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
  const completion = maybeCompleteAndWin(state, input.playerId, input.at, { assignWin: false });
  state = completion.state;
  let completed = completion.completed;
  let wonDay = false;
  if (completed) {
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
  if (state.winnerId == null && progressNow >= winBar && progressNow >= effectiveTargetOf(state, input.playerId) && !hasPendingProofCredit(state, input.playerId)) {
    wonDay = true;
    state = { ...state, winnerId: input.playerId, wonAt: input.at };
  }

  return { state, ruf, completed, wonDay, bonusRuf: roundRuf(bonusRuf) };
}

export function closeDay(day, at) {
  if (day.status !== "live") throw new Error("day already closed");
  if (at < effectiveDeadline(day)) throw new Error("deadline not reached yet");

  let state = resolveExpiredBombs(day, at);

  // Sweep-completions: a defused bomb may carry a player over the line
  // without another log — honour the completion, never a retroactive win.
  for (const p of state.players) {
    const st = state.progress[p.id];
    if (st.completedAt == null && targetProgressOf(state, p.id) >= effectiveTargetOf(state, p.id)) {
      state = { ...state, progress: { ...state.progress, [p.id]: { ...st, completedAt: at } } };
    }
  }

  // Card-stack resolutions (all lazy — untouched days stay untouched, and
  // the TS-core parity digest never sees these fields).
  state = resolveRivalries(state, at);
  state = settleProofs(state, at);   // contested entries score 0; provisional completions can drop
  state = resolvePartnerships(state, at);
  state = resolvePackBond(state, at);
  state = recomputeLiveWinner(state);
  state = { ...state, status: "closed", closedAt: at };

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

  // Stack outcome flags (lazy — only on days that played the card)
  if (state.rivalries) {
    for (const r of state.rivalries) {
      if (r.winnerId) outcomes[r.winnerId] = { ...outcomes[r.winnerId], rivalryWon: true };
    }
  }
  if (state.partnerships) {
    for (const p of state.partnerships) {
      if (p.fulfilled) {
        outcomes[p.a] = { ...outcomes[p.a], partnershipBonus: true };
        outcomes[p.b] = { ...outcomes[p.b], partnershipBonus: true };
      }
    }
  }
  if (state.packBond?.paid) {
    for (const id of Object.keys(state.packBond.paid)) {
      outcomes[id] = { ...outcomes[id], packBondPaid: true };
    }
  }

  state = { ...state, outcomes };
  return { state, outcomes, shieldConsumed };
}

/* ── card-stack close-out helpers (all lazy: no card state → same state) ── */

function winBarOf(day, playerId) {
  const dd = day.doubleDowns?.[playerId];
  return dd && day.config.flags?.doubleDownAffectsDailyWin
    ? roundRuf(baseTargetOf(day) * dd.targetMultiplier)
    : baseTargetOf(day);
}

function hasPendingProofCredit(day, playerId) {
  const proofs = day.proofs ?? [];
  return proofs.some((p) => p.targetId === playerId && p.status === "review");
}

function maybeCompleteAndWin(day, playerId, at, opts = {}) {
  const progress = targetProgressOf(day, playerId);
  const target = effectiveTargetOf(day, playerId);
  const p = day.progress[playerId];
  let state = day;
  let completed = false;
  let wonDay = false;
  if (p.completedAt == null && progress >= target) {
    completed = true;
    state = { ...state, progress: { ...state.progress, [playerId]: { ...p, completedAt: at } } };
  }
  const canAssignWin = opts.assignWin !== false && state.winnerId == null &&
    progress >= target && progress >= winBarOf(state, playerId) &&
    !hasPendingProofCredit(state, playerId);
  if (canAssignWin) {
    wonDay = true;
    state = { ...state, winnerId: playerId, wonAt: at };
  }
  return { state, completed, wonDay };
}

function recomputeLiveWinner(day) {
  let state = day;
  if (state.winnerId != null) {
    const progress = targetProgressOf(state, state.winnerId);
    if (progress < effectiveTargetOf(state, state.winnerId) || progress < winBarOf(state, state.winnerId) || hasPendingProofCredit(state, state.winnerId)) {
      state = { ...state, winnerId: null, wonAt: null };
    }
  }
  if (state.status !== "live" || state.winnerId != null) return state;
  const eligible = state.players
    .map((p) => ({ id: p.id, at: state.progress[p.id]?.completedAt }))
    .filter((r) => r.at != null)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const row of eligible) {
    const progress = targetProgressOf(state, row.id);
    if (progress >= effectiveTargetOf(state, row.id) && progress >= winBarOf(state, row.id) && !hasPendingProofCredit(state, row.id)) {
      return { ...state, winnerId: row.id, wonAt: row.at };
    }
  }
  return state;
}

/** Rivalries settle at the close: whoever logged more today banks the bonus
 *  (bonusRuf — counts toward the target only under stealCanTriggerWin).
 *  A tie — or both at zero — pays nobody. */
function resolveRivalries(state, at) {
  if (!state.rivalries?.length) return state;
  let out = state;
  const rivalries = state.rivalries.map((r) => {
    const pa = targetProgressOf(out, r.a);
    const pb = targetProgressOf(out, r.b);
    if (pa === pb || (pa === 0 && pb === 0)) return { ...r, winnerId: null };
    const winnerId = pa > pb ? r.a : r.b;
    out = addBonusRuf(out, winnerId, r.bonusRuf ?? RIVALRY_BONUS_RUF);
    out = { ...out, powerLog: [...out.powerLog, { kind: "rivalry", playerId: r.a, at, detail: { rivalId: r.b, winnerId, bonusRuf: r.bonusRuf ?? RIVALRY_BONUS_RUF } }] };
    return { ...r, winnerId, settledAt: at };
  });
  return { ...out, rivalries };
}

/** Group review: everyone except the target votes accept/contest. Settles on
 *  a majority of either kind, or when all others have voted (a tie accepts —
 *  benefit of the doubt, never shame). Contested logs score 0, but a
 *  completion already banked STANDS (the day banks; only the reps burn). */
export function voteProof(day, proofId, voterId, vote) {
  const fail = (reason) => ({ state: day, result: { ok: false, proofId, voterId, reason } });
  const proof = day.proofs?.find((p) => p.id === proofId);
  if (!proof) return fail("no such proof");
  if (proof.status !== "review") return fail(`proof is ${proof.status} — nothing to vote on`);
  if (!day.players.some((p) => p.id === voterId)) return fail(`voter ${voterId} not in battle`);
  if (voterId === proof.targetId) return fail("the target doesn't vote on their own proof");
  if (proof.votes[voterId]) return fail(`${voterId} already voted`);
  if (vote !== "accept" && vote !== "contest") return fail("vote must be accept or contest");

  const votes = { ...proof.votes, [voterId]: vote };
  const eligible = day.players.filter((p) => p.id !== proof.targetId).map((p) => p.id);
  const accepts = Object.values(votes).filter((v) => v === "accept").length;
  const contests = Object.values(votes).filter((v) => v === "contest").length;
  const allVoted = eligible.every((id) => votes[id]);

  let outcome = null;
  if (contests > eligible.length / 2) outcome = "contested";
  else if (accepts > eligible.length / 2) outcome = "accepted";
  else if (allVoted) outcome = contests > accepts ? "contested" : "accepted";

  let state = { ...day, proofs: day.proofs.map((p) => (p === proof ? { ...p, votes } : p)) };
  if (outcome) {
    const res = applyProofSettlement(state, { ...proof, votes }, outcome, Date.now());
    return { state: res, result: { ok: true, proofId, voterId, vote, settled: true, outcome } };
  }
  return { state, result: { ok: true, proofId, voterId, vote, settled: false, accepts, contests, awaiting: eligible.length - accepts - contests } };
}

/** Apply a settlement to a proof: contested → the bound entry scores 0 (the
 *  original value is kept for the record); accepted → it stands. */
function applyProofSettlement(state, proof, outcome, at) {
  const entry = state.entries[proof.entryIndex];
  let out = state;
  let contestedDroppedBelow = false;
  if (outcome === "contested" && entry) {
    const burn = entry.ruf;
    const p = out.progress[proof.targetId];
    const nextRuf = roundRuf(Math.max(0, p.ruf - burn));
    const nextProgress = roundRuf(nextRuf + p.creditRuf + (out.config.flags?.stealCanTriggerWin === true ? p.bonusRuf : 0));
    const dropsBelow = nextProgress < effectiveTargetOf(out, proof.targetId);
    contestedDroppedBelow = dropsBelow;
    const nextPlayerProgress = { ...p, ruf: nextRuf };
    if (dropsBelow) delete nextPlayerProgress.completedAt;
    out = {
      ...out,
      entries: out.entries.map((e, i) => (i === proof.entryIndex ? { ...e, ruf: 0, origRuf: burn, proofZeroed: proof.id } : e)),
      progress: { ...out.progress, [proof.targetId]: nextPlayerProgress },
    };
  }
  out = {
    ...out,
    proofs: out.proofs.map((p) => (p.id === proof.id ? { ...p, status: outcome, settledAt: at } : p)),
    powerLog: [...out.powerLog, { kind: "spot_check", playerId: proof.fromId, at, detail: { targetId: proof.targetId, outcome, entryRuf: entry ? (outcome === "contested" ? (entry.origRuf ?? entry.ruf) : entry.ruf) : 0 } }],
  };
  if (outcome === "accepted") out = maybeCompleteAndWin(out, proof.targetId, entry?.at ?? at).state;
  if (outcome === "contested") {
    out = out.status === "live"
      ? recomputeLiveWinner(out)
      : (contestedDroppedBelow && out.winnerId === proof.targetId ? {
          ...out,
          winnerId: null,
          wonAt: null,
          outcomes: out.outcomes ? {
            ...out.outcomes,
            [proof.targetId]: { outcome: "failed", completed: false, streakPreserved: false },
          } : out.outcomes,
          proofCorrection: { kind: "win_revoked", proofId: proof.id, playerId: proof.targetId, at },
        } : out);
  }
  return out;
}

/** Force-settle open proofs at the day close. Reviews settle on their votes
 *  (no votes → accepted, benefit of the doubt); un-triggered requests expire. */
function settleProofs(state, at) {
  if (!state.proofs?.length) return state;
  let out = state;
  for (const proof of out.proofs) {
    if (proof.status === "review") {
      const accepts = Object.values(proof.votes ?? {}).filter((v) => v === "accept").length;
      const contests = Object.values(proof.votes ?? {}).filter((v) => v === "contest").length;
      const outcome = contests > accepts ? "contested" : "accepted";
      out = applyProofSettlement(out, proof, outcome, at);
    } else if (proof.status === "awaiting_log") {
      out = { ...out, proofs: out.proofs.map((p) => (p.id === proof.id ? { ...p, status: "expired", settledAt: at } : p)) };
    }
  }
  return out;
}

/** Training Partners: both bank the day → both earn the bonus (+ a recorded
 *  partnership stat for the app layer — deliberately NOT a season point:
 *  season points are 1:1 Daily Wins per the SOT; open question noted). */
function resolvePartnerships(state, at) {
  if (!state.partnerships?.length) return state;
  let out = state;
  const partnerships = state.partnerships.map((p) => {
    const aDone = out.progress[p.a]?.completedAt != null;
    const bDone = out.progress[p.b]?.completedAt != null;
    if (aDone && bDone) {
      const each = p.bonusRuf ?? PARTNERSHIP_BONUS_RUF;
      out = addBonusRuf(out, p.a, each);
      out = addBonusRuf(out, p.b, each);
      out = { ...out, powerLog: [...out.powerLog, { kind: "training_partners", playerId: p.a, at, detail: { partnerId: p.b, bothBanked: true, bonusRufEach: each } }] };
      return { ...p, fulfilled: true, settledAt: at };
    }
    return { ...p, fulfilled: false, settledAt: at };
  });
  return { ...out, partnerships };
}

/** Pack Bond: every bonded member whose REAL logs total ≥ the threshold
 *  banks +10% of that total as bonus. */
function resolvePackBond(state, at) {
  const bond = state.packBond;
  if (!bond) return state;
  let out = state;
  const paid = {};
  for (const id of bond.memberIds) {
    const logged = state.entries
      .filter((e) => e.playerId === id && e.reps > 0 && !e.proofZeroed)
      .reduce((s, e) => s + e.ruf, 0);
    if (roundRuf(logged) >= (bond.thresholdRuf ?? PACK_BOND_THRESHOLD_RUF)) {
      const bonus = roundRuf(logged * (bond.share ?? PACK_BOND_SHARE));
      out = addBonusRuf(out, id, bonus);
      paid[id] = bonus;
    }
  }
  out = { ...out, packBond: { ...bond, paid, settledAt: at } };
  if (Object.keys(paid).length) {
    out = { ...out, powerLog: [...out.powerLog, { kind: "pack_bond", playerId: bond.by, at, detail: { paid } }] };
  }
  return out;
}

export function doubleDownFinishers(day) {  return Object.entries(day.doubleDowns)
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
