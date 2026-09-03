// Engine v4 — BATTLE SEASONS, STAKES, TEAMS parity tests.
// SOT §1.6/§1.7/§3.7, flows 4.13-4.16; team scaffold §1.4/flow 4.5 (Q229-231).

import { describe, test, expect } from "bun:test";
import {
  createBattleSeason,
  recordBattleDay,
  battleStandings,
  endBattleSeason,
  proposeStake,
  agreeToStake,
  declineStake,
  contributeToCharityStake,
  charityPotTotal,
  resolveSeasonStake,
  designateCharity,
  processCharityDonation,
  markStakeFulfilled,
  validateTeamMode,
  teamScores,
  teamDailyWin,
  createDay,
  logSet,
  closeDay,
  dayRecordFrom,
  MIN_TEAM_SIZE,
} from "../src/index.ts";
import type { Player, DayRecord, BattleSeasonState, DailyBattleState } from "../src/index.ts";

const P = (id: string, tier: Player["tier"] = "fit"): Player => ({ id, name: id, tier });
const PLAYERS = [P("a"), P("b"), P("c")];

const D = (date: string, o: Partial<DayRecord>): DayRecord => ({
  date,
  winnerIds: [],
  completed: [],
  failed: [],
  shielded: [],
  ...o,
});

const season = (opts: Partial<Parameters<typeof createBattleSeason>[0]> = {}) =>
  createBattleSeason(
    { id: "s1", name: "Week 1", playDays: [1, 2, 3, 4, 5], ...opts },
    PLAYERS
  );

describe("v4 season — weekly default, 1:1 points, streaks", () => {
  test("weekly is the default length; 200 the default target", () => {
    const s = season();
    expect(s.config.length).toBe("weekly");
    expect(s.config.targetReps ?? 200).toBe(200);
    expect(s.points).toEqual({ a: 0, b: 0, c: 0 });
  });

  test("1 Daily Win = 1 season point; banking keeps streaks; failure resets", () => {
    let s = season();
    // Mon: a wins, b banks late, c fails
    s = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a"], completed: ["a", "b"], failed: ["c"] }));
    expect(s.points).toEqual({ a: 1, b: 0, c: 0 });
    expect(s.streaks.a).toEqual({ length: 1, best: 1, lastDate: "2026-09-07" });
    expect(s.streaks.b.length).toBe(1);
    expect(s.streaks.c.length).toBe(0);
    // Tue: a wins again, b banks again, c fails again
    s = recordBattleDay(s, D("2026-09-08", { winnerIds: ["a"], completed: ["a", "b"], failed: ["c"] }));
    expect(s.streaks.a).toEqual({ length: 2, best: 2, lastDate: "2026-09-08" });
    // Wed: b finally wins; a banks; c gets a SHIELDED day (streak preserved at 0)
    s = recordBattleDay(s, D("2026-09-09", { winnerIds: ["b"], completed: ["a", "b"], shielded: ["c"] }));
    expect(s.points).toEqual({ a: 2, b: 1, c: 0 });
    expect(s.streaks.c).toMatchObject({ length: 0 }); // preserved, not extended
    // Thu: c completes for real — streak goes to 1
    s = recordBattleDay(s, D("2026-09-10", { winnerIds: ["c"], completed: ["c"] }));
    expect(s.streaks.c).toEqual({ length: 1, best: 1, lastDate: "2026-09-10" });

    const rows = battleStandings(s);
    expect(rows[0]).toMatchObject({ playerId: "a", points: 2, dailyWins: 2, completions: 3 });
    expect(rows.find((r) => r.playerId === "c")).toMatchObject({ points: 1, dailyWins: 1, completions: 1, failures: 2 });
  });

  test("simultaneous Daily Wins both score 1:1 and record the tie (Q224 TODO)", () => {
    let s = season();
    s = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a", "b"], completed: ["a", "b"] }));
    expect(s.points).toEqual({ a: 1, b: 1, c: 0 });
    expect(s.tie).toBe(true);
    const done = endBattleSeason(s);
    expect(done.champion).toBeUndefined(); // tie at the top crowns nobody — open Q224
    expect(done.tie).toBe(true);
  });

  test("season-end crowns the Daily Win leader; guards on records", () => {
    let s = season();
    expect(() => endBattleSeason(s)).toThrow("no days recorded");
    s = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a"], completed: ["a"] }));
    s = recordBattleDay(s, D("2026-09-08", { winnerIds: ["a"], completed: ["a"] }));
    const done = endBattleSeason(s);
    expect(done.champion).toBe("a");
    expect(() => recordBattleDay(done, D("2026-09-09", {}))).toThrow(/season is over/);
    expect(() => recordBattleDay(s, D("2026-09-07", {}))).toThrow(/already recorded/);
    expect(() => recordBattleDay(s, D("2026-09-09", { winnerIds: ["zzz"], completed: ["zzz"] }))).toThrow(/not in season/);
  });

  test("dayRecordFrom folds a closed day into a season record", () => {
    let d = createDay({ id: "d", playDays: [1], deadlineAt: 1_000_000 + 12 * 60 * 60 * 1000 }, PLAYERS);
    d = logSet(d, { playerId: "a", exerciseId: "pushup", reps: 200, at: 1_001_000, verified: true }).state;
    d = logSet(d, { playerId: "b", exerciseId: "pushup", reps: 200, at: 1_002_000, verified: true }).state;
    const closed = closeDay(d, 1_000_000 + 12 * 60 * 60 * 1000);
    const rec = dayRecordFrom(closed.state, "2026-09-07");
    expect(rec).toEqual({
      date: "2026-09-07",
      winnerIds: ["a"],
      completed: ["a", "b"],
      failed: ["c"],
      shielded: [],
      doubleDownFulfilled: [],
    });
    const s = recordBattleDay(season(), rec);
    expect(s.points).toEqual({ a: 1, b: 0, c: 0 });
    expect(() => dayRecordFrom(createDay({ id: "x", playDays: [1], deadlineAt: 0 }, PLAYERS), "2026-09-07")).toThrow(/not closed/);
  });

  test("Double Down finishers earn 2× points only when the season flag is on (Q244)", () => {
    let flagOff = season();
    flagOff = recordBattleDay(flagOff, D("2026-09-07", { winnerIds: ["a"], completed: ["a"], doubleDownFulfilled: ["a"] }));
    expect(flagOff.points.a).toBe(1); // canonical 1:1 untouched

    let flagOn = season({ doubleDownDoublesPoints: true });
    flagOn = recordBattleDay(flagOn, D("2026-09-07", { winnerIds: ["a"], completed: ["a"], doubleDownFulfilled: ["a"] }));
    expect(flagOn.points.a).toBe(2);
  });
});

