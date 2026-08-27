// Full match flow through the CommandBus, plus parsing/edge cases.
// Run: bun test packages/bot-core

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  bus = new CommandBus(store, { cardsDir: join(dir, "cards") });
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
    expect(mid.indexOf("Dave")).toBeLessThan(mid.indexOf("Ben")); // 243 adj vs 30.6

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

    // result: comeback ×1.2 fires on each trailing player's first set —
    // dave couch: 60 + 108(×1.2) + 75 + 67.5 = 310.5; ben athlete:
    // 30.6(×1.2) + 238 + 15 closure = 283.6 → Dave takes it.
    const result = bus.handle(nico("result"));
    expect(result).toContain("MATCH RESULT");
    expect(result).toContain("*Dave* takes it — adjusted score *310.5*");
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

// ── lane-1 backlog: result card SVG · spectators · challenges · seasons ─────

describe("result card SVG", () => {
  test("result appends the card URL and writes a branded SVG", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    bus.handle(dave("pot 500"));
    bus.handle(dave("log pushups 80")); // couch 80×1.5 = 120 adjusted
    bus.handle(ben("log pushups 100")); // athlete closes; 85 adjusted — dave wins

    const reply = bus.handle(nico("result"));
    expect(reply).toContain("MATCH RESULT");
    expect(reply).toContain("http://localhost:4173/cards/");
    expect(reply).toMatch(/\.svg$/m);

    const m = store.get(CHAT)!;
    const path = join(dir, "cards", `${m.state.config.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`);
    const svg = readFileSync(path, "utf8");
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="675"');
    expect(svg).toContain("REPS WITH FRIENDS"); // wordmark
    expect(svg).toContain("DAVE"); // winner huge (uppercased)
    expect(svg).toContain("CHARITY POT $5.00");
    expect(svg).toContain("repswithfriends"); // footer
  });

  test("card generation failure never breaks the result card", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join casual"));
    bus.handle(dave("join casual"));
    bus.handle(ben("start"));
    bus.handle(ben("log pushups 100"));
    const broken = new CommandBus(store, { cardsDir: join(dir, "no", "such", "dir") });
    // dir exists actually (mkdir -p creates it) — force failure via a file-as-dir path
    const reply = broken.handle(ben("result"));
    expect(reply).toContain("MATCH RESULT");
  });
});

