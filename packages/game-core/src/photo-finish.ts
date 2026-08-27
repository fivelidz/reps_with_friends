// @rwf/game-core — photo finish detection (element G-30)
// A match is a PHOTO FINISH when the top two adjusted scores sit within 5% of
// the leader's score (and the leader's score is positive). Close calls get the
// dramatic card treatment; blowouts don't.

export interface FinalStanding {
  playerId: string;
  adjustedScore: number;
}

/** Top-two gap, as a percentage of the leader's score, that counts as close. */
export const PHOTO_FINISH_PCT = 5;

/**
 * The percentage gap between the top two standings (leader's score = 100%).
 * Input order doesn't matter — rows are sorted defensively. Returns a value
 * rounded to 1 decimal for card display.
 *
 * Degenerate cases (fewer than 2 players, or leader score ≤ 0) return 100 —
 * the maximum possible gap, i.e. "no contest".
 */
export function photoFinishMargin(finalStandings: FinalStanding[]): number {
  if (finalStandings.length < 2) return 100;
  const sorted = [...finalStandings].sort((a, b) => b.adjustedScore - a.adjustedScore);
  const [top, second] = sorted;
  if (top.adjustedScore <= 0) return 100;
  const pct = ((top.adjustedScore - second.adjustedScore) / top.adjustedScore) * 100;
  return Math.round(pct * 10) / 10;
}

/** True when the top two are within PHOTO_FINISH_PCT of the leader (and > 0). */
export function isPhotoFinish(finalStandings: FinalStanding[]): boolean {
  return photoFinishMargin(finalStandings) <= PHOTO_FINISH_PCT;
}