describe("v4 stakes — lifecycle: proposal, agreement gating, resolution, fulfilment", () => {
  const play = (s: BattleSeasonState): BattleSeasonState => {
    let x = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a"], completed: ["a", "b"], failed: ["c"] }));
    x = recordBattleDay(x, D("2026-09-08", { winnerIds: ["a"], completed: ["a", "b", "c"] }));
    x = recordBattleDay(x, D("2026-09-09", { winnerIds: ["b"], completed: ["b", "c"] }));
    return x;
  };

  test("type none needs no stake object", () => {
    expect(() => proposeStake(season(), { type: "none", declaration: "" }, [])).toThrow();
  });

  test("DINNER: agreed before the season; loser (fewest Daily Wins) owes and fulfils", () => {
    let s = season();
    s = proposeStake(s, { type: "dinner", declaration: "Loser shouts Nando's", valuePoints: 4000 }, ["a", "b", "c"]);
    expect(s.stake?.status).toBe("proposed");
    expect(s.stake?.agreements).toEqual({ a: "pending", b: "pending", c: "pending" });

    // resolution is REFUSED until everyone agrees (agreement gating)
    s = play(s);
    expect(() => resolveSeasonStake(s)).toThrow(/proposed/);

    s = agreeToStake(s, "a");
    expect(s.stake?.status).toBe("proposed");
    s = agreeToStake(s, "b");
    expect(s.stake?.status).toBe("proposed");
    s = agreeToStake(s, "c");
    expect(s.stake?.status).toBe("active");

    s = resolveSeasonStake(s, 9_000);
    expect(s.stake?.status).toBe("resolved");
    expect(s.stake?.resolution).toMatchObject({ winnerIds: ["a"], loserIds: ["c"], tie: false });
    expect(s.stake?.fulfilment).toEqual({ c: { state: "pending" } });

    s = markStakeFulfilled(s, "c", "receipt.png");
    expect(s.stake?.fulfilment.c).toMatchObject({ state: "fulfilled", evidence: "receipt.png" });
    expect(() => markStakeFulfilled(s, "a", "nope")).toThrow(/owes nothing/);
  });

  test("DARE + DELIVERABLE: same gating; joint losers on a bottom tie (Q255)", () => {
    let s = season();
    s = proposeStake(s, { type: "dare", declaration: "Wear the chicken suit to the gym" }, ["a", "b", "c"]);
    s = agreeToStake(s, "a");
    s = agreeToStake(s, "b");
    s = agreeToStake(s, "c");
    // b and c both finish on ZERO Daily Wins → joint losers
    s = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a"], completed: ["a", "b", "c"] }));
    s = resolveSeasonStake(s);
    expect(s.stake?.resolution?.loserIds.sort()).toEqual(["b", "c"]);
    expect(new Set(Object.keys(s.stake?.fulfilment ?? {}))).toEqual(new Set(["b", "c"]));

    let d = season();
    d = proposeStake(d, { type: "deliverable", declaration: "Wash the winner's car" }, ["a", "b", "c"]);
    d = agreeToStake(d, "a");
    d = agreeToStake(d, "b");
    d = agreeToStake(d, "c");
    d = play(d);
    d = resolveSeasonStake(d);
    expect(d.stake?.resolution?.winnerIds).toEqual(["a"]);
    expect(d.stake?.resolution?.loserIds).toEqual(["c"]);
  });

  test("a declined stake is void — nothing resolves", () => {
    let s = season();
    s = proposeStake(s, { type: "dinner", declaration: "Loser shouts brekkie" }, ["a", "b"]);
    s = agreeToStake(s, "a");
    s = declineStake(s, "b");
    expect(s.stake?.status).toBe("void");
    expect(() => resolveSeasonStake(s)).toThrow(/void/);
    expect(() => agreeToStake(s, "b")).toThrow(/void/);
  });

  test("CHARITY: contributions in points, winner directs, disclosed fee field (0 in trial)", () => {
    let s = season();
    s = proposeStake(
      s,
      { type: "charity", declaration: "Season pot to the winner's charity", charity: { perPlayerPoints: 100, platformFeeRate: 0 } },
      ["a", "b", "c"]
    );
    // contributing before agreement is refused
    expect(() => contributeToCharityStake(s, "a", 100)).toThrow(/must agree first/);

    s = agreeToStake(s, "a");
    s = agreeToStake(s, "b");
    s = agreeToStake(s, "c");
    expect(s.stake?.status).toBe("active");

    s = contributeToCharityStake(s, "a", 100);
    s = contributeToCharityStake(s, "b", 100);
    s = contributeToCharityStake(s, "c", 50);
    expect(charityPotTotal(s.stake!)).toBe(250);
    expect(() => contributeToCharityStake(s, "zzz", 10)).toThrow(/participant/);

    s = play(s);
    s = resolveSeasonStake(s);
    expect(s.stake?.resolution?.winnerIds).toEqual(["a"]);

    // only the winner directs the pot (no cash to the winner — SOT §1.7)
    expect(() => designateCharity(s, "wwf", "b")).toThrow(/only the season winner/);
    s = designateCharity(s, "wwf", "a");
    s = processCharityDonation(s, 10_000);
    expect(s.stake?.charity).toMatchObject({
      designatedCharityId: "wwf",
      donationPoints: 250,
      feePoints: 0,
      platformFeeRate: 0,
    });
  });

  test("CHARITY fee math with a non-zero rate (field disclosed, rate TBD per SOT)", () => {
    let s = season();
    s = proposeStake(s, { type: "charity", declaration: "pot", charity: { platformFeeRate: 0.1 } }, ["a", "b"]);
    s = agreeToStake(s, "a");
    s = agreeToStake(s, "b");
    s = contributeToCharityStake(s, "a", 100);
    s = contributeToCharityStake(s, "b", 100);
    s = recordBattleDay(s, D("2026-09-07", { winnerIds: ["a"], completed: ["a", "b"] }));
    s = resolveSeasonStake(s);
    s = designateCharity(s, "rmhc", "a");
    s = processCharityDonation(s);
    expect(s.stake?.charity?.feePoints).toBe(20);
    expect(s.stake?.charity?.donationPoints).toBe(180);
  });

  test("one stake per season; declaration locked up front", () => {
    let s = season();
    s = proposeStake(s, { type: "dinner", declaration: "Loser shouts dinner" }, ["a", "b"]);
    expect(() => proposeStake(s, { type: "dare", declaration: "x" }, ["a", "b"])).toThrow(/already has a stake/);
    expect(() => proposeStake(season(), { type: "dinner", declaration: "  " }, ["a", "b"])).toThrow(/declaration/);
    expect(() => proposeStake(season(), { type: "dare", declaration: "x" }, ["a"])).toThrow(/at least two/);
    expect(() => proposeStake(season(), { type: "dare", declaration: "x" }, ["a", "zzz"])).toThrow(/not in season/);
  });
});

