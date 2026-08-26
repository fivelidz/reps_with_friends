# RWF Agent Lanes — Orchestration Workspace

Each lane = one folder = one workstream. Any sub-agent (GLM 5.3) can pick up a
lane cold by reading its `BRIEF.md`. Lanes own their paths exclusively — never
edit outside your lane without coordination.

## Lanes

| # | Lane | Owns | Status |
|---|------|------|--------|
| 1 | `01-message-interface` | `packages/bot-core`, `apps/bot-whatsapp`, `apps/bot-slack` | 🔨 active |
| 2 | `02-app` | `apps/web` | 🔨 active |
| 3 | `03-website` | `site/` | 🔨 active |
| 4 | `04-communications` | `docs/*pitch*`, `EMAIL_DRAFT.md`, call prep | 🔨 active |
| 5 | `05-concierge` | `apps/hub` (ops console, Tauri-wrap later) | 🔨 active |
| 6 | `06-game-engine` | `packages/game-core` | 🔨 active (tests) |
| 7 | `07-verification-wearables` | `apps/web` verification modules, wearable adapters | 💤 dormant (research done: `docs/05`) |
| 8 | `08-launch-compliance` | `docs/08_LAUNCH_REQUIREMENTS.md` | 🔨 active (research) |
| 9 | `09-growth-retention` | growth docs, season design | 💤 dormant |

## Shared contracts (all lanes respect)

- **Design system:** `design/tokens.css` + `design/fonts/` — served at `/design/*`. Import, never fork.
- **Local server:** `serve.ts` (root) — `/` → site, `/app` → apps/web/dist, `/hub` → apps/hub, `/design` → design, `/api/state` → live system state. Port 4173.
- **Shared data:** `.data/bot-matches.json` (bot match store), `.data/heartbeat-{whatsapp,slack}.json` (bot liveness, written every 15s).
- **Engine:** `packages/game-core` is pure (no I/O). Bots and app both consume it. Never put platform logic in it.
- **Runtime:** Bun (runs TS natively). No npm installs unless the brief says so.

## Working protocol for agents

1. Read your `BRIEF.md` fully. Check "Current state" — don't redo finished work.
2. Work only inside your lane's paths (+ docs if briefed).
3. Verify: every brief has a "Definition of done" — run it, show output.
4. Update your BRIEF.md checkboxes when finished.
5. Never delete files. Archive or leave.
