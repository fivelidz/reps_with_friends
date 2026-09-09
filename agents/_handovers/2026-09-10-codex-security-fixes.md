# Reps With Friends Security Fixes — 2026-09-10

## What Changed

- `apps/sot-engine.js`
  - Added shared `maybeCompleteAndWin()` / live-winner recompute helpers.
  - Proof-crossing logs can complete provisionally but cannot assign `winnerId` while proof is in review.
  - Accepted proof settlement can assign the Daily Win from the original crossing log.
  - Contested live settlement removes completion if the player drops below target and recomputes the earliest eligible winner.
  - Contested closed settlement revokes the win and marks `proofCorrection` for recap/season correction; it does not transfer the win after close.
  - Steal now routes through the shared completion/win helper so `stealCanTriggerWin` can actually win.
  - Fixed Shield Bash armed-shield condition.
  - Pack Bond dedupes `memberIds` and requires at least two unique valid members.
  - Unknown Combo Boost IDs return `{ ok:false }`.

- `packages/game-core`
  - Mirrored covered completion/win semantics for steal-triggered wins.
  - Added Combo Boost unknown-ID refusal.
  - Added focused tests for steal-triggered win and Combo Boost unknown IDs.

- `apps/api`
  - Tokens now use `node:crypto` `randomBytes(32).toString("base64url")`.
  - SOT join codes now use crypto `randomInt` and 26 chars from the 32-char alphabet (130 bits).
  - `GET /sot/groups/:code/state` requires `playerToken` query param or `x-rwf-player-token`; unauthenticated callers get preview only: `code/name/playerCount/hasLiveDay`.
  - Added naive per-IP SOT route rate limit.
  - Read routes now persist `advanceGroup()` auto-close mutations via `mutateGroup`.
  - Join auto-open now checks `playDays`.
  - Duplicate proposed player IDs are rejected with a clear 409 claim error.
  - `/log` accepts `clientLogId` and dedupes per player/group.
  - `/cmd` accepts `clientCmdId`/`clientLogId` and dedupes per player/group where supplied.
  - API bus wrapper rejects creator-only destructive commands.
  - `startServer(0)` retries high ports because this Bun runtime reports `EADDRINUSE` for port `0`.

- `packages/bot-core`
  - `SotApiSession` no longer falls back to local `SotStore` once an API session exists.
  - Established chats queue commands during API outages and replay against the API on reconnect.
  - `SotCommandBus` now records `creatorPlayerId` and enforces creator-only `new`, `day close force`, and `season end`.

- `apps/sot`
  - Cloud polling includes `playerToken` for full state.
  - Cloud logs send `clientLogId`.
  - Offline queue items are removed only after cloud ack for cloud-bound groups.
  - Duplicate claim errors tell the user to restore an existing player/token or change profile name.
  - Proof settlement copy and recap correction now reflect win/point revocation.
  - Cloud E2E expects 26-char SOT join codes.

## Tests Added

- P0 proof regressions:
  - contested before close transfers to first eligible completer.
  - contested after close revokes win without transfer.
- Steal-triggered win under `stealCanTriggerWin`.
- Idempotent `/log` dedupe.
- Token-gated `/state`.
- Creator-only role-gated commands.
- Duplicate player claim rejection.
- Bot fail-closed queue/replay behavior with fake fetch.
- Combo Boost unknown ID and Pack Bond dedupe.

## Verification

- Passed: `bun test packages/game-core`
  - `112 pass, 0 fail`
- Passed: `bun test packages/game-core packages/bot-core/test/sot-bus.test.ts apps/sot-engine.test.js apps/sot/cards.test.js`
  - `174 pass, 0 fail`
- Passed direct API route probes through `handleRequest`:
  - 26-char crypto code assertion.
  - duplicate claim 409.
  - unauthenticated state preview.
  - `clientLogId` dedupe.
  - creator-only command rejection.
  - SOT rate limit returns 429 on request 241.
- API/bot module imports passed:
  - `routes ok`, `sot ok`, `bot ok`.

## Blocked Verification

- `bun test packages/game-core packages/bot-core apps/api` was attempted.
  - Non-server tests ran and passed, but every test that uses `Bun.serve` failed before assertions with `Failed to start server. Is port ... in use?`.
  - This affected `apps/api` tests, `packages/bot-core` API-sync/SOT API tests, and unrelated Beeper mock-server tests.
- Requested server start was attempted:
  - `setsid nohup bun serve.ts > /tmp/rwf-serve.log 2>&1 < /dev/null &`
  - Failed immediately with `Failed to start server. Is port 4173 in use?`.
- Requested SOT E2E command was attempted:
  - `bun apps/sot/e2e.mjs && ...`
  - Failed immediately at the first E2E local `Bun.serve` bind on port `4194`.
- Requested `bun apps/sot-engine.test.js` was attempted.
  - Bun rejects direct execution of `bun:test` specs with `Cannot use describe outside of the test runner`; the equivalent `bun test apps/sot-engine.test.js` passed.

## Residual Risks

- Full HTTP and browser E2E still need to be rerun in an environment where `Bun.serve` can bind sockets.
- Closed-day proof vote correction is implemented for the local app engine and engine state. The API has no proof-vote route today, so API-side post-close proof correction was not externally exercised over HTTP.
