/* ═══════════════════════════════════════════════════════════════════════
   RWF ENGINE — faithful browser-JS port of packages/game-core (the spec).
   Buildless ES module; the TS source is the reference implementation and
   apps/figma-app/engine.test.js proves parity by running BOTH side by side.

   Ported surface (per the mission): tier multipliers, match lifecycle
   (create/start/log/close), comeback, closure bonus, standings with
   adjusted scores, charity pot, basic seasons.
   NOT ported: nemesis.ts, photo-finish.ts, baseline.ts (v2 features the
   figma-app loop doesn't exercise — they live in game-core + apps/web).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── handicap scoring (spec: game-core/src/handicap.ts) ─────────────────
   Thesis: effort and consistency compete, not raw fitness.
   v1: tier multiplier — a "couch" player's reps are worth more than an
   "athlete"'s. v2 blend: measured %HRR vs personal baseline. */

export const TIER_MULTIPLIERS = {
  couch: 1.5,
  casual: 1.25,
  fit: 1.0,
  athlete: 0.85,
};

export const COMEBACK_MULTIPLIER = 1.2; // (spec: comeback.ts — declared early, used below)
const HRR_WEIGHT = 0.7; // weight of live HR evidence vs declared tier (v2 blend)

/* ── power-up constants (FLOW-05 · figma-app only — NOT in game-core) ───
   Ben's four launch power-ups. Rarity is cosmetic in v1 (chips + drop odds
   only — no mechanical effect). Durations/amounts live here so tests and
   the UI agree on one source of truth. */
export const LIGHTNING_MS = 10 * 60 * 1000; // lightning window: 10 minutes
export const LIGHTNING_MULTIPLIER = 3; // ×3 rep value while the window is open
export const STEAL_SHARE = 0.1; // steal takes 10% of the leading rival's raw reps
export const FREEZE_MS = 30 * 60 * 1000; // time freeze: +30 min to the deadline
export const DAY_MS = 24 * 60 * 60 * 1000; // default battle deadline horizon (end of play day stand-in)
export const POWER_UPS = {
  lightning: { kind: "lightning", name: "Lightning Round", rarity: "legendary", icon: "bolt", blurb: "Reps count ×3 for 10 minutes · one activation per match" },
  steal: { kind: "steal", name: "Rep Steal", rarity: "epic", icon: "bolt", blurb: "Take 10% of the leading rival's reps, instantly" },
  shield: { kind: "shield", name: "Shield", rarity: "common", icon: "shield", blurb: "Blocks one rep steal against you, then breaks" },
  freeze: { kind: "freeze", name: "Time Freeze", rarity: "rare", icon: "clock", blurb: "Extends the battle deadline by 30 minutes" },
};
/** Loot odds by rarity (common 50 / rare 30 / epic 15 / legendary 5). */
export const DROP_ODDS = { common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 };

export function tierMultiplier(player) {
  return TIER_MULTIPLIERS[player.tier];
}

/** Effort multiplier for a single entry: v1 tier only; v2 blend when the
 *  entry carries avgHrrPct AND the player has a baseline. */
export function effortMultiplier(player, entry) {
  const tier = tierMultiplier(player);
  if (entry.avgHrrPct == null || player.baselineHrrPct == null) return tier;
  const hrrRatio = entry.avgHrrPct / player.baselineHrrPct;
  return HRR_WEIGHT * hrrRatio + (1 - HRR_WEIGHT) * tier;
}

/** Adjusted (handicapped) value of one logged entry. */
export function scoreEntry(player, entry) {
  let base = entry.reps * effortMultiplier(player, entry);
  if (entry.comeback) base *= COMEBACK_MULTIPLIER;
  if (entry.lightning) base *= LIGHTNING_MULTIPLIER; // FLOW-05: tagged at log time while the window is open
  return base;
}

/** Total adjusted score across all of a player's entries. */
export function playerScore(player, entries) {
  return entries
    .filter((e) => e.playerId === player.id)
    .reduce((sum, e) => sum + scoreEntry(player, e), 0);
}

