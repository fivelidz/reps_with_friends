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
  const base = entry.reps * effortMultiplier(player, entry);
  return entry.comeback ? base * COMEBACK_MULTIPLIER : base;
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

export function createMatch(config, players) {
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("duplicate player ids");
  return { config, players, entries: [], status: "open" };
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
