// @rwf/bot-core — CommandBus: parse → mutate store → reply cards.
// Platform-agnostic: the WhatsApp and Slack adapters both feed plain text in
// (chatId + player identity) and get a plain-text card back (WhatsApp mrkdwn
// compatible; Slack renders the same asterisk-bold). All game logic lives in
// @rwf/game-core — this file only parses, mutates the store, and formats.
//
// Command surface (identical on both platforms):
//   new [target] · join [tier] · start · log <exercise> <reps>[!] ·
//   s / standings · taunt <name> · pot <cents> · result · rematch ·
//   nemesis [name] · digest · link <code> · watch <code> · challenge <code> ·
//   season new|ladder · help
//
// `handle` is synchronous (canned taunts, no network). `handleAsync` is the
// same bus but lets `taunt` and `digest` try the local AI endpoint first
// (2s timeout, canned fallback) — the bots use it; tests use the sync path.

import type { FitnessTier, Player, RepEntry } from "../../game-core/src/index.ts";
import { finalStandings, isPhotoFinish, logReps, nemesisFor, photoFinishMargin, standings, winner } from "../../game-core/src/index.ts";
import type { MatchStore, StoredMatch } from "./store.ts";
import {
  challengeCard,
  helpCard,
  joinCard,
  linkCard,
  logCard,
  newCard,
  nemesisCard,
  nemesisNoneCard,
  potCard,
  rematchCard,
  resultCard,
  rivalryCard,
  seasonHelpCard,
  seasonLadderCard,
  seasonNewCard,
  standingsCard,
  startCard,
  tauntCard,
  watchCard,
} from "./cards.ts";
import { cardFileName, writeResultCardSvg } from "./card-image.ts";
import {
  comebackEligibleIds,
  createSeason,
  recordMatch,
  seasonLadder,
} from "./game-extras.ts";
import type { SeasonMatchResult } from "./game-extras.ts";
import { aiTaunt } from "./ai.ts";
import { aiDigestLine, buildDigestCard, digestSummaryForAi } from "./digest.ts";

export interface InboundMessage {
  /** Chat/channel key — one match per chat. */
  chatId: string;
  /** Platform-stable sender id (e.g. "wa:+614…" / "slack:U123"). */
  playerId: string;
  /** Display name used on cards. */
  playerName: string;
  text: string;
}

export const TIERS: FitnessTier[] = ["couch", "casual", "fit", "athlete"];

const COMMANDS = new Set([
  "new",
  "join",
  "start",
  "log",
  "standings",
  "taunt",
  "pot",
  "result",
  "rematch",
  "nemesis",
  "digest",
  "link",
  "watch",
  "challenge",
  "season",
  "help",
]);

const ALIASES: Record<string, string> = {
  s: "standings",
  standings: "standings",
  h: "help",
  again: "rematch",
  runitback: "rematch",
  nem: "nemesis",
  monday: "digest",
};

/** lowercase + strip non-alphanumerics: "/rwf" → "rwf", "Push-ups!" → "pushups". */
function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "pushups" → "pushup", "Push-Ups" → "pushup" (loose exercise matching). */
function singularize(t: string): string {
  const n = normalizeToken(t);
  return n.length > 3 && n.endsWith("s") ? n.slice(0, -1) : n;
}

export interface ParsedCommand {
  cmd: string;
  args: string[];
  rest: string;
}

/** Parse raw text into a command. Returns null for empty input. */
export function parse(text: string): ParsedCommand | null {
  let tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  // Optional "rwf" / "/rwf" / "!rwf" prefix (group-mention style).
  if (normalizeToken(tokens[0]) === "rwf") tokens = tokens.slice(1);
  if (tokens.length === 0) return null;
  const first = normalizeToken(tokens[0]);
  if (!first) return null;
  const cmd = ALIASES[first] ?? first;
  const args = tokens.slice(1);
  return { cmd, args, rest: args.join(" ") };
}

/** Cheap filter for live transports: does this text look like an RWF command? */
export function looksLikeCommand(text: string): boolean {
  const p = parse(text);
  return p !== null && COMMANDS.has(p.cmd);
}

export interface BusOptions {
  /** Where result-card SVGs are written (default `.data/cards`). */
  cardsDir?: string;
  /** Base URL for card links (default `http://localhost:4173/cards`). */
  cardsUrl?: string;
}

