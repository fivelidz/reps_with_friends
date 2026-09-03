// Engine v4 — DAILY BATTLE parity tests (SOT model).
// SOT: design/references/90e253a1…pdf §1.5, §3.1, flows 4.4/4.8.

import { describe, test, expect } from "bun:test";
import {
  DEFAULT_DAILY_TARGET_RUF,
  PLAYER_FACING_UNIT,
  RUF_UNIT,
  rufToDisplay,
  createDay,
  logSet,
  closeDay,
  dayLeaderboard,
  effectiveDeadline,
  effectiveTargetOf,
  targetProgressOf,
  baseTargetOf,
  isPlayDay,
  doubleDownFinishers,
  grantPowerUp,
  activatePowerUp,
  LIGHTNING_MS,
  FREEZE_MS,
  DOUBLE_DOWN_TARGET_MULTIPLIER,
} from "../src/index.ts";
import { dailyTargetAdjusted, recalibrateMultiplier } from "../src/index.ts";
import type { DailyBattleState, Player } from "../src/index.ts";

const P = (id: string, tier: Player["tier"] = "fit"): Player => ({ id, name: id, tier });

const T0 = 1_000_000; // arbitrary epoch-ms day start
const DAY_MS = 12 * 60 * 60 * 1000;

function day(players: Player[], opts: { targetReps?: number; flags?: any } = {}): DailyBattleState {
  return createDay(
    {
      id: "d1",
      playDays: [1],
      deadlineAt: T0 + DAY_MS,
      ...(opts.targetReps != null ? { targetReps: opts.targetReps } : {}),
      ...(opts.flags ? { flags: opts.flags } : {}),
    },
    players
  );
}

const log = (s: DailyBattleState, playerId: string, reps: number, at: number, exerciseId = "pushup") =>
  logSet(s, { playerId, exerciseId, reps, at, verified: true });

describe("v4 daily — config, RUF ruling, handicap-adjusted target", () => {
  test("default target is 200 RUF; internal unit RUF, player-facing 'reps'", () => {
    const d = day([P("a"), P("b")]);
    expect(DEFAULT_DAILY_TARGET_RUF).toBe(200);
    expect(baseTargetOf(d)).toBe(200);
    expect(RUF_UNIT).toBe("RUF");
    expect(PLAYER_FACING_UNIT).toBe("reps");
    expect(rufToDisplay(184)).toBe("184 reps");
  });

  test("dailyTargetAdjusted: same 200-RUF target, different physical targets per tier", () => {
    expect(dailyTargetAdjusted(200, 1)).toBe(200); // fit ×1.0
    expect(dailyTargetAdjusted(200, 1.5)).toBe(134); // couch ×1.5 → ceil(133.3)
    expect(dailyTargetAdjusted(200, 1.25)).toBe(160); // casual
    expect(dailyTargetAdjusted(200, 0.85)).toBe(236); // athlete
    expect(() => dailyTargetAdjusted(200, 0)).toThrow();
  });

  test("recalibration hook is a no-op returning the current multiplier (Q217-221 open)", () => {
    expect(recalibrateMultiplier(P("x", "casual"))).toBe(1.25);
    expect(recalibrateMultiplier(P("x", "athlete"), [])).toBe(0.85);
  });

  test("handicap changes rep VALUE: couch reaches 200 RUF in 134 physical reps, athlete doesn't in 200", () => {
    let d = day([P("couch", "couch"), P("athlete", "athlete")]);
    d = log(d, "couch", 134, T0 + 1000).state; // 134 × 1.5 = 201 RUF
    d = log(d, "athlete", 200, T0 + 2000).state; // 200 × 0.85 = 170 RUF
    expect(targetProgressOf(d, "couch")).toBeGreaterThanOrEqual(200);
    expect(targetProgressOf(d, "athlete")).toBeLessThan(200);
    expect(d.progress.couch.completedAt).toBeDefined();
    expect(d.progress.athlete.completedAt).toBeUndefined();
    expect(d.winnerId).toBe("couch");
  });

  test("isPlayDay honours the group's agreed days", () => {
    const cfg = { id: "d", playDays: [1, 3, 5], deadlineAt: T0 };
    expect(isPlayDay(cfg, new Date("2026-09-01T12:00:00"))).toBe(false); // Tuesday (2)
    expect(isPlayDay(cfg, new Date("2026-09-02T12:00:00"))).toBe(true); // Wednesday (3)
  });
});