describe("v4 teams — scaffold (min 2/side, uneven allowed, pluggable scoring)", () => {
  const T0 = 1_000_000;
  const DAY_MS = 12 * 60 * 60 * 1000;
  const TEAMS = [
    { id: "red", name: "Red", playerIds: ["a", "b"] },
    { id: "blue", name: "Blue", playerIds: ["c", "d", "e"] }, // 3v2: ALLOWED
  ];

  const teamDay = (): DailyBattleState =>
    createDay({ id: "d", playDays: [1], deadlineAt: T0 + DAY_MS }, [P("a"), P("b"), P("c"), P("d"), P("e")]);

  const log = (s: DailyBattleState, playerId: string, reps: number, at: number) =>
    logSet(s, { playerId, exerciseId: "pushup", reps, at, verified: true }).state;

  test("validation: ≥2 teams, ≥2 per side, unique membership; uneven sizes pass", () => {
    expect(validateTeamMode({ teams: TEAMS, scoringRule: "average" })).toEqual([]);
    expect(validateTeamMode({ teams: [TEAMS[0]], scoringRule: "average" })[0]).toMatch(/at least two teams/);
    const solo = [...TEAMS, { id: "green", name: "G", playerIds: ["f"] }];
    expect(validateTeamMode({ teams: solo, scoringRule: "average" })[0]).toMatch(new RegExp(`minimum ${MIN_TEAM_SIZE}`));
    const dup = [
      { id: "r", name: "R", playerIds: ["a", "b"] },
      { id: "b", name: "B", playerIds: ["b", "c"] },
    ];
    expect(validateTeamMode({ teams: dup, scoringRule: "average" })[0]).toMatch(/more than one team/);
  });

  test("both normalisations computed: pooled sums, average completion %", () => {
    let d = teamDay();
    d = log(d, "a", 100, T0 + 1); // red pooled 100, a 50%
    d = log(d, "b", 200, T0 + 2); // red pooled 300, b 100% → red avg (50+100)/2 = 75%
    d = log(d, "c", 60, T0 + 3);
    d = log(d, "d", 60, T0 + 4);
    d = log(d, "e", 30, T0 + 5); // blue pooled 150, avg (30+30+15)/3 = 25%
    const rows = teamScores(d, { teams: TEAMS, scoringRule: "average" });
    const red = rows.find((r) => r.team.id === "red")!;
    const blue = rows.find((r) => r.team.id === "blue")!;
    expect(red.pooledRuf).toBe(300);
    expect(red.avgCompletionPct).toBe(75);
    expect(blue.pooledRuf).toBe(150);
    expect(blue.avgCompletionPct).toBe(25);
    expect(red.completedCount).toBe(1);
  });

  test("POOLED win condition: first team past (target × size) via a chronological replay", () => {
    let d = teamDay();
    // blue (3 players, 600 threshold) crosses before red (2 players, 400)
    d = log(d, "c", 200, T0 + 10);
    d = log(d, "d", 200, T0 + 20);
    d = log(d, "e", 200, T0 + 30); // blue at 600 — crossed at T0+30
    d = log(d, "a", 200, T0 + 40);
    d = log(d, "b", 200, T0 + 50); // red at 400 — crossed later
    const win = teamDailyWin(d, { teams: TEAMS, scoringRule: "pooled" });
    expect(win).toEqual({ teamId: "blue", crossedAt: T0 + 30 });
  });

  test("AVERAGE win condition: first team whose LAST member completes", () => {
    let d = teamDay();
    d = log(d, "a", 200, T0 + 10);
    d = log(d, "c", 200, T0 + 20);
    d = log(d, "d", 200, T0 + 30);
    d = log(d, "b", 200, T0 + 40); // red fully complete at T0+40
    d = log(d, "e", 200, T0 + 50); // blue fully complete at T0+50 — later
    const win = teamDailyWin(d, { teams: TEAMS, scoringRule: "average" });
    expect(win).toEqual({ teamId: "red", crossedAt: T0 + 40 });
    const none = teamDailyWin(teamDay(), { teams: TEAMS, scoringRule: "average" });
    expect(none).toBeNull();
  });

  test("QUOTA is reserved: reads and wins throw (SOT Q229-231 open)", () => {
    const d = teamDay();
    expect(() => teamScores(d, { teams: TEAMS, scoringRule: "quota" })).toThrow(/RESERVED/);
    expect(() => teamDailyWin(d, { teams: TEAMS, scoringRule: "quota" })).toThrow(/RESERVED/);
  });
});