/** Raw rep total (drives match closure at targetReps). */
export function playerRawReps(playerId, entries) {
  return entries
    .filter((e) => e.playerId === playerId)
    .reduce((sum, e) => sum + e.reps, 0);
}

/* ── match engine, 300 format (spec: game-core/src/match.ts) ────────────
   A group agrees on exercises; any reps, any order, any mix; the match
   closes when someone's RAW total hits the target (default 300). WINNER =
   highest HANDICAPPED score at closure. */

export function createMatch(config, players, now = Date.now()) {
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("duplicate player ids");
  return {
    config, players, entries: [], status: "open",
    /* FLOW-05: battle deadline + per-player power-up state. `deadlineAt`
       (ms epoch) defaults to end-of-play-day (callers can inject via
       config.deadlineAt — state.js passes the 9PM AEST play-day end).
       The temporal/battle-clock module CONSUMES deadlineAt; freeze extends
       it. Power-ups are figma-app-only — deliberately not in game-core. */
    deadlineAt: config.deadlineAt ?? now + DAY_MS,
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    shields: {},        // playerId → true while a shield is armed
    lightning: {},      // playerId → ms-epoch until which logs score ×3
    lightningUsed: {},  // playerId → true once activated (cap: 1/match)
    powerLog: [],       // activation audit trail (kind, playerId, at, effect)
  };
}

export function startMatch(state, at = Date.now()) {
  if (state.status !== "open") throw new Error("match already started");
  return { ...state, status: "live", startedAt: at };
}

/** logReps → { state, closedMatch }. Pure: input state is not mutated. */
export function logReps(state, entry) {
  if (state.status !== "live") throw new Error("match is not live");
  if (!state.players.some((p) => p.id === entry.playerId))
    throw new Error(`player ${entry.playerId} not in match`);
  if (!state.config.exercises.some((e) => e.id === entry.exerciseId))
    throw new Error(`exercise ${entry.exerciseId} not in match set`);
  if (!Number.isInteger(entry.reps) || entry.reps <= 0)
    throw new Error("reps must be a positive integer");

  const entries = [...state.entries, entry];
  const raw = playerRawReps(entry.playerId, entries);
  const target = state.config.targetReps;

  if (raw >= target) {
    return {
      state: {
        ...state,
        entries,
        status: "complete",
        completedAt: entry.at,
        closedBy: entry.playerId,
      },
      closedMatch: true,
    };
  }
  return { state: { ...state, entries }, closedMatch: false };
}

