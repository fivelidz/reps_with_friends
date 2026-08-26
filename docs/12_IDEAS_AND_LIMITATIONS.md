# RWF — Ideas & Limitations (honest register)

*Companion to docs/11. What we can do, what we can't — yet.*

## Ideas — the full pile (status)

### Live now (built)
- 300-format match + effort handicap + closure bonus + charity pot
- Comeback ×1.2 (anti-blowout), seasons + ladder + MVP + streaks + forgiveness, relegation
- Anti-sandbagging baseline drift (HR + volume paths)
- WhatsApp + Slack bots, one command surface; spectator mode; crew-vs-crew challenges
- Branded result cards (SVG from bots, PNG from app)
- Phone-first app with link-to-chat flow; AI narrator + AI taunts
- Ops + corporate console; AI guide on the site
- AI layer on GLM-5.3, server-side key, fallbacks everywhere

### Next (cheap, high-leverage)
- **satori/resvg OG result cards** — unfurl previews when card links are shared in chats (docs/10 #1 rec)
- **wa.me / Slack deep links** in every broadcast — tap-to-join
- **ICS play-day calendar** — play days land in the phone calendar with reminders
- **Season auto-scheduling** — next match auto-created on play day
- **Pledge ledger → Stripe Payment Links** at pilot (docs/10 §1)
- **Slack App Directory submission** at pilot — corporate front door

### Bigger swings (post-pilot)
- Camera rep counting (MoveNet in-browser — lane 7 brief ready)
- BLE HR straps via Web Bluetooth → %HRR handicap v2 live
- Drop-cam clips (ffmpeg cut + overlay) — the shareable moment engine
- Public web ladder for opted-in crews — where Ben's publicity wave lands
- Radio mode — Ben's drum tracks as rep-cadence cues
- Corporate: SSO/HRIS sync, Teams channel, wellbeing aggregate export (Sahha playbook)

## Limitations — the honest list

### Hard (external constraints)
1. **WhatsApp Cloud API group messaging** — likely 1:1 only [VERIFY docs/08 §4]. Our whole loop is group-native via whatsmeow. Production may need per-player DMs. This is the #1 architectural unknown.
2. **whatsmeow ToS risk** — fine for prototyping on our own number; every external group accelerates the need to migrate. Rule: disposable number only.
3. **Apple 3.2.2(iv)** — no charity collection inside a native app. Pot payments are web-only forever.
4. **Charity-wager legal structure** — unopinioned until a lawyer writes one (AUD 3–10k). Until then: pledge-only or employer-funded pots, zero "bet/wager" vocabulary.
5. **Apple Messages** — no bot API. Not on the roadmap.
6. **Strava API** — paid app creation + 10-athlete cap until review. Not worth it yet.

### Soft (prototype realities)
7. **Single-machine, single-process** — serve.ts is one Bun process; bots are separate; no auth on anything. Localhost demo only until deployed behind Cloudflare + auth.
8. **In-memory/file state** — `.data/*.json`, localStorage. No Postgres/Redis yet (design ready in docs/02 §2).
9. **App↔bot state is separate** — the app's localStorage match and the bots' JSON store don't sync yet; the crew `link` code is the bridge concept, not yet a shared backend. First real API unifies this.
10. **AI costs/latency** — GLM-5.3 via secondary key (primary out of balance); 3–25s responses; every consumer has fallbacks. Budget monitoring needed before any public demo.
11. **Rep verification is manual/honour-system** — camera counting not yet wired (lane 7 dormant). Verified flags exist; the verifier doesn't.
12. **Corporate data is seeded** — hub corporate tab is a realistic mock over 3 orgs; no real org API behind it.
13. **No auth/accounts** — names are free-typed; identity is per-device. Fine for discovery, blocks real multi-device play.
14. **One engine consumer lag** — bots' standings math duplicates engine logic in serve.ts `/api/state` (simplified multiplier) — acceptable drift for the console, unify when the real API lands.

### Known-unknowns
- WhatsApp conversation pricing at scale (modelled: ~AUD 13/mo @10 groups — verify at pilot)
- Whether %HRR handicaps feel fair in practice (needs real straps on real mates)
- Retention curve shape — no real users yet; everything retention is hypothesis until 3 groups play 4 weeks
