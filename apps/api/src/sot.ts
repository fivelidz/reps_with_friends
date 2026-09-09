// @rwf/api — SOT groups (M1): the shared daily-battle authority.
// ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
// THE ANSWER to "why do the bots have to run on my system?": the game-state
// authority lives HERE, and everything else is a client —
//   · the v4 app posts logs / polls state (apps/sot/cloud.js)
//   · bots post the SAME text commands through SotCommandBus, server-side
//     (POST /sot/groups/:code/cmd — one brain, docs/22)
//   · wherever this API runs, the bots run beside it; nobody's laptop is
//     load-bearing.
//
// The engine is the app's OWN engine — apps/sot-engine.js imported directly
// (pure ES module, zero DOM deps; Bun runs it natively). One engine
// everywhere: app, API, bots, tests.
//
// Groups are stored bus-side compatible (config/players/season/day/dayDate —
// the same StoredSotGroup shape @rwf/bot-core's SotStore persists), so the
// SotCommandBus can drive ANY group through /cmd while the structured
// endpoints (create/players/log/state) share the very same objects.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

import {
  type FitnessTier,
  type Player,
} from "../../../packages/game-core/src/index.ts";
import {
  DEFAULT_DAY_KIT,
  SotCommandBus,
  parseSot,
} from "../../../packages/bot-core/src/index.ts";
// The shared daily-battle engine — the SAME file the v4 app imports.
// @ts-expect-error — pure browser-safe JS module (no types shipped)
import * as E from "../../../apps/sot-engine.js";

// ── records ─────────────────────────────────────────────────────────────────

export interface SotExerciseDef {
  id: string;
  name?: string;
}

export interface SotGroupConfig {
  id: string;
  targetReps: number;
  playDays: number[];
  exercises: SotExerciseDef[];
  /** Day window for opened battles (ms). Default: until 21:00 local. */
  dayWindowMs?: number;
  /** Engine day flags (default {stealCanTriggerWin:true} — the app's stance). */
  flags?: Record<string, boolean>;
}

export interface SotEvent {
  id: string;
  at: number;
  kind: string;
  playerId?: string;
  text: string;
}

/**
 * One server-side SOT group. Superset of bot-core's StoredSotGroup
 * (config/players/season/day/dayDate) + the API shell: join code, the
 * auth-lite token map, the monotonic seq, and the event feed the app merges.
 */
export interface ServerSotGroup {
  code: string;
  name: string;
  createdAt: number;
  config: SotGroupConfig;
  players: Player[];
  /** playerToken → playerId. Tokens never leave the server after issuance. */
  tokens: Record<string, string>;
  season: any; // engine BattleSeasonState
  day: any | null; // engine DailyBattleState
  dayDate: string | null;
  /** Monotonic mutation counter — clients poll state?since=seq. */
  seq: number;
  events: SotEvent[];
  creatorPlayerId?: string;
  clientLogIds?: Record<string, string[]>;
  clientCmdIds?: Record<string, string[]>;
}

// ── store (.data/sot-api.json — atomic writes; Postgres later per docs/22) ──

const defaultPath = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../../.data/sot-api.json"
);

export function sotDbPath(): string {
  return process.env.RWF_SOT_DB || defaultPath;
}

interface SotDb {
  groups: Record<string, ServerSotGroup>;
}

const emptySotDb = (): SotDb => ({ groups: {} });

function loadSotDb(): SotDb {
  const path = sotDbPath();
  if (!existsSync(path)) return emptySotDb();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SotDb>;
    return { groups: parsed.groups ?? {} };
  } catch {
    return emptySotDb(); // corrupt → fresh (tmp+rename writes make this rare)
  }
}

function saveSotDb(db: SotDb): void {
  const path = sotDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, path);
}

/** Read-modify-write one group. Single-process pilot: no locking (docs/22). */
export function mutateGroup<T>(code: string, fn: (g: ServerSotGroup) => T): T {
  const db = loadSotDb();
  const g = db.groups[code.toUpperCase()];
  if (!g) throw new SotError(404, `no SOT group with code ${code.toUpperCase()}`);
  const out = fn(g);
  saveSotDb(db);
  return out;
}

