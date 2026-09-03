// SotCommandBus — the Source-of-Truth daily model through chat.
// Run: bun test packages/bot-core
//
// Covers the full grammar arc on an injected clock:
//   full day (win + bank + fail) · steal-pure-gain (state + card language) ·
//   stake agreement flow (charity + dare fulfilment) · season standings 1:1 ·
//   deadline auto-close · power-up canon · parse/errors.

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SotCommandBus, SotStore, looksLikeSotCommand, parseSot } from "../src/sot-bus.ts";

const CHAT = "sot-chat-1";
const msg = (playerId: string, playerName: string, text: string) => ({
  chatId: CHAT,
  playerId,
  playerName,
  text,
});
const ben = (t: string) => msg("u-ben", "Ben", t);   // athlete (×0.85 → 236 physical)
const dave = (t: string) => msg("u-dave", "Dave", t); // couch (×1.5 → 134 physical)
const nico = (t: string) => msg("u-nico", "Nico", t); // fit (×1.0 → 200 physical)

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

let dir: string;
let t: number;
let store: SotStore;
let bus: SotCommandBus;

/** Mon 7 Sep 2026, 09:00 local — a weekday, deterministic play day. */
function baseMonday(): number {
  return new Date(2026, 8, 7, 9, 0, 0, 0).getTime();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rwf-sot-"));
  t = baseMonday();
  store = new SotStore(join(dir, "sot-groups.json"));
  bus = new SotCommandBus(store, { now: () => t, dayWindowMs: 6 * HOUR });
});

/** Standard 3-player group with an open day. */
function openDay(): void {
  bus.handle(ben("new"));
  bus.handle(ben("join athlete"));
  bus.handle(dave("join couch"));
  bus.handle(nico("join fit"));
  bus.handle(ben("start"));
}

describe("sot parsing", () => {
  test("bare + alias + rwf prefix", () => {
    expect(parseSot("s")).toEqual({ cmd: "standings", args: [], rest: "" });
    expect(parseSot("ladder")).toEqual({ cmd: "season", args: [], rest: "" });
    expect(parseSot("/rwf log pushups 25!")).toEqual({ cmd: "log", args: ["pushups", "25!"], rest: "pushups 25!" });
    expect(parseSot("   ")).toBeNull();
  });
  test("looksLikeSotCommand filters chatter", () => {
    expect(looksLikeSotCommand("steal @dave")).toBe(true);
    expect(looksLikeSotCommand("/rwf day close")).toBe(true);
    expect(looksLikeSotCommand("anyone up for the beach?")).toBe(false);
  });
  test("help speaks SOT: Daily Win + bank your day + reps", () => {
    const card = bus.handle(ben("help"));
    expect(card).toContain("WINS THE DAY");
    expect(card).toContain("bank your day");
    expect(card).toContain("reps");
    expect(card).not.toContain("RUF");
  });
});

describe("sot errors (friendly cards, never throws)", () => {
  test("commands before a group exists", () => {
    expect(bus.handle(ben("join"))).toContain("no battle group");
    expect(bus.handle(ben("start"))).toContain("no battle group");
    expect(bus.handle(ben("log pushups 10"))).toContain("no battle group");
    expect(bus.handle(ben("s"))).toContain("no battle group");
    expect(bus.handle(ben("day close"))).toContain("no battle group");
  });
  test("unknown command → help", () => {
    expect(bus.handle(ben("flurb"))).toContain("Unknown command");
  });
  test("new with bad target / join with bad tier / start needs 2", () => {
    expect(bus.handle(ben("new abc"))).toContain("bad target");
    bus.handle(ben("new"));
    expect(bus.handle(dave("join swole"))).toContain("unknown tier");
    expect(bus.handle(ben("start"))).toContain("at least 2");
  });
  test("log before start / bad reps / unknown exercise / outsider", () => {
    bus.handle(ben("new"));
    bus.handle(ben("join athlete"));
    bus.handle(dave("join couch"));
    expect(bus.handle(ben("log pushups 10"))).toContain("no battle open");
    bus.handle(ben("start"));
    expect(bus.handle(ben("log pullups 10"))).toContain("isn't in this battle");
    expect(bus.handle(ben("log pushups ten"))).toContain("bad reps");
    expect(bus.handle(ben("log pushups"))).toContain("usage");
    expect(bus.handle(msg("u-zoe", "Zoe", "log pushups 10"))).toContain("you're not in this crew");
  });
  test("join mid-day is held for the next one", () => {
    openDay();
    expect(bus.handle(msg("u-zoe", "Zoe", "join fit"))).toContain("in for the next one");
  });
});

