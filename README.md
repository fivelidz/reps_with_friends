# Reps With Friends

Real-time multiplayer fitness game. Groups agree on exercises, race to 300
total reps, and a handicap system means **effort and consistency compete — not
raw fitness.** The game lives inside group chats (WhatsApp, Slack); the app is
the scoreboard.

> Private working repo. Introduced by Ben (via Nico). See `docs/` for the full
> evaluation, plan, and research.

## Status — Phase 0 (due diligence) ✅ + build scaffold started

- ✅ Business analysis — `docs/01_BUSINESS_ANALYSIS.md`
- ✅ Master plan (phased) — `docs/02_MASTER_PLAN.md`
- ✅ Chat integration architecture (Slack + WhatsApp via Qalarc Hub) — `docs/03_CHAT_INTEGRATIONS.md`
- ✅ OpenGym / OSS landscape research — `docs/04_RESEARCH_OPENGYM.md`
- ✅ Wearables research (sensors, platform APIs, effort scoring) — `docs/05_RESEARCH_WEARABLES.md`
- ✅ **game-core engine working** — 300-format match + handicap scoring + charity pot
- ⏳ Awaiting Ben's Figma + blueprint → call → MVP build

## Repo layout

```
docs/                    evaluation, plan, research
packages/game-core/      pure TS game engine (no I/O) — the IP
  src/types.ts           domain model
  src/handicap.ts        tier multipliers (v1) + %HRR blend (v2)
  src/match.ts           300-format match lifecycle + standings + winner
  src/pot.ts             charity pot ledger
apps/
  bot-whatsapp/          Qalarc Hub connector (dev) → Cloud API (prod)
  bot-slack/             Bolt.js skeleton (corporate surface)
  api/                   (next) Hono API + command bus
  web/                   (next) PWA: join links, camera rep counting, profiles
```

## Quickstart

```bash
bun run packages/game-core/test/sim.ts   # full match simulation
cd packages/game-core && bun test        # unit tests (when added)
```

## The core mechanic (as implemented)

- Match closes when any player's **raw** total hits the target (300) — urgency.
- Winner = highest **adjusted** score at closure (+15 closure bonus to the closer).
- Adjusted score = Σ reps × effort multiplier.
  - v1: self-set tier multiplier (couch 1.5× … athlete 0.85×).
  - v2 (Phase 3): blend with measured %HRR (Karvonen) vs personal baseline —
    effort becomes verifiable, not declared.
- Charity pot: winner directs contributions to a championed charity. No cash
  to winner.

## Principles

1. Chat adapters are thin — one shared command bus, new platform = one adapter.
2. Pose counting runs client-side in-browser (MoveNet/BlazePose). No video
   leaves the device.
3. game-core stays pure (no I/O) so it's testable and portable to any runtime.
4. AGPL code is reference-only (openGym). MIT code (Good-GYM rep counting) is
   the reuse path. See docs/04.