export function standings(state) {
  const target = state.config.targetReps;
  return state.players
    .map((player) => {
      const mine = state.entries.filter((e) => e.playerId === player.id);
      const raw = playerRawReps(player.id, state.entries);
      const verified = mine.filter((e) => e.verified).reduce((s, e) => s + e.reps, 0);
      return {
        player,
        rawReps: raw,
        adjustedScore: Math.round(playerScore(player, state.entries) * 10) / 10,
        progressPct: Math.min(100, Math.round((raw / target) * 1000) / 10),
        verifiedPct: raw === 0 ? 0 : Math.round((verified / raw) * 100),
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/** The closer (first to raw target) gets a small closure bonus. */
export const CLOSURE_BONUS = 15;

/** Definitive finishing order: standings + closure bonus, re-ranked. */
export function finalStandings(state) {
  const rows = standings(state);
  if (state.status !== "complete") return rows;
  return rows
    .map((r) => ({
      ...r,
      adjustedScore:
        r.player.id === state.closedBy ? r.adjustedScore + CLOSURE_BONUS : r.adjustedScore,
    }))
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/** Winner = highest ADJUSTED score at closure (bonus applied, then ranked). */
export function winner(state) {
  if (state.status !== "complete") return null;
  const top = finalStandings(state)[0];
  if (!top) return null;
  return {
    playerId: top.player.id,
    adjustedScore: top.adjustedScore,
    closedMatch: top.player.id === state.closedBy,
  };
}

/* ── comeback multiplier (spec: game-core/src/comeback.ts) ──────────────
   A player >30% behind the raw leader gets a one-time ×1.2 boost on their
   next entry. Mechanically enforces "everyone has a genuine shot". */

export const COMEBACK_THRESHOLD = 0.3; // >30% behind leader

export function comebackUsed(state, playerId) {
  return state.entries.some((e) => e.playerId === playerId && e.comeback);
}

export function comebackEligible(state, playerId) {
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
export function applyComeback(state, entry) {
  return comebackEligible(state, entry.playerId)
    ? { ...entry, comeback: true }
    : entry;
}

/* ── power-ups (FLOW-05 · figma-app only — not in game-core) ────────────
   LIGHTNING ×3 for a 10-min window · STEAL 10% of the leading rival's
   raw reps · SHIELD blocks one steal · FREEZE +30 min on the deadline.
   All functions are PURE: they return a new match state + a result card
   and never mutate the input (mirrors the logReps { state, … } shape).

   House rules (the honest small print):
   · Activating spends the card — except a BLOCKED steal, which never
     fires (the shield eats the hit, the thief keeps the card).
   · Lightning is one ACTIVATION per player per match, even after the
     window expires. It stacks with a comeback entry (×1.2 ×3).
   · Steal entries are ledger transfers: raw ± for both players; the
     handicap multiplier applies to them like any other entry, so raw
     AND adjusted both move.
   · Rarity is cosmetic in v1 (drop odds + chip colour only). */

/** Cards a player currently holds. Tolerates pre-FLOW-05 saved matches. */
export function inventoryOf(match, playerId) {
  return match.inventory?.[playerId] ?? [];
}

/** True while the player's lightning window is open at `at` (exclusive end). */
export function lightningActive(match, playerId, at = Date.now()) {
  return (match.lightning?.[playerId] ?? 0) > at;
}

/** Seconds left in the player's lightning window (0 when none/expired). */
export function lightningRemainingMs(match, playerId, at = Date.now()) {
  return Math.max(0, (match.lightning?.[playerId] ?? 0) - at);
}

/** Tags an entry ×3 if the player's lightning window covers entry.at.
 *  Mirrors applyComeback — state.js chains both on every log. */
export function applyLightning(match, entry) {
  return lightningActive(match, entry.playerId, entry.at)
    ? { ...entry, lightning: true }
    : entry;
}

/** The CURRENT leading rival (highest raw reps, excluding the player
 *  themself). Ties break to player order — the same rival the steal
 *  preview and the steal itself agree on. */
export function leadingRival(match, playerId) {
  let victim = null, best = -1;
  for (const p of match.players) {
    if (p.id === playerId) continue;
    const raw = playerRawReps(p.id, match.entries);
    if (raw > best) { best = raw; victim = p; }
  }
  return victim ? { player: victim, rawReps: best } : null;
}

/** What a steal would take from the leading rival right now: floor(10%),
 *  minimum 1 while the rival is above zero, 0 at zero. */
export function stealPreview(match, playerId) {
  const rival = leadingRival(match, playerId);
  if (!rival) return null;
  const amount = rival.rawReps > 0 ? Math.max(1, Math.floor(rival.rawReps * STEAL_SHARE)) : 0;
  return { victim: rival.player, victimRaw: rival.rawReps, amount, blocked: !!(match.shields?.[rival.player.id]) };
}

/** Grant a card to a player's match inventory. Rarity defaults to the
 *  kind's canonical rarity; grant time is injectable for tests. */
export function grantPowerUp(match, playerId, kind, { at = Date.now(), rarity } = {}) {
  const def = POWER_UPS[kind];
  if (!def) throw new Error(`unknown power-up ${kind}`);
  if (!match.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in match`);
  const inv = [...inventoryOf(match, playerId), { kind, rarity: rarity ?? def.rarity, grantedAt: at }];
  return { ...match, inventory: { ...(match.inventory ?? {}), [playerId]: inv } };
}

/** Daily-drop style pick with injectable rng: legendary 5% / epic 15% /
 *  rare 30% / common 50%. */
export function randomPowerUpKind(rng = Math.random) {
  const r = rng();
  if (r < DROP_ODDS.legendary) return "lightning";
  if (r < DROP_ODDS.legendary + DROP_ODDS.epic) return "steal";
  if (r < DROP_ODDS.legendary + DROP_ODDS.epic + DROP_ODDS.rare) return "freeze";
  return "shield";
}

/** Activate a held power-up. Returns { state, result } — `result` is the
 *  result card ({ ok, kind, name, rarity, playerId, …effect } or
 *  { ok:false, reason }). `at` and the lightning window length are
 *  injectable for tests. */
export function activatePowerUp(match, playerId, kind, { at = Date.now(), lightningMs = LIGHTNING_MS } = {}) {
  const def = POWER_UPS[kind];
  const fail = (reason) => ({ state: match, result: { ok: false, kind, playerId, reason } });
  if (!def) return fail(`unknown power-up ${kind}`);
  if (match.status !== "live") return fail("match is not live");
  if (!match.players.some((p) => p.id === playerId)) return fail(`player ${playerId} not in match`);

  const held = inventoryOf(match, playerId);
  const idx = held.findIndex((i) => i.kind === kind);
  const spend = () => ({
    ...(match.inventory ?? {}),
    [playerId]: held.filter((_, i) => i !== idx),
  });
  const log = (entry) => [...(match.powerLog ?? []), { ...entry, at }];
  const card = (extra) => ({ ok: true, kind, name: def.name, rarity: def.rarity, playerId, ...extra });

  if (kind === "lightning") {
    if (idx < 0) return fail("no lightning card held");
    if (match.lightningUsed?.[playerId]) return fail("lightning already used this match (one per match)");
    const until = at + lightningMs;
    return {
      state: {
        ...match,
        lightning: { ...(match.lightning ?? {}), [playerId]: until },
        lightningUsed: { ...(match.lightningUsed ?? {}), [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, until, multiplier: LIGHTNING_MULTIPLIER }),
      },
      result: card({ until, multiplier: LIGHTNING_MULTIPLIER, ms: lightningMs }),
    };
  }

  if (kind === "shield") {
    if (idx < 0) return fail("no shield card held");
    if (match.shields?.[playerId]) return fail("shield already armed");
    return {
      state: {
        ...match,
        shields: { ...(match.shields ?? {}), [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, armed: true }),
      },
      result: card({ armed: true }),
    };
  }

  if (kind === "freeze") {
    if (idx < 0) return fail("no freeze card held");
    const deadlineAt = (match.deadlineAt ?? at) + FREEZE_MS;
    return {
      state: {
        ...match,
        deadlineAt,
        inventory: spend(),
        powerLog: log({ kind, playerId, extendedByMs: FREEZE_MS, deadlineAt }),
      },
      result: card({ newDeadline: deadlineAt, extendedByMs: FREEZE_MS }),
    };
  }

  /* steal — target the CURRENT leading rival by raw reps */
  if (idx < 0) return fail("no steal card held");
  const rival = leadingRival(match, playerId);
  if (!rival) return fail("no rivals to steal from");

  if (match.shields?.[rival.player.id]) {
    /* The shield eats the hit and BREAKS. The steal never fires, so the
       thief keeps the card — shield buys you the block, not a free kill. */
    const shields = { ...(match.shields ?? {}) };
    delete shields[rival.player.id];
    return {
      state: {
        ...match,
        shields,
        powerLog: log({ kind, playerId, victimId: rival.player.id, blocked: true, stolen: 0 }),
      },
      result: card({ blocked: true, victimId: rival.player.id, stolen: 0, reason: "blocked by shield" }),
    };
  }

  const amount = rival.rawReps > 0 ? Math.max(1, Math.floor(rival.rawReps * STEAL_SHARE)) : 0;
  const entries = amount > 0
    ? [
        ...match.entries,
        { playerId: rival.player.id, exerciseId: "steal", reps: -amount, at, verified: false, steal: true },
        { playerId, exerciseId: "steal", reps: amount, at, verified: false, steal: true },
      ]
    : match.entries;
  return {
    state: {
      ...match,
      entries,
      inventory: spend(),
      powerLog: log({ kind, playerId, victimId: rival.player.id, stolen: amount }),
    },
    result: card({ victimId: rival.player.id, stolen: amount, victimRaw: rival.rawReps - amount }),
  };
}

/* ── charity pot ledger (spec: game-core/src/pot.ts) ────────────────────
   Winner directs the pot to a charity from the championed set. No cash to
   winner = sidesteps betting/raffle classification. */

export function createPot(id, matchId) {
  return { id, matchId, contributions: [] };
}

export function contribute(pot, playerId, amountCents) {
  if (amountCents <= 0) throw new Error("contribution must be positive");
  return {
    ...pot,
    contributions: [...pot.contributions, { playerId, amountCents }],
  };
}

export function potTotalCents(pot) {
  return pot.contributions.reduce((s, c) => s + c.amountCents, 0);
}

export function designate(pot, charity) {
  return { ...pot, designatedCharityId: charity.id };
}

/* ── seasons (spec: game-core/src/season.ts) ────────────────────────────
   4-week series, points 3/2/1 + MVP, champion, A/B divisions, charity
   streak-forgiveness. The figma-app uses create/record/ladder/end. */

export const FORGIVE_MIN_CENTS = 200; // $2 minimum charity top-up

export function createSeason(config, players) {
  const ids = players.map((p) => p.id);
  return {
    config: { weeks: 4, ...config },
    players,
    week: 1,
    points: Object.fromEntries(ids.map((id) => [id, 0])),
    results: [],
    divisions: { A: ids, B: [] },
    streaks: Object.fromEntries(
      ids.map((id) => [id, { length: 0, lastWeekPlayed: null }])
    ),
    forgivenessUsed: {},
  };
}

/** Points: 1st=3, 2nd=2, 3rd=1; MVP +1. Streak: played this week → +1. */
export function recordMatch(s, r) {
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

export function seasonLadder(s) {
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

/** Charity top-up preserves a streak that would otherwise break. Once/season. */
export function forgiveStreak(s, playerId, charityCents) {
  if (charityCents < FORGIVE_MIN_CENTS)
    throw new Error(`forgiveness needs at least $${FORGIVE_MIN_CENTS / 100} to the pot`);
  if (s.forgivenessUsed[playerId] != null)
    throw new Error("streak forgiveness already used this season");
  const st = s.streaks[playerId];
  if (!st) throw new Error("player not in season");
  return {
    ...s,
    forgivenessUsed: { ...s.forgivenessUsed, [playerId]: charityCents },
  };
}

/** Crown champion (top points) + relegate/promote between divisions. */
export function endSeason(s) {
  if (s.results.length === 0) throw new Error("no matches recorded");
  const ladder = seasonLadder(s);
  const champion = ladder[0].playerId;

  let divisions = s.divisions;
  if (s.divisions.B.length > 0) {
    const pts = (id) => ladder.find((r) => r.playerId === id)?.points ?? 0;
    const aSorted = [...s.divisions.A].sort((x, y) => pts(y) - pts(x));
    const bSorted = [...s.divisions.B].sort((x, y) => pts(y) - pts(x));
    const relegated = aSorted[aSorted.length - 1];
    const promoted = bSorted[0];
    divisions = {
      A: [...aSorted.slice(0, -1), promoted],
      B: [...bSorted.slice(1), relegated],
    };
  }
  return { ...s, champion, divisions };
}
