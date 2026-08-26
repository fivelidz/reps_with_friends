# bot-whatsapp — Reps With Friends on WhatsApp

The chat is the arena. This bot runs the full RWF command surface in a
WhatsApp group via the **Qalarc Hub** (localhost HTTP API on `127.0.0.1:8769`).
All game logic lives in `@rwf/bot-core` / `@rwf/game-core` — this app is pure
transport.

## Run

```bash
bun install                      # once — links @rwf/bot-core + @rwf/game-core

bun apps/bot-whatsapp/main.ts --sim   # DEMO: plays a full match, prints every card. Sends nothing. (default)
bun apps/bot-whatsapp/main.ts --live  # OPT-IN live mode
```

**Live sends are guarded behind `--live`.** Sim is the default so nobody
accidentally messages a real group.

## How live mode works

1. **Never runs its own WhatsApp receiver.** The Qalarc Hub owns the single
   session (see `~/projects/MASTER_PROJECTS/doofing_phone_link/qalarc_hub/AGENTS.md`).
2. Tails `~/.local/share/qalarc-hub/messages.jsonl` every 2s, filtering
   `direction == "in" && platform == "whatsapp"`.
3. Dedupes by **byte offset** tracked in `.data/wa-tail.json` — restarts never
   replay old messages. First-ever run starts at end-of-log (no history replay).
   Log truncation/rotation is detected (size < offset → reset to 0).
4. Maps sender → player: `playerId = wa:<peer>`, name from `peer_name`.
   One match per conversation (`chatId = wa:<peer>`).
5. Only texts that look like RWF commands (`looksLikeCommand`) get a reply —
   the bot stays quiet in normal conversation.
6. Replies go out via `POST http://127.0.0.1:8769/send`
   (`{platform:"whatsapp", recipient, text, source:"ai"}`).
7. Heartbeat: writes `.data/heartbeat-whatsapp.json` `{"ts": <epoch ms>}`
   every 15s (ops hub liveness contract).

## Files

| Path | Purpose |
|------|---------|
| `main.ts` | sim harness + live tailer |
| `hub-client.ts` | thin Qalarc Hub HTTP client (early stub, now the live sender) |
| `../../.data/bot-matches.json` | persisted match store (live mode; ops hub reads this) |
| `../../.data/sim-whatsapp.json` | sim-mode store (kept out of the live store) |
| `../../.data/wa-tail.json` | tail dedupe state |
| `../../.data/heartbeat-whatsapp.json` | liveness heartbeat |

## Commands (identical on WhatsApp + Slack)

`new [target]` · `join [couch|casual|fit|athlete]` · `start` ·
`log <exercise> <reps>[!]` · `s` / `standings` · `taunt <name>` ·
`pot <cents>` · `result` · `link <code>` · `help`

A `!` after the reps marks the set camera-verified (`log pushups 25!`).
