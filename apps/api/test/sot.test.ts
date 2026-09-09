// @rwf/api — SOT group tests (M1): the shared daily-battle authority.
// Covers: create → join → auto-open day → structured logs → /cmd bus
// commands → two "phones" seeing each other's logs via state?since → seq
// monotonicity → auth-lite token checks → day close + season recording.
// The old /crews flow keeps its own suite (api.test.ts).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer } from "../src/main.ts";

let server: Bun.Server;
let base: string;

beforeAll(() => {
  process.env.RWF_API_DB = `/tmp/rwf-sot-test-crews-${crypto.randomUUID()}.json`;
  process.env.RWF_SOT_DB = `/tmp/rwf-sot-test-${crypto.randomUUID()}.json`;
  server = startServer(0);
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

const j = async (res: Response): Promise<any> => res.json();
const post = (path: string, body: unknown): Promise<any> =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);
const get = (path: string): Promise<any> => fetch(`${base}${path}`).then(j);

// a group where every weekday is a play day and the window is 2h — nothing
// in this suite should ever hit the deadline naturally
async function makeGroup(name = "Test Crew") {
  const g = await post("/sot/groups", {
    name,
    config: {
      targetReps: 200,
      playDays: [0, 1, 2, 3, 4, 5, 6],
      exercises: [
        { id: "pushups", name: "Push-ups" },
        { id: "squats", name: "Squats" },
        { id: "burpees", name: "Burpees" },
      ],
      dayWindowMs: 2 * 3600_000,
    },
  });
  expect(g.code).toMatch(/^[A-Z2-9]{5}$/);
  return g.code as string;
}

async function join(code: string, name: string, tier?: string) {
  const r = await post(`/sot/groups/${code}/players`, tier ? { name, tier } : { name });
  expect(r.playerToken).toBeDefined();
  expect(r.state.day.status).toBe("live"); // day auto-opens from the first join
  return r as { playerId: string; playerToken: string; state: any };
}

describe("SOT groups — lifecycle", () => {
  test("create → meta → join auto-opens the day", async () => {
    const code = await makeGroup("Lifecycle Crew");
    const meta = await get(`/sot/groups/${code}`);
    expect(meta.name).toBe("Lifecycle Crew");
    expect(meta.players).toHaveLength(0);
    expect(meta.hasLiveDay).toBe(false);

    const a = await join(code, "Alex", "fit");
    expect(a.state.players.map((p: any) => p.name)).toEqual(["Alex"]);
    expect(a.state.season.config.targetReps).toBe(200);
    expect(a.state.day.config.deadlineAt).toBeGreaterThan(Date.now());

    const meta2 = await get(`/sot/groups/${code}`);
    expect(meta2.hasLiveDay).toBe(true);
    expect(meta2.playerCount).toBe(1);
  });

  test("joiner into a live day sees the board (late-join patch)", async () => {
    const code = await makeGroup("Late Join Crew");
    const a = await join(code, "Alex", "fit"); // ×1.0 → clean numbers
    await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "pushups", reps: 30 });
    const b = await join(code, "Bea", "couch");
    const bea = b.state.board.find((r: any) => r.name === "Bea");
    expect(bea.progress).toBe(0);
    expect(b.state.board.find((r: any) => r.name === "Alex").progress).toBe(30);
  });

  test("404 for unknown codes", async () => {
    expect((await get("/sot/groups/ZZZZZ")).error).toContain("no SOT group");
    expect((await get("/sot/groups/ZZZZZ/state")).error).toContain("no SOT group");
  });

  test("join requires a name; tier defaults to casual", async () => {
    const code = await makeGroup("Names Crew");
    const bad = await post(`/sot/groups/${code}/players`, { tier: "fit" });
    expect(bad.error).toContain("name is required");
    const r = await post(`/sot/groups/${code}/players`, { name: "Default" });
    expect(r.state.players[0].tier).toBe("casual");
  });
});

describe("SOT groups — logging (the optimistic-client pattern)", () => {
  test("log applies tier handicap and returns full new state", async () => {
    const code = await makeGroup("Log Crew");
    const a = await join(code, "Alex", "couch"); // ×1.5
    const r = await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "pushups", reps: 100 });
    expect(r.ok).toBe(true);
    expect(r.ruf).toBe(150); // engine tiers apply server-side — same for everyone
    const alex = r.state.board.find((x: any) => x.name === "Alex");
    expect(alex.progress).toBe(150);
    expect(r.state.day.entries).toHaveLength(1);
    expect(r.state.day.entries[0].ruf).toBe(150);
  });

  test("reps must be positive integers; unknown exercises rejected", async () => {
    const code = await makeGroup("Validation Crew");
    const a = await join(code, "Alex");
    expect((await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "pushups", reps: 0 })).error).toContain("positive integer");
    expect((await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "swimming", reps: 10 })).error).toContain("unknown exercise");
  });

  test("logs are refused after the day closes", async () => {
    const code = await makeGroup("Closed Crew");
    const a = await join(code, "Alex");
    await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "day close force" });
    const r = await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "pushups", reps: 10 });
    expect(r.error).toContain("no battle open");
  });

  test("auth-lite: unknown/garbage tokens are 401s", async () => {
    const code = await makeGroup("Auth Crew");
    await join(code, "Alex");
    const r = await post(`/sot/groups/${code}/log`, { playerToken: "faketoken", exercise: "pushups", reps: 10 });
    expect(r.error).toContain("unknown playerToken");
    const r2 = await post(`/sot/groups/${code}/cmd`, { playerToken: null, text: "standings" });
    expect(r2.error).toContain("unknown playerToken");
  });
});