describe("sot full day arc: new → join → start → WIN → BANK → close → ladder", () => {
  test("creator card shows adjusted targets per tier; join shows physical target", () => {
    const card = bus.handle(ben("new"));
    expect(card).toContain("200 adjusted reps");
    expect(card).toContain("134 physical reps");   // couch ×1.5
    expect(card).toContain("160 physical reps");   // casual ×1.25
    expect(card).toContain("236 physical reps");   // athlete ×0.85
    const j = bus.handle(dave("join couch"));
    expect(j).toContain("*Dave* in as *couch* (2 in the crew)");
    expect(j).toContain("134 physical reps");
    expect(bus.handle(dave("join couch"))).toContain("already in as *couch*");
  });

  test("first to target gets the DAILY WIN moment; later finishers BANK", () => {
    openDay();

    // Dave (couch ×1.5) logs 50 pushups → +75, 125 to go, mid-race card.
    const r1 = bus.handle(dave("log pushups 50"));
    expect(r1).toContain("*+75 reps*");
    expect(r1).toContain("125 to go");

    // Ben (athlete ×0.85) crosses 200 first (236 physical → 200.6) — THE moment.
    const win = bus.handle(ben("log burpees 236"));
    expect(win).toContain("WINS THE DAY");
    expect(win).toContain("battle continues");
    expect(win).toContain("+1 season point");
    expect(win).toContain("bank your day");

    // Dave finishes later (84 squats ×1.5 = +126 → 201) — banked, not a win.
    const bank = bus.handle(dave("log squats 84"));
    expect(bank).toContain("BANKS THE DAY");
    expect(bank).toContain("streak started");
    expect(bank).toContain("already taken");

    // Nico never logs. Standings show won/banked/in-progress states.
    const s = bus.handle(nico("s"));
    expect(s).toContain("WON THE DAY");
    expect(s).toContain("BANKED");
    expect(s).toContain("failing if this holds");

    // Close at the deadline: recap + season bookkeeping.
    t += 6 * HOUR + MIN;
    const recap = bus.handle(ben("day close"));
    expect(recap).toContain("Ben WINS THE DAY");
    expect(recap).toContain("Banked the day: Dave");
    expect(recap).toContain("Failed the day: Nico");
    expect(recap).toContain("streaks reset");

    // 1:1 — one Daily Win = one point; banking is not a point.
    const ladder = bus.handle(ben("season ladder"));
    expect(ladder).toContain("*Ben* — 1 pt (1 W · 1 banked");
    expect(ladder).toContain("*Dave* — 0 pts (0 W · 1 banked");
    expect(ladder).toContain("*Nico* — 0 pts (0 W · 0 banked");

    // State check: day closed, season has the day, streaks applied.
    const g = store.get(CHAT)!;
    expect(g.day?.status).toBe("closed");
    expect(g.season.days).toHaveLength(1);
    expect(g.season.points["u-ben"]).toBe(1);
    expect(g.season.streaks["u-dave"].length).toBe(1);
    expect(g.season.streaks["u-nico"].length).toBe(0);
  });

  test("deadline auto-closes: the next command carries the recap", () => {
    openDay();
    bus.handle(ben("log burpees 236")); // Ben wins
    t += 6 * HOUR + MIN;                // …then the clock runs out
    const reply = bus.handle(dave("season ladder"));
    expect(reply.startsWith("⏰ *DEADLINE")).toBe(true);
    expect(reply).toContain("Ben WINS THE DAY");
    expect(reply).toContain("weekly ladder");
    expect(store.get(CHAT)!.day?.status).toBe("closed");
  });

  test("day close before the deadline refuses unless forced", () => {
    openDay();
    const early = bus.handle(ben("day close"));
    expect(early).toContain("deadline hasn't hit yet");
    const forced = bus.handle(ben("day close force"));
    expect(forced).toContain("Day closed");
    expect(store.get(CHAT)!.day?.status).toBe("closed");
  });

  test("two days, different winners — ladder tracks 1:1 points", () => {
    openDay();
    bus.handle(ben("log burpees 236"));       // day 1: Ben wins
    bus.handle(dave("log pushups 90"));       // +135
    bus.handle(dave("log lunges 44"));        // +66 → 201 → banks
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));

    t = baseMonday() + 24 * HOUR; // Tue 8 Sep — next active day
    bus.handle(ben("start"));
    bus.handle(dave("log pushups 90")); // +135
    bus.handle(nico("log squats 200")); // Nico first to 200 → wins day 2
    bus.handle(dave("log lunges 44"));  // +66 → 201 → banks
    bus.handle(ben("log pushups 236")); // Ben banks too late
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));

    const ladder = bus.handle(ben("season ladder"));
    expect(ladder).toContain("2 day");
    expect(ladder).toContain("*Nico* — 1 pt (1 W · 1 banked");
    expect(ladder).toContain("*Ben* — 1 pt (1 W · 2 banked");
    expect(ladder).toContain("*Dave* — 0 pts (0 W · 2 banked");
  });
});

