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

  test("grantPowerUp defaults rarity + 24h expiry, honours overrides, and throws honestly", () => {
    let m = liveMatch(players);
    m = JS.grantPowerUp(m, "ben", "lightning", { at: 42 });
    m = JS.grantPowerUp(m, "ben", "shield", { at: 43, rarity: "legendary" });
    const inv = JS.inventoryOf(m, "ben");
    expect(inv[0]).toEqual({ kind: "lightning", rarity: "legendary", grantedAt: 42, expiresAt: 42 + JS.DAY_MS });
    expect(inv[1]).toEqual({ kind: "shield", rarity: "legendary", grantedAt: 43, expiresAt: 43 + JS.DAY_MS });
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

/* ── 11. POWER-UP SYSTEM v2 (FLOW-05b — points, draft, expiry, dual ────
   deadline). Like §10 these are figma-app-only (no game-core twin), but
   they run through the real JS engine lifecycle with exact numbers. */

describe("v2: points ledger", () => {
  const P = (points) => ({ id: "ben", name: "ben", tier: "fit", ...(points != null ? { points } : {}) });

  test("identities read as 500; add/remove tag reasons; balances chain", () => {
    expect(JS.STARTING_POINTS).toBe(500);
    expect(JS.pointsOf(P())).toBe(500); // pre-v2 identities default
    let p = P(500);
    p = JS.addPoints(p, 100, "daily_award", 1_000);
    p = JS.addPoints(p, 25, "photo_finish", 2_000);
    p = JS.removePoints(p, 50, "reroll", 3_000);
    expect(p.points).toBe(575);
    expect(JS.pointsLedger(p)).toEqual([
      { delta: 100, reason: "daily_award", at: 1_000, balance: 600 },
      { delta: 25, reason: "photo_finish", at: 2_000, balance: 625 },
      { delta: -50, reason: "reroll", at: 3_000, balance: 575 },
    ]);
    expect(JS.pointsLedger(P())).toEqual([]);
  });

  test("removePoints throws on insufficient + non-positive; addPoints on non-positive", () => {
    expect(() => JS.removePoints(P(499), 500, "reroll")).toThrow(/insufficient points: need 500, have 499/);
    expect(() => JS.removePoints(P(500), 0, "reroll")).toThrow(/must be positive/);
    expect(() => JS.addPoints(P(500), -5, "cheat")).toThrow(/must be positive/);
    // purity
    const before = JSON.stringify(P(500));
    JS.addPoints(P(500), 10, "x");
    expect(JSON.stringify(P(500))).toBe(before);
  });
});

describe("v2: draft-from-3 + reroll economy", () => {
  const players = [player("ben", "fit"), player("sam", "fit"), player("alex", "fit")];
  const v2 = (cfg = config(300)) => JS.startMatch(JS.createMatch(cfg, players), 500);
  /** deterministic rng (LCG) so draft odds tests are reproducible */
  const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const flat = () => ({ ...JS.BASE_DRAFT_ODDS });

  test("draft: 3 distinct face-up options stored on the match; guards throw", () => {
    let m = v2();
    const d = JS.draftOptions(m, "ben", { at: 1_000, rng: lcg(7) });
    expect(d.options).toHaveLength(3);
    expect(new Set(d.options).size).toBe(3);
    expect(d.state.drafts.ben.options).toEqual(d.options);
    expect(d.state.drafts.ben.openedAt).toBe(1_000);
    // every option is a real kind at its canonical rarity
    for (const k of d.options) expect(JS.POWER_UPS[k].kind).toBe(k);
    expect(() => JS.draftOptions(m, "nobody")).toThrow("player nobody not in match");
    expect(() => JS.draftOptions(JS.createMatch(config(), players), "ben")).toThrow("match is not live");
  });

  test("draftPick: validates the offer, grants with per-kind expiry, clears the draft", () => {
    let m = v2();
    m = JS.draftOptions(m, "ben", { at: 1_000, rng: lcg(7) }).state;
    const cheat = JS.draftPick(m, "ben", "lightning", { at: 1_100 });
    if (!m.drafts.ben.options.includes("lightning")) {
      expect(cheat.result.ok).toBe(false);
      expect(cheat.result.reason).toBe("card not offered in this draft");
    }
    const offered = m.drafts.ben.options[0];
    const pick = JS.draftPick(m, "ben", offered, { at: 1_200 });
    expect(pick.result.ok).toBe(true);
    expect(pick.result.kind).toBe(offered);
    expect(pick.result.expiresAt).toBe(1_200 + JS.POWER_UPS[offered].expiryMs);
    expect(JS.inventoryOf(pick.state, "ben")).toHaveLength(1);
    expect(JS.inventoryOf(pick.state, "ben")[0].kind).toBe(offered);
    expect(pick.state.drafts.ben).toBeUndefined(); // draft consumed
    // after the pick there is nothing left to pick
    const again = JS.draftPick(pick.state, "ben", offered);
    expect(again.result.ok).toBe(false);
    expect(again.result.reason).toBe("no draft pending");
  });

  test("reroll: costs escalate 50→100→200 (then hold), every coin to the kitty, options regenerate", () => {
    let m = v2(); // ben: points default 500
    m = JS.draftOptions(m, "ben", { at: 1_000, rng: lcg(11), curve: flat }).state;
    const r1 = JS.rerollDraft(m, "ben", { at: 1_100, rng: lcg(12), curve: flat });
    expect(r1.result.ok).toBe(true);
    expect(r1.result.cost).toBe(50);
    expect(r1.result.balance).toBe(450);
    expect(r1.result.options).toHaveLength(3);
    expect(JS.rerollCostFor(r1.state, "ben")).toBe(100);
    const r2 = JS.rerollDraft(r1.state, "ben", { at: 1_200, rng: lcg(13), curve: flat });
    expect(r2.result.cost).toBe(100);
    expect(r2.result.balance).toBe(350);
    const r3 = JS.rerollDraft(r2.state, "ben", { at: 1_300, rng: lcg(14), curve: flat });
    expect(r3.result.cost).toBe(200);
    expect(r3.result.balance).toBe(150);
    // kitty grew by exactly 50+100+200 and the draft is still pending
    expect(JS.kittyTotal(r3.state)).toBe(350);
    expect(r3.state.kitty.ledger.map((l) => l.reason)).toEqual(["reroll", "reroll", "reroll"]);
    expect(r3.state.rerollCount.ben).toBe(3);
    expect(r3.state.drafts.ben.options).toHaveLength(3);
    // ben's player entry carries the paid-down balance + reason-tagged ledger
    const ben = r3.state.players.find((p) => p.id === "ben");
    expect(ben.points).toBe(150);
    expect(JS.pointsLedger(ben).every((l) => l.reason === "reroll")).toBe(true);
    // 4th reroll holds at 200 — ben can't afford it → honest refusal
    const r4 = JS.rerollDraft(r3.state, "ben", { at: 1_400, rng: lcg(15), curve: flat });
    expect(r4.result.ok).toBe(false);
    expect(r4.result.reason).toContain("reroll costs 200 points (you have 150)");
    expect(r4.state).toBe(r3.state); // refused → state untouched
  });

  test("reroll: refuses with no pending draft; broke players reroll nothing", () => {
    const broke = [{ ...player("ben", "fit"), points: 25 }, player("sam", "fit")];
    let m = JS.startMatch(JS.createMatch(config(300), broke), 500);
    const none = JS.rerollDraft(m, "ben", { at: 1, rng: lcg(1), curve: flat });
    expect(none.result.ok).toBe(false);
    expect(none.result.reason).toBe("no draft pending");
    m = JS.draftOptions(m, "ben", { at: 2, rng: lcg(2), curve: flat }).state;
    const poor = JS.rerollDraft(m, "ben", { at: 3, rng: lcg(3), curve: flat });
    expect(poor.result.ok).toBe(false);
    expect(poor.result.reason).toContain("you have 25");
    expect(JS.kittyTotal(poor.state)).toBe(0);
  });

  test("catch-up curve: exact odds at behind 0 / 0.5 / 1, totals stay 1", () => {
    expect(JS.defaultCatchUpCurve(0)).toEqual(JS.BASE_DRAFT_ODDS);
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9]));
    const half = JS.defaultCatchUpCurve(0.5);
    expect(round(half)).toEqual({ common: 0.3, rare: 0.4, epic: 0.21, legendary: 0.09 });
    expect(Object.values(half).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const full = JS.defaultCatchUpCurve(1);
    expect(round(full)).toEqual({ common: 0.1, rare: 0.5, epic: 0.27, legendary: 0.13 });
    expect(Object.values(full).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // clamped inputs
    expect(JS.defaultCatchUpCurve(-3)).toEqual(JS.BASE_DRAFT_ODDS);
    expect(round(JS.defaultCatchUpCurve(9))).toEqual(round(full));
  });

  test("catch-up: statistical — players 100% behind draft meaningfully rarer (seeded rng, n=4000)", () => {
    const N = 4000;
    const score = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const mean = (odds, seed) => {
      const rng = lcg(seed);
      let sum = 0;
      for (let i = 0; i < N; i++) sum += score[JS.POWER_UPS[JS.randomKindByOdds(odds, rng)].rarity];
      return sum / N;
    };
    const base = mean(JS.BASE_DRAFT_ODDS, 42);          // theory ≈ 0.65
    const behind = mean(JS.defaultCatchUpCurve(1), 43); // theory ≈ 1.33
    expect(base).toBeGreaterThan(0.55);
    expect(base).toBeLessThan(0.75);
    expect(behind - base).toBeGreaterThan(0.4); // the whole point: trailing → better cards
    // and behind is comfortably above the base ceiling
    expect(behind).toBeGreaterThan(1.1);
  });

  test("draftOptions consumes the injected curve (curve is the whole odds seam)", () => {
    const m = v2();
    const d = JS.draftOptions(m, "ben", { at: 1, rng: lcg(99), curve: () => ({ common: 0, rare: 0, epic: 0.5, legendary: 0.5 }) });
    expect(d.options).toHaveLength(3);
    for (const k of d.options) expect(["epic", "legendary"]).toContain(JS.POWER_UPS[k].rarity);
  });

  test("rabbit's foot: consumed by the draft it boosts; guarantees Rare+", () => {
    let m = v2();
    m = JS.grantPowerUp(m, "ben", "rabbits_foot", { at: 1 });
    m = JS.activatePowerUp(m, "ben", "rabbits_foot", { at: 2 }).state;
    expect(m.lucky.ben).toBe(true);
    const d = JS.draftOptions(m, "ben", { at: 3, rng: lcg(5) });
    expect(d.state.drafts.ben.luck).toBe(true);
    expect(d.state.lucky.ben).toBeUndefined(); // the foot burned on this draft
    for (const k of d.options) expect(["rare", "epic", "legendary"]).toContain(JS.POWER_UPS[k].rarity);
    // the next draft is back on the curve
    const d2 = JS.draftOptions(d.state, "ben", { at: 4, rng: lcg(6) });
    expect(d2.state.drafts.ben.luck).toBe(false);
  });
});

describe("v2: expiry sweep", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];
  const v2 = () => JS.startMatch(JS.createMatch(config(300), players), 500);

  test("sweepExpired drops dead cards, keeps live ones, audits powerLog; pre-v2 cards never sweep", () => {
    let m = v2();
    m = JS.grantPowerUp(m, "ben", "shield", { at: 0 });            // 24h life
    m = JS.grantPowerUp(m, "sam", "sprint", { at: 0 });            // 6h life
    m = { ...m, inventory: { ...m.inventory, sam: [...m.inventory.sam, { kind: "steal", rarity: "epic", grantedAt: 0 }] } }; // pre-v2 shape: no expiresAt
    const early = JS.sweepExpired(m, 5 * 60 * 60 * 1000);          // t+5h: sprint still alive
    expect(early.expired).toEqual([]);
    expect(JS.inventoryOf(early.state, "sam")).toHaveLength(2);
    const late = JS.sweepExpired(m, 24 * 60 * 60 * 1000 + 1);      // t+24h+1ms: shield + sprint dead
    const kinds = late.expired.map((e) => e.kind).sort();
    expect(kinds).toEqual(["shield", "sprint"]);
    expect(JS.inventoryOf(late.state, "ben")).toHaveLength(0);
    expect(JS.inventoryOf(late.state, "sam")).toHaveLength(1);     // the pre-v2 card survives
    expect(late.state.inventory.sam[0].kind).toBe("steal");
    expect(late.state.powerLog.at(-1).event).toBe("sweep");
  });

  test("tier swaps revert both tiers when they lapse", () => {
    const mixed = [player("ben", "couch"), player("sam", "athlete")];
    let mm = JS.startMatch(JS.createMatch(config(300), mixed), 500);
    mm = JS.logReps(mm, entry("sam", "pushup", 100)).state;
    mm = JS.grantPowerUp(mm, "ben", "handicap_swap", { at: 1 });
    mm = JS.activatePowerUp(mm, "ben", "handicap_swap", { at: 2_000 }).state;
    expect(mm.players.find((p) => p.id === "ben").tier).toBe("athlete");
    expect(mm.players.find((p) => p.id === "sam").tier).toBe("couch");
    const live = JS.sweepExpired(mm, 2_000 + JS.HANDICAP_SWAP_MS - 1);
    expect(live.state.players.find((p) => p.id === "ben").tier).toBe("athlete"); // still swapped
    const after = JS.sweepExpired(mm, 2_000 + JS.HANDICAP_SWAP_MS + 1);
    expect(after.state.players.find((p) => p.id === "ben").tier).toBe("couch");  // reverted
    expect(after.state.players.find((p) => p.id === "sam").tier).toBe("athlete");
    expect(after.expired.some((e) => e.event === "tier_swap_reverted")).toBe(true);
    expect(after.state.tierSwaps).toHaveLength(0);
  });
});

