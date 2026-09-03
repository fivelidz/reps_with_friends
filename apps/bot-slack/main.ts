// apps/bot-slack/main.ts — RWF Slack bot (Bolt, Socket Mode).
//
//   bun apps/bot-slack/main.ts --sim          # legacy 300-match demo (default)
//   bun apps/bot-slack/main.ts --sim --sot    # SOT daily-model demo (v4 grammar)
//   SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… bun apps/bot-slack/main.ts --live
//
// Corporate-mode surface: slash command `/rwf <text>` → shared CommandBus →
// reply posted in-channel. No game logic lives here — everything is
// @rwf/bot-core over @rwf/game-core. Heartbeat every 15s in live mode.

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandBus, MatchStore, SotCommandBus, SotStore } from "@rwf/bot-core";

// Portable across Bun and Node (import.meta.dir is Bun-only).
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
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
      label: "G-family: rematch → photo-finish result → nemesis → digest",
      steps: [
        { m: ben("rematch") }, // 🔁 RUN IT BACK — same crew, same rules, fresh pot
        { m: dave("pot 300") }, // seed the fresh pot
        { m: ben("pot 400") },
        { m: ben("start") }, // roster carried over — no join step needed
        { m: dave("log pushups 90") }, // couch 90 raw → 135 adjusted (first log — no boost)
        { m: nico("log squats 120") }, // fit 120 raw → 144 adjusted (⚡ comeback ×1.2)
        { m: dave("log sit-ups 125") }, // dave 215 raw → 322.5 adjusted (25% behind — no boost)
        { m: ben("log pushups 300") }, // athlete closes at 300 raw → 306 (⚡ comeback) + 15 = 321…
        { m: nico("result") }, // …Dave by 1.5 (0.5%) → 📸 PHOTO FINISH + coral card
        { m: ben("nemesis") }, // Ben's nemesis is Dave — beaten 2 of 2
        { m: dave("nemesis") }, // Dave: no nemesis yet (graceful)
        { m: nico("digest") }, // 📋 Monday digest (+ AI line if the app server is up)
      ],
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
      const variant = readFileSync(cardPath, "utf8").includes("#ff5c38")
        ? " — 📸 photo-finish variant (coral accent)"
        : "";
      console.log(`── result card artifact ──`);
      console.log(`🖼 ${cardPath} (${size} bytes)${variant} → http://localhost:4173/cards/${basename(cardPath)}`);
    } catch {
      console.log(`🖼 result card missing at ${cardPath} — check cardsDir`);
    }
  }
  console.log(`\n=== sim done — ${count} commands, store: ${join(DATA, "sim-slack.json")} ===`);
}

// ── SOT sim harness (Engine v4 — the Source-of-Truth daily model) ───────────
//
// Same arc as the WhatsApp SOT sim, through the /rwf slash surface:
// create → join → log → DAILY WIN card → second player banks → deadline
// recap → season ladder → charity resolution, plus a day-2 power-up pass.
// Fake clock travels the days in seconds (4h battle window).