describe("sot steal — PURE GAIN (the SOT correction, in state and in words)", () => {
  test("activator gains 10%, target keeps every rep", () => {
    openDay();
    bus.handle(ben("log pushups 100")); // athlete ×0.85 → 85 reps banked

    const card = bus.handle(dave("steal @ben"));
    expect(card).toContain("REP STEAL");
    expect(card).toContain("GAIN");
    expect(card).toContain("Ben keeps every rep");

    const day = store.get(CHAT)!.day!;
    expect(day.progress["u-ben"].ruf).toBe(85);            // UNCHANGED
    expect(day.progress["u-ben"].bonusRuf).toBe(0);
    expect(day.progress["u-dave"].bonusRuf).toBe(8.5);     // 10% gain
    expect(day.progress["u-dave"].ruf).toBe(0);            // nothing earned
    // Stolen credit is scoreboard padding — it does NOT count toward the target.
    expect(day.progress["u-dave"].ruf + day.progress["u-dave"].creditRuf).toBe(0);
  });

  test("steal on an empty target fails friendly; one steal per day", () => {
    openDay();
    expect(bus.handle(dave("steal @nico"))).toContain("no completed score to skim");
    expect(bus.handle(nico("steal @ben"))).toContain("no completed score to skim");
    // Spend the card, then try again — the kit only deals one steal per day.
    bus.handle(ben("log pushups 100"));
    bus.handle(dave("steal @ben"));
    bus.handle(ben("log pushups 20"));
    expect(bus.handle(dave("steal @ben"))).toContain("no steal card held");
  });

  test("steal needs a target that exists", () => {
    openDay();
    expect(bus.handle(dave("steal @ghost"))).toContain("no rival called");
  });
});

describe("sot stakes — agreement gating + season resolution", () => {
  test("charity: propose → wait → active → contribute → resolve → direct → donate", () => {
    openDay();

    const prop = bus.handle(ben("stake charity Everyone stumps 100 points — winner directs the pot"));
    expect(prop).toContain("STAKE PROPOSED — CHARITY");
    expect(prop).toContain("winner directs the pot");
    expect(prop).toContain("`agree`");

    // Partial agreement keeps it proposed.
    bus.handle(ben("agree"));
    const wait = bus.handle(dave("agree"));
    expect(wait).toContain("Still waiting on");
    // Pot is sealed until everyone agrees.
    expect(bus.handle(nico("pot 100"))).toContain("pot is not open");

    const active = bus.handle(nico("agree"));
    expect(active).toContain("STAKE ACTIVE");

    // Play the day so someone has the most wins.
    bus.handle(ben("log burpees 236")); // Ben wins the day
    bus.handle(dave("log pushups 90"));
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));

    // Contribute, then settle the season.
    const pot = bus.handle(dave("pot 100"));
    expect(pot).toContain("*100 points* banked");
    bus.handle(ben("pot 100"));
    bus.handle(nico("pot 100"));
    expect(bus.handle(ben("pot"))).toContain("— 300 points*");

    const end = bus.handle(ben("season end"));
    expect(end).toContain("SEASON OVER");
    expect(end).toContain("Season champion: *Ben*");
    expect(end).toContain("directs the charity pot");

    // Only the winner directs.
    expect(bus.handle(dave("charity Coast Rescue"))).toContain("only the season winner");
    bus.handle(ben("charity Coast Rescue"));
    const donate = bus.handle(ben("donate"));
    expect(donate).toContain("300 points to Coast Rescue");
    expect(donate).toContain("fee 0 points");

    const stake = bus.handle(ben("stake"));
    expect(stake).toContain("Donated: 300 points");
  });

  test("dare: losers owe fulfilment, settled with `stake done`", () => {
    openDay();
    bus.handle(ben("stake dare Loser does 50 burpees on video"));
    bus.handle(ben("agree"));
    bus.handle(dave("agree"));
    bus.handle(nico("agree"));
    bus.handle(ben("log burpees 236")); // Ben wins; Nico (0) owes
    bus.handle(dave("log pushups 90"));
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));

    const end = bus.handle(ben("season end"));
    expect(end).toContain("owe");
    expect(end).toContain("stake done");

    const status = bus.handle(ben("stake"));
    expect(status).toContain("Nico: pending");

    const done = bus.handle(nico("stake done video in the chat"));
    expect(done).toContain("marked the stake fulfilled");
    expect(bus.handle(ben("stake"))).toContain("video in the chat");
  });

  test("decline voids the stake — nothing agreed, nothing owed", () => {
    openDay();
    bus.handle(ben("stake dinner Loser buys the crew dinner"));
    bus.handle(ben("agree"));
    const voided = bus.handle(dave("decline"));
    expect(voided).toContain("declined — the stake is void");
    expect(bus.handle(nico("agree"))).toContain("nothing to agree to");
  });

  test("second stake on the same season is refused", () => {
    openDay();
    bus.handle(ben("stake dinner Loser buys dinner"));
    expect(bus.handle(dave("stake dare anything"))).toContain("already has a stake");
  });
});

