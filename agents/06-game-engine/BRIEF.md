# Lane 6 — Game Engine

**Mission:** `@rwf/game-core` — pure, tested, portable. The IP.

**Owns:** `packages/game-core/`

## Current state
- Engine implemented: types, handicap v1 (tier multipliers + %HRR blend),
  300-format match lifecycle, closure bonus, charity pot, sim (runs clean).
- 2026-08-26: fixed `winner()` — closure bonus was applied AFTER standings'
  pre-bonus sort, so it could never change the outcome. Now re-sorts
  post-bonus. No type changes; sim outcome unchanged.

## Tasks now
- [x] `test/core.test.ts` (bun:test): handicap math (each tier, HRR blend),
      match lifecycle errors (log before start, unknown exercise, dup players),
      closure + winner incl. closure bonus, pot ledger, standings ordering.
- [x] Sim stays green.

## Next (when activated)
- Handicap v2: baseline learning from history (rolling player baseline, anti-sandbagging)
- Seasons/leagues: multi-match series, points, relegation
- Match variants: Sprint 100, Marathon 500, Relay (turn-based)
- Export: result-card data shape for shareable images

## Rules
- Pure TS, zero I/O, zero platform concepts. If a bot needs it, it goes in bot-core.
- Breaking changes to types need a note here (bots + app consume this).

## Definition of done
`bun test packages/game-core` green, ≥90% of engine branches covered, sim unchanged.
