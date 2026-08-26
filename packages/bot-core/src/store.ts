// @rwf/bot-core — match store (prototype: in-memory + JSON file persistence)

import type { MatchState } from "@rwf/game-core";
import { createMatch, startMatch } from "@rwf/game-core";
import type { Player } from "@rwf/game-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_EXERCISES = [
  { id: "pushup", name: "Push-ups" },
  { id: "squat", name: "Squats" },
  { id: "situp", name: "Sit-ups" },
  { id: "burpee", name: "Burpees" },
  { id: "lunge", name: "Lunges" },
];

export interface StoredMatch {
  state: MatchState;
  potCents: number;
  potContributors: Record<string, number>;
  /** Crew this chat is bound to via `link <CODE>` (ops hub surfaces it). */
  crewCode?: string;
}

/** Crew-vs-crew challenge (stub — engine wiring lands with rivalry matches). */
export interface CrewChallenge {
  id: string;
  fromCrew: string;
  toCrew: string;
  at: number;
  status: "pending" | "accepted";
  acceptedAt?: number;
}

/**
 * Top-level keys in the store file that are NOT chatId → StoredMatch entries.
 * (The file keeps its existing shape; these keys are additions.)
 */
const RESERVED_KEYS = new Set(["seasons", "spectators", "challenges"]);

export class MatchStore {
  private matches = new Map<string, StoredMatch>(); // chatId → match
  /** seasonKey → SeasonState ("active" for the running season). */
  private seasons: Record<string, unknown> = {};
  /** crewCode → chatIds watching that crew (`watch <CODE>`). */
  private spectators: Record<string, string[]> = {};
  /** Crew-vs-crew challenges. */
  private challenges: CrewChallenge[] = [];
  private file: string;

  constructor(file = ".data/bot-matches.json") {
    this.file = file;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      if (raw && typeof raw === "object") {
        if (raw.seasons && typeof raw.seasons === "object") this.seasons = raw.seasons;
        if (raw.spectators && typeof raw.spectators === "object") this.spectators = raw.spectators;
        if (Array.isArray(raw.challenges)) this.challenges = raw.challenges;
        for (const [k, v] of Object.entries(raw)) {
          if (!RESERVED_KEYS.has(k)) this.matches.set(k, v as StoredMatch);
        }
      }
    } catch {
      /* fresh start */
    }
  }

  get(chatId: string): StoredMatch | undefined {
    return this.matches.get(chatId);
  }

  create(
    chatId: string,
    targetReps = 300,
    playDays: number[] = [2, 4]
  ): StoredMatch {
    const state = createMatch(
      {
        id: `m-${chatId}-${Date.now().toString(36)}`,
        exercises: DEFAULT_EXERCISES,
        targetReps,
        playDays,
      },
      []
    );
    const m: StoredMatch = { state, potCents: 0, potContributors: {} };
    this.matches.set(chatId, m);
    this.persist();
    return m;
  }

  start(chatId: string): StoredMatch {
    const m = this.must(chatId);
    m.state = startMatch(m.state);
    this.persist();
    return m;
  }

  addPlayer(chatId: string, player: Player): StoredMatch {
    const m = this.must(chatId);
    if (m.state.players.some((p) => p.id === player.id)) return m;
    m.state = { ...m.state, players: [...m.state.players, player] };
    this.persist();
    return m;
  }

  update(chatId: string, state: MatchState): void {
    const m = this.must(chatId);
    m.state = state;
    this.persist();
  }

  contributePot(chatId: string, playerId: string, cents: number): number {
    const m = this.must(chatId);
    m.potCents += cents;
    m.potContributors[playerId] = (m.potContributors[playerId] ?? 0) + cents;
    this.persist();
    return m.potCents;
  }

  /** Bind this chat to a crew code (persisted in the same file, same shape). */
  link(chatId: string, crewCode: string): StoredMatch {
    const m = this.must(chatId);
    m.crewCode = crewCode;
    this.persist();
    return m;
  }

  // ── seasons (persisted under top-level "seasons") ─────────────────────────

  getSeason(key: string): unknown {
    return this.seasons[key];
  }

  setSeason(key: string, state: unknown): void {
    this.seasons[key] = state;
    this.persist();
  }

  // ── spectators (persisted under top-level "spectators") ───────────────────

  /** Register a chatId as watching a crew code. Returns the spectator count. */
  watchCrew(chatId: string, crewCode: string): number {
    const list = (this.spectators[crewCode] ?? []).filter((c) => c !== chatId);
    list.push(chatId);
    this.spectators[crewCode] = list;
    this.persist();
    return list.length;
  }

  spectatorCount(crewCode: string): number {
    return this.spectators[crewCode]?.length ?? 0;
  }

  /** The crew code this chat is watching, if any. */
  spectatingCrew(chatId: string): string | undefined {
    for (const [code, list] of Object.entries(this.spectators)) {
      if (list.includes(chatId)) return code;
    }
    return undefined;
  }

  /** The chatId whose match is linked to a crew code, if any. */
  findChatByCrew(crewCode: string): string | undefined {
    for (const [chatId, m] of this.matches) {
      if (m.crewCode === crewCode) return chatId;
    }
    return undefined;
  }

  // ── crew-vs-crew challenges (persisted under top-level "challenges") ──────

  createChallenge(fromCrew: string, toCrew: string): CrewChallenge {
    const c: CrewChallenge = {
      id: `ch-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      fromCrew,
      toCrew,
      at: Date.now(),
      status: "pending",
    };
    this.challenges.push(c);
    this.persist();
    return c;
  }

  challengesFor(crewCode: string): CrewChallenge[] {
    return this.challenges.filter((c) => c.fromCrew === crewCode || c.toCrew === crewCode);
  }

  acceptChallenge(id: string): CrewChallenge | undefined {
    const c = this.challenges.find((x) => x.id === id && x.status === "pending");
    if (c) {
      c.status = "accepted";
      c.acceptedAt = Date.now();
      this.persist();
    }
    return c;
  }

  private must(chatId: string): StoredMatch {
    const m = this.matches.get(chatId);
    if (!m) throw new Error("no match in this chat — say `new` to start one");
    return m;
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.matches) obj[k] = v;
    if (Object.keys(this.seasons).length > 0) obj.seasons = this.seasons;
    if (Object.keys(this.spectators).length > 0) obj.spectators = this.spectators;
    if (this.challenges.length > 0) obj.challenges = this.challenges;
    writeFileSync(this.file, JSON.stringify(obj, null, 2));
  }
}