describe("v4 daily — first to target wins, battle CONTINUES", () => {
  test("first eligible to 200 earns the Daily Win; later completers BANK the day", () => {
    let d = day([P("a"), P("b"), P("c")]);

    const a1 = log(d, "a", 150, T0 + 60_000);
    expect(a1.wonDay).toBe(false);
    expect(a1.completed).toBe(false);

    const a2 = log(a1.state, "a", 50, T0 + 61_000); // crosses 200 first
    expect(a2.wonDay).toBe(true);
    expect(a2.completed).toBe(true);
    expect(a2.state.winnerId).toBe("a");
    expect(a2.state.status).toBe("live"); // the battle does NOT end on the win

    // b finishes later — banks completion, no win
    const b1 = log(a2.state, "b", 120, T0 + 120_000);
    expect(b1.completed).toBe(false);
    const b2 = log(b1.state, "b", 80, T0 + 121_000);
    expect(b2.completed).toBe(true);
    expect(b2.wonDay).toBe(false);
    expect(b2.state.winnerId).toBe("a"); // still a's win

    const closed = closeDay(b2.state, T0 + DAY_MS);
    expect(closed.state.outcomes).toEqual({
      a: { outcome: "win", completed: true, streakPreserved: true },
      b: { outcome: "completed", completed: true, streakPreserved: true },
      c: { outcome: "failed", completed: false, streakPreserved: false },
    });
  });

  test("failed day at deadline: incomplete players record failure", () => {
    let d = day([P("a"), P("b")]);
    d = log(d, "a", 199, T0 + 1000).state; // agonisingly short
    const closed = closeDay(d, T0 + DAY_MS);
    expect(closed.outcomes.a.outcome).toBe("failed");
    expect(closed.outcomes.a.streakPreserved).toBe(false);
    expect(closed.outcomes.b.outcome).toBe("failed");
  });

  test("closeDay before the deadline throws; logging past it throws", () => {
    let d = day([P("a")]);
    expect(() => closeDay(d, T0 + DAY_MS - 1)).toThrow("deadline not reached");
    expect(() => log(d, "a", 10, T0 + DAY_MS + 1)).toThrow("past the battle deadline");
    d = log(d, "a", 10, T0 + 1000).state;
    expect(() => logSet(d, { playerId: "a", exerciseId: "pushup", reps: 0, at: T0 + 2000, verified: true })).toThrow();
    expect(() => log(d, "zzz", 10, T0 + 2000)).toThrow("not in battle");
    const closed = closeDay(d, T0 + DAY_MS);
    expect(() => log(closed.state, "a", 10, T0 + 3000)).toThrow("day is closed");
  });

  test("logging after completion is allowed (history) but never re-wins", () => {
    let d = day([P("a")]);
    d = log(d, "a", 200, T0 + 1000).state;
    const again = log(d, "a", 50, T0 + 2000);
    expect(again.completed).toBe(false);
    expect(again.wonDay).toBe(false);
    expect(targetProgressOf(again.state, "a")).toBe(250);
  });

  test("leaderboard ranks by earliest completion, then progress", () => {
    let d = day([P("a"), P("b"), P("c")]);
    d = log(d, "b", 200, T0 + 5000).state;
    d = log(d, "a", 200, T0 + 9000).state;
    d = log(d, "c", 40, T0 + 6000).state;
    const rows = dayLeaderboard(d);
    expect(rows.map((r) => r.player.id)).toEqual(["b", "a", "c"]);
    expect(rows[0].completedAt).toBe(T0 + 5000);
    expect(rows[2].progressPct).toBe(20);
  });
});

