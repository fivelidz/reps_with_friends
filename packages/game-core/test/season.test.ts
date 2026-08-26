// Tests for comeback multiplier, seasons, baseline learning.

import { describe, test, expect } from "bun:test";
import {
  createMatch,
  startMatch,
  logReps,
  comebackEligible,
  applyComeback,
  comebackUsed,
  COMEBACK_MULTIPLIER,
  scoreEntry,
  createSeason,
  recordMatch,
  seasonLadder,
  forgiveStreak,
  endSeason,
  FORGIVE_MIN_CENTS,
  updateBaseline,
} from "../src/index.ts";
import type { Player, MatchState } from "../src/index.ts";

const P = (id: string, tier: Player["tier"] = "casual"): Player => ({ id, name: id, tier });

const live = (): MatchState =>
  startMatch(
    createMatch(
      {
        id: "m",
        exercises: [{ id: "pushup", name: "Push-ups" }],
        targetReps: 300,
        playDays: [2],
      },
      [P("lead", "fit"), P("behind", "couch")]
    )
  );

describe("comeback", () => {
  test("not eligible at start (leader has 0)", () => {
    expect(comebackEligible(live(), "behind")).toBe(false);
  });

  test("eligible when >30% behind leader", () => {
    let s = live();
    s = logReps(s, { playerId: "lead", exerciseId: "pushup", reps: 100, at: 1, verified: true }).state;
    s = logReps(s, { playerId: "behind", exerciseId: "pushup", reps: 10, at: 2, verified: true }).state;
    // behind: (100-10)/100 = 90% > 30%
    expect(comebackEligible(s, "behind")).toBe(true);
    expect(comebackEligible(s, "lead")).toBe(false); // leader not behind
  });

  test("not eligible when within 30%", () => {
    let s = live();
    s = logReps(s, { playerId: "lead", exerciseId: "pushup", reps: 100, at: 1, verified: true }).state;
    s = logReps(s, { playerId: "behind", exerciseId: "pushup", reps: 80, at: 2, verified: true }).state;
    // (100-80)/100 = 20% < 30%
    expect(comebackEligible(s, "behind")).toBe(false);
  });

  test("applyComeback tags once, then used", () => {
    let s = live();
    s = logReps(s, { playerId: "lead", exerciseId: "pushup", reps: 100, at: 1, verified: true }).state;
    const tagged = applyComeback(s, { playerId: "behind", exerciseId: "pushup", reps: 20, at: 2, verified: true });
    expect(tagged.comeback).toBe(true);
    expect(comebackUsed({ ...s, entries: [...s.entries, tagged] }, "behind")).toBe(true);
    // second application: no longer eligible
    const again = applyComeback({ ...s, entries: [...s.entries, tagged] }, { playerId: "behind", exerciseId: "pushup", reps: 20, at: 3, verified: true });
    expect(again.comeback).toBeUndefined();
  });

  test("comeback entry scores ×1.2", () => {
    const p = P("x", "fit"); // 1.0×
    const plain = { playerId: "x", exerciseId: "pushup", reps: 50, at: 1, verified: true };
    expect(scoreEntry(p, { ...plain, comeback: true })).toBeCloseTo(50 * COMEBACK_MULTIPLIER);
    expect(scoreEntry(p, plain)).toBe(50);
  });
});