async function sotSim(): Promise<void> {
  const simFile = join(DATA, "sim-slack-sot.json");
  mkdirSync(DATA, { recursive: true });
  writeFileSync(simFile, "{}"); // scratch store — fresh demo every run
  const store = new SotStore(simFile);

  const base = new Date();
  base.setHours(9, 0, 0, 0);
  const dow = base.getDay();
  if (dow === 5 || dow === 6 || dow === 0) {
    // Fri/Sat/Sun → rewind to Thursday so day 2 (Friday) is a play day too.
    base.setDate(base.getDate() - ((dow + 7 - 4) % 7));
  }
  let t = base.getTime();
  const bus = new SotCommandBus(store, { now: () => t, dayWindowMs: 4 * 3600_000 });

  const inChannel = (name: string, uid: string, text: string) => ({
    chatId: "slack:C08SOT",
    playerId: `slack:${uid}`,
    playerName: name,
    text,
  });
  const ben = (s: string) => inChannel("Ben", "U111", s);   // athlete ×0.85 → 236 physical
  const dave = (s: string) => inChannel("Dave", "U222", s); // couch ×1.5 → 134 physical
  const nico = (s: string) => inChannel("Nico", "U333", s); // fit ×1.0 → 200 physical

  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const sections: { label: string; steps: { m: ReturnType<typeof ben>; advMs?: number; note?: string }[] }[] = [
    {
      label: "the SOT grammar (/rwf prefix)",
      steps: [{ m: ben("/rwf help") }],
    },
    {
      label: "create the group — daily battle, 200 adjusted, weekly season",
      steps: [
        { m: ben("/rwf new") },
        { m: ben("join athlete") },
        { m: dave("join couch") },
        { m: nico("join fit") },
      ],
    },
    {
      label: "the season stake, agreed up front (charity pot)",
      steps: [
        { m: ben("stake charity Everyone stumps 100 points — the season winner directs the pot") },
        { m: ben("agree") },
        { m: dave("agree") },
        { m: nico("agree") }, // third agreement locks it
      ],
    },
    {
      label: "the day opens",
      steps: [{ m: ben("start") }],
    },
    {
      label: "the race — log, WIN THE DAY, bank your day",
      steps: [
        { m: dave("log pushups 50") },   // +75 (couch ×1.5) — 125 to go
        { m: ben("log burpees 100") },   // +85 (athlete ×0.85) — 115 to go
        { m: dave("log squats 50") },    // +75 → 150/200
        { m: ben("log pushups 100") },   // +85 → 170/200
        { m: nico("log squats 60") },    // 60/200 — Nico's racing the clock now
        { m: ben("log burpees 36") },    // 200.6 → 🏆 the DAILY WIN moment
        { m: dave("log lunges 34") },    // 201 → 🏦 banks the day, streak starts
        { m: nico("/rwf s") },           // WON / BANKED / chasing states
      ],
    },
    {
      label: "the deadline — day closes itself, recap rides the next command",
      steps: [
        { m: nico("day close"), advMs: 10 * MIN, note: "10 min in — too early, the bot holds the line" },
        { m: dave("season ladder"), advMs: 4 * HOUR }, // clock past 13:00 → auto-close recap + ladder
      ],
    },
    {
      label: "the charity pot fills (points — the trial currency)",
      steps: [
        { m: dave("pot 100") },
        { m: ben("pot 100") },
        { m: nico("pot 100") },
        { m: ben("pot") },
      ],
    },
    {
      label: "day 2 — the power-up canon",
      steps: [
        { m: ben("start"), advMs: 20 * HOUR - 10 * MIN, note: "next morning 09:00 — a fresh battle" },
        { m: ben("cards") },
        { m: ben("lightning") },
        { m: ben("log pushups 40!") },  // inside the window → ×3 → +102, camera-verified
        { m: dave("steal @ben"), advMs: 2 * MIN }, // PURE GAIN — Ben keeps every rep
        { m: dave("shield") },          // group streak protection
        { m: ben("freeze"), advMs: 10 * MIN, note: "past 09:10 — the lightning window closes" },
        { m: ben("bomb @dave") },       // +20 reps, 10 minutes to deliver
        { m: dave("log situps 20") },   // 30 reps → bomb DEFUSED, +20 bonus
        { m: dave("rope @nico") },      // 50-credit to the inactive mate
        { m: ben("log squats 100") },   // +85 → 187/200
        { m: ben("log lunges 20") },    // +17 → 204 → 🏆 wins day 2 as well
        { m: ben("s"), advMs: 4 * HOUR + 31 * MIN, note: "past the frozen deadline — auto-close saves Dave & Nico via the shield" },
      ],
    },
    {
      label: "season finale — champion, charity directed, donation processed",
      steps: [
        { m: ben("season ladder") },
        { m: ben("season end") },
        { m: ben("charity Coast Rescue") },
        { m: ben("donate") },
        { m: ben("stake") },
      ],
    },
  ];

  console.log("=== RWF Slack bot — SOT SIM MODE (Engine v4 daily model, no tokens, no sends) ===\n");
  for (const section of sections) {
    console.log(`── ${section.label} ──`);
    for (const step of section.steps) {
      if (step.advMs) t += step.advMs;
      if (step.note) console.log(`⏩ clock → ${step.note}`);
      const text = step.m.text.replace(/^\/rwf\s+/, "");
      console.log(`▸ /rwf by ${step.m.playerName}: ${text}`);
      console.log(bus.handle(step.m));
      console.log("");
    }
    console.log("");
  }
  console.log(`=== SOT sim done — store: ${simFile} ===`);
}

// ── live mode (Bolt Socket Mode) ────────────────────────────────────────────

// Token file written by quickstart.ts — fallback when env vars are absent.
function readTokenFile(): { bot?: string; app?: string } {
  try {
    const text = readFileSync(join(homedir(), ".config", "rwf", "bot-slack.env"), "utf8");
    const out: { bot?: string; app?: string } = {};
    for (const line of text.split("\n")) {
      let m = line.match(/^\s*SLACK_BOT_TOKEN\s*=\s*(\S+)/);
      if (m) out.bot = m[1];
      m = line.match(/^\s*SLACK_APP_TOKEN\s*=\s*(\S+)/);
      if (m) out.app = m[1];
    }
    return out;
  } catch {
    return {};
  }
}

async function live(): Promise<void> {
  const fileTokens = readTokenFile();
  const botToken = process.env.SLACK_BOT_TOKEN ?? fileTokens.bot;
  const appToken = process.env.SLACK_APP_TOKEN ?? fileTokens.app;
  if (!botToken || !appToken) {
    console.error(
      "live mode needs Slack tokens. Either:\n" +
        "  1. Run:  bun quickstart.ts    (validates + saves them, one time), or\n" +
        "  2. Export SLACK_BOT_TOKEN (xoxb-…) and SLACK_APP_TOKEN (xapp-…) in the env."
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

const args = process.argv.slice(2);
const sotMode = args.includes("--sot");
const mode = args.find((a) => a === "--sim" || a === "--live") ?? "--sim";
if (mode === "--live") {
  if (sotMode) {
    console.error("--sot is sim-only for now — live SOT transport wiring is the next step (agents/_handovers/)");
    process.exit(1);
  }
  await live();
} else if (mode === "--sim") {
  await sotMode ? sotSim() : sim();
} else {
  console.error("usage: bun apps/bot-slack/main.ts [--sim|--live] [--sot]");
  process.exit(1);
}
