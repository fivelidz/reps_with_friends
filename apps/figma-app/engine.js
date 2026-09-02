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

/* ── POWER-UP SYSTEM v2 — the bigger range (FLOW-05b) ──────────────────
   Founder spec: "powerups selected from a set of three and distributed to
   players in a nice way. They can reroll the cards perhaps by adding
   points to the pot or reps. It should favour those coming last as a
   catch up. Power up cards can expire over time."

   14 kinds — the 4 launch cards plus 10 new, every new one designed with
   counter-play and/or catch-up lean. CARD TABLE (source of truth):

   ┌──────────────────┬───────────┬─────────────────────────────────────────────┬──────────┬──────────────────────────────────────────┐
   │ kind             │ rarity    │ effect                                       │ expiry   │ counters / counter-play                   │
   ├──────────────────┼───────────┼─────────────────────────────────────────────┼──────────┼──────────────────────────────────────────┤
   │ lightning        │ legendary │ reps ×3 for 10 min, one activation/match    │ 24h      │ race them; it caps at one per match       │
   │ steal            │ epic      │ take 10% of the leading rival's raw reps    │ 24h      │ SHIELD (block+break), ANCHOR (block)      │
   │ shield           │ common    │ block one steal, then breaks                │ 24h      │ steal spends the shield                   │
   │ freeze           │ rare      │ battle deadline +30 min                     │ 24h      │ ANCHOR (an armed rival vetoes the freeze) │
   │ second_wind      │ rare      │ comeback boost ×1.2 → ×1.5 for 15 min       │ 12h      │ keys off the once-per-match comeback      │
   │ anchor           │ rare      │ 24h wall: no steals FROM you, vetoes rival  │ 24h      │ wait out the 24h; anchor blocks nothing   │
   │                  │           │ freezes, blocks handicap-swap targeting you │          │ you do — log past it                     │
   │ sprint           │ common    │ your next 3 logs score ×2                   │ 6h       │ steal their reps mid-sprint; anchor is    │
   │                  │           │                                             │          │ no help against it                        │
   │ rabbits_foot     │ epic      │ next draft is guaranteed Rare+              │ 24h      │ consumed by the draft it boosts           │
   │ sandbag_detector │ common    │ leading rival's next 3 logs go PUBLIC       │ 24h      │ log honestly; it only reveals             │
   │ handicap_swap    │ epic      │ swap tier multipliers with the leading      │ 24h      │ ANCHOR on the target blocks it; expires   │
   │                  │           │ rival for 1 day (auto-reverts)              │          │ and reverts after 1 day                   │
   │ pit_crew         │ common    │ your next 0-rep day keeps your streak       │ 24h      │ consumed by the day it saves              │
   │ photo_finish     │ rare      │ +25 points if you WIN by a <5% margin       │ 24h      │ must be HELD at match close (passive)     │
   │ double_down      │ epic      │ next log ×3 — activation pays 50 pts to     │ 12h      │ the points cost (kitty grows)             │
   │                  │           │ the kitty                                   │          │                                          │
   │ wildcard         │ legendary │ copy the last card played AGAINST you       │ 12h      │ play nothing at them → dead card          │
   └──────────────────┴───────────┴─────────────────────────────────────────────┴──────────┴──────────────────────────────────────────┘

   Passive cards (pit_crew, photo_finish, rabbits_foot) have no USE
   button — they fire from held state. The rest activate. */
export const POWER_UPS = {
  lightning: { kind: "lightning", name: "Lightning Round", rarity: "legendary", icon: "bolt", blurb: "Reps count ×3 for 10 minutes · one activation per match", expiryMs: DAY_MS },
  steal: { kind: "steal", name: "Rep Steal", rarity: "epic", icon: "bolt", blurb: "Take 10% of the leading rival's reps, instantly", expiryMs: DAY_MS },
  shield: { kind: "shield", name: "Shield", rarity: "common", icon: "shield", blurb: "Blocks one rep steal against you, then breaks", expiryMs: DAY_MS },
  freeze: { kind: "freeze", name: "Time Freeze", rarity: "rare", icon: "clock", blurb: "Extends the battle deadline by 30 minutes", expiryMs: DAY_MS },
  second_wind: { kind: "second_wind", name: "Second Wind", rarity: "rare", icon: "flame", blurb: "Comeback boost ×1.2 → ×1.5 for 15 minutes", expiryMs: 12 * 60 * 60 * 1000 },
  anchor: { kind: "anchor", name: "Anchor", rarity: "rare", icon: "lock", blurb: "24h wall — no steals from you, vetoes rival freezes, blocks swap targeting you", expiryMs: DAY_MS },
  sprint: { kind: "sprint", name: "Sprint", rarity: "common", icon: "bolt", blurb: "Your next 3 logs score ×2", expiryMs: 6 * 60 * 60 * 1000 },
  rabbits_foot: { kind: "rabbits_foot", name: "Rabbit's Foot", rarity: "epic", icon: "chest", blurb: "Your next draft is guaranteed Rare or better", expiryMs: DAY_MS },
  sandbag_detector: { kind: "sandbag_detector", name: "Sandbag Detector", rarity: "common", icon: "search", blurb: "The leading rival's next 3 logs go public", expiryMs: DAY_MS },
  handicap_swap: { kind: "handicap_swap", name: "Handicap Swap", rarity: "epic", icon: "share", blurb: "Swap tier multipliers with the leading rival for 1 day", expiryMs: DAY_MS },
  pit_crew: { kind: "pit_crew", name: "Pit Crew", rarity: "common", icon: "settings", blurb: "Your next 0-rep day keeps your streak", expiryMs: DAY_MS },
  photo_finish: { kind: "photo_finish", name: "Photo Finish", rarity: "rare", icon: "camera", blurb: "+25 points if you win the match by a <5% margin", expiryMs: DAY_MS },
  double_down: { kind: "double_down", name: "Double Down", rarity: "epic", icon: "crown", blurb: "Next log ×3 — activation pays 50 points to the kitty", expiryMs: 12 * 60 * 60 * 1000 },
  wildcard: { kind: "wildcard", name: "Wildcard", rarity: "legendary", icon: "plus", blurb: "Copy the last power-up card played against you", expiryMs: 12 * 60 * 60 * 1000 },
};
/** Loot odds by rarity (common 50 / rare 30 / epic 15 / legendary 5). */
export const DROP_ODDS = { common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 };

