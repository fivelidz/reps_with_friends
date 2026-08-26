# RWF — Features & Current Progress

*27 Aug 2026 · the complete writeup. Live version with rendered components:
https://rwf.qalarc.com/system*

---

## Where the build stands

**Phase 0 (due diligence) — complete. Prototype — feature-complete and live.**
What began as an email evaluation is now a running system: a tested game
engine, two chat bots, a phone-first app, an ops console, an AI layer, and
push-to-deploy hosting at rwf.qalarc.com — 90+ tests green, CI-gated.

| Metric | Value |
|---|---|
| Tests | 90+ green (engine 44 · bots 22 · API 24) — run on every push |
| Public pages | 9 — site, demo, app, system, hub, debug, connect, slack, state API |
| Elements catalogued | 36 across families A–G |
| Components | 16 design-system primitives (see /system) |
| Deploy | GitHub push → Cloudflare Pages in ~20s |
| AI | GLM-5.3 via server-side proxy (site guide, app narrator, bot taunts) |

## Features — by family

### A · Core loop — BUILT
300-format match (any reps, any order, first to raw target closes; highest
effort-adjusted score wins) · tier handicap v1 (couch ×1.5 → athlete ×0.85) ·
closure bonus (+15) · charity pot ledger (winner directs, never receives) ·
AI taunt engine with canned fallback. **%HRR handicap v2** is engine-ready
(blend math implemented + tested) and activates when heart-rate straps land.

### B · Retention arc — BUILT
4-week seasons (3/2/1 points, MVP +1) · champion crowning · A/B division
relegation-promotion · streaks with charity forgiveness ($2, once/season) ·
comeback ×1.2 (>30% behind, once/match — mechanically enforces "everyone has
a shot") · baseline learning (HR drift ≤10%/update; volume-based tier
correction — anti-sandbagging).

### C · Social & viral — MOSTLY BUILT
Branded result cards (1200×675 SVG from bots, PNG export from app) ·
spectator mode (`watch <code>`) · crew-vs-crew challenges · drop-cam clips
and public web ladder still ideas.

### D · Corporate — BUILT (seeded)
Hub console corporate tab: org leagues, employer-funded pots ("no employee
money handled"), aggregate-only wellbeing dashboard with k≥5 suppression
(Sahha-EAP playbook), renewal outlook. Awaiting real org data.

### E · Verification — RESEARCHED, NEXT
Full phasing mapped (docs/05): in-browser MoveNet camera counting + Web
Bluetooth HR straps (P1) → HealthKit/Health Connect (P2) → WHOOP/Garmin cloud
cross-check (P3). Engine already accepts `avgHrrPct` + `verified` flags.
Camera module is the next lane activation.

### F · Wilder cards — IDEAS
Referee review · physical champion belts · radio mode (drum-track rep cues) ·
annual charity championship.

### G · Second wave — PROPOSED (27 Aug)
Rematch button · Monday AI digest · nemesis system · personal records ·
photo finish · ghost race · guest slot · charity all-time ladder ·
roast-tier setting · adaptive exercise equivalents · warm-up predictions.
Recommended first four: rematch, digest, photo finish, nemesis.

## Systems

1. **game-core** — pure TS engine, 44 tests, 100% branch cover
2. **bot-core + bots** — one command grammar, WhatsApp (Qalarc Hub) + Slack
   (Bolt Socket Mode), sim harnesses, result-card generator
3. **app** — phone-first PWA (onboard → crew → match → seasons), polished
   (tier cards, medals, confetti, sticky log bar), 35 browser checks
4. **hub console** — ops + corporate tabs, live /api/state polling
5. **site** — Three.js showcase, interactive handicap demo, AI guide
6. **AI layer** — /api/ai proxy (local + Pages Function), key server-side
7. **apps/api** — unified REST backend (crews/matches/seasons), 24 tests —
   the MVP foundation that replaces localStorage + bot file state

## Progress against plan (docs/02)

- Phase 0 ✅ (research, analysis, plan, email, call prep)
- MVP phase: engine ✅ · bots ✅ · app ✅ · web ✅ · handicap v1 ✅ —
  remaining for MVP proper: wire app↔API↔bots (mechanical), auth, first real
  crews
- Pilot gates: WhatsApp Cloud API verification, Stripe pots, Slack directory,
  legal opinion (docs/15 blockers register)

## Top blockers (docs/15)

1. 🟥 Slack app needs 5-min human creation → permanent install link
2. 🟥 WhatsApp Cloud API group support unverified — shapes pilot architecture
3. 🟥 Charity-wager legal opinion before real money
4. 🟧 Always-on bots — minirig kit ready, one SSH command
5. 🟧 App ↔ API ↔ bots state unification

## Next session priorities

1. Wire the app to apps/api (kill the localStorage/file split)
2. Activate camera verification lane (MoveNet)
3. Install hosting kit on minirig
4. G-family sign-off → build rematch + Monday digest
5. Send the email (demo-first framing), take the call, fill the divergence log
