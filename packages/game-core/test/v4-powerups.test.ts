// Engine v4 — POWER-UP parity tests (SOT canon semantics).
// SOT §3.6 + flows 4.9-4.12; fixes per docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md.

import { describe, test, expect } from "bun:test";
import {
  createDay,
  logSet,
  closeDay,
  targetProgressOf,
  grantPowerUp,
  activatePowerUp,
  stealPreview,
  POWER_UP_CATALOG,
  STEAL_SHARE,
  SURPRISE_BOMB_RUF,
  SURPRISE_BOMB_BONUS_RUF,
  SURPRISE_BOMB_WINDOW_MS,
  RESCUE_ROPE_RUF,
  ASSIST_BONUS_RUF,
  ASSIST_WINDOW_MS,
} from "../src/index.ts";
import type { DailyBattleState, Player } from "../src/index.ts";

const P = (id: string, tier: Player["tier"] = "fit"): Player => ({ id, name: id, tier });
const T0 = 1_000_000;
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

describe("v4 power-ups — catalog", () => {
  test("four launch cards carry SOT canon blurbs; extras preserved as experimental", () => {
    expect(POWER_UP_CATALOG.lightning.tier).toBe("launch");
    expect(POWER_UP_CATALOG.steal.tier).toBe("launch");
    expect(POWER_UP_CATALOG.shield.tier).toBe("launch");
    expect(POWER_UP_CATALOG.freeze.tier).toBe("launch");
    expect(POWER_UP_CATALOG.surprise_bomb.tier).toBe("post-launch");
    expect(POWER_UP_CATALOG.rescue_rope.tier).toBe("post-launch");
    // our earlier extras live on, flagged
    for (const k of ["second_wind", "rabbits_foot", "pit_crew", "wildcard", "anchor", "sprint", "sandbag_detector", "handicap_swap", "photo_finish"]) {
      expect(POWER_UP_CATALOG[k].experimental).toBe(true);
    }
  });

  test("experimental cards refuse activation in the v4 engine (mechanics stay in app forks)", () => {
    let d = day([P("a")]);
    d = grantPowerUp(d, "a", "second_wind");
    const r = activatePowerUp(d, "a", "second_wind", { at: T0 + 1 });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toMatch(/experimental/);
  });

  test("activation needs the card held", () => {
    const d = day([P("a")]);
    const r = activatePowerUp(d, "a", "steal", { at: T0 + 1, targetId: "b" });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toMatch(/no steal card held/);
  });
});

describe("v4 power-ups — Rep Steal is a PURE GAIN (target keeps theirs)", () => {
  test("activator gains 10% of target's completed score; target's score is untouched", () => {
    let d = day([P("a"), P("b")]);
    d = log(d, "b", 100, T0 + 1000).state;
    d = grantPowerUp(d, "a", "steal");
    expect(stealPreview(d, "a", "b")).toBe(STEAL_SHARE * 100);

    const r = activatePowerUp(d, "a", "steal", { at: T0 + 2000, targetId: "b" });
    expect(r.result.ok).toBe(true);
    expect(r.result.gain).toBe(10);
    expect(r.result.targetKept).toBe(true);
    // b keeps their full score
    expect(targetProgressOf(r.state, "b")).toBe(100);
    expect(r.state.progress.b.ruf).toBe(100);
    // a's gain is detached bonus credit…
    expect(r.state.progress.a.bonusRuf).toBe(10);
    // …which does NOT count toward the target by default (Q237, default no)
    expect(targetProgressOf(r.state, "a")).toBe(0);
  });

  test("flag on: stolen credit counts toward the target", () => {
    let d = day([P("a"), P("b")], { flags: { stealCanTriggerWin: true } });
    d = log(d, "b", 100, T0 + 1000).state;
    d = grantPowerUp(d, "a", "steal");
    d = activatePowerUp(d, "a", "steal", { at: T0 + 2000, targetId: "b" }).state;
    expect(targetProgressOf(d, "a")).toBe(10);
    const a = log(d, "a", 190, T0 + 3000); // 190 ruf + 10 stolen = 200
    expect(a.completed).toBe(true);
    expect(a.wonDay).toBe(true);
  });

  test("guard rails: nothing to skim, self-target, one per day", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "steal");
    const empty = activatePowerUp(d, "a", "steal", { at: T0 + 1, targetId: "b" });
    expect(empty.result.ok).toBe(false);
    expect(empty.result.reason).toMatch(/no completed score/);
    const self = activatePowerUp(d, "a", "steal", { at: T0 + 1, targetId: "a" });
    expect(self.result.ok).toBe(false);
    d = log(d, "b", 50, T0 + 1000).state;
    d = activatePowerUp(d, "a", "steal", { at: T0 + 2000, targetId: "b" }).state;
    d = grantPowerUp(d, "a", "steal");
    const again = activatePowerUp(d, "a", "steal", { at: T0 + 3000, targetId: "b" });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toMatch(/limit/);
  });
});

