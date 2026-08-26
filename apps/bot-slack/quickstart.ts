#!/usr/bin/env bun
/**
 * quickstart.ts — catch-the-tokens for the RWF Slack bot.
 *
 * The moment you finish the 5-minute Slack app creation (SETUP.md steps 1–4),
 * run this: it validates both tokens against the real Slack API and saves them
 * to ~/.config/rwf/bot-slack.env (chmod 600). After that `bun main.ts --live`
 * just works — no env vars needed.
 *
 * Usage:
 *   bun quickstart.ts                               # interactive (prompts in a TTY)
 *   bun quickstart.ts --bot xoxb-… --app xapp-…     # flag-driven
 *   SLACK_BOT_TOKEN=… SLACK_APP_TOKEN=… bun quickstart.ts
 *   bun quickstart.ts --check                       # re-validate saved tokens
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const ENV_FILE = join(homedir(), ".config", "rwf", "bot-slack.env");

const BOT_FIX =
  "api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token (xoxb-…)";
const APP_FIX =
  "api.slack.com/apps → your app → Basic Information → App-Level Tokens → token with connections:write (xapp-…)";

// ── Slack API ───────────────────────────────────────────────────────────────

async function slackApi(method: string, token: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  } catch (err) {
    throw new Error(
      `could not reach slack.com (${err instanceof Error ? err.message : err}) — check your internet connection`
    );
  }
  return res.json();
}

interface BotCheck {
  ok: boolean;
  error?: string;
  team?: string;
  user?: string;
  url?: string;
}
interface AppCheck {
  ok: boolean;
  error?: string;
}

const checkBotToken = (token: string): Promise<BotCheck> => slackApi("auth.test", token);
const checkAppToken = (token: string): Promise<AppCheck> =>
  slackApi("apps.connections.open", token);

// ── helpers ─────────────────────────────────────────────────────────────────

function mask(token: string): string {
  return token.length <= 16 ? `${token.slice(0, 8)}…` : `${token.slice(0, 12)}…${token.slice(-4)}`;
}

function readEnvFile(): { bot?: string; app?: string } {
  if (!existsSync(ENV_FILE)) return {};
  const out: { bot?: string; app?: string } = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    let m = line.match(/^\s*SLACK_BOT_TOKEN\s*=\s*(\S+)/);
    if (m) out.bot = m[1];
    m = line.match(/^\s*SLACK_APP_TOKEN\s*=\s*(\S+)/);
    if (m) out.app = m[1];
  }
  return out;
}

function writeEnvFile(bot: string, app: string): void {
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  writeFileSync(
    ENV_FILE,
    [
      "# Reps With Friends — Slack bot tokens (written by apps/bot-slack/quickstart.ts)",
      `# created ${new Date().toISOString()}`,
      `SLACK_BOT_TOKEN=${bot}`,
      `SLACK_APP_TOKEN=${app}`,
      "",
    ].join("\n")
  );
  chmodSync(ENV_FILE, 0o600);
}

function fail(which: "bot" | "app", token: string, error: string): never {
  const label = which === "bot" ? "Bot token (xoxb-…)" : "App token (xapp-…)";
  console.error("");
  console.error(`✗ ${label} ${mask(token)} FAILED validation`);
  console.error(`  Slack error: "${error}"`);
  console.error(`  Get a fresh one: ${which === "bot" ? BOT_FIX : APP_FIX}`);
  console.error("  Then re-run: bun quickstart.ts");
  process.exit(1);
}

// ── args / prompting ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i !== -1) {
    const v = args[i + 1];
    if (v && !v.startsWith("--")) return v;
  }
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

async function prompt(label: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

// ── --check mode ────────────────────────────────────────────────────────────

if (args.includes("--check")) {
  if (!existsSync(ENV_FILE)) {
    console.log(`No saved tokens yet — ${ENV_FILE} does not exist.`);
    console.log("Run:  bun quickstart.ts    (validates both tokens and saves them)");
    process.exit(0);
  }
  const saved = readEnvFile();
  const missing = [
    !saved.bot && "SLACK_BOT_TOKEN",
    !saved.app && "SLACK_APP_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    console.error(`${ENV_FILE} exists but is missing ${missing.join(" and ")}.`);
    console.error("Re-run: bun quickstart.ts   to rewrite it with valid tokens.");
    process.exit(1);
  }
  console.log(`Re-validating tokens from ${ENV_FILE}\n`);
  const bot = await checkBotToken(saved.bot);
  if (!bot.ok) fail("bot", saved.bot!, bot.error ?? "unknown_error");
  console.log(`✓ Bot token ${mask(saved.bot!)} — team "${bot.team}", bot user "${bot.user}"`);
  const app = await checkAppToken(saved.app);
  if (!app.ok) fail("app", saved.app!, app.error ?? "unknown_error");
  console.log(`✓ App token ${mask(saved.app!)} — Socket Mode connection OK`);
  console.log("\nBoth tokens valid. Start the bot with:  bun main.ts --live");
  process.exit(0);
}

// ── main flow ───────────────────────────────────────────────────────────────

let botToken = flagValue("bot") ?? process.env.SLACK_BOT_TOKEN;
let appToken = flagValue("app") ?? process.env.SLACK_APP_TOKEN;

const isTTY = Boolean(process.stdin.isTTY);
if (!botToken && isTTY) {
  botToken = await prompt("Bot User OAuth Token (xoxb-…, from OAuth & Permissions): ");
}
if (!appToken && isTTY) {
  appToken = await prompt("App-Level Token (xapp-…, from Basic Information → App-Level Tokens): ");
}

if (!botToken || !appToken) {
  console.error("Need both tokens to continue.\n");
  console.error("Usage:");
  console.error("  bun quickstart.ts --bot xoxb-… --app xapp-…");
  console.error("  SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… bun quickstart.ts");
  console.error("  bun quickstart.ts          # interactive (prompts when run in a terminal)");
  console.error("  bun quickstart.ts --check  # re-validate saved tokens");
  process.exit(1);
}

console.log("Validating tokens against slack.com…\n");

const bot = await checkBotToken(botToken);
if (!bot.ok) fail("bot", botToken, bot.error ?? "unknown_error");
console.log(`✓ Bot token ${mask(botToken)} — team "${bot.team}", bot user "${bot.user}"`);

const app = await checkAppToken(appToken);
if (!app.ok) fail("app", appToken, app.error ?? "unknown_error");
console.log(`✓ App token ${mask(appToken)} — Socket Mode connection OK`);

writeEnvFile(botToken, appToken);

console.log(`
──────────────────────────────────────────────────────────────────
✓ Tokens validated & saved → ${ENV_FILE} (chmod 600)

  Team: ${bot.team}
  Bot:  @${bot.user}

Next:
  1. Start the bot:  bun main.ts --live
  2. Smoke test in Slack — type:  /rwf help
──────────────────────────────────────────────────────────────────`);
