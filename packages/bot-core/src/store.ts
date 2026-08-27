// @rwf/bot-core — match store (prototype: in-memory + JSON file persistence)

import type { MatchState } from "../../game-core/src/index.ts";
import { createMatch, startMatch } from "../../game-core/src/index.ts";
import { finalStandings, winner } from "../../game-core/src/index.ts";
import { isPhotoFinish, photoFinishMargin } from "../../game-core/src/index.ts";
import type { Player } from "../../game-core/src/index.ts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_EXERCISES = [
  { id: "pushup", name: "Push-ups" },
  { id: "squat", name: "Squats" },
  { id: "situp", name: "Sit-ups" },
  { id: "burpee", name: "Burpees" },
  { id: "lunge", name: "Lunges" },
];

/** Unique match id — random suffix so two matches created in the same ms differ. */
function newMatchId(chatId: string): string {
  return `m-${chatId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * One completed match, snapshotted for rematch / nemesis / digest (G-family).
 * `rows` are the FINAL standings (closure bonus applied, winner first) — the
 * same order `winner()` crowns from.
 */
export interface MatchHistoryEntry {
  matchId: string;
  completedAt: number;
  targetReps: number;
  exercises: { id: string; name: string }[];
  playDays: number[];
  /** Roster with tiers — rematch re-seeds the next match from this. */
  players: Player[];
  rows: { playerId: string; name: string; adjustedScore: number; rawReps: number }[];
  winnerId: string;
  /** playerId whose raw total hit target (the closer). */
  closedById: string;
  potCents: number;
  photoFinish: boolean;
  photoFinishMarginPct: number;
}

export interface StoredMatch {
  state: MatchState;
  potCents: number;
  potContributors: Record<string, number>;
  /** Crew this chat is bound to via `link <CODE>` (ops hub surfaces it). */
  crewCode?: string;
  /** Completed matches in this chat, oldest first (rematch/nemesis/digest). */
  history?: MatchHistoryEntry[];
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
    // Snapshot a completed predecessor into history before replacing it, so
    // nemesis/digest survive a plain `new` over a finished match.
    const prev = this.matches.get(chatId);
    let history = prev?.history;
    if (prev && prev.state.status === "complete") {
      const entry = this.snapshot(prev);
      if (entry) history = [...(history ?? []), entry];
    }
    const state = createMatch(
      {
        id: newMatchId(chatId),
        exercises: DEFAULT_EXERCISES,
        targetReps,
        playDays,
      },
      []
    );
    const m: StoredMatch = { state, potCents: 0, potContributors: {}, history };
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

  // ── match history (rematch / nemesis / digest) ─────────────────────────────

  /** Completed matches in this chat, oldest first. */
  historyFor(chatId: string): MatchHistoryEntry[] {
    return this.matches.get(chatId)?.history ?? [];
  }

  /**
   * Snapshot the chat's completed match into history (idempotent — a match is
   * only ever recorded once). Called when a match closes; also defensively by
   * `rematch`/`create` for completes that predate this feature.
   */
  recordHistory(chatId: string): MatchHistoryEntry | null {
    const m = this.must(chatId);
    const entry = this.snapshot(m);
    if (!entry) return null;
    m.history = [...(m.history ?? []), entry];
    this.persist();
    return entry;
  }

  /** Pure snapshot builder. Null when the match isn't complete or already recorded. */
  private snapshot(m: StoredMatch): MatchHistoryEntry | null {
    if (m.state.status !== "complete") return null;
    if (m.history?.some((h) => h.matchId === m.state.config.id)) return null;
    const rows = finalStandings(m.state).map((r) => ({
      playerId: r.player.id,
      name: r.player.name,
      adjustedScore: r.adjustedScore,
      rawReps: r.rawReps,
    }));
    const pf = rows.map((r) => ({ playerId: r.playerId, adjustedScore: r.adjustedScore }));
    return {
      matchId: m.state.config.id,
      completedAt: m.state.completedAt ?? Date.now(),
      targetReps: m.state.config.targetReps,
      exercises: m.state.config.exercises,
      playDays: m.state.config.playDays,
      players: m.state.players,
      rows,
      winnerId: winner(m.state)?.playerId ?? rows[0]?.playerId ?? "",
      closedById: m.state.closedBy ?? "",
      potCents: m.potCents,
      photoFinish: isPhotoFinish(pf),
      photoFinishMarginPct: photoFinishMargin(pf),
    };
  }

  /**
   * `rematch` (G-26): new match from the last completed one — same exercises,
   * target and play days, roster carried over pre-joined (status open), pot
   * reset to zero. Crew binding and history survive.
   */
  rematch(chatId: string): StoredMatch {
    const m = this.must(chatId);
    if (m.state.status !== "complete")
      throw new Error("rematch needs a completed match — finish the current one first");
    this.recordHistory(chatId); // defensive no-op if closure already recorded it
    const prev = this.matches.get(chatId)!;
    const state = createMatch(
      {
        id: newMatchId(chatId),
        exercises: prev.state.config.exercises,
        targetReps: prev.state.config.targetReps,
        playDays: prev.state.config.playDays,
      },
      prev.state.players
    );
    const next: StoredMatch = {
      state,
      potCents: 0,
      potContributors: {},
      crewCode: prev.crewCode,
      history: prev.history,
    };
    this.matches.set(chatId, next);
    this.persist();
    return next;
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
