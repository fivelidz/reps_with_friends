// App state — single object, persisted to localStorage (key rwf.state.v1).
// The engine (game-core) is pure; all persistence + orcheststration lives here.

import {
  contribute,
  createMatch,
  createPot,
  designate,
  logReps,
  startMatch,
  standings,
  winner,
  type CharityPot,
  type FitnessTier,
  type MatchState,
  type Player,
} from "./engine.ts";
import {
  applyComeback,
  comebackArmed,
  createSeason,
  endSeason as endSeasonFn,
  forgiveStreak as forgiveStreakFn,
  recordSeasonMatch,
  SEASON_MVP_POINTS,
  SEASON_PLAY_POINTS,
  SEASON_WIN_POINTS,
  type SeasonMatchResult,
  type SeasonState,
} from "./engine-extras.ts";
import { DEMO_CREW, EXERCISES, STAKE_CENTS } from "./data.ts";

const KEY = "rwf.state.v1";

export interface AppState {
  v: 1;
  me: Player | null;
  crew: { name: string; code: string } | null;
  matches: MatchState[]; // chronological; render reversed
  pots: Record<string, CharityPot>;
  /** Active 4-week season (optional — added Aug 2026, older states lack it). */
  season?: SeasonState | null;
  /** Ended seasons, newest last (kept for the champions list). */
  seasonHistory?: SeasonState[];
  /** MVP votes: matchId → voted playerId (one local vote per match). */
  mvp?: Record<string, string>;
}

function defaultState(): AppState {
  return { v: 1, me: null, crew: null, matches: [], pots: {}, season: null, seasonHistory: [], mvp: {} };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw) as AppState;
    if (p && p.v === 1 && Array.isArray(p.matches) && typeof p.pots === "object") {
      // Backward-compatible field normalisation (keys added after v1 shipped).
      if (!("season" in p)) p.season = null;
      if (!("seasonHistory" in p)) p.seasonHistory = [];
      if (!("mvp" in p)) p.mvp = {};
      return p;
    }
  } catch {
    /* corrupt state → fresh start */
  }
  return defaultState();
}

let state: AppState = load();
let renderer: (() => void) | null = null;

export function setRenderer(fn: () => void): void {
  renderer = fn;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full/blocked — app still works in-memory */
  }
}

/** Mutate a draft copy, persist, and trigger a re-render. */
export function update(fn: (s: AppState) => void): void {
  // State is pure JSON — JSON round-trip is a safe fallback where
  // structuredClone is missing (older Safari).
  const next: AppState =
    typeof structuredClone === "function"
      ? structuredClone(state)
      : (JSON.parse(JSON.stringify(state)) as AppState);
  fn(next);
  state = next;
  persist();
  renderer?.();
}

/** Re-render without changing state (e.g. in-session taunt feed). */
export function touch(): void {
  renderer?.();
}

export function getState(): AppState {
  return state;
}

export function getMatch(id: string): MatchState | undefined {
  return state.matches.find((m) => m.config.id === id);
}

// ── ids & codes ──────────────────────────────────────────────────────────────

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1

export function newCrewCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

// ── actions ──────────────────────────────────────────────────────────────────

export function completeOnboard(name: string, tier: FitnessTier): void {
  update((s) => {
    s.me = { id: rid("p"), name: name.trim().slice(0, 20), tier };
  });
}

export function createCrew(name: string): void {
  update((s) => {
    s.crew = { name: name.trim().slice(0, 24) || "The Crew", code: newCrewCode() };
  });
}

export function joinCrew(code: string): void {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (c.length < 4) return;
  update((s) => {
    s.crew = { name: `Crew ${c}`, code: c };
  });
}

export function createMatchAction(exerciseIds: string[], targetReps: number, playDays: number[]): string {
  const id = rid("m");
  update((s) => {
    if (!s.me) return;
    const exercises = EXERCISES.filter((e) => exerciseIds.includes(e.id));
    let m = createMatch(
      { id, exercises, targetReps, playDays: playDays.length ? playDays : [1, 3, 5] },
      [s.me]
    );
    m = startMatch(m);
    s.matches.push(m);
    const pot = createPot(rid("pot"), id);
    s.pots[id] = contribute(pot, s.me.id, STAKE_CENTS);
  });
  return id;
}

/** Add the local demo crewmates to a match (each stakes into the pot). */
export function addDemoCrew(matchId: string): number {
  let added = 0;
  update((s) => {
    const m = s.matches.find((x) => x.config.id === matchId);
    if (!m) return;
    for (const p of DEMO_CREW) {
      if (m.players.some((x) => x.id === p.id)) continue;
      m.players.push({ ...p });
      s.pots[matchId] = contribute(s.pots[matchId], p.id, STAKE_CENTS);
      added++;
    }
  });
  return added;
}