export function findSotGroup(code: string): ServerSotGroup | undefined {
  return loadSotDb().groups[code.toUpperCase()];
}

export function sotGroupCount(): number {
  return Object.keys(loadSotDb().groups).length;
}

export class SotError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── codes, ids, time ────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const newToken = (): string => randomBytes(32).toString("base64url");

const newPid = (): string => `p_${randomUUID().slice(0, 8)}`;

function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Next 21:00 local (or +2h late at night) — same default as the chat bus. */
function defaultDeadline(now: number): number {
  const d = new Date(now);
  const ninePm = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 0, 0, 0).getTime();
  return ninePm > now ? ninePm : now + 2 * 60 * 60 * 1000;
}

const TIERS: FitnessTier[] = ["couch", "casual", "fit", "athlete"];

const DEFAULT_EXERCISES: SotExerciseDef[] = [
  { id: "pushups", name: "Push-ups" },
  { id: "squats", name: "Squats" },
  { id: "burpees", name: "Burpees" },
  { id: "lunges", name: "Lunges" },
  { id: "plank", name: "Plank Hold" },
];

export function pushEvent(g: ServerSotGroup, kind: string, text: string, playerId?: string): void {
  g.events.push({ id: `ce_${g.seq}_${g.events.length}`, at: Date.now(), kind, ...(playerId ? { playerId } : {}), text });
  if (g.events.length > 200) g.events.splice(0, g.events.length - 200);
}

function bump(g: ServerSotGroup): void {
  g.seq += 1;
}

// ── lifecycle: create → join (day auto-opens on first join) → log → close ──

