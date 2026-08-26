# Lane 8 — Launch & Compliance

**Mission:** everything required to actually ship: app stores, platform
approvals, legal structure. Research now, checklist forever.

**Owns:** `docs/08_LAUNCH_REQUIREMENTS.md`

## Current state — RESEARCH TASK (use webfetch + knowledge, mark [VERIFY])

Produce a phased launch requirements doc covering:

1. **PWA vs native decision** — PWA can ship today (no store); native needed
   for HealthKit live HR + watch apps. Recommend sequencing.
2. **Apple App Store** (when native): health/fitness app guidelines, minimum
   functionality (4.2), HealthKit entitlement + privacy nutrition labels,
   account-deletion requirement, AU pricing tiers.
3. **Google Play** (when native): Health Connect permissions, health apps
   declaration, data safety form.
4. **WhatsApp Business Platform**: business verification, phone number,
   app review scope, per-conversation pricing model (cost ours would incur —
   model a 10-group portfolio playing weekly), template messages for
   re-engagement. Note: Qalarc Hub (whatsmeow) is fine for prototyping but
   ToS-risky at scale — migration trigger point.
5. **Slack app directory**: scopes needed (commands, chat:write, interactive),
   security review thresholds, enterprise grid considerations.
6. **Charity wager legal structure (AU)**: state fundraising authorities,
   ACNC, why "winner directs pot, no cash to winner" likely avoids betting
   classification — and what would break it. Needs real legal opinion before
   money moves; this doc frames the questions.
7. **Privacy**: Privacy Act APPs, on-device camera claim (must be true),
   health data sensitivity, GDPR if global, retention policy.
8. **Costs table**: store fees, WhatsApp conversation costs at 3 scales
   (10/100/1000 groups), domain, monitoring.

## Definition of done
docs/08 exists, phased (prototype → pilot → public), every unverified claim
marked [VERIFY], costs modelled with stated assumptions.
