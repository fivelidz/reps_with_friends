// Sync layer — mirrors local actions to the unified RWF API (apps/api, :4174)
// and pulls remote crew data back in. OFFLINE-FIRST: localStorage stays the
// source of truth; every mirror is fire-and-forget, failures land in a
// persistent outbox (rwf.outbox.v1) and flush on the next action / reconnect
// / retry tick. The UI is never blocked on the network.
//
// Availability model (blocker T5):
//   • The deployed Pages bundle has NO apps/api behind it → sync is only
//     *available* on localhost / 127.0.0.1 (dev API at http://localhost:4174).
//   • Availability ≠ armed. Arming is a one-tap opt-in ("Sync this crew to
//     the server" on the crew screen) persisted in rwf.sync.armed — so plain
//     dev/test sessions (and headless browser tests that clear storage) never
//     fire a single network request unless someone asked for sync.
//   • Unavailable or un-armed → every sync* export is a synchronous no-op.
//
// Id mapping: the app mints its own player/match ids and so does the API.
// meta.players / meta.matches (rwf.sync.v1) hold local→remote maps; remote
// entities pulled in that we've never seen are adopted with their remote id
// as the local id (identity mapping), which is how a phone + the chat bots
// converge on one scoreboard later.

import type { AppState } from "./state.ts"; // type-only — no runtime cycle
import {
  createPot,
  playerRawReps,
  type MatchState,
  type Player,
  type RepEntry,
} from "./engine.ts";

// ── config ───────────────────────────────────────────────────────────────────

const META_KEY = "rwf.sync.v1";
const OUTBOX_KEY = "rwf.outbox.v1";
const BASE_KEY = "rwf.sync.base"; // manual override (e.g. http://localhost:4300)
const ARMED_KEY = "rwf.sync.armed"; // "1" after the user opts in
const DEFAULT_BASE = "http://localhost:4174";

/** Match-create ops wait this long before sending: the "add demo crew" flow
 *  lands seconds after creation, and the API snapshots the crew roster at
 *  match creation — a small settle window captures the full roster. */
const MATCH_SETTLE_MS = 2500;
/** Retry tick while there is a queue (API down → restart auto-flushes). */
const RETRY_MS = 15000;
/** Hard timeout for any API call (a hung server must not pile up requests). */
const REQUEST_TIMEOUT_MS = 8000;

function detectBase(): string | null {
  try {
    if (typeof location === "undefined") return null; // tests / non-browser
    const h = location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") return null; // deployed → no API
    const override = localStorage.getItem(BASE_KEY);
    return override && override.trim() ? override.trim() : DEFAULT_BASE;
  } catch {
    return null;
  }
}

// ── persisted sync meta (local↔remote id maps) ───────────────────────────────

interface CrewHint {
  name: string;
  code: string;
  players: Player[];
  /** Join path probes GET /crews/:code for an existing twin first; the create
   *  path skips the probe (a fresh local code can't have a twin, and a 404
   *  probe would surface as a console error in the browser). */
  probe: boolean;
}

interface SyncMeta {
  /** Remote twin's crew code (== local code once adopted). null = no twin. */
  crewCode: string | null;
  /** Last crew snapshot seen — lets the retry tick re-run ensureCrewRemote
   *  without access to app state (sync.ts never imports state.ts at runtime). */
  crewHint: CrewHint | null;
  /** local playerId → remote playerId */
  players: Record<string, string>;
  /** local matchId → remote matchId */
  matches: Record<string, string>;
  /** Epoch ms of the last successful API round-trip. */
  lastOk: number | null;
}

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SyncMeta>;
      return {
        crewCode: p.crewCode ?? null,
        crewHint: p.crewHint ?? null,
        players: p.players ?? {},
        matches: p.matches ?? {},
        lastOk: p.lastOk ?? null,
      };
    }
  } catch {
    /* corrupt → fresh */
  }
  return { crewCode: null, crewHint: null, players: {}, matches: {}, lastOk: null };
}

let meta = loadMeta();

function saveMeta(): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage blocked — sync still works in-memory this session */
  }
}

// ── outbox ───────────────────────────────────────────────────────────────────

type Op =
  | {
      kind: "match";
      queuedAt: number;
      matchId: string;
      exercises: { id: string; name: string }[];
      target: number;
      playDays: number[];
      players: Player[];
    }
  | {
      kind: "log";
      queuedAt: number;
      matchId: string;
      playerId: string;
      exerciseId: string;
      reps: number;
      verified: boolean;
      at: number;
    }
  | { kind: "mvp"; queuedAt: number; matchId: string; playerId: string }
  | { kind: "season"; queuedAt: number; name: string };

