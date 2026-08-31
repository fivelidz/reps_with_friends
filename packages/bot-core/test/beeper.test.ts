// BeeperDesktopTransport tests — transport-level, against a mocked Beeper
// Desktop API (MockBeeperServer: REST + WS, same shapes as the real local API
// documented at developers.beeper.com/desktop-api). No live Beeper needed.
//
// Covers: chat⇄crew mapping, event→command parsing, echo suppression, reply
// formatting (mrkdwn→markdown), probe (up/authed detection), list-chats
// normalization, send path, and the full inbound→CommandBus→reply loop.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandBus } from "../src/bus.ts";
import { MatchStore } from "../src/store.ts";
import {
  BeeperBot,
  BeeperDesktopTransport,
  CrewLinkMap,
  beeperEventToInbound,
  formatBeeperReply,
  networkFromChatId,
} from "../src/transports/beeper.ts";
import { MockBeeperServer } from "../src/transports/mock-beeper.ts";
import type { InboundMessage } from "../src/bus.ts";

const TG = "!telegram_-100RWF:ba_tg1.local-telegram.localhost";
const WA = "!whatsapp_6142:ba_wa1.local-whatsapp.localhost";

let dir: string;
let mock: MockBeeperServer;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rwf-beeper-"));
  mock = new MockBeeperServer({
    token: "test-token",
    chats: [
      { id: TG, name: "Sunday Showdown (TG)" },
      { id: WA, name: "Gym Crew (WhatsApp)" },
    ],
  });
});

afterEach(() => {
  mock.stop();
});

const transport = (over: Record<string, unknown> = {}): BeeperDesktopTransport =>
  new BeeperDesktopTransport({
    baseUrl: mock.url,
    token: "test-token",
    minSendGapMs: 0,
    ...over,
  });

// ── pure helpers ─────────────────────────────────────────────────────────────

describe("networkFromChatId", () => {
  test("parses the network prefix from Matrix-style chat ids", () => {
    expect(networkFromChatId(TG)).toBe("telegram");
    expect(networkFromChatId(WA)).toBe("whatsapp");
    expect(networkFromChatId("!discord_9001:beeper.com")).toBe("discord");
    expect(networkFromChatId("!plainroom:beeper.com")).toBe("matrix");
  });
});

describe("beeperEventToInbound", () => {
  const entry = { senderID: "@tg_ben:beeper.com", senderName: "Ben", text: "rwf log pushups 20", type: "TEXT" };

  test("maps a command message to an InboundMessage", () => {
    expect(beeperEventToInbound(TG, { ...entry, isSender: false })).toEqual({
      chatId: `beeper:${TG}`,
      playerId: "beeper:@tg_ben:beeper.com",
      playerName: "Ben",
      text: "rwf log pushups 20",
    });
  });

  test("echo suppression: our own sends (isSender) are ignored", () => {
    expect(beeperEventToInbound(TG, { ...entry, isSender: true })).toBeNull();
  });

  test("chatter is ignored (bot stays quiet in conversation)", () => {
    expect(beeperEventToInbound(TG, { ...entry, text: "anyone seen my keys?" })).toBeNull();
  });

  test("non-text messages (media/reactions) are ignored", () => {
    expect(beeperEventToInbound(TG, { ...entry, type: "IMAGE", text: undefined })).toBeNull();
  });

  test("empty text is ignored", () => {
    expect(beeperEventToInbound(TG, { ...entry, text: "   " })).toBeNull();
  });
});

describe("formatBeeperReply (mrkdwn → markdown)", () => {
  test("upgrades single-asterisk emphasis to bold for Beeper rich text", () => {
    expect(formatBeeperReply("*Ben* is in as *athlete*")).toBe("**Ben** is in as **athlete**");
  });

  test("leaves already-bold text untouched (no double conversion)", () => {
    expect(formatBeeperReply("**Ben** wins")).toBe("**Ben** wins");
  });

  test("preserves multi-line card shape", () => {
    const card = "🏋️ *Reps With Friends*\n1. *Ben* — 310 pts\n2. *Dave* — 322.5 pts";
    expect(formatBeeperReply(card)).toContain("1. **Ben** — 310 pts");
    expect(formatBeeperReply(card).split("\n")).toHaveLength(3);
  });
});

describe("CrewLinkMap (chat ⇄ crew code)", () => {
  test("link/lookup round-trip persists to disk", () => {
    const file = join(dir, "links.json");
    const links = new CrewLinkMap(file);
    links.ensure(TG, "Sunday Showdown (TG)");
    links.link(TG, "CREW-7Q2");
    expect(links.crewFor(TG)).toBe("CREW-7Q2");
    expect(links.chatsFor("crew-7q2")).toEqual([TG]); // case-insensitive lookup

    // A fresh instance reads the same map back (persistence).
    const reloaded = new CrewLinkMap(file);
    expect(reloaded.crewFor(TG)).toBe("CREW-7Q2");
    expect(reloaded.get(TG)?.network).toBe("telegram");
  });

  test("one chat watches exactly one crew; chatsFor returns every bound chat", () => {
    const links = new CrewLinkMap(join(dir, "links.json"));
    links.link(TG, "CREW-7Q2");
    links.link(WA, "CREW-7Q2");
    links.link(TG, "CREW-9ZZ"); // re-bind moves TG
    expect(links.chatsFor("CREW-7Q2")).toEqual([WA]);
    expect(links.chatsFor("CREW-9ZZ")).toEqual([TG]);
  });
});

// ── against the mock Beeper API ─────────────────────────────────────────────

