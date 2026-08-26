# bot-slack — Reps With Friends on Slack

Corporate-mode surface. Slash command `/rwf <text>` → the **same**
`@rwf/bot-core` CommandBus the WhatsApp bot uses → reply posted in-channel.
No game logic lives here.

## Run

```bash
bun install                          # once — installs @slack/bolt + links @rwf/bot-core

bun apps/bot-slack/main.ts --sim     # DEMO: full match, prints every card. No tokens needed. (default)
SLACK_BOT_TOKEN=xoxb-… SLACK_APP_TOKEN=xapp-… bun apps/bot-slack/main.ts --live
```

## One-time Slack app setup (live mode)

1. Create an app at <https://api.slack.com/apps> (from scratch).
2. **Socket Mode** → enable → create an app-level token with scope
   `connections:write` → that's `SLACK_APP_TOKEN` (`xapp-…`).
3. **OAuth & Permissions** → bot scopes: `commands`, `chat:write`,
   `users:read` → install to workspace → that's `SLACK_BOT_TOKEN` (`xoxb-…`).
4. **Slash Commands** → create `/rwf` (any URL — Socket Mode doesn't need a
   public endpoint).
5. Invite the bot to the channel(s) where crews play.

## How live mode works

- **Bolt Socket Mode** — no public HTTP endpoint, no signing secret needed.
- `/rwf <text>` → `bus.handle({chatId: slack:<channel>, playerId: slack:<user>,
  playerName: <display name>})` → reply via `respond` with
  `response_type: "in_channel"` (match play is a spectator sport).
- One match per channel. Player identity is the Slack user id, so renaming
  never breaks a match.
- Heartbeat: writes `.data/heartbeat-slack.json` `{"ts": <epoch ms>}` every
  15s (ops hub liveness contract).
- Store: `.data/bot-matches.json` (shared shape with the WhatsApp bot —
  keys are namespaced `slack:<channel>` / `wa:<peer>`).

## Files

| Path | Purpose |
|------|---------|
| `main.ts` | sim harness + Bolt Socket Mode app |
| `app.ts` | early stub with Block Kit sketches (superseded by main.ts, kept for reference) |
| `package.json` | own deps — `@slack/bolt` installed HERE only, plus file: links to the rwf packages |

## Commands (identical on WhatsApp + Slack)

`new [target]` · `join [couch|casual|fit|athlete]` · `start` ·
`log <exercise> <reps>[!]` · `s` / `standings` · `taunt <name>` ·
`pot <cents>` · `result` · `link <code>` · `help`
