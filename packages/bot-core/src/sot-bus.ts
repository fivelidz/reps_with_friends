// @rwf/bot-core — SotCommandBus: the chat grammar for the SOURCE-OF-TRUTH
// daily model (Engine v4), driving @rwf/game-core's daily/season/stakes API.
//
// PARALLEL to the legacy CommandBus (bus.ts — the 300-match grammar). The two
// never share state: legacy bots keep bus.ts + MatchStore untouched; the SOT
// loop runs on this bus + SotStore. Model per docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md:
//
//   · a DAY is the battle: everyone races to the same ADJUSTED target
//     (default 200 — tier handicaps change what a rep is WORTH, so the same
//     target means different physical targets per player)
//   · first eligible player to target = the DAILY WIN — the battle CONTINUES;
//     later completers BANK the day; at the deadline incompletes FAIL
//   · weekly season, 1 Daily Win = 1 point, streaks, stakes settle at season end
//   · power-ups per SOT canon: steal = PURE GAIN, shield = streak protection
//
// Command surface (identical on WhatsApp + Slack):
//   new [target] · join [tier] · start · log <exercise> <reps>[!] ·
//   s / standings · day close [force] · season [ladder|end] ·
//   stake <type> <terms…> · stake [status] · agree · decline ·
//   pot [points] · charity <name> · donate · stake done [note] ·
//   lightning · steal <name> · shield · freeze · bomb <name> · rope <name> ·
//   cards · help
//
// `handle` is fully synchronous (no network, injectable clock) — tests and
// sims pass `now` to travel through the day. Days auto-close at their
// (extended) deadline: the recap card is prepended to the next reply.

import type { Player, Exercise, FitnessTier } from "../../game-core/src/index.ts";
import {
  DEFAULT_DAILY_TARGET_RUF,
  TIER_MULTIPLIERS,
  tierMultiplier,
  dailyTargetAdjusted,
  createDay,
  logSet,
  closeDay,
  dayLeaderboard,
  effectiveDeadline,
  effectiveTargetOf,
  targetProgressOf,
  grantPowerUp,
  activatePowerUp,
  inventoryOf,
  POWER_UP_CATALOG,
  SURPRISE_BOMB_BONUS_RUF,
  createBattleSeason,
  recordBattleDay,
  dayRecordFrom,
  battleStandings,
  endBattleSeason,
  proposeStake,
  agreeToStake,
  declineStake,
  contributeToCharityStake,
  charityPotTotal,
  resolveSeasonStake,
  designateCharity,
  processCharityDonation,
  markStakeFulfilled,
} from "../../game-core/src/index.ts";
import type {
  DailyBattleState,
  BattleSeasonState,
  StakeType,
} from "../../game-core/src/index.ts";
import type { InboundMessage } from "./bus.ts";
import { TIERS } from "./bus.ts";
import {
  sotHelpCard,
  sotNewCard,
  sotJoinCard,
  sotRetierCard,
  sotStartCard,
  sotLogCard,
  sotDailyWinCard,
  sotBankedCard,
  sotStandingsCard,
  sotDayRecapCard,
  sotLadderCard,
  sotSeasonCard,
  sotSeasonEndCard,
  sotStakeProposedCard,
  sotStakeActiveCard,
  sotStakeWaitingCard,
  sotStakeVoidCard,
  sotStakeStatusCard,
  sotAgreeCard,
  sotPotCard,
  sotPotStatusCard,
  sotCharityCard,
  sotDonateCard,
  sotStakeFulfilledCard,
  sotLightningCard,
  sotStealCard,
  sotShieldCard,
  sotBombCard,
  sotBombDefusedCard,
  sotRopeCard,
  sotFreezeCard,
  sotCardsCard,
  physicalTarget,
  fmtDays,
} from "./sot-cards.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── store ───────────────────────────────────────────────────────────────────

export interface SotGroupConfig {
  id: string;
  /** Adjusted target everyone races to (SOT default 200). */
  targetReps: number;
  /** Active days of the week (0=Sun … 6=Sat). */
  playDays: number[];
  exercises: Exercise[];
}

/** One chat's SOT world: roster + weekly season + the current/latest day. */
export interface StoredSotGroup {
  config: SotGroupConfig;
  players: Player[];
  season: BattleSeasonState;
  /** Today's battle — live or the last closed one. */
  day?: DailyBattleState;
  /** Local ISO date (YYYY-MM-DD) the day opened — its season identity. */
  dayDate?: string;
}

