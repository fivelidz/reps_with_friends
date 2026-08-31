// P1 seam test (docs/22 §migration): MatchStore.api() mirrors bot state into
// a REAL running apps/api (startServer on an ephemeral port, isolated temp
// db). Proves the T5 convergence path:
//   bot chat `link CREW-XXXX` → bot match visible via GET /crews/:code (the
//   app's existing pull endpoint) with the same standings the chat bot shows.
// Plus the offline story: API down → file store keeps working, mirror marks
// the failure, nothing throws.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandBus } from "../src/bus.ts";
import { MatchStore } from "../src/store.ts";
// apps/api lives across the workspace — start its real server, not a mock.
import { startServer } from "../../../apps/api/src/main.ts";

let server: Bun.Server;
let base: string;
let dir: string;

beforeAll(() => {
  process.env.RWF_API_DB = `/tmp/rwf-api-sync-test-${crypto.randomUUID()}.json`;
  server = startServer(0);
  base = `http://localhost:${server.port}`;
  dir = mkdtempSync(join(tmpdir(), "rwf-apisync-"));
});

afterAll(() => {
  server.stop(true);
});

const j = async (res: Response): Promise<any> => res.json();

function playBotMatch(store: MatchStore, crewCode = "CREW-7Q2"): CommandBus {
  const bus = new CommandBus(store, { cardsDir: join(dir, "cards") });
  const chat = { chatId: "beeper:!telegram_dogfood:local", playerId: "beeper:@tg_ben", playerName: "Ben" };
  bus.handle({ ...chat, text: "new 100" });
  bus.handle({ ...chat, text: "join athlete" });
  bus.handle({ chatId: "beeper:!telegram_dogfood:local", playerId: "beeper:@tg_dave", playerName: "Dave", text: "join couch" });
  bus.handle({ ...chat, text: `link ${crewCode}` });
  bus.handle({ ...chat, text: "start" });
  bus.handle({ chatId: "beeper:!telegram_dogfood:local", playerId: "beeper:@tg_dave", playerName: "Dave", text: "log pushups 80" }); // 80×1.5=120 adjusted
  bus.handle({ ...chat, text: "log burpees 100" }); // Ben closes (raw=target); comeback ×1.2 → 117 < Dave's 120
  return bus;
}

describe("MatchStore.api() — bot state → apps/api (P1)", () => {
  test("crew-linked bot matches land in the API's crew scoreboard", async () => {
    const store = new MatchStore(join(dir, "matches.json")).api(base, { source: "bot-beeper-test", debounceMs: 50 });
    playBotMatch(store);

    // persist() schedules a debounced push; syncNow() flushes deterministically.
    const ok = await store.syncNow();
    expect(ok).toBe(true);
    const status = store.apiStatus();
    expect(status?.lastOk).toBe(true);
    expect(status?.lastError).toBeNull();

    // The app's existing pull endpoint now sees the bot's crew + match.
    const crewRes = await fetch(`${base}/crews/CREW-7Q2`);
    expect(crewRes.status).toBe(200);
    const crewBody = await j(crewRes);
    expect(crewBody.crew.code).toBe("CREW-7Q2");
    expect(crewBody.crew.players.map((p: any) => p.name).sort()).toEqual(["Ben", "Dave"]);
    expect(crewBody.matches).toHaveLength(1);
    expect(crewBody.matches[0].status).toBe("complete");

    // Standings parity: the API's view matches the bot store's view.
    const matchId = crewBody.matches[0].id;
    const matchRes = await fetch(`${base}/matches/${matchId}`);
    const matchBody = await j(matchRes);
    const stored = JSON.parse(readFileSync(join(dir, "matches.json"), "utf8"));
    const botPlayers = stored["beeper:!telegram_dogfood:local"].state.players.map((p: any) => p.name).sort();
    expect(matchBody.match.players.map((p: any) => p.name).sort()).toEqual(botPlayers);
    expect(matchBody.standings).toHaveLength(2);
    // winner() returns {playerId,…}; top of standings is the couch effort story.
    expect(matchBody.winner.playerId).toBe("beeper:@tg_dave");
    expect(matchBody.standings[0].player.name).toBe("Dave");

    // Mirror metadata endpoint lists the source.
    const botsRes = await fetch(`${base}/bots/state`);
    const botsBody = await j(botsRes);
    expect(botsBody.sources.map((s: any) => s.source)).toContain("bot-beeper-test");
  });

  test("idempotent: pushing the same state twice changes nothing", async () => {
    // ONE store, ONE match — pushed twice. (Two stores would mint two match
    // ids and legitimately appear as two matches.)
    const store = new MatchStore(join(dir, "matches-2.json")).api(base, { source: "bot-beeper-test", debounceMs: 50 });
    playBotMatch(store, "CREW-8Q3");
    await store.syncNow();
    await store.syncNow(); // second identical push

    const crewBody = await j(await fetch(`${base}/crews/CREW-8Q3`));
    expect(crewBody.matches).toHaveLength(1); // still one match — upsert by id
    expect(crewBody.crew.players).toHaveLength(2); // no duplicate players
  });

  test("API down: file store keeps working, mirror records the failure, nothing throws", async () => {
    const dead = "http://127.0.0.1:9"; // nothing listens on discard port
    const store = new MatchStore(join(dir, "matches-3.json")).api(dead, { debounceMs: 10 });
    const bus = playBotMatch(store); // every command must still succeed
    const reply = bus.handle({ chatId: "beeper:!telegram_dogfood:local", playerId: "beeper:@tg_ben", playerName: "Ben", text: "s" });
    expect(reply).toContain("Dave"); // standings card served from the file store

    await store.syncNow();
    const status = store.apiStatus();
    expect(status?.lastOk).toBe(false);
    expect(status?.lastError).toBeTruthy();

    // The file fallback really is the source of truth offline.
    const stored = JSON.parse(readFileSync(join(dir, "matches-3.json"), "utf8"));
    expect(stored["beeper:!telegram_dogfood:local"].state.status).toBe("complete");
  });

  test("apiStatus() is null until .api() is enabled", async () => {
    const store = new MatchStore(join(dir, "matches-4.json"));
    expect(store.apiStatus()).toBeNull();
    expect(await store.syncNow()).toBe(false); // no-op when not enabled
  });
});
