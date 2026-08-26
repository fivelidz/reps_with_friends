// @rwf/game-core — engine tests (bun:test)
// Run: bun test packages/game-core
//
// Covers: handicap math (tier multipliers, %HRR blend, aggregation), match
// lifecycle + validation errors, closure/winner incl. closure bonus, the sim
// scenario (athlete closes, couch wins), standings ordering/progress/verified,
// and the charity pot ledger.

import { describe, test, expect } from "bun:test";
import {
  TIER_MULTIPLIERS,
  tierMultiplier,
  effortMultiplier,
  scoreEntry,
  playerScore,
  playerRawReps,
} from "../src/handicap.ts";
import {
  createMatch,
  startMatch,
  logReps,
  standings,
  winner,
  CLOSURE_BONUS,
} from "../src/match.ts";
import { createPot, contribute, potTotalCents, designate } from "../src/pot.ts";
import type { Exercise, MatchConfig, Player, RepEntry } from "../src/types.ts";

// ── fixtures ─────────────────────────────────────────────────────────────────

const EXERCISES: Exercise[] = [
  { id: "pushup", name: "Push-ups" },
  { id: "squat", name: "Squats" },
  { id: "situp", name: "Sit-ups" },
];

function config(targetReps = 300): MatchConfig {
  return { id: "m-test", exercises: EXERCISES, targetReps, playDays: [2, 4] };
}

function player(id: string, tier: Player["tier"], baselineHrrPct?: number): Player {
  return { id, name: id, tier, baselineHrrPct };
}

function entry(
  playerId: string,
  exerciseId: string,
  reps: number,
  verified = false,
  avgHrrPct?: number
): RepEntry {
  return { playerId, exerciseId, reps, at: 1_700_000_000_000, verified, avgHrrPct };
}

/** Start a live match with the given players. */
function liveMatch(players: Player[], targetReps = 300) {
  return startMatch(createMatch(config(targetReps), players), 0);
}

// ── handicap ─────────────────────────────────────────────────────────────────

describe("handicap", () => {
  test("tier multipliers: couch 1.5, casual 1.25, fit 1.0, athlete 0.85", () => {
    expect(TIER_MULTIPLIERS).toEqual({
      couch: 1.5,
      casual: 1.25,
      fit: 1.0,
      athlete: 0.85,
    });
    expect(tierMultiplier(player("p", "couch"))).toBe(1.5);
    expect(tierMultiplier(player("p", "casual"))).toBe(1.25);
    expect(tierMultiplier(player("p", "fit"))).toBe(1.0);
    expect(tierMultiplier(player("p", "athlete"))).toBe(0.85);
  });

  test("effortMultiplier is tier-only when HRR data is missing", () => {
    const withBaseline = player("p", "athlete", 75);
    const noBaseline = player("p", "athlete");
    // entry has no avgHrrPct
    expect(effortMultiplier(withBaseline, entry("p", "pushup", 10))).toBe(0.85);
    // player has no baseline
    expect(effortMultiplier(noBaseline, entry("p", "pushup", 10, false, 80))).toBe(0.85);
  });

  test("effortMultiplier blends %HRR ratio with tier: 0.7×ratio + 0.3×tier", () => {
    // couch, ratio 1.5 (90/60) coincides with tier 1.5 → 1.5
    const couch = player("p", "couch", 60);
    expect(effortMultiplier(couch, entry("p", "pushup", 10, false, 90))).toBeCloseTo(1.5, 10);

    // athlete cruising: 85/50 = 1.7 → 0.7×1.7 + 0.3×0.85 = 1.445
    const athlete = player("p", "athlete", 50);
    expect(effortMultiplier(athlete, entry("p", "pushup", 10, false, 85))).toBeCloseTo(1.445, 10);

    // athlete below baseline: 50/50 = 1.0 → 0.7 + 0.255 = 0.955
    expect(effortMultiplier(athlete, entry("p", "pushup", 10, false, 50))).toBeCloseTo(0.955, 10);
  });

  test("scoreEntry = reps × effortMultiplier", () => {
    const couch = player("p", "couch");
    expect(scoreEntry(couch, entry("p", "pushup", 20))).toBe(30); // 20 × 1.5
    const athlete = player("a", "athlete", 50);
    expect(scoreEntry(athlete, entry("a", "pushup", 100, false, 50))).toBeCloseTo(95.5, 10);
  });

  test("playerScore aggregates only the player's entries", () => {
    const me = player("me", "fit");
    const other = player("other", "couch");
    const entries = [
      entry("me", "pushup", 10),
      entry("other", "pushup", 100), // must be ignored
      entry("me", "squat", 25),
    ];
    expect(playerScore(me, entries)).toBe(35); // fit ×1.0
    expect(playerScore(other, entries)).toBe(150); // couch ×1.5
  });

  test("playerRawReps sums raw reps for one player", () => {
    const entries = [
      entry("me", "pushup", 10),
      entry("you", "squat", 999),
      entry("me", "squat", 15),
    ];
    expect(playerRawReps("me", entries)).toBe(25);
    expect(playerRawReps("nobody", entries)).toBe(0);
  });
});

