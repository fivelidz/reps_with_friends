/* ═══════════════════════════════════════════════════════════════════════
   ENGINE PARITY TEST — proves apps/figma-app/engine.js (+ verify.js) is a
   faithful port of packages/game-core by running the SAME scenarios through
   BOTH implementations (bun executes the TS spec natively) and asserting
   identical results. Run: bun test apps/figma-app/engine.test.js
   ═══════════════════════════════════════════════════════════════════════ */

import { test, expect, describe } from "bun:test";

// The port (browser JS)…
import * as JS from "./engine.js";
import { createRepCounter as jsCounter, angleAt as jsAngle, trackedAngle as jsTracked } from "./verify.js";
// …and the spec (TypeScript game-core), executed natively by bun.
import * as TS from "../../packages/game-core/src/index.ts";
import { createRepCounter as tsCounter, angleAt as tsAngle, trackedAngle as tsTracked } from "../../apps/web/src/verify/count.ts";

/* ── fixtures (identical for both engines) ────────────────────────────── */

const player = (id, tier, baselineHrrPct) => ({ id, name: id, tier, ...(baselineHrrPct != null ? { baselineHrrPct } : {}) });
const entry = (playerId, exerciseId, reps, verified = false, at = 1_000, extra = {}) => ({
  playerId, exerciseId, reps, at, verified, ...extra,
});
const config = (targetReps = 300) => ({
  id: "cfg",
  exercises: [{ id: "pushup", name: "Push-ups" }, { id: "squat", name: "Squats" }],
  targetReps,
  playDays: [1, 3, 5],
});
const liveMatch = (players, targetReps = 300) => {
  let s = TS.createMatch(config(targetReps), players);
  return TS.startMatch({ ...s }, 500);
};

/** Run a scripted match through one engine (raw lifecycle — no comeback
 *  auto-apply; comeback has its own dedicated test below). */
function play(eng, players, targetReps, entries) {
  let s = eng.startMatch(eng.createMatch(config(targetReps), players), 500);
  let closed = false;
  for (const e of entries) {
    const r = eng.logReps(s, { ...e, at: e.at ?? 1_000 });
    s = r.state;
    closed = closed || r.closedMatch;
  }
  return { s, closed };
}

/* ── 1. tier multipliers ──────────────────────────────────────────────── */

describe("parity: tier multipliers", () => {
  test("couch 1.5 / casual 1.25 / fit 1.0 / athlete 0.85 — identical", () => {
    expect(JS.TIER_MULTIPLIERS).toEqual(TS.TIER_MULTIPLIERS);
    for (const tier of ["couch", "casual", "fit", "athlete"]) {
      expect(JS.tierMultiplier(player("p", tier))).toBe(TS.tierMultiplier(player("p", tier)));
    }
  });
});

/* ── 2. THE CLASSIC: athlete closes at 300 raw, couch wins on adjusted ── */

describe("parity: the classic 300", () => {
  test("athlete closes, couch wins — both engines agree on every number", () => {
    const players = [player("couch", "couch"), player("ath", "athlete")];
    const entries = [
      entry("couch", "pushup", 100), // couch grinds
      entry("couch", "squat", 100),  // 200 raw
      entry("ath", "pushup", 150),
      entry("ath", "squat", 150),    // 300 raw → closes
    ];
    const a = play(JS, players, 300, entries);
    const b = play(TS, players, 300, entries);

    expect(a.closed).toBe(true);
    expect(b.closed).toBe(true);
    expect(a.s.status).toBe("complete");
    expect(a.s.closedBy).toBe("ath");
    expect(b.s.closedBy).toBe("ath");

    const rowsA = JS.finalStandings(a.s);
    const rowsB = TS.finalStandings(b.s);
    // couch: 200 × 1.5 = 300 vs athlete: 300 × 0.85 = 255 + 15 closure = 270
    expect(rowsA.map((r) => r.player.id)).toEqual(["couch", "ath"]);
    expect(rowsB.map((r) => r.player.id)).toEqual(["couch", "ath"]);
    expect(rowsA[0].adjustedScore).toBe(300);
    expect(rowsA[1].adjustedScore).toBe(270);
    expect(rowsA.map((r) => r.adjustedScore)).toEqual(rowsB.map((r) => r.adjustedScore));

    const wA = JS.winner(a.s), wB = TS.winner(b.s);
    expect(wA).toEqual(wB);
    expect(wA.playerId).toBe("couch"); // the couch player WINS
    expect(wA.closedMatch).toBe(false);
  });
});