describe("v4 power-ups — Group Shield protects streaks at day close", () => {
  test("armed shield converts failed days into shielded outcomes, consumed once", () => {
    let d = day([P("a"), P("b"), P("c")]);
    d = log(d, "a", 200, T0 + 1000).state; // a wins + completes
    d = grantPowerUp(d, "b", "shield");
    d = activatePowerUp(d, "b", "shield", { at: T0 + 2000 }).state;
    expect(d.groupShield?.armedBy).toBe("b");

    const closed = closeDay(d, T0 + DAY_MS);
    expect(closed.shieldConsumed).toBe(true);
    expect(closed.state.groupShield?.consumedKind).toBe("save");
    expect(closed.outcomes.b.outcome).toBe("shielded");
    expect(closed.outcomes.b.streakPreserved).toBe(true);
    expect(closed.outcomes.c.outcome).toBe("shielded"); // group-wide save
    expect(closed.outcomes.a.outcome).toBe("win");
  });

  test("no failures → shield stays armed; a second shield can't stack", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "shield");
    d = activatePowerUp(d, "a", "shield", { at: T0 + 1 }).state;
    d = grantPowerUp(d, "b", "shield");
    const r = activatePowerUp(d, "b", "shield", { at: T0 + 2 });
    expect(r.result.ok).toBe(false);
    d = log(d, "a", 200, T0 + 1000).state;
    d = log(d, "b", 200, T0 + 2000).state;
    const closed = closeDay(d, T0 + DAY_MS);
    expect(closed.shieldConsumed).toBe(false); // nobody needed it
    expect(closed.state.groupShield?.consumedAt).toBeUndefined();
  });

  test("Shield Bash cancels an armed shield (Pro/competitive)", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "shield");
    d = activatePowerUp(d, "a", "shield", { at: T0 + 1 }).state;
    d = grantPowerUp(d, "b", "shield_bash");
    const bash = activatePowerUp(d, "b", "shield_bash", { at: T0 + 2 });
    expect(bash.result.ok).toBe(true);
    // now a failure is NOT saved
    const closed = closeDay(bash.state, T0 + DAY_MS);
    expect(closed.shieldConsumed).toBe(false);
    expect(closed.outcomes.a.outcome).toBe("failed");
    expect(bash.state.groupShield?.consumedKind).toBe("bash");
  });
});

describe("v4 power-ups — Surprise Bomb (+20 reps / 10 min)", () => {
  test("HIT: target banks 20 RUF inside the window → defusal bonus as earned RUF", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "surprise_bomb");
    const bomb = activatePowerUp(d, "a", "surprise_bomb", { at: T0 + 1000, targetId: "b" });
    expect(bomb.result.ok).toBe(true);
    expect(bomb.result.reps).toBe(SURPRISE_BOMB_RUF);
    // b delivers the 20 inside 10 minutes
    const deliver = log(bomb.state, "b", 20, T0 + 2000);
    expect(deliver.state.bombs[0].resolved?.hit).toBe(true);
    expect(targetProgressOf(deliver.state, "b")).toBe(20 + SURPRISE_BOMB_BONUS_RUF);
    // the defusal bonus is earned RUF — it can complete the target
    let d2 = day([P("a"), P("b")], { targetReps: 40 });
    d2 = grantPowerUp(d2, "a", "surprise_bomb");
    d2 = activatePowerUp(d2, "a", "surprise_bomb", { at: T0 + 1000, targetId: "b" }).state;
    const finish = log(d2, "b", 20, T0 + 2000);
    expect(finish.completed).toBe(true);
    expect(finish.wonDay).toBe(true);
  });

  test("MISS: window lapses → nothing happens (no penalty, no bonus)", () => {
    let d = day([P("a"), P("b")]);
    d = grantPowerUp(d, "a", "surprise_bomb");
    d = activatePowerUp(d, "a", "surprise_bomb", { at: T0 + 1000, targetId: "b" }).state;
    d = log(d, "b", 5, T0 + 2000).state; // not enough, inside window
    // time passes beyond the bomb window but inside the day
    const closed = closeDay(d, T0 + DAY_MS);
    const bomb = closed.state.bombs[0];
    expect(bomb.resolved).toEqual({ at: T0 + DAY_MS, hit: false, bankedRuf: 5 });
    expect(targetProgressOf(closed.state, "b")).toBe(5); // nothing extra
    expect(closed.outcomes.b.outcome).toBe("failed");
  });

  test("bombing a finished player is refused", () => {
    let d = day([P("a"), P("b")]);
    d = log(d, "b", 200, T0 + 1000).state;
    d = grantPowerUp(d, "a", "surprise_bomb");
    const r = activatePowerUp(d, "a", "surprise_bomb", { at: T0 + 2000, targetId: "b" });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toMatch(/already finished/);
  });
});