describe("v2: dual deadline", () => {
  const players = [player("ben", "fit"), player("sam", "fit")];

  test("config.deadline {reps, time} sets the target + hard end; the REPS side still closes first-to-target", () => {
    const cfg = { ...config(999), deadline: { reps: 100, time: 10_000_000 } };
    const open = JS.createMatch(cfg, players);
    expect(open.config.targetReps).toBe(100);       // deadline.reps aliases the target
    expect(open.deadlineAt).toBe(10_000_000);       // deadline.time is the hard end
    expect(open.deadlineMode).toBe("hard");
    let m = JS.startMatch(open, 500);
    const r = JS.logReps(m, entry("ben", "pushup", 100, false, 6_000));
    expect(r.closedMatch).toBe(true);
    expect(r.state.status).toBe("complete");
    expect(r.state.closedBy).toBe("ben");
  });

  test("the TIME side: past the hard end the match freezes → winner by adjusted, no closure bonus, idempotent", () => {
    const cfg = { ...config(300), deadline: { reps: 300, time: 10_000 } };
    let m = JS.startMatch(JS.createMatch(cfg, players), 500);
    m = JS.logReps(m, entry("ben", "pushup", 120, false, 6_000)).state;
    m = JS.logReps(m, entry("sam", "pushup", 100, false, 6_500)).state;
    expect(m.status).toBe("live"); // nobody hit 300 — time is the only way this ends
    const before = JS.closeIfPastDeadline(m, 9_999);
    expect(before.closedMatch).toBe(false); // strictly past
    const closed = JS.closeIfPastDeadline(m, 10_000);
    expect(closed.closedMatch).toBe(true);
    expect(closed.state.status).toBe("complete");
    expect(closed.state.closedReason).toBe("time");
    expect(closed.state.completedAt).toBe(10_000);
    const w = JS.winner(closed.state);
    expect(w.playerId).toBe("ben"); // highest adjusted at the freeze
    expect(w.adjustedScore).toBe(120); // NO +15 closure bonus on a time close
    expect(w.closedMatch).toBe(false);
    // idempotent + no-op for non-live matches
    expect(JS.closeIfPastDeadline(closed.state, 20_000).closedMatch).toBe(false);
    expect(JS.closeIfPastDeadline(m, 5_000).closedMatch).toBe(false);
  });

  test("day-mode matches (no deadline.time) keep the roll convention", () => {
    const open = JS.createMatch(config(300), players, 5_000);
    expect(open.deadlineMode).toBe("day");
    expect(open.deadlineAt).toBe(5_000 + JS.DAY_MS);
  });
});

