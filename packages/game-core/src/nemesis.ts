// @rwf/game-core — nemesis detection (element G-28)
// Across every match a player shared with an opponent, the nemesis is the
// opponent who beat them the most. Eligibility: at least 2 shared matches and
// at least 1 loss — one lucky win shouldn't crown a nemesis, and someone you
// consistently beat is prey, not a rival.
//
// Input shape matches SeasonMatchResult (minus week) and the bot store's
// match-history entries, so any of those feed straight in. Standings arrays
// are ranked best-first (index 0 = winner), same as `standings()`/`winner()`.

export interface HeadToHeadStanding {
  playerId: string;
  adjustedScore: number;
}

/** One completed match: ranked standings, best first. */
export interface HeadToHeadResult {
  matchId: string;
  standings: HeadToHeadStanding[];
}

export interface NemesisRecord {
  /** Matches the player WON against their nemesis. */
  won: number;
  /** Matches the player LOST to their nemesis. */
  lost: number;
}

export interface NemesisResult {
  /** The opponent who beat the player most, or null if no eligible rival. */
  nemesisId: string | null;
  /** Head-to-head record vs the nemesis (zeros when nemesisId is null). */
  record: NemesisRecord;
}

/**
 * Find `playerId`'s nemesis across shared matches.
 *
 * Ranking: most losses inflicted → tie: fewer wins conceded (more dominant)
 * → tie: more shared matches → tie: playerId ascending (deterministic).
 * Pure function; never throws.
 */
export function nemesisFor(playerId: string, results: HeadToHeadResult[]): NemesisResult {
  // opponentId → head-to-head tally from playerId's perspective
  const tally = new Map<string, NemesisRecord>();

  for (const r of results) {
    const mine = r.standings.findIndex((s) => s.playerId === playerId);
    if (mine === -1) continue; // player didn't play this match
    for (let j = 0; j < r.standings.length; j++) {
      if (j === mine) continue;
      const t = tally.get(r.standings[j].playerId) ?? { won: 0, lost: 0 };
      if (j < mine) t.lost++; // they finished above me → they beat me
      else t.won++;
      tally.set(r.standings[j].playerId, t);
    }
  }

  let best: { id: string; record: NemesisRecord } | null = null;
  for (const [id, record] of tally) {
    const shared = record.won + record.lost;
    if (shared < 2 || record.lost < 1) continue; // min 2 matches, min 1 loss
    if (best === null) {
      best = { id, record };
      continue;
    }
    const bestShared = best.record.won + best.record.lost;
    const wins =
      record.lost > best.record.lost ||
      (record.lost === best.record.lost && record.won < best.record.won) ||
      (record.lost === best.record.lost &&
        record.won === best.record.won &&
        shared > bestShared) ||
      (record.lost === best.record.lost &&
        record.won === best.record.won &&
        shared === bestShared &&
        id < best.id);
    if (wins) best = { id, record };
  }

  return {
    nemesisId: best?.id ?? null,
    record: best ? { ...best.record } : { won: 0, lost: 0 },
  };
}
