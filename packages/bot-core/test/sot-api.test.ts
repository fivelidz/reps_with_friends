// @rwf/bot-core — SotApiSession (M1): bots as CLIENTS of apps/api.
// Spins the real API in-process (ephemeral port, temp stores) and drives a
// day through the session handler; asserts the fallback path keeps working
// when the API is down.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer } from "../../../apps/api/src/main.ts";
import { SotApiSession } from "../src/sot-api.ts";
import type { InboundMessage } from "../src/bus.ts";

let server: Bun.Server;
let base: string;

beforeAll(() => {
  process.env.RWF_API_DB = `/tmp/rwf-botapi-test-crews-${crypto.randomUUID()}.json`;
  process.env.RWF_SOT_DB = `/tmp/rwf-botapi-test-${crypto.randomUUID()}.json`;
  server = startServer(0);
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

const msg = (chatId: string, playerId: string, playerName: string, text: string): InboundMessage => ({
  chatId,
  playerId,
  playerName,
  text,
});

describe("SotApiSession — bots as API clients", () => {
  test("handle auto-creates the chat group, joins the sender, and runs commands", async () => {
    const session = new SotApiSession({
      apiUrl: base,
      sessionFile: `/tmp/rwf-botapi-session-${crypto.randomUUID()}.json`,
    });
    expect(await session.health()).toBe(true);

    const chat = "wa:group-test";
    const r1 = await session.handle(msg(chat, "wa:+614111111111", "Ben", "join athlete"));
    expect(r1).toContain("Ben");
    const s1 = session.sessionFor(chat)!;
    expect(s1.code).toMatch(/^[A-Z2-9]{5}$/);

    // the group exists on the API with Ben in it
    const meta = await fetch(`${base}/sot/groups/${s1.code}`).then((r) => r.json());
    expect(meta.players.map((p: any) => p.name)).toContain("Ben");

    // a second player + a day-opening log through the same door
    await session.handle(msg(chat, "wa:+614222222222", "Dave", "join couch"));
    const r3 = await session.handle(msg(chat, "wa:+614111111111", "Ben", "log burpees 100"));
    expect(r3).toContain("+85"); // athlete ×0.85 — the server engine tiers
    const st = await fetch(`${base}/sot/groups/${s1.code}/state`).then((r) => r.json());
    expect(st.day.status).toBe("live");
    expect(st.board.find((r: any) => r.name === "Ben").progress).toBe(85);
  });

  test("two chats → two server groups; a chat survives a lost server group", async () => {
    const session = new SotApiSession({
      apiUrl: base,
      sessionFile: `/tmp/rwf-botapi-session2-${crypto.randomUUID()}.json`,
    });
    const a = await session.handle(msg("wa:chat-a", "p1", "Ann", "join fit"));
    const b = await session.handle(msg("wa:chat-b", "p2", "Bob", "join fit"));
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(session.sessionFor("wa:chat-a")!.code).not.toBe(session.sessionFor("wa:chat-b")!.code);

    // server loses the group (fresh db) → the next handle recreates it
    const code = session.sessionFor("wa:chat-a")!.code;
    // wipe the group file out from under the API by pointing it at a new one
    const oldDb = process.env.RWF_SOT_DB;
    process.env.RWF_SOT_DB = `/tmp/rwf-botapi-test-wiped-${crypto.randomUUID()}.json`;
    const r = await session.handle(msg("wa:chat-a", "p1", "Ann", "standings"));
    process.env.RWF_SOT_DB = oldDb;
    expect(r).toBeTruthy();
    expect(session.sessionFor("wa:chat-a")!.code).not.toBe(code); // new group
  });

  test("fallback: unreachable API → the local file bus still plays", async () => {
    const session = new SotApiSession({
      apiUrl: "http://127.0.0.1:1", // nothing listens here
      sessionFile: `/tmp/rwf-botapi-session3-${crypto.randomUUID()}.json`,
    });
    const r = await session.handle(msg("wa:group-fallback", "wa:+614999999999", "Zed", "join casual"));
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });
});