function loadOutbox(): Op[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p as Op[];
    }
  } catch {
    /* corrupt → fresh */
  }
  return [];
}

let outbox: Op[] = loadOutbox();

function saveOutbox(): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    /* ignore */
  }
}

// ── availability / arming ────────────────────────────────────────────────────

const base = detectBase();

/** A dev API is reachable-by-config (localhost). Does NOT mean armed. */
export function syncAvailable(): boolean {
  return base != null;
}

/** Sync is available AND the user opted in (or a twin already exists). */
export function syncEnabled(): boolean {
  if (!syncAvailable()) return false;
  try {
    if (localStorage.getItem(ARMED_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return meta.crewCode != null || Object.keys(meta.matches).length > 0;
}

/** One-tap opt-in (crew screen "Sync this crew to the server"). */
export function armSync(): void {
  try {
    localStorage.setItem(ARMED_KEY, "1");
  } catch {
    /* ignore */
  }
  notify();
}

export function syncBase(): string | null {
  return base;
}

/** Remote twin exists (crew mirrored at least once). */
export function syncHasCrew(): boolean {
  return meta.crewCode != null;
}

// ── status snapshot + subscribers (drives the header chip) ───────────────────

export type SyncState = "off" | "ready" | "syncing" | "synced" | "offline";

export interface SyncSnapshot {
  state: SyncState;
  available: boolean;
  enabled: boolean;
  base: string | null;
  crewCode: string | null;
  queued: number;
  lastOk: number | null;
}

export function syncSnapshot(): SyncSnapshot {
  const available = syncAvailable();
  const enabled = syncEnabled();
  return {
    state: !available ? "off" : !enabled ? "ready" : outbox.length > 0 ? "offline" : meta.lastOk ? "synced" : "syncing",
    available,
    enabled,
    base,
    crewCode: meta.crewCode,
    queued: outbox.length,
    lastOk: meta.lastOk,
  };
}

type Sub = (s: SyncSnapshot) => void;
const subs = new Set<Sub>();

export function subscribeSync(fn: Sub): () => void {
  subs.add(fn);
  try {
    fn(syncSnapshot());
  } catch {
    /* subscriber's own error — ignore */
  }
  return () => {
    subs.delete(fn);
  };
}

function notify(): void {
  const snap = syncSnapshot();
  for (const fn of subs) {
    try {
      fn(snap);
    } catch {
      /* ignore */
    }
  }
}

// ── toaster + adoption hooks (set by main.ts / state.ts — keeps sync.ts DOM-free) ──

type Toaster = (msg: string, tone: "ok" | "warn" | "info") => void;
let toaster: Toaster = () => {};

export function setSyncToaster(fn: Toaster): void {
  toaster = fn;
}

export function syncToast(msg: string, tone: "ok" | "warn" | "info" = "info"): void {
  try {
    toaster(msg, tone);
  } catch {
    /* ignore */
  }
}

let onAdopted: ((remoteCode: string) => void) | null = null;

/** state.ts registers this: adopting a remote crew code rewrites local state. */
export function setOnCrewAdopted(fn: ((remoteCode: string) => void) | null): void {
  onAdopted = fn;
}

// ── API client ───────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl?.signal,
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : "network error");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* body wasn't json */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

// ── crew ensure (the join key between app, phones and bots) ──────────────────

export interface EnsureResult {
  ok: boolean;
  code?: string;
  adopted: boolean;
  reason?: string;
}

/**
 * Make sure the local crew has a remote twin.
 *  1. GET /crews/:localCode (join path only, opts.probe) — a twin may already
 *     exist (a bot or another phone created it). If so we keep the code as-is.
 *  2. Otherwise POST /crews (local code passed as a hint; the API mints its
 *     own). If the remote code differs → ADOPT it locally (setOnCrewAdopted
 *     hook rewrites app state + tells the user once).
 *  3. Register any players we don't have remote ids for.
 */
export async function ensureCrewRemote(
  crew: { name: string; code: string },
  players: Player[],
  opts: { probe?: boolean } = {}
): Promise<EnsureResult> {
  if (!syncEnabled()) return { ok: false, adopted: false, reason: "disabled" };
  // Stash the hint so the retry tick can re-run ensure after an outage.
  const hint: CrewHint = meta.crewHint
    ? { ...meta.crewHint, players: [...meta.crewHint.players] }
    : { name: crew.name, code: crew.code, players: [], probe: opts.probe ?? true };
  if (crew.code === hint.code || !meta.crewHint) {
    hint.name = crew.name;
    hint.code = crew.code;
  }
  if (opts.probe != null) hint.probe = opts.probe;
  for (const p of players) if (!hint.players.some((x) => x.id === p.id)) hint.players.push({ ...p });
  meta.crewHint = hint;

  try {
    let code = crew.code;
    let exists = false;
    if (hint.probe) {
      try {
        await api("GET", `/crews/${crew.code}`);
        exists = true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) exists = false;
        else throw e;
      }
    }
    if (!exists) {
      const created = await api<{ code: string }>("POST", "/crews", {
        name: crew.name || `Crew ${crew.code}`,
        codeHint: crew.code, // the API mints its own code; ours is a hint
      });
      code = created.code;
    }
    const adopted = code !== crew.code;
    meta.crewCode = code;
    saveMeta();
    await ensurePlayers(players);
    meta.lastOk = Date.now();
    saveMeta();
    notify();
    if (adopted && onAdopted) {
      try {
        onAdopted(code);
      } catch {
        /* ignore */
      }
    }
    return { ok: true, code, adopted };
  } catch (e) {
    saveMeta(); // keep the hint even on failure
    notify();
    return { ok: false, adopted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** POST any players that don't have a remote id yet (idempotent per session). */
async function ensurePlayers(players: Player[]): Promise<void> {
  for (const p of players) {
    if (meta.players[p.id]) continue;
    const r = await api<{ player: Player }>("POST", `/crews/${meta.crewCode}/players`, {
      name: p.name,
      tier: p.tier,
    });
    meta.players[p.id] = r.player.id;
    saveMeta();
  }
}

// ── mirror actions (queue + fire-and-forget flush) ───────────────────────────

function enqueue(op: Op): void {
  if (!syncEnabled()) return;
  outbox.push(op);
  saveOutbox();
  notify();
  void flush();
}

/** Mirror a locally-created match. Snapshot includes the roster so the op is
 *  self-contained (and so demo players added moments later can merge in). */
export function syncMatchCreate(m: MatchState): void {
  enqueue({
    kind: "match",
    queuedAt: Date.now(),
    matchId: m.config.id,
    exercises: m.config.exercises.map((e) => ({ id: e.id, name: e.name })),
    target: m.config.targetReps,
    playDays: m.config.playDays,
    players: m.players.map((p) => ({ id: p.id, name: p.name, tier: p.tier })),
  });
}

/** Mirror a rep entry (raw fields — the API applies its own comeback rule). */
export function syncLog(matchId: string, playerId: string, exerciseId: string, reps: number, verified: boolean, at: number): void {
  enqueue({ kind: "log", queuedAt: Date.now(), matchId, playerId, exerciseId, reps, verified, at });
}

/** Mirror an MVP vote. */
export function syncMvp(matchId: string, playerId: string): void {
  enqueue({ kind: "mvp", queuedAt: Date.now(), matchId, playerId });
}

/** Mirror "season started" (push-only: remote seasons aren't imported — the
 *  API's season shape is the game-core one, not the app's engine-extras one). */
export function syncSeason(name: string): void {
  enqueue({ kind: "season", queuedAt: Date.now(), name });
}

/**
 * Players joined locally (e.g. demo crew added on the link screen). If the
 * remote match op is still queued, merge them into its roster snapshot; if it
 * already went out, register them as crew players (they'll be on the NEXT
 * remote match — the current API can't amend an existing match's roster).
 */
export function syncPlayersAdded(matchId: string | null, players: Player[]): void {
  if (!syncEnabled() || players.length === 0) return;
  if (matchId) {
    const pending = outbox.find((o): o is Extract<Op, { kind: "match" }> => o.kind === "match" && o.matchId === matchId);
    if (pending) {
      for (const p of players) if (!pending.players.some((x) => x.id === p.id)) pending.players.push({ ...p });
      saveOutbox();
      return; // registered as part of match creation
    }
  }
  if (meta.crewCode) {
    void ensurePlayers(players).catch(() => {
      /* offline — they'll register on the next match create */
    });
  }
}

// ── flush ────────────────────────────────────────────────────────────────────

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(delay: number): void {
  if (retryTimer != null || typeof setTimeout === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, Math.max(0, delay));
}

/** Drain the outbox in order. Never throws; safe to call from anywhere. */
export async function flush(): Promise<void> {
  if (!syncEnabled() || flushing || outbox.length === 0) return;
  flushing = true;
  try {
    while (outbox.length > 0) {
      const op = outbox[0];
      // Settle window for match creates (roster may still be growing).
      if (op.kind === "match" && Date.now() - op.queuedAt < MATCH_SETTLE_MS) {
        scheduleFlush(MATCH_SETTLE_MS - (Date.now() - op.queuedAt));
        break;
      }
      // No twin yet → try to ensure one from the stashed hint, then proceed.
      if (!meta.crewCode) {
        if (meta.crewHint) {
          // FIX 2026-08-27: always PROBE on the retry path. The create path
          // stashes probe:false (a freshly-minted local code can't have a twin
          // yet, and probing would log a 404 in the console). But by the time we
          // get here the crew may well exist remotely — e.g. the create POST
          // actually succeeded and only the *response* was lost, or another
          // device already mirrored this crew. Re-running with probe:false would
          // blindly POST a SECOND crew, splitting the roster across two codes
          // and stranding every queued op on the wrong one. A probe costs one
          // GET and makes the ensure idempotent.
          const r = await ensureCrewRemote(meta.crewHint, meta.crewHint.players, { probe: true });
          if (!r.ok) break; // still offline — retry tick will come back
        } else break;
      }
      try {
        await sendOp(op);
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          // Permanent client error (e.g. remote match already complete, or a
          // player that never made it into the remote roster). Local truth
          // wins — drop the op and keep the queue moving.
          outbox.shift();
          saveOutbox();
          console.warn(`[sync] dropped ${op.kind} op: ${e.status} ${e.message}`);
          if (e.status === 404 && /crew/i.test(e.message)) {
            // The server lost our crew (fresh db) — offer re-sync.
            meta.crewCode = null;
            saveMeta();
          }
          continue;
        }
        break; // network / 5xx — keep op, retry later
      }
      outbox.shift();
      saveOutbox();
      meta.lastOk = Date.now();
      saveMeta();
    }
  } finally {
    flushing = false;
    notify();
  }
}

async function sendOp(op: Op): Promise<void> {
  switch (op.kind) {
    case "match": {
      await ensurePlayers(op.players);
      const r = await api<{ match: MatchState }>("POST", `/crews/${meta.crewCode}/matches`, {
        exercises: op.exercises,
        target: op.target,
        playDays: op.playDays,
      });
      meta.matches[op.matchId] = r.match.config.id;
      saveMeta();
      return;
    }
    case "log": {
      const rm = meta.matches[op.matchId];
      const rp = meta.players[op.playerId];
      if (!rm || !rp) return; // mirror was dropped — nothing to send to
      await api("POST", `/matches/${rm}/log`, {
        playerId: rp,
        exerciseId: op.exerciseId,
        reps: op.reps,
        verified: op.verified,
      });
      return;
    }
    case "mvp": {
      const rm = meta.matches[op.matchId];
      const rp = meta.players[op.playerId];
      if (!rm || !rp) return;
      await api("POST", `/matches/${rm}/mvp`, { playerId: rp });
      return;
    }
    case "season": {
      await api("POST", `/crews/${meta.crewCode}/season`, { name: op.name });
      return;
    }
  }
}

// ── pull (server → local merge) ──────────────────────────────────────────────

export interface PulledMatch {
  match: MatchState;
  mvpPlayerId: string | null;
}

export interface Pulled {
  code: string;
  matches: PulledMatch[];
  season: unknown | null;
}

/** GET /crews/:code + every full match behind it. Null when sync is off/unknown. */
export async function pullCrew(code?: string): Promise<Pulled | null> {
  if (!syncEnabled()) return null;
  const c = code ?? meta.crewCode;
  if (!c) return null;
  const head = await api<{ crew: { code: string }; matches: { id: string }[] }>("GET", `/crews/${c}`);
  const matches: PulledMatch[] = [];
  for (const sum of head.matches ?? []) {
    try {
      const full = await api<{ match: MatchState; mvpPlayerId: string | null }>("GET", `/matches/${sum.id}`);
      matches.push({ match: full.match, mvpPlayerId: full.mvpPlayerId ?? null });
    } catch {
      /* skip a broken match — the rest still merge */
    }
  }
  meta.lastOk = Date.now();
  saveMeta();
  notify();
  return { code: head.crew?.code ?? c, matches, season: null };
}

/**
 * Merge pulled remote data into a cloned app state. Offline-first LWW:
 *  • entries union by (playerId, at, reps) — both sides keep every set;
 *  • unknown remote players are adopted (remote id becomes local id);
 *  • a live local match flips complete when the union crosses the target
 *    (deterministic replay in entry order);
 *  • remote matches with no local twin are imported wholesale (+ empty pot);
 *  • remote MVP votes fill local gaps.
 * Returns the new AppState, or null when nothing changed.
 * (Remote seasons are NOT imported — the API season shape is game-core's,
 *  not the app's engine-extras shape. Push-only for now.)
 */
export function mergePulled(s: AppState, pulled: Pulled): AppState | null {
  const revPlayers: Record<string, string> = {}; // remote → local
  for (const [loc, rem] of Object.entries(meta.players)) revPlayers[rem] = loc;

  const toLocalId = (rid: string): string => {
    const loc = revPlayers[rid];
    if (loc) return loc;
    // Unknown remote player (joined via bot / another phone) — adopt identity.
    meta.players[rid] = rid;
    revPlayers[rid] = rid;
    saveMeta();
    return rid;
  };

  let changed = false;
  const next: AppState = JSON.parse(JSON.stringify(s)) as AppState;
  next.mvp = next.mvp ?? {};

  for (const pm of pulled.matches) {
    const rm = pm.match;
    if (!rm || !rm.config) continue;
    const twinIdx = next.matches.findIndex(
      (m) => m.config.id === rm.config.id || meta.matches[m.config.id] === rm.config.id
    );
    if (twinIdx === -1) {
      // Import wholesale under identity ids.
      const imported: MatchState = {
        ...rm,
        players: rm.players.map((p) => ({ ...p, id: toLocalId(p.id) })),
        entries: rm.entries.map((e) => ({ ...e, playerId: toLocalId(e.playerId) })),
        closedBy: rm.closedBy != null ? toLocalId(rm.closedBy) : undefined,
      };
      next.matches.push(imported);
      meta.matches[imported.config.id] = rm.config.id;
      if (!next.pots[imported.config.id]) next.pots[imported.config.id] = createPot(`pot_${rm.config.id}`, rm.config.id);
      if (pm.mvpPlayerId && !next.mvp[imported.config.id]) next.mvp[imported.config.id] = toLocalId(pm.mvpPlayerId);
      changed = true;
      continue;
    }

    const twin: MatchState = { ...next.matches[twinIdx] };
    const knownPlayers = new Set(twin.players.map((p) => p.id));
    const newPlayers = rm.players.map((p) => ({ ...p, id: toLocalId(p.id) })).filter((p) => !knownPlayers.has(p.id));

    const seen = new Set(twin.entries.map((e) => `${e.playerId}|${e.at}|${e.reps}`));
    const add: RepEntry[] = [];
    for (const e of rm.entries) {
      const pid = toLocalId(e.playerId);
      const key = `${pid}|${e.at}|${e.reps}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add.push({ ...e, playerId: pid });
    }

    if (newPlayers.length > 0 || add.length > 0) {
      twin.players = [...twin.players, ...newPlayers];
      twin.entries = [...twin.entries, ...add].sort((a, b) => a.at - b.at);
      if (twin.status === "live") detectClosure(twin);
      next.matches[twinIdx] = twin;
      changed = true;
    }
    if (pm.mvpPlayerId && !next.mvp[twin.config.id]) {
      next.mvp[twin.config.id] = toLocalId(pm.mvpPlayerId);
      changed = true;
    }
  }

  return changed ? next : null;
}

/** First-crossing replay: who closed the match, and when. */
function detectClosure(twin: MatchState): void {
  const totals: Record<string, number> = {};
  for (const e of twin.entries) {
    totals[e.playerId] = (totals[e.playerId] ?? 0) + e.reps;
    if (totals[e.playerId] >= twin.config.targetReps) {
      twin.status = "complete";
      twin.closedBy = e.playerId;
      twin.completedAt = e.at;
      return;
    }
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────

/** Wire reconnect listeners + the retry tick. Call once from main.ts. */
export function initSync(): void {
  if (!syncAvailable() || typeof window === "undefined") return;
  try {
    window.addEventListener("online", () => void flush());
  } catch {
    /* ignore */
  }
  if (typeof setInterval === "function") {
    setInterval(() => {
      if (!syncEnabled() || outbox.length === 0) return;
      // No twin yet but we know the crew → re-run ensure (covers "API was
      // down when the crew was created"), then drain.
      if (!meta.crewCode && meta.crewHint) {
        void ensureCrewRemote(meta.crewHint, meta.crewHint.players).then(() => flush());
      } else {
        void flush();
      }
    }, RETRY_MS);
  }
  // Drain anything left over from a previous offline session.
  void flush();
}

/** Wipe all sync state (called from resetAll — fresh start means fresh sync). */
export function resetSync(): void {
  meta = { crewCode: null, crewHint: null, players: {}, matches: {}, lastOk: null };
  outbox = [];
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem(ARMED_KEY);
  } catch {
    /* ignore */
  }
  notify();
}