/* ── 3. comeback: eligibility, once-only, ×1.2 ────────────────────────── */

describe("parity: comeback", () => {
  test(">30% behind arms the boost; it applies once and multiplies ×1.2", () => {
    const players = [player("ben", "fit"), player("sam", "fit")];
    // sam 100, ben 0 → ben is 100% behind → eligible
    let js = JS.startMatch(JS.createMatch(config(300), players), 500);
    let ts = TS.startMatch(TS.createMatch(config(300), players), 500);
    js = JS.logReps(js, entry("sam", "pushup", 100)).state;
    ts = TS.logReps(ts, entry("sam", "pushup", 100)).state;

    expect(JS.comebackEligible(js, "ben")).toBe(true);
    expect(TS.comebackEligible(ts, "ben")).toBe(true);
    expect(JS.comebackEligible(js, "sam")).toBe(false);
    expect(TS.comebackEligible(ts, "sam")).toBe(false);

    // ben logs 50 with comeback armed → 50 × 1.0 × 1.2 = 60
    const taggedJ = JS.applyComeback(js, entry("ben", "pushup", 50));
    const taggedT = TS.applyComeback(ts, entry("ben", "pushup", 50));
    expect(taggedJ.comeback).toBe(true);
    expect(taggedT.comeback).toBe(true);
    js = JS.logReps(js, taggedJ).state;
    ts = TS.logReps(ts, taggedT).state;
    const benRow = (st) => JS.standings(st).find((r) => r.player.id === "ben");
    expect(benRow(js).adjustedScore).toBe(60);
    expect(TS.standings(ts).find((r) => r.player.id === "ben").adjustedScore).toBe(60);

    // second time: not eligible again (once per player per match)
    expect(JS.comebackEligible(js, "ben")).toBe(false);
    expect(TS.comebackEligible(ts, "ben")).toBe(false);
    expect(JS.comebackUsed(js, "ben")).toBe(true);
    expect(TS.comebackUsed(ts, "ben")).toBe(true);

    // exactly-30% behind is NOT eligible (strict >)
    let j2 = JS.startMatch(JS.createMatch(config(300), players), 500);
    j2 = JS.logReps(j2, entry("sam", "pushup", 100)).state;
    j2 = JS.logReps(j2, entry("ben", "squat", 70)).state; // (100-70)/100 = 30%
    expect(JS.comebackEligible(j2, "ben")).toBe(false);
  });
});

/* ── 4. standings: order, progress cap, verified rounding ─────────────── */

describe("parity: standings", () => {
  test("ordering, progressPct, verifiedPct rounding — deep equal", () => {
    const players = [player("fitp", "fit"), player("couchp", "couch"), player("ath", "athlete"), player("idle", "casual")];
    const entries = [
      entry("fitp", "pushup", 50, true),
      entry("couchp", "pushup", 50),
      entry("ath", "pushup", 50, true),
      entry("fitp", "squat", 20),
      entry("couchp", "squat", 60, true), // couch 110 raw → 137.5 adj
      entry("ath", "squat", 60),          // ath 110 raw → 93.5 adj
    ];
    const a = play(JS, players, 300, entries);
    const b = play(TS, players, 300, entries);

    const strip = (rows) => rows.map((r) => ({
      id: r.player.id, raw: r.rawReps, adj: r.adjustedScore,
      pct: r.progressPct, verified: r.verifiedPct,
    }));
    expect(strip(JS.standings(a.s))).toEqual(strip(TS.standings(b.s)));
    const rows = strip(JS.standings(a.s));
    expect(rows.map((r) => r.id)).toEqual(["couchp", "ath", "fitp", "idle"]);
    expect(rows.find((r) => r.id === "couchp").pct).toBe(36.7); // 110/300
    expect(rows.find((r) => r.id === "fitp").verified).toBe(71); // round(50/70)
    expect(rows.find((r) => r.id === "idle").raw).toBe(0);
  });

  test("progressPct caps at 100 on over-target raw (both engines)", () => {
    const players = [player("ben", "fit")];
    const a = play(JS, players, 100, [entry("ben", "pushup", 60), entry("ben", "squat", 60)]);
    const b = play(TS, players, 100, [entry("ben", "pushup", 60), entry("ben", "squat", 60)]);
    expect(a.closed).toBe(true);
    expect(JS.standings(a.s)[0].progressPct).toBe(100);
    expect(TS.standings(b.s)[0].progressPct).toBe(100);
  });
});