// ── match lifecycle ──────────────────────────────────────────────────────────

describe("match", () => {
  test("createMatch rejects duplicate player ids", () => {
    expect(() =>
      createMatch(config(), [player("ben", "fit"), player("ben", "couch")])
    ).toThrow("duplicate player ids");
  });

  test("createMatch starts open with no entries", () => {
    const m = createMatch(config(), [player("ben", "fit")]);
    expect(m.status).toBe("open");
    expect(m.entries).toEqual([]);
    expect(m.startedAt).toBeUndefined();
  });

  test("logReps before start throws", () => {
    const m = createMatch(config(), [player("ben", "fit")]);
    expect(() => logReps(m, entry("ben", "pushup", 10))).toThrow("match is not live");
  });

  test("logReps after completion throws", () => {
    let s = liveMatch([player("ben", "fit")], 100);
    s = logReps(s, entry("ben", "pushup", 100)).state;
    expect(() => logReps(s, entry("ben", "pushup", 1))).toThrow("match is not live");
  });

  test("startMatch on a live match throws", () => {
    const s = liveMatch([player("ben", "fit")]);
    expect(() => startMatch(s)).toThrow("match already started");
  });

  test("logReps rejects unknown player", () => {
    const s = liveMatch([player("ben", "fit")]);
    expect(() => logReps(s, entry("ghost", "pushup", 10))).toThrow(
      "player ghost not in match"
    );
  });

  test("logReps rejects unknown exercise", () => {
    const s = liveMatch([player("ben", "fit")]);
    expect(() => logReps(s, entry("ben", "burpee", 10))).toThrow(
      "exercise burpee not in match set"
    );
  });

  test("logReps rejects non-positive and non-integer reps", () => {
    const s = liveMatch([player("ben", "fit")]);
    expect(() => logReps(s, entry("ben", "pushup", 0))).toThrow(
      "reps must be a positive integer"
    );
    expect(() => logReps(s, entry("ben", "pushup", -5))).toThrow(
      "reps must be a positive integer"
    );
    expect(() => logReps(s, entry("ben", "pushup", 2.5))).toThrow(
      "reps must be a positive integer"
    );
  });

  test("logReps is pure: input state is not mutated", () => {
    const s = liveMatch([player("ben", "fit")]);
    const before = JSON.stringify(s);
    logReps(s, entry("ben", "pushup", 10));
    expect(JSON.stringify(s)).toBe(before);
  });

  test("closure exactly at target: complete, closedBy set, completedAt = entry.at", () => {
    let s = liveMatch([player("ben", "fit"), player("zoe", "couch")], 100);
    const r1 = logReps(s, entry("ben", "pushup", 60));
    expect(r1.closedMatch).toBe(false);
    expect(r1.state.status).toBe("live");

    const closing = entry("ben", "squat", 40, true); // 60 + 40 = 100 exactly
    const r2 = logReps(r1.state, closing);
    expect(r2.closedMatch).toBe(true);
    expect(r2.state.status).toBe("complete");
    expect(r2.state.closedBy).toBe("ben");
    expect(r2.state.completedAt).toBe(closing.at);
  });

  test("over-target closure: raw total beyond target still closes", () => {
    let s = liveMatch([player("ben", "fit")], 100);
    s = logReps(s, entry("ben", "pushup", 60)).state;
    const r = logReps(s, entry("ben", "squat", 60)); // 120 ≥ 100
    expect(r.closedMatch).toBe(true);
    expect(r.state.status).toBe("complete");
    expect(r.state.closedBy).toBe("ben");
  });

  test("standings order by adjustedScore descending", () => {
    let s = liveMatch([
      player("fitp", "fit"),
      player("couchp", "couch"),
      player("ath", "athlete"),
    ]);
    s = logReps(s, entry("fitp", "pushup", 50)).state;   // 50.0
    s = logReps(s, entry("couchp", "pushup", 50)).state; // 75.0
    s = logReps(s, entry("ath", "pushup", 50)).state;    // 42.5
    const rows = standings(s);
    expect(rows.map((r) => r.player.id)).toEqual(["couchp", "fitp", "ath"]);
    expect(rows[0].adjustedScore).toBe(75);
  });

  test("progressPct caps at 100 on over-target raw", () => {
    let s = liveMatch([player("ben", "fit")], 100);
    s = logReps(s, entry("ben", "pushup", 60)).state;
    s = logReps(s, entry("ben", "squat", 60)).state; // raw 120
    expect(standings(s)[0].progressPct).toBe(100);
  });

  test("progressPct math below target", () => {
    const s = liveMatch([player("ben", "fit")], 300);
    const rows = standings(logReps(s, entry("ben", "pushup", 45)).state);
    expect(rows[0].progressPct).toBe(15); // 45/300 = 15.0%
  });

  test("verifiedPct: round(verified/raw × 100); 0 when no reps", () => {
    let s = liveMatch([player("ben", "fit"), player("idle", "fit")]);
    s = logReps(s, entry("ben", "pushup", 40, true)).state;
    s = logReps(s, entry("ben", "squat", 20, false)).state; // 40 of 60 verified
    const byId = Object.fromEntries(standings(s).map((r) => [r.player.id, r]));
    expect(byId.ben.verifiedPct).toBe(67); // round(66.67)
    expect(byId.idle.verifiedPct).toBe(0);
    expect(byId.idle.rawReps).toBe(0);
    expect(byId.idle.progressPct).toBe(0);
  });
});