const DEFAULT_SOT_EXERCISES: Exercise[] = [
  { id: "pushup", name: "Push-ups" },
  { id: "squat", name: "Squats" },
  { id: "situp", name: "Sit-ups" },
  { id: "burpee", name: "Burpees" },
  { id: "lunge", name: "Lunges" },
];

/** File shape: { groups: { chatId: StoredSotGroup } } (no legacy-key overlap). */
export class SotStore {
  private groups = new Map<string, StoredSotGroup>();
  private file: string;

  constructor(file = ".data/sot-groups.json") {
    this.file = file;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { groups?: Record<string, StoredSotGroup> };
      if (raw && typeof raw === "object" && raw.groups && typeof raw.groups === "object") {
        for (const [k, v] of Object.entries(raw.groups)) this.groups.set(k, v);
      }
    } catch {
      /* fresh start */
    }
  }

  get(chatId: string): StoredSotGroup | undefined {
    return this.groups.get(chatId);
  }

  set(chatId: string, group: StoredSotGroup): void {
    this.groups.set(chatId, group);
    this.persist();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(
        this.file,
        JSON.stringify({ groups: Object.fromEntries(this.groups) }, null, 2)
      );
    } catch {
      /* persistence must never break the game */
    }
  }
}

// ── parsing ─────────────────────────────────────────────────────────────────

const SOT_COMMANDS = new Set([
  "new",
  "join",
  "start",
  "log",
  "standings",
  "day",
  "season",
  "stake",
  "agree",
  "decline",
  "pot",
  "charity",
  "donate",
  "lightning",
  "steal",
  "shield",
  "freeze",
  "bomb",
  "rope",
  "cards",
  "help",
]);

const SOT_ALIASES: Record<string, string> = {
  s: "standings",
  standings: "standings",
  h: "help",
  close: "day", // `close` ≡ `day close`
  ladder: "season", // `ladder` ≡ `season ladder`
};

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function singularize(t: string): string {
  const n = norm(t);
  return n.length > 3 && n.endsWith("s") ? n.slice(0, -1) : n;
}

export interface ParsedSotCommand {
  cmd: string;
  args: string[];
  rest: string;
}

/** Parse raw text into an SOT command (same dialect as the legacy parse). */
export function parseSot(text: string): ParsedSotCommand | null {
  let tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (norm(tokens[0]) === "rwf") tokens = tokens.slice(1); // "rwf" / "/rwf" / "!rwf"
  if (tokens.length === 0) return null;
  const first = norm(tokens[0]);
  if (!first) return null;
  const cmd = SOT_ALIASES[first] ?? first;
  const args = tokens.slice(1);
  return { cmd, args, rest: args.join(" ") };
}

/** Cheap filter for live transports: does this look like an SOT command? */
export function looksLikeSotCommand(text: string): boolean {
  const p = parseSot(text);
  return p !== null && SOT_COMMANDS.has(p.cmd);
}

// ── bus ─────────────────────────────────────────────────────────────────────

export interface SotBusOptions {
  /** Injectable clock — tests/sims travel through the day. Default Date.now. */
  now?: () => number;
  /**
   * Day window override (ms): deadline = day open + this. Default: next 21:00
   * local (or +2h late at night). Sims/tests use this to compress the day.
   */
  dayWindowMs?: number;
  /** Override the default active days (Mon–Fri) for new groups — ops/sim seam. */
  playDays?: number[];
  /** Cards granted to each player when a day opens (prototype economy). */
  dayKit?: string[];
}

/** The prototype kit: one of each launch/post-launch canon card, per day. */
export const DEFAULT_DAY_KIT = [
  "lightning",
  "steal",
  "shield",
  "freeze",
  "surprise_bomb",
  "rescue_rope",
] as const;

/** Chat verbs → engine catalog kinds. */
const POWERUP_CMD_KINDS: Record<string, string> = {
  lightning: "lightning",
  steal: "steal",
  shield: "shield",
  freeze: "freeze",
  bomb: "surprise_bomb",
  rope: "rescue_rope",
};

const DEFAULT_PLAY_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const STAKE_TYPES = new Set<StakeType>(["dinner", "dare", "deliverable", "charity"]);

