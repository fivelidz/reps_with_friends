// @rwf/bot-core — branded result-card SVG generator (1200×675, dark + lime).
//
// Pure string builder (generateResultCardSvg) + a writer that drops the file
// into <cardsDir>/<matchId>.svg (default .data/cards/). The local server
// (serve.ts) serves .data/cards/* at http://localhost:4173/cards/<file>, so
// the URL the bot appends to the `result` reply resolves as-is.
//
// Brand: bg #0a0b0d · accent #c6f32e · Space Grotesk (fallback sans).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredMatch } from "./store.ts";
import { standings, winner } from "@rwf/game-core";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

const BG = "#0a0b0d";
const LIME = "#c6f32e";
const LIME_DIM = "#9fd400";
const WHITE = "#f4f6f0";
const GREY = "#5a6068";
const TRACK = "#1a1e24";
const FONT = "Space Grotesk, 'Space Grotesk', 'Segoe UI', sans-serif";

/** XML-escape a string for safe embedding in SVG text nodes. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate long names so they never blow out the layout. */
function fit(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Filesystem/URL-safe match id (chat ids contain ':' which is ugly in URLs). */
export function cardFileName(matchId: string): string {
  return `${matchId.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`;
}

/**
 * Build the branded result card for a completed match.
 * Winner huge up top, standings rows with progress bars, charity pot line,
 * RWF wordmark + "repswithfriends" footer.
 */
export function generateResultCardSvg(match: StoredMatch, winnerName: string): string {
  const rows = standings(match.state).slice(0, 5);
  const more = standings(match.state).length - rows.length;
  const w = winner(match.state);
  const target = match.state.config.targetReps;
  const winnerAdjusted = w ? w.adjustedScore.toFixed(1) : "—";

  // ── winner block ──────────────────────────────────────────────────────────
  const champ = esc(fit(winnerName, 14).toUpperCase());

  // ── standings rows ────────────────────────────────────────────────────────
  const rowH = 58;
  const rowsY = 336;
  const barX = 104;
  const barW = 460;
  const barMaxW = barW - 8; // inset fill so tiny pcts still show a nub

  const rowSvg = rows
    .map((r, i) => {
      const baseY = rowsY + i * rowH;
      const rank = i + 1;
      const name = esc(fit(r.player.name, 12));
      const pct = Math.max(0, Math.min(100, r.progressPct));
      const fillW = Math.max(3, Math.round((pct / 100) * barMaxW));
      return `
  <g>
    <text x="64" y="${baseY}" fill="${LIME}" font-size="24" font-weight="700">${rank}</text>
    <text x="104" y="${baseY}" fill="${WHITE}" font-size="24" font-weight="600">${name}</text>
    <rect x="${barX}" y="${baseY + 12}" width="${barW}" height="10" rx="5" fill="${TRACK}"/>
    <rect x="${barX + 4}" y="${baseY + 12}" width="${fillW}" height="10" rx="5" fill="url(#limeGrad)"/>
    <text x="1136" y="${baseY}" text-anchor="end" fill="${WHITE}" font-size="24" font-weight="700">${r.adjustedScore.toFixed(1)}</text>
    <text x="1136" y="${baseY + 22}" text-anchor="end" fill="${GREY}" font-size="14">${r.rawReps} raw · ${r.verifiedPct}% verified</text>
  </g>`;
    })
    .join("");

  const moreLine =
    more > 0
      ? `\n  <text x="104" y="${rowsY + rows.length * rowH - 6}" fill="${GREY}" font-size="16">+${more} more player${more > 1 ? "s" : ""}</text>`
      : "";

  // ── charity pot ───────────────────────────────────────────────────────────
  const potY = 604;
  const potSvg =
    match.potCents > 0
      ? `\n  <text x="64" y="${potY}" fill="${LIME}" font-size="21" font-weight="600">CHARITY POT ${money(match.potCents)} — ${esc(fit(winnerName, 16))} picks where it goes</text>`
      : `\n  <text x="64" y="${potY}" fill="${GREY}" font-size="18">no charity pot this match — chuck one in next time: \`pot 500\`</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="limeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${LIME}"/>
      <stop offset="1" stop-color="${LIME_DIM}"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BG}"/>
  <rect x="0" y="0" width="${CARD_WIDTH}" height="6" fill="${LIME}"/>
  <rect x="0" y="${CARD_HEIGHT - 6}" width="${CARD_WIDTH}" height="6" fill="${LIME}" opacity="0.35"/>

  <g font-family="${FONT}">
    <text x="64" y="76" fill="${LIME}" font-size="25" font-weight="700" letter-spacing="7">REPS WITH FRIENDS</text>
    <text x="64" y="100" fill="${GREY}" font-size="14" letter-spacing="4">MATCH RESULT · FIRST TO ${target}</text>

    <text x="64" y="228" fill="${WHITE}" font-size="92" font-weight="700" letter-spacing="1">${champ}</text>
    <text x="66" y="268" fill="${LIME}" font-size="27" font-weight="500">takes it — adjusted score ${winnerAdjusted} · effort wins the day</text>
${rowSvg}${moreLine}${potSvg}

    <text x="64" y="648" fill="${GREY}" font-size="15" letter-spacing="3">EFFORT-ADJUSTED SCORING · COUCH 1.5× · ATHLETE 0.85×</text>
    <text x="1136" y="648" text-anchor="end" fill="${LIME}" font-size="18" font-weight="600" letter-spacing="2">repswithfriends</text>
  </g>
</svg>
`;
}

/**
 * Generate + write the card to <dir>/<matchId>.svg (mkdir -p).
 * Returns the written path.
 */
export function writeResultCardSvg(
  match: StoredMatch,
  winnerName: string,
  dir = ".data/cards"
): string {
  const svg = generateResultCardSvg(match, winnerName);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, cardFileName(match.state.config.id));
  writeFileSync(path, svg);
  return path;
}
