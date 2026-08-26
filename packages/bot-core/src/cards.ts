// @rwf/bot-core — card formatters (WhatsApp + Slack compatible: *bold*, emoji)

import type { MatchState, StandingRow } from "@rwf/game-core";
import { standings } from "@rwf/game-core";
import type { StoredMatch } from "./store.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function helpCard(): string {
  return [
    "🏋️ *REPS WITH FRIENDS*",
    "The group picks exercises. Any reps, any order. First to the target closes it — but *effort wins the day*.",
    "",
    "• `new [target]` — start a match (default 300)",
    "• `join [couch|casual|fit|athlete]` — join with your fitness tier",
    "• `start` — lock in and go live",
    "• `log pushups 25` — log reps (add `!` if camera-verified: `log pushups 25!`)",
    "• `s` — standings",
    "• `taunt dave` — gentle encouragement",
    "• `pot 500` — chuck $5 in the charity pot",
    "• `result` — final card when the match is done",
    "• `link <code>` — link this chat to your crew",
  ].join("\n");
}

export function newCard(m: StoredMatch): string {
  const days = m.state.config.playDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(" · ");
  const ex = m.state.config.exercises.map((e) => e.name).join(", ");
  return [
    `🏋️ *Match created — first to ${m.state.config.targetReps} reps*`,
    `Exercises: ${ex}`,
    `Play days: ${days}`,
    "",
    "Everyone in? → `join` with your tier: couch / casual / fit / athlete",
    "Then `start` and get after it. Effort-adjusted scoring — the fit don't get it easy.",
  ].join("\n");
}

export function joinCard(name: string, tier: string, count: number): string {
  return `✅ *${name}* in as *${tier}* (${count} playing)\nTier matters — couch reps are worth 1.5×, athlete reps 0.85×. Effort wins.`;
}

export function standingsCard(m: StoredMatch): string {
  const rows = standings(m.state);
  if (rows.length === 0) return "No players yet — `join [tier]` to get in.";
  const lines = rows.map((r: StandingRow, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
    const bar = "█".repeat(Math.round(r.progressPct / 10)).padEnd(10, "░");
    return `${medal} *${r.player.name}* ${bar} ${r.progressPct}%\n    raw ${r.rawReps} · *adjusted ${r.adjustedScore}* · ${r.verifiedPct}% verified`;
  });
  const status = m.state.status === "complete" ? "COMPLETE" : m.state.status.toUpperCase();
  return [`🏋️ *Standings* (${status})`, "", ...lines].join("\n");
}

export function logCard(
  name: string,
  exercise: string,
  reps: number,
  verified: boolean,
  closed: boolean,
  targetReps = 300
): string {
  const v = verified ? " ✅camera" : "";
  return closed
    ? `🔥 *${name}* logs ${reps} ${exercise}${v} — *THAT'S ${targetReps}! MATCH CLOSED* 🏁\nFinal standings → \`result\``
    : `💪 *${name}* logs ${reps} ${exercise}${v}`;
}

export function startCard(m: StoredMatch): string {
  const roster = m.state.players.map((p) => `• ${p.name} (${p.tier})`).join("\n");
  return [
    `🚀 *LIVE — first to ${m.state.config.targetReps} raw reps closes it*`,
    "",
    roster,
    "",
    "Log as you go: `log pushups 25` — add `!` if the camera counted it (`log pushups 25!`). `s` for standings.",
  ].join("\n");
}

export function potCard(name: string, cents: number, totalCents: number): string {
  return `💰 *${name}* chucks ${money(cents)} in the charity pot — *${money(totalCents)}* banked. Winner picks where it goes.`;
}

export function linkCard(code: string): string {
  return `🔗 Chat linked to crew *${code}* — this crew's matches now surface on the Reps With Friends board.`;
}

export function resultCard(m: StoredMatch, winnerName: string, adjusted: number): string {
  const pot = m.potCents > 0 ? `\n\n💰 Charity pot: *${money(m.potCents)}* — ${winnerName} picks where it goes.` : "";
  return [
    `🏁 *MATCH RESULT*`,
    `🏆 *${winnerName}* takes it — adjusted score *${adjusted}*`,
    "",
    ...standings(m.state).map((r, i) => `${i + 1}. ${r.player.name} — ${r.adjustedScore} (${r.rawReps} raw)`),
    pot,
  ].join("\n");
}

const TAUNTS = [
  "%s, I've seen more effort from a wet towel.",
  "%s is saving their reps for the off-season, apparently.",
  "Someone check if %s is still alive.",
  "%s — the couch called, it wants its tier back.",
  "%s, the charity pot is getting cold waiting on you.",
  "Big talk from %s, small rep count.",
];

export function tauntCard(target: string): string {
  const t = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
  return "😤 " + t.replace("%s", `*${target}*`);
}