function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function defaultDeadline(now: number): number {
  const d = new Date(now);
  const ninePm = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 0, 0, 0).getTime();
  return ninePm > now ? ninePm : now + 2 * 60 * 60 * 1000; // late-night slack
}

export class SotCommandBus {
  constructor(
    private store: SotStore,
    private opts: SotBusOptions = {}
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /** Handle one inbound message synchronously. Never throws — errors are cards. */
  handle(msg: InboundMessage): string {
    try {
      // Deadline auto-close: if the day ran out, settle it before anything else
      // and prepend the recap (SOT flow: "auto at deadline").
      const auto = this.maybeAutoClose(msg.chatId);
      const reply = this.dispatch(msg);
      return auto ? `${auto}\n\n${reply}` : reply;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return `⚠️ ${detail}`;
    }
  }

  /** Async twin (kept for transport symmetry — this bus is network-free). */
  async handleAsync(msg: InboundMessage): Promise<string> {
    return this.handle(msg);
  }

  private dispatch(msg: InboundMessage): string {
    const parsed = parseSot(msg.text);
    if (!parsed) return sotHelpCard();
    const { cmd, args, rest } = parsed;
    switch (cmd) {
      case "new":
        return this.cmdNew(msg, args);
      case "join":
        return this.cmdJoin(msg, args);
      case "start":
        return this.cmdStart(msg);
      case "log":
        return this.cmdLog(msg, args);
      case "standings":
        return this.cmdStandings(msg);
      case "day":
        return this.cmdDay(msg, args);
      case "season":
        return this.cmdSeason(msg, args);
      case "stake":
        return this.cmdStake(msg, args);
      case "agree":
      case "decline":
        return this.cmdAgreeDecline(msg, cmd === "agree");
      case "pot":
        return this.cmdPot(msg, args);
      case "charity":
        return this.cmdCharity(msg, rest);
      case "donate":
        return this.cmdDonate(msg);
      case "lightning":
      case "steal":
      case "shield":
      case "freeze":
      case "bomb":
      case "rope":
        return this.cmdPowerUp(msg, cmd, args);
      case "cards":
        return this.cmdCards(msg);
      case "help":
        return sotHelpCard();
      default:
        return `🤖 Unknown command \`${cmd}\` — here's the SOT grammar:\n\n${sotHelpCard()}`;
    }
  }

  // ── group lifecycle ───────────────────────────────────────────────────────

  private cmdNew(msg: InboundMessage, args: string[]): string {
    let target = DEFAULT_DAILY_TARGET_RUF;
    if (args[0] != null) {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n <= 0 || n > 1_000_000)
        throw new Error(`bad target "${args[0]}" — usage: \`new [target]\` (e.g. \`new 200\` — the adjusted default)`);
      target = n;
    }
    const existing = this.store.get(msg.chatId);
    if (existing?.day?.status === "live")
      throw new Error(`today's battle is still live — \`s\` for standings, \`day close\` when it's done`);
    // Creator rides along as casual (re-tier with `join <tier>` before `start`).
    const creator: Player = { id: msg.playerId, name: msg.playerName, tier: "casual" };
    const playDays = this.opts.playDays ?? DEFAULT_PLAY_DAYS;
    const now = this.now();
    const group: StoredSotGroup = {
      config: {
        id: `sot-${msg.chatId}-${now.toString(36)}`,
        targetReps: target,
        playDays,
        exercises: DEFAULT_SOT_EXERCISES,
      },
      players: [creator],
      season: createBattleSeason(
        {
          id: `season-${msg.chatId}-${now.toString(36)}`,
          name: `Week of ${new Date(now).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
          playDays,
          targetReps: target,
        },
        [creator]
      ),
    };
    this.store.set(msg.chatId, group);
    return sotNewCard(msg.playerName, target, playDays);
  }

  private cmdJoin(msg: InboundMessage, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    if (g.day?.status === "live")
      throw new Error("the day is already open — new joiners are in for the next one (`day close` first)");
    if (g.season.endedAt != null) throw new Error("that season is over — `new` starts the next week");
    const tierArg = norm(args[0] ?? "");
    const tier = (tierArg === "" ? "casual" : ((TIERS as string[]).includes(tierArg) ? tierArg : null)) as FitnessTier | null;
    if (!tier)
      throw new Error(`unknown tier "${args[0]}" — pick one: couch / casual / fit / athlete`);
    const already = g.players.find((p) => p.id === msg.playerId);
    if (already) {
      if (already.tier === tier)
        return `✅ *${already.name}* is already in as *${tier}* — ${g.players.length} in the crew.`;
      already.tier = tier; // re-tier before the day opens
      this.store.set(msg.chatId, g);
      return sotRetierCard(already.name, tier, g.config.targetReps);
    }
    // Joining mid-SEASON: give them a zero-start in the season bookkeeping.
    const player: Player = { id: msg.playerId, name: msg.playerName, tier };
    g.players = [...g.players, player];
    g.season = {
      ...g.season,
      players: [...g.season.players, player],
      points: { ...g.season.points, [player.id]: 0 },
      streaks: { ...g.season.streaks, [player.id]: { length: 0, best: 0, lastDate: null } },
    };
    this.store.set(msg.chatId, g);
    return sotJoinCard(player.name, tier, g.players.length, g.config.targetReps);
  }

  private cmdStart(msg: InboundMessage): string {
    const g = this.mustGroup(msg.chatId);
    if (g.season.endedAt != null)
      throw new Error("that season is over — `new` starts the next week, same chat");
    if (g.day?.status === "live")
      throw new Error("the day is already open — log reps or `day close`");
    if (g.players.length < 2)
      throw new Error(`need at least 2 in the crew (only ${g.players.length}) — \`join [tier]\` to get in`);
    const now = this.now();
    if (!g.config.playDays.includes(new Date(now).getDay()))
      throw new Error(`today isn't an active day — this crew battles on ${fmtDays(g.config.playDays)}`);
    const deadlineAt =
      this.opts.dayWindowMs != null ? now + this.opts.dayWindowMs : defaultDeadline(now);
    let day = createDay(
      {
        id: `day-${g.config.id}-${isoDate(now)}`,
        playDays: g.config.playDays,
        deadlineAt,
        targetReps: g.config.targetReps,
        exercises: g.config.exercises,
      },
      g.players
    );
    // Prototype power-up economy: one canon kit per player per day. The real
    // economy is open (SOT Q240-242) — our draft-from-3 + catch-up is the
    // live proposal in the v1-v3 apps.
    for (const p of g.players)
      for (const kind of this.opts.dayKit ?? DEFAULT_DAY_KIT) day = grantPowerUp(day, p.id, kind);
    g.day = day;
    g.dayDate = isoDate(now);
    this.store.set(msg.chatId, g);
    const rows = g.players.map((p) => ({
      name: p.name,
      tier: p.tier,
      physical: physicalTarget(g.config.targetReps, p.tier),
    }));
    return sotStartCard(rows, g.config.targetReps, deadlineAt, "🃏 Power-up kit dealt — `cards` to see your hand.");
  }

  // ── logging — the race ────────────────────────────────────────────────────

  private cmdLog(msg: InboundMessage, args: string[]): string {
    if (args.length < 2)
      throw new Error("usage: `log <exercise> <reps>[!]` — e.g. `log pushups 25` or `log pushups 25!` (camera-verified)");
    const g = this.mustGroup(msg.chatId);
    if (!g.day || g.day.status !== "live")
      throw new Error("no battle open — `start` opens the day");
    const player = this.mustPlayer(g, msg.playerId);
    const exercise = this.resolveExercise(g, args[0]);
    const m = /^(\d+)(!?)$/.exec(args[1]);
    if (!m) throw new Error(`bad reps "${args[1]}" — usage: \`log ${args[0]} <reps>[!]\` (e.g. \`log ${args[0]} 25!\`)`);
    const reps = Number(m[1]);
    const verified = m[2] === "!";

    const at = this.now();
    const res = logSet(g.day, {
      playerId: player.id,
      exerciseId: exercise.id,
      reps,
      at,
      verified,
    });
    g.day = res.state;
    this.store.set(msg.chatId, g);

    const target = effectiveTargetOf(g.day, player.id);
    const progress = targetProgressOf(g.day, player.id);
    // Only celebrate a bomb defused BY this set (resolved.at === at), not an
    // earlier one still sitting resolved on the day.
    const bombHitNow =
      res.bonusRuf > 0 &&
      g.day.bombs.some((b) => b.targetId === player.id && b.resolved?.hit && b.resolved.at === at);
    const bonusNote = bombHitNow
      ? `\n${sotBombDefusedCard(player.name, SURPRISE_BOMB_BONUS_RUF)}`
      : "";

    if (res.wonDay) {
      return `${sotDailyWinCard(player.name, target, at)}${bonusNote}`;
    }
    if (res.completed) {
      const streakNext = (g.season.streaks[player.id]?.length ?? 0) + 1;
      return `${sotBankedCard(player.name, target, streakNext, at)}${bonusNote}`;
    }
    const board = dayLeaderboard(g.day);
    const rank = board.findIndex((r) => r.player.id === player.id) + 1;
    return `${sotLogCard({
      name: player.name,
      exercise: exercise.name,
      reps,
      verified,
      ruf: res.ruf,
      tierMult: tierMultiplier(player),
      progress,
      target,
      rank,
      ofPlayers: g.day.players.length,
      bonusRuf: res.bonusRuf,
    })}${bonusNote}`;
  }

  // ── standings ─────────────────────────────────────────────────────────────

  private cmdStandings(msg: InboundMessage): string {
    const g = this.mustGroup(msg.chatId);
    if (!g.day || g.day.status !== "live")
      return `${this.ladderCardIfAny(g)}\n\n🛌 No battle open — \`start\` opens the day on the next active day.`;
    const board = dayLeaderboard(g.day);
    const winnerId = g.day.winnerId;
    const rows = board.map((r, i) => {
      const status =
        r.player.id === winnerId ? ("won" as const)
        : r.completed ? ("banked" as const)
        : r.ruf > 0 ? ("chasing" as const)
        : ("failing" as const);
      return {
        name: r.player.name,
        tier: r.player.tier,
        progress: targetProgressOf(g.day!, r.player.id),
        target: effectiveTargetOf(g.day!, r.player.id),
        bonusRuf: r.bonusRuf,
        status,
        rank: i + 1,
        seasonPoints: g.season.points[r.player.id] ?? 0,
        streak: g.season.streaks[r.player.id]?.length ?? 0,
      };
    });
    return sotStandingsCard(rows, effectiveDeadline(g.day));
  }

  // ── day close (manual / force) + auto ─────────────────────────────────────

  private cmdDay(msg: InboundMessage, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    const sub = norm(args[0] ?? "close");
    if (sub !== "close")
      throw new Error("usage: `day close` (or `day close force` — ops/demo: settle early at the deadline terms)");
    if (!g.day || g.day.status !== "live")
      return "✅ The day is already closed — recap is above, `season ladder` for the table, `start` for the next battle.";
    const now = this.now();
    const deadline = effectiveDeadline(g.day);
    if (now < deadline && norm(args[1] ?? "") !== "force")
      throw new Error(`the deadline hasn't hit yet — battle runs to *${new Date(deadline).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}* (\`day close force\` settles it now, ops/demo)`);
    return this.closeDayAndRecord(msg.chatId, g, Math.max(now, deadline));
  }

  /** Auto-close a past-deadline day (if any). Returns the recap card or null. */
  private maybeAutoClose(chatId: string): string | null {
    const g = this.store.get(chatId);
    if (!g?.day || g.day.status !== "live") return null;
    const now = this.now();
    if (now < effectiveDeadline(g.day)) return null;
    const recap = this.closeDayAndRecord(chatId, g, now);
    return `⏰ *DEADLINE — the day closed itself:*\n\n${recap}`;
  }

  /** closeDay + season bookkeeping + recap card. Mutates the stored group. */
  private closeDayAndRecord(chatId: string, g: StoredSotGroup, at: number): string {
    if (!g.day || g.day.status !== "live") throw new Error("no live day to close");
    const closed = closeDay(g.day, at);
    g.day = closed.state;
    this.store.set(chatId, g);
    let seasonNote = "";
    try {
      const rec = dayRecordFrom(closed.state, g.dayDate ?? isoDate(at));
      g.season = recordBattleDay(g.season, rec);
      this.store.set(chatId, g);
    } catch (err) {
      seasonNote = `\n⚠️ season bookkeeping skipped (${err instanceof Error ? err.message : err})`;
    }
    const names = new Map(g.players.map((p) => [p.id, p.name]));
    const outcomes = closed.outcomes;
    const winnerId = closed.state.winnerId;
    const ladder = battleStandings(g.season);
    const ladderTop = ladder[0]
      ? `${names.get(ladder[0].playerId) ?? ladder[0].playerId} ${ladder[0].points} pt${ladder[0].points === 1 ? "" : "s"}`
      : undefined;
    return `${sotDayRecapCard({
      date: g.dayDate ?? isoDate(at),
      winnerName: winnerId != null ? names.get(winnerId) : undefined,
      banked: Object.entries(outcomes).filter(([, o]) => o.outcome === "completed").map(([id]) => names.get(id) ?? id),
      failed: Object.entries(outcomes).filter(([, o]) => o.outcome === "failed").map(([id]) => names.get(id) ?? id),
      shielded: Object.entries(outcomes).filter(([, o]) => o.outcome === "shielded").map(([id]) => names.get(id) ?? id),
      noWinner: winnerId == null,
      shieldConsumed: closed.shieldConsumed,
      streaks: ladder.map((r) => ({ name: names.get(r.playerId) ?? r.playerId, streak: r.streak })),
      ladderTop,
    })}${seasonNote}`;
  }

  // ── season ────────────────────────────────────────────────────────────────

  private cmdSeason(msg: InboundMessage, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    const sub = norm(args[0] ?? "");
    const names = new Map(g.players.map((p) => [p.id, p.name]));
    if (sub === "ladder") return this.ladderCard(g);
    if (sub === "end") {
      if (g.season.endedAt != null)
        return `${sotSeasonCard({
          name: g.season.config.name,
          daysPlayed: g.season.days.length,
          length: g.season.config.length ?? "weekly",
          ended: true,
          championName: g.season.champion != null ? names.get(g.season.champion) : undefined,
          tie: g.season.tie,
        })}`;
      if (g.day?.status === "live")
        throw new Error("close today's battle first — `day close`");
      let season = endBattleSeason(g.season, this.now());
      let resolutionLine: string | undefined;
      if (season.stake && season.stake.status === "active") {
        season = resolveSeasonStake(season, this.now());
        const r = season.stake!.resolution!;
        const winners = r.winnerIds.map((id) => names.get(id) ?? id).join(", ");
        const losers = r.loserIds.map((id) => names.get(id) ?? id).join(", ");
        resolutionLine =
          season.stake!.type === "charity"
            ? `winner${r.winnerIds.length > 1 ? "s" : ""} *${winners}* directs the charity pot (\`charity <name>\` + \`donate\`)`
            : `*${winners}* collect${r.winnerIds.length > 1 ? "" : "s"} — *${losers}* owe${r.loserIds.length > 1 ? "" : "s"} the ${season.stake!.type} (settle with \`stake done [note]\`)`;
      }
      g.season = season;
      this.store.set(msg.chatId, g);
      return sotSeasonEndCard({
        seasonName: season.config.name,
        championName: season.champion != null ? names.get(season.champion) : undefined,
        tie: season.tie === true,
        stakeResolution: resolutionLine,
      });
    }
    if (sub !== "") throw new Error("usage: `season` · `season ladder` · `season end`");
    return sotSeasonCard({
      name: g.season.config.name,
      daysPlayed: g.season.days.length,
      length: g.season.config.length ?? "weekly",
      ended: g.season.endedAt != null,
      championName: g.season.champion != null ? names.get(g.season.champion) : undefined,
      tie: g.season.tie,
      stakeLine: g.season.stake
        ? `${g.season.stake.type} — ${g.season.stake.status}${g.season.stake.charity ? ` · pot ${charityPotTotal(g.season.stake)} pts` : ""}`
        : "none set (`stake <type> <terms>`)",
      topLine: this.ladderTopLine(g),
    });
  }

  private ladderCard(g: StoredSotGroup): string {
    return sotLadderCard(g.season.config.name, battleStandings(g.season), new Map(g.players.map((p) => [p.id, p.name])), g.season.days.length);
  }

  private ladderTopLine(g: StoredSotGroup): string | undefined {
    const rows = battleStandings(g.season);
    if (rows.length === 0) return undefined;
    const names = new Map(g.players.map((p) => [p.id, p.name]));
    return rows
      .slice(0, 3)
      .map((r) => `${names.get(r.playerId) ?? r.playerId} ${r.points}`)
      .join(" · ");
  }

  private ladderCardIfAny(g: StoredSotGroup): string {
    return g.season.days.length > 0 ? this.ladderCard(g) : "No days battled yet this season.";
  }

  // ── stakes + charity pot ──────────────────────────────────────────────────

  private cmdStake(msg: InboundMessage, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    // `stake done [note]` — fulfilment bookkeeping, works AFTER resolution too.
    if (norm(args[0] ?? "") === "done") {
      const note = args.slice(1).join(" ").trim() || undefined;
      g.season = markStakeFulfilled(g.season, msg.playerId, note);
      this.store.set(msg.chatId, g);
      return sotStakeFulfilledCard(msg.playerName);
    }
    if (args.length === 0) {
      if (!g.season.stake) throw new Error("no stake set — `stake <type> <terms>` (dinner / dare / deliverable / charity)");
      return sotStakeStatusCard(g.season.stake, new Map(g.players.map((p) => [p.id, p.name])));
    }
    if (g.season.endedAt != null) throw new Error("that season is over — stake the next one");
    const type = norm(args[0]) as StakeType;
    if (!STAKE_TYPES.has(type))
      throw new Error(`unknown stake type "${args[0]}" — pick one: dinner / dare / deliverable / charity`);
    const declaration = args.slice(1).join(" ").trim();
    if (!declaration) throw new Error(`a stake needs terms locked up front — e.g. \`stake ${type} loser buys the crew dinner\``);
    if (g.players.length < 2) throw new Error("a stake needs at least two in the crew");
    g.season = proposeStake(g.season, { type, declaration }, g.players.map((p) => p.id));
    this.store.set(msg.chatId, g);
    return sotStakeProposedCard(type, declaration, g.players.map((p) => p.name));
  }

  private cmdAgreeDecline(msg: InboundMessage, agree: boolean): string {
    const g = this.mustGroup(msg.chatId);
    const stake = g.season.stake;
    if (!stake) throw new Error(`no stake to ${agree ? "agree to" : "decline"} — \`stake <type> <terms>\` first`);
    if (stake.status === "void") throw new Error("that stake was declined — nothing to agree to");
    if (stake.status === "resolved") throw new Error("that stake is already settled — \`stake\` for the terms");
    const wasActive = stake.status === "active";
    g.season = agree ? agreeToStake(g.season, msg.playerId) : declineStake(g.season, msg.playerId);
    this.store.set(msg.chatId, g);
    if (!agree) return sotStakeVoidCard(msg.playerName);
    const now2 = g.season.stake!;
    if (now2.status === "active" && !wasActive)
      return sotStakeActiveCard(now2.type, now2.declaration, now2.participants.length);
    if (now2.status === "active") return sotStakeActiveCard(now2.type, now2.declaration, now2.participants.length);
    const waiting = now2.participants.filter((id) => now2.agreements[id] !== "accepted");
    const names = new Map(g.players.map((p) => [p.id, p.name]));
    return sotAgreeCard(msg.playerName, false, now2.type, waiting.map((id) => names.get(id) ?? id));
  }

  private cmdPot(msg: InboundMessage, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    const stake = g.season.stake;
    if (!stake || stake.type !== "charity" || !stake.charity)
      throw new Error("no charity pot — set one up first: `stake charity <terms>` (and everyone `agree`s)");
    if (args.length === 0) {
      const total = charityPotTotal(stake);
      return sotPotStatusCard({
        total,
        perPlayer: stake.charity.perPlayerPoints,
        contributors: Object.keys(stake.charity.contributions).map((id) => g.players.find((p) => p.id === id)?.name ?? id),
        feePct: Math.round(stake.charity.platformFeeRate * 100),
        status: stake.status,
      });
    }
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`bad amount "${args[0]}" — usage: \`pot <points>\` (e.g. \`pot 100\` — the trial currency is points)`);
    g.season = contributeToCharityStake(g.season, msg.playerId, n);
    this.store.set(msg.chatId, g);
    return sotPotCard(msg.playerName, n, charityPotTotal(g.season.stake!));
  }

  private cmdCharity(msg: InboundMessage, rest: string): string {
    const g = this.mustGroup(msg.chatId);
    if (!rest.trim()) throw new Error("usage: `charity <name>` — the season winner directs the pot (e.g. `charity Coast Rescue`)");
    g.season = designateCharity(g.season, rest.trim(), msg.playerId);
    this.store.set(msg.chatId, g);
    return sotCharityCard(msg.playerName, rest.trim());
  }

  private cmdDonate(msg: InboundMessage): string {
    const g = this.mustGroup(msg.chatId);
    const before = g.season;
    const after = processCharityDonation(before, this.now());
    const c = after.stake!.charity!;
    g.season = after;
    this.store.set(msg.chatId, g);
    return sotDonateCard(c.donationPoints ?? 0, c.feePoints ?? 0, c.designatedCharityId ?? "the chosen charity");
  }

  // ── power-ups ─────────────────────────────────────────────────────────────

  private cmdPowerUp(msg: InboundMessage, cmd: string, args: string[]): string {
    const g = this.mustGroup(msg.chatId);
    if (!g.day || g.day.status !== "live")
      throw new Error("no battle open — power-ups live inside the day (`start` first)");
    const player = this.mustPlayer(g, msg.playerId);
    // Chat verb → engine catalog kind (bomb → surprise_bomb, rope → rescue_rope).
    const kind = POWERUP_CMD_KINDS[cmd] ?? cmd;
    const needsTarget = kind === "steal" || kind === "surprise_bomb" || kind === "rescue_rope";
    if (needsTarget && args.length === 0)
      throw new Error(`usage: \`${cmd} <name>\` — e.g. \`${cmd} @${g.players.find((p) => p.id !== player.id)?.name.toLowerCase() ?? "dave"}\``);
    const target = needsTarget ? this.resolveTarget(g, args[0], player) : undefined;

    const at = this.now();
    const { state, result } = activatePowerUp(g.day, player.id, kind, {
      at,
      ...(target ? { targetId: target.id } : {}),
    });
    if (!result.ok) {
      // Surface the engine's refusal as a friendly card (reasons are terse:
      // "no steal card held", "steal already used today (limit 1)", …).
      throw new Error(`${String(result.reason ?? "can't play that")} — \`cards\` to check your hand`);
    }
    g.day = state;
    this.store.set(msg.chatId, g);
    switch (kind) {
      case "lightning":
        return sotLightningCard(player.name, Number(result.until));
      case "steal":
        return sotStealCard(player.name, target!.name, Number(result.gain));
      case "shield":
        return sotShieldCard(player.name);
      case "freeze":
        return sotFreezeCard(player.name, Number(result.newDeadline));
      case "surprise_bomb":
        return sotBombCard(player.name, target!.name, Number(result.deadline));
      case "rescue_rope":
        return sotRopeCard(player.name, target!.name);
      default:
        return `✅ ${kind} played.`;
    }
  }

  private cmdCards(msg: InboundMessage): string {
    const g = this.mustGroup(msg.chatId);
    const player = this.mustPlayer(g, msg.playerId);
    if (!g.day || g.day.status !== "live")
      return `🃏 Cards are dealt when the day opens — \`start\`, then \`cards\`.`;
    const hand = inventoryOf(g.day, player.id).map((kind) => {
      const def = POWER_UP_CATALOG[kind];
      return { kind, name: def?.name ?? kind, blurb: def?.blurb ?? "" };
    });
    return sotCardsCard(player.name, hand);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private mustGroup(chatId: string): StoredSotGroup {
    const g = this.store.get(chatId);
    if (!g) throw new Error("no battle group in this chat yet — say `new` to start the daily battle");
    return g;
  }

  private mustPlayer(g: StoredSotGroup, playerId: string): Player {
    const p = g.players.find((x) => x.id === playerId);
    if (!p) throw new Error("you're not in this crew — `join [tier]` first");
    return p;
  }

  /** Roster name → Player (@-prefixed or loose substring, legacy style). */
  private resolveTarget(g: StoredSotGroup, token: string, sender: Player): Player {
    const q = token.replace(/^@/, "").toLowerCase();
    if (!q) throw new Error(`who? — usage: \`steal <name>\` (e.g. \`steal @dave\`)`);
    const found = g.players.find((p) => {
      if (p.id === sender.id) return false;
      const n = p.name.toLowerCase();
      return n === q || n.includes(q) || q.includes(n);
    });
    if (!found) throw new Error(`no rival called "${token}" in this crew — check the spelling with \`s\``);
    return found;
  }

  private resolveExercise(g: StoredSotGroup, token: string): { id: string; name: string } {
    const want = singularize(token);
    const exact = norm(token);
    for (const e of g.config.exercises) {
      if (norm(e.id) === exact || norm(e.name) === exact) return e;
    }
    for (const e of g.config.exercises) {
      if (singularize(e.id) === want || singularize(e.name) === want) return e;
    }
    const names = g.config.exercises.map((e) => e.name.toLowerCase()).join(", ");
    throw new Error(`"${token}" isn't in this battle — exercises: ${names}`);
  }
}