describe("v4 power-ups — Rescue Rope (50-rep credit to an inactive teammate)", () => {
  test("instant credit to an idle mate; counts toward their target", () => {
    let d = day([P("a"), P("c")]);
    d = log(d, "a", 50, T0 + 1000).state; // a is active; c idle
    d = grantPowerUp(d, "a", "rescue_rope");
    const r = activatePowerUp(d, "a", "rescue_rope", { at: T0 + 2000, teammateId: "c" });
    expect(r.result.ok).toBe(true);
    expect(r.result.creditRuf).toBe(RESCUE_ROPE_RUF);
    expect(r.state.progress.c.creditRuf).toBe(50);
    expect(targetProgressOf(r.state, "c")).toBe(50); // credit counts
    // c now finishes from the rope + a short set — and takes the Daily Win
    // (a is only at 50; the first eligible player to target wins, rope or not)
    const c = log(r.state, "c", 150, T0 + 3000);
    expect(c.completed).toBe(true);
    expect(c.wonDay).toBe(true);
  });

  test("limited: one per giver per day; only reaches truly inactive mates", () => {
    let d = day([P("a"), P("b"), P("c")]);
    d = log(d, "b", 30, T0 + 1000).state; // b active
    d = grantPowerUp(d, "a", "rescue_rope");
    const active = activatePowerUp(d, "a", "rescue_rope", { at: T0 + 2000, teammateId: "b" });
    expect(active.result.ok).toBe(false);
    expect(active.result.reason).toMatch(/isn't inactive/);
    d = activatePowerUp(d, "a", "rescue_rope", { at: T0 + 2000, teammateId: "c" }).state;
    d = grantPowerUp(d, "a", "rescue_rope");
    const again = activatePowerUp(d, "a", "rescue_rope", { at: T0 + 3000, teammateId: "c" });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toMatch(/limit/);
  });
});

describe("v4 power-ups — Assist Boost (reward when the assisted mate finishes)", () => {
  test("both players earn the bonus when the mate completes inside the window", () => {
    let d = day([P("a"), P("b")]);
    d = log(d, "b", 100, T0 + 1000).state;
    d = grantPowerUp(d, "a", "assist_boost");
    const r = activatePowerUp(d, "a", "assist_boost", { at: T0 + 2000, teammateId: "b" });
    expect(r.result.ok).toBe(true);
    const finish = log(r.state, "b", 100, T0 + 3000); // b completes
    expect(finish.completed).toBe(true);
    expect(finish.bonusRuf).toBe(2 * ASSIST_BONUS_RUF); // reported: one each
    expect(finish.state.progress.a.bonusRuf).toBe(ASSIST_BONUS_RUF);
    expect(finish.state.progress.b.bonusRuf).toBe(ASSIST_BONUS_RUF);
    // assist bonuses are detached — they don't push b further toward anything
    expect(targetProgressOf(finish.state, "a")).toBe(0);
  });

  test("window lapse: completing later pays nobody", () => {
    let d = day([P("a"), P("b")]);
    d = log(d, "b", 100, T0 + 1000).state;
    d = grantPowerUp(d, "a", "assist_boost");
    d = activatePowerUp(d, "a", "assist_boost", { at: T0 + 2000, teammateId: "b" }).state;
    const finish = log(d, "b", 100, T0 + 2000 + ASSIST_WINDOW_MS + 1);
    expect(finish.completed).toBe(true);
    expect(finish.state.progress.a.bonusRuf).toBe(0);
  });
});

describe("v4 power-ups — Combo Boost (prescribed sequence)", () => {
  test("prescribed sequence pays the bonus as earned RUF; wrong order resets", () => {
    let d = createDay(
      {
        id: "d1",
        playDays: [1],
        deadlineAt: T0 + DAY_MS,
        combos: [{ id: "power3", sequence: ["pushup", "squat", "pushup"], bonusRuf: 30 }],
      },
      [P("a")]
    );
    d = grantPowerUp(d, "a", "combo_boost");
    d = activatePowerUp(d, "a", "combo_boost", { at: T0 + 1000 }).state;
    d = log(d, "a", 10, T0 + 2000, "pushup").state;
    d = log(d, "a", 10, T0 + 3000, "squat").state;
    // break the chain: wrong exercise resets progress
    d = log(d, "a", 10, T0 + 4000, "burpee").state;
    d = log(d, "a", 10, T0 + 5000, "pushup").state;
    d = log(d, "a", 10, T0 + 6000, "squat").state;
    const done = log(d, "a", 10, T0 + 7000, "pushup"); // sequence complete
    expect(done.bonusRuf).toBe(30);
    expect(targetProgressOf(done.state, "a")).toBe(60 + 30); // 6 sets + bonus
  });

  test("no prescribed combo configured → activation refused", () => {
    let d = day([P("a")]);
    d = grantPowerUp(d, "a", "combo_boost");
    const r = activatePowerUp(d, "a", "combo_boost", { at: T0 + 1 });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toMatch(/no prescribed combo/);
  });
});
