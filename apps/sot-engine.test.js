// apps/sot-engine.test.js — PARITY: the SOT app engine (apps/sot-engine.js)
// vs the reference implementation (packages/game-core/src/index.ts).
// Same scenarios run through BOTH; results must match. House style follows
// apps/figma-app/engine.test.js (the v1 parity harness).

import { describe, test, expect } from "bun:test";
import * as core from "../packages/game-core/src/index.ts";
import * as app from "./sot-engine.js";

const P = (id, tier = "fit") => ({ id, name: id, tier });
const T0 = 1_000_000;
const DAY_MS = 12 * 60 * 60 * 1000;

// Run one scripted day through an engine and return a digest of everything.
function scriptDay(engine, { flags, targetReps } = {}) {
  let d = engine.createDay(
    {
      id: "d1",
      playDays: [1],
      deadlineAt: T0 + DAY_MS,
      ...(targetReps != null ? { targetReps } : {}),
      ...(flags ? { flags } : {}),
    },
    [P("a"), P("b", "couch"), P("c")]
  );
  const events = [];
  const step = (fn, ...args) => {
    const out = fn(d, ...args);
    if (out.state) d = out.state;
    events.push(scrub(out.result ?? out));
    return out;
  };

  // a storms to the target with a lightning window; b grinds; c coasts
  step(engine.grantPowerUp, "a", "lightning");
  step(engine.activatePowerUp, "a", "lightning", { at: T0 + 1000 });
  step(engine.logSet, { playerId: "a", exerciseId: "pushup", reps: 40, at: T0 + 2000, verified: true }); // ×3 = 120
  step(engine.logSet, { playerId: "a", exerciseId: "squat", reps: 30, at: T0 + 3000, verified: true }); // ×3 = 90 → 210, wins
  // b: steal the leader, then bank late
  step(engine.grantPowerUp, "b", "steal");
  step(engine.activatePowerUp, "b", "steal", { at: T0 + 4000, targetId: "a" });
  step(engine.logSet, { playerId: "b", exerciseId: "pushup", reps: 134, at: T0 + 5000, verified: true }); // ×1.5 = 201, banks
  // freeze extends the deadline group-wide
  step(engine.grantPowerUp, "c", "freeze");
  step(engine.activatePowerUp, "c", "freeze", { at: T0 + 6000 });
  // bomb c; c defuses with 14 couch pushups (21 RUF ≥ 20)
  step(engine.grantPowerUp, "a", "surprise_bomb");
  step(engine.activatePowerUp, "a", "surprise_bomb", { at: T0 + 7000, targetId: "c" });
  step(engine.logSet, { playerId: "c", exerciseId: "pushup", reps: 14, at: T0 + 8000, verified: true });
  // shield arms, saves nobody needed yet
  step(engine.grantPowerUp, "c", "shield");
  step(engine.activatePowerUp, "c", "shield", { at: T0 + 9000 });

  const closed = engine.closeDay(d, T0 + DAY_MS + 30 * 60 * 1000);
  d = closed.state;

  return {
    events,
    winnerId: d.winnerId,
    wonAt: d.wonAt,
    deadline: engine.effectiveDeadline(d),
    progress: d.progress,
    bombs: d.bombs,
    shield: d.groupShield,
    outcomes: d.outcomes,
    shieldConsumed: closed.shieldConsumed,
    leaderboard: engine.dayLeaderboard(d).map((r) => [r.player.id, r.ruf, r.bonusRuf, r.progressPct, r.completed]),
    ddFinishers: engine.doubleDownFinishers(d),
  };
}

