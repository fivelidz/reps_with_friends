// apps/bot-slack/main.ts — RWF Slack bot (Bolt, Socket Mode).
//
//   bun apps/bot-slack/main.ts --sim   # demo match: prints cards, needs no tokens (default)
//   SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… bun apps/bot-slack/main.ts --live
//
// Corporate-mode surface: slash command `/rwf <text>` → shared CommandBus →
// reply posted in-channel. No game logic lives here — everything is
// @rwf/bot-core over @rwf/game-core. Heartbeat every 15s in live mode.

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CommandBus, MatchStore } from "@rwf/bot-core";

const ROOT = resolve(import.meta.dir, "../..");
const DATA = join(ROOT, ".data");
const HEARTBEAT = join(DATA, "heartbeat-slack.json");
const HEARTBEAT_MS = 15_000;

// ── sim harness ─────────────────────────────────────────────────────────────

async function sim(): Promise<void> {
  const cardsDir = join(DATA, "cards");
  const simFile = join(DATA, "sim-slack.json");
  mkdirSync(DATA, { recursive: true });
  writeFileSync(simFile, "{}"); // scratch store — fresh demo every run
  const store = new MatchStore(simFile);
  const bus = new CommandBus(store, { cardsDir });
  const inChannel = (name: string, uid: string, text: string) => ({
    chatId: "slack:C08MATCH",
    playerId: `slack:${uid}`,
    playerName: name,
    text,
  });
  const ben = (t: string) => inChannel("Ben", "U111", t);
  const dave = (t: string) => inChannel("Dave", "U222", t);
  const nico = (t: string) => inChannel("Nico", "U333", t);
  // Second channel: spectators' lounge (watches the crew, never joins).
  const inLounge = (name: string, uid: string, text: string) => ({
    chatId: "slack:C08LOUNGE",
    playerId: `slack:${uid}`,
    playerName: name,
    text,
  });
  const mia = (t: string) => inLounge("Mia", "U444", t);
  // Third channel: a rival crew (for the crew-vs-crew challenge flow).
  const inRival = (name: string, uid: string, text: string) => ({
    chatId: "slack:C08RIVAL",
    playerId: `slack:${uid}`,
    playerName: name,
    text,
  });
  const rivalA = (t: string) => inRival("Alf", "U555", t);
  const rivalB = (t: string) => inRival("Rene", "U666", t);

  const script: { label: string; steps: { m: ReturnType<typeof ben>; chan?: string }[] }[] = [
    {
      label: "full match (help → new → join×3 → link → season → start → logs → close → result)",
      steps: [
        { m: ben("/rwf help") },
        { m: ben("new") },
        { m: ben("join athlete") },
        { m: dave("join couch") },
        { m: nico("join fit") },
        { m: ben("link CREW-7Q2") }, // crew binding early so spectators/challenges key off it
        { m: ben("season new Preseason") }, // matches now record toward the ladder
        { m: ben("start") },
        { m: dave("log pushups 40") },
        { m: nico("log squats 60!") },
        { m: ben("log burpees 30") },
        { m: dave("log squats 60") },
        { m: ben("taunt dave") }, // AI taunt (live attempt, canned fallback)
        { m: dave("log sit-ups 50") },
        { m: nico("s") }, // standings: ⚡ comeback markers + 👁 spectator count
        { m: dave("pot 500") },
        { m: nico("pot 1000") },
        { m: dave("log burpees 45") },
        { m: ben("log pushups 280") }, // athlete closes at 310 raw…
        { m: nico("result") }, // …but the couch player's adjusted score takes it (+ SVG card URL)
      ],
    },
    {
      label: "season ladder after the match",
      steps: [{ m: ben("season ladder") }],
    },
    {
      label: "spectator mode (watch from another channel, `s` without joining)",
      steps: [
        { m: mia("watch CREW-7Q2"), chan: "#lounge" },
        { m: mia("s"), chan: "#lounge" },
      ],
    },
    {
      label: "crew-vs-crew challenge (rival crew issues, CREW-7Q2 accepts)",
      steps: [
        { m: rivalA("new 50"), chan: "#rival-crew" }, // rival channel needs a match before linking a crew
        { m: rivalA("join casual"), chan: "#rival-crew" },
        { m: rivalB("join fit"), chan: "#rival-crew" },
        { m: rivalA("link CREW-9ZZ"), chan: "#rival-crew" },
        { m: rivalA("challenge CREW-7Q2"), chan: "#rival-crew" },
        { m: ben("challenge accept") }, // accepted back in the home crew's channel
      ],
    },
  ];

  console.log("=== RWF Slack bot — SIM MODE (no tokens, no sends) ===\n");
  let count = 0;
  for (const section of script) {
    console.log(`── ${section.label} ──`);
    for (const step of section.steps) {
      const text = step.m.text.replace(/^\/rwf\s+/, "");
      const where = step.chan ? ` (${step.chan})` : "";
      console.log(`▸ /rwf by ${step.m.playerName}${where}: ${text}`);
      console.log(await bus.handleAsync(step.m));
      console.log("");
      count++;
    }
  }

  // Result-card artifact: prove the SVG landed on disk.
  const m = store.get("slack:C08MATCH");
  if (m) {
    const cardPath = join(cardsDir, `${m.state.config.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`);
    try {
      const size = statSync(cardPath).size;
      console.log(`── result card artifact ──`);
      console.log(`🖼 ${cardPath} (${size} bytes) → http://localhost:4173/cards/${basename(cardPath)}`);
    } catch {
      console.log(`🖼 result card missing at ${cardPath} — check cardsDir`);
    }
  }
  console.log(`\n=== sim done — ${count} commands, store: ${join(DATA, "sim-slack.json")} ===`);
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
  const bus = new CommandBus(store, { cardsDir: join(DATA, "cards") });

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
    const reply = await bus.handleAsync({
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
  await sim();
} else {
  console.error("usage: bun apps/bot-slack/main.ts [--sim|--live]");
  process.exit(1);
}
