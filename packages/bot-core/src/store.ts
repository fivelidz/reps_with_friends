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
  /** Crew this chat is bound to via `link <code>` (ops hub surfaces it). */
  crewCode?: string;
}

export class MatchStore {
  private matches = new Map<string, StoredMatch>(); // chatId → match
  private file: string;

  constructor(file = ".data/bot-matches.json") {
    this.file = file;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, StoredMatch>;
      for (const [k, v] of Object.entries(raw)) this.matches.set(k, v);
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

  private must(chatId: string): StoredMatch {
    const m = this.matches.get(chatId);
    if (!m) throw new Error("no match in this chat — say `new` to start one");
    return m;
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const obj: Record<string, StoredMatch> = {};
    for (const [k, v] of this.matches) obj[k] = v;
    writeFileSync(this.file, JSON.stringify(obj, null, 2));
  }
}