/**
 * Log a rep entry. Returns true if this entry closed the match
 * (player's raw total reached the target).
 *
 * Comeback rule: if the player is >30% behind the leader and hasn't used
 * their once-per-match comeback yet, the entry is flagged (×1.2 — engine
 * applies the multiplier once lane 6's comeback scoring lands).
 * If a season is active, a closed match is recorded into it (idempotent).
 */
export function logEntry(
  matchId: string,
  playerId: string,
  exerciseId: string,
  reps: number,
  verified: boolean
): boolean {
  let closed = false;
  update((s) => {
    const m = s.matches.find((x) => x.config.id === matchId);
    if (!m || m.status !== "live") return;
    let entry = { playerId, exerciseId, reps, at: Date.now(), verified };
    if (comebackArmed(m, playerId)) entry = applyComeback(entry) as typeof entry;
    const res = logReps(m, entry);
    m.entries = res.state.entries;
    m.status = res.state.status;
    m.completedAt = res.state.completedAt;
    m.closedBy = res.state.closedBy;
    closed = res.closedMatch;
    if (res.closedMatch && s.season && !s.season.endedAt) {
      const rec = buildSeasonResult(s, res.state);
      if (rec) s.season = recordSeasonMatch(s.season, rec);
    }
  });
  return closed;
}

/** Season points: play 1, win +3, MVP +1 (winner's row = 4). */
function buildSeasonResult(s: AppState, m: MatchState): SeasonMatchResult | null {
  if (m.status !== "complete") return null;
  const win = winner(m);
  if (!win) return null;
  const mvp = s.mvp?.[m.config.id];
  return {
    matchId: m.config.id,
    at: m.completedAt ?? Date.now(),
    winnerId: win.playerId,
    mvpPlayerId: mvp,
    rows: standings(m).map((r) => ({
      playerId: r.player.id,
      won: r.player.id === win.playerId,
      points:
        (r.player.id === win.playerId ? SEASON_WIN_POINTS : 0) +
        SEASON_PLAY_POINTS +
        (mvp === r.player.id ? SEASON_MVP_POINTS : 0),
    })),
  };
}

// ── seasons ──────────────────────────────────────────────────────────────────

/** Start a 4-week season for the crew. */
export function startSeasonAction(name: string): void {
  update((s) => {
    if (s.season && !s.season.endedAt) return; // one active season at a time
    s.season = createSeason({
      id: rid("sn"),
      name: name.trim().slice(0, 24) || "Season 1",
      weeks: 4,
      startedAt: Date.now(),
    });
  });
}

/** Forgive MY streak for today — $2 into the season charity pot. */
export function forgiveStreakAction(): void {
  update((s) => {
    if (!s.me || !s.season || s.season.endedAt) return;
    s.season = forgiveStreakFn(s.season, s.me.id);
  });
}

/** End the season now — champion is stamped from the ladder. */
export function endSeasonAction(): void {
  update((s) => {
    if (!s.season || s.season.endedAt) return;
    s.season = endSeasonFn(s.season);
  });
}

/** Start a fresh season; the ended one moves to seasonHistory (champions list). */
export function startNextSeasonAction(name: string): void {
  update((s) => {
    if (s.season) {
      const done = s.season.endedAt ? s.season : endSeasonFn(s.season);
      s.seasonHistory = [...(s.seasonHistory ?? []), done];
    }
    s.season = createSeason({
      id: rid("sn"),
      name: name.trim().slice(0, 24) || "Season 1",
      weeks: 4,
      startedAt: Date.now(),
    });
  });
}

// ── MVP vote ─────────────────────────────────────────────────────────────────

/** One local vote per match; upserts the season record with the MVP. */
export function voteMvp(matchId: string, playerId: string): void {
  update((s) => {
    if (s.mvp?.[matchId]) return; // vote already locked
    s.mvp = s.mvp ?? {};
    s.mvp[matchId] = playerId;
    const m = s.matches.find((x) => x.config.id === matchId);
    if (s.season && !s.season.endedAt && m && m.status === "complete") {
      const rec = buildSeasonResult(s, m);
      if (rec) s.season = recordSeasonMatch(s.season, rec);
    }
  });
}

export function designateCharity(matchId: string, charityId: string): void {
  update((s) => {
    const pot = s.pots[matchId];
    if (pot) s.pots[matchId] = designate(pot, { id: charityId, name: "" });
  });
}

export function resetAll(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.hash = "#/";
  location.reload();
}