export class CommandBus {
  constructor(
    private store: MatchStore,
    private opts: BusOptions = {}
  ) {}

  /** Handle one inbound message synchronously. Never throws — errors come back as cards. */
  handle(msg: InboundMessage): string {
    try {
      return this.dispatch(msg, false) as string;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return `⚠️ ${detail}`;
    }
  }

  /**
   * Same as handle(), but `taunt` first tries the local AI endpoint
   * (2s timeout, canned fallback). Bots use this; the sync path stays
   * network-free for tests.
   */
  async handleAsync(msg: InboundMessage): Promise<string> {
    try {
      return await (this.dispatch(msg, true) as string | Promise<string>);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return `⚠️ ${detail}`;
    }
  }

  private dispatch(msg: InboundMessage, allowAi: boolean): string | Promise<string> {
    const parsed = parse(msg.text);
    if (!parsed) return helpCard();
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
      case "taunt":
        return this.cmdTaunt(msg, rest, allowAi);
      case "pot":
        return this.cmdPot(msg, args);
      case "result":
        return this.cmdResult(msg);
      case "rematch":
        return this.cmdRematch(msg);
      case "nemesis":
        return this.cmdNemesis(msg, args);
      case "digest":
        return this.cmdDigest(msg, allowAi);
      case "link":
        return this.cmdLink(msg, args);
      case "watch":
        return this.cmdWatch(msg, args);
      case "challenge":
        return this.cmdChallenge(msg, args);
      case "season":
        return this.cmdSeason(args);
      case "help":
        return helpCard();
      default:
        return `🤖 Unknown command \`${cmd}\` — here's what I know:\n\n${helpCard()}`;
    }
  }

  // ── commands ──────────────────────────────────────────────────────────────

  private cmdNew(msg: InboundMessage, args: string[]): string {
    let target = 300;
    if (args[0] != null) {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n <= 0 || n > 1_000_000)
        throw new Error(`bad target "${args[0]}" — usage: \`new [target]\` (e.g. \`new 300\`)`);
      target = n;
    }
    const existing = this.store.get(msg.chatId);
    if (existing && existing.state.status !== "complete")
      throw new Error(
        `a match is already ${existing.state.status === "live" ? "live" : "open"} here — \`s\` for standings, or finish it first`
      );
    return newCard(this.store.create(msg.chatId, target));
  }

  private cmdJoin(msg: InboundMessage, args: string[]): string {
    const m = this.mustMatch(msg.chatId);
    if (m.state.status === "complete")
      throw new Error("that match is done — say `new` to start the next one");
    const tierArg = normalizeToken(args[0] ?? "");
    const tier = tierArg === "" ? "casual" : ((TIERS as string[]).includes(tierArg) ? tierArg : null);
    if (!tier)
      throw new Error(`unknown tier "${args[0]}" — pick one: couch / casual / fit / athlete`);
    const already = m.state.players.find((p) => p.id === msg.playerId);
    if (already)
      return `✅ *${already.name}* is already in as *${already.tier}* — ${m.state.players.length} playing.`;
    const player: Player = { id: msg.playerId, name: msg.playerName, tier };
    const updated = this.store.addPlayer(msg.chatId, player);
    return joinCard(player.name, tier, updated.state.players.length);
  }

  private cmdStart(msg: InboundMessage): string {
    const m = this.mustMatch(msg.chatId);
    if (m.state.status === "live") throw new Error("match is already live — get logging: `log pushups 25`");
    if (m.state.status === "complete") throw new Error("match is done — `result` for the card, `new` for the next one");
    if (m.state.players.length < 2)
      throw new Error(`need at least 2 players (only ${m.state.players.length} in) — \`join [tier]\` to get in`);
    return startCard(this.store.start(msg.chatId));
  }

  private cmdLog(msg: InboundMessage, args: string[]): string {
    if (args.length < 2)
      throw new Error("usage: `log <exercise> <reps>[!]` — e.g. `log pushups 25` or `log pushups 25!` (camera-verified)");
    const m = this.mustMatch(msg.chatId);
    if (m.state.status === "open") throw new Error("match hasn't started yet — `start` first");
    if (m.state.status === "complete")
      throw new Error("match is closed — `result` for the card, `new` for the next one");
    if (!m.state.players.some((p) => p.id === msg.playerId))
      throw new Error("you're not in this match — `join [tier]` first");

    const exercise = this.resolveExercise(m, args[0]);
    const match = /^(\d+)(!?)$/.exec(args[1]);
    if (!match) throw new Error(`bad reps "${args[1]}" — usage: \`log ${args[0]} <reps>[!]\` (e.g. \`log ${args[0]} 25!\`)`);
    const reps = Number(match[1]);
    const verified = match[2] === "!";

    const entry: RepEntry = {
      playerId: msg.playerId,
      exerciseId: exercise.id,
      reps,
      at: Date.now(),
      verified,
    };
    const { state, closedMatch } = logReps(m.state, entry);
    this.store.update(msg.chatId, state);
    if (closedMatch) {
      this.recordSeasonResult(state); // counts toward `season ladder`
      try {
        this.store.recordHistory(msg.chatId); // rematch / nemesis / digest fuel
      } catch {
        /* history must never break the match */
      }
    }
    return logCard(msg.playerName, exercise.name, reps, verified, closedMatch, state.config.targetReps);
  }

  private cmdTaunt(msg: InboundMessage, rest: string, allowAi: boolean): string | Promise<string> {
    const raw = rest.trim();
    const m = this.store.get(msg.chatId);
    let targetName: string;
    if (!raw) {
      const others = m?.state.players.filter((p) => p.id !== msg.playerId) ?? [];
      if (others.length === 0) throw new Error("usage: `taunt <name>` — give me a target");
      targetName = others[Math.floor(Math.random() * others.length)].name;
    } else {
      const lower = raw.toLowerCase();
      const target = m?.state.players.find(
        (p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
      );
      targetName = target ? target.name : raw;
    }
    if (!allowAi) return tauntCard(targetName); // sync path: canned lines only
    // async path: try the banter engine, fall back to canned on any failure
    return aiTaunt(targetName).then((ai) => tauntCard(targetName, ai ?? undefined));
  }

  private cmdPot(msg: InboundMessage, args: string[]): string {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`bad amount "${args[0] ?? ""}" — usage: \`pot <cents>\` (e.g. \`pot 500\` = $5.00)`);
    const m = this.mustMatch(msg.chatId);
    if (m.state.status === "complete")
      throw new Error(`match is done — pot closed at $${(m.potCents / 100).toFixed(2)}`);
    const total = this.store.contributePot(msg.chatId, msg.playerId, n);
    return potCard(msg.playerName, n, total);
  }

  private cmdResult(msg: InboundMessage): string {
    const m = this.mustMatch(msg.chatId);
    if (m.state.status !== "complete")
      throw new Error(`match isn't finished yet (status: ${m.state.status}) — \`s\` for standings`);
    const w = winner(m.state);
    if (!w) throw new Error("no winner recorded — match state looks broken");
    const champ = m.state.players.find((p) => p.id === w.playerId);
    if (!champ) throw new Error(`winner ${w.playerId} not in player list — match state looks broken`);
    // Photo finish (G-30): top two within 5% → dramatic banner + coral card.
    const final = finalStandings(m.state).map((r) => ({
      playerId: r.player.id,
      adjustedScore: r.adjustedScore,
    }));
    const pf = isPhotoFinish(final);
    const pfPct = photoFinishMargin(final);
    const base = resultCard(m, champ.name, w.adjustedScore, pf ? { photoFinishPct: pfPct } : undefined);
    // Generate the branded SVG card and append its URL. Card generation must
    // never break the result — on any failure the text card still goes out.
    try {
      writeResultCardSvg(m, champ.name, this.opts.cardsDir ?? ".data/cards", pf ? { photoFinish: true, marginPct: pfPct } : undefined);
      const url = `${this.opts.cardsUrl ?? "http://localhost:4173/cards"}/${cardFileName(m.state.config.id)}`;
      return `${base}\n\n🖼 Result card: ${url}`;
    } catch {
      return base;
    }
  }

  // `rematch` (G-26) — new match from the last completed one: same exercises,
  // target, play days; roster carried over pre-joined; pot reset to zero.
  private cmdRematch(msg: InboundMessage): string {
    const m = this.mustMatch(msg.chatId);
    if (m.state.status !== "complete")
      throw new Error(
        `match is still ${m.state.status === "live" ? "live" : "open"} — finish it first, then run it back`
      );
    const history = this.store.historyFor(msg.chatId);
    const prevWinnerName = history.length > 0
      ? history[history.length - 1].rows.find((r) => r.playerId === history[history.length - 1].winnerId)?.name
      : undefined;
    const next = this.store.rematch(msg.chatId);
    return rematchCard(next, history.length + 1, prevWinnerName);
  }

  // `nemesis [name]` (G-28) — closest rival from head-to-head history.
  private cmdNemesis(msg: InboundMessage, args: string[]): string {
    const history = this.store.historyFor(msg.chatId);
    if (history.length === 0)
      return "⚔️ No finished matches in this chat yet — rivalries need history. Close one out and ask again.";

    // id → latest name, from history first, then the live roster.
    const known = new Map<string, string>();
    for (const h of history) for (const r of h.rows) known.set(r.playerId, r.name);
    const m = this.store.get(msg.chatId);
    for (const p of m?.state.players ?? []) if (!known.has(p.id)) known.set(p.id, p.name);

    let targetId = msg.playerId;
    const query = args.join(" ").trim().toLowerCase();
    if (query) {
      let found: string | null = null;
      for (const [id, name] of known) {
        const n = name.toLowerCase();
        if (n.includes(query) || query.includes(n)) {
          found = id;
          break;
        }
      }
      if (!found) throw new Error(`no one called "${args.join(" ")}" in this chat's match history`);
      targetId = found;
    } else if (!known.has(targetId)) {
      throw new Error("you haven't finished a match in this chat yet — try `nemesis <name>`");
    }

    const results = history.map((h) => ({
      matchId: h.matchId,
      standings: h.rows.map((r) => ({ playerId: r.playerId, adjustedScore: r.adjustedScore })),
    }));
    const n = nemesisFor(targetId, results);
    const name = known.get(targetId) ?? msg.playerName;
    if (!n.nemesisId) return nemesisNoneCard(name);
    return nemesisCard(name, known.get(n.nemesisId) ?? n.nemesisId, n.record.won, n.record.lost);
  }

  // `digest` (G-27) — Monday recap from match history. Async path adds a
  // one-line AI summary when the local AI endpoint is up (silent fallback).
  private cmdDigest(msg: InboundMessage, allowAi: boolean): string | Promise<string> {
    const history = this.store.historyFor(msg.chatId);
    const seasonState = this.store.getSeason("active") as ReturnType<typeof createSeason> | undefined;
    const season = seasonState
      ? { name: seasonState.name ?? "Season", ladder: seasonLadder(seasonState) }
      : undefined;
    const input = { history, season };
    const card = buildDigestCard(input);
    if (!allowAi || history.length === 0) return card;
    return aiDigestLine(digestSummaryForAi(input)).then((line) =>
      line ? `${card}\n\n🤖 ${line}` : card
    );
  }

  private cmdLink(msg: InboundMessage, args: string[]): string {
    const code = args[0];
    if (!code || args.length > 1)
      throw new Error("usage: `link <code>` — e.g. `link CREW-7Q2` (one word)");
    this.store.link(msg.chatId, code);
    return linkCard(code);
  }

  // `watch <CODE>` — spectate another crew's matches from this chat.
  private cmdWatch(msg: InboundMessage, args: string[]): string {
    const code = args[0];
    if (!code || args.length > 1)
      throw new Error("usage: `watch <code>` — e.g. `watch CREW-7Q2` (one word)");
    const count = this.store.watchCrew(msg.chatId, code);
    const crewLive = this.store.findChatByCrew(code) != null;
    return watchCard(code, count, crewLive);
  }

  // `challenge <CODE>` / `challenge accept` / `challenge` (list) — crew-vs-crew.
  private cmdChallenge(msg: InboundMessage, args: string[]): string {
    const m = this.store.get(msg.chatId);
    const myCrew = m?.crewCode;
    if (!myCrew) throw new Error("link this chat to your crew first: `link <code>`");

    if (normalizeToken(args[0] ?? "") === "accept") {
      const pending = this.store
        .challengesFor(myCrew)
        .filter((c) => c.status === "pending" && c.toCrew === myCrew);
      if (pending.length === 0)
        throw new Error(`no pending challenges against *${myCrew}* — issue one with \`challenge <CODE>\``);
      const c = this.store.acceptChallenge(pending[0].id);
      if (!c) throw new Error("challenge vanished — try again");
      return rivalryCard(c.fromCrew, c.toCrew);
    }

    if (args.length === 0) {
      const list = this.store.challengesFor(myCrew);
      if (list.length === 0)
        return `⚔️ No challenges for *${myCrew}* yet — stir the pot: \`challenge <CODE>\``;
      const lines = list.map((c) =>
        c.status === "pending"
          ? `• ${c.fromCrew} → ${c.toCrew} (pending${c.toCrew === myCrew ? " — \`challenge accept\` to lock it in" : ""})`
          : `• ${c.fromCrew} vs ${c.toCrew} (accepted 🔥)`
      );
      return [`⚔️ *Crew challenges for ${myCrew}*`, "", ...lines].join("\n");
    }

    const code = args[0];
    if (args.length > 1) throw new Error("usage: `challenge <code>` — e.g. `challenge CREW-9ZZ` (one word)");
    if (code === myCrew) throw new Error("challenging your own crew? Bold. Pick another: `challenge <CODE>`");
    const c = this.store.createChallenge(myCrew, code);
    return challengeCard(c.fromCrew, c.toCrew);
  }

  // `season new [name]` / `season ladder` — seasons over @rwf/game-core.
  private cmdSeason(args: string[]): string {
    const sub = normalizeToken(args[0] ?? "");
    if (sub === "new") {
      const name = args.slice(1).join(" ").trim() || `Season ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
      this.store.setSeason("active", createSeason({ name }));
      return seasonNewCard(name);
    }
    if (sub === "ladder") {
      const season = this.store.getSeason("active") as ReturnType<typeof createSeason> | undefined;
      if (!season) throw new Error("no season yet — start one with `season new [name]`");
      return seasonLadderCard(season.name, seasonLadder(season));
    }
    if (sub === "") {
      const season = this.store.getSeason("active") as { name?: string } | undefined;
      return seasonHelpCard(season?.name);
    }
    throw new Error("usage: `season new [name]` · `season ladder`");
  }

  // `s` — own match if there is one, else the watched crew's match.
  private cmdStandings(msg: InboundMessage): string {
    const own = this.store.get(msg.chatId);
    if (own) {
      const spectators = own.crewCode ? this.store.spectatorCount(own.crewCode) : 0;
      return standingsCard(own, { spectators, comeback: comebackEligibleIds(own.state) });
    }
    // Spectator mode: no match here, but this chat watches a crew.
    const crew = this.store.spectatingCrew(msg.chatId);
    if (crew) {
      const chatId = this.store.findChatByCrew(crew);
      const m = chatId ? this.store.get(chatId) : undefined;
      if (m)
        return `👁 *Watching crew ${crew}*\n\n${standingsCard(m, {
          spectators: this.store.spectatorCount(crew),
          comeback: comebackEligibleIds(m.state),
        })}`;
      return `👁 Watching crew *${crew}* — no match found for them yet (their chat needs a \`new\` + \`link ${crew}\`).`;
    }
    return standingsCard(this.mustMatch(msg.chatId)); // throws the friendly error
  }

  /** Record a just-closed match into the active season (if any). Never throws. */
  private recordSeasonResult(state: import("../../game-core/src/index.ts").MatchState): void {
    try {
      const season = this.store.getSeason("active") as ReturnType<typeof createSeason> | undefined;
      if (!season) return;
      const w = winner(state);
      const result: SeasonMatchResult = {
        matchId: state.config.id,
        winnerId: w?.playerId ?? "",
        at: Date.now(),
        rows: standings(state).map((r) => ({
          playerId: r.player.id,
          name: r.player.name,
          adjustedScore: r.adjustedScore,
          rawReps: r.rawReps,
        })),
      };
      this.store.setSeason("active", recordMatch(season, result));
    } catch {
      /* season bookkeeping must never break the match */
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private mustMatch(chatId: string): StoredMatch {
    const m = this.store.get(chatId);
    if (!m) throw new Error("no match in this chat yet — say `new` to start one");
    return m;
  }

  private resolveExercise(m: StoredMatch, token: string): { id: string; name: string } {
    const want = singularize(token);
    const exact = normalizeToken(token);
    for (const e of m.state.config.exercises) {
      if (normalizeToken(e.id) === exact || normalizeToken(e.name) === exact) return e;
    }
    for (const e of m.state.config.exercises) {
      if (singularize(e.id) === want || singularize(e.name) === want) return e;
    }
    const names = m.state.config.exercises.map((e) => e.name.toLowerCase()).join(", ");
    throw new Error(`"${token}" isn't in this match — exercises: ${names}`);
  }
}
