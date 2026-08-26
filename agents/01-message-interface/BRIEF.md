# Lane 1 — Message Interface

**Mission:** the chat is the arena. WhatsApp + Slack bots running the exact
same command surface over `@rwf/bot-core`, backed by `@rwf/game-core`.

**Owns:** `packages/bot-core/`, `apps/bot-whatsapp/`, `apps/bot-slack/`

## Current state
- `packages/game-core` — DONE (engine: 300-format, handicap v1, pot)
- `packages/bot-core` — DONE (store, cards, bus, index, tests: `bun test packages/bot-core` 13/13)
- `apps/bot-whatsapp/` — DONE (`main.ts` sim + live tailer; hub-client.ts kept as the live sender)
- `apps/bot-slack/` — DONE (`main.ts` sim + Bolt Socket Mode; @slack/bolt installed in-dir; app.ts stub kept for reference)

## Command surface (implemented in bus, identical on both platforms)
`new [target]` · `join [tier]` · `start` · `log <exercise> <reps>[!]` ·
`s`/`standings` · `taunt <name>` · `pot <cents>` · `result` · `link <code>` · `help`

## Tasks
- [x] `packages/bot-core/src/bus.ts` — CommandBus: parse → mutate store → reply cards
- [x] `packages/bot-core/src/index.ts` — exports
- [x] `packages/bot-core/test/bus.test.ts` — full match flow via bus
- [x] `apps/bot-whatsapp/` — live bot: tail `~/.local/share/qalarc-hub/messages.jsonl`
      (filter `direction=="in"`, `platform=="whatsapp"`), map sender→player,
      bus.handle, reply via `POST http://127.0.0.1:8769/send` (`source:"ai"`).
      Heartbeat to `.data/heartbeat-whatsapp.json` every 15s. CLI harness mode
      (`--sim`) that fakes inbound messages and prints replies — no live sends.
- [x] `apps/bot-slack/` — Bolt app (`bun add @slack/bolt` in that dir only):
      slash command `/rwf <text>` → bus.handle → reply. Socket Mode.
      Heartbeat `.data/heartbeat-slack.json`. CLI harness (`--sim`) without tokens.
- [x] Both harnesses run clean: `bun apps/bot-whatsapp/main.ts --sim` and
      `bun apps/bot-slack/main.ts --sim` demonstrate a full match.

## Contracts
- Qalarc Hub API: see `~/projects/MASTER_PROJECTS/doofing_phone_link/qalarc_hub/AGENTS.md`
  (GET /health, POST /send, GET /messages, tail messages.jsonl). Hub base: 127.0.0.1:8769.
- Store persists to `.data/bot-matches.json` (hub console reads it — keep shape stable).
- Never run your own signal-cli/whatsmeow receiver. Hub owns the session.

## Definition of done
Both `--sim` harnesses play a full match (new→join×3→start→log…→close→result)
with zero errors; `bun test packages/bot-core` green; live WhatsApp mode
guarded behind `--live` flag (default sim).
