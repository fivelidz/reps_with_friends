# RWF — Blockers Register

*What's blocked, why, who unblocks it, and what it costs. Reviewed weekly.
Status: 🟥 blocked · 🟧 partial · 🟩 clear*

## Technical

| # | Blocker | Impact | Unblock path | Status |
|---|---|---|---|---|
| T1 | **Slack app doesn't exist yet** — needs one human with a Slack login (5 min: create from `/slack/manifest.yml`, install, copy Client ID) | No live Slack play; no corporate pilot surface; `/slack` install link can't be generated until then | Alexei (or anyone) does the 5-min setup → paste Client ID at `/slack` → permanent Add-to-Slack link exists | 🟥 |
| T2 | **WhatsApp Cloud API group messaging** — likely 1:1-only [VERIFY] | Production architecture: group-native bot may be impossible on official API; per-player DM redesign needed at pilot | Verify with Meta at pilot application; design DM-fallback now (docs/14 notes the migration shape) | 🟥 |
| T3 | **Bots only run while superlocal is on** — no always-on host | Demo reliability for Ben/Nico; "is the bot up?" becomes the story | Short-term: move bot processes to minirig (always-on, systemd user services — pattern exists). Long-term: small VPS or worker | 🟧 |
| T4 | **No auth / identity** — names are free-typed, per-device state | Multi-device play, real accounts, anti-cheat identity, payments | apps/api exists; add magic-link auth (Resend is live) at MVP | 🟧 |
| T5 | **App ↔ bot state split** — localStorage vs .data JSON, no sync | A crew created in the app can't be played by the bots yet (code binding is manual) | Wire app → apps/api ← bots (the API is built and tested; migration is mechanical) | 🟧 |
| T6 | **AI key balance** — primary Z.AI key exhausted; running on secondary | AI features (guide, narrator, taunts) die if secondary runs dry | Monitor usage; top up Z.AI; fallbacks already degrade gracefully | 🟧 |
| T7 | **CF token lacks Tunnel:Edit** — Pages works, named tunnel doesn't | Can't expose the LOCAL server (live bots, live /api/state) at rwf.qalarc.com | Widen token scope or `cloudflared tunnel login` once; then bots' live data can flow through the same domain | 🟧 |

## Legal / compliance

| # | Blocker | Impact | Unblock path | Status |
|---|---|---|---|---|
| L1 | **Charity-wager legal opinion** — no lawyer has looked at the pot structure | No real money in pots, ever, until this lands. Pledge-only or employer-funded until then | Brief a charity/gaming lawyer (AUD 3–10k). Questions already framed in docs/08 §6. Employer-funded pots are the cleanest interim | 🟥 |
| L2 | **Apple 3.2.2(iv)** — no in-app charity collection | Pot payment UX must be web-only in any native app, forever | Already designed around: payments live on the web app | 🟩 |
| L3 | **Privacy policy + data inventory** — none written | App store submissions, corporate procurement, GDPR if global | One data-inventory sheet feeding policy + Apple labels + Play data safety (docs/08 §7 has the checklist) | 🟥 |

## Business

| # | Blocker | Impact | Unblock path | Status |
|---|---|---|---|---|
| B1 | **Figma + blueprint not received** — design audit, divergence log, and scope alignment all wait on it | Can't finalise MVP scope; our design (docs/13) is deliberately independent until then | Email asks for it; call scheduled Tue/Wed | 🟥 |
| B2 | **Equity terms undefined** — split, vesting, IP assignment of Ben's blueprint | Co-founder-track commitment can't be papered | Call agenda item #5 (docs/09); get specific, get it in writing | 🟥 |
| B3 | **Corporate prospects unvalidated** — no LOIs or warm corporates identified | Corporate lane priority (and the employer-pot pilot) is a hypothesis | Ask Ben on the call: any real prospects? Sahha-network intros? | 🟧 |

## Deliberately NOT blockers

- **Apple Messages** — no API exists; parked permanently for MVP.
- **App stores** — PWA ships without them; native is Phase 3 (HealthKit).
- **Strava** — paid + capped; revisit at scale.
- **Custom ML for rep counting** — MoveNet in-browser covers MVP (lane 7 brief ready).

## This week's unblock order

1. **T1** Slack app (5 min, human-in-loop) → corporate surface live
2. **B1/B2** Send email → call → Figma + equity specifics
3. **T3** Bots to minirig (always-on demo)
4. **T5** App ↔ API ↔ bots wiring (mechanical, ~1 session)
5. **L3** Data inventory sheet (feeds everything compliance)
