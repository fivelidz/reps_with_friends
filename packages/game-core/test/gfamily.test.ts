// @rwf/game-core — G-family element tests: nemesis (G-28) + photo finish (G-30)
// Run: bun test packages/game-core

import { describe, test, expect } from "bun:test";
import { nemesisFor } from "../src/nemesis.ts";
import type { HeadToHeadResult } from "../src/nemesis.ts";
import { isPhotoFinish, photoFinishMargin, PHOTO_FINISH_PCT } from "../src/photo-finish.ts";

// ── nemesis ──────────────────────────────────────────────────────────────────

/** Standings are ranked best-first: first arg wins, last arg loses. */
function match(matchId: string, ...ranking: string[]): HeadToHeadResult {
  return {
    matchId,
    standings: ranking.map((playerId, i) => ({ playerId, adjustedScore: 100 - i * 10 })),
  };
}

describe("nemesisFor", () => {
  test("no nemesis with fewer than 2 shared matches", () => {
    // Ben beat Dave once — a single win doesn't crown a nemesis.
    const r = nemesisFor("dave", [match("m1", "ben", "dave")]);
    expect(r.nemesisId).toBeNull();
    expect(r.record).toEqual({ won: 0, lost: 0 });
  });

  test("no nemesis when the opponent never beat you (min 1 loss)", () => {
    const r = nemesisFor("dave", [match("m1", "dave", "ben"), match("m2", "dave", "ben")]);
    expect(r.nemesisId).toBeNull();
  });

  test("correct pick with 3 players — the one who beat you most wins", () => {
    // Shared matches: dave–ben ×2 (ben won both), dave–carol ×2 (1 apiece).
    // Even though carol also beat dave once, ben's 2 wins make him the nemesis.
    const results = [
      match("m1", "ben", "dave", "carol"), // all three played
      match("m2", "ben", "dave"), // ben beats dave again
      match("m3", "carol", "dave"), // carol gets one back… not enough
      match("m4", "dave", "carol"), // …and dave evens that score
    ];
    const r = nemesisFor("dave", results);
    expect(r.nemesisId).toBe("ben");
    expect(r.record).toEqual({ won: 0, lost: 2 });
  });

  test("record counts both directions across shared matches", () => {
    const results = [
      match("m1", "ben", "dave", "carol"),
      match("m2", "dave", "ben", "carol"), // dave's revenge
      match("m3", "ben", "carol", "dave"), // ben over dave again
    ];
    // dave vs ben: 3 shared, ben won 2, dave won 1 → nemesis ben 1–2.
    // dave vs carol: 3 shared, carol beat dave once (m3), dave beat carol twice.
    const r = nemesisFor("dave", results);
    expect(r.nemesisId).toBe("ben");
    expect(r.record).toEqual({ won: 1, lost: 2 });
  });

  test("matches the player didn't play are ignored", () => {
    const results = [
      match("m1", "ben", "carol"), // dave absent
      match("m2", "ben", "carol"),
    ];
    expect(nemesisFor("dave", results).nemesisId).toBeNull();
  });

  test("tie on losses is broken deterministically (more dominant, then id)", () => {
    // ben and carol both beat dave once in 2 shared matches each.
    // Equal losses, equal wins conceded, equal shared → lowest id wins.
    const results = [
      match("m1", "ben", "dave", "carol"), // ben beat dave; dave beat carol
      match("m2", "carol", "dave", "ben"), // carol beat dave; dave beat ben
    ];
    const r = nemesisFor("dave", results);
    expect(r.nemesisId).toBe("ben");
    expect(r.record).toEqual({ won: 1, lost: 1 });
  });

  test("empty history → no nemesis", () => {
    expect(nemesisFor("dave", []).nemesisId).toBeNull();
  });
});

// ── photo finish ─────────────────────────────────────────────────────────────

describe("isPhotoFinish / photoFinishMargin", () => {
  test("4.9% gap → photo finish", () => {
    const rows = [
      { playerId: "a", adjustedScore: 100 },
      { playerId: "b", adjustedScore: 95.1 },
    ];
    expect(isPhotoFinish(rows)).toBe(true);
    expect(photoFinishMargin(rows)).toBe(4.9);
  });

  test("5.1% gap → not a photo finish", () => {
    const rows = [
      { playerId: "a", adjustedScore: 100 },
      { playerId: "b", adjustedScore: 94.9 },
    ];
    expect(isPhotoFinish(rows)).toBe(false);
    expect(photoFinishMargin(rows)).toBe(5.1);
  });

  test("exactly 5.0% counts as within 5%", () => {
    expect(isPhotoFinish([
      { playerId: "a", adjustedScore: 100 },
      { playerId: "b", adjustedScore: 95 },
    ])).toBe(true);
    expect(PHOTO_FINISH_PCT).toBe(5);
  });

  test("zero leader score → never a photo finish", () => {
    const rows = [
      { playerId: "a", adjustedScore: 0 },
      { playerId: "b", adjustedScore: 0 },
    ];
    expect(isPhotoFinish(rows)).toBe(false);
    expect(photoFinishMargin(rows)).toBe(100);
  });

  test("input order doesn't matter (sorted defensively)", () => {
    expect(isPhotoFinish([
      { playerId: "b", adjustedScore: 95.1 },
      { playerId: "a", adjustedScore: 100 },
    ])).toBe(true);
  });

  test("fewer than 2 players → no contest", () => {
    expect(isPhotoFinish([{ playerId: "a", adjustedScore: 100 }])).toBe(false);
    expect(photoFinishMargin([{ playerId: "a", adjustedScore: 100 }])).toBe(100);
    expect(isPhotoFinish([])).toBe(false);
  });

  test("third place doesn't matter — only the top two", () => {
    expect(isPhotoFinish([
      { playerId: "a", adjustedScore: 100 },
      { playerId: "b", adjustedScore: 96 },
      { playerId: "c", adjustedScore: 0 },
    ])).toBe(true);
  });

  test("blowout margin reported for the card", () => {
    expect(photoFinishMargin([
      { playerId: "a", adjustedScore: 120 },
      { playerId: "b", adjustedScore: 100 },
    ])).toBe(16.7);
  });
});
