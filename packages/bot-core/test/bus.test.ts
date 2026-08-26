// Full match flow through the CommandBus, plus parsing/edge cases.
// Run: bun test packages/bot-core

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandBus, looksLikeCommand, parse } from "../src/bus.ts";
import { MatchStore } from "../src/store.ts";

let dir: string;
let file: string;
let store: MatchStore;
let bus: CommandBus;

const CHAT = "chat-1";
const msg = (playerId: string, playerName: string, text: string) => ({
  chatId: CHAT,
  playerId,
  playerName,
  text,
});

// ben=athlete, dave=couch, nico=fit — the core thesis demo: the athlete
// closes the match, but the couch player's effort-adjusted score wins.
const ben = (text: string) => msg("u-ben", "Ben", text);
const dave = (text: string) => msg("u-dave", "Dave", text);
const nico = (text: string) => msg("u-nico", "Nico", text);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rwf-bus-"));
  file = join(dir, "bot-matches.json");
  store = new MatchStore(file);
  bus = new CommandBus(store);
});

describe("parsing", () => {
  test("bare command", () => {
    expect(parse("standings")).toEqual({ cmd: "standings", args: [], rest: "" });
  });
  test("s alias + args + rest", () => {
    expect(parse("s now please")).toEqual({ cmd: "standings", args: ["now", "please"], rest: "now please" });
  });
  test("rwf prefix and punctuation", () => {
    expect(parse("/rwf log pushups 25!")).toEqual({ cmd: "log", args: ["pushups", "25!"], rest: "pushups 25!" });
    expect(parse("!rwf new")).toEqual({ cmd: "new", args: [], rest: "" });
  });
  test("empty → null", () => {
    expect(parse("   ")).toBeNull();
  });
  test("looksLikeCommand filters chatter", () => {
    expect(looksLikeCommand("log pushups 25")).toBe(true);
    expect(looksLikeCommand("/rwf s")).toBe(true);
    expect(looksLikeCommand("hey mate how's the match going")).toBe(false);
    expect(looksLikeCommand("")).toBe(false);
  });
});