/* v2 card tuning — one home so tests + UI agree. */
export const SECOND_WIND_MS = 15 * 60 * 1000; // second wind window: 15 minutes
export const SECOND_WIND_MULTIPLIER = 1.5; // comeback ×1.2 → ×1.5 while the window is open
export const SPRINT_LOGS = 3; // sprint charges: next 3 logs
export const SPRINT_MULTIPLIER = 2; // ×2 per sprint-tagged log
export const DOUBLE_DOWN_MULTIPLIER = 3; // ×3 on the next log after activation
export const DOUBLE_DOWN_POINTS = 50; // activation fee → straight into the kitty
export const SANDBAG_LOGS = 3; // detector reveals the leader's next 3 logs
export const HANDICAP_SWAP_MS = 24 * 60 * 60 * 1000; // tier swap reverts after 1 day
export const ANCHOR_MS = 24 * 60 * 60 * 1000; // the anchor wall lasts a day
export const PHOTO_FINISH_MARGIN = 0.05; // win by less than 5% → payout
export const PHOTO_FINISH_POINTS = 25; // the payout (points, not money — v1 trial currency)

/* ── POINTS — the v1 currency (TRIAL-FIRST: NO MONEY) ──────────────────
   Points stand in for money while the power-up economy is trialled: they
   pay rerolls and bonuses today and become purchasable once the system is
   proven. Deliberately NOT wired to any payment rail in this build. */

export const STARTING_POINTS = 500; // every identity starts with 500

/** A player's point balance (pre-migration identities read as 500). */
export function pointsOf(player) {
  return Number.isFinite(player?.points) ? player.points : STARTING_POINTS;
}

/** The reason-tagged ledger: [{ delta, reason, at, balance }, …]. */
export function pointsLedger(player) {
  return player?.pointsLedger ?? [];
}

/** Credit points with a reason tag. Pure — returns a NEW player. */
export function addPoints(player, amount, reason, at = Date.now()) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("points amount must be positive");
  const balance = pointsOf(player) + amount;
  return {
    ...player,
    points: balance,
    pointsLedger: [...pointsLedger(player), { delta: amount, reason, at, balance }],
  };
}

/** Debit points with a reason tag. Throws on insufficient balance (the
 *  caller pre-checks for graceful refusals). Pure — returns a NEW player. */
export function removePoints(player, amount, reason, at = Date.now()) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("points amount must be positive");
  const bal = pointsOf(player);
  if (bal < amount) throw new Error(`insufficient points: need ${amount}, have ${bal}`);
  const balance = bal - amount;
  return {
    ...player,
    points: balance,
    pointsLedger: [...pointsLedger(player), { delta: -amount, reason, at, balance }],
  };
}

/** Reroll prices escalate 50 → 100 → 200 per player per match (then hold
 *  at 200). Every reroll dollar goes TO THE KITTY — rerolling grows the
 *  pot for everyone, win or lose.
 *  TODO(v2 economy): reps-cost reroll option — pay N raw reps into the
 *  pot instead of points (lets point-poor players stay in the reroll
 *  game). Tracked for the economy pass, not in this build. */
export const REROLL_COSTS = [50, 100, 200];

/** The kitty: match-scoped point pot fed by rerolls + double-downs. Grows
 *  the prize at stake; settles to the match winner (state layer decides). */
