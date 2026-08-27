// @rwf/bot-core — G-family bot tests: rematch (G-26) · digest (G-27) ·
// nemesis (G-28) · photo finish (G-30). Run: bun test packages/bot-core

import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandBus } from "../src/bus.ts";
import { MatchStore } from "../src/store.ts";
import { CORAL } from "../src/card-image.ts";

let dir: string;
let file: string;
let store: MatchStore;
let bus: CommandBus;

const CHAT = "chat-g";
const msg = (playerId: string, playerName: string, text: string) => ({
  chatId: CHAT,
  playerId,
  playerName,
  text,
});
const ben = (text: string) => msg("u-ben", "Ben", text);
const dave = (text: string) => msg("u-dave", "Dave", text);

/** Play a quick 2-player match to completion. Dave=couch, Ben=athlete. */
function playMatch(daveRaw: number, benRaw: number) {
  bus.handle(ben("start"));
  if (daveRaw > 0) bus.handle(dave(`log pushups ${daveRaw}`));
  bus.handle(ben(`log pushups ${benRaw}`)); // ben always closes
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rwf-gfamily-"));
  file = join(dir, "bot-matches.json");
  store = new MatchStore(file);
  bus = new CommandBus(store, { cardsDir: join(dir, "cards") });
});

// ── rematch (G-26) ───────────────────────────────────────────────────────────

describe("rematch", () => {
  test("full flow: card, pre-joined roster, fresh pot, carried settings, history grows", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("link CREW-G1"));
    bus.handle(dave("pot 500"));
    playMatch(68, 100); // dave 102 vs ben 100 — dave wins, pot $5
    expect(store.get(CHAT)?.state.status).toBe("complete");

    const card = bus.handle(ben("rematch"));
    expect(card).toContain("🔁 *RUN IT BACK — same crew, same rules*");
    expect(card).toContain("Match 2 in this chat — first to 100 reps");
    expect(card).toContain("Roster carried over (2): Ben (athlete) · Dave (couch)");
    expect(card).toContain("Fresh pot — starting from $0.00");
    expect(card).toContain("Last one went to *Dave*"); // revenge line

    const next = store.get(CHAT)!;
    expect(next.state.status).toBe("open");
    expect(next.state.players).toHaveLength(2); // pre-joined, tiers carried
    expect(next.state.players.map((p) => p.tier).sort()).toEqual(["athlete", "couch"]);
    expect(next.state.config.targetReps).toBe(100); // settings carried
    expect(next.potCents).toBe(0); // fresh pot
    expect(next.crewCode).toBe("CREW-G1"); // crew binding survives
    expect(next.history).toHaveLength(1);
    expect(next.history![0].winnerId).toBe("u-dave");
    expect(next.history![0].potCents).toBe(500);

    // roster is pre-joined → start works with no join step
    playMatch(40, 100); // ben 100 vs dave 60 — ben takes the rematch
    expect(store.get(CHAT)?.state.status).toBe("complete");
    expect(store.historyFor(CHAT)).toHaveLength(2);
    expect(store.historyFor(CHAT)[1].winnerId).toBe("u-ben");

    // rematch chains from the latest completed match
    const again = bus.handle(dave("rematch"));
    expect(again).toContain("Match 3 in this chat");
    expect(again).toContain("Last one went to *Ben*");

    // persisted shape: history lives inside the chat entry (backward compatible)
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(Object.keys(saved)).toContain(CHAT);
    expect(saved[CHAT].history).toHaveLength(2);
    expect(saved[CHAT].history[0].matchId).toMatch(/^m-/);
  });

  test("guards: no match / still open / still live", () => {
    expect(bus.handle(ben("rematch"))).toContain("no match in this chat");
    bus.handle(ben("new 100"));
    expect(bus.handle(ben("rematch"))).toContain("finish it first");
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    expect(bus.handle(ben("rematch"))).toContain("finish it first");
  });

  test("`new` over a completed match also preserves history", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(60, 100);
    bus.handle(ben("new 150"));
    expect(store.historyFor(CHAT)).toHaveLength(1);
    expect(store.get(CHAT)?.state.config.targetReps).toBe(150);
  });
});

// ── photo finish (G-30) ──────────────────────────────────────────────────────