// ── winner + closure bonus ───────────────────────────────────────────────────

describe("winner", () => {
  test("null until complete", () => {
    const open = createMatch(config(), [player("ben", "fit")]);
    expect(winner(open)).toBeNull();
    const live = liveMatch([player("ben", "fit")]);
    expect(winner(live)).toBeNull();
    expect(winner(logReps(live, entry("ben", "pushup", 50)).state)).toBeNull();
  });

  test("closure bonus (+15) is applied to the closer and can decide the match", () => {
    expect(CLOSURE_BONUS).toBe(15);
    // couchp banks 200 raw → 300 adjusted; fitp closes at 300 raw → 300 + 15.
    // Without the bonus it's a 300/300 tie (couchp listed first); with it, the closer wins.
    let s = liveMatch([player("couchp", "couch"), player("fitp", "fit")], 300);
    s = logReps(s, entry("couchp", "pushup", 200)).state;
    s = logReps(s, entry("fitp", "squat", 300)).state; // closes

    // standings themselves carry NO bonus…
    const rows = standings(s);
    expect(rows[0].adjustedScore).toBe(300); // couchp (tie, listed first)
    expect(rows[1].adjustedScore).toBe(300); // fitp

    // …the bonus lives in winner()
    const w = winner(s)!;
    expect(w.playerId).toBe("fitp");
    expect(w.adjustedScore).toBe(315);
    expect(w.closedMatch).toBe(true);
  });

  test("sim scenario: athlete closes at 300 raw but couch wins on adjusted", () => {
    const players: Player[] = [
      { id: "ben", name: "Ben", tier: "athlete", baselineHrrPct: 75 },
      { id: "alexei", name: "Alexei", tier: "casual" },
      { id: "nico", name: "Nico", tier: "fit" },
      { id: "dave", name: "Dave", tier: "couch" },
    ];
    let s = liveMatch(players, 300);
    const log = (p: string, e: string, reps: number, verified = false, hrr?: number) => {
      s = logReps(s, entry(p, e, reps, verified, hrr)).state;
    };

    log("dave", "pushup", 40, true, 82);
    log("ben", "pushup", 60, true, 62); // athlete cruising vs baseline 75
    log("alexei", "squat", 35);
    log("nico", "situp", 50, true);
    log("dave", "squat", 45, true, 85);
    log("ben", "squat", 70, true, 60);
    log("alexei", "pushup", 30);
    log("nico", "pushup", 55, true);
    log("dave", "situp", 50, true, 80);
    log("ben", "situp", 65, true, 58);
    log("alexei", "situp", 40);
    log("nico", "squat", 60, true);
    log("dave", "pushup", 55, true, 88);
    log("ben", "pushup", 60, true, 61);
    log("ben", "squat", 45, true, 59); // Ben hits 300 raw → closes

    expect(s.status).toBe("complete");
    expect(s.closedBy).toBe("ben");

    const rows = standings(s);
    expect(rows.map((r) => r.player.id)).toEqual(["dave", "ben", "nico", "alexei"]);
    expect(rows[0].rawReps).toBe(190); // dave
    expect(rows[0].adjustedScore).toBe(285); // 190 × 1.5
    expect(rows[1].rawReps).toBe(300); // ben
    expect(rows[1].adjustedScore).toBe(244.5); // HRR-blended, cruising

    const w = winner(s)!;
    expect(w.playerId).toBe("dave"); // effort wins the day
    expect(w.adjustedScore).toBe(285);
    expect(w.closedMatch).toBe(false); // ben closed, dave won
  });
});