/* ── 5. closure bonus decides the winner ──────────────────────────────── */

describe("parity: closure bonus", () => {
  test("the +15 flips a 10-point deficit — identical winners", () => {
    // fit closer: 200×1.0=200+15=215 vs couch 140×1.5=210 → closer wins
    const players = [player("f", "fit"), player("c", "couch")];
    const entries = [
      entry("c", "pushup", 140),
      entry("f", "pushup", 200), // closes at 200 target
    ];
    const a = play(JS, players, 200, entries);
    const b = play(TS, players, 200, entries);
    expect(JS.winner(a.s)).toEqual(TS.winner(b.s));
    expect(JS.winner(a.s).playerId).toBe("f");
    expect(JS.winner(a.s).adjustedScore).toBe(215);
    expect(JS.CLOSURE_BONUS).toBe(TS.CLOSURE_BONUS);
    // and without the bonus couch would have led the live standings:
    expect(JS.standings(a.s)[0].player.id).toBe("c");
  });
});

/* ── 6. seasons: 3/2/1 + MVP, ladder order ────────────────────────────── */

describe("parity: seasons", () => {
  test("recordMatch points and seasonLadder agree end-to-end", () => {
    const players = [player("a", "fit"), player("b", "couch"), player("c", "casual"), player("d", "athlete")];
    let js = JS.createSeason({ id: "s1", name: "S1" }, players);
    let ts = TS.createSeason({ id: "s1", name: "S1" }, players);

    const results = [
      { matchId: "m1", week: 1, standings: [{ playerId: "b", adjustedScore: 300 }, { playerId: "a", adjustedScore: 270 }, { playerId: "c", adjustedScore: 200 }, { playerId: "d", adjustedScore: 100 }], mvpPlayerId: "a" },
      { matchId: "m2", week: 2, standings: [{ playerId: "b", adjustedScore: 305 }, { playerId: "a", adjustedScore: 310 }, { playerId: "d", adjustedScore: 90 }], mvpPlayerId: "b" },
    ];
    for (const r of results) {
      js = JS.recordMatch(js, r);
      ts = TS.recordMatch(ts, r);
    }
    expect(js.points).toEqual(ts.points);
    expect(JS.seasonLadder(js)).toEqual(TS.seasonLadder(ts));
    // b: 3+3 +1(mvp m2) = 7 · a: 2+2 +1(mvp m1) = 5 · c: 1 · d: 0
    const ladder = JS.seasonLadder(js);
    expect(ladder[0].playerId).toBe("b");
    expect(ladder[0].points).toBe(7);
    expect(ladder[0].wins).toBe(2);
    expect(ladder[0].mvpCount).toBe(1);
    expect(ladder.find((r) => r.playerId === "a").points).toBe(5);
    expect(ladder.find((r) => r.playerId === "c").played).toBe(1);
    expect(ladder.find((r) => r.playerId === "d").played).toBe(2);
  });
});

/* ── 7. charity pot ───────────────────────────────────────────────────── */

