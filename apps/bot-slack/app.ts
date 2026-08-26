// Slack bot skeleton (Bolt.js) — corporate-mode surface.
// Install deps when wiring for real: bun add @slack/bolt
// Design: this adapter ONLY translates Slack events → the shared command bus
// and formats game-core output into Block Kit. No game logic lives here.

import type { StandingRow } from "@rwf/game-core";

// Placeholder command-bus signature (to be implemented in apps/api).
type Command =
  | { kind: "new"; channelId: string; userId: string }
  | { kind: "join"; channelId: string; userId: string }
  | { kind: "log"; channelId: string; userId: string; exerciseId: string; reps: number }
  | { kind: "standings"; channelId: string };

export async function handleCommand(_cmd: Command): Promise<string> {
  // TODO: forward to apps/api command bus → game-core
  return "not wired yet";
}

/** Block Kit standings message (progress bars via Block Kit fields). */
export function standingsBlocks(matchName: string, rows: StandingRow[]) {
  return [
    { type: "header", text: { type: "plain_text", text: `🏋️ ${matchName} — standings` } },
    ...rows.map((r) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${r.player.name}* — ${r.adjustedScore} pts · ${r.progressPct}% to target · ${r.verifiedPct}% verified`,
      },
    })),
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Join match" }, action_id: "rwf_join" },
        { type: "button", text: { type: "plain_text", text: "Log reps" }, action_id: "rwf_log" },
      ],
    },
  ];
}

// Bolt wiring (uncomment once @slack/bolt is installed):
//
// import bolt from "@slack/bolt";
// const app = new bolt.App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET });
// app.command("/rwf", async ({ command, ack, respond }) => {
//   await ack();
//   await respond(await handleCommand(parse(command.text, command)));
// });
// await app.start(3000);