// ── charity pot ──────────────────────────────────────────────────────────────

describe("pot", () => {
  test("createPot starts empty with no designation", () => {
    const pot = createPot("pot1", "m1");
    expect(pot).toEqual({ id: "pot1", matchId: "m1", contributions: [] });
    expect(pot.designatedCharityId).toBeUndefined();
    expect(potTotalCents(pot)).toBe(0);
  });

  test("contribute appends to the ledger and total sums", () => {
    let pot = createPot("pot1", "m1");
    pot = contribute(pot, "ben", 1000);
    pot = contribute(pot, "dave", 500);
    expect(pot.contributions).toEqual([
      { playerId: "ben", amountCents: 1000 },
      { playerId: "dave", amountCents: 500 },
    ]);
    expect(potTotalCents(pot)).toBe(1500);
  });

  test("contribute is pure (original pot untouched)", () => {
    const pot = createPot("pot1", "m1");
    contribute(pot, "ben", 100);
    expect(pot.contributions).toEqual([]);
  });

  test("zero and negative contributions throw", () => {
    const pot = createPot("pot1", "m1");
    expect(() => contribute(pot, "ben", 0)).toThrow("contribution must be positive");
    expect(() => contribute(pot, "ben", -100)).toThrow("contribution must be positive");
  });

  test("designate sets the winner's charity", () => {
    let pot = createPot("pot1", "m1");
    pot = contribute(pot, "ben", 1000);
    pot = designate(pot, { id: "beyond_blue", name: "Beyond Blue" });
    expect(pot.designatedCharityId).toBe("beyond_blue");
    expect(potTotalCents(pot)).toBe(1000); // designation doesn't touch money
  });
});