describe("parity: charity pot", () => {
  test("contribute/designate/total — identical ledger", () => {
    let pj = JS.createPot("p1", "m1");
    let pt = TS.createPot("p1", "m1");
    pj = JS.contribute(JS.contribute(pj, "a", 200), "b", 500);
    pt = TS.contribute(TS.contribute(pt, "a", 200), "b", 500);
    expect(pj).toEqual(pt);
    expect(JS.potTotalCents(pj)).toBe(TS.potTotalCents(pt));
    expect(JS.potTotalCents(pj)).toBe(700);
    pj = JS.designate(pj, { id: "beyond_blue", name: "Beyond Blue" });
    pt = TS.designate(pt, { id: "beyond_blue", name: "Beyond Blue" });
    expect(pj.designatedCharityId).toBe("beyond_blue");
    expect(() => JS.contribute(pj, "a", 0)).toThrow();
    expect(() => TS.contribute(pt, "a", 0)).toThrow();
  });
});

/* ── 8. lifecycle guards ──────────────────────────────────────────────── */

describe("parity: lifecycle guards", () => {
  test("same errors for the same mistakes", () => {
    const players = [player("ben", "fit")];
    const openJ = JS.createMatch(config(), players);
    const openT = TS.createMatch(config(), players);
    expect(() => JS.logReps(openJ, entry("ben", "pushup", 10))).toThrow("match is not live");
    expect(() => TS.logReps(openT, entry("ben", "pushup", 10))).toThrow("match is not live");
    const liveJ = JS.startMatch(openJ, 1);
    const liveT = TS.startMatch(openT, 1);
    expect(() => JS.logReps(liveJ, entry("nobody", "pushup", 10))).toThrow("player nobody not in match");
    expect(() => TS.logReps(liveT, entry("nobody", "pushup", 10))).toThrow("player nobody not in match");
    expect(() => JS.logReps(liveJ, entry("ben", "curl", 10))).toThrow("exercise curl not in match set");
    expect(() => JS.logReps(liveJ, entry("ben", "pushup", 2.5))).toThrow("reps must be a positive integer");
    // purity: input state untouched
    const before = JSON.stringify(liveJ);
    JS.logReps(liveJ, entry("ben", "pushup", 10));
    expect(JSON.stringify(liveJ)).toBe(before);
  });
});

/* ── 10. POWER-UPS (FLOW-05 — figma-app only, no game-core twin) ────────
   These are NOT parity tests: power-ups deliberately live only in the
   figma-app engine port (Ben's launch-gate concept, our v1 scope call),
   so there is no TS spec to mirror. They follow the parity STYLE —
   scripted matches through the real lifecycle, exact-number assertions. */

describe("power-ups: lightning round", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];

  test("×3 inside the window, normal after expiry, one activation per match, card consumed", () => {
    let m = liveMatch(players);
    m = JS.grantPowerUp(m, "ben", "lightning");
    m = JS.grantPowerUp(m, "ben", "lightning"); // hold TWO — the cap must still bite
    expect(JS.inventoryOf(m, "ben")).toHaveLength(2);

    // activate at t=1000 with an injectable 10-min window
    const act = JS.activatePowerUp(m, "ben", "lightning", { at: 1000, lightningMs: 600_000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.until).toBe(601_000);
    expect(act.result.multiplier).toBe(3);
    expect(act.state.lightningUsed.ben).toBe(true);
    expect(JS.inventoryOf(act.state, "ben")).toHaveLength(1); // one card spent

    // entry logged INSIDE the window → tagged ×3 (fit tier ×1 → 20×3 = 60)
    const inWindow = JS.applyLightning(act.state, entry("ben", "pushup", 20, false, 2000));
    expect(inWindow.lightning).toBe(true);
    m = JS.logReps(act.state, inWindow).state;
    expect(JS.standings(m).find((r) => r.player.id === "ben").adjustedScore).toBe(60);

    // entry logged exactly AT the expiry instant is OUT (exclusive end)…
    const atEdge = JS.applyLightning(m, entry("ben", "pushup", 20, false, 601_000));
    expect(atEdge.lightning).toBeUndefined();
    // …and one after expiry too
    const after = JS.applyLightning(m, entry("ben", "squat", 20, false, 601_001));
    expect(after.lightning).toBeUndefined();
    m = JS.logReps(m, after).state;
    expect(JS.standings(m).find((r) => r.player.id === "ben").adjustedScore).toBe(80); // 60 + 20×1

    // the cap survives expiry: second activation refused even with a card held
    const again = JS.activatePowerUp(m, "ben", "lightning", { at: 700_000 });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toContain("one per match");
    expect(JS.inventoryOf(again.state, "ben")).toHaveLength(1); // card NOT spent on a refused activation
  });

  test("lightning stacks with the comeback ×1.2 on the same entry", () => {
    let m = liveMatch(players);
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // ben 100% behind → comeback armed
    m = JS.grantPowerUp(m, "ben", "lightning");
    m = JS.activatePowerUp(m, "ben", "lightning", { at: 2000, lightningMs: 600_000 }).state;
    let e = JS.applyComeback(m, entry("ben", "pushup", 50, false, 3000));
    e = JS.applyLightning(m, e);
    expect(e.comeback).toBe(true);
    expect(e.lightning).toBe(true);
    m = JS.logReps(m, e).state;
    // 50 × 1.0 (fit) × 1.2 comeback × 3 lightning = 180
    expect(JS.standings(m).find((r) => r.player.id === "ben").adjustedScore).toBe(180);
  });
});

