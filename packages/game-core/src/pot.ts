// @rwf/game-core — charity pot ledger
// Winner directs the pot to a charity from the championed set. No cash to
// winner = sidesteps betting/raffle classification (structure still needs a
// legal opinion before real money moves — see docs/01 §5.4).

import type { Charity, CharityPot } from "./types.ts";

export function createPot(id: string, matchId: string): CharityPot {
  return { id, matchId, contributions: [] };
}

export function contribute(pot: CharityPot, playerId: string, amountCents: number): CharityPot {
  if (amountCents <= 0) throw new Error("contribution must be positive");
  return {
    ...pot,
    contributions: [...pot.contributions, { playerId, amountCents }],
  };
}

export function potTotalCents(pot: CharityPot): number {
  return pot.contributions.reduce((s, c) => s + c.amountCents, 0);
}

export function designate(pot: CharityPot, charity: Charity): CharityPot {
  return { ...pot, designatedCharityId: charity.id };
}