describe("v2: new cards — effects + counters", () => {
  const players = [player("ben", "fit"), player("sam", "fit"), player("alex", "fit")];
  const v2 = () => JS.startMatch(JS.createMatch(config(300), players), 500);
  const adj = (m, id) => JS.standings(m).find((r) => r.player.id === id).adjustedScore;

  test("second wind: comeback ×1.5 inside the window; a lapsed window leaves plain ×1.2", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // ben 100% behind → comeback armed
    m = JS.grantPowerUp(m, "ben", "second_wind", { at: 1 });
    m = JS.activatePowerUp(m, "ben", "second_wind", { at: 2_000 }).state;
    const e = JS.applyComeback(m, entry("ben", "pushup", 50, false, 3_000));
    expect(e.comeback).toBe(true);
    expect(e.secondWind).toBe(true);
    m = JS.logReps(m, e).state;
    expect(adj(m, "ben")).toBe(75); // 50 × 1.0 × 1.5
    // fresh match, window expired → plain comeback
    let m2 = v2();
    m2 = JS.logReps(m2, entry("sam", "pushup", 100)).state;
    m2 = JS.grantPowerUp(m2, "ben", "second_wind", { at: 1 });
    m2 = JS.activatePowerUp(m2, "ben", "second_wind", { at: 2_000 }).state;
    const late = JS.applyComeback(m2, entry("ben", "pushup", 50, false, 2_000 + JS.SECOND_WIND_MS + 1));
    expect(late.secondWind).toBeUndefined();
    expect(late.comeback).toBe(true);
  });

  test("anchor: blocks steals without breaking (thief keeps the card); the steal lands once it lapses", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads
    m = JS.grantPowerUp(m, "sam", "anchor", { at: 1 });
    m = JS.activatePowerUp(m, "sam", "anchor", { at: 2_000 }).state;
    expect(JS.anchorActive(m, "sam", 3_000)).toBe(true);
    expect(JS.stealPreview(m, "ben", 3_000).blocked).toBe(true);
    expect(JS.stealPreview(m, "ben", 3_000).blockedBy).toBe("anchor");
    m = JS.grantPowerUp(m, "ben", "steal", { at: 3 });
    const b1 = JS.activatePowerUp(m, "ben", "steal", { at: 4_000 });
    expect(b1.result.ok).toBe(true);
    expect(b1.result.blocked).toBe(true);
    expect(b1.result.by).toBe("anchor");
    expect(JS.inventoryOf(b1.state, "ben").map((i) => i.kind)).toEqual(["steal"]); // card kept
    expect(JS.anchorActive(b1.state, "sam", 4_001)).toBe(true); // the wall holds
    const b2 = JS.activatePowerUp(b1.state, "ben", "steal", { at: 5_000 });
    expect(b2.result.blocked).toBe(true); // still blocked the next attempt
    // after 24h the anchor lapses and the same steal lands
    const landed = JS.activatePowerUp(b2.state, "ben", "steal", { at: 2_000 + JS.ANCHOR_MS + 1 });
    expect(landed.result.blocked).toBeUndefined();
    expect(landed.result.stolen).toBe(10);
  });

  test("anchor: vetoes a rival freeze — card kept, deadline untouched", () => {
    let m = v2();
    m = JS.grantPowerUp(m, "ben", "anchor", { at: 1 });
    m = JS.activatePowerUp(m, "ben", "anchor", { at: 2_000 }).state;
    m = JS.grantPowerUp(m, "sam", "freeze", { at: 3 });
    const dl = m.deadlineAt;
    const f = JS.activatePowerUp(m, "sam", "freeze", { at: 4_000 });
    expect(f.result.ok).toBe(true);
    expect(f.result.blocked).toBe(true);
    expect(f.result.vetoedBy).toBe("ben");
    expect(f.state.deadlineAt).toBe(dl);                       // no extension
    expect(JS.inventoryOf(f.state, "sam").map((i) => i.kind)).toEqual(["freeze"]); // card kept
    // once the anchor lapses the same freeze goes through
    const later = JS.activatePowerUp(f.state, "sam", "freeze", { at: 2_000 + JS.ANCHOR_MS + 1 });
    expect(later.result.blocked).toBeUndefined();
    expect(later.state.deadlineAt).toBe(dl + JS.FREEZE_MS);
  });

  test("sprint: next 3 logs ×2, the 4th is normal, steal transfers never burn charges", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads (steal target)
    m = JS.grantPowerUp(m, "ben", "sprint", { at: 1 });
    m = JS.activatePowerUp(m, "ben", "sprint", { at: 2_000 }).state;
    expect(m.sprints.ben).toEqual({ remaining: 3 });
    m = JS.logReps(m, entry("ben", "pushup", 20, false, 3_000)).state;
    m = JS.logReps(m, entry("ben", "squat", 20, false, 4_000)).state;
    m = JS.logReps(m, entry("ben", "pushup", 20, false, 5_000)).state;
    expect(adj(m, "ben")).toBe(120); // 3 × (20 × 2)
    expect(m.sprints.ben.remaining).toBe(0);
    m = JS.logReps(m, entry("ben", "squat", 20, false, 6_000)).state;
    expect(adj(m, "ben")).toBe(140); // back to ×1
    // steal while a sprint is live: the transfer is NOT doubled, charges intact
    let m2 = v2();
    m2 = JS.logReps(m2, entry("sam", "pushup", 100)).state;
    m2 = JS.grantPowerUp(m2, "ben", "sprint", { at: 1 });
    m2 = JS.activatePowerUp(m2, "ben", "sprint", { at: 2_000 }).state;
    m2 = JS.grantPowerUp(m2, "ben", "steal", { at: 3 });
    m2 = JS.activatePowerUp(m2, "ben", "steal", { at: 3_000 }).state; // +10 raw, no sprint tag
    expect(m2.entries.filter((e) => e.steal).every((e) => !e.sprint)).toBe(true);
    expect(m2.sprints.ben.remaining).toBe(3);
    m2 = JS.logReps(m2, entry("ben", "pushup", 10, false, 4_000)).state;
    expect(adj(m2, "ben")).toBe(30); // 10 (steal ×1) + 10×2 (sprint)
  });

  test("sandbag detector: the leader's next 3 logs are flagged public, the 4th is private", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 10)).state; // sam leads
    m = JS.grantPowerUp(m, "ben", "sandbag_detector", { at: 1 });
    const act = JS.activatePowerUp(m, "ben", "sandbag_detector", { at: 2_000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.victimId).toBe("sam");
    m = act.state;
    expect(m.detectors).toEqual([{ ownerId: "ben", victimId: "sam", remaining: 3 }]);
    m = JS.logReps(m, entry("sam", "pushup", 10, false, 3_000)).state;
    m = JS.logReps(m, entry("sam", "pushup", 10, false, 4_000)).state;
    m = JS.logReps(m, entry("sam", "pushup", 10, false, 5_000)).state;
    expect(m.entries.filter((e) => e.revealed)).toHaveLength(3);
    m = JS.logReps(m, entry("sam", "pushup", 10, false, 6_000)).state;
    expect(m.entries.filter((e) => e.revealed)).toHaveLength(3); // still 3
    expect(m.detectors[0].remaining).toBe(0);
  });

  test("handicap swap: tiers swap with the leading rival, adjusted scores move, auto-reverts at expiry", () => {
    const mixed = [player("ben", "couch"), player("sam", "athlete")];
    let m = JS.startMatch(JS.createMatch(config(300), mixed), 500);
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam: 100 × 0.85 = 85
    m = JS.grantPowerUp(m, "ben", "handicap_swap", { at: 1 });
    const act = JS.activatePowerUp(m, "ben", "handicap_swap", { at: 2_000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.withId).toBe("sam");
    expect(act.result.yourNewTier).toBe("athlete");
    expect(act.result.theirNewTier).toBe("couch");
    m = act.state;
    // the ledger RE-SCORES: sam's existing 100 now at couch 1.5 = 150
    expect(adj(m, "sam")).toBe(150);
    expect(adj(m, "ben")).toBe(0);
    // ben logs at his new (worse) multiplier
    m = JS.logReps(m, entry("ben", "pushup", 100, false, 3_000)).state;
    expect(adj(m, "ben")).toBe(85); // 100 × 0.85
    // expiry reverts the multipliers (sweep is the revert seam)
    const after = JS.sweepExpired(m, 2_000 + JS.HANDICAP_SWAP_MS + 1).state;
    expect(adj(after, "sam")).toBe(85); // back at athlete
    expect(adj(after, "ben")).toBe(150); // couch takes over ben's ledger too
  });

  test("handicap swap: an anchored target bounces it (card kept)", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads
    m = JS.grantPowerUp(m, "sam", "anchor", { at: 1 });
    m = JS.activatePowerUp(m, "sam", "anchor", { at: 2_000 }).state;
    m = JS.grantPowerUp(m, "ben", "handicap_swap", { at: 3 });
    const act = JS.activatePowerUp(m, "ben", "handicap_swap", { at: 4_000 });
    expect(act.result.ok).toBe(false);
    expect(act.result.reason).toContain("anchored");
    expect(JS.inventoryOf(act.state, "ben").map((i) => i.kind)).toEqual(["handicap_swap"]);
    expect(act.state.tierSwaps ?? []).toHaveLength(0);
  });

  test("pit crew: consumed only for armed players with zero logs that day", () => {
    let m = v2();
    m = JS.grantPowerUp(m, "ben", "pit_crew", { at: 1 });
    m = JS.grantPowerUp(m, "sam", "pit_crew", { at: 1 });
    m = JS.activatePowerUp(m, "ben", "pit_crew", { at: 2 }).state;
    m = JS.activatePowerUp(m, "sam", "pit_crew", { at: 3 }).state;
    m = JS.logReps(m, entry("ben", "pushup", 10)).state; // ben logged today
    const r = JS.applyPitCrew(m, { loggedPlayerIds: ["ben"], at: 5_000 });
    expect(r.saved).toEqual(["sam"]); // sam's 0-rep day saved, ben keeps his armed
    expect(r.state.pitCrews).toEqual({ ben: true });
    expect(r.state.powerLog.some((p) => p.kind === "pit_crew" && p.event === "streak_saved" && p.playerId === "sam")).toBe(true);
  });

  test("photo finish: +25 on a <5% win (time-closed, no bonus in the margin); nothing on a blowout or a loss", () => {
    // tight win: ben 210 vs sam 200 → margin (210-200)/210 = 4.76%
    let m = JS.startMatch(JS.createMatch({ ...config(300), deadline: { reps: 300, time: 10_000 } }, players), 500);
    m = JS.logReps(m, entry("ben", "pushup", 210, false, 6_000)).state;
    m = JS.logReps(m, entry("sam", "pushup", 200, false, 6_500)).state;
    m = JS.grantPowerUp(m, "ben", "photo_finish", { at: 7_000 });
    m = JS.closeIfPastDeadline(m, 10_000).state;
    const paid = JS.settlePhotoFinish(m, { at: 10_001 });
    expect(paid.awarded).toBe(25);
    expect(paid.playerId).toBe("ben");
    expect(paid.state.players.find((p) => p.id === "ben").points).toBe(525);
    expect(JS.pointsLedger(paid.state.players.find((p) => p.id === "ben")).at(-1).reason).toBe("photo_finish");
    expect(JS.inventoryOf(paid.state, "ben")).toHaveLength(0); // card consumed
    // blowout: 210 vs 50 → no payout, card kept
    let m2 = JS.startMatch(JS.createMatch({ ...config(300), deadline: { reps: 300, time: 10_000 } }, players), 500);
    m2 = JS.logReps(m2, entry("ben", "pushup", 210, false, 6_000)).state;
    m2 = JS.logReps(m2, entry("sam", "pushup", 50, false, 6_500)).state;
    m2 = JS.grantPowerUp(m2, "ben", "photo_finish", { at: 7_000 });
    m2 = JS.closeIfPastDeadline(m2, 10_000).state;
    expect(JS.settlePhotoFinish(m2, { at: 10_001 }).awarded).toBe(0);
    // loser holding the card: nothing
    let m3 = JS.startMatch(JS.createMatch({ ...config(300), deadline: { reps: 300, time: 10_000 } }, players), 500);
    m3 = JS.logReps(m3, entry("sam", "pushup", 200, false, 6_500)).state;
    m3 = JS.grantPowerUp(m3, "ben", "photo_finish", { at: 7_000 });
    m3 = JS.closeIfPastDeadline(m3, 10_000).state;
    expect(JS.settlePhotoFinish(m3, { at: 10_001 }).awarded).toBe(0);
  });

  test("double down: pays 50 to the kitty, next log ×3 then normal; refused when broke", () => {
    let m = v2(); // ben 500 pts
    m = JS.grantPowerUp(m, "ben", "double_down", { at: 1 });
    const act = JS.activatePowerUp(m, "ben", "double_down", { at: 2_000 });
    expect(act.result.ok).toBe(true);
    expect(act.result.paid).toBe(50);
    expect(act.result.balance).toBe(450);
    expect(JS.kittyTotal(act.state)).toBe(50);
    expect(act.state.kitty.ledger[0].reason).toBe("double_down");
    m = act.state;
    m = JS.logReps(m, entry("ben", "pushup", 20, false, 3_000)).state;
    expect(adj(m, "ben")).toBe(60); // ×3
    m = JS.logReps(m, entry("ben", "pushup", 20, false, 4_000)).state;
    expect(adj(m, "ben")).toBe(80); // ×1
    // broke refusal: 30 points < 50 fee
    const broke = [{ ...player("ben", "fit"), points: 30 }, player("sam", "fit")];
    let mb = JS.startMatch(JS.createMatch(config(300), broke), 500);
    mb = JS.grantPowerUp(mb, "ben", "double_down", { at: 1 });
    const r = JS.activatePowerUp(mb, "ben", "double_down", { at: 2_000 });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toContain("you have 30");
    expect(JS.kittyTotal(r.state)).toBe(0);
  });

  test("wildcard: refuses while nothing has been played against you; copies the steal after one lands", () => {
    let m = v2();
    m = JS.logReps(m, entry("sam", "pushup", 100)).state; // sam leads
    m = JS.grantPowerUp(m, "ben", "wildcard", { at: 1 });
    const early = JS.activatePowerUp(m, "ben", "wildcard", { at: 2_000 });
    expect(early.result.ok).toBe(false);
    expect(early.result.reason).toBe("nothing has been played against you yet");
    m = JS.logReps(m, entry("ben", "squat", 150)).state; // ben 150 > sam 100 → ben leads
    m = JS.grantPowerUp(m, "alex", "steal", { at: 3 });
    m = JS.activatePowerUp(m, "alex", "steal", { at: 4_000 }).state; // steals 15 from ben
    expect(m.lastAgainst.ben).toBe("steal");
    const copy = JS.activatePowerUp(m, "ben", "wildcard", { at: 5_000 });
    expect(copy.result.ok).toBe(true);
    expect(copy.result.copied).toBe("steal");
    expect(copy.result.copiedName).toBe("Rep Steal");
    expect(JS.inventoryOf(copy.state, "ben").map((i) => i.kind)).toEqual(["steal"]); // wildcard became one
    // and it's a REAL steal card — ben can fire it (leading rival sam has 100 raw → floor(10) = 10)
    const fire = JS.activatePowerUp(copy.state, "ben", "steal", { at: 6_000 });
    expect(fire.result.ok).toBe(true);
    expect(fire.result.stolen).toBe(10);
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