describe("power-ups: rep steal", () => {
  const players = [player("ben", "couch"), player("sam", "athlete"), player("alex", "casual")];

  test("takes floor(10%) of the CURRENT leading rival; raw + adjusted both move; card consumed", () => {
    let m = liveMatch(players);
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads, alex 0
    m = JS.grantPowerUp(m, "ben", "steal");

    expect(JS.stealPreview(m, "ben")).toMatchObject({ victim: { id: "sam" }, victimRaw: 100, amount: 10, blocked: false });

    const act = JS.activatePowerUp(m, "ben", "steal", { at: 5000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.stolen).toBe(10);
    expect(act.result.victimId).toBe("sam");
    expect(act.result.victimRaw).toBe(90);

    // ledger: two transfer entries; thief +10 raw, victim −10 raw
    expect(act.state.entries.filter((e) => e.steal)).toHaveLength(2);
    const rows = JS.standings(act.state);
    const ben = rows.find((r) => r.player.id === "ben");
    const sam = rows.find((r) => r.player.id === "sam");
    expect(ben.rawReps).toBe(10);
    expect(sam.rawReps).toBe(90);
    // adjusted moves too — each side at their own handicap (couch 1.5 / athlete 0.85)
    expect(ben.adjustedScore).toBe(15);
    expect(sam.adjustedScore).toBe(76.5);

    // inventory exhaustion: the card is gone, a second attempt is refused
    expect(JS.inventoryOf(act.state, "ben")).toHaveLength(0);
    const again = JS.activatePowerUp(act.state, "ben", "steal", { at: 6000 });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toContain("no steal card held");
  });

  test("minimum steal is 1 when the rival is above zero", () => {
    let m = liveMatch(players);
    m = JS.logReps(m, entry("sam", "pushup", 5)).state; // floor(0.5) = 0 → clamps to 1
    m = JS.grantPowerUp(m, "ben", "steal");
    const act = JS.activatePowerUp(m, "ben", "steal", { at: 1000 });
    expect(act.result.stolen).toBe(1);
    expect(act.state.entries.filter((e) => e.steal)).toHaveLength(2);
  });

  test("steal at zero: nothing to take — card spent, no entries added", () => {
    let m = liveMatch(players); // everyone at 0
    m = JS.grantPowerUp(m, "ben", "steal");
    const act = JS.activatePowerUp(m, "ben", "steal", { at: 1000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.stolen).toBe(0);
    expect(act.state.entries).toHaveLength(0);
    expect(JS.inventoryOf(act.state, "ben")).toHaveLength(0); // honest: the card burned on a dry well
  });
});

describe("power-ups: shield", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];

  test("blocks one steal, breaks, and the thief KEEPS the steal card; the next steal lands", () => {
    let m = liveMatch(players);
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads
    m = JS.grantPowerUp(m, "sam", "shield");
    m = JS.grantPowerUp(m, "ben", "steal");
    m = JS.activatePowerUp(m, "sam", "shield", { at: 1000 }).state;
    expect(m.shields.sam).toBe(true);

    // blocked attempt: no transfer, shield consumed, steal card retained
    const blocked = JS.activatePowerUp(m, "ben", "steal", { at: 2000 });
    expect(blocked.result.ok).toBe(true);
    expect(blocked.result.blocked).toBe(true);
    expect(blocked.result.stolen).toBe(0);
    expect(blocked.state.shields.sam).toBeUndefined();
    expect(blocked.state.entries).toHaveLength(1); // only sam's original 100
    expect(JS.inventoryOf(blocked.state, "ben").map((i) => i.kind)).toEqual(["steal"]);

    // second steal: shield is gone → transfers 10
    const landed = JS.activatePowerUp(blocked.state, "ben", "steal", { at: 3000 });
    expect(landed.result.stolen).toBe(10);
    expect(landed.state.entries.filter((e) => e.steal)).toHaveLength(2);
    expect(JS.inventoryOf(landed.state, "ben")).toHaveLength(0);
  });

  test("no double-arming; a shield guards the target even at zero reps", () => {
    let m = liveMatch(players);
    m = JS.logReps(m, entry("sam", "pushup", 100)).state;
    m = JS.grantPowerUp(m, "ben", "shield");
    m = JS.grantPowerUp(m, "ben", "shield");
    m = JS.activatePowerUp(m, "ben", "shield", { at: 1000 }).state;
    const again = JS.activatePowerUp(m, "ben", "shield", { at: 2000 });
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toContain("already armed");

    // sam (100 raw) steals from ben (0 raw, shielded): blocked — the shield
    // guards the TARGET, even though there was nothing to take
    m = JS.grantPowerUp(m, "sam", "steal");
    const act = JS.activatePowerUp(m, "sam", "steal", { at: 3000 });
    expect(act.result.blocked).toBe(true);
  });
});

