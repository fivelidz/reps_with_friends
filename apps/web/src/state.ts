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
import {
  armSync,
  ensureCrewRemote,
  flush,
  mergePulled,
  pullCrew,
  resetSync,
  setOnCrewAdopted,
  syncEnabled,
  syncLog,
  syncMatchCreate,
  syncMvp,
  syncPlayersAdded,
  syncSeason,
  syncToast,
} from "./sync.ts";

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

// ── server sync (offline-first — every call below is a no-op when sync is
//    disabled; see sync.ts. Local state always wins while offline.) ──────────

/** When the API mints a different crew code, adopt it locally — once. */
setOnCrewAdopted((remoteCode) => {
  update((s) => {
    if (s.crew && s.crew.code !== remoteCode) s.crew.code = remoteCode;
  });
  syncToast(`Server synced your crew — your code is now ${remoteCode}`, "ok");
});

/** Everyone this device knows about (me + all match rosters). */
function crewRoster(st: AppState): Player[] {
  const map = new Map<string, Player>();
  if (st.me) map.set(st.me.id, st.me);
  for (const m of st.matches) for (const p of m.players) if (!map.has(p.id)) map.set(p.id, p);
  return [...map.values()];
}

/** Ensure the crew has a remote twin (arms sync on first use). `probe` = the
 *  join path (check for an existing twin first); create goes straight to POST. */
async function kickOffCrewSync(arm: boolean, probe: boolean): Promise<void> {
  const st = getState();
  if (!st.crew) return;
  if (arm) armSync();
  if (!syncEnabled()) return;
  const r = await ensureCrewRemote(st.crew, crewRoster(st), { probe });
  if (r.ok) {
    void flush();
    touch(); // re-render — the crew screen's sync card flips to "pull"
  } else if (r.reason && r.reason !== "disabled") {
    syncToast("Server unreachable — actions will sync when it's back", "warn");
  }
}

/** Crew-screen button: opt in + mirror this crew to the server. */
export function syncCrewNow(): void {
  void kickOffCrewSync(true, true);
}

/** Pull the remote twin and merge (phones + bots converge here). */
export function pullCrewIntoState(): void {
  if (!syncEnabled()) return;
  void (async () => {
    try {
      const pulled = await pullCrew();
      if (!pulled) return;
      const next = mergePulled(getState(), pulled);
      if (next) {
        state = next;
        persist();
        renderer?.();
        syncToast("Pulled the latest from the server", "ok");
      }
    } catch {
      syncToast("Server unreachable — try again when it's back", "warn");
    }
  })();
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
  if (syncEnabled()) void kickOffCrewSync(false, false);
}

export function joinCrew(code: string): void {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (c.length < 4) return;
  update((s) => {
    s.crew = { name: `Crew ${c}`, code: c };
  });
  if (syncEnabled()) void kickOffCrewSync(false, true);
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
  const created = getMatch(id);
  if (created) syncMatchCreate(created);
  return id;
}

/** Add the local demo crewmates to a match (each stakes into the pot). */
export function addDemoCrew(matchId: string): number {
  let added = 0;
  const addedPlayers: Player[] = [];
  update((s) => {
    const m = s.matches.find((x) => x.config.id === matchId);
    if (!m) return;
    for (const p of DEMO_CREW) {
      if (m.players.some((x) => x.id === p.id)) continue;
      m.players.push({ ...p });
      s.pots[matchId] = contribute(s.pots[matchId], p.id, STAKE_CENTS);
      added++;
      addedPlayers.push({ ...p });
    }
  });
  if (added > 0) syncPlayersAdded(matchId, addedPlayers);
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
  verified: boolean,
  // lane 7 (verification & wearables) — optional fields appended to the entry.
  extra?: { avgHrrPct?: number }
): boolean {
  let closed = false;
  let landed: { playerId: string; exerciseId: string; reps: number; at: number; verified: boolean } | null = null;
  update((s) => {
    const m = s.matches.find((x) => x.config.id === matchId);
    if (!m || m.status !== "live") return;
    const before = m.entries.length;
    let entry = {
      playerId,
      exerciseId,
      reps,
      at: Date.now(),
      verified,
      ...(extra?.avgHrrPct != null ? { avgHrrPct: extra.avgHrrPct } : {}),
    };
    if (comebackArmed(m, playerId)) entry = applyComeback(entry) as typeof entry;
    const res = logReps(m, entry);
    m.entries = res.state.entries;
    m.status = res.state.status;
    m.completedAt = res.state.completedAt;
    m.closedBy = res.state.closedBy;
    closed = res.closedMatch;
    if (res.state.entries.length > before) landed = { ...entry };
    if (res.closedMatch && s.season && !s.season.endedAt) {
      const rec = buildSeasonResult(s, res.state);
      if (rec) s.season = recordSeasonMatch(s.season, rec);
    }
  });
  if (landed) {
    const e = landed as { playerId: string; exerciseId: string; reps: number; at: number; verified: boolean };
    syncLog(matchId, e.playerId, e.exerciseId, e.reps, e.verified, e.at);
  }
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
  let started = false;
  update((s) => {
    if (s.season && !s.season.endedAt) return; // one active season at a time
    s.season = createSeason({
      id: rid("sn"),
      name: name.trim().slice(0, 24) || "Season 1",
      weeks: 4,
      startedAt: Date.now(),
    });
    started = true;
  });
  if (started) syncSeason(name.trim().slice(0, 24) || "Season 1");
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
  let started = false;
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
    started = true;
  });
  if (started) syncSeason(name.trim().slice(0, 24) || "Season 1");
}

// ── MVP vote ─────────────────────────────────────────────────────────────────

/** One local vote per match; upserts the season record with the MVP. */
export function voteMvp(matchId: string, playerId: string): void {
  let voted = false;
  update((s) => {
    if (s.mvp?.[matchId]) return; // vote already locked
    s.mvp = s.mvp ?? {};
    s.mvp[matchId] = playerId;
    voted = true;
    const m = s.matches.find((x) => x.config.id === matchId);
    if (s.season && !s.season.endedAt && m && m.status === "complete") {
      const rec = buildSeasonResult(s, m);
      if (rec) s.season = recordSeasonMatch(s.season, rec);
    }
  });
  if (voted) syncMvp(matchId, playerId);
}

export function designateCharity(matchId: string, charityId: string): void {
  update((s) => {
    const pot = s.pots[matchId];
    if (pot) s.pots[matchId] = designate(pot, { id: charityId, name: "" });
  });
}

export function resetAll(): void {
  resetSync(); // fresh start = fresh sync (mappings + outbox + arming)
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.hash = "#/";
  location.reload();
}