describe("BeeperDesktopTransport — REST", () => {
  test("health() true when the local API answers", async () => {
    expect(await transport().health()).toBe(true);
  });

  test("probe(): up + authed with a valid token, sees chats", async () => {
    const r = await transport().probe();
    expect(r.up).toBe(true);
    expect(r.authed).toBe(true);
    expect(r.baseUrl).toBe(mock.url);
    expect(r.chatCount).toBe(2);
    expect(r.hint).toBe("");
  });

  test("probe(): server up but token rejected → authed:false with founder hint", async () => {
    const r = await transport({ token: "wrong-token" }).probe();
    expect(r.up).toBe(true);
    expect(r.authed).toBe(false);
    expect(r.hint).toContain("Approved connections");
  });

  test("probe(): nothing listening → up:false, lists tried candidates", async () => {
    const dead = new BeeperDesktopTransport({ baseUrl: "http://127.0.0.1:9", token: "x" });
    const r = await dead.probe();
    expect(r.up).toBe(false);
    expect(r.tried.length).toBeGreaterThanOrEqual(1);
    expect(r.hint).toContain("Beeper Desktop");
  });

  test("listChats() normalizes items to {id,name,network}", async () => {
    const chats = await transport().listChats();
    expect(chats).toHaveLength(2);
    expect(chats[0]).toEqual({ id: TG, name: "Sunday Showdown (TG)", network: "telegram" });
    expect(chats[1].network).toBe("whatsapp");
  });

  test("send() POSTs to /v1/chats/:id/messages and lands in the mock's outbox", async () => {
    const t = transport();
    await t.send("rwf says hi", TG);
    expect(mock.sent).toEqual([{ chatId: TG, text: "rwf says hi", at: expect.any(Number) }]);
  });

  test("send() with a bad token throws a clear auth error", async () => {
    const t = transport({ token: "wrong" });
    await expect(t.send("x", TG)).rejects.toThrow(/401/);
  });
});

describe("BeeperDesktopTransport — WebSocket events", () => {
  test("message.upserted events become InboundMessages; echoes and chatter are dropped", async () => {
    const t = transport({ wsFactory: (url) => new WebSocket(url) });
    const got: InboundMessage[] = [];
    await t.start((m) => {
      got.push(m);
    });

    mock.injectIncoming(TG, { senderID: "@tg_ben:beeper.com", senderName: "Ben", text: "rwf help" });
    mock.injectIncoming(TG, { senderID: "@tg_dave:beeper.com", senderName: "Dave", text: "great win yesterday" });
    await t.send("echo test", TG); // fires an isSender:true echo event back

    await sleep(150);
    expect(got).toHaveLength(1); // only the command; chatter + echo dropped
    expect(got[0].text).toBe("rwf help");
    expect(got[0].chatId).toBe(`beeper:${TG}`);
    await t.stop();
  });

  test("start() without a token fails fast with the exact unblock step", async () => {
    const t = transport({ token: undefined });
    // ensure no env token leaks in
    const savedA = process.env.BEEPER_ACCESS_TOKEN;
    const savedB = process.env.RWF_BEEPER_TOKEN;
    delete process.env.BEEPER_ACCESS_TOKEN;
    delete process.env.RWF_BEEPER_TOKEN;
    try {
      await expect(t.start(() => {})).rejects.toThrow(/Approved connections/);
    } finally {
      if (savedA) process.env.BEEPER_ACCESS_TOKEN = savedA;
      if (savedB) process.env.RWF_BEEPER_TOKEN = savedB;
    }
  });
});

describe("BeeperBot — full loop: WS event → CommandBus → reply send", () => {
  test("a match played over Beeper produces cards in the chat + crew link recorded", async () => {
    const store = new MatchStore(join(dir, "matches.json"));
    const bus = new CommandBus(store, { cardsDir: join(dir, "cards") });
    const links = new CrewLinkMap(join(dir, "links.json"));
    const t = transport();
    const bot = new BeeperBot({ transport: t, bus, store, links });

    const say = (senderID: string, name: string, text: string) =>
      mock.injectIncoming(TG, { senderID, senderName: name, text });

    const inbound: InboundMessage[] = [];
    await t.start(async (m) => {
      inbound.push(m);
      await bot.handleInbound(m);
    });

    say("@tg_ben:beeper.com", "Ben", "rwf new 100");
    say("@tg_ben:beeper.com", "Ben", "rwf join athlete");
    say("@tg_dave:beeper.com", "Dave", "rwf join couch");
    say("@tg_ben:beeper.com", "Ben", "rwf link CREW-7Q2");
    say("@tg_ben:beeper.com", "Ben", "rwf start");
    say("@tg_dave:beeper.com", "Dave", "rwf log pushups 40");
    say("@tg_ben:beeper.com", "Ben", "rwf log burpees 120"); // raw 120 ≥ target 100 → closes
    say("@tg_dave:beeper.com", "Dave", "rwf result");
    await sleep(400);

    // Every command got a reply delivered via the mock API.
    expect(inbound).toHaveLength(8);
    expect(mock.sent.length).toBe(8);

    // Cards went through markdown formatting for Beeper rich text.
    const joinReply = mock.sent[1].text; // [0]=new, [1]=Ben's join
    expect(joinReply).toContain("**Ben**"); // mrkdwn *Ben* → **Ben**

    // The result card is in the outbox and the winner is the couch effort story.
    const result = mock.sent[7].text;
    expect(result).toMatch(/🏆|FINAL/i);

    // Crew binding flowed bus → transport map (and persisted).
    expect(links.crewFor(TG)).toBe("CREW-7Q2");
    const stored = JSON.parse(readFileSync(join(dir, "matches.json"), "utf8")) as Record<string, { crewCode?: string }>;
    expect(stored[`beeper:${TG}`]?.crewCode).toBe("CREW-7Q2");

    await t.stop();
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
