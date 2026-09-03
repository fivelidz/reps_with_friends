// @rwf/bot-core — SOT card formatters (Engine v4 daily-model language).
//
// Player-facing copy rules from the Source of Truth (docs/27):
//   · the unit is "reps" — NEVER "RUF" (interim ruling, engine src/ruf.ts)
//   · the day is a battle: first eligible to target = the DAILY WIN,
//     the battle CONTINUES — later completers BANK the day
//   · seasons are weekly, 1 Daily Win = 1 season point
//   · charity pot is contributions in POINTS (trial currency), winner directs
//
// Same formatting dialect as cards.ts (WhatsApp mrkdwn + Slack bold).

import { TIER_MULTIPLIERS, dailyTargetAdjusted } from "../../game-core/src/index.ts";
import { STEAL_SHARE, SURPRISE_BOMB_RUF, RESCUE_ROPE_RUF, LIGHTNING_MULTIPLIER } from "../../game-core/src/index.ts";
import type { BattleStandingRow, StakeObject } from "../../game-core/src/index.ts";
import type { Player } from "../../game-core/src/index.ts";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 200.6 → "200.6", 200 → "200" (never trailing fuzz). */
export function fmtReps(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** HH:MM (24h, local) for deadline clocks on cards. */
export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtDays(playDays: number[]): string {
  return [...playDays].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(" · ");
}

/** Player's physical rep target for a RUF target ("134 physical = 200 adjusted"). */
export function physicalTarget(targetReps: number, tier: Player["tier"]): number {
  return dailyTargetAdjusted(targetReps, TIER_MULTIPLIERS[tier]);
}

const TIER_ORDER: Player["tier"][] = ["couch", "casual", "fit", "athlete"];

export function sotHelpCard(): string {
  return [
    "🏋️ *REPS WITH FRIENDS — the daily battle*",
    "Every active day is a battle: first to the target *WINS THE DAY*. The battle doesn't stop — everyone else can still *bank your day* before the deadline.",
    "",
    "• `new [target]` — start a group battle (default 200 adjusted reps, weekly season)",
    "• `join [couch|casual|fit|athlete]` — join with your tier (your tier sets your physical target)",
    "• `start` — open today's battle",
    "• `log pushups 25` — log reps (add `!` if camera-verified)",
    "• `s` — standings: who's won, banked, or chasing",
    "• `day close` — close the day at the deadline (it also closes on its own) — `day close force` for ops",
    "• `stake charity Everyone puts in 100 points` — agree the season stake up front (dinner / dare / deliverable / charity)",
    "• `agree` / `decline` — accept or void the proposed stake",
    "• `pot 100` — contribute points to the charity pot · `pot` to check it",
    "• `season` / `season ladder` — weekly standings, 1 Daily Win = 1 point · `season end` to settle",
    "• `cards` — your power-up hand, then play them:",
    "    `lightning` — reps ×3 for 10 minutes",
    `    \`steal @name\` — you GAIN ${Math.round(STEAL_SHARE * 100)}% of their score, they keep theirs`,
    "    `shield` — protect everyone's streak from one failed day",
    "    `freeze` — battle clock +30 minutes, group-wide",
    `    \`bomb @name\` — +${SURPRISE_BOMB_RUF} reps on them, 10 minutes to deliver`,
    `    \`rope @name\` — throw an inactive mate a ${RESCUE_ROPE_RUF}-rep credit`,
    "",
    "_Join the battle. Win the day._",
  ].join("\n");
}

export function sotNewCard(
  creator: string,
  targetReps: number,
  playDays: number[]
): string {
  const rows = TIER_ORDER.map(
    (t) => `• ${t} (×${TIER_MULTIPLIERS[t]}) → ${dailyTargetAdjusted(targetReps, TIER_MULTIPLIERS[t])} physical reps`
  );
  return [
    `🏋️ *Daily battle created — target ${targetReps} adjusted reps*`,
    `Active days: ${fmtDays(playDays)} · Weekly season · Tier handicap applies`,
    "",
    "Same 200 for everyone on the scoreboard — your tier sets what you physically owe:",
    ...rows,
    "",
    `*${creator}* is in (as casual — re-tier with \`join <tier>\`). Crew: \`join [tier]\`, then \`start\` opens today's battle.`,
    "First to target wins the day. Everyone else banks it before the deadline. `stake <type> <terms>` to make the week interesting.",
  ].join("\n");
}

export function sotJoinCard(
  name: string,
  tier: Player["tier"],
  count: number,
  targetReps: number
): string {
  const phys = dailyTargetAdjusted(targetReps, TIER_MULTIPLIERS[tier]);
  return `✅ *${name}* in as *${tier}* (${count} in the crew)\nYour target: *${phys} physical reps* = ${targetReps} adjusted (×${TIER_MULTIPLIERS[tier]} handicap). When ${count >= 2 ? "everyone's in" : "a mate joins"}, \`start\` opens the day.`;
}

export function sotRetierCard(name: string, tier: Player["tier"], targetReps: number): string {
  const phys = dailyTargetAdjusted(targetReps, TIER_MULTIPLIERS[tier]);
  return `🔁 *${name}* re-tiered to *${tier}* — target now ${phys} physical reps (×${TIER_MULTIPLIERS[tier]}).`;
}

export interface SotStartRow {
  name: string;
  tier: Player["tier"];
  physical: number;
}

export function sotStartCard(
  rows: SotStartRow[],
  targetReps: number,
  deadlineAt: number,
  kitNote: string
): string {
  const roster = rows.map((r) => `• ${r.name} (${r.tier}) — ${r.physical} physical reps`).join("\n");
  return [
    `🚨 *THE DAY IS OPEN — ${targetReps} adjusted reps, first there WINS THE DAY*`,
    "",
    roster,
    "",
    `Deadline: *${fmtClock(deadlineAt)}*. The win is live — later finishers bank the day, misses fail it.`,
    kitNote,
  ].join("\n");
}

/** In-progress log reply: value banked + remaining + race position. */
export function sotLogCard(opts: {
  name: string;
  exercise: string;
  reps: number;
  verified: boolean;
  ruf: number;
  tierMult: number;
  progress: number;
  target: number;
  rank: number;
  ofPlayers: number;
  bonusRuf?: number;
}): string {
  const v = opts.verified ? " ✅camera" : "";
  const mult = opts.tierMult === 1 ? "" : ` (×${opts.tierMult} handicap)`;
  const bonus = opts.bonusRuf && opts.bonusRuf > 0 ? ` · +${fmtReps(opts.bonusRuf)} bonus reps banked` : "";
  const remaining = Math.max(0, opts.target - opts.progress);
  return [
    `💪 *${opts.name}* logs ${opts.reps} ${opts.exercise}${v} — *+${fmtReps(opts.ruf)} reps*${mult}${bonus}`,
    `${fmtReps(opts.progress)}/${opts.target} — *${fmtReps(remaining)} to go* · P${opts.rank} of ${opts.ofPlayers}`,
  ].join("\n");
}

/** THE moment: first eligible player crosses the target. */
export function sotDailyWinCard(name: string, targetReps: number, at: number): string {
  return [
    `🏆 *${name.toUpperCase()} WINS THE DAY!* 🏆`,
    `First to ${targetReps} reps at ${fmtClock(at)} — *+1 season point*.`,
    "",
    "The battle continues — *bank your day*, crew. Reach the target before the deadline or the day is lost.",
  ].join("\n");
}

/** A later completion: the day is banked (streak + participation). */
export function sotBankedCard(name: string, targetReps: number, streakNext: number, at: number): string {
  const streak =
    streakNext > 1
      ? `*${streakNext}-day streak* 🔥`
      : streakNext === 1
        ? "streak started 🔥"
        : "streak kept";
  return [
    `🏦 *${name} BANKS THE DAY* — target reached (${targetReps} reps at ${fmtClock(at)}).`,
    `${streak} · completion counts, but the Daily Win (and the point) was already taken. Tomorrow's a new battle.`,
  ].join("\n");
}

export interface SotStandingRowView {
  name: string;
  tier: Player["tier"];
  progress: number;
  target: number;
  bonusRuf: number;
  status: "won" | "banked" | "chasing" | "failing";
  rank: number;
  seasonPoints: number;
  streak: number;
}

export function sotStandingsCard(rows: SotStandingRowView[], deadlineAt: number): string {
  const lines = rows.map((r) => {
    const pct = Math.min(100, Math.round((r.progress / r.target) * 100));
    const bar = "█".repeat(Math.round(pct / 10)).padEnd(10, "░");
    const label =
      r.status === "won" ? "🏆 WON THE DAY"
      : r.status === "banked" ? "🏦 BANKED"
      : r.status === "chasing" ? `${pct}%`
      : "0% · failing if this holds";
    const bonus = r.bonusRuf > 0 ? ` · +${fmtReps(r.bonusRuf)} stolen` : "";
    const pts = `${r.seasonPoints} pt${r.seasonPoints === 1 ? "" : "s"}`;
    const streak = r.streak > 0 ? ` · 🔥${r.streak}` : "";
    return `${r.rank}. *${r.name}* (${r.tier}) ${bar} ${label}${bonus}\n    ${fmtReps(r.progress)}/${fmtReps(r.target)} reps · season ${pts}${streak}`;
  });
  return [`🏋️ *The day at a glance* (deadline ${fmtClock(deadlineAt)})`, "", ...lines].join("\n");
}

export interface SotDayRecapView {
  date: string;
  winnerName?: string;
  banked: string[];
  failed: string[];
  shielded: string[];
  noWinner: boolean;
  shieldConsumed: boolean;
  streaks: { name: string; streak: number }[];
  ladderTop?: string;
}

export function sotDayRecapCard(r: SotDayRecapView): string {
  const head = r.noWinner
    ? `🌙 *Day closed (${r.date}) — nobody reached target. No Daily Win today.*`
    : `🌙 *Day closed (${r.date}) — ${r.winnerName} WINS THE DAY* 🏆 (+1 season point)`;
  const lines: string[] = [head];
  if (r.banked.length > 0) lines.push(`🏦 Banked the day: ${r.banked.join(", ")}`);
  if (r.shielded.length > 0) lines.push(`🛡 Failed but shielded (streaks saved): ${r.shielded.join(", ")}`);
  if (r.failed.length > 0) lines.push(`❌ Failed the day: ${r.failed.join(", ")} — streaks reset`);
  if (r.shieldConsumed) lines.push("🛡 The Group Shield was consumed saving the day.");
  if (r.streaks.length > 0)
    lines.push(`🔥 Streaks: ${r.streaks.map((s) => `${s.name} ${s.streak}`).join(" · ")}`);
  if (r.ladderTop) lines.push("", `📈 Ladder: ${r.ladderTop}`);
  lines.push("", "`start` opens the next battle on the next active day.");
  return lines.join("\n");
}

export function sotLadderCard(
  seasonName: string,
  rows: BattleStandingRow[],
  names: Map<string, string>,
  daysPlayed: number
): string {
  if (rows.length === 0) return "No crew yet — `join [tier]` to get in.";
  const lines = rows.map((r, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
    const name = names.get(r.playerId) ?? r.playerId;
    return `${medal} *${name}* — ${r.points} pt${r.points === 1 ? "" : "s"} (${r.dailyWins} W · ${r.completions} banked · 🔥${r.bestStreak} best)`;
  });
  return [`📊 *${seasonName}* — weekly ladder (${daysPlayed} day${daysPlayed === 1 ? "" : "s"} played)`, "", ...lines].join("\n");
}

export function sotSeasonCard(opts: {
  name: string;
  daysPlayed: number;
  length: string;
  ended: boolean;
  championName?: string;
  tie?: boolean;
  stakeLine?: string;
  topLine?: string;
}): string {
  const lines = [
    `📊 *${opts.name}* (${opts.length}${opts.ended ? " · ENDED" : ""})`,
    `Days played: ${opts.daysPlayed} · 1 Daily Win = 1 point`,
  ];
  if (opts.ended && opts.tie) lines.push("🤝 Season ended in a tie at the top (tiebreaker policy open — Q224).");
  else if (opts.ended && opts.championName) lines.push(`🏆 Season champion: *${opts.championName}*`);
  if (opts.stakeLine) lines.push(`Stake: ${opts.stakeLine}`);
  if (opts.topLine) lines.push("", `Ladder: ${opts.topLine}`);
  lines.push("", "`season ladder` for the full table.");
  return lines.join("\n");
}

export function sotSeasonEndCard(opts: {
  seasonName: string;
  championName?: string;
  tie: boolean;
  stakeResolution?: string;
}): string {
  const lines = [`🏁 *${opts.seasonName} — SEASON OVER*`];
  if (opts.tie) lines.push("🤝 Dead heat at the top — the tie is recorded (tiebreakers are an open question).");
  else lines.push(`🏆 Season champion: *${opts.championName}* — most Daily Wins takes it.`);
  if (opts.stakeResolution) lines.push("", `⚔️ Stake settled: ${opts.stakeResolution}`);
  lines.push("", "Next week, same crew: `new` starts the next season.");
  return lines.join("\n");
}

export function sotStakeProposedCard(
  type: string,
  declaration: string,
  pendingNames: string[]
): string {
  return [
    `⚔️ *STAKE PROPOSED — ${type.toUpperCase()}*`,
    `_${declaration}_`,
    "",
    `Nothing is at stake until everyone agrees: \`${pendingNames.join("`, `")}\` — say \`agree\` (or \`decline\` to void it).`,
  ].join("\n");
}

export function sotStakeActiveCard(type: string, declaration: string, players: number): string {
  return `⚔️ *STAKE ACTIVE — ${type.toUpperCase()}* (${players} agreed)\n_${declaration}_\nIt settles at \`season end\`: most Daily Wins wins, fewest owes up.`;
}

export function sotStakeWaitingCard(type: string, waitingNames: string[]): string {
  return `⏳ Stake (${type}) still proposed — waiting on \`${waitingNames.join("`, `")}\` to \`agree\`.`;
}

export function sotStakeVoidCard(name: string): string {
  return `🚫 *${name}* declined — the stake is void. Nothing agreed, nothing owed. (Propose a new one before the season is out: \`stake <type> <terms>\`.)`;
}

export function sotStakeStatusCard(stake: StakeObject, names: Map<string, string>): string {
  const nm = (id: string) => names.get(id) ?? id;
  const lines = [`⚔️ *Stake — ${stake.type.toUpperCase()}* (${stake.status})`, `_${stake.declaration}_`];
  if (stake.status === "proposed" || stake.status === "active") {
    const agree = stake.participants.map((id) => {
      const a = stake.agreements[id];
      const mark = a === "accepted" ? "✅" : a === "declined" ? "🚫" : "⏳";
      return `${mark} ${nm(id)}`;
    });
    lines.push(agree.join(" · "));
  }
  if (stake.resolution) {
    const winners = stake.resolution.winnerIds.map(nm).join(", ");
    const losers = stake.resolution.loserIds.map(nm).join(", ");
    lines.push(`Winner${stake.resolution.winnerIds.length > 1 ? "s" : ""}: *${winners}*`);
    lines.push(
      stake.type === "charity"
        ? `Fewest wins: ${losers} (nothing owed on a charity pot — the winner directs it)`
        : `Owes the ${stake.type}: *${losers}*`
    );
  }
  for (const [id, f] of Object.entries(stake.fulfilment)) {
    lines.push(`• ${nm(id)}: ${f.state}${f.evidence ? ` — ${f.evidence}` : ""}`);
  }
  if (stake.charity) {
    const total = Object.values(stake.charity.contributions).reduce((a, b) => a + b, 0);
    lines.push(`💰 Pot: ${total} points · platform fee ${(stake.charity.platformFeeRate * 100).toFixed(0)}% (disclosed)`);
    if (stake.charity.designatedCharityId) lines.push(`🎯 Directed to: ${stake.charity.designatedCharityId}`);
    if (stake.charity.donationPoints != null)
      lines.push(`❤️ Donated: ${stake.charity.donationPoints} points (fee ${stake.charity.feePoints ?? 0})`);
  }
  return lines.join("\n");
}

export function sotAgreeCard(name: string, active: boolean, type: string, waitingNames: string[]): string {
  if (active) return `🤝 *${name}* agrees — *STAKE LOCKED*. It resolves at \`season end\`.`;
  return `🤝 *${name}* agrees (${type} stake). Still waiting on \`${waitingNames.join("`, `")}\`.`;
}

export function sotPotCard(name: string, points: number, total: number): string {
  return `💰 *${name}* chips *${points} points* into the charity pot — *${total} points* banked. The season winner directs where it goes.`;
}

export function sotPotStatusCard(opts: {
  total: number;
  perPlayer: number | undefined;
  contributors: string[];
  feePct: number;
  status: string;
}): string {
  const lines = [
    `💰 *Charity pot — ${opts.total} points* (${opts.status})`,
    opts.perPlayer != null ? `Agreed: ${opts.perPlayer} points per player` : `Contributors: ${opts.contributors.join(", ") || "none yet"}`,
    `Platform fee: ${opts.feePct}% (disclosed — 0% for the trial)`,
  ];
  if (opts.status === "proposed") lines.push("The pot opens once every participant `agree`s.");
  if (opts.status === "resolved") lines.push("Season winner directs it: `charity <name>`, then `donate`.");
  return lines.join("\n");
}

export function sotCharityCard(name: string, charity: string): string {
  return `🎯 *${name}* directs the pot to *${charity}* — the season winner's call.`;
}

export function sotDonateCard(donation: number, fee: number, charity: string): string {
  return `❤️ *DONATED — ${donation} points to ${charity}* (platform fee ${fee} points, disclosed). Good work, crew. Receipt lives on the stake: \`stake\`.`;
}

export function sotStakeFulfilledCard(name: string): string {
  return `✅ *${name}* marked the stake fulfilled. Honour restored.`;
}

// ── power-up cards (SOT canon language) ──────────────────────────────────────

export function sotLightningCard(name: string, until: number): string {
  return `⚡ *LIGHTNING ROUND — ${name.toUpperCase()}!* Every rep counts ×${LIGHTNING_MULTIPLIER} until *${fmtClock(until)}* (10 minutes). GO.`;
}

/** The pure-gain moment — the exact SOT correction, said out loud. */
export function sotStealCard(name: string, targetName: string, gain: number): string {
  return `🥷 *REP STEAL — ${name}* skims ${targetName}'s form: *${name} GAINS ${fmtReps(gain)} reps* (${Math.round(STEAL_SHARE * 100)}% of ${targetName}'s completed score).\n*${targetName} keeps every rep* — pure gain, no theft. Scoreboard padding only (can't trigger the Daily Win).`;
}

export function sotShieldCard(name: string): string {
  return `🛡 *GROUP SHIELD — armed by ${name}.* If anyone falls short at the deadline, their streak is saved. The shield spends itself on the close it protects. (It does NOT block steals — that's not what it's for.)`;
}

export function sotBombCard(name: string, targetName: string, deadline: number): string {
  return `💣 *SURPRISE BOMB — ${name} drops +${SURPRISE_BOMB_RUF} reps on ${targetName}!*\n${targetName} has until *${fmtClock(deadline)}* to bank ${SURPRISE_BOMB_RUF} reps. Deliver and there's a +${SURPRISE_BOMB_RUF} bonus in it. Fizzle and… nothing. Bomb's away.`;
}

export function sotBombDefusedCard(name: string, bonus: number): string {
  return `💣✅ *${name} DEFUSES THE BOMB* — delivered inside the window. *+${fmtReps(bonus)} bonus reps* banked (counts toward the target).`;
}

export function sotRopeCard(name: string, mateName: string): string {
  return `🪢 *RESCUE ROPE — ${name} throws ${mateName} a line.* *+${RESCUE_ROPE_RUF} rep credit*, counts toward ${mateName}'s target. Nobody gets left on the couch.`;
}

export function sotFreezeCard(name: string, newDeadline: number): string {
  return `❄️ *TIME FREEZE — ${name}.* The battle clock extends 30 minutes, group-wide. New deadline: *${fmtClock(newDeadline)}*.`;
}

export function sotCardsCard(name: string, hand: { kind: string; name: string; blurb: string }[]): string {
  if (hand.length === 0)
    return `🃏 *${name}* is out of cards — the prototype grants one canon kit per day. Tomorrow's a fresh hand.`;
  const lines = [`🃏 *${name}'s hand (${hand.length}):*`];
  for (const c of hand) lines.push(`• *${c.name}* — ${c.blurb}`);
  return lines.join("\n");
}
