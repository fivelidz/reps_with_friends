// @rwf/api — REST routes (tiny router, no framework)
// All game logic lives in @rwf/game-core (pure). This layer is transport +
// persistence only: validate → engine → store → respond.

import {
  activeSeason,
  findCrew,
  findMatch,
  mutateDb,
  newCrewCode,
  newId,
  type CrewRecord,
  type MatchRecord,
} from "./db.ts";
import {
  applyComeback,
  createMatch,
  createSeason,
  logReps,
  recordMatch,
  seasonLadder,
  standings,
  startMatch,
  winner,
  type Exercise,
  type FitnessTier,
  type Player,
} from "../../../packages/game-core/src/index.ts";

// ── Router ──────────────────────────────────────────────────────────────────

export interface RouteCtx {
  params: Record<string, string>;
  body: any;
  url: URL;
}

type Handler = (ctx: RouteCtx) => Response;

export interface Route {
  method: "GET" | "POST";
  /** "/crews/:code/matches" — ":x" segments are captured into params. */
  path: string;
  handler: Handler;
}

const compile = (path: string): RegExp =>
  new RegExp(
    "^" +
      path
        .split("/")
        .map((seg) =>
          seg.startsWith(":") ? `([^/]+)` : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        )
        .join("/") +
      "$"
  );

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

const bad = (error: string, status = 400): Response => json({ error }, status);

async function readBody(req: Request): Promise<any> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return {};
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Entry point used by main.ts (and tests). Never throws. */
export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const m = compile(route.path).exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      // Capture groups are numbered by order of ":" segments (m[0] is the
      // full match), NOT by segment index — the leading "" from split shifts
      // everything by one.
      let group = 0;
      const segs = route.path.split("/");
      segs.forEach((seg) => {
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(m[++group]);
      });
      return route.handler({ params, body: await readBody(req), url });
    }
    return bad(`no route for ${req.method} ${url.pathname}`, 404);
  } catch (e) {
    if (e instanceof HttpError) return bad(e.message, e.status);
    // Engine errors (invalid log, season over, …) are client errors.
    const msg = e instanceof Error ? e.message : String(e);
    return bad(msg, 400);
  }
}

// ── Validation helpers ──────────────────────────────────────────────────────

const TIERS: FitnessTier[] = ["couch", "casual", "fit", "athlete"];