describe("sot power-up canon (chat)", () => {
  test("lightning triples the next window's logs", () => {
    openDay();
    const card = bus.handle(ben("lightning"));
    expect(card).toContain("LIGHTNING ROUND");
    expect(card).toContain("×3");
    const log = bus.handle(ben("log pushups 50")); // athlete 0.85 ×3 = 127.5
    expect(log).toContain("*+127.5 reps*");
    // …but the window is 10 minutes — after it, normal pricing.
    t += 11 * MIN;
    const after = bus.handle(ben("log pushups 10"));
    expect(after).toContain("*+8.5 reps*");
  });

  test("shield saves the failing streak at close; freeze extends; rope credits; bomb defuses", () => {
    openDay();
    bus.handle(ben("log burpees 236")); // Ben wins the day

    // Freeze: +30 min group-wide (deadline 15:00 → 15:30).
    const freeze = bus.handle(dave("freeze"));
    expect(freeze).toContain("30 minutes");
    expect(freeze).toContain("group-wide");

    // Rope: 50-credit to inactive Nico (counts toward the target).
    const rope = bus.handle(dave("rope @nico"));
    expect(rope).toContain("RESCUE ROPE");
    expect(store.get(CHAT)!.day!.progress["u-nico"].creditRuf).toBe(50);

    // Bomb on Dave; he defuses by banking 20+ reps inside the window.
    const bomb = bus.handle(ben("bomb @dave"));
    expect(bomb).toContain("SURPRISE BOMB");
    const defuse = bus.handle(dave("log pushups 20")); // 30 reps + 20 bonus
    expect(defuse).toContain("DEFUSES THE BOMB");
    expect(defuse).toContain("+20 bonus reps");
    const d = store.get(CHAT)!.day!;
    expect(d.progress["u-dave"].ruf).toBe(50); // 30 earned + 20 defusal bonus

    // Shield armed, then the deadline: Nico (50/200) fails but is shielded.
    const shield = bus.handle(ben("shield"));
    expect(shield).toContain("GROUP SHIELD");
    expect(shield).toContain("streak");

    t += 6 * HOUR + 31 * MIN; // past 15:30 — the freeze bought the group 30 min
    // Past the extended deadline: the next command auto-closes the day and
    // prepends the recap. Dave (50/200) and Nico (50/200 via rope) both fail
    // the target — the armed shield converts both to shielded, streaks saved.
    const recap = bus.handle(ben("day close"));
    expect(recap.startsWith("⏰ *DEADLINE — the day closed itself:*")).toBe(true);
    expect(recap).toContain("Failed but shielded (streaks saved): Dave, Nico");
    expect(recap).toContain("Group Shield was consumed");
  });

  test("cards shows the dealt hand and shrinks as cards are spent", () => {
    openDay();
    const hand = bus.handle(ben("cards"));
    expect(hand).toContain("Lightning Round");
    expect(hand).toContain("Rep Steal");
    bus.handle(ben("lightning"));
    const after = bus.handle(ben("cards"));
    expect(after).toContain("(5):");
  });
});

describe("sot group persistence + season rollover", () => {
  test("season end then `new` starts a fresh week in the same chat", () => {
    openDay();
    bus.handle(ben("log burpees 236"));
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));
    const end = bus.handle(ben("season end"));
    expect(end).toContain("SEASON OVER");

    t = baseMonday() + 24 * HOUR;
    const next = bus.handle(ben("new"));
    expect(next).toContain("Daily battle created");
    const g = store.get(CHAT)!;
    expect(g.season.days).toHaveLength(0);
    expect(g.players.map((p) => p.id)).toEqual(["u-ben"]); // fresh roster, creator in
  });

  test("start on a non-active day says which days the crew battles", () => {
    openDay();
    t += 6 * HOUR + MIN;
    bus.handle(ben("day close"));
    t = baseMonday() + 5 * 24 * HOUR; // Sat 12 Sep — not Mon–Fri
    const reply = bus.handle(ben("start"));
    expect(reply).toContain("isn't an active day");
    expect(reply).toContain("Mon · Tue · Wed · Thu · Fri");
  });
});