// strip nondeterministic ids/timestamps where they're engine-generated
function scrub(x) {
  if (x == null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = k === "id" || k === "until" || k === "deadline" ? "[dyn]" : scrub(v);
  return out;
}

function scriptSeason(engine) {
  let s = engine.createBattleSeason(
    { id: "s1", name: "Week 1", playDays: [1, 2, 3], targetReps: 200 },
    [P("a"), P("b"), P("c")]
  );
  s = engine.proposeStake(
    s,
    { type: "charity", declaration: "pot to winner's charity", charity: { perPlayerPoints: 100, platformFeeRate: 0.05 } },
    ["a", "b", "c"]
  );
  s = engine.agreeToStake(s, "a");
  s = engine.agreeToStake(s, "b");
  s = engine.agreeToStake(s, "c");
  s = engine.contributeToCharityStake(s, "a", 100);
  s = engine.contributeToCharityStake(s, "b", 150);
  s = engine.contributeToCharityStake(s, "c", 50);

  s = engine.recordBattleDay(s, { date: "2026-09-07", winnerIds: ["a"], completed: ["a", "b"], failed: ["c"] });
  s = engine.recordBattleDay(s, { date: "2026-09-08", winnerIds: ["a"], completed: ["a", "b", "c"], doubleDownFulfilled: ["a"] });
  s = engine.recordBattleDay(s, { date: "2026-09-09", winnerIds: ["b"], completed: ["b", "c"] });

  s = engine.endBattleSeason(s, 99_999);
  s = engine.resolveSeasonStake(s, 100_000);
  s = engine.designateCharity(s, "beyondblue", "a");
  s = engine.processCharityDonation(s, 100_001);

  return {
    points: s.points,
    streaks: s.streaks,
    standings: engine.battleStandings(s),
    champion: s.champion,
    tie: s.tie,
    stakeStatus: s.stake.status,
    resolution: s.stake.resolution,
    potTotal: engine.charityPotTotal(s.stake),
    charity: s.stake.charity,
    fulfilment: s.stake.fulfilment,
  };
}

function scriptTeams(engine) {
  const teams = [
    { id: "red", name: "Red", playerIds: ["a", "b"] },
    { id: "blue", name: "Blue", playerIds: ["c", "d", "e"] },
  ];
  let d = engine.createDay({ id: "d", playDays: [1], deadlineAt: T0 + DAY_MS }, ["a", "b", "c", "d", "e"].map((x) => P(x)));
  d = engine.logSet(d, { playerId: "a", exerciseId: "pushup", reps: 200, at: T0 + 10, verified: true }).state;
  d = engine.logSet(d, { playerId: "b", exerciseId: "pushup", reps: 200, at: T0 + 20, verified: true }).state;
  d = engine.logSet(d, { playerId: "c", exerciseId: "pushup", reps: 200, at: T0 + 30, verified: true }).state;
  d = engine.logSet(d, { playerId: "d", exerciseId: "pushup", reps: 200, at: T0 + 40, verified: true }).state;
  d = engine.logSet(d, { playerId: "e", exerciseId: "pushup", reps: 200, at: T0 + 50, verified: true }).state;

  let quotaErr = null;
  try { engine.teamScores(d, { teams, scoringRule: "quota" }); } catch (e) { quotaErr = e.message; }

  return {
    validation: engine.validateTeamMode({ teams, scoringRule: "average" }),
    scores: engine.teamScores(d, { teams, scoringRule: "average" }),
    pooledWin: engine.teamDailyWin(d, { teams, scoringRule: "pooled" }),
    averageWin: engine.teamDailyWin(d, { teams, scoringRule: "average" }),
    quotaErr,
  };
}

describe("sot-engine parity — daily battle + power-ups", () => {
  test("identical scripted day across TS core and JS port", () => {
    expect(scriptDay(app)).toEqual(scriptDay(core));
  });

  test("flags flip identically (steal counts toward target)", () => {
    expect(scriptDay(app, { flags: { stealCanTriggerWin: true } })).toEqual(
      scriptDay(core, { flags: { stealCanTriggerWin: true } })
    );
  });
});

describe("sot-engine parity — season + stakes", () => {
  test("identical scripted season across TS core and JS port", () => {
    expect(scriptSeason(app)).toEqual(scriptSeason(core));
  });
});

describe("sot-engine parity — teams", () => {
  test("identical team scaffold results across TS core and JS port", () => {
    expect(scriptTeams(app)).toEqual(scriptTeams(core));
  });
});

describe("sot-engine parity — constants & helpers", () => {
  test("same constants, same handicap math", () => {
    expect(app.DEFAULT_DAILY_TARGET_RUF).toBe(core.DEFAULT_DAILY_TARGET_RUF);
    expect(app.RUF_UNIT).toBe(core.RUF_UNIT);
    expect(app.PLAYER_FACING_UNIT).toBe(core.PLAYER_FACING_UNIT);
    expect(app.rufToDisplay(184.5)).toBe(core.rufToDisplay(184.5));
    expect(app.TIER_MULTIPLIERS).toEqual(core.TIER_MULTIPLIERS);
    expect(app.dailyTargetAdjusted(200, 1.5)).toBe(core.dailyTargetAdjusted(200, 1.5));
    expect(app.dailyTargetAdjusted(200, 0.85)).toBe(core.dailyTargetAdjusted(200, 0.85));
    expect(app.recalibrateMultiplier(P("x", "casual"))).toBe(core.recalibrateMultiplier(P("x", "casual")));
    expect(Object.keys(app.POWER_UP_CATALOG)).toEqual(Object.keys(core.POWER_UP_CATALOG));
    expect(app.isPlayDay({ playDays: [1, 3] }, new Date("2026-09-02T12:00:00")))
      .toBe(core.isPlayDay({ playDays: [1, 3] }, new Date("2026-09-02T12:00:00")));
  });
});
