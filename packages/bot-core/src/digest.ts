// @rwf/bot-core — Monday digest (element G-27)
// Weekly recap card built from the chat's match history: matches played,
// biggest win margin, most wins / most closures (MVP votes land with element
// 10 — until then the win/closure counts carry the story), pot total, nemesis
// callout, photo finish of the week, and the top of the season ladder if a
// season is running.
//
// `digest` on the async bus also asks the local AI endpoint for a one-line
// cheeky summary of the week (2s timeout, silent fallback to none).

import type { MatchHistoryEntry } from "./store.ts";
import { nemesisFor } from "../../game-core/src/index.ts";
import type { LadderRow } from "./game-extras.ts";
import { aiComplete } from "./ai.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface DigestInput {
  /** Completed matches in the chat, oldest first (store.historyFor). */
  history: MatchHistoryEntry[];
  /** Active season, if one is running. */
  season?: { name: string; ladder: LadderRow[] };
}

/** id → latest display name across all history rows. */
function nameIndex(history: MatchHistoryEntry[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const h of history) for (const r of h.rows) names.set(r.playerId, r.name);
  return names;
}

/** History mapped to the engine's head-to-head shape. */
function toResults(history: MatchHistoryEntry[]) {
  return history.map((h) => ({
    matchId: h.matchId,
    standings: h.rows.map((r) => ({ playerId: r.playerId, adjustedScore: r.adjustedScore })),
  }));
}

/** Build the text digest card. Pure — no network, no store access. */
export function buildDigestCard(input: DigestInput): string {
  const { history } = input;
  if (history.length === 0) {
    return "📋 *MONDAY DIGEST*\nNo finished matches in this chat yet — play one to the end and I'll have opinions.";
  }

  const lines: string[] = [
    `📋 *MONDAY DIGEST — week in review*`,
    `${history.length} match${history.length === 1 ? "" : "es"} played in this chat.`,
    "",
  ];

  // Biggest win margin (top two adjusted gap; needs 2+ rows).
  let big: { h: MatchHistoryEntry; gap: number } | null = null;
  for (const h of history) {
    if (h.rows.length < 2) continue;
    const gap = h.rows[0].adjustedScore - h.rows[1].adjustedScore;
    if (!big || gap > big.gap) big = { h, gap };
  }
  if (big) {
    lines.push(
      `🥇 Biggest win: *${big.h.rows[0].name}* over *${big.h.rows[1].name}* by ${round1(big.gap)} adjusted (${big.h.rows[0].adjustedScore} vs ${big.h.rows[1].adjustedScore}).`
    );
  }

  // Most wins + most closures (the MVP slot until MVP votes exist).
  const names = nameIndex(history);
  const wins = new Map<string, number>();
  const closures = new Map<string, number>();
  for (const h of history) {
    if (h.winnerId) wins.set(h.winnerId, (wins.get(h.winnerId) ?? 0) + 1);
    if (h.closedById) closures.set(h.closedById, (closures.get(h.closedById) ?? 0) + 1);
  }
  const topBy = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const topWin = topBy(wins);
  if (topWin) lines.push(`🏆 Most wins: *${names.get(topWin[0]) ?? topWin[0]}* ×${topWin[1]}`);
  const topCloser = topBy(closures);
  if (topCloser)
    lines.push(`🔥 Most closures: *${names.get(topCloser[0]) ?? topCloser[0]}* ×${topCloser[1]} — first to the target`);

  // Photo finish of the week.
  const pf = history.filter((h) => h.photoFinish).sort((a, b) => a.photoFinishMarginPct - b.photoFinishMarginPct)[0];
  if (pf) {
    lines.push(
      `📸 Photo finish of the week: *${pf.rows[0].name}* held off *${pf.rows[1].name}* by just ${pf.photoFinishMarginPct}%.`
    );
  }

  // Charity pot total across the week's matches.
  const pot = history.reduce((s, h) => s + h.potCents, 0);
  lines.push(`💰 Charity pot this week: *${money(pot)}* directed by winners.`);

  // Nemesis callout — the rivalry with the most losses inflicted.
  const results = toResults(history);
  let pick: { name: string; nemesisName: string; won: number; lost: number } | null = null;
  for (const [id, name] of names) {
    const n = nemesisFor(id, results);
    if (!n.nemesisId) continue;
    if (!pick || n.record.lost > pick.lost) {
      pick = { name, nemesisName: names.get(n.nemesisId) ?? n.nemesisId, won: n.record.won, lost: n.record.lost };
    }
  }
  if (pick) {
    lines.push(
      `⚔️ Rivalry watch: *${pick.name}*'s nemesis is *${pick.nemesisName}* — beaten ${pick.lost} of ${pick.won + pick.lost}. Settle it this week.`
    );
  }

  // Top of the season ladder, if a season is running.
  if (input.season && input.season.ladder.length > 0) {
    const top = input.season.ladder[0];
    lines.push(`🏁 ${input.season.name}: *${top.name}* leads the ladder on ${top.points} pts.`);
  }

  return lines.join("\n");
}

/** Compact standings summary for the AI flavour line. */
export function digestSummaryForAi(input: DigestInput): string {
  const { history } = input;
  const parts = history.map((h) => {
    const podium = h.rows
      .slice(0, 3)
      .map((r) => `${r.name} ${r.adjustedScore}`)
      .join(", ");
    return `${h.matchId}: ${podium} (winner ${h.rows[0]?.name ?? "?"})`;
  });
  const ladder = input.season?.ladder?.[0];
  const ladderLine = ladder ? ` Season ladder leader: ${ladder.name} (${ladder.points} pts).` : "";
  return `Matches this week: ${history.length}. ${parts.join(" | ")}.${ladderLine}`;
}

/**
 * One cheeky AI line about the week (localhost:4173/api/ai, 2s timeout).
 * Returns null on any failure — the digest ships without flavour.
 */
export async function aiDigestLine(weekSummary: string, timeoutMs = 2000): Promise<string | null> {
  return aiComplete(
    [
      {
        role: "user",
        content: `Here is this week's results data from a fitness match group between mates:\n${weekSummary}\nWrite one short cheeky line summing up the week. Under 25 words, no emoji.`,
      },
    ],
    "You are a sports commentator for a casual fitness game between mates. Cheeky, never mean.",
    timeoutMs
  );
}