describe("season", () => {
  const players = [P("a", "fit"), P("b", "casual"), P("c", "couch")];
  const season = () => createSeason({ id: "s1", name: "Season 1", weeks: 4 }, players);

  test("createSeason defaults", () => {
    const s = season();
    expect(s.config.weeks).toBe(4);
    expect(s.week).toBe(1);
    expect(s.divisions.A).toEqual(["a", "b", "c"]);
    expect(s.champion).toBeUndefined();
  });

  test("points 3/2/1 + MVP +1, streaks increment", () => {
    let s = season();
    s = recordMatch(s, {
      matchId: "m1",
      week: 1,
      standings: [
        { playerId: "c", adjustedScore: 300 },
        { playerId: "a", adjustedScore: 250 },
        { playerId: "b", adjustedScore: 200 },
      ],
      mvpPlayerId: "b",
    });
    expect(s.points).toEqual({ a: 2, b: 1 + 1, c: 3 });
    expect(s.streaks.a).toEqual({ length: 1, lastWeekPlayed: 1 });
    // same week again: no double streak
    s = recordMatch(s, { matchId: "m2", week: 1, standings: [{ playerId: "a", adjustedScore: 10 }] });
    expect(s.streaks.a).toEqual({ length: 1, lastWeekPlayed: 1 });
    expect(s.points.a).toBe(2 + 3); // won the second match too
  });

  test("ladder sorts by points, tracks wins/mvp/played", () => {
    let s = season();
    s = recordMatch(s, { matchId: "m1", week: 1, standings: [{ playerId: "a", adjustedScore: 9 }, { playerId: "b", adjustedScore: 5 }], mvpPlayerId: "a" });
    const ladder = seasonLadder(s);
    expect(ladder[0]).toMatchObject({ playerId: "a", points: 4, played: 1, wins: 1, mvpCount: 1 });
    expect(ladder.find((r) => r.playerId === "c")).toMatchObject({ played: 0, points: 0 });
  });

  test("forgiveStreak: min $2, once per season", () => {
    let s = season();
    expect(() => forgiveStreak(s, "a", 100)).toThrow();
    s = forgiveStreak(s, "a", 200);
    expect(s.forgivenessUsed.a).toBe(200);
    expect(() => forgiveStreak(s, "a", 500)).toThrow();
    expect(() => forgiveStreak(s, "zzz", 200)).toThrow();
  });

  test("endSeason crowns champion and swaps bottom-A/top-B", () => {
    let s = createSeason({ id: "s", name: "S", weeks: 2 }, players);
    s = { ...s, divisions: { A: ["a", "b"], B: ["c"] } };
    s = recordMatch(s, { matchId: "m1", week: 1, standings: [{ playerId: "b", adjustedScore: 5 }, { playerId: "a", adjustedScore: 3 }, { playerId: "c", adjustedScore: 1 }] });
    const done = endSeason(s);
    expect(done.champion).toBe("b");
    expect(done.divisions.A.sort()).toEqual(["b", "c"].sort()); // c promoted, a relegated, champion b stays
    expect(done.divisions.B).toEqual(["a"]);
    expect(() => recordMatch(done, { matchId: "m2", week: 2, standings: [] })).toThrow();
  });

  test("endSeason with no matches throws", () => {
    expect(() => endSeason(season())).toThrow();
  });
});

describe("baseline learning", () => {
  const E = (avgHrrPct?: number, reps = 20) => ({
    playerId: "x", exerciseId: "pushup", reps, at: 1, verified: true, ...(avgHrrPct != null ? { avgHrrPct } : {}),
  });

  test("HR path: baseline drifts ≤10% toward rolling average", () => {
    const p: Player = { id: "x", name: "x", tier: "fit", baselineHrrPct: 70 };
    const entries = [E(80), E(82), E(78)]; // avg 80
    const next = updateBaseline(p, entries);
    expect(next.baselineHrrPct).toBeCloseTo(70 + 10 * 0.1); // 71
    expect(next.tier).toBe("fit"); // tier untouched on HR path
  });

  test("HR path needs ≥3 samples", () => {
    const p: Player = { id: "x", name: "x", tier: "fit", baselineHrrPct: 70 };
    expect(updateBaseline(p, [E(90), E(90)]).baselineHrrPct).toBe(70);
  });

  test("volume path: >1.3× expected reps drifts tier one step", () => {
    const couch: Player = { id: "x", name: "x", tier: "couch" }; // expected 150
    const entries = Array.from({ length: 8 }, (_, i) => E(undefined, 25)); // 200 total
    expect(updateBaseline(couch, entries).tier).toBe("casual");
    // under the ratio: no drift
    const few = Array.from({ length: 4 }, () => E(undefined, 25)); // 100
    expect(updateBaseline(couch, few).tier).toBe("couch");
  });

  test("athlete cannot drift further", () => {
    const athlete: Player = { id: "x", name: "x", tier: "athlete" }; // expected 550
    const entries = Array.from({ length: 30 }, () => E(undefined, 25)); // 750
    expect(updateBaseline(athlete, entries).tier).toBe("athlete");
  });
});
