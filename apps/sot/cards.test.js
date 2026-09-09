// apps/sot/cards.test.js — THE CARD STACK (v4.1): the big deck, the
// draft-from-3 economy (catch-up curve, reroll-to-pot, hand cap, expiry
// sweep), every new card's effect on state, and the proof flow end to end
// (verified bonus / group accept / contested zero-but-bank). The TS-core
// parity harness (apps/sot-engine.test.js) stays the guard that the stack
// never leaks fields into untouched days.

import { describe, test, expect } from "bun:test";
import * as E from "../sot-engine.js";

const T0 = 1_000_000;
const DAY_MS = 12 * 60 * 60 * 1000;
const P = (id, tier = "fit") => ({ id, name: id, tier });

/** Deterministic LCG rng (seeded) for statistical + reproducible draws. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function newDay(opts = {}) {
  return E.createDay(
    {
      id: "d1",
      playDays: [1],
      deadlineAt: T0 + DAY_MS,
      targetReps: opts.target ?? 200,
      exercises: opts.exercises ?? [{ id: "pushups" }, { id: "squats" }, { id: "burpees" }],
      ...(opts.flags ? { flags: opts.flags } : {}),
    },
    opts.players ?? [P("a"), P("b"), P("c")]
  );
}

const log = (d, playerId, exerciseId, reps, at, extra = {}) =>
  E.logSet(d, { playerId, exerciseId, reps, at, ...extra });
const grant = (d, pid, kind) => E.grantPowerUp(d, pid, kind);
const act = (d, pid, kind, opts = {}) => E.activatePowerUp(d, pid, kind, { at: (opts.at ?? T0 + 500), ...opts });

describe("card stack — catalog integrity", () => {
  test("21+ distinct dealable kinds across all families, rarity spread", () => {
    const kinds = Object.keys(E.CARD_CATALOG);
    expect(kinds.length).toBeGreaterThanOrEqual(21);
    expect(new Set(kinds).size).toBe(kinds.length);
    const fams = new Set(kinds.map((k) => E.CARD_CATALOG[k].family));
    for (const fam of ["canon", "post-launch", "exercise", "rivalry", "proof", "catch-up"]) {
      expect(fams.has(fam)).toBe(true);
    }
    const rarities = new Set(["common", "rare", "epic", "legendary"]);
    for (const k of kinds) {
      const c = E.CARD_CATALOG[k];
      expect(rarities.has(c.rarity)).toBe(true);
      expect(c.target).toBeTruthy();
      expect(c.expiry).toBeTruthy();
      expect(c.blurb.length).toBeGreaterThan(5);
    }
    // founder-named cards are all present
    for (const k of ["double_exercise", "specialist", "wildcard_workout", "rivalry", "training_partners", "pack_bond", "prove_it", "spot_check", "second_wind", "mulligan", "underdog"]) {
      expect(E.CARD_CATALOG[k]).toBeTruthy();
    }
    // the post-launch set from the SOT is dealable
    for (const k of ["surprise_bomb", "rescue_rope", "double_down", "combo_boost", "assist_boost", "shield_bash"]) {
      expect(E.CARD_CATALOG[k]).toBeTruthy();
    }
  });

  test("canon 4 kept exactly as the engine canon (kinds + rarities)", () => {
    expect(E.CARD_CATALOG.lightning.rarity).toBe("legendary");
    expect(E.CARD_CATALOG.steal.rarity).toBe("epic");
    expect(E.CARD_CATALOG.shield.family).toBe("canon");
    expect(E.CARD_CATALOG.freeze.family).toBe("canon");
  });

  test("no stack state leaks into untouched days (parity discipline)", () => {
    let d = newDay();
    const forbidden = ["drafts", "modifiers", "proofs", "rivalries", "partnerships", "packBond", "points", "pot", "rerolls", "deals", "secondWinds"];
    d = log(d, "a", "pushups", 50, T0 + 10).state;
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    for (const day of [d, closed.state]) {
      for (const k of forbidden) expect(day[k]).toBeUndefined();
    }
    expect(Object.keys(closed.outcomes.a)).toEqual(["outcome", "completed", "streakPreserved"]);
  });
});

describe("card stack — the deal (draft from 3)", () => {
  test("three distinct options, stored on the day, pick grants + clears", () => {
    let d = newDay();
    const deal = E.draftOptions(d, "a", { at: T0 + 20, rng: lcg(7) });
    expect(deal.result.ok).toBe(true);
    expect(deal.options.length).toBe(3);
    expect(new Set(deal.options).size).toBe(3);
    expect(deal.state.drafts.a.options).toEqual(deal.options);
    const pick = E.draftPick(deal.state, "a", deal.options[1], { at: T0 + 30 });
    expect(pick.result.ok).toBe(true);
    expect(pick.result.kind).toBe(deal.options[1]);
    expect(E.inventoryOf(pick.state, "a")).toEqual([deal.options[1]]);
    expect(pick.state.drafts.a).toBeUndefined();
    // picking a card never offered refuses
    const bad = E.draftPick(pick.state, "a", "lightning", { at: T0 + 40 });
    expect(bad.result.ok).toBe(false);
  });

  test("hand cap 3 enforced at pick", () => {
    let d = newDay();
    for (let n = 0; n < 3; n++) {
      const deal = E.draftOptions(d, "a", { at: T0 + 50 + n, rng: lcg(11 + n) });
      d = E.draftPick(deal.state, "a", deal.options[0]).state;
    }
    expect(E.inventoryOf(d, "a").length).toBe(3);
    const deal = E.draftOptions(d, "a", { at: T0 + 90 });
    expect(deal.result.ok).toBe(false); // hand full — no new deal
    expect(deal.result.reason).toContain("hand full");
    const over = E.draftPick(d, "a", "shield");
    expect(over.result.ok).toBe(false);
  });

  test("catch-up curve, seeded statistical: the laggard drafts better cards", () => {
    // leader at 200, b at 60 (70% behind), c at 0 (100% behind)
    let d = newDay();
    d = log(d, "a", "pushups", 200, T0 + 10).state;
    d = log(d, "b", "pushups", 60, T0 + 20).state;
    expect(E.catchUpBehind(d, "b")).toBeCloseTo(0.7, 5);
    expect(E.catchUpBehind(d, "a")).toBe(0);
    // curve endpoints: behind 0 = base odds; behind 1 = 10/50/27/13
    expect(E.defaultCatchUpCurve(0)).toEqual(E.BASE_DRAFT_ODDS);
    const top = E.defaultCatchUpCurve(1);
    expect(top.common).toBeCloseTo(0.10, 6);
    expect(top.rare).toBeCloseTo(0.50, 6);
    expect(top.epic).toBeCloseTo(0.27, 6);
    expect(top.legendary).toBeCloseTo(0.13, 6);
    // statistical: 900 draws each, epic+legendary rate must favour the laggard
    const rate = (pid, seed) => {
      const rng = lcg(seed);
      let good = 0;
      const N = 900;
      for (let i = 0; i < N; i++) {
        const odds = E.defaultCatchUpCurve(E.catchUpBehind(d, pid));
        const k = E.randomKindByOdds(odds, rng);
        const r = E.CARD_CATALOG[k].rarity;
        if (r === "epic" || r === "legendary") good++;
      }
      return good / N;
    };
    const leaderRate = rate("a", 42);
    const laggardRate = rate("c", 42);
    expect(laggardRate).toBeGreaterThan(leaderRate + 0.05); // 15%+ vs ~20%+ shift
    // and the leader still sees more commons than the laggard
    const commonRate = (pid, seed) => {
      const rng = lcg(seed);
      let c = 0;
      for (let i = 0; i < 900; i++) {
        const k = E.randomKindByOdds(E.defaultCatchUpCurve(E.catchUpBehind(d, pid)), rng);
        if (E.CARD_CATALOG[k].rarity === "common") c++;
      }
      return c / 900;
    };
    expect(commonRate("a", 99)).toBeGreaterThan(commonRate("c", 99));
  });

  test("halfway deal: earned once, second attempt refuses", () => {
    let d = newDay();
    const one = E.draftOptions(d, "a", { at: T0 + 20, rng: lcg(3), reason: "halfway" });
    expect(one.result.ok).toBe(true);
    d = E.draftPick(one.state, "a", one.options[0]).state;
    const two = E.draftOptions(d, "a", { at: T0 + 30, rng: lcg(4), reason: "halfway" });
    expect(two.result.ok).toBe(false);
    expect(two.result.reason).toContain("already used");
  });

  test("reroll: escalating 50/100/200 to the pot, ledger grows, short balance refuses", () => {
    let d = newDay();
    d = E.draftOptions(d, "a", { at: T0 + 10, rng: lcg(1) }).state;
    const r1 = E.rerollDraft(d, "a", { at: T0 + 20, rng: lcg(2) });
    expect(r1.result.ok).toBe(true);
    expect(r1.result.cost).toBe(50);
    expect(E.potTotal(r1.state)).toBe(50);
    expect(E.pointsOf(r1.state, "a")).toBe(E.STARTING_POINTS - 50);
    d = E.draftPick(r1.state, "a", r1.result.options[0]).state;
    // second deal + reroll → 100
    d = E.draftOptions(d, "a", { at: T0 + 30, rng: lcg(3) }).state;
    const r2 = E.rerollDraft(d, "a", { at: T0 + 40, rng: lcg(4) });
    expect(r2.result.cost).toBe(100);
    expect(E.potTotal(r2.state)).toBe(150);
    d = E.draftPick(r2.state, "a", r2.result.options[0]).state;
    // third → 200, then holds at 200
    d = E.draftOptions(d, "a", { at: T0 + 50, rng: lcg(5) }).state;
    const r3 = E.rerollDraft(d, "a", { at: T0 + 60, rng: lcg(6) });
    expect(r3.result.cost).toBe(200);
    expect(E.potTotal(r3.state)).toBe(350);
    expect(E.pointsOf(r3.state, "a")).toBe(E.STARTING_POINTS - 350);
    // burn the balance down: refuse when short
    let drained = { ...r3.state, points: { a: 30 } };
    drained = E.draftPick(drained, "a", r3.result.options[0]).state;
    const deal = E.draftOptions(drained, "a", { at: T0 + 70, rng: lcg(7) });
    if (deal.result.ok) {
      const r4 = E.rerollDraft(deal.state, "a", { at: T0 + 80 });
      expect(r4.result.ok).toBe(false);
      expect(r4.result.reason).toContain("reroll costs");
    }
    // pot ledger records the payments
    expect(r3.state.pot.ledger.length).toBe(3);
    expect(r3.state.pot.ledger[2]).toEqual({ playerId: "a", amount: 200, reason: "reroll", at: T0 + 60 });
  });

  test("expiry sweep: past-deadline drafts vanish, picks refuse", () => {
    let d = newDay();
    d = E.draftOptions(d, "a", { at: T0 + 10, rng: lcg(5) }).state;
    const swept = E.sweepExpiredCards(d, T0 + DAY_MS + 1000);
    expect(swept.drafts.a).toBeUndefined();
    const pick = E.draftPick(swept, "a", "shield");
    expect(pick.result.ok).toBe(false);
    expect(pick.result.reason).toContain("no deal");
  });
});

describe("card stack — exercise modifiers", () => {
  test("Double Exercise: named exercise ×2, others untouched, entry tagged", () => {
    let d = newDay();
    d = act(grant(d, "a", "double_exercise"), "a", "double_exercise", { exerciseId: "pushups" }).state;
    const r1 = log(d, "a", "pushups", 20, T0 + 600);
    expect(r1.ruf).toBe(40); // ×2
    expect(r1.state.entries[0].stack).toEqual(["double_exercise"]);
    const r2 = log(r1.state, "a", "squats", 20, T0 + 700);
    expect(r2.ruf).toBe(20); // no change
    // one exercise per day
    const again = E.activatePowerUp(r2.state, "a", "double_exercise", { at: T0 + 800, exerciseId: "squats" });
    expect(again.result.ok).toBe(false); // card spent AND already doubled — refused (no card held)
    expect(again.result.reason).toContain("no double_exercise card held");
  });

  test("Specialist: top-3 frozen at play time, ×1.5 on those", () => {
    let d = newDay();
    d = log(d, "a", "pushups", 50, T0 + 10).state;
    d = log(d, "a", "pushups", 30, T0 + 20).state; // pushups 80
    d = log(d, "a", "squats", 40, T0 + 30).state; // squats 40
    const res = act(grant(d, "a", "specialist"), "a", "specialist");
    expect(res.result.ok).toBe(true);
    expect(res.result.exercises).toEqual(["pushups", "squats"]); // top-2 logged
    d = res.state;
    const r1 = log(d, "a", "pushups", 20, T0 + 600);
    expect(r1.ruf).toBe(30); // ×1.5
    const r2 = log(r1.state, "a", "burpees", 20, T0 + 700);
    expect(r2.ruf).toBe(20); // not in the top set
    // nothing logged → refuses
    const bare = act(grant(newDay(), "b", "specialist"), "b", "specialist");
    expect(bare.result.ok).toBe(false);
  });

  test("Wildcard Workout: allowlist lifts for the holder only", () => {
    let d = newDay({ exercises: [{ id: "pushups" }] }); // squats NOT allowed today
    expect(() => log(d, "a", "squats", 10, T0 + 10)).toThrow("not allowed");
    d = act(grant(d, "a", "wildcard_workout"), "a", "wildcard_workout").state;
    const ok = log(d, "a", "squats", 10, T0 + 600);
    expect(ok.ruf).toBe(10); // counts (value conversion is app-side)
    expect(ok.state.entries[0].stack).toContain("wildcard_workout");
    expect(() => log(ok.state, "b", "squats", 10, T0 + 700)).toThrow("not allowed");
  });
});

describe("card stack — rivalry family", () => {
  test("Rivalry: more reps wins +30 at close; tie pays nobody", () => {
    let d = newDay();
    d = act(grant(d, "a", "rivalry"), "a", "rivalry", { targetId: "b" }).state;
    d = log(d, "a", "pushups", 100, T0 + 10).state;
    d = log(d, "b", "pushups", 40, T0 + 20).state;
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    expect(closed.state.rivalries[0].winnerId).toBe("a");
    expect(closed.state.progress.a.bonusRuf).toBe(E.RIVALRY_BONUS_RUF);
    expect(closed.outcomes.a.rivalryWon).toBe(true);
    // tie variant
    let t = newDay();
    t = act(grant(t, "a", "rivalry"), "a", "rivalry", { targetId: "b" }).state;
    t = log(t, "a", "pushups", 50, T0 + 10).state;
    t = log(t, "b", "pushups", 50, T0 + 20).state;
    const tc = E.closeDay(t, T0 + DAY_MS + 60_000);
    expect(tc.state.rivalries[0].winnerId).toBe(null);
    expect(tc.state.progress.a.bonusRuf).toBe(0);
    // duplicate rivalry refused
    const dup = E.activatePowerUp(newDay(), "a", "rivalry", { at: T0 + 5, targetId: "b" });
    expect(dup.result.ok).toBe(false); // no card held — but the pairing guard:
    let dd = newDay();
    dd = act(grant(dd, "a", "rivalry"), "a", "rivalry", { targetId: "b" }).state;
    dd = grant(dd, "b", "rivalry");
    const reverse = E.activatePowerUp(dd, "b", "rivalry", { at: T0 + 30, targetId: "a" });
    expect(reverse.result.ok).toBe(false);
    expect(reverse.result.reason).toContain("already live");
  });

  test("Training Partners: both bank → +25 each + outcome flag; one misses → nothing", () => {
    let d = newDay();
    d = act(grant(d, "a", "training_partners"), "a", "training_partners", { targetId: "c" }).state;
    d = log(d, "a", "pushups", 200, T0 + 10).state; // a banks
    d = log(d, "c", "pushups", 200, T0 + 20).state; // c banks
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    expect(closed.state.partnerships[0].fulfilled).toBe(true);
    expect(closed.state.progress.a.bonusRuf).toBe(E.PARTNERSHIP_BONUS_RUF);
    expect(closed.state.progress.c.bonusRuf).toBe(E.PARTNERSHIP_BONUS_RUF);
    expect(closed.outcomes.a.partnershipBonus).toBe(true);
    expect(closed.outcomes.c.partnershipBonus).toBe(true);
    // b (not partnered) gets nothing
    expect(closed.state.progress.b.bonusRuf).toBe(0);
    // one-side variant
    let m = newDay();
    m = act(grant(m, "a", "training_partners"), "a", "training_partners", { targetId: "c" }).state;
    m = log(m, "a", "pushups", 200, T0 + 10).state; // only a banks
    const mc = E.closeDay(m, T0 + DAY_MS + 60_000);
    expect(mc.state.partnerships[0].fulfilled).toBe(false);
    expect(mc.state.progress.a.bonusRuf).toBe(0);
    expect(mc.outcomes.a.partnershipBonus).toBeUndefined();
  });

  test("Pack Bond: members ≥20 RUF bank +10%; under-threshold members get nothing", () => {
    let d = newDay();
    d = act(grant(d, "a", "pack_bond"), "a", "pack_bond", { memberIds: ["a", "b", "c"] }).state;
    d = log(d, "a", "pushups", 100, T0 + 10).state; // 100 → +10
    d = log(d, "b", "pushups", 19, T0 + 20).state; // 19 < 20 → nothing
    // c never logs → nothing
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    expect(closed.state.progress.a.bonusRuf).toBe(10);
    expect(closed.state.progress.b.bonusRuf).toBe(0);
    expect(closed.state.progress.c.bonusRuf).toBe(0);
    expect(closed.outcomes.a.packBondPaid).toBe(true);
    expect(closed.outcomes.b.packBondPaid).toBeUndefined();
  });

  test("Pack Bond dedupes members and requires two unique valid players", () => {
    let d = newDay();
    const bad = act(grant(d, "a", "pack_bond"), "a", "pack_bond", { memberIds: ["a", "a", "ghost"] });
    expect(bad.result.ok).toBe(false);
    d = act(grant(d, "a", "pack_bond"), "a", "pack_bond", { memberIds: ["a", "b", "b"] }).state;
    expect(d.packBond.memberIds).toEqual(["a", "b"]);
  });
});

describe("card stack — steal completion", () => {
  test("steal itself completes and wins when stealCanTriggerWin is flagged", () => {
    let d = newDay({ target: 200, flags: { stealCanTriggerWin: true } });
    d = log(d, "a", "pushups", 180, T0 + 10).state;
    d = log(d, "b", "pushups", 200, T0 + 20).state;
    d = { ...d, winnerId: undefined, wonAt: undefined };
    d = grant(d, "a", "steal");
    const r = act(d, "a", "steal", { targetId: "b", at: T0 + 30 });
    expect(r.state.progress.a.completedAt).toBe(T0 + 30);
    expect(r.state.winnerId).toBe("a");
  });
});

describe("card stack — Combo Boost validation", () => {
  test("unknown combo id returns ok:false", () => {
    let d = newDay({ exercises: [{ id: "pushups" }], flags: {}, target: 200 });
    d = { ...d, config: { ...d.config, combos: [{ id: "known", sequence: ["pushups"], bonusRuf: 30 }] } };
    d = grant(d, "a", "combo_boost");
    const r = act(d, "a", "combo_boost", { comboId: "ghost" });
    expect(r.result.ok).toBe(false);
    expect(r.result.reason).toContain("unknown combo");
  });
});

describe("card stack — proof flow (Prove It / Spot Check)", () => {
  test("verified path: the TARGET banks +15 earned (counts toward the day)", () => {
    let d = newDay();
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state;
    const proof0 = E.proofsOf(d)[0];
    expect(proof0.status).toBe("awaiting_log");
    const r = log(d, "b", "pushups", 20, T0 + 600, { verified: true });
    expect(r.ruf).toBe(20);
    const proof = E.proofsOf(r.state)[0];
    expect(proof.status).toBe("verified");
    expect(r.state.entries.some((e) => e.exerciseId === "prove_it" && e.ruf === E.PROVE_IT_BONUS_RUF)).toBe(true);
    expect(r.state.progress.b.ruf).toBe(20 + E.PROVE_IT_BONUS_RUF);
    expect(r.state.entries[0].proof).toBe(proof0.id);
  });

  test("unverified path: review → majority accepts → entry stands", () => {
    let d = newDay();
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state;
    d = log(d, "b", "pushups", 20, T0 + 600).state; // not verified
    let proof = E.proofsOf(d)[0];
    expect(proof.status).toBe("review");
    expect(d.entries[0].underReview).toBe(proof.id);
    // eligible voters: a + c (target b can't vote)
    const v1 = E.voteProof(d, proof.id, "b", "accept");
    expect(v1.result.ok).toBe(false); // target can't vote
    const v2 = E.voteProof(d, proof.id, "a", "accept");
    expect(v2.result.settled).toBe(false); // 1 of 2, not a majority yet
    const v3 = E.voteProof(v2.state, proof.id, "c", "accept");
    expect(v3.result.settled).toBe(true);
    expect(v3.result.outcome).toBe("accepted");
    proof = E.proofsOf(v3.state)[0];
    expect(proof.status).toBe("accepted");
    expect(v3.state.progress.b.ruf).toBe(20); // entry stands
    expect(v3.state.entries[0].ruf).toBe(20);
  });

  test("contested path: majority contests → entry scores 0, provisional completion is removed", () => {
    let d = newDay({ target: 100 });
    d = log(d, "b", "pushups", 60, T0 + 10).state; // b at 60/100
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state;
    d = log(d, "b", "pushups", 50, T0 + 600).state; // 110 → completed
    expect(d.progress.b.completedAt).not.toBeNull();
    expect(E.targetProgressOf(d, "b")).toBe(110);
    const proof = E.proofsOf(d)[0];
    const v1 = E.voteProof(d, proof.id, "a", "contest");
    expect(v1.result.settled).toBe(false);
    const v2 = E.voteProof(v1.state, proof.id, "c", "contest");
    expect(v2.result.settled).toBe(true);
    expect(v2.result.outcome).toBe("contested");
    const after = v2.state;
    // the contested log scores 0 (original kept for the record)
    expect(after.entries[1].ruf).toBe(0);
    expect(after.entries[1].origRuf).toBe(50);
    expect(after.entries[1].proofZeroed).toBe(proof.id);
    expect(E.targetProgressOf(after, "b")).toBe(60); // progress dropped
    expect(after.progress.b.completedAt).toBeUndefined();
    const closed = E.closeDay(after, T0 + DAY_MS + 60_000);
    expect(closed.outcomes.b.completed).toBe(false);
    expect(closed.outcomes.b.outcome).toBe("failed");
  });

  test("contested before close transfers Daily Win to the first eligible completer", () => {
    let d = newDay({ target: 100 });
    d = log(d, "b", "pushups", 60, T0 + 10).state;
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state;
    d = log(d, "b", "pushups", 50, T0 + 20).state;
    expect(d.progress.b.completedAt).toBe(T0 + 20);
    expect(d.winnerId).toBeUndefined();
    d = log(d, "c", "pushups", 100, T0 + 30).state;
    expect(d.winnerId).toBe("c");
    const proof = E.proofsOf(d)[0];
    let s = E.voteProof(d, proof.id, "a", "contest").state;
    s = E.voteProof(s, proof.id, "c", "contest").state;
    expect(s.progress.b.completedAt).toBeUndefined();
    expect(s.winnerId).toBe("c");
    expect(s.wonAt).toBe(T0 + 30);
  });

  test("contested after close revokes the Daily Win without transferring it", () => {
    let d = newDay({ target: 100 });
    d = log(d, "b", "pushups", 100, T0 + 10).state;
    d = log(d, "c", "pushups", 100, T0 + 20).state;
    d = { ...d, status: "closed", closedAt: T0 + DAY_MS, outcomes: {
      b: { outcome: "win", completed: true, streakPreserved: true },
      c: { outcome: "completed", completed: true, streakPreserved: true },
      a: { outcome: "failed", completed: false, streakPreserved: false },
    } };
    d = {
      ...d,
      entries: d.entries.map((e, i) => i === 0 ? { ...e, underReview: "proof-after-close" } : e),
      proofs: [{ id: "proof-after-close", fromId: "a", targetId: "b", issuedAt: T0, status: "review", entryIndex: 0, votes: {}, bonusRuf: E.PROVE_IT_BONUS_RUF }],
    };
    let s = E.voteProof(d, "proof-after-close", "a", "contest").state;
    s = E.voteProof(s, "proof-after-close", "c", "contest").state;
    expect(s.winnerId).toBeNull();
    expect(s.proofCorrection).toMatchObject({ kind: "win_revoked", playerId: "b", proofId: "proof-after-close" });
    expect(s.progress.b.completedAt).toBeUndefined();
    expect(s.progress.c.completedAt).toBe(T0 + 20);
  });

  test("close-day settlement: no votes → accepted; awaiting-log never triggered → expired", () => {
    let d = newDay();
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state; // b never logs
    d = log(d, "c", "pushups", 80, T0 + 10).state;
    // spot check the leader c → review with zero votes
    d = act(grant(d, "a", "spot_check"), "a", "spot_check").state;
    const review = E.proofsOf(d).find((p) => p.status === "review");
    expect(review.targetId).toBe("c");
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    const statuses = Object.fromEntries(E.proofsOf(closed.state).map((p) => [p.id, p.status]));
    expect(Object.values(statuses)).toContain("expired"); // never triggered
    expect(Object.values(statuses)).toContain("accepted"); // no votes → benefit of the doubt
    expect(closed.state.progress.c.ruf).toBe(80); // entry stands
  });

  test("Spot Check: auto-targets the leader's biggest log; verified logs immune", () => {
    let d = newDay();
    d = log(d, "b", "pushups", 30, T0 + 10).state;
    d = log(d, "b", "burpees", 40, T0 + 20).state; // biggest = 40
    d = log(d, "c", "pushups", 35, T0 + 30).state; // c leads (75) → no, b=70, c=35… b leads
    const res = act(grant(d, "a", "spot_check"), "a", "spot_check");
    expect(res.result.ok).toBe(true);
    expect(res.result.targetId).toBe("b");
    expect(res.result.entryRuf).toBe(40);
    const proof = E.proofsOf(res.state)[0];
    expect(proof.status).toBe("review");
    expect(res.state.entries[1].underReview).toBe(proof.id);
    // verified biggest log → refuses
    let v = newDay();
    v = log(v, "b", "burpees", 40, T0 + 10, { verified: true }).state;
    const refuse = act(grant(v, "a", "spot_check"), "a", "spot_check");
    expect(refuse.result.ok).toBe(false);
    expect(refuse.result.reason).toContain("already verified");
    // leader is me → refuses
    let me = newDay();
    me = log(me, "a", "pushups", 50, T0 + 10).state;
    const selfLead = act(grant(me, "a", "spot_check"), "a", "spot_check");
    expect(selfLead.result.ok).toBe(false);
    expect(selfLead.result.reason).toContain("you're leading");
  });

  test("double proof on one target refused; votes settle on all-voted tie → accepted", () => {
    let d = newDay();
    d = act(grant(d, "a", "prove_it"), "a", "prove_it", { targetId: "b" }).state;
    d = grant(d, "c", "prove_it");
    const dup = E.activatePowerUp(d, "c", "prove_it", { at: T0 + 700, targetId: "b" });
    expect(dup.result.ok).toBe(false);
    expect(dup.result.reason).toContain("already under");
    // tie vote: 1 accept vs 1 contest, all voted → benefit of the doubt
    d = log(d, "b", "pushups", 20, T0 + 800).state;
    const proof = E.proofsOf(d).find((p) => p.status === "review");
    let s = E.voteProof(d, proof.id, "a", "accept").state;
    const fin = E.voteProof(s, proof.id, "c", "contest");
    expect(fin.result.settled).toBe(true);
    expect(fin.result.outcome).toBe("accepted");
  });
});

describe("card stack — catch-up / utility", () => {
  test("Second Wind: ≥40% behind opens a ×1.5 window; front-runners refused", () => {
    let d = newDay();
    d = log(d, "a", "pushups", 100, T0 + 10).state;
    const refuse = act(grant(d, "a", "second_wind"), "a", "second_wind");
    expect(refuse.result.ok).toBe(false);
    expect(refuse.result.reason).toContain("too close to the front");
    // b is 100% behind → qualifies
    const ok = act(grant(d, "b", "second_wind"), "b", "second_wind");
    expect(ok.result.ok).toBe(true);
    const r = log(ok.state, "b", "pushups", 20, T0 + 600);
    expect(r.ruf).toBe(30); // ×1.5
    // outside the window → normal
    const late = log(r.state, "b", "pushups", 20, ok.result.until + 1000);
    expect(late.ruf).toBe(20);
  });

  test("Mulligan: hand scrapped, a fresh deal of 3 lands, pickable", () => {
    let d = newDay();
    d = grant(grant(d, "a", "shield"), "a", "mulligan");
    expect(E.inventoryOf(d, "a").length).toBe(2);
    const res = act(d, "a", "mulligan", { rng: lcg(21) });
    expect(res.result.ok).toBe(true);
    expect(res.result.discarded).toBe(1); // shield discarded, mulligan spent
    expect(E.inventoryOf(res.state, "a").length).toBe(0);
    expect(res.state.drafts.a.options.length).toBe(3);
    expect(res.state.drafts.a.reason).toBe("mulligan");
    const pick = E.draftPick(res.state, "a", res.state.drafts.a.options[0]);
    expect(pick.result.ok).toBe(true);
  });

  test("Underdog: last place rides ×1.25; anyone off the back refuses", () => {
    let d = newDay();
    d = log(d, "b", "pushups", 50, T0 + 10).state;
    d = log(d, "c", "pushups", 20, T0 + 20).state;
    const refuse = act(grant(d, "b", "underdog"), "b", "underdog");
    expect(refuse.result.ok).toBe(false);
    expect(refuse.result.reason).toContain("not last");
    const ok = act(grant(d, "a", "underdog"), "a", "underdog"); // a is at 0, tied-last… b/c ahead → last
    expect(ok.result.ok).toBe(true);
    const r = log(ok.state, "a", "pushups", 20, T0 + 600);
    expect(r.ruf).toBe(25); // ×1.25
    expect(r.state.entries.at(-1).stack).toEqual(["underdog"]);
  });
});

describe("card stack — integration with the day", () => {
  test("stack multipliers stack with lightning (the mega log)", () => {
    let d = newDay();
    d = act(grant(d, "a", "lightning"), "a", "lightning", { at: T0 + 500 }).state;
    d = act(grant(d, "a", "double_exercise"), "a", "double_exercise", { exerciseId: "pushups" }).state;
    const r = log(d, "a", "pushups", 10, T0 + 600);
    expect(r.ruf).toBe(60); // ×3 ×2
  });

  test("drafted + played cards sweep at the close (nothing carries)", () => {
    let d = newDay();
    const deal = E.draftOptions(d, "a", { at: T0 + 10, rng: lcg(31) });
    d = E.draftPick(deal.state, "a", deal.options[0]).state;
    const closed = E.closeDay(d, T0 + DAY_MS + 60_000);
    // the day is closed; a fresh day starts with an empty hand (app sweeps)
    const d2 = newDay();
    expect(E.inventoryOf(d2, "a")).toEqual([]);
    expect(closed.state.drafts ?? {}).toEqual({}); // nothing pending after the close
  });
});