export function kittyTotal(match) {
  return match?.kitty?.points ?? 0;
}

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
  if (entry.comeback) base *= entry.secondWind ? SECOND_WIND_MULTIPLIER : COMEBACK_MULTIPLIER; // FLOW-05b: second wind upgrades the comeback
  if (entry.lightning) base *= LIGHTNING_MULTIPLIER; // FLOW-05: tagged at log time while the window is open
  if (entry.sprint) base *= SPRINT_MULTIPLIER; // FLOW-05b: sprint charge on this log
  if (entry.doubleDown) base *= DOUBLE_DOWN_MULTIPLIER; // FLOW-05b: one doubled log
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
  /* FLOW-05b DUAL DEADLINE: config.deadline = { reps, time } — EITHER
     fires. `reps` is the raw-rep target (aliases targetReps); `time` is a
     HARD match end (ms epoch): when it passes the match freezes and the
     winner is decided by adjusted standings (closeIfPastDeadline). Matches
     WITHOUT deadline.time keep the day-roll convention (deadlineAt = next
     play-day end, rolled by the daily layer at each day close). */
  const cfg = config.deadline?.reps != null
    ? { ...config, targetReps: config.deadline.reps }
    : config;
  return {
    config: cfg, players, entries: [], status: "open",
    /* FLOW-05: battle deadline + per-player power-up state. `deadlineAt`
       (ms epoch) defaults to end-of-play-day (callers can inject via
       config.deadlineAt — state.js passes the 9PM AEST play-day end).
       The temporal/battle-clock module CONSUMES deadlineAt; freeze extends
       it. Power-ups are figma-app-only — deliberately not in game-core. */
    deadlineAt: cfg.deadline?.time ?? cfg.deadlineAt ?? now + DAY_MS,
    deadlineMode: cfg.deadline?.time != null ? "hard" : "day",
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    shields: {},        // playerId → true while a shield is armed
    lightning: {},      // playerId → ms-epoch until which logs score ×3
    lightningUsed: {},  // playerId → true once activated (cap: 1/match)
    powerLog: [],       // activation audit trail (kind, playerId, at, effect)
    /* FLOW-05b (v2) — draft economy, points kitty, new card state. All
       read via ?? so pre-v2 saved matches keep working. */
    kitty: { points: 0, ledger: [] }, // reroll + double-down payments (points)
    drafts: {},         // playerId → { options:[kind], openedAt, rerolls, luck }
    rerollCount: {},    // playerId → rerolls this match (escalating cost)
    lucky: {},          // playerId → true while a rabbit's foot is armed
    anchors: {},        // playerId → ms-epoch until which the anchor holds
    secondWind: {},     // playerId → ms-epoch until which comeback logs ×1.5
    sprints: {},        // playerId → { remaining } ×2 log charges
    doubleDowns: {},    // playerId → true (next log ×3)
    detectors: [],      // { ownerId, victimId, remaining } sandbag reveals
    tierSwaps: [],      // { aId, bId, aTier, bTier, until } — reverts on expiry
    pitCrews: {},       // playerId → true while armed (consumed on a 0-rep day)
    lastAgainst: {},    // playerId → last card kind played AGAINST them
  };
}

/** DUAL DEADLINE, time side: a live match whose deadline has passed
 *  freezes — status complete, winner decided by adjusted standings via
 *  winner()/finalStandings() (no closure bonus: nobody closed). Returns
 *  { state, closedMatch } like logReps. The reps side closes inside
 *  logReps as before — either deadline firing ends the match. */
export function closeIfPastDeadline(state, at = Date.now()) {
  if (state.status !== "live") return { state, closedMatch: false };
  const dl = Number(state.deadlineAt);
  if (!Number.isFinite(dl) || at < dl) return { state, closedMatch: false };
  return {
    state: {
      ...state,
      status: "complete",
      completedAt: dl,
      closedBy: null,
      closedReason: "time", // vs the implicit "reps" closure in logReps
    },
    closedMatch: true,
  };
}

export function startMatch(state, at = Date.now()) {
  if (state.status !== "open") throw new Error("match already started");
  return { ...state, status: "live", startedAt: at };
}

/** logReps → { state, closedMatch }. Pure: input state is not mutated. */
/** v2 log-time card effects — tags the entry and spends the charges in
 *  the returned state. Pure. No-op on pre-v2 matches (all reads ??-safe):
 *  sprint charges ×2, the one-shot double-down ×3, and sandbag-detector
 *  reveals (entry flagged `revealed: true` → the UI makes it public).
 *  Steal ledger transfers never consume card charges. */