describe("SOT groups — two phones, one truth", () => {
  test("phone B sees phone A's log from a plain state poll (no action by B)", async () => {
    const code = await makeGroup("Two Phones Crew");
    const a = await join(code, "Alex", "fit");
    const b = await join(code, "Bea", "couch");

    // B polls once and goes idle, remembering the seq it saw (its own join
    // response already includes both joins — so this poll is caught up)
    const bView1 = await get(`/sot/groups/${code}/state?since=${b.state.seq}`);
    expect(bView1.unchanged).toBe(true);
    const bSeq = bView1.seq;

    // A logs; B just polls again
    await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "burpees", reps: 50 });
    const bView2 = await get(`/sot/groups/${code}/state?since=${bSeq}`);
    expect(bView2.unchanged).toBeUndefined();
    expect(bView2.seq).toBeGreaterThan(bSeq);
    const alex = bView2.board.find((r: any) => r.name === "Alex");
    expect(alex.progress).toBe(50); // fit ×1.0

    // cheap poll: caught up → unchanged, no payload
    const bView3 = await get(`/sot/groups/${code}/state?since=${bView2.seq}`);
    expect(bView3.unchanged).toBe(true);
    expect(bView3.board).toBeUndefined();
  });

  test("seq is monotonic across joins, logs, and commands", async () => {
    const code = await makeGroup("Seq Crew");
    const a = await join(code, "Alex");
    const b = await join(code, "Bea");
    const seqs: number[] = [a.state.seq, b.state.seq];
    seqs.push((await post(`/sot/groups/${code}/log`, { playerToken: a.playerToken, exercise: "pushups", reps: 10 })).state.seq);
    seqs.push((await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "log squats 20" })).state.seq);
    seqs.push((await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "standings" })).state.seq); // read-only still advances
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });
});

describe("SOT groups — the cmd endpoint (bots + app, one brain)", () => {
  test("the full chat grammar works over HTTP: new-player log, standings, power-ups", async () => {
    const code = await makeGroup("Bus Crew");
    const a = await join(code, "Alex", "fit");
    const b = await join(code, "Bea", "couch");

    const help = await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "help" });
    expect(help.reply).toContain("log");

    const log = await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "log squats 40!" });
    expect(log.reply).toContain("Bea"); // verified set, couch ×1.5 → 60
    expect(log.state.board.find((r: any) => r.name === "Bea").progress).toBe(60);

    const bolt = await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "lightning" });
    expect(bolt.reply.toLowerCase()).toContain("lightning");

    const s = await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "s" });
    expect(s.reply).toContain("Bea");
    expect(s.state.board.length).toBe(2);
  });

  test("day close force settles the day and records the season point", async () => {
    const code = await makeGroup("Close Crew");
    const a = await join(code, "Alex", "fit");
    const b = await join(code, "Bea", "couch");
    await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "log squats 140" }); // 210 → win
    const closed = await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "day close force" });
    expect(closed.reply).toContain("Bea WINS THE DAY");
    expect(closed.state.day.status).toBe("closed");
    expect(closed.state.day.winnerId).toBe(b.playerId);
    const beaPts = closed.state.standings.find((r: any) => r.name === "Bea");
    expect(beaPts.points).toBe(1);
    const alexPts = closed.state.standings.find((r: any) => r.name === "Alex");
    expect(alexPts.points).toBe(0);
  });

  test("a stake agreed over /cmd shows in the state payload", async () => {
    const code = await makeGroup("Stake Crew");
    const a = await join(code, "Alex");
    const b = await join(code, "Bea");
    await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "stake dinner Loser shouts the ramen" });
    await post(`/sot/groups/${code}/cmd`, { playerToken: a.playerToken, text: "agree" });
    await post(`/sot/groups/${code}/cmd`, { playerToken: b.playerToken, text: "agree" });
    const st = await get(`/sot/groups/${code}/state`);
    expect(st.stake?.type).toBe("dinner");
    expect(st.stake.status).toBe("active");
  });
});

describe("SOT groups — deadline auto-close + bot personas", () => {
  test("a past-deadline day auto-closes on the next state read", async () => {
    const g2 = await post("/sot/groups", {
      name: "Auto Crew 2",
      config: { targetReps: 200, playDays: [0, 1, 2, 3, 4, 5, 6], dayWindowMs: 1200 }, // 1.2s test window
    });
    await join(g2.code, "Xavier");
    await new Promise((r) => setTimeout(r, 1600));
    const st = await get(`/sot/groups/${g2.code}/state`);
    expect(st.day.status).toBe("closed");
    expect(st.events.some((e: any) => e.kind === "day_close")).toBe(true);
  });

  test("bot personas registered at create can play over /cmd", async () => {
    const r = await post("/sot/groups", {
      name: "Bot Crew",
      config: { targetReps: 200, playDays: [0, 1, 2, 3, 4, 5, 6] },
      bots: [{ name: "Coach", tier: "fit" }],
    });
    expect(r.botTokens).toHaveLength(1);
    const code = r.code;
    const human = await join(code, "Alex");
    const botLog = await post(`/sot/groups/${code}/cmd`, { playerToken: r.botTokens[0].playerToken, text: "log pushups 100" });
    expect(botLog.reply).toContain("Coach");
    const st = await get(`/sot/groups/${code}/state`);
    expect(st.players.map((p: any) => p.name).sort()).toEqual(["Alex", "Coach"]);
    expect(st.board.find((x: any) => x.name === "Coach").progress).toBe(100);
  });

  test("old crews endpoints keep working alongside SOT", async () => {
    const crew = await post("/crews", { name: "Legacy Crew" });
    expect(crew.code).toMatch(/^[A-Z2-9]{5}$/);
    const health = await get("/health");
    expect(health.ok).toBe(true);
    expect(health.sotGroups).toBeGreaterThan(0);
  });
});