describe("command errors (friendly cards, never throws)", () => {
  test("commands before a match exists", () => {
    expect(bus.handle(ben("join"))).toContain("no match in this chat");
    expect(bus.handle(ben("start"))).toContain("no match in this chat");
    expect(bus.handle(ben("log pushups 10"))).toContain("no match in this chat");
    expect(bus.handle(ben("s"))).toContain("no match in this chat");
    expect(bus.handle(ben("pot 500"))).toContain("no match in this chat");
    expect(bus.handle(ben("result"))).toContain("no match in this chat");
  });

  test("empty and unknown text → help", () => {
    expect(bus.handle(ben(""))).toContain("REPS WITH FRIENDS");
    expect(bus.handle(ben("flurb"))).toContain("Unknown command");
  });

  test("new with bad target", () => {
    expect(bus.handle(ben("new abc"))).toContain("bad target");
    expect(bus.handle(ben("new -5"))).toContain("bad target");
  });

  test("join with bad tier", () => {
    bus.handle(ben("new"));
    expect(bus.handle(dave("join swole"))).toContain("unknown tier");
  });

  test("start needs 2 players", () => {
    bus.handle(ben("new"));
    bus.handle(ben("join athlete"));
    expect(bus.handle(ben("start"))).toContain("at least 2");
  });

  test("log before start / unknown exercise / bad reps / non-player", () => {
    bus.handle(ben("new"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    expect(bus.handle(ben("log pushups 10"))).toContain("hasn't started");
    bus.handle(ben("start"));
    expect(bus.handle(ben("log pullups 10"))).toContain("isn't in this match");
    expect(bus.handle(ben("log pushups ten"))).toContain("bad reps");
    expect(bus.handle(ben("log pushups"))).toContain("usage");
    const outsider = msg("u-zoe", "Zoe", "log pushups 10");
    expect(bus.handle(outsider)).toContain("you're not in this match");
  });
});

describe("full match flow: new → join×3 → start → logs → close → result", () => {
  test("plays out with the couch player winning on adjusted score", () => {
    // new
    const newReply = bus.handle(ben("new"));
    expect(newReply).toContain("first to 300 reps");

    // join ×3 (tiers: athlete / couch / fit)
    expect(bus.handle(ben("join athlete"))).toContain("*Ben* in as *athlete* (1 playing)");
    expect(bus.handle(dave("join couch"))).toContain("*Dave* in as *couch* (2 playing)");
    expect(bus.handle(nico("join fit"))).toContain("*Nico* in as *fit* (3 playing)");
    // duplicate join is a no-op card
    expect(bus.handle(dave("join fit"))).toContain("already in as *couch*");

    // start
    const startReply = bus.handle(ben("start"));
    expect(startReply).toContain("LIVE");
    expect(startReply).toContain("Dave (couch)");
    expect(bus.handle(ben("start"))).toContain("already live");

    // logs (dave 195 raw · nico 100 raw · ben 30 then closes with 280 → 310)
    expect(bus.handle(dave("log pushups 40"))).toContain("*Dave* logs 40 Push-ups");
    expect(bus.handle(nico("log squats 60!"))).toContain("✅camera"); // verified bang
    expect(bus.handle(ben("log burpees 30"))).toContain("*Ben* logs 30 Burpees");
    expect(bus.handle(dave("log Squats 60"))).toContain("*Dave* logs 60 Squats"); // case + plural ok
    expect(bus.handle(dave("log sit-ups 50"))).toContain("*Dave* logs 50 Sit-ups"); // hyphenated name ok
    expect(bus.handle(dave("log burpee 45"))).toContain("*Dave* logs 45 Burpees"); // singular ok

    // standings mid-match: couch leads on adjusted
    const mid = bus.handle(nico("s"));
    expect(mid).toContain("*Standings* (LIVE)");
    expect(mid.indexOf("Dave")).toBeLessThan(mid.indexOf("Ben")); // 225 adj vs 25.5

    // taunt resolves player names
    const taunt = bus.handle(ben("taunt dave"));
    expect(taunt).toContain("*Dave*");
    expect(bus.handle(ben("taunt"))).toMatch(/😤/); // random target fallback

    // pot
    expect(bus.handle(dave("pot 500"))).toContain("$5.00");
    expect(bus.handle(nico("pot 1000"))).toContain("$15.00");
    expect(bus.handle(dave("pot -5"))).toContain("bad amount");
    expect(bus.handle(dave("pot five"))).toContain("bad amount");

    // close: ben (athlete) hits 310 raw → match complete
    const closeReply = bus.handle(ben("log pushups 280"));
    expect(closeReply).toContain("THAT'S 300! MATCH CLOSED");
    expect(bus.handle(ben("log pushups 10"))).toContain("match is closed");

    // result: dave (couch, 195 raw × 1.5 = 292.5) beats ben (310×0.85 + 15 = 278.5)
    const result = bus.handle(nico("result"));
    expect(result).toContain("MATCH RESULT");
    expect(result).toContain("*Dave* takes it — adjusted score *292.5*");
    expect(result).toContain("$15.00"); // pot on the card

    // link binds chatId → crewCode
    expect(bus.handle(ben("link CREW-7Q2"))).toContain("CREW-7Q2");
    expect(bus.handle(ben("link two words"))).toContain("usage");

    // persisted file: shape + crewCode + pot
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(Object.keys(saved)).toEqual([CHAT]);
    expect(saved[CHAT].crewCode).toBe("CREW-7Q2");
    expect(saved[CHAT].potCents).toBe(1500);
    expect(saved[CHAT].state.status).toBe("complete");
    expect(saved[CHAT].state.closedBy).toBe("u-ben");

    // reload from disk → same match
    const reloaded = new MatchStore(file);
    expect(reloaded.get(CHAT)?.state.status).toBe("complete");
    expect(reloaded.get(CHAT)?.crewCode).toBe("CREW-7Q2");

    // new after complete is allowed
    expect(bus.handle(ben("new 150"))).toContain("first to 150 reps");
  });
});

describe("custom target", () => {
  test("new 100 closes at 100", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join casual"));
    bus.handle(dave("join casual"));
    bus.handle(ben("start"));
    expect(bus.handle(ben("log pushups 100"))).toContain("THAT'S 100! MATCH CLOSED");
  });
});
