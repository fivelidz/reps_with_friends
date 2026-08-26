# Slack app — one-click setup

The bot is built (`main.ts`, Bolt Socket Mode). You need a Slack app + two
tokens, ~5 minutes:

## 1. Create the app from this manifest

1. Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**
2. Pick any workspace you control (a free test workspace is fine — create one at slack.com/get-started if needed)
3. Paste the YAML below (copy `manifest.yml` in this folder)
4. **Create** → the app exists

## 2. Install to the workspace

- App settings → **Install to Workspace** → Allow
- **OAuth & Permissions** page → copy the **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`

## 3. Enable Socket Mode

- **Socket Mode** → toggle ON → it creates an app-level token with
  `connections:write` → copy it (`xapp-…`) → `SLACK_APP_TOKEN`

## 4. Add the slash command (if not auto-created)

- **Slash Commands** → Create: command `/rwf`, request URL `https://unused/` (Socket Mode doesn't need a real URL), description "Reps With Friends match commands"

## 5. Save the tokens (one command)

```bash
cd apps/bot-slack
bun quickstart.ts
```

Paste the two tokens when prompted (or pass them up front:
`bun quickstart.ts --bot xoxb-… --app xapp-…`). quickstart validates both
against Slack live, prints your team name, and saves them to
`~/.config/rwf/bot-slack.env` (chmod 600). If a token is wrong it tells you
exactly which settings page to fix.

## 6. Run

```bash
bun main.ts --live
```

No env vars needed — `--live` reads `~/.config/rwf/bot-slack.env` automatically
(env vars still win if set). Later, `bun quickstart.ts --check` re-validates
the saved tokens if anything misbehaves.

In any channel: `/rwf new` → `/rwf join casual` → `/rwf start` → `/rwf log pushups 25` → `/rwf s`

## Manifest scopes (why)

| Scope | Why |
|---|---|
| `commands` | slash command `/rwf` |
| `chat:write` | post standings/result cards |
| `app_mentions:read` | "@RWF standings" mention support |
| `connections:write` (app token) | Socket Mode connection |

No DM scopes, no history scopes — the bot only speaks when spoken to.
