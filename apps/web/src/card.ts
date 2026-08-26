// Result-card renderer — a 1200×675 shareable PNG in the app's branding
// (#0a0b0d bg, lime #c6f32e, Space Grotesk). Pure canvas 2D, no deps.
// Drawn from real match data; "Save card" (result screen) exports via toBlob.
import type { MatchState, StandingRow } from "./engine.ts";

// Design tokens (mirrors design/tokens.css — canvas can't use CSS vars)
const BG = "#0a0b0d";
const LIME = "#c6f32e";
const LIME_DIM = "#8fb31c";
const TEXT = "#e8eaed";
const MUTED = "#9aa0a8";
const FAINT = "#5f646d";
const AMBER = "#ffb020";
const SURFACE = "#121418";
const LINE = "#23262d";

const DISPLAY = (size: number, weight = 700): string =>
  `${weight} ${size}px 'Space Grotesk', system-ui, sans-serif`;

export interface CardData {
  match: MatchState;
  rows: StandingRow[]; // final standings, best first
  winnerId: string;
  winnerScore: number;
  closedMatch: boolean;
  potCents: number;
  charityName?: string;
  mvpName?: string;
  crewCode?: string;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof (ctx as any).roundRect === "function") {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setTracking(ctx: CanvasRenderingContext2D, px: string): void {
  // letterSpacing on 2D contexts: Chromium 99+. Silently ignored elsewhere.
  try {
    (ctx as any).letterSpacing = px;
  } catch {
    /* not supported — fine */
  }
}

const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;

export function drawResultCard(canvas: HTMLCanvasElement, d: CardData): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // ── backdrop ───────────────────────────────────────────────────────────────
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(120, -40, 40, 120, -40, 860);
  glow.addColorStop(0, "rgba(198, 243, 46, 0.17)");
  glow.addColorStop(1, "rgba(198, 243, 46, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(198, 243, 46, 0.28)";
  ctx.lineWidth = 2;
  roundRect(ctx, 22, 22, W - 44, H - 44, 26);
  ctx.stroke();

  // ── header ─────────────────────────────────────────────────────────────────
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = LIME;
  ctx.font = DISPLAY(26);
  setTracking(ctx, "5px");
  ctx.fillText("⚡ REPS WITH FRIENDS", 64, 78);
  setTracking(ctx, "0px");

  const dateStr = new Date(d.match.completedAt ?? Date.now()).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  ctx.fillStyle = FAINT;
  ctx.font = DISPLAY(20, 500);
  ctx.textAlign = "right";
  ctx.fillText(`${d.match.config.targetReps}-REP MATCH · ${dateStr}`, W - 64, 78);
  if (d.crewCode) ctx.fillText(`CREW ${d.crewCode}`, W - 64, 108);
  ctx.textAlign = "left";

  // ── champion block (left column) ───────────────────────────────────────────
  const champ = d.match.players.find((p) => p.id === d.winnerId);
  const champName = champ?.name ?? "—";

  ctx.fillStyle = LIME;
  ctx.font = DISPLAY(22);
  setTracking(ctx, "7px");
  ctx.fillText("CHAMPION", 64, 208);
  setTracking(ctx, "0px");

  let nameSize = 96;
  ctx.font = DISPLAY(nameSize);
  while (ctx.measureText(champName).width > 500 && nameSize > 40) {
    nameSize -= 4;
    ctx.font = DISPLAY(nameSize);
  }
  ctx.fillStyle = TEXT;
  ctx.fillText(champName, 64, 208 + nameSize * 0.92);

  const scoreY = 208 + nameSize * 0.92 + 26;
  ctx.fillStyle = LIME;
  ctx.font = DISPLAY(64);
  ctx.fillText(String(Math.round(d.winnerScore * 10) / 10), 64, scoreY + 64);
  const scoreW = ctx.measureText(String(Math.round(d.winnerScore * 10) / 10)).width;
  ctx.fillStyle = MUTED;
  ctx.font = DISPLAY(20, 500);
  ctx.fillText("ADJUSTED PTS", 64 + scoreW + 16, scoreY + 64);

  ctx.fillStyle = FAINT;
  ctx.font = DISPLAY(19, 500);
  ctx.fillText(
    d.closedMatch ? "CLOSED THE MATCH — TARGET REACHED" : "HIGHEST ADJUSTED SCORE AT CLOSE",
    64,
    scoreY + 100
  );

  // MVP + pot lines
  let lineY = scoreY + 148;
  if (d.mvpName) {
    ctx.fillStyle = AMBER;
    ctx.font = DISPLAY(24);
    ctx.fillText(`🏅 MVP — ${d.mvpName}`, 64, lineY);
    lineY += 40;
  }
  ctx.fillStyle = AMBER;
  ctx.font = DISPLAY(24);
  ctx.fillText(
    d.charityName
      ? `${money(d.potCents)} CHARITY POT → ${d.charityName.toUpperCase()}`
      : `${money(d.potCents)} CHARITY POT — WINNER DIRECTS`,
    64,
    lineY
  );

  // ── final standings (right column) ─────────────────────────────────────────
  const colX = 640;
  const colW = W - colX - 64;
  ctx.fillStyle = FAINT;
  ctx.font = DISPLAY(20);
  setTracking(ctx, "5px");
  ctx.fillText("FINAL STANDINGS", colX, 208);
  setTracking(ctx, "0px");

  const rows = d.rows.slice(0, 5);
  const maxScore = Math.max(1, ...rows.map((r) => r.adjustedScore));
  const rowH = 76;
  rows.forEach((r, i) => {
    const y = 244 + i * rowH;
    const isWin = r.player.id === d.winnerId;
    // rank
    ctx.fillStyle = i === 0 ? LIME : i < 3 ? MUTED : FAINT;
    ctx.font = DISPLAY(26);
    ctx.fillText(String(i + 1), colX, y + 26);
    // name + score line
    ctx.fillStyle = isWin ? LIME : TEXT;
    ctx.font = DISPLAY(25, isWin ? 700 : 500);
    let nm = r.player.name.toUpperCase();
    while (ctx.measureText(nm).width > 260 && nm.length > 3) nm = nm.slice(0, -2);
    ctx.fillText(nm, colX + 44, y + 26);
    ctx.textAlign = "right";
    ctx.fillStyle = isWin ? LIME : MUTED;
    ctx.font = DISPLAY(25, 700);
    ctx.fillText(
      `${Math.round(r.adjustedScore * 10) / 10}`,
      colX + colW,
      y + 26
    );
    ctx.textAlign = "left";
    // bar
    const barW = Math.max(8, (r.adjustedScore / maxScore) * (colW - 8));
    ctx.fillStyle = SURFACE;
    roundRect(ctx, colX + 44, y + 42, colW - 44, 12, 6);
    ctx.fill();
    ctx.fillStyle = isWin ? LIME : LIME_DIM;
    roundRect(ctx, colX + 44, y + 42, barW, 12, 6);
    ctx.fill();
  });

  // ── footer tagline ─────────────────────────────────────────────────────────
  ctx.fillStyle = FAINT;
  ctx.font = DISPLAY(18, 500);
  setTracking(ctx, "3px");
  ctx.textAlign = "center";
  ctx.fillText("THE GROUP CHAT GETS FIT — WINNER PICKS THE CHARITY", W / 2, H - 52);
  setTracking(ctx, "0px");
  ctx.textAlign = "left";
}
