# RWF — Complete Systems Overview

*26 Aug 2026 · one page for the whole build. Live at http://localhost:4173*

```
                        ┌────────────────────────────────┐
                        │        BUN SERVE (serve.ts)    │
                        │  :4173 — one process, all of it│
                        └───────────────┬────────────────┘
        ┌──────────────┬────────────────┼────────────────┬───────────────┐
        ▼              ▼                ▼                ▼               ▼
   /  SITE        /app  APP        /hub  HUB       /api/state      /api/ai
   Three.js       phone-first      ops console     live state      GLM-5.3
   showcase       PWA              (ops+corporate) JSON            proxy
        │              │                │                │               │
        │              │                └── polls 3s ────┘               │
        │              ▼                                                  │
        │         game-core (client-side, localStorage)                   │
        │              ▲                                                  │
        │              │ same engine                                      │
        ▼              │                                                  │
   AI guide ◄──────────┼──────────────────────────────────────────────────┘
   widget (site)       │                        (all AI calls server-side,
        │              │                          key in .env, never client)
        ▼              ▼
   ┌─────────────────────────────┐      ┌──────────────────────────────┐
   │  BOTS (separate processes)  │      │  QALARC HUB (existing infra) │
   │  bot-whatsapp  bot-slack    │◄────►│  :8769 WhatsApp+Signal owner │
   │  --sim / --live   Bolt      │ send │  messages.jsonl inbound log  │
   │  both → bot-core → game-core│ read │  (single session, no fights) │
   └─────────────────────────────┘      └──────────────────────────────┘
```

## 1. Game engine — `packages/game-core` (pure TS, 44 tests, 100% branch cover)

| Module | What it does |
|---|---|
| `match.ts` | 300-format lifecycle: any reps any order → raw target closes → highest **adjusted** score wins (+15 closure bonus to closer) |
| `handicap.ts` | Tier multipliers (couch 1.5× → athlete 0.85×); v2 %HRR (Karvonen) blend 0.7×ratio + 0.3×tier; comeback ×1.2 |
| `comeback.ts` | >30% behind leader → one-time ×1.2 on next entry. "Everyone has a shot", mechanically |
| `season.ts` | 4-week seasons: 3/2/1 points, MVP +1, streaks, charity forgiveness ($2 min, once), champion, A/B relegation-promotion |
| `baseline.ts` | Anti-sandbagging: HR baseline drifts ≤10%/update; volume >1.3× tier expectation → tier steps up |
| `pot.ts` | Charity pot ledger — winner directs, never receives |

## 2. Bots — `packages/bot-core` + `apps/bot-{whatsapp,slack}` (22 tests)

One command surface, two platforms: `new · join · start · log <ex> <reps>[!] · s · taunt · pot · result · watch · challenge · season · link · help`
- **WhatsApp**: `--sim` (default, no sends) / `--live` (tails Hub `messages.jsonl`, replies via `POST :8769/send`)
- **Slack**: Bolt Socket Mode, `/rwf` slash command; `--sim` harness without tokens
- **Result cards**: branded 1200×675 SVG per match → served at `/cards/<id>.svg`
- **AI taunts**: `/api/ai` with canned fallback (2s timeout)
- Persistence: `.data/bot-matches.json` (+ seasons/spectators/challenges keys)

## 3. App — `apps/web` (phone-first PWA, 35 browser checks, 0 console errors)

Onboard (name+tier) → crew code → match → **link-chats screen** → live match (standings, log reps, ⚡comeback badge, taunts, 🎙️AI narrator) → result (MVP vote, charity pot, **canvas result card → PNG download**) → Season tab (ladder, streaks, forgiveness, champion belt) → profile/history. localStorage `rwf.state.v1`.

## 4. Concierge hub — `apps/hub` (no-build console, 2 tabs)

- **Operations**: system dots (server/Qalarc Hub/both bots), stat cards, matches table w/ expandable players, diffed activity feed
- **Corporate** (Sahha-EAP-informed): org leagues, employer-funded pots ("no employee money handled"), aggregate-only wellbeing dashboard (k≥5 banner), renewal outlook

## 5. Site — `site/` (Three.js 0.177, offline, zero CDN)

Hero dumbbell scene (curl-bob synced rep counter, drag/parallax) · The 300 steps · **interactive handicap demo (real engine math)** · connections node-graph (animated pulses) · verification cards · feature grid · roadmap · **AI guide widget** (GLM-5.3, scroll-context aware, starter chips, reduced-motion support)

## 6. AI layer — `/api/ai` (serve.ts)

Z.AI Anthropic-compatible endpoint, model glm-5.3, key in `.env` (gitignored, server-side only). RWF-expert system prompt baked in; callers can add context (site widget sends current section; app sends standings; bots send taunt requests). Rate-limited 60/min, 30s timeout, graceful fallbacks everywhere. Consumers: site guide, app narrator + taunt composer, bot taunts.

## 7. Docs & orchestration

`agents/` 9 lanes with cold-start briefs · docs 01–12: business analysis, master plan, chat architecture, OpenGym research, wearables research, brainstorm (A–F approved), launch requirements, integrations, call prep, systems overview (this), ideas & limitations. Email draft v2 ready to send.

## Run book

```bash
bun serve.ts                              # everything at :4173
bun apps/bot-whatsapp/main.ts --sim       # demo match (safe)
bun apps/bot-whatsapp/main.ts --live      # real WhatsApp via Qalarc Hub
bun apps/bot-slack/main.ts --sim          # slack demo (needs tokens for live)
bun test packages/game-core packages/bot-core   # 66 tests
bun run packages/game-core/test/sim.ts    # engine demo incl. comeback + season
```