function tagAndSpendLogCards(state, entry) {
  const p = entry.playerId;
  let tagged = entry;
  const sprintLeft = state.sprints?.[p]?.remaining ?? 0;
  const hasDouble = !!state.doubleDowns?.[p];
  const detector = (state.detectors ?? []).find((d) => d.victimId === p && d.remaining > 0);
  if (!entry.steal) {
    if (sprintLeft > 0 || hasDouble) tagged = { ...tagged, ...(sprintLeft > 0 ? { sprint: true } : {}), ...(hasDouble ? { doubleDown: true } : {}) };
  }
  if (detector && !entry.steal) tagged = { ...tagged, revealed: true };

  let out = { ...state };
  if (entry.steal) return { state: out, entry: tagged }; // transfers bypass charges
  if (sprintLeft > 0) out = { ...out, sprints: { ...(out.sprints ?? {}), [p]: { remaining: sprintLeft - 1 } } };
  if (hasDouble) { const dd = { ...(out.doubleDowns ?? {}) }; delete dd[p]; out = { ...out, doubleDowns: dd }; }
  if (detector) {
    const detectors = (out.detectors ?? []).map((d) => d === detector ? { ...d, remaining: d.remaining - 1 } : d);
    out = { ...out, detectors };
  }
  return { state: out, entry: tagged };
}