describe("v4 daily — Time Freeze extends the deadline (group-wide)", () => {
  test("+30 min, stacking limit default 1", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "freeze");
    const r = activatePowerUp(d, "a", "freeze", { at: T0 + 1000 });
    expect(r.result.ok).toBe(true);
    expect(effectiveDeadline(r.state)).toBe(T0 + DAY_MS + FREEZE_MS);
    // close at the old deadline: not reached anymore
    expect(() => closeDay(r.state, T0 + DAY_MS)).toThrow("deadline not reached");
    r.state = grantPowerUp(r.state, "b", "freeze");
    const second = activatePowerUp(r.state, "b", "freeze", { at: T0 + 2000 });
    expect(second.result.ok).toBe(false);
    expect(second.result.reason).toMatch(/stack limit/);
    // player can still log inside the extended window
    const late = log(second.state, "b", 200, T0 + DAY_MS + 5 * 60 * 1000);
    expect(late.completed).toBe(true);
    expect(late.wonDay).toBe(true);
    const closed = closeDay(late.state, T0 + DAY_MS + FREEZE_MS);
    expect(closed.state.outcomes.b.outcome).toBe("win");
  });

  test("stacking limit is configurable (flag)", () => {
    let d = day([P("a")], { flags: { freezeStackLimit: 2 } });
    d = grantPowerUp(d, "a", "freeze");
    d = activatePowerUp(d, "a", "freeze", { at: T0 + 1000 }).state;
    d = grantPowerUp(d, "a", "freeze");
    const r = activatePowerUp(d, "a", "freeze", { at: T0 + 2000 });
    expect(r.result.ok).toBe(true);
    expect(effectiveDeadline(r.state)).toBe(T0 + DAY_MS + 2 * FREEZE_MS);
  });
});

describe("v4 daily — Lightning Round (×3, 10 min, once per day)", () => {
  test("reps in the window count triple; one activation per day; expires", () => {
    let d = day([P("a")]);
    d = grantPowerUp(d, "a", "lightning");
    const act = activatePowerUp(d, "a", "lightning", { at: T0 + 1000 });
    expect(act.result.ok).toBe(true);
    const bolt = log(act.state, "a", 50, T0 + 2000); // inside window
    expect(bolt.ruf).toBe(150); // 50 × 1.0 × 3
    expect(bolt.state.entries[0].powerUps).toEqual(["lightning"]);
    const after = log(bolt.state, "a", 50, T0 + 1000 + LIGHTNING_MS + 1000); // window closed
    expect(after.ruf).toBe(50);
    // a second lightning (fresh card in hand) is still refused: one per day
    const held = grantPowerUp(after.state, "a", "lightning");
    const again = activatePowerUp(held, "a", "lightning", { at: T0 + 10_000 });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toMatch(/one per day/);
  });
});

describe("v4 daily — Double Down (2× target for 2× reward)", () => {
  test("volunteer banks the day at the base target; flag ON lifts only the win bar", () => {
    let d = day([P("a"), P("b")], { flags: { doubleDownAffectsDailyWin: true } });
    d = grantPowerUp(d, "a", "double_down");
    d = activatePowerUp(d, "a", "double_down", { at: T0 + 1000 }).state;
    expect(effectiveTargetOf(d, "a")).toBe(200); // completion bar unmoved
    expect(effectiveTargetOf(d, "b")).toBe(200);

    // a crosses the BASE target: the day banks, but the win bar is 400
    const a200 = log(d, "a", 200, T0 + 2000);
    expect(a200.completed).toBe(true);
    expect(a200.wonDay).toBe(false);
    expect(doubleDownFinishers(a200.state)).toEqual([]);

    // b cruises to 200 and takes the Daily Win off the volunteer
    const b200 = log(a200.state, "b", 200, T0 + 3000);
    expect(b200.wonDay).toBe(true);
    expect(b200.state.winnerId).toBe("b");

    // a grinds to 400 → genuine Double Down finisher (no win: b already won)
    const a400 = log(b200.state, "a", 200, T0 + 4000);
    expect(a400.completed).toBe(false); // already banked — no re-completion
    expect(doubleDownFinishers(a400.state)).toEqual(["a"]);
  });

  test("default: volunteers stay fully eligible at the base target (Q244 open, default off)", () => {
    let d = day([P("a")]);
    d = grantPowerUp(d, "a", "double_down");
    d = activatePowerUp(d, "a", "double_down", { at: T0 + 1000 }).state;
    const a200 = log(d, "a", 200, T0 + 2000);
    expect(a200.wonDay).toBe(true); // eligible at base target by default
    expect(doubleDownFinishers(a200.state)).toEqual([]); // but no 2× reward yet
    const a400 = log(a200.state, "a", 200, T0 + 3000);
    expect(doubleDownFinishers(a400.state)).toEqual(["a"]);
  });
});
