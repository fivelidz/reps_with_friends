// @rwf/api — end-to-end flow test over real HTTP (fetch) against a live
// server on an ephemeral port, isolated temp db.
// Covers: crew → players → season → match → logs (incl. comeback) → close →
// mvp → season ladder, plus health, CORS, 404s, and error paths.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer } from "../src/main.ts";

let server: Bun.Server;
let base: string;

beforeAll(() => {
  // Isolated store per run — never touches the real .data/api-db.json.
  process.env.RWF_API_DB = `/tmp/rwf-api-test-${crypto.randomUUID()}.json`;
  server = startServer(0); // ephemeral port
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

const j = async (res: Response): Promise<any> => res.json();

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const get = (path: string): Promise<Response> => fetch(`${base}${path}`);

describe("health + cors", () => {
  test("GET /health is ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("rwf-api");
  });

  test("CORS allows localhost:4173", async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: "http://localhost:4173" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:4173");
  });

  test("CORS rejects unknown origins (no header)", async () => {
    const res = await fetch(`${base}/health`, {
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("OPTIONS preflight → 204", async () => {
    const res = await fetch(`${base}/crews`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:4173" },
    });
    expect(res.status).toBe(204);
  });
});

describe("full crew → match → close → mvp → season flow", () => {
  let code: string;
  let dave: any, alexei: any, nico: any;
  let matchId: string;

  test("POST /crews creates a crew with a join code", async () => {
    const res = await post("/crews", { name: "The Boys" });
    expect(res.status).toBe(201);
    const body = await j(res);
    code = body.code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/); // no 0/O/1/I
    expect(body.crew.name).toBe("The Boys");
    expect(body.crew.players).toEqual([]);
  });

  test("POST /crews rejects missing name", async () => {
    const res = await post("/crews", {});
    expect(res.status).toBe(400);
    expect((await j(res)).error).toContain("name");
  });

  test("POST /crews/:code/players adds three tiers", async () => {
    const mk = async (name: string, tier: string) =>
      j(await post(`/crews/${code}/players`, { name, tier }));
    dave = await mk("Dave", "athlete");
    alexei = await mk("Alexei", "casual");
    nico = await mk("Nico", "couch");
    expect(dave.player.tier).toBe("athlete");
    expect(nico.player.tier).toBe("couch");
  });

  test("POST players rejects a bad tier", async () => {
    const res = await post(`/crews/${code}/players`, { name: "X", tier: "god" });
    expect(res.status).toBe(400);
  });

  test("GET /crews/:code returns crew + players", async () => {
    const res = await get(`/crews/${code}`);
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.crew.players).toHaveLength(3);
    expect(body.matches).toEqual([]);
    expect(body.season).toBeNull();
  });

  test("GET unknown crew → 404", async () => {
    expect((await get("/crews/ZZZZZ")).status).toBe(404);
  });

  test("POST /crews/:code/season creates a 4-week season", async () => {
    const res = await post(`/crews/${code}/season`, { name: "S1", weeks: 4 });
    expect(res.status).toBe(201);
    const body = await j(res);
    expect(body.season.config.name).toBe("S1");
    expect(body.season.week).toBe(1);
    expect(body.ladder).toHaveLength(3);
  });

  test("POST /crews/:code/matches starts a live match", async () => {
    const res = await post(`/crews/${code}/matches`, {
      exercises: ["Push-ups", "Squats"],
      target: 100,
      playDays: [2, 4],
    });
    expect(res.status).toBe(201);
    const body = await j(res);
    matchId = body.match.config.id;
    expect(body.match.status).toBe("live");
    expect(body.match.config.targetReps).toBe(100);
    expect(body.match.config.exercises.map((e: any) => e.name)).toEqual(["Push-ups", "Squats"]);
    expect(body.standings).toHaveLength(3);
  });

  test("GET /matches/:id returns standings", async () => {
    const body = await j(await get(`/matches/${matchId}`));
    expect(body.match.status).toBe("live");
    expect(body.standings).toHaveLength(3);
    expect(body.winner).toBeNull();
  });

  test("log: Dave 50 verified → not closed, no comeback", async () => {
    const res = await post(`/matches/${matchId}/log`, {
      playerId: dave.player.id,
      exerciseId: "ex1_push-ups",
      reps: 50,
      verified: true,
    });
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.closed).toBe(false);
    expect(body.comebackApplied).toBe(false);
    expect(body.standings[0].player.name).toBe("Dave");
    expect(body.standings[0].verifiedPct).toBe(100);
  });

  test("log: Nico (0 reps, >30% behind) gets comeback ×1.2", async () => {
    const res = await post(`/matches/${matchId}/log`, {
      playerId: nico.player.id,
      exerciseId: "ex2_squats",
      reps: 20,
      verified: false,
    });
    const body = await j(res);
    expect(body.comebackApplied).toBe(true);
    expect(body.closed).toBe(false);
  });

  test("log: comeback is once per player per match", async () => {
    const res = await post(`/matches/${matchId}/log`, {
      playerId: nico.player.id,
      exerciseId: "ex2_squats",
      reps: 10,
    });
    const body = await j(res);
    expect(body.comebackApplied).toBe(false);
  });

  test("log: bad exercise / player / reps → 400", async () => {
    expect(
      (await post(`/matches/${matchId}/log`, { playerId: dave.player.id, exerciseId: "nope", reps: 5 })).status
    ).toBe(400);
    expect(
      (await post(`/matches/${matchId}/log`, { playerId: "p_ghost", exerciseId: "ex1_push-ups", reps: 5 })).status
    ).toBe(400);
    expect(
      (await post(`/matches/${matchId}/log`, { playerId: dave.player.id, exerciseId: "ex1_push-ups", reps: -3 })).status
    ).toBe(400);
  });

  test("log: Alexei closes the match at raw 100", async () => {
    const res = await post(`/matches/${matchId}/log`, {
      playerId: alexei.player.id,
      exerciseId: "ex1_push-ups",
      reps: 100,
      verified: true,
      avgHrrPct: 72,
    });
    const body = await j(res);
    expect(body.closed).toBe(true);
    expect(body.winner).not.toBeNull();
    expect(body.standings.every((r: any) => r.progressPct <= 100)).toBe(true);
  });

  test("log after close → 400 (match not live)", async () => {
    const res = await post(`/matches/${matchId}/log`, {
      playerId: dave.player.id,
      exerciseId: "ex1_push-ups",
      reps: 5,
    });
    expect(res.status).toBe(400);
  });

  test("mvp vote before complete → 400 (sanity: use fresh live match)", async () => {
    const live = await j(
      await post(`/crews/${code}/matches`, { exercises: ["Sit-ups"], target: 500 })
    );
    const res = await post(`/matches/${live.match.config.id}/mvp`, {
      playerId: dave.player.id,
    });
    expect(res.status).toBe(400);
  });

  test("POST /matches/:id/mvp sets MVP and records the season result", async () => {
    const res = await post(`/matches/${matchId}/mvp`, { playerId: nico.player.id });
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.mvpPlayerId).toBe(nico.player.id);
    expect(body.seasonLadder).toHaveLength(3);
    // Everyone played → ladder points exist; MVP got +1 on top of placement.
    const mvpRow = body.seasonLadder.find((r: any) => r.playerId === nico.player.id);
    expect(mvpRow.mvpCount).toBe(1);
    expect(mvpRow.points).toBeGreaterThan(0);
    expect(mvpRow.played).toBe(1);
  });

  test("GET /crews/:code/season shows recorded ladder", async () => {
    const body = await j(await get(`/crews/${code}/season`));
    expect(body.season.config.name).toBe("S1");
    expect(body.season.results).toHaveLength(1);
    expect(body.season.results[0].mvpPlayerId).toBe(nico.player.id);
    const total = body.ladder.reduce((s: number, r: any) => s + r.points, 0);
    expect(total).toBe(3 + 2 + 1 + 1); // podium + MVP
  });

  test("GET /crews/:code lists the completed match with MVP", async () => {
    const body = await j(await get(`/crews/${code}`));
    expect(body.matches).toHaveLength(2);
    const done = body.matches.find((m: any) => m.id === matchId);
    expect(done.status).toBe("complete");
    expect(done.mvpPlayerId).toBe(nico.player.id);
    expect(body.season.config.name).toBe("S1");
  });

  test("unknown route → 404", async () => {
    expect((await get("/nope")).status).toBe(404);
  });
});