const requireStr = (body: any, field: string, maxLen = 60): string => {
  const v = body?.[field];
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${field} is required`);
  const s = v.trim();
  if (s.length > maxLen) throw new HttpError(400, `${field} must be ≤${maxLen} chars`);
  return s;
};

const requireCrew = (params: Record<string, string>): CrewRecord => {
  const crew = mutateDb((db) => findCrew(db, params.code));
  if (!crew) throw new HttpError(404, `crew ${params.code} not found`);
  return crew;
};

const requireMatch = (params: Record<string, string>): MatchRecord => {
  const rec = mutateDb((db) => findMatch(db, params.id));
  if (!rec) throw new HttpError(404, `match ${params.id} not found`);
  return rec;
};

/** Accepts ["Push-ups"] or [{id?, name}] → Exercise[] with generated ids. */
const parseExercises = (body: any): Exercise[] => {
  const raw = body?.exercises;
  if (!Array.isArray(raw) || raw.length < 1)
    throw new HttpError(400, "exercises must be a non-empty array");
  if (raw.length > 6) throw new HttpError(400, "max 6 exercises per match");
  return raw.map((e: any, i: number) => {
    const name = typeof e === "string" ? e : e?.name;
    if (typeof name !== "string" || !name.trim())
      throw new HttpError(400, `exercise ${i} needs a name`);
    const id =
      typeof e === "object" && typeof e.id === "string" && e.id
        ? e.id
        : `ex${i + 1}_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 12)}`;
    return { id, name: name.trim().slice(0, 24) };
  });
};

const parsePlayDays = (body: any): number[] => {
  const raw = body?.playDays;
  if (raw == null) return [1, 3, 5]; // Mon/Wed/Fri default
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6))
    throw new HttpError(400, "playDays must be integers 0–6 (0=Sunday)");
  return raw;
};

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes: Route[] = [
  // ── Crews ─────────────────────────────────────────────────────────────

  {
    method: "POST",
    path: "/crews",
    handler: ({ body }) => {
      const name = requireStr(body, "name", 40);
      const crew = mutateDb((db) => {
        const record: CrewRecord = {
          id: newId("crew"),
          code: newCrewCode(db),
          name,
          players: [],
          createdAt: Date.now(),
        };
        db.crews.push(record);
        return record;
      });
      return json({ code: crew.code, crew }, 201);
    },
  },

  {
    method: "GET",
    path: "/crews/:code",
    handler: ({ params }) => {
      const code = params.code.toUpperCase();
      return mutateDb((db) => {
        const crew = findCrew(db, code);
        if (!crew) throw new HttpError(404, `crew ${code} not found`);
        const matches = db.matches
          .filter((m) => m.crewCode === code)
          .map((m) => ({
            id: m.id,
            status: m.match.status,
            target: m.match.config.targetReps,
            exercises: m.match.config.exercises.map((e) => e.name),
            createdAt: m.match.startedAt ?? null,
            mvpPlayerId: m.mvpPlayerId ?? null,
          }));
        const season = activeSeason(db, code);
        return json({ crew, matches, season: season?.season ?? null });
      });
    },
  },

  {
    method: "POST",
    path: "/crews/:code/players",
    handler: ({ params, body }) => {
      requireCrew(params);
      const name = requireStr(body, "name", 24);
      const tierRaw = body?.tier ?? "casual";
      if (!TIERS.includes(tierRaw))
        throw new HttpError(400, `tier must be one of ${TIERS.join(", ")}`);
      const player: Player = { id: newId("p"), name, tier: tierRaw };
      mutateDb((db) => {
        const crew = findCrew(db, params.code)!;
        crew.players.push(player);
      });
      return json({ player }, 201);
    },
  },

  // ── Matches ───────────────────────────────────────────────────────────

  {
    method: "POST",
    path: "/crews/:code/matches",
    handler: ({ params, body }) => {
      const crew = requireCrew(params);
      if (crew.players.length < 1)
        throw new HttpError(400, "crew needs at least 1 player before a match");
      const exercises = parseExercises(body);
      const target = body?.target ?? 300;
      if (!Number.isInteger(target) || target < 10 || target > 10000)
        throw new HttpError(400, "target must be an integer 10–10000");
      const playDays = parsePlayDays(body);
      const record = mutateDb((db) => {
        const c = findCrew(db, params.code)!;
        const created = createMatch(
          {
            id: newId("m"),
            exercises,
            targetReps: target,
            playDays,
          },
          c.players
        );
        const live = startMatch(created);
        const rec: MatchRecord = { id: live.config.id, crewCode: c.code, match: live };
        db.matches.push(rec);
        return rec;
      });
      return json(
        { match: record.match, standings: standings(record.match) },
        201
      );
    },
  },

  {
    method: "GET",
    path: "/matches/:id",
    handler: ({ params }) => {
      const rec = requireMatch(params);
      return json({
        match: rec.match,
        standings: standings(rec.match),
        winner: winner(rec.match),
        mvpPlayerId: rec.mvpPlayerId ?? null,
      });
    },
  },

  {
    method: "POST",
    path: "/matches/:id/log",
    handler: ({ params, body }) => {
      const playerId = requireStr(body, "playerId", 40);
      const exerciseId = requireStr(body, "exerciseId", 40);
      const reps = body?.reps;
      if (!Number.isInteger(reps) || reps <= 0)
        throw new HttpError(400, "reps must be a positive integer");
      const verified = body?.verified === true;
      const avgHrrPct =
        typeof body?.avgHrrPct === "number" && body.avgHrrPct > 0 ? body.avgHrrPct : undefined;

      const result = mutateDb((db) => {
        const rec = findMatch(db, params.id);
        if (!rec) throw new HttpError(404, `match ${params.id} not found`);
        // Comeback check runs against pre-entry state, then the tagged entry
        // is appended by the engine.
        const entry = applyComeback(rec.match, {
          playerId,
          exerciseId,
          reps,
          at: Date.now(),
          verified,
          ...(avgHrrPct != null ? { avgHrrPct } : {}),
        });
        const { state, closedMatch } = logReps(rec.match, entry);
        rec.match = state;
        return { rec, closedMatch, comebackApplied: entry.comeback === true };
      });

      return json({
        standings: standings(result.rec.match),
        closed: result.closedMatch,
        comebackApplied: result.comebackApplied,
        winner: result.closedMatch ? winner(result.rec.match) : null,
      });
    },
  },

  {
    method: "POST",
    path: "/matches/:id/mvp",
    handler: ({ params, body }) => {
      const playerId = requireStr(body, "playerId", 40);
      const out = mutateDb((db) => {
        const rec = findMatch(db, params.id);
        if (!rec) throw new HttpError(404, `match ${params.id} not found`);
        if (!rec.match.players.some((p) => p.id === playerId))
          throw new HttpError(400, `player ${playerId} not in match`);
        if (rec.match.status !== "complete")
          throw new HttpError(400, "MVP vote opens when the match is complete");
        rec.mvpPlayerId = playerId;

        // Result finalisation: record into the crew's active season (once).
        let ladder = null;
        const seasonRec = activeSeason(db, rec.crewCode);
        if (seasonRec && !rec.seasonRecorded && seasonRec.season.champion == null) {
          seasonRec.season = recordMatch(seasonRec.season, {
            matchId: rec.id,
            week: seasonRec.season.week,
            standings: standings(rec.match).map((r) => ({
              playerId: r.player.id,
              adjustedScore: r.adjustedScore,
            })),
            mvpPlayerId: playerId,
          });
          rec.seasonRecorded = true;
          ladder = seasonLadder(seasonRec.season);
        }
        return { rec, ladder };
      });
      return json({ mvpPlayerId: playerId, match: out.rec.match, seasonLadder: out.ladder });
    },
  },

  // ── Seasons ───────────────────────────────────────────────────────────

  {
    method: "GET",
    path: "/crews/:code/season",
    handler: ({ params }) => {
      requireCrew(params);
      const seasonRec = mutateDb((db) => activeSeason(db, params.code));
      if (!seasonRec) return json({ season: null, ladder: null });
      return json({ season: seasonRec.season, ladder: seasonLadder(seasonRec.season) });
    },
  },

  {
    method: "POST",
    path: "/crews/:code/season",
    handler: ({ params, body }) => {
      const crew = requireCrew(params);
      if (crew.players.length < 1)
        throw new HttpError(400, "crew needs players before a season");
      const name = body?.name ?? `Season ${(mutateDb((db) => db.seasons.filter((s) => s.crewCode === crew.code).length) + 1)}`;
      const weeks = body?.weeks ?? 4;
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12)
        throw new HttpError(400, "weeks must be an integer 1–12");
      const seasonRec = mutateDb((db) => {
        const c = findCrew(db, params.code)!;
        const season = createSeason({ id: newId("sea"), name: String(name).slice(0, 40), weeks }, c.players);
        const rec = { id: season.config.id, crewCode: c.code, season };
        db.seasons.push(rec);
        return rec;
      });
      return json({ season: seasonRec.season, ladder: seasonLadder(seasonRec.season) }, 201);
    },
  },

  // ── Bot mirrors (P1: bots → API; docs/22_BACKEND_CHAT_ARCHITECTURE.md) ──
  // The chat bots (Slack/WhatsApp/Beeper) push full state snapshots here via
  // MatchStore.api(). Crew-linked bot matches are ADOPTED into the real
  // crews/matches tables so the web app's GET /crews/:code pulls bot-played
  // matches into the same scoreboard (blocker T5). Idempotent by match id.

  {
    method: "POST",
    path: "/bots/state",
    handler: ({ body }) => {
      const source = (typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "bot-core").slice(0, 40);
      const out = mutateDb((db) => {
        db.bots = db.bots ?? {};
        db.bots[source] = { receivedAt: Date.now(), snapshot: body };

        let crewsCreated = 0;
        let matchesUpserted = 0;
        const matches = (body?.matches ?? {}) as Record<string, any>;
        for (const m of Object.values(matches)) {
          const code = typeof m?.crewCode === "string" ? m.crewCode.toUpperCase() : null;
          const state = m?.state;
          if (!code || !state || typeof state?.config?.id !== "string") continue;
          if (!Array.isArray(state.players) || !Array.isArray(state.entries)) continue;

          // Ensure the crew exists (bot-linked crews can predate any app crew).
          let crew = findCrew(db, code);
          if (!crew) {
            crew = { id: `crew_${code}`, code, name: `Crew ${code}`, players: [], createdAt: Date.now() };
            db.crews.push(crew);
            crewsCreated++;
          }
          // Adopt players the crew hasn't seen (bot player ids are
          // platform-stable strings like "wa:+614…" / "beeper:@user:…").
          for (const p of state.players) {
            if (p && typeof p.id === "string" && !crew.players.some((x) => x.id === p.id)) {
              crew.players.push({ id: p.id, name: String(p.name ?? p.id).slice(0, 24), tier: p.tier ?? "casual" });
            }
          }

          // Upsert the match record — mirror semantics: bot state wins for
          // the match itself, but API-side MVP/season flags are preserved.
          const rec: MatchRecord = { id: state.config.id, crewCode: code, match: state };
          const i = db.matches.findIndex((r) => r.id === rec.id);
          if (i >= 0) db.matches[i] = { ...db.matches[i], ...rec };
          else db.matches.push(rec);
          matchesUpserted++;
        }
        return { crewsCreated, matchesUpserted };
      });
      return json({ ok: true, source, ...out });
    },
  },

  {
    method: "GET",
    path: "/bots/state",
    handler: () => {
      return mutateDb((db) => {
        const bots = db.bots ?? {};
        const sources = Object.entries(bots).map(([source, rec]) => {
          const snap = rec.snapshot as { matches?: Record<string, unknown> } | undefined;
          return {
            source,
            receivedAt: rec.receivedAt,
            chats: Object.keys(snap?.matches ?? {}).length,
          };
        });
        return json({ sources });
      });
    },
  },
];