export function logReps(state, entry) {
  if (state.status !== "live") throw new Error("match is not live");
  if (!state.players.some((p) => p.id === entry.playerId))
    throw new Error(`player ${entry.playerId} not in match`);
  if (!state.config.exercises.some((e) => e.id === entry.exerciseId))
    throw new Error(`exercise ${entry.exerciseId} not in match set`);
  if (!Number.isInteger(entry.reps) || entry.reps <= 0)
    throw new Error("reps must be a positive integer");

  const { state: spent, entry: tagged } = tagAndSpendLogCards(state, entry);
  const entries = [...spent.entries, tagged];
  const raw = playerRawReps(tagged.playerId, entries);
  const target = spent.config.targetReps;

  if (raw >= target) {
    return {
      state: {
        ...spent,
        entries,
        status: "complete",
        completedAt: tagged.at,
        closedBy: tagged.playerId,
      },
      closedMatch: true,
    };
  }
  return { state: { ...spent, entries }, closedMatch: false };
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

/** True while the player's second-wind window is open at `at`. */
export function secondWindActive(match, playerId, at = Date.now()) {
  return (match.secondWind?.[playerId] ?? 0) > at;
}

/** Returns the entry tagged with comeback if eligible (once per player/match).
 *  FLOW-05b: a live second-wind window upgrades the tag (×1.5 not ×1.2). */
export function applyComeback(state, entry) {
  if (!comebackEligible(state, entry.playerId)) return entry;
  return secondWindActive(state, entry.playerId, entry.at)
    ? { ...entry, comeback: true, secondWind: true }
    : { ...entry, comeback: true };
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

/** True while the player's anchor wall holds at `at` (24h from arming). */
export function anchorActive(match, playerId, at = Date.now()) {
  return (match.anchors?.[playerId] ?? 0) > at;
}

/** What a steal would take from the leading rival right now: floor(10%),
 *  minimum 1 while the rival is above zero, 0 at zero. Blocked by an
 *  armed SHIELD (breaks on the hit) or a holding ANCHOR (outlasts it). */
export function stealPreview(match, playerId, at = Date.now()) {
  const rival = leadingRival(match, playerId);
  if (!rival) return null;
  const amount = rival.rawReps > 0 ? Math.max(1, Math.floor(rival.rawReps * STEAL_SHARE)) : 0;
  const blocked = !!(match.shields?.[rival.player.id]) || anchorActive(match, rival.player.id, at);
  const via = match.shields?.[rival.player.id] ? "shield" : anchorActive(match, rival.player.id, at) ? "anchor" : null;
  return { victim: rival.player, victimRaw: rival.rawReps, amount, blocked, blockedBy: via };
}

/** Grant a card to a player's match inventory. Rarity defaults to the
 *  kind's canonical rarity; `expiresAt` defaults to grant time + the
 *  kind's expiry (v2 cards expire — pass Infinity to grant unexpiring,
 *  which is what pre-v2 saved inventories effectively hold). */
export function grantPowerUp(match, playerId, kind, { at = Date.now(), rarity, expiresAt } = {}) {
  const def = POWER_UPS[kind];
  if (!def) throw new Error(`unknown power-up ${kind}`);
  if (!match.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in match`);
  const exp = Number.isFinite(expiresAt) ? expiresAt : at + (def.expiryMs ?? DAY_MS);
  const inv = [...inventoryOf(match, playerId), { kind, rarity: rarity ?? def.rarity, grantedAt: at, expiresAt: exp }];
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
  /** record `kind` as the last card played AGAINST `victimId` (wildcard fuel) */
  const against = (m, victimId, k) => ({ ...(m.lastAgainst ?? {}), [victimId]: k });

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

  if (kind === "second_wind") {
    if (idx < 0) return fail("no second_wind card held");
    if ((match.secondWind?.[playerId] ?? 0) > at) return fail("second wind already live");
    const until = at + SECOND_WIND_MS;
    return {
      state: {
        ...match,
        secondWind: { ...(match.secondWind ?? {}), [playerId]: until },
        inventory: spend(),
        powerLog: log({ kind, playerId, until, multiplier: SECOND_WIND_MULTIPLIER }),
      },
      result: card({ until, multiplier: SECOND_WIND_MULTIPLIER, ms: SECOND_WIND_MS }),
    };
  }

  if (kind === "anchor") {
    if (idx < 0) return fail("no anchor card held");
    if (anchorActive(match, playerId, at)) return fail("anchor already holds");
    const until = at + ANCHOR_MS;
    return {
      state: {
        ...match,
        anchors: { ...(match.anchors ?? {}), [playerId]: until },
        inventory: spend(),
        powerLog: log({ kind, playerId, until }),
      },
      result: card({ until, ms: ANCHOR_MS }),
    };
  }

  if (kind === "sprint") {
    if (idx < 0) return fail("no sprint card held");
    if ((match.sprints?.[playerId]?.remaining ?? 0) > 0) return fail("sprint already running");
    return {
      state: {
        ...match,
        sprints: { ...(match.sprints ?? {}), [playerId]: { remaining: SPRINT_LOGS } },
        inventory: spend(),
        powerLog: log({ kind, playerId, logs: SPRINT_LOGS, multiplier: SPRINT_MULTIPLIER }),
      },
      result: card({ logs: SPRINT_LOGS, multiplier: SPRINT_MULTIPLIER }),
    };
  }

  if (kind === "rabbits_foot") {
    if (idx < 0) return fail("no rabbits_foot card held");
    if (match.lucky?.[playerId]) return fail("luck already armed");
    return {
      state: {
        ...match,
        lucky: { ...(match.lucky ?? {}), [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, armed: true }),
      },
      result: card({ armed: true }),
    };
  }

  if (kind === "sandbag_detector") {
    if (idx < 0) return fail("no sandbag_detector card held");
    const rival = leadingRival(match, playerId);
    if (!rival) return fail("no rivals to watch");
    return {
      state: {
        ...match,
        detectors: [...(match.detectors ?? []), { ownerId: playerId, victimId: rival.player.id, remaining: SANDBAG_LOGS }],
        inventory: spend(),
        lastAgainst: against(match, rival.player.id, "sandbag_detector"),
        powerLog: log({ kind, playerId, victimId: rival.player.id, logs: SANDBAG_LOGS }),
      },
      result: card({ victimId: rival.player.id, logs: SANDBAG_LOGS }),
    };
  }

  if (kind === "handicap_swap") {
    if (idx < 0) return fail("no handicap_swap card held");
    const rival = leadingRival(match, playerId);
    if (!rival) return fail("no rivals to swap with");
    if (anchorActive(match, rival.player.id, at))
      return fail(`${rival.player.id} is anchored — the swap bounces`);
    const busy = (t) => t.until > at && [playerId, rival.player.id].includes(t.aId) || t.until > at && [playerId, rival.player.id].includes(t.bId);
    if ((match.tierSwaps ?? []).some(busy)) return fail("a swap involving these players is already active");
    const me = match.players.find((p) => p.id === playerId);
    const aTier = me.tier, bTier = rival.player.tier;
    const until = at + HANDICAP_SWAP_MS;
    const players = match.players.map((p) =>
      p.id === playerId ? { ...p, tier: bTier } : p.id === rival.player.id ? { ...p, tier: aTier } : p
    );
    return {
      state: {
        ...match,
        players,
        tierSwaps: [...(match.tierSwaps ?? []), { aId: playerId, bId: rival.player.id, aTier, bTier, until }],
        inventory: spend(),
        lastAgainst: against(match, rival.player.id, "handicap_swap"),
        powerLog: log({ kind, playerId, withId: rival.player.id, swap: [aTier, bTier], until }),
      },
      result: card({ withId: rival.player.id, yourNewTier: bTier, theirNewTier: aTier, until }),
    };
  }

  if (kind === "pit_crew") {
    if (idx < 0) return fail("no pit_crew card held");
    if (match.pitCrews?.[playerId]) return fail("pit crew already armed");
    return {
      state: {
        ...match,
        pitCrews: { ...(match.pitCrews ?? {}), [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, armed: true }),
      },
      result: card({ armed: true }),
    };
  }

  if (kind === "double_down") {
    if (idx < 0) return fail("no double_down card held");
    if (match.doubleDowns?.[playerId]) return fail("double down already live");
    const me = match.players.find((p) => p.id === playerId);
    const bal = pointsOf(me);
    if (bal < DOUBLE_DOWN_POINTS) return fail(`needs ${DOUBLE_DOWN_POINTS} points for the kitty (you have ${bal})`);
    const paid = removePoints(me, DOUBLE_DOWN_POINTS, "double_down", at);
    const players = match.players.map((p) => (p.id === playerId ? paid : p));
    const kitty = {
      points: (match.kitty?.points ?? 0) + DOUBLE_DOWN_POINTS,
      ledger: [...(match.kitty?.ledger ?? []), { playerId, amount: DOUBLE_DOWN_POINTS, reason: "double_down", at }],
    };
    return {
      state: {
        ...match,
        players,
        kitty,
        doubleDowns: { ...(match.doubleDowns ?? {}), [playerId]: true },
        inventory: spend(),
        powerLog: log({ kind, playerId, multiplier: DOUBLE_DOWN_MULTIPLIER, paid: DOUBLE_DOWN_POINTS }),
      },
      result: card({ multiplier: DOUBLE_DOWN_MULTIPLIER, paid: DOUBLE_DOWN_POINTS, balance: paid.points }),
    };
  }

  if (kind === "wildcard") {
    if (idx < 0) return fail("no wildcard card held");
    const copied = match.lastAgainst?.[playerId];
    if (!copied || !POWER_UPS[copied]) return fail("nothing has been played against you yet");
    const granted = grantPowerUp({ ...match, inventory: spend() }, playerId, copied, { at });
    return {
      state: { ...granted, powerLog: log({ kind, playerId, copied }) },
      result: card({ copied, copiedName: POWER_UPS[copied].name }),
    };
  }

  if (kind === "freeze") {
    if (idx < 0) return fail("no freeze card held");
    /* ANCHOR counter-play: an armed rival's anchor vetoes the extension.
       The freeze card is RETAINED (same honest rule as a shielded steal) —
       wait out the anchor, then re-freeze. */
    const vetoer = match.players.find((p) => p.id !== playerId && anchorActive(match, p.id, at));
    if (vetoer) {
      return {
        state: { ...match, powerLog: log({ kind, playerId, vetoedBy: vetoer.id, blocked: true }) },
        result: card({ blocked: true, vetoedBy: vetoer.id, reason: "blocked by anchor" }),
      };
    }
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
        lastAgainst: against(match, rival.player.id, "steal"),
        powerLog: log({ kind, playerId, victimId: rival.player.id, blocked: true, stolen: 0 }),
      },
      result: card({ blocked: true, victimId: rival.player.id, stolen: 0, reason: "blocked by shield" }),
    };
  }

  if (anchorActive(match, rival.player.id, at)) {
    /* ANCHOR: the 24h wall holds — no transfer, no break. The thief keeps
       the card (the counter to an anchor is patience, not brute force). */
    return {
      state: {
        ...match,
        lastAgainst: against(match, rival.player.id, "steal"),
        powerLog: log({ kind, playerId, victimId: rival.player.id, blocked: true, stolen: 0, by: "anchor" }),
      },
      result: card({ blocked: true, victimId: rival.player.id, stolen: 0, by: "anchor", reason: "blocked by anchor" }),
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
      lastAgainst: against(match, rival.player.id, "steal"),
      powerLog: log({ kind, playerId, victimId: rival.player.id, stolen: amount }),
    },
    result: card({ victimId: rival.player.id, stolen: amount, victimRaw: rival.rawReps - amount }),
  };
}

/* ── DRAFT-FROM-3 (FLOW-05b) — power-ups are now CHOSEN, not just dropped
   ─────────────────────────────────────────────────────────────────────
   Founder spec: "powerups selected from a set of three and distributed to
   players in a nice way… It should favour those coming last as a catch
   up." Drafts open at MATCH START and at each DAY CLOSE (state.js wires
   both). Each draft offers 3 face-up candidates; rarity odds come from a
   CATCH-UP CURVE — the further behind you are by raw reps, the better
   your rarity odds. Rerolls cost points which go TO THE KITTY. */

/** How far behind is playerId, as a 0–1 fraction of the raw leader?
 *  0 = leading (or tied), 1 = max(raw − mine)/raw. 0 until anyone logs. */
export function catchUpBehind(state, playerId) {
  const raws = state.players.map((p) => playerRawReps(p.id, state.entries));
  const leader = Math.max(...raws, 0);
  if (leader <= 0) return 0;
  const mine = playerRawReps(playerId, state.entries);
  return Math.min(1, Math.max(0, (leader - mine) / leader));
}

/** Base draft odds = the loot odds (common 50 / rare 30 / epic 15 / leg 5). */
export const BASE_DRAFT_ODDS = { ...DROP_ODDS };

/** THE CATCH-UP CURVE (default, injectable):
 *      behind 0.0 → odds = base            (50/30/15/5)
 *      behind 1.0 → odds = 10/50/27/13     (common 50→10, the mass moves up)
 *  Linear in between: `shift = behind × 0.4` splits as rare +shift/2,
 *  epic +0.3×shift, legendary +0.2×shift, common −shift. A player 50%
 *  behind drafts ~26% epic vs the leader's 15%. Swap the whole curve via
 *  draftOptions({ curve }) — tests inject a flat curve for determinism. */
export const CATCH_UP_MAX_SHIFT = 0.4;
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

/** Rabbit's-foot odds: luck guarantees Rare+, split 45/35/20. */
export const LUCKY_DRAFT_ODDS = { common: 0, rare: 0.45, epic: 0.35, legendary: 0.2 };

/** Sample a card kind from an odds table (injectable rng). Rarity bands
 *  walk best-first (legendary → common), then a kind of that rarity. */
export function randomKindByOdds(odds, rng = Math.random) {
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
  const kinds = Object.values(POWER_UPS).filter((d) => d.rarity === rarity).map((d) => d.kind);
  if (!kinds.length) return "shield"; // degenerate odds table → safe default
  return kinds[Math.floor(rng() * kinds.length) % kinds.length];
}

/** Open a 3-card draft for one player. Rarity odds come from the catch-up
 *  curve (or LUCKY odds when a rabbit's foot is armed — the foot is
 *  consumed by the draft it boosts). The offered kinds are stored on the
 *  match (drafts[playerId]) until picked/rerolled/expired. Pure: returns
 *  { options, state }. Triggers (wired by state.js): match start + day close. */
export function draftOptions(match, playerId, { count = 3, at = Date.now(), rng = Math.random, curve = defaultCatchUpCurve } = {}) {
  if (!match.players.some((p) => p.id === playerId)) throw new Error(`player ${playerId} not in match`);
  if (match.status !== "live") throw new Error("match is not live");
  const lucky = !!match.lucky?.[playerId];
  const odds = lucky ? LUCKY_DRAFT_ODDS : curve(catchUpBehind(match, playerId));
  const options = [];
  let guard = 0;
  while (options.length < Math.min(count, Object.keys(POWER_UPS).length) && guard++ < 200) {
    const kind = randomKindByOdds(odds, rng);
    if (!options.includes(kind)) options.push(kind);
  }
  let state = {
    ...match,
    drafts: {
      ...(match.drafts ?? {}),
      [playerId]: { options, openedAt: at, rerolls: match.drafts?.[playerId]?.rerolls ?? 0, luck: lucky },
    },
  };
  if (lucky) {
    const luckyMap = { ...(match.lucky ?? {}) };
    delete luckyMap[playerId];
    state = { ...state, lucky: luckyMap };
  }
  return { options, state };
}

/** Pick one of the offered cards. Validates against the stored options,
 *  grants the card (with its per-kind expiry), clears the draft. */
export function draftPick(match, playerId, kind, { at = Date.now() } = {}) {
  const draft = match.drafts?.[playerId];
  const fail = (reason) => ({ state: match, result: { ok: false, kind, playerId, reason } });
  if (!draft) return fail("no draft pending");
  if (!draft.options.includes(kind)) return fail("card not offered in this draft");
  const def = POWER_UPS[kind];
  const expiresAt = at + (def.expiryMs ?? DAY_MS);
  let state = grantPowerUp(match, playerId, kind, { at });
  const drafts = { ...(state.drafts ?? {}) };
  delete drafts[playerId];
  state = {
    ...state,
    drafts,
    powerLog: [...(state.powerLog ?? []), { kind, playerId, at, event: "draft_pick", rarity: def.rarity, expiresAt }],
  };
  return { state, result: { ok: true, kind, name: def.name, rarity: def.rarity, playerId, expiresAt } };
}

/** Reroll price for a player right now (escalates per player per match:
 *  50 → 100 → 200, then holds at 200). */
export function rerollCostFor(match, playerId) {
  const n = match.rerollCount?.[playerId] ?? 0;
  return REROLL_COSTS[Math.min(n, REROLL_COSTS.length - 1)];
}

/** Reroll the pending draft: fresh 3 options, player pays the escalating
 *  cost POINTS → KITTY (the pot grows — rerolling is a donation to the
 *  prize pool). Refuses with a result card (no state change) when there
 *  is no pending draft or the balance is short. */
export function rerollDraft(match, playerId, { at = Date.now(), rng = Math.random, curve = defaultCatchUpCurve } = {}) {
  const fail = (reason) => ({ state: match, result: { ok: false, playerId, reason } });
  const draft = match.drafts?.[playerId];
  if (!draft) return fail("no draft pending");
  const cost = rerollCostFor(match, playerId);
  const me = match.players.find((p) => p.id === playerId);
  const balance = pointsOf(me);
  if (balance < cost) return fail(`reroll costs ${cost} points (you have ${balance})`);
  const paid = removePoints(me, cost, "reroll", at);
  const players = match.players.map((p) => (p.id === playerId ? paid : p));
  const re = draftOptions(
    { ...match, players },
    playerId,
    { count: draft.options.length, at, rng, curve }
  );
  const state = {
    ...re.state,
    rerollCount: { ...(match.rerollCount ?? {}), [playerId]: (match.rerollCount?.[playerId] ?? 0) + 1 },
    kitty: {
      points: (match.kitty?.points ?? 0) + cost,
      ledger: [...(match.kitty?.ledger ?? []), { playerId, amount: cost, reason: "reroll", at }],
    },
    powerLog: [...(re.state.powerLog ?? []), { playerId, at, event: "reroll", cost }],
  };
  return { state, result: { ok: true, cost, options: re.options, balance: paid.points, playerId } };
}

/* ── EXPIRY — cards rot ─────────────────────────────────────────────────
   Held cards carry expiresAt (default 24h from grant; some kinds shorter
   — see the card table). sweepExpired drops dead cards (powerLog audit),
   reverts expired tier swaps and releases stale pending drafts. Anchors
   and second-wind windows expire by their own timestamps. Cards granted
   pre-v2 have no expiresAt and never sweep (they predate the system). */
export const DRAFT_STALE_MS = 24 * 60 * 60 * 1000; // unpicked drafts vanish after a day

export function sweepExpired(match, at = Date.now()) {
  const expired = [];
  let state = match;

  /* 1. held cards */
  for (const p of match.players) {
    const inv = inventoryOf(match, p.id);
    const kept = inv.filter((c) => {
      const dead = Number.isFinite(c.expiresAt) && c.expiresAt <= at;
      if (dead) expired.push({ playerId: p.id, kind: c.kind, expiresAt: c.expiresAt });
      return !dead;
    });
    if (kept.length !== inv.length)
      state = { ...state, inventory: { ...(state.inventory ?? {}), [p.id]: kept } };
  }

  /* 2. tier swaps — revert both players' tiers from the recorded originals */
  const liveSwaps = [];
  for (const t of state.tierSwaps ?? []) {
    if (t.until > at) { liveSwaps.push(t); continue; }
    expired.push({ event: "tier_swap_reverted", aId: t.aId, bId: t.bId, until: t.until });
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === t.aId ? { ...p, tier: t.aTier } : p.id === t.bId ? { ...p, tier: t.bTier } : p
      ),
    };
  }
  if (liveSwaps.length !== (state.tierSwaps ?? []).length) state = { ...state, tierSwaps: liveSwaps };

  /* 3. stale pending drafts */
  const drafts = {};
  for (const [pid, d] of Object.entries(state.drafts ?? {})) {
    if (d.openedAt + DRAFT_STALE_MS > at) drafts[pid] = d;
    else expired.push({ event: "draft_expired", playerId: pid, options: d.options });
  }
  if (Object.keys(drafts).length !== Object.keys(state.drafts ?? {}).length)
    state = { ...state, drafts };

  if (expired.length)
    state = { ...state, powerLog: [...(state.powerLog ?? []), { event: "sweep", at, expired }] };
  return { state, expired };
}

/* ── passive-card settlements ─────────────────────────────────────────── */

/** PHOTO FINISH — passive held card. At match close, a holder who WON by
 *  a <5% adjusted margin banks +25 points (reason "photo_finish"; the
 *  card is consumed). Pure: returns { state, awarded, playerId } or
 *  { state, awarded: 0 } when nothing pays out. */
export function settlePhotoFinish(match, { at = Date.now() } = {}) {
  if (match.status !== "complete") return { state: match, awarded: 0 };
  const rows = finalStandings(match);
  if (rows.length < 2) return { state: match, awarded: 0 };
  const [first, second] = rows;
  if (first.adjustedScore <= 0) return { state: match, awarded: 0 };
  const margin = (first.adjustedScore - second.adjustedScore) / first.adjustedScore;
  if (margin >= PHOTO_FINISH_MARGIN) return { state: match, awarded: 0 };
  const winnerId = first.player.id;
  const inv = inventoryOf(match, winnerId);
  const idx = inv.findIndex((c) => c.kind === "photo_finish" && (!Number.isFinite(c.expiresAt) || c.expiresAt > at));
  if (idx < 0) return { state: match, awarded: 0 };
  const me = match.players.find((p) => p.id === winnerId);
  const paid = addPoints(me, PHOTO_FINISH_POINTS, "photo_finish", at);
  const state = {
    ...match,
    players: match.players.map((p) => (p.id === winnerId ? paid : p)),
    inventory: {
      ...(match.inventory ?? {}),
      [winnerId]: inv.filter((_, i) => i !== idx),
    },
    powerLog: [...(match.powerLog ?? []), { kind: "photo_finish", playerId: winnerId, at, awarded: PHOTO_FINISH_POINTS, margin: Math.round(margin * 1000) / 1000 }],
  };
  return { state, awarded: PHOTO_FINISH_POINTS, playerId: winnerId };
}

/** PIT CREW — armed passive. When a play day closes and a player logged
 *  NOTHING that day, an armed pit crew is consumed to keep their streak
 *  alive. Pure: returns { state, saved: [playerIds] }. The daily layer
 *  (daily.settleDay) calls this per day close and records `saved` on the
 *  day result. */
export function applyPitCrew(match, { loggedPlayerIds = [], at = Date.now() } = {}) {
  const saved = [];
  let state = match;
  for (const p of match.players) {
    if (!state.pitCrews?.[p.id]) continue;
    if (loggedPlayerIds.includes(p.id)) continue;
    saved.push(p.id);
    const pitCrews = { ...(state.pitCrews ?? {}) };
    delete pitCrews[p.id];
    state = {
      ...state,
      pitCrews,
      powerLog: [...(state.powerLog ?? []), { kind: "pit_crew", playerId: p.id, at, event: "streak_saved" }],
    };
  }
  return { state, saved };
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
