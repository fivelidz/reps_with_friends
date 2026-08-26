# Lane 1 — Message Interface

**Mission:** the chat is the arena. WhatsApp + Slack bots running the exact
same command surface over `@rwf/bot-core`, backed by `@rwf/game-core`.

**Owns:** `packages/bot-core/`, `apps/bot-whatsapp/`, `apps/bot-slack/`

## Current state
- `packages/game-core` — DONE by lane 6 (engine: 300-format, handicap v1, pot);
  comeback/season/baseline modules were NOT landed when lane 1 needed them —
  see `src/game-extras.ts` bridge (below).
- `packages/bot-core` — DONE + backlog shipped (store, cards, bus, card-image,
  ai, game-extras, tests: `bun test packages/bot-core` 22/22)
- `apps/bot-whatsapp/` — DONE (`main.ts` sim + live tailer; hub-client.ts kept as the live sender)
- `apps/bot-slack/` — DONE (`main.ts` sim + Bolt Socket Mode; @slack/bolt installed in-dir; app.ts stub kept for reference)

## Command surface (implemented in bus, identical on both platforms)
`new [target]` · `join [tier]` · `start` · `log <exercise> <reps>[!]` ·
`s`/`standings` (⚡ comeback markers, 👁 spectator count) · `taunt <name>`
(AI-first, canned fallback) · `pot <cents>` · `result` (+ SVG card URL) ·
`link <code>` · `watch <code>` (spectate a crew) · `challenge <code>` /
`challenge accept` (crew-vs-crew stub) · `season new [name]` / `season ladder` · `help`

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

### Backlog (shipped this pass)
- [x] `packages/bot-core/src/card-image.ts` — branded 1200×675 result-card SVG
      (dark #0a0b0d, lime #c6f32e, Space Grotesk fallback sans, RWF wordmark,
      winner huge, standings progress bars, charity pot line, "repswithfriends"
      footer). `result` writes `.data/cards/<matchId>.svg` and appends
      `http://localhost:4173/cards/<matchId>.svg` (serve.ts already serves it).
      Card failure never breaks the text result card.
- [x] Spectator mode — `watch <CODE>` registers the chatId under the crew code
      (persisted, top-level `spectators` key); standings broadcasts show
      "👁 N watching"; spectator chats run `s` without joining and see the
      watched crew's match standings.
- [x] Crew-vs-crew — `challenge <CODE>` records a persisted pending challenge
      between crew codes (top-level `challenges` key), replies with a challenge
      card; `challenge accept` (from the challenged crew's linked chat) locks it
      in with a rivalry card. Engine wiring later (stub).
- [x] AI taunts — `taunt` tries `POST http://localhost:4173/api/ai` (2s
      timeout, `RWF_AI_URL` overridable) via the async bus path
      (`bus.handleAsync`); any failure falls back to canned lines. Sync
      `bus.handle` stays network-free (tests use it).
- [x] Comeback + season — standings card marks comeback-eligible players with ⚡;
      `season new [name]` / `season ladder` with season state persisted under
      top-level `seasons` key; completed matches auto-record into the active
      season. Existing match entries in `.data/bot-matches.json` untouched
      (keys added, none changed).
- [x] Help card updated with the new commands; both `--sim` harnesses extended
      (result card path+size, watch, challenge, season ladder, AI-taunt
      fallback) and reset their scratch store each run for clean demos.

### Lane-6 bridge (IMPORTANT for whoever lands comeback/season)
`packages/bot-core/src/game-extras.ts` feature-detects lane 6's
`comebackEligible` / `createSeason` / `recordMatch` / `seasonLadder` /
`COMEBACK_MULTIPLIER` via dynamic import and currently runs LOCAL fallbacks
with the same names/semantics (comeback: live + >30% behind leader; ladder:
3 pts/win + 1/played). When lane 6 lands, the real functions take over
automatically — re-run `bun test packages/bot-core` + both sims to confirm
(no code changes expected; if lane-6 signatures differ, the wrappers degrade
to the local path and log nothing — check `usingLane6Comeback` /
`usingLane6Season` exports).

## Contracts
- Qalarc Hub API: see `~/projects/MASTER_PROJECTS/doofing_phone_link/qalarc_hub/AGENTS.md`
  (GET /health, POST /send, GET /messages, tail messages.jsonl). Hub base: 127.0.0.1:8769.
- Store persists to `.data/bot-matches.json` (hub console reads it — keep shape stable).
  Added top-level keys (additive only): `seasons`, `spectators`, `challenges`.
  NOTE for lane 05: `/api/state` iterates every top-level key as a chat — the
  three reserved keys will surface as one junk "unknown" row unless filtered.
- Never run your own signal-cli/whatsmeow receiver. Hub owns the session.

## Definition of done
Both `--sim` harnesses play a full match (new→join×3→start→log…→close→result)
plus watch/challenge/season flows with zero errors; `bun test packages/bot-core`
green; an SVG exists in `.data/cards/` starting with `<?xml`; live WhatsApp
mode guarded behind `--live` flag (default sim). ✅ verified 2026-08-26.