describe("power-ups: time freeze + deadlineAt", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];

  test("freeze extends the deadline by exactly 30 min, and stacks", () => {
    let m = JS.startMatch(JS.createMatch({ ...config(300), deadlineAt: 1_000_000 }, players), 500);
    expect(m.deadlineAt).toBe(1_000_000); // injectable config deadline honored

    m = JS.grantPowerUp(m, "ben", "freeze");
    m = JS.grantPowerUp(m, "ben", "freeze");
    m = JS.activatePowerUp(m, "ben", "freeze", { at: 2000 }).state;
    expect(m.deadlineAt).toBe(1_000_000 + JS.FREEZE_MS);
    m = JS.activatePowerUp(m, "ben", "freeze", { at: 3000 }).state;
    expect(m.deadlineAt).toBe(1_000_000 + 2 * JS.FREEZE_MS); // stacks
    expect(JS.FREEZE_MS).toBe(30 * 60 * 1000);
  });

  test("createMatch defaults deadlineAt to end of play day (now + 24h) when not injected", () => {
    const open = JS.createMatch(config(300), players, 5_000);
    expect(open.deadlineAt).toBe(5_000 + JS.DAY_MS);
    // the whole FLOW-05 match scaffold comes pre-built
    expect(open.inventory).toEqual({ ben: [], sam: [] });
    expect(open.shields).toEqual({});
    expect(open.lightning).toEqual({});
    expect(open.powerLog).toEqual([]);
  });
});

