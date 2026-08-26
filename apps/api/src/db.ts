// @rwf/api — JSON file store (.data/api-db.json)
// Single-file persistence for crews, players, matches, seasons. Atomic writes
// (tmp + rename) so a crash never corrupts the store. This is the MVP
// foundation that both the web app (currently localStorage) and the bots
// (currently .data/bot-matches.json) converge on.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { MatchState, Player, SeasonState } from "../../../packages/game-core/src/index.ts";

// ── Records ─────────────────────────────────────────────────────────────────

export interface CrewRecord {
  id: string;
  /** 5-char join code, uppercase, no 0/O/1/I. */
  code: string;
  name: string;
  players: Player[];
  createdAt: number;
}

export interface MatchRecord {
  /** Same as match.config.id. */
  id: string;
  crewCode: string;
  match: MatchState;
  mvpPlayerId?: string;
  /** True once this match's result has been recorded into the crew's season. */
  seasonRecorded?: boolean;
}

export interface SeasonRecord {
  id: string;
  crewCode: string;
  season: SeasonState;
}

export interface Db {
  crews: CrewRecord[];
  matches: MatchRecord[];
  seasons: SeasonRecord[];
}

export const emptyDb = (): Db => ({ crews: [], matches: [], seasons: [] });

// ── Path resolution ─────────────────────────────────────────────────────────
// Default: <repoRoot>/.data/api-db.json (repo root = three levels up from src/).
// Override with RWF_API_DB (tests use a temp file).

const defaultPath = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../../.data/api-db.json"
);

export function dbPath(): string {
  return process.env.RWF_API_DB || defaultPath;
}

// ── Load / save ─────────────────────────────────────────────────────────────

export function loadDb(): Db {
  const path = dbPath();
  if (!existsSync(path)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Db>;
    return {
      crews: parsed.crews ?? [],
      matches: parsed.matches ?? [],
      seasons: parsed.seasons ?? [],
    };
  } catch {
    // Corrupt file → start empty rather than take the whole API down.
    // (The tmp+rename write pattern means this should never happen.)
    return emptyDb();
  }
}

/** Atomic write: serialize → write tmp → rename over the target. */
export function saveDb(db: Db): void {
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, path);
}

/**
 * Read-modify-write in one call. The mutator edits the db in place (or returns
 * a new one); the result is persisted atomically and the mutator's return
 * value is passed through. Single-process MVP: no locking needed.
 */
export function mutateDb<T>(fn: (db: Db) => T): T {
  const db = loadDb();
  const out = fn(db);
  saveDb(db);
  return out;
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export function findCrew(db: Db, code: string): CrewRecord | undefined {
  const c = code.toUpperCase();
  return db.crews.find((cr) => cr.code === c || cr.id === c);
}

export function findMatch(db: Db, id: string): MatchRecord | undefined {
  return db.matches.find((m) => m.id === id);
}

/** The crew's active (champion-less) season, latest created. */
export function activeSeason(db: Db, crewCode: string): SeasonRecord | undefined {
  const c = crewCode.toUpperCase();
  const list = db.seasons.filter((s) => s.crewCode === c);
  return list.find((s) => s.season.champion == null) ?? list[list.length - 1];
}

// ── Ids & codes ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function newCrewCode(db: Db): string {
  let code = "";
  do {
    code = Array.from(
      { length: 5 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join("");
  } while (db.crews.some((c) => c.code === code));
  return code;
}
