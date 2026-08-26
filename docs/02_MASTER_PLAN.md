# Reps With Friends — Master Plan

*Version 0.1 · 26 Aug 2026 · Alexei Brown*

---

## 0. Strategy in one paragraph

Win the empty niche — **handicapped, small-group fitness competition delivered
inside the group chat** — by shipping a playable WhatsApp/Slack bot fast
(weeks), using in-browser pose counting for rep verification ($0, no
approvals), and letting the chat broadcast loop do acquisition. The app is the
scoreboard and the archive; the chat is the arena. Monetise later through
corporate wellness once the loop is proven.

---

## 1. Phases

### Phase 0 — Due diligence & alignment *(this week)*
- [x] Private repo + research (OpenGym landscape, wearables) — done, see docs 04/05
- [x] Business analysis — done, see doc 01
- [ ] Reply to Ben → get the **Figma + full blueprint** (ask explicitly)
- [ ] Call: align on MVP scope, equity conversation, roles. Key questions below.
- [ ] Audit the Figma against this plan; flag what's missing/rubbish/needs room (he asked for it)

**Questions for the call:**
1. Handicap mechanics as he imagines them — self-assessed baseline? Historical?
   (Our v1: self-reported fitness tier → effort multiplier; v2: %HRR-based.)
2. Rep verification expectations — is camera-in-browser acceptable for MVP?
3. Charity pot: who holds the money? (Platform vs. honour-system vs. partner charity)
4. Corporate mode: any live prospects/LOIs? That changes build priority.
5. Equity: what split is he imagining, vesting, IP assignment on the blueprint.
6. Who else is involved? (Nico's role, any other collaborators.)

### Phase 2 — MVP: "the 300 loop" *(~6–8 weeks)*
**Goal: 3–5 real group chats playing weekly.**

Scope:
1. **game-core** (this repo, started): match engine, handicap scoring v1,
   standings, charity pot ledger. Pure TypeScript, fully tested.
2. **WhatsApp bot** via Qalarc Hub (dev/dogfood) → WhatsApp Business Cloud API
   (prod). Commands: create match, pick exercises, log reps, standings, winner.
3. **Slack bot** (Bolt.js): same command surface, slash commands + interactive
   buttons. Slack first for corporate pilots.
4. **Web app (PWA)**: join link from chat → log reps with **camera pose counting
   (MoveNet/BlazePose in-browser)** or manual entry → live match view →
   shareable result card.
5. **Handicap v1**: fitness tier (self-set, adjustable) → effort multiplier.
   Honest, simple, tunable. Ship it, learn, replace with %HRR in Phase 3.

Explicitly OUT: native apps, Apple Messages, cash anything, custom ML models.

### Phase 3 — Effort truth & wearables *(~+8 weeks)*
- **Handicap v2: %HRR (Karvonen)** — score = reps × (your %HRR ÷ your baseline
  %HRR for that exercise). Any BLE chest strap via Web Bluetooth; Apple Watch
  via HealthKit live HR; Android via Health Connect (sync-only, cross-check).
- WatchOS/Wear OS companions (rep counting from wrist accelerometer).
- Season/league structure (the long-arc retention fix).
- Shareable clip generation (auto-cut mid-set footage + result card overlay).

### Phase 4 — Business layer
- Corporate mode: Slack enterprise install, org dashboards, team-vs-team
  leagues, invoicing. **This is the revenue engine.**
- Charity pot mechanics with a partner charity (legal structure first).
- WHOOP/Garmin/Google Health cloud verification (recovery-adjusted handicaps).
- Messenger bot; revisit Apple when/unless an API ever appears.

---

## 2. Architecture (summary — full detail in doc 03)

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│ WhatsApp bot│   │  Slack bot   │   │   Web PWA   │
│ (Hub→Cloud) │   │   (Bolt)     │   │ (React)     │
└──────┬──────┘   └──────┬───────┘   └──────┬──────┘
       └────────┬────────┴─────────────────┘
                ▼
        ┌───────────────┐     ┌──────────────┐
        │  RWF API      │────▶│  Postgres    │
        │  (Hono/TS)    │     │  + Redis     │
        └───────┬───────┘     └──────────────┘
                │
        ┌───────▼────────┐
        │  game-core     │  ← pure TS library: match engine,
        │  (this repo)   │    handicap scoring, pot ledger
        └────────────────┘
```

- **Monorepo** (Bun workspaces): `packages/game-core`, `apps/api`,
  `apps/bot-whatsapp`, `apps/bot-slack`, `apps/web`.
- **Chat adapters are thin** — they translate platform events into the same
  command bus, so adding Messenger later is one adapter, not a rewrite.
- **Match state in Redis** (live standings), **history in Postgres**.
- **Pose counting runs client-side in the browser** (MoveNet via TF.js) — no
  video leaves the device, no GPU bill, privacy story for corporates.

---

## 3. KPIs

| Phase | Metric | Target |
|---|---|---|
| MVP | Groups activated | 3–5 real chats |
| MVP | Matches/group/week | ≥1 |
| MVP | % reps camera-verified | ≥40% |
| Growth | New users per match broadcast (viral k) | ≥0.3 |
| Growth | W4 retention of a group (still playing) | ≥60% |
| Business | Corporate pilots | 2 by Phase 4 |

---

## 4. Coordination note

Another agent is researching this opportunity in parallel — reconcile findings
before the call. This repo is the canonical home for all RWF work product.
