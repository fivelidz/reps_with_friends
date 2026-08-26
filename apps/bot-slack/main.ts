// apps/bot-slack/main.ts — RWF Slack bot (Bolt, Socket Mode).
//
//   bun apps/bot-slack/main.ts --sim   # demo match: prints cards, needs no tokens (default)
//   SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… bun apps/bot-slack/main.ts --live
//
// Corporate-mode surface: slash command `/rwf <text>` → shared CommandBus →
// reply posted in-channel. No game logic lives here — everything is
// @rwf/bot-core over @rwf/game-core. Heartbeat every 15s in live mode.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CommandBus, MatchStore } from "@rwf/bot-core";

const ROOT = resolve(import.meta.dir, "../..");
const DATA = join(ROOT, ".data");
const HEARTBEAT = join(DATA, "heartbeat-slack.json");
const HEARTBEAT_MS = 15_000;

// ── sim harness ─────────────────────────────────────────────────────────────

function sim(): void {
  const store = new MatchStore(join(DATA, "sim-slack.json"));
  const bus = new CommandBus(store);
  const inChannel = (name: string, uid: string, text: string) => ({
    chatId: "slack:C08MATCH",
    playerId: `slack:${uid}`,
    playerName: name,
    text,
  });
  const ben = (t: string) => inChannel("Ben", "U111", t);
  const dave = (t: string) => inChannel("Dave", "U222", t);
  const nico = (t: string) => inChannel("Nico", "U333", t);

  const script: { user: string; text: string }[] = [
    { user: "ben", text: "/rwf help" },
    { user: "ben", text: "new" },
    { user: "ben", text: "join athlete" },
    { user: "dave", text: "join couch" },
    { user: "nico", text: "join fit" },
    { user: "ben", text: "start" },
    { user: "dave", text: "log pushups 40" },
    { user: "nico", text: "log squats 60!" },
    { user: "ben", text: "log burpees 30" },
    { user: "dave", text: "log squats 60" },
    { user: "ben", text: "taunt dave" },
    { user: "dave", text: "log sit-ups 50" },
    { user: "nico", text: "s" },
    { user: "dave", text: "pot 500" },
    { user: "nico", text: "pot 1000" },
    { user: "dave", text: "log burpees 45" },
    { user: "ben", text: "log pushups 280" }, // athlete closes at 310 raw…
    { user: "nico", text: "result" }, // …but the couch player's adjusted score takes it
    { user: "ben", text: "link CREW-7Q2" },
  ];
  const players = { ben, dave, nico };

  console.log("=== RWF Slack bot — SIM MODE (no tokens, no sends) ===\n");
  for (const step of script) {
    const m = players[step.user as keyof typeof players](step.text.replace(/^\/rwf\s+/, ""));
    console.log(`▸ /rwf by ${m.playerName}: ${m.text}`);
    console.log(bus.handle(m));
    console.log("");
  }
  console.log(`=== sim done — ${script.length} commands, store: ${join(DATA, "sim-slack.json")} ===`);
}

// ── live mode (Bolt Socket Mode) ────────────────────────────────────────────

async function live(): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) {
    console.error(
      "live mode needs SLACK_BOT_TOKEN (xoxb-…) and SLACK_APP_TOKEN (xapp-…) in the env.\n" +
        "See README.md for the one-time Slack app setup."
    );
    process.exit(1);
  }

  // Dynamic import: --sim must work without ever loading Bolt.
  const { App } = await import("@slack/bolt");

  mkdirSync(DATA, { recursive: true });
  const store = new MatchStore(join(DATA, "bot-matches.json"));
  const bus = new CommandBus(store);

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  // Resolve display names once per user (fallback to raw user id).
  const nameCache = new Map<string, string>();
  const displayName = async (client: any, userId: string): Promise<string> => {
    const cached = nameCache.get(userId);
    if (cached) return cached;
    try {
      const info = await client.users.info({ user: userId });
      const name =
        info?.user?.profile?.display_name_normalized ||
        info?.user?.profile?.display_name ||
        info?.user?.real_name ||
        userId;
      nameCache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  };

  app.command("/rwf", async ({ command, ack, respond, client }) => {
    await ack();
    const playerName = await displayName(client, command.user_id);
    const reply = bus.handle({
      chatId: `slack:${command.channel_id}`,
      playerId: `slack:${command.user_id}`,
      playerName,
      text: command.text,
    });
    console.log(`[in ] /rwf ${command.text} (from ${playerName} in ${command.channel_id})`);
    console.log(`[out] ${reply.split("\n")[0]}…`);
    try {
      await respond({ text: reply, response_type: "in_channel" }); // match play is a spectator sport
    } catch (err) {
      console.error("respond failed:", err instanceof Error ? err.message : err);
    }
  });

  const beat = () => writeFileSync(HEARTBEAT, JSON.stringify({ ts: Date.now() }));
  beat();
  const hbTimer = setInterval(beat, HEARTBEAT_MS);

  await app.start();
  console.log("RWF Slack bot live — Socket Mode, /rwf wired. Ctrl-C to stop.");

  const shutdown = () => {
    clearInterval(hbTimer);
    beat();
    console.log("\nbye");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ── entry ───────────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? "--sim";
if (mode === "--live") {
  await live();
} else if (mode === "--sim") {
  sim();
} else {
  console.error("usage: bun apps/bot-slack/main.ts [--sim|--live]");
  process.exit(1);
}
