# RWF Agent Lanes — Orchestration Workspace

Each lane = one folder = one workstream. Any sub-agent can pick up a lane cold
by reading its `BRIEF.md`. Lanes own their paths exclusively.

## Active map (28 Aug 2026)

| # | Lane | Owns | Status |
|---|------|------|--------|
| 1 | `01-message-interface` | bot-core, WhatsApp + Slack bots | built · Slack app creation = 5-min human step |
| 2 | `02-app` | apps/web | built + polished · awaits Figma screens (F4) |
| 3 | `03-website` | site/ | built · avatars parked |
| 4 | `04-communications` | email, call prep | v4 ready to send (founder's version) |
| 5 | `05-concierge` | apps/hub | built (ops + corporate tabs) |
| 6 | `06-game-engine` | game-core | 98 tests · G-family first four live |
| 7 | `07-verification-wearables` | camera + HR | E22/E23 built · real-footage validation open |
| 8 | `08-launch-compliance` | docs/08 | research done · legal opinion pending |
| 9 | `09-growth-retention` | growth docs | dormant · activates at first real crews |
| 10 | `10-avatars` | avatar-styles, /avatars | PARKED · investigation done, 5 non-negotiables binding |
| 11 | `11-ops-deploy` | CI, Pages, GMKtec | standing lane · bots start when tokens exist |

## Figma branch — `figma/` (the current push)

Ben's Figma arrived (blocker B1 resolved). Read-only extraction → analysis →
components → screens. **F1 is blocked on a FIGMA_TOKEN**
(~/.secrets/figma.env) — the one-command extractor (`figma/fetch.ts`) is
staged and waiting. See `figma/README.md`.

| Lane | Status |
|---|---|
| F1-extract | needs token (30-second founder step) |
| F2-analysis | after F1 |
| F3-components | after F2 |
| F4-screens | after F3 |

## Shared contracts (all lanes respect)

- **Design system:** `design/tokens.css` + `design/fonts/` — served at `/design/*`. Import, never fork.
- **Local server:** `bun serve.ts` — `/` site · `/app` · `/hub` · `/avatars` · `/demo` · `/system` · `/debug` · `/connect` · `/slack` · `/models/*` · `/api/{state,ai,sim}`. Port 4173.
- **Production:** https://rwf.qalarc.com (Pages, CI on push). GMKtec always-on: 100.111.199.12:4173.
- **Engine:** game-core is pure (no I/O). Bots + app + API consume it. Platform logic never enters it.
- **Runtime:** Bun. No npm installs unless the brief says so. App may use CDNs (camera model); the showcase site stays offline-only.
- **WebGL discipline:** lazy contexts only (browser caps ~16) — create on intersection, release off-screen. See site/avatars.js `_ensureRenderer`.
- **Verification culture:** screenshot and LOOK (resize ≤1300px, Read tool). Never claim rendering works without having seen it. Pixel-check colours against references.

## Working protocol for agents

1. Read your `BRIEF.md` fully. Check "Current state" — don't redo finished work.
2. Work only inside your lane's paths (+ docs if briefed).
3. Verify per the brief's Definition of Done — run it, show output.
4. Update your BRIEF.md checkboxes when finished.
5. Never delete files. Archive or leave.