export function createSotGroup(
  name: string,
  config: Partial<SotGroupConfig> = {},
  bots: { name: string; tier?: string; id?: string }[] = []
): { code: string; group: ServerSotGroup; botTokens: { name: string; playerId: string; playerToken: string }[] } {
  const db = loadSotDb();
  let code = "";
  do {
    code = Array.from({ length: 26 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  } while (db.groups[code]);
  const now = Date.now();
  const g: ServerSotGroup = {
    code,
    name: String(name || "The Crew").slice(0, 60),
    createdAt: now,
    config: {
      id: `sot-${code.toLowerCase()}-${now.toString(36)}`,
      targetReps: Number(config.targetReps) > 0 ? Number(config.targetReps) : (E as any).DEFAULT_DAILY_TARGET_RUF,
      playDays: Array.isArray(config.playDays) && config.playDays.length ? config.playDays.slice(0, 7) : [1, 2, 3, 4, 5],
      exercises: Array.isArray(config.exercises) && config.exercises.length ? config.exercises.slice(0, 24) : DEFAULT_EXERCISES,
      ...(config.dayWindowMs != null ? { dayWindowMs: Math.max(1000, Number(config.dayWindowMs)) } : {}),
      ...(config.flags ? { flags: config.flags } : {}),
    },
    players: [],
    tokens: {},
    season: null,
    day: null,
    dayDate: null,
    seq: 0,
    events: [],
  };
  // the weekly battle season (1 Daily Win = 1 point) — created on first
  // join (the engine refuses empty rosters), same engine the bots run
  g.season = null;
  // pre-registered non-device players (house crew / coach bots) — their tokens
  // come back ONCE on the create response; the creator's client keeps them.
  // bots must NOT claim group creatorship — the first HUMAN joiner
  // (POST /players, the group's actual owner) takes creatorPlayerId, so
  // creator-gated commands (day close force, season end) stay with the human.
  const creatorId = g.creatorPlayerId;
  const botTokens: { name: string; playerId: string; playerToken: string }[] = [];
  for (const b of bots.slice(0, 8)) {
    const tier = (TIERS as string[]).includes(b.tier ?? "") ? (b.tier as FitnessTier) : "casual";
    const joined = joinPlayer(g, {
      name: String(b.name).slice(0, 40), tier,
      ...(b.id && typeof b.id === "string" ? { id: b.id } : {}),
    }, now, { silent: true });
    botTokens.push({ name: joined.player.name, playerId: joined.playerId, playerToken: joined.playerToken });
  }
  g.creatorPlayerId = creatorId; // restore — bots joined but own nothing
  db.groups[code] = g;
  saveSotDb(db);
  return { code, group: g, botTokens };
}

/** Auth-lite join: mints a player + secret token (kept server-side). */
export function joinPlayer(
  g: ServerSotGroup,
  ident: { name: string; tier?: string; id?: string },
  now = Date.now(),
  opts: { silent?: boolean } = {}
): { playerId: string; playerToken: string; player: Player } {
  if (g.season && g.season.endedAt != null) throw new SotError(400, "that season is over — a new one starts next week");
  const tier = (TIERS as string[]).includes(ident.tier ?? "") ? (ident.tier as FitnessTier) : "casual";
  const name = String(ident.name || "").trim().slice(0, 40);
  if (!name) throw new SotError(400, "name required");
  // the client proposes its id (the app's local member id) so engine days hold
  // the SAME ids on both sides — the token stays the actual authority
  let id = newPid();
  if (typeof ident.id === "string" && /^[a-z0-9_:-]{2,40}$/i.test(ident.id)) {
    if (g.players.some((p) => p.id === ident.id)) {
      throw new SotError(409, "that player id is already claimed — choose 'I already have a player' and enter your code/token, or pick a new name");
    }
    id = ident.id;
  }
  const player: Player = { id, name, tier };
  const playerToken = newToken();

  g.players = [...g.players, player];
  g.tokens[playerToken] = player.id;
  if (!g.creatorPlayerId) g.creatorPlayerId = player.id;

  // season bookkeeping — create on the first joiner, zero-start patch after
  if (!g.season) {
    g.season = (E as any).createBattleSeason(
      {
        id: `season-${g.code.toLowerCase()}-${now.toString(36)}`,
        name: `Week of ${new Date(now).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
        playDays: g.config.playDays,
        targetReps: g.config.targetReps,
      },
      [player]
    );
  } else if (g.season.endedAt == null) {
    g.season = {
      ...g.season,
      players: [...g.season.players, player],
      points: { ...g.season.points, [player.id]: 0 },
      streaks: { ...g.season.streaks, [player.id]: { length: 0, best: 0, lastDate: null } },
    };
  }
  // late join INTO a live battle (app semantics — joiners see the live board
  // immediately; the chat bus is stricter but the API is the app's authority)
  if (g.day && g.day.status === "live") patchDayJoiner(g.day, player);

  bump(g);
  if (!opts.silent) pushEvent(g, "join", `⚔️ ${name} joined the battle (tier ${tier})`, player.id);
  return { playerId: player.id, playerToken, player };
}

/** Add a player to a LIVE day — mirrors createDay's zero-progress shape. */
function patchDayJoiner(day: any, player: Player): void {
  if (day.players.some((p: Player) => p.id === player.id)) return;
  day.players = [...day.players, player];
  day.progress = { ...day.progress, [player.id]: { playerId: player.id, ruf: 0, creditRuf: 0, bonusRuf: 0 } };
  day.inventory = { ...day.inventory, [player.id]: [] };
  for (const k of ["lightning", "lightningUsed", "stealUsed", "rescueUsed", "doubleDowns", "comboArmed"] as const) {
    if (day[k] && typeof day[k] === "object") day[k] = { ...day[k], [player.id]: day[k][player.id] ?? (k === "lightning" ? [] : 0) };
  }
}

/** Open the day (first join auto-opens; later days open via `start` cmd). */
export function openDay(g: ServerSotGroup, now: number): void {
  if (g.day && g.day.status === "live") return;
  const deadlineAt = g.config.dayWindowMs != null ? now + g.config.dayWindowMs : defaultDeadline(now);
  let day = (E as any).createDay(
    {
      id: `day-${g.config.id}-${isoDate(now)}`,
      playDays: g.config.playDays,
      deadlineAt,
      targetReps: g.config.targetReps,
      exercises: g.config.exercises,
      flags: { stealCanTriggerWin: true, ...(g.config.flags ?? {}) },
    },
    g.players
  );
  // canon power-up kit per player (same prototype economy as the chat bus)
  for (const p of g.players) for (const kind of DEFAULT_DAY_KIT) day = (E as any).grantPowerUp(day, p.id, kind);
  g.day = day;
  g.dayDate = isoDate(now);
  bump(g);
  const names = g.players.map((p) => p.name).join(", ");
  pushEvent(g, "battle_start", `🔔 Battle day is LIVE — first to ${g.config.targetReps} takes the Daily Win (${names || "no crew yet"})`);
}

/** Close + record a live day (deadline auto-close, or `day close force`). */
function closeDayAndRecord(g: ServerSotGroup, at: number): void {
  if (!g.day || g.day.status !== "live") return;
  const closed = (E as any).closeDay(g.day, at);
  g.day = closed.state;
  const winnerId = closed.state.winnerId;
  const names = new Map(g.players.map((p) => [p.id, p.name]));
  try {
    // dayRecordFrom keys by date; two closes on one date (sprint pilots) get
    // a #idx suffix — same trick the v4 app uses (engine throws on dups)
    let date = g.dayDate ?? isoDate(at);
    const days: any[] = g.season?.days ?? [];
    if (days.some((d) => d.date === date || String(d.date).startsWith(date + "#"))) {
      date += "#" + (days.length + 1);
    }
    g.season = (E as any).recordBattleDay(g.season, (E as any).dayRecordFrom(g.day, date));
  } catch (err) {
    pushEvent(g, "close", `⚠️ season bookkeeping skipped (${err instanceof Error ? err.message : err})`);
  }
  bump(g);
  const banked = Object.entries(closed.outcomes).filter(([, o]: any) => o.outcome === "completed").map(([id]) => names.get(id));
  const failed = Object.entries(closed.outcomes).filter(([, o]: any) => o.outcome === "failed").map(([id]) => names.get(id));
  pushEvent(
    g,
    "day_close",
    winnerId != null
      ? `🏁 Day done — ${names.get(winnerId)} takes the Daily Win · ${banked.length} banked · ${failed.length} failed`
      : `🏁 Day done — NOBODY reached target. No Daily Win awarded.`
  );
}

/** Deadline auto-close — runs before every read/write (the bus's auto pattern). */
export function advanceGroup(g: ServerSotGroup, now = Date.now()): void {
  if (g.day && g.day.status === "live" && now >= (E as any).effectiveDeadline(g.day)) {
    closeDayAndRecord(g, Math.max(now, (E as any).effectiveDeadline(g.day)));
  }
}

// ── logging ─────────────────────────────────────────────────────────────────

export interface SotLogInput {
  playerId: string;
  exercise: string;
  reps: number;
  verified?: boolean;
  at?: number;
  clientLogId?: string;
}

/**
 * Apply a log through the engine. `reps` are ENGINE reps (RUF-equivalent
 * physical reps — the client applies its exercise-value conversion first,
 * exactly like the app's engine.js does before Core.logSet).
 */
export function applyLog(g: ServerSotGroup, input: SotLogInput): { ruf: number; completed: boolean; wonDay: boolean; bonusRuf: number; duplicate?: boolean } {
  advanceGroup(g, input.at ?? Date.now());
  if (!g.day || g.day.status !== "live") throw new SotError(400, "no battle open — the day is closed (new day opens on the next play day via `start`)");
  const player = g.players.find((p) => p.id === input.playerId);
  if (!player) throw new SotError(403, "player not in this group");
  const clientLogId = cleanClientId(input.clientLogId);
  if (clientLogId && (g.clientLogIds?.[player.id] ?? []).includes(clientLogId)) {
    return { ruf: 0, completed: false, wonDay: false, bonusRuf: 0, duplicate: true } as any;
  }
  const ex = resolveExercise(g, input.exercise);
  const reps = Math.round(Number(input.reps));
  if (!Number.isInteger(reps) || reps <= 0) throw new SotError(400, "reps must be a positive integer");
  let ret: any;
  try {
    ret = (E as any).logSet(g.day, {
      playerId: player.id,
      exerciseId: ex.id,
      reps,
      at: input.at ?? Date.now(),
      ...(input.verified ? { verified: true } : {}),
    });
  } catch (e) {
    throw new SotError(400, e instanceof Error ? e.message : String(e));
  }
  g.day = ret.state;
  if (clientLogId) {
    const ids = (g.clientLogIds?.[player.id] ?? []).concat(clientLogId).slice(-200);
    g.clientLogIds = { ...(g.clientLogIds ?? {}), [player.id]: ids };
  }
  bump(g);
  const target = (E as any).effectiveTargetOf(g.day, player.id);
  const progress = (E as any).targetProgressOf(g.day, player.id);
  pushEvent(
    g,
    "log",
    ret.wonDay
      ? `🏆 ${player.name} reached ${target} reps FIRST — Daily Win banked!`
      : ret.completed
        ? `🏦 ${player.name} banked the day (${target} reps)`
        : `💪 ${player.name} logged ${reps} ${ex.name ?? ex.id} — +${ret.ruf} reps (${progress}/${target})`,
    player.id
  );
  return { ruf: ret.ruf, completed: !!ret.completed, wonDay: !!ret.wonDay, bonusRuf: ret.bonusRuf || 0 };
}

/** id / name / loose-plural match — same looseness as the chat bus. */
function resolveExercise(g: ServerSotGroup, token: string): { id: string; name?: string } {
  const t = String(token ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const sing = t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
  for (const ex of g.config.exercises) {
    const id = String(ex.id).toLowerCase();
    const nm = String(ex.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (t === id || t === nm || sing === id || sing === nm) return ex;
  }
  throw new SotError(400, `unknown exercise "${token}" — this group trains ${g.config.exercises.map((e) => e.id).join(", ")}`);
}

// ── the bus (POST /cmd — bots and app share literally one brain) ────────────

/**
 * SotStore-compatible adapter over the server group map. The bus mutates the
 * SAME objects the structured endpoints serve; `set` re-shells anything a bus
 * command replaced wholesale (e.g. `new` starting a fresh week) so identity,
 * tokens, seq and history survive.
 */
class BusStoreAdapter {
  constructor(private groups: Map<string, ServerSotGroup>) {}
  get(chatId: string): any {
    const g = this.groups.get(chatId);
    if (!g) return undefined;
    advanceGroup(g);
    return g;
  }
  set(chatId: string, next: any): void {
    const prev = this.groups.get(chatId);
    if (prev) {
      next.code = prev.code;
      next.name = prev.name;
      next.createdAt = prev.createdAt;
      next.tokens = prev.tokens;
      next.events = prev.events;
      next.creatorPlayerId = prev.creatorPlayerId;
      next.seq = prev.seq + 1;
      if (prev.config?.dayWindowMs != null && next.config?.dayWindowMs == null) {
        next.config.dayWindowMs = prev.config.dayWindowMs;
      }
      if (prev.config?.flags && !next.config?.flags) next.config.flags = prev.config.flags;
    }
    this.groups.set(chatId, next);
  }
}

const busGroups = new Map<string, ServerSotGroup>(); // code-keyed — same objects loadSotDb hands out per mutation

function busFor(g: ServerSotGroup): SotCommandBus {
  busGroups.set(g.code, g);
  return new SotCommandBus(new BusStoreAdapter(busGroups), {
    dayWindowMs: g.config.dayWindowMs,
    playDays: g.config.playDays,
  });
}

export function runCommand(g: ServerSotGroup, playerId: string, text: string): { reply: string } {
  advanceGroup(g);
  const player = g.players.find((p) => p.id === playerId);
  if (!player) throw new SotError(403, "player not in this group");
  enforceCommandRole(g, playerId, text);
  const bus = busFor(g);
  const before = g.seq;
  const reply = bus.handle({ chatId: g.code, playerId: player.id, playerName: player.name, text: String(text ?? "").slice(0, 400) });
  if (g.seq === before) bump(g); // every cmd is state-visible: read-only cmds still advance the poll cursor
  pushEvent(g, "cmd", `🤖 ${player.name}: \`${String(text).trim()}\``, player.id);
  return { reply };
}

export function runIdempotentCommand(g: ServerSotGroup, playerId: string, text: string, clientCmdId?: string): { reply: string; duplicate?: boolean } {
  const id = cleanClientId(clientCmdId);
  if (id && (g.clientCmdIds?.[playerId] ?? []).includes(id)) return { reply: "✅ Already handled that command.", duplicate: true };
  const out = runCommand(g, playerId, text);
  if (id) {
    const ids = (g.clientCmdIds?.[playerId] ?? []).concat(id).slice(-200);
    g.clientCmdIds = { ...(g.clientCmdIds ?? {}), [playerId]: ids };
  }
  return out;
}

function cleanClientId(id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  const s = id.trim();
  return /^[A-Za-z0-9_.:-]{6,120}$/.test(s) ? s : undefined;
}

function enforceCommandRole(g: ServerSotGroup, playerId: string, text: string): void {
  const parsed = parseSot(text);
  if (!parsed) return;
  const sub = (parsed.args[0] ?? "").toLowerCase();
  const creatorOnly =
    parsed.cmd === "new" ||
    (parsed.cmd === "day" && sub === "close" && (parsed.args[1] ?? "").toLowerCase() === "force") ||
    (parsed.cmd === "season" && sub === "end");
  if (creatorOnly && g.creatorPlayerId && g.creatorPlayerId !== playerId) {
    throw new SotError(403, "creator-only command — ask the group creator to run that");
  }
}

// ── the state payload (GET /state — the app's poll shape) ───────────────────

export function statePayload(g: ServerSotGroup): any {
  advanceGroup(g);
  const names = new Map(g.players.map((p) => [p.id, p.name]));
  const board = g.day
    ? (E as any).dayLeaderboard(g.day).map((r: any, i: number) => ({
        rank: i + 1,
        playerId: r.player.id,
        name: r.player.name,
        tier: r.player.tier,
        ruf: Math.round(r.ruf),
        bonusRuf: Math.round(r.bonusRuf || 0),
        progress: Math.round((E as any).targetProgressOf(g.day, r.player.id)),
        target: Math.round((E as any).effectiveTargetOf(g.day, r.player.id)),
        completed: !!r.completed,
        won: g.day.winnerId === r.player.id,
      }))
    : [];
  return {
    seq: g.seq,
    group: {
      code: g.code,
      name: g.name,
      createdAt: g.createdAt,
      config: {
        targetReps: g.config.targetReps,
        playDays: g.config.playDays,
        exercises: g.config.exercises,
        ...(g.config.dayWindowMs != null ? { dayWindowMs: g.config.dayWindowMs } : {}),
      },
      creatorPlayerId: g.creatorPlayerId ?? null,
    },
    players: g.players.map((p) => ({ id: p.id, name: p.name, tier: p.tier })),
    day: g.day,
    dayDate: g.dayDate,
    season: g.season,
    stake: g.season?.stake ?? null,
    board,
    standings: (E as any).battleStandings(g.season).map((r: any) => ({ ...r, name: names.get(r.playerId) ?? r.playerId })),
    events: g.events.slice(-60),
  };
}

// ── token auth helper ───────────────────────────────────────────────────────

export function playerIdForToken(g: ServerSotGroup, playerToken: unknown): string {
  const pid = typeof playerToken === "string" ? g.tokens[playerToken] : undefined;
  if (!pid) throw new SotError(401, "unknown playerToken — join the group first (POST /sot/groups/:code/players)");
  return pid;
}

export { parseSot };