describe("power-ups: grants, odds + guards", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];

  test("grantPowerUp defaults rarity, honours overrides, and throws honestly", () => {
    let m = liveMatch(players);
    m = JS.grantPowerUp(m, "ben", "lightning", { at: 42 });
    m = JS.grantPowerUp(m, "ben", "shield", { at: 43, rarity: "legendary" });
    const inv = JS.inventoryOf(m, "ben");
    expect(inv[0]).toEqual({ kind: "lightning", rarity: "legendary", grantedAt: 42 });
    expect(inv[1]).toEqual({ kind: "shield", rarity: "legendary", grantedAt: 43 });
    expect(() => JS.grantPowerUp(m, "ben", "mega")).toThrow("unknown power-up mega");
    expect(() => JS.grantPowerUp(m, "nobody", "shield")).toThrow("player nobody not in match");
  });

  test("randomPowerUpKind follows the drop odds with an injectable rng", () => {
    expect(JS.randomPowerUpKind(() => 0.049)).toBe("lightning"); // legendary band
    expect(JS.randomPowerUpKind(() => 0.10)).toBe("steal");      // epic band
    expect(JS.randomPowerUpKind(() => 0.40)).toBe("freeze");     // rare band
    expect(JS.randomPowerUpKind(() => 0.99)).toBe("shield");     // common band
    expect(JS.DROP_ODDS).toEqual({ common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 });
  });

  test("guards + purity: not-live, unknown kind, missing card, input never mutated", () => {
    const open = JS.createMatch(config(300), players);
    const r1 = JS.activatePowerUp(open, "ben", "shield", { at: 1 });
    expect(r1.result.ok).toBe(false);
    expect(r1.result.reason).toBe("match is not live");

    let m = liveMatch(players);
    expect(JS.activatePowerUp(m, "ben", "mega").result.reason).toContain("unknown power-up");
    expect(JS.activatePowerUp(m, "nobody", "shield").result.reason).toContain("not in match");
    expect(JS.activatePowerUp(m, "ben", "shield").result.reason).toContain("no shield card held");

    const before = JSON.stringify(m);
    JS.grantPowerUp(m, "ben", "shield");
    JS.activatePowerUp(m, "ben", "shield", { at: 10 });
    expect(JSON.stringify(m)).toBe(before); // pure: both calls returned new states
  });
});

/* ── 9. verify.js: angle-threshold counter parity (spec: count.ts) ────── */

describe("parity: rep counter (verify.js vs count.ts)", () => {
  test("identical rep counts + phases on a synthetic squat-angle stream", () => {
    const spec = { downAngle: 110, upAngle: 160 };
    const j = jsCounter(spec);
    const t = tsCounter(spec);

    // stream: 170 → 100 (down) → 170 (up = rep 1), jitter, dropout, rep 2…
    const stream = [];
    let ms = 0;
    const push = (angle, dt = 100) => { ms += dt; stream.push([angle, ms]); };
    push(170); push(165); push(100); push(95); push(100); push(150);
    push(170);                       // rep 1 counted
    push(155); push(158);            // between thresholds — holding
    push(100); push(null, 50); push(null, 50); push(100); // brief dropout (< debounce)
    push(170);                       // rep 2 counted (phase survived)
    push(null, 400);                 // long dropout — phase invalidated
    push(170);                       // up from nothing — NOT a rep
    push(105); push(105, 400);       // long down
    push(170);                       // rep 3

    const outJ = [], outT = [];
    for (const [angle, now] of stream) {
      outJ.push(j.push(angle, now));
      outT.push(t.push(angle, now));
    }
    expect(outJ).toEqual(outT);
    expect(j.reps).toBe(t.reps);
    expect(j.reps).toBe(3);
    expect(outJ.filter((o) => o === "counted").length).toBe(3);
  });

  test("angleAt + trackedAngle agree, incl. confidence floor + degenerate", () => {
    const a = { x: 0, y: 0 }, b = { x: 1, y: 0 }, c = { x: 1, y: 1 };
    expect(jsAngle(a, b, c)).toBeCloseTo(tsAngle(a, b, c), 12);
    expect(jsAngle(a, a, c)).toBe(180); // degenerate → 180 in both
    const kps = [
      { name: "l_hip", x: 0, y: 2, score: 0.9 },
      { name: "l_knee", x: 0, y: 1, score: 0.9 },
      { name: "l_ankle", x: 0, y: 0, score: 0.9 },
      { name: "r_hip", x: 3, y: 2, score: 0.1 },  // below floor
      { name: "r_knee", x: 3, y: 1, score: 0.9 },
      { name: "r_ankle", x: 3, y: 0, score: 0.9 },
    ];
    const sides = [["l_hip", "l_knee", "l_ankle"], ["r_hip", "r_knee", "r_ankle"]];
    expect(jsTracked(kps, sides)).toBeCloseTo(tsTracked(kps, sides), 12);
    expect(jsTracked([], sides)).toBeNull();
    expect(tsTracked(undefined, sides)).toBeNull();
  });
});
