# Reps With Friends Core Review — 2026-09-10 (Codex, read-only)

*Saved by the orchestrator — the review session's sandbox was read-only.*

## Findings summary (full detail in the session; fixes dispatched immediately after)

- **P0** Contested proof can still win the Daily Win + season point (completion/winner assigned before settlement; settlement burns RUF but not the win). apps/sot-engine.js:969,1103,1311
- **P1** Steal configured to trigger wins but never completes in engine state (bonusRuf counted, completedAt/winner never set). :267,:832 + api sot.ts:300
- **P1** Tokens + join codes use Math.random (bearer creds need crypto randomness, ≥128-bit). api sot.ts:146
- **P1** Full group state unauthenticated behind ~33M-combo 5-char code, no rate limit. routes.ts:229,265
- **P1** GET auto-close mutates but doesn't persist (lost on next read). sot.ts:355
- **P1** Bot API fallback = split-brain (no reconciliation on return). sot-api.ts:47,142
- **P1** Cloud optimistic/replay: no clientLogId → duplicate or lost logs on retry. app.js:161,1354 + cloud.js:193
- **P1** Same human, two devices → silently assigned a new player. cloud.js:166 + sot.ts:237
- **P1** Any participant can run destructive /cmd (new/day close force/season end) — no role checks. sot.ts:471 + sot-bus.ts:372,575,640
- **P1** Shield Bash condition inverted in the JS engine (TS core correct). sot-engine.js:374
- **P1** Pack Bond can double-pay duplicated members. :436,:1193
- **P1** Invalid Combo Boost ID throws. :303
- **P2** Join auto-opens days without play-day check. routes.ts:249

## Verdict
Not pilot-ready at this layer until P0 + P1s fixed and covered by focused tests. Internal-demo ready. Core logging/handicap model is close; exploit surface is in proof contests, steal-wins, offline replay, and the bot fallback.
