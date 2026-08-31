// Beeper bot harness — the newest RWF chat transport.
//
//   bun packages/bot-core/src/transports/beeper-cli.ts --probe   # is the local Beeper API up?
//   bun packages/bot-core/src/transports/beeper-cli.ts --sim     # full loop against a mock Beeper (no app needed)
//   bun packages/bot-core/src/transports/beeper-cli.ts --live    # real Beeper Desktop (needs app open + token)
//
// --live prerequisites (exact founder unblock steps):
//   1. Open Beeper Desktop on this machine (it must keep running).
//   2. Settings → Integrations → “+” next to “Approved connections” → create a token.
//   3. export BEEPER_ACCESS_TOKEN=<that token>   (or add it to .env)
//   4. Connect at least one network in Beeper (WhatsApp/Telegram/Discord/…) and
//      have a group chat you're willing to test in.
//
// Store: .data/beeper-matches.json (same MatchStore as the other bots).
// Links: .data/beeper-links.json  (chat ⇄ crew-code map).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CommandBus, MatchStore } from "../index.ts";
import {
  BeeperBot,
  BeeperDesktopTransport,
  CrewLinkMap,
  formatBeeperReply,
  networkFromChatId,
} from "./beeper.ts";
import { MockBeeperServer } from "./mock-beeper.ts";

const ROOT = resolve(import.meta.dir, "../../../.."); // transports/ → src/ → bot-core/ → packages/ → repo root
const DATA = join(ROOT, ".data");

// ── probe ────────────────────────────────────────────────────────────────────

async function probe(): Promise<void> {
  const t = new BeeperDesktopTransport();
  console.log("=== RWF Beeper transport — PROBE ===\n");
  console.log(`token: ${t.token ? "present (env BEEPER_ACCESS_TOKEN)" : "MISSING — export BEEPER_ACCESS_TOKEN once Beeper is open"}`);
  const r = await t.probe();
  console.log(`up:    ${r.up}${r.baseUrl ? `  (${r.baseUrl})` : ""}`);
  console.log(`authed: ${r.authed}${r.chatCount != null ? `  (${r.chatCount} chats visible)` : ""}`);
  if (r.info) console.log(`info:  ${JSON.stringify(r.info).slice(0, 160)}`);
  if (r.error) console.log(`error: ${r.error}`);
  console.log(`tried: ${r.tried.join(", ")}`);
  if (r.hint) console.log(`\nNEXT STEP:\n${r.hint}`);
  if (r.up && r.authed) {
    const chats = await t.listChats().catch((e) => {
      console.log(`listChats failed: ${e instanceof Error ? e.message : e}`);
      return [];
    });
    if (chats.length > 0) {
      console.log(`\nchats (${chats.length}):`);
      for (const c of chats.slice(0, 15)) console.log(`  [${c.network}] ${c.name}  →  ${c.id}`);
    }
  }
}

// ── sim ──────────────────────────────────────────────────────────────────────

