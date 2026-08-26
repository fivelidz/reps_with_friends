// @rwf/bot-core — CommandBus: parse → mutate store → reply cards.
// Platform-agnostic: the WhatsApp and Slack adapters both feed plain text in
// (chatId + player identity) and get a plain-text card back (WhatsApp mrkdwn
// compatible; Slack renders the same asterisk-bold). All game logic lives in
// @rwf/game-core — this file only parses, mutates the store, and formats.
//
// Command surface (identical on both platforms):
//   new [target] · join [tier] · start · log <exercise> <reps>[!] ·
//   s / standings · taunt <name> · pot <cents> · result · link <code> · help

import type { FitnessTier, Player, RepEntry } from "@rwf/game-core";
import { logReps, winner } from "@rwf/game-core";
import type { MatchStore, StoredMatch } from "./store.ts";
import {
  helpCard,
  joinCard,
  linkCard,
  logCard,
  newCard,
  potCard,
  resultCard,
  standingsCard,
  startCard,
  tauntCard,
} from "./cards.ts";

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
  "link",
  "help",
]);

const ALIASES: Record<string, string> = {
  s: "standings",
  standings: "standings",
  h: "help",
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

export class CommandBus {
  constructor(private store: MatchStore) {}

  /** Handle one inbound message. Never throws — errors come back as cards. */
  handle(msg: InboundMessage): string {
    try {
      return this.dispatch(msg);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return `⚠️ ${detail}`;
    }
  }

  private dispatch(msg: InboundMessage): string {
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
        return standingsCard(this.mustMatch(msg.chatId));
      case "taunt":
        return this.cmdTaunt(msg, rest);
      case "pot":
        return this.cmdPot(msg, args);
      case "result":
        return this.cmdResult(msg);
      case "link":
        return this.cmdLink(msg, args);
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
    return logCard(msg.playerName, exercise.name, reps, verified, closedMatch, state.config.targetReps);
  }

  private cmdTaunt(msg: InboundMessage, rest: string): string {
    const raw = rest.trim();
    const m = this.store.get(msg.chatId);
    if (!raw) {
      const others = m?.state.players.filter((p) => p.id !== msg.playerId) ?? [];
      if (others.length === 0) throw new Error("usage: `taunt <name>` — give me a target");
      const pick = others[Math.floor(Math.random() * others.length)];
      return tauntCard(pick.name);
    }
    const lower = raw.toLowerCase();
    const target = m?.state.players.find(
      (p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
    );
    return tauntCard(target ? target.name : raw);
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
    return resultCard(m, champ.name, w.adjustedScore);
  }

  private cmdLink(msg: InboundMessage, args: string[]): string {
    const code = args[0];
    if (!code || args.length > 1)
      throw new Error("usage: `link <code>` — e.g. `link CREW-7Q2` (one word)");
    this.store.link(msg.chatId, code);
    return linkCard(code);
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