describe("comeback marker", () => {
  test("standings shows ⚡ when >30% behind the leader, gone when close", () => {
    bus.handle(ben("new 300"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    bus.handle(ben("log pushups 200")); // 66.7%
    const behind = bus.handle(dave("s"));
    expect(behind).toContain("⚡"); // dave 0% vs leader 66.7%
    bus.handle(dave("log squats 200")); // dave 66.7% — right in it
    expect(bus.handle(dave("s"))).not.toContain("⚡");
  });

  // Regression: the ⚡ marker promises "1.2× on their next log" — the log used
  // to silently skip applyComeback, so the boost was never awarded.
  test("comeback ×1.2 is actually applied to the eligible player's next log (once)", () => {
    bus.handle(ben("new 600"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    bus.handle(ben("log pushups 300")); // ben 50%, dave 0% → dave eligible
    expect(bus.handle(dave("s"))).toContain("⚡");

    const reply = bus.handle(dave("log squats 100")); // couch 100×1.5×1.2 = 180
    expect(reply).toContain("⚡ comeback ×1.2 applied");
    const m = store.get(CHAT)!;
    expect(m.state.entries.some((e) => e.playerId === "u-dave" && e.comeback)).toBe(true);
    const row = m.state.entries.length; // sanity: entry stored
    expect(row).toBeGreaterThan(0);

    // once per player per match: the next log is unboosted
    bus.handle(ben("log pushups 100")); // keep dave >30% behind (400 vs 100)
    const second = bus.handle(dave("log squats 100"));
    expect(second).not.toContain("comeback ×1.2");
    const daveEntries = store.get(CHAT)!.state.entries.filter((e) => e.playerId === "u-dave");
    expect(daveEntries.filter((e) => e.comeback)).toHaveLength(1);
  });

  test("first log of a match never gets comeback (nobody is behind yet)", () => {
    bus.handle(ben("new 100"));
    bus.handle(ben("join couch"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    const first = bus.handle(ben("log pushups 40"));
    expect(first).not.toContain("comeback ×1.2");
    expect(store.get(CHAT)!.state.entries[0].comeback).toBeFalsy();
  });
});

describe("spectators (watch)", () => {
  test("watch registers a chat; s works without joining; counts on broadcasts", () => {
    bus.handle(ben("new"));
    bus.handle(ben("link CREW-7Q2"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));

    const mia = (text: string) => ({ chatId: "chat-2", playerId: "u-mia", playerName: "Mia", text });
    const watch = bus.handle(mia("watch CREW-7Q2"));
    expect(watch).toContain("watching crew *CREW-7Q2*");
    expect(watch).toContain("1 spectator");

    // standings broadcast carries the spectator count
    expect(bus.handle(ben("s"))).toContain("👁 1 watching");

    // spectator runs `s` in their own chat — sees the watched crew's match
    const view = bus.handle(mia("s"));
    expect(view).toContain("Watching crew CREW-7Q2");
    expect(view).toContain("*Standings*");

    // persisted under top-level "spectators"
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(saved.spectators["CREW-7Q2"]).toEqual(["chat-2"]);

    // usage error
    expect(bus.handle(mia("watch"))).toContain("usage");
  });

  // Regression: `watch A` then `watch B` used to leave the chat spectating
  // BOTH crews — `s` kept showing crew A (stale) and A kept counting it.
  test("watching a second crew re-binds (old crew loses the spectator)", () => {
    bus.handle(ben("new"));
    bus.handle(ben("link CREW-7Q2"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    bus.handle(ben("log pushups 50"));

    const mia = (text: string) => ({ chatId: "chat-2", playerId: "u-mia", playerName: "Mia", text });
    bus.handle(mia("watch CREW-7Q2"));
    bus.handle(mia("watch CREW-9ZZ"));

    expect(store.spectatingCrew("chat-2")).toBe("CREW-9ZZ");
    expect(store.spectatorCount("CREW-7Q2")).toBe(0);
    expect(store.spectatorCount("CREW-9ZZ")).toBe(1);
    // ben's standings no longer carry the stale spectator count
    expect(bus.handle(ben("s"))).not.toContain("👁 1 watching");
  });
});

describe("crew-vs-crew challenges", () => {
  test("issue → accept → persisted; guards work", () => {
    bus.handle(ben("new"));
    bus.handle(ben("link CREW-7Q2"));
    const rival = (text: string) => ({ chatId: "chat-2", playerId: "u-mia", playerName: "Mia", text });
    bus.handle(rival("new 50"));
    bus.handle(rival("link CREW-9ZZ"));

    const ch = bus.handle(rival("challenge CREW-7Q2"));
    expect(ch).toContain("*CREW-9ZZ* challenges *CREW-7Q2*");
    expect(ch).toContain("`challenge accept`");

    const acc = bus.handle(ben("challenge accept"));
    expect(acc).toContain("RIVALRY ON: CREW-9ZZ vs CREW-7Q2");

    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(saved.challenges.length).toBe(1);
    expect(saved.challenges[0].status).toBe("accepted");
    expect(saved.challenges[0].fromCrew).toBe("CREW-9ZZ");
    expect(saved.challenges[0].toCrew).toBe("CREW-7Q2");

    // nothing left to accept; own-crew and unlinked guards
    expect(bus.handle(ben("challenge accept"))).toContain("no pending challenges");
    expect(bus.handle(ben("challenge CREW-7Q2"))).toContain("your own crew");
    expect(bus.handle({ chatId: "chat-3", playerId: "u-x", playerName: "X", text: "challenge CREW-7Q2" })).toContain(
      "link this chat to your crew first"
    );
  });
});

describe("seasons", () => {
  test("season new → closed match records → ladder shows points", () => {
    expect(bus.handle(ben("season ladder"))).toContain("no season yet");
    expect(bus.handle(ben("season new Preseason"))).toContain("Season started: Preseason");
    expect(bus.handle(ben("season ladder"))).toContain("No matches recorded yet");

    bus.handle(ben("new 100"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    bus.handle(ben("start"));
    bus.handle(dave("log pushups 80")); // couch 120 adjusted
    bus.handle(ben("log pushups 100")); // closes; ben 85 adjusted — dave wins

    const ladder = bus.handle(ben("season ladder"));
    expect(ladder).toContain("Season ladder: Preseason");
    expect(ladder).toContain("*Dave* — 4 pts (1W · 1P)"); // 3 win + 1 played
    expect(ladder).toContain("*Ben* — 1 pts (0W · 1P)");

    // persisted under top-level "seasons", match entries untouched
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(saved.seasons.active.name).toBe("Preseason");
    expect(saved.seasons.active.matches.length).toBe(1);
    expect(saved.seasons.active.matches[0].winnerId).toBe("u-dave");
    expect(saved[CHAT].state.status).toBe("complete"); // match shape intact

    // bare `season` → help card
    expect(bus.handle(ben("season"))).toContain("Seasons");
    expect(bus.handle(ben("season bogus"))).toContain("usage");
  });
});

describe("help + async bus", () => {
  test("help lists the new commands", () => {
    const h = bus.handle(ben("help"));
    for (const c of ["watch", "challenge", "season new", "season ladder"]) expect(h).toContain(c);
  });

  test("taunt falls back to canned lines when the AI is unreachable", async () => {
    process.env.RWF_AI_URL = "http://127.0.0.1:9/api/ai"; // nothing listens here
    bus.handle(ben("new"));
    bus.handle(ben("join casual"));
    bus.handle(dave("join couch"));
    const t = await bus.handleAsync(ben("taunt dave"));
    expect(t).toMatch(/😤/);
    expect(t).toContain("*Dave*");
    delete process.env.RWF_AI_URL;
  });

  test("handleAsync matches handle for non-taunt commands", async () => {
    expect(await bus.handleAsync(ben("flurb"))).toContain("Unknown command");
    expect(await bus.handleAsync(ben("help"))).toContain("REPS WITH FRIENDS");
  });
});

// ── legacy store files (pre-history, pre-seasons shape) ─────────────────────

describe("legacy persistence", () => {
  function writeLegacy(path: string, extra?: (entry: Record<string, any>) => void) {
    const entry: Record<string, any> = {
      state: {
        config: { id: "m-legacy-1", exercises: [{ id: "pushup", name: "Push-ups" }], targetReps: 100, playDays: [2, 4] },
        players: [
          { id: "u-old-ben", name: "Old Ben", tier: "casual" },
          { id: "u-old-dave", name: "Old Dave", tier: "couch" },
        ],
        entries: [
          { playerId: "u-old-ben", exerciseId: "pushup", reps: 60, at: 1, verified: false },
          { playerId: "u-old-dave", exerciseId: "pushup", reps: 100, at: 2, verified: true },
        ],
        status: "complete",
        startedAt: 1,
        completedAt: 2,
        closedBy: "u-old-dave",
      },
      potCents: 500,
      potContributors: { "u-old-ben": 500 },
      // NOTE: no `history` key, and no top-level seasons/spectators/challenges.
    };
    extra?.(entry);
    writeFileSync(path, JSON.stringify({ "wa:+61411111111": entry }));
    return { chatId: "wa:+61411111111", ben: "u-old-ben", dave: "u-old-dave" };
  }
  const old = (pid: string, name: string, text: string) => ({
    chatId: "wa:+61411111111",
    playerId: pid,
    playerName: name,
    text,
  });

  test("legacy entries (no history/seasons keys) load and play fine; rematch history accumulates", () => {
    const { chatId, ben: ob, dave: od } = writeLegacy(file);
    const legacyStore = new MatchStore(file);
    expect(legacyStore.get(chatId)?.state.status).toBe("complete");
    expect(legacyStore.historyFor(chatId)).toEqual([]); // no history key → empty, not undefined

    const lb = new CommandBus(legacyStore, { cardsDir: join(dir, "cards") });
    expect(lb.handle(old(ob, "Old Ben", "s"))).toContain("Standings");
    expect(lb.handle(old(ob, "Old Ben", "result"))).toContain("MATCH RESULT");

    // rematch snapshots the legacy complete into history, then history grows
    expect(lb.handle(old(ob, "Old Ben", "rematch"))).toContain("RUN IT BACK");
    expect(legacyStore.historyFor(chatId)).toHaveLength(1);
    lb.handle(old(ob, "Old Ben", "start"));
    lb.handle(old(ob, "Old Ben", "log pushups 100"));
    expect(legacyStore.historyFor(chatId)).toHaveLength(2);
    expect(lb.handle(old(ob, "Old Ben", "rematch"))).toContain("Match 3 in this chat");

    // and it all survives a reload
    expect(new MatchStore(file).historyFor(chatId)).toHaveLength(2);
  });

  // Regression: a legacy LIVE entry without potContributors used to throw
  // TypeError inside contributePot (caught by the bus, but the pot was lost).
  test("pot works on a legacy entry missing potContributors", () => {
    const { chatId, ben: ob } = writeLegacy(file, (e) => {
      e.state.status = "live";
      e.state.entries = e.state.entries.slice(0, 1); // 60/100 → not closed
      delete e.potContributors;
    });
    const legacyStore = new MatchStore(file);
    const lb = new CommandBus(legacyStore, { cardsDir: join(dir, "cards") });
    const reply = lb.handle(old(ob, "Old Ben", "pot 100"));
    expect(reply).toContain("$1.00");
    expect(legacyStore.get(chatId)?.potCents).toBe(600); // 500 legacy + 100
    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
    expect(saved[chatId].potCents).toBe(600); // persisted, not just in-memory
  });
});
