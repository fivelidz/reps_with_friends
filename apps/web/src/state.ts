// App state — single object, persisted to localStorage (key rwf.state.v1).
// The engine (game-core) is pure; all persistence + orcheststration lives here.

import {
  contribute,
  createMatch,
  createPot,
  designate,
  logReps,
  startMatch,
  type CharityPot,
  type FitnessTier,
  type MatchState,
  type Player,
} from "./engine.ts";
import { DEMO_CREW, EXERCISES, STAKE_CENTS } from "./data.ts";

const KEY = "rwf.state.v1";

export interface AppState {
  v: 1;
  me: Player | null;
  crew: { name: string; code: string } | null;
  matches: MatchState[]; // chronological; render reversed
  pots: Record<string, CharityPot>;
}

function defaultState(): AppState {
  return { v: 1, me: null, crew: null, matches: [], pots: {} };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw) as AppState;
    if (p && p.v === 1 && Array.isArray(p.matches) && typeof p.pots === "object") return p;
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
    const res = logReps(m, { playerId, exerciseId, reps, at: Date.now(), verified });
    m.entries = res.state.entries;
    m.status = res.state.status;
    m.completedAt = res.state.completedAt;
    m.closedBy = res.state.closedBy;
    closed = res.closedMatch;
  });
  return closed;
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