async function sim(): Promise<void> {
  mkdirSync(DATA, { recursive: true });
  const simStore = join(DATA, "sim-beeper-matches.json");
  const simLinks = join(DATA, "sim-beeper-links.json");
  writeFileSync(simStore, "{}"); // fresh demo every run

  // Mock Beeper Desktop with three connected networks + group chats.
  const TG_GROUP = "!telegram_-100RWFDOGFOOD:ba_tg1.local-telegram.localhost";
  const WA_GROUP = "!whatsapp_61425DOGFOOD:ba_wa1.local-whatsapp.localhost";
  const DC_GROUP = "!discord_9001RWF:beeper.com";
  const mock = new MockBeeperServer({
    token: "test-token",
    chats: [
      { id: TG_GROUP, name: "Sunday Showdown (TG)" },
      { id: WA_GROUP, name: "Gym Crew (WhatsApp)" },
      { id: DC_GROUP, name: "rwf-dev (Discord)" },
    ],
  });

  const transport = new BeeperDesktopTransport({
    baseUrl: mock.url,
    token: "test-token",
    linksFile: simLinks,
    minSendGapMs: 0, // sim: no rate limiting
  });
  const store = new MatchStore(simStore);
  const bus = new CommandBus(store, { cardsDir: join(DATA, "cards") });
  const links = new CrewLinkMap(simLinks);
  const bot = new BeeperBot({ transport, bus, store, links });

  const seen: string[] = [];
  await transport.start((m) => {
    seen.push(m.text);
    return bot.handleInbound(m);
  });

  console.log("=== RWF Beeper bot — SIM MODE (mock Beeper Desktop, no live sends) ===\n");

  const human = (chatId: string, senderID: string, senderName: string, text: string) =>
    mock.injectIncoming(chatId, { senderID, senderName, text });

  console.log("── Telegram group: full match, cross-network crew link ──");
  const script: [string, string, string, string][] = [
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf new 100"],
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf join athlete"],
    [TG_GROUP, "@telegram_dave:beeper.com", "Dave", "rwf join couch"],
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf link CREW-7Q2"],
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf start"],
    [TG_GROUP, "@telegram_dave:beeper.com", "Dave", "rwf log pushups 80"], // 80×1.5 = 120 adjusted
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf log burpees 100"], // raw=target → closes; comeback 117
    [TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf s"],
    [TG_GROUP, "@telegram_dave:beeper.com", "Dave", "rwf result"],
  ];
  for (const [chat, sid, name, text] of script) {
    human(chat, sid, name, text);
    await sleep(80); // let the WS round-trip land
  }
  await sleep(150);

  console.log("── WhatsApp group: spectators watch the TG crew ──");
  for (const [chat, sid, name, text] of [
    [WA_GROUP, "@whatsapp_mia:beeper.com", "Mia", "rwf watch CREW-7Q2"],
    [WA_GROUP, "@whatsapp_mia:beeper.com", "Mia", "rwf s"],
  ] as [string, string, string, string][]) {
    human(chat, sid, name, text);
    await sleep(80);
  }
  await sleep(150);

  console.log("── Chatter + echoes are ignored (bot stays quiet) ──");
  human(TG_GROUP, "@telegram_dave:beeper.com", "Dave", "anyone seen my keys?");
  human(TG_GROUP, "@telegram_ben:beeper.com", "Ben", "rwf help");
  await sleep(150);

  // Print everything the mock "delivered", in order.
  console.log("── delivered messages (what real Beeper would send) ──");
  for (const s of mock.sent) {
    const net = networkFromChatId(s.chatId);
    const first = s.text.split("\n")[0];
    console.log(`  → [${net}] ${first}${s.text.includes("\n") ? " …" : ""}`);
  }

  console.log("\n── chat ⇄ crew map (.data/sim-beeper-links.json) ──");
  for (const l of links.all()) {
    console.log(`  [${l.network}] ${l.chatId.slice(0, 46)}… → ${l.crewCode ?? "(no crew)"}`);
  }

  console.log(`\nchecks: inbound handled=${seen.length}, delivered=${mock.sent.length}, crew links=${links.chatsFor("CREW-7Q2").length}`);
  const ok = mock.sent.length >= 10 && links.chatsFor("CREW-7Q2").length >= 1;
  console.log(`sim ${ok ? "✅ green" : "❌ unexpected counts"}`);

  await transport.stop();
  mock.stop();
  console.log(`\n=== sim done — store: ${simStore} ===`);
}

// ── live ─────────────────────────────────────────────────────────────────────

async function live(): Promise<void> {
  mkdirSync(DATA, { recursive: true });
  const transport = new BeeperDesktopTransport({ linksFile: join(DATA, "beeper-links.json") });

  const p = await transport.probe();
  if (!p.up || !p.authed) {
    console.error("Beeper Desktop API not ready — cannot go live.\n");
    console.error(`up: ${p.up} · authed: ${p.authed}${p.error ? ` · ${p.error}` : ""}`);
    console.error(`\nUNBLOCK (founder, ~2 min):\n${p.hint}\n`);
    console.error("Then re-run: bun packages/bot-core/src/transports/beeper-cli.ts --live");
    process.exit(1);
  }
  console.log(`beeper: UP at ${p.baseUrl} · ${p.chatCount ?? "?"} chats visible`);

  const chats = await transport.listChats();
  console.log(`chats (${chats.length}):`);
  for (const c of chats.slice(0, 20)) console.log(`  [${c.network}] ${c.name}  →  ${c.id}`);

  const store = new MatchStore(join(DATA, "beeper-matches.json"));
  const bus = new CommandBus(store, { cardsDir: join(DATA, "cards") });
  const links = new CrewLinkMap(join(DATA, "beeper-links.json"));
  const bot = new BeeperBot({ transport, bus, store, links });

  await transport.start(async (m) => {
    console.log(`[in ] (${links.get(m.chatId.replace(/^beeper:/, ""))?.network ?? "?"}) ${m.playerName}: ${m.text}`);
    const reply = await bot.handleInbound(m);
    if (reply) console.log(`[out] → ${formatBeeperReply(reply).split("\n")[0]}…`);
  });

  console.log("\nlive — listening on ws /v1/ws (Ctrl-C to stop). Say `rwf help` in a connected chat.");
  const shutdown = async () => {
    await transport.stop();
    console.log("\nbye");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

// ── entry ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const mode = process.argv[2] ?? "--sim";
if (mode === "--probe") await probe();
else if (mode === "--sim") await sim();
else if (mode === "--live") await live();
else {
  console.error("usage: bun packages/bot-core/src/transports/beeper-cli.ts [--probe|--sim|--live]");
  process.exit(1);
}