describe("photo finish", () => {
  test("close result: dramatic banner + coral SVG variant", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(68, 100); // dave 102 vs ben 100 → 2% gap

    const result = bus.handle(dave("result"));
    expect(result).toContain("📸 *PHOTO FINISH — top two separated by 2%*");
    expect(result).toContain("MATCH RESULT"); // standard card still intact
    expect(result).toContain("*Dave* takes it — adjusted score *102*");

    const m = store.get(CHAT)!;
    const path = join(dir, "cards", `${m.state.config.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`);
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, "utf8");
    expect(svg).toContain(CORAL); // coral accent border variant
    expect(svg).toContain("PHOTO FINISH · TOP TWO SEPARATED BY 2%");
  });

  test("blowout: standard card, lime SVG (no coral)", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(60, 100); // ben 100 vs dave 90 → 10% gap

    const result = bus.handle(dave("result"));
    expect(result).not.toContain("PHOTO FINISH");

    const m = store.get(CHAT)!;
    const path = join(dir, "cards", `${m.state.config.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`);
    const svg = readFileSync(path, "utf8");
    expect(svg).not.toContain(CORAL);
    expect(svg).toContain("MATCH RESULT · FIRST TO 100");
  });
});

// ── nemesis (G-28) ───────────────────────────────────────────────────────────

describe("nemesis", () => {
  test("no history yet → graceful", () => {
    expect(bus.handle(ben("nemesis"))).toContain("rivalries need history");
  });

  test("split head-to-head → each is the other's nemesis; name lookup works", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(68, 100); // dave wins match 1
    bus.handle(ben("rematch"));
    playMatch(40, 100); // ben wins match 2

    expect(bus.handle(dave("nemesis"))).toBe(
      "⚔️ *Dave*'s nemesis is *Ben* — beaten 1 of 2 times they've played."
    );
    expect(bus.handle(ben("nemesis"))).toBe(
      "⚔️ *Ben*'s nemesis is *Dave* — beaten 1 of 2 times they've played."
    );
    // lookup by name from anyone
    expect(bus.handle(ben("nemesis dave"))).toContain("*Dave*'s nemesis is *Ben*");
    // unknown name → friendly error
    expect(bus.handle(ben("nemesis zeus"))).toContain("no one called");
  });

  test("dominant player has no nemesis yet", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(68, 100); // dave wins
    bus.handle(ben("rematch"));
    playMatch(68, 100); // dave wins again — ben never stood a chance
    expect(bus.handle(dave("nemesis"))).toContain("*Dave* has no nemesis yet");
    expect(bus.handle(dave("nemesis"))).toContain("nobody's beaten them twice");
  });
});

// ── Monday digest (G-27) ─────────────────────────────────────────────────────

describe("digest", () => {
  test("no history yet → graceful", () => {
    expect(bus.handle(ben("digest"))).toContain("No finished matches in this chat yet");
  });

  test("recap card: matches, biggest win, stats, pots, rivalry, season leader", () => {
    bus.handle(ben("season new Preseason"));
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(dave("pot 500"));
    playMatch(68, 100); // dave 102 vs ben 100 — photo-finish win
    bus.handle(ben("rematch"));
    bus.handle(dave("pot 300"));
    playMatch(40, 100); // ben 100 vs dave 60 — statement win

    const digest = bus.handle(ben("digest"));
    expect(digest).toContain("📋 *MONDAY DIGEST — week in review*");
    expect(digest).toContain("2 matches played in this chat");
    expect(digest).toContain("Biggest win: *Ben* over *Dave* by 40 adjusted (100 vs 60)");
    expect(digest).toContain("Most closures: *Ben* ×2");
    expect(digest).toContain("Photo finish of the week: *Dave* held off *Ben* by just 2%");
    expect(digest).toContain("Charity pot this week: *$8.00*");
    expect(digest).toContain("Rivalry watch:");
    expect(digest).toContain("🏁 Preseason: *");
    expect(digest).toContain("leads the ladder on 5 pts"); // dave: win+played (4) + played (1)
  });

  test("async digest silently skips the AI line when the endpoint is down", async () => {
    process.env.RWF_AI_URL = "http://127.0.0.1:9/api/ai"; // nothing listens here
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    playMatch(60, 100);
    const digest = await bus.handleAsync(ben("digest"));
    expect(digest).toContain("MONDAY DIGEST");
    expect(digest).not.toContain("🤖");
    delete process.env.RWF_AI_URL;
  });
});

// ── help ─────────────────────────────────────────────────────────────────────

describe("help lists the G-family commands", () => {
  test("rematch, nemesis, digest on the card", () => {
    const h = bus.handle(ben("help"));
    for (const c of ["rematch", "nemesis", "digest"]) expect(h).toContain(c);
  });
});
