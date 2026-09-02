# RWF — Timeline & Achievable Goals

*2 Sep 2026 · v1.1 baseline. The plan pairs with the contract milestones
(docs/RWF_Contract_Scope.pdf) — dates assume Ben engages this week.*

## Where we are (v1.1, today)

Done: engine + parity tests · v1 app (65 screens, power-ups, DZ, daily winner,
seasons) · **v2 board-game app** (poker-table × track, cards, kitty, 13
themes) · points currency + draft-from-3 + reroll-to-kitty + catch-up curve ·
multi-squad dashboard + wagers · SFX layer · WhatsApp/Slack bots · Beeper
transport (needs token) · Android app on the phone · avatar systems (Geno
mocap, wardrobe, frogs, anyCreature, img2threejs foundry verdict) · public
coverage hub (rwf.qalarc.com/v1).

## Weeks 1–2 — M1: One system (contract Milestone 1)

- [ ] App↔API↔bot state unification (T5) — apps/api is the single store
- [ ] Magic-link auth (Resend) — identity across phone/bots
- [ ] v2 board app as the primary client (v1 archived, kept for progression)
- [ ] Re-sync the v2 engine fork with the draft/points API (banner'd TODO)
- **Goal: a crew created on a phone plays a match visible from a WhatsApp
  group — no orchestrator.**

## Weeks 3–4 — M2: Always-on + real verification (Milestone 2)

- [ ] Bots on GMKtec 24/7 (Slack tokens → `~/.config/rwf/`; WhatsApp via Hub tunnel or Cloud API decision)
- [ ] Beeper live (founder mints token — 3 min) → Telegram/Discord reach free
- [ ] Camera verification hardened with 3 real users (MoveNet accuracy log)
- [ ] Cross-squad log dedupe rule (server-side fairness)
- [ ] Sound pass on v2 (the SFX module is wired; tune the catalogue)
- **Goal: 72h uninterrupted, 2 groups playing without intervention.**

## Weeks 5–8 — Pilot (contract Pilot milestone)

- [ ] First 3 real crews (mates + one corporate-friendly group)
- [ ] The 5 product decisions implemented per Ben's calls (fairness, platform,
      rhythm, power-ups-in-MVP, brand — docs/24 §9 has both directions ready)
- [ ] Weekly digest shipping to real chats
- [ ] Points economy tuning: reroll costs, catch-up curve steepness, kitty
      flow — from real play data
- [ ] Avatar identity pass: squad tokens → generated avatars (img2threejs
      foundry lane) or species-as-tier (frogs)
- **Goal: 3 groups, ≥2 matches/week each, W2 retention ≥60%.**

## Weeks 9–12 — Post-pilot: the money + the store

- [ ] Points→money decision from pilot data (buy points after the trial
      verdict — the founder's stated sequence)
- [ ] Charity pot legal opinion → employer-funded pots first
- [ ] WhatsApp Cloud API migration (groups verdict) or per-player DMs
- [ ] Corporate pilot (Slack org install — the revenue engine)
- [ ] Public launch ready: store listing, the Silverchair publicity wave
      landing on /v1 + a public ladder (element C17)

## Standing goals (every phase)

- All suites green on every push (currently: 49 engine + 122 + 74 + 90 + 56
  board + 98 app + bots + styles — ~600 checks)
- One new real-user insight captured per week (the wiki's ops page is the log)
- The blockers register (docs/15) reviewed weekly; nothing red for >2 weeks

## What would make each phase FAIL (be honest early)

- M1: state unification sprawls → cut v1 parity, ship v2-only
- M2: Hub uptime → WhatsApp Cloud API decision early
- Pilot: nobody plays → the handicap/comeback numbers need tuning from
  figma-app telemetry; power-up economy rebalance
- Post-pilot: legal stalls charity pots → employer-funded pots are the bridge
