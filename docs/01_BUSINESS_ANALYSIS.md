# Reps With Friends — Business Potential Analysis

*Prepared for Alexei Brown · 26 Aug 2026 · Source: intro email from Ben (via Nico)*

---

## 1. Who we're dealing with

**Ben — founding member and drummer of Silverchair.** Multi-platinum ARIA-winning
Australian band. The name-drop is relevant, not vanity:

- **Publicity lever is real, especially in Australia.** Mainstream media (ABC,
  news.com.au, triple j, podcasts) will cover "Silverchair drummer launches
  fitness app" — that's a first-wave user injection most startups pay seven
  figures for.
- **Nostalgia demographic = 35–50 year olds.** This maps *exactly* onto the
  target user: blokes in group chats who used to be fit, aren't anymore, and
  rib each other about it. Silverchair's audience is the product's audience.
- **Caveat:** celebrity attention is a one-shot spike, not a retention engine.
  It buys the top of the funnel; the handicap system and chat presence have to
  keep them.

**Signal quality of the email itself:** high. He's been refining for a year,
produced a production-fidelity Figma + full blueprint (design risk largely
retired), explicitly invites pushback ("what's rubbish and what deserves more
room"), and opens with equity-for-work. This is a collaborator-shaped founder,
not an idea guy shopping for hands.

---

## 2. The product, stripped to its load-bearing ideas

| Idea | Why it matters commercially |
|---|---|
| **The "300" format** — any reps, any order, any of the agreed exercises, first to 300 total | Brilliantly simple game loop. Self-balancing (you choose your mix), zero setup friction, instantly understandable in one chat message. |
| **Handicap system** — effort & consistency compete, not raw fitness | **This is the moat.** It's the difference between a gimmick and a system. Golf proved handicaps keep weak players paying for decades. Nobody in fitness apps does this well. It's also the hardest thing to get right — which is why it's defensible. |
| **Chat-first distribution** — the game lives in Slack/WhatsApp/Messenger; app is home base | **This is the second moat.** Every match broadcast is an ad seen by the whole group chat. Non-users are spectating the leaderboard within minutes. Near-zero CAC, built-in viral loop. |
| **Pick your days** — groups choose 2–3 days/week, go hard | Anti-burnout by design. Removes the daily-streak failure mode that kills StepBet-style apps. |
| **Charity wagers** — winner directs a pot to charity | Real stakes without gambling regulation (mostly — see risks). Also a corporate-sales hook: companies love "team fitness for charity" narratives. |
| **Taunting as a feature** — banter, filming mates mid-set, before/afters | The content engine. User-generated shareable clips = organic acquisition on top of the chat loop. |

---

## 3. Market position

**What exists:**
- Solo trackers (Strava, Hevy, openGym et al.) — saturated, lonely, no stakes.
- Individual-incentive wagering (StepBet/WayBetter) — cash stakes, individual,
  regulatory baggage, US-centric.
- Live classes (Peloton et al.) — synchronous but anonymous crowds, not your mates.
- Async comparisons (Strava segments, Apple Fitness competitions) — weak,
  pairwise, buried in apps nobody opens for you.

**What's empty (verified via GitHub + market scan):** *small-group, real-time,
handicapped competition delivered inside the group chat where the banter already
lives.* No established player, no serious open-source project (the "gym
leaderboard" OSS space is literally 0-star student projects). The niche is open.

**Adjacent revenue pools:**
- **Corporate wellness** — Ben names corporate mode himself. AU$600+/employee/yr
  wellness budgets; "team vs team 300s with charity pots" is an easy HR sell.
  This is likely the actual business; B2C is the marketing.
- **Charity partnerships** — rev share or sponsorship on the pot mechanics.
- **Sponsorship/brand** — supplement/apparel brands sponsoring pots for the
  35–50 male demographic (notoriously expensive to reach).

---

## 4. What Alexei uniquely brings (leverage in any equity conversation)

1. **The chat-integration capability is already built.** The Qalarc Hub owns a
   working Signal + WhatsApp session with an HTTP API. A WhatsApp bot prototype
   is days, not months. Most teams would stall here on WhatsApp Business
   approval alone.
2. **AI-agent shipping speed.** Rep verification (camera pose estimation),
   banter bots, match narration — all AI-shaped problems, all in our wheelhouse.
3. **Full-stack + infra.** Cloudflare stack, Resend, existing deployment
   patterns across qalarc/tradez properties.

Ben has design + vision + publicity. We have build + distribution plumbing +
AI. That's a complete founding pair, which is exactly what the equity
conversation should price.

---

## 5. Risks & hard problems (ranked)

1. **Rep verification / cheating** — the existential technical problem. If reps
   are self-reported, the game is a lying contest; if verification is annoying,
   nobody plays. **Mitigation (from research):** in-browser pose counting
   (MoveNet/BlazePose, $0, no install) for MVP + heart-rate cross-checks from
   any BLE strap via Web Bluetooth. Good-GYM (MIT) has portable rep-counting
   logic. Handicap scoring via %HRR (Karvonen) makes *effort* verifiable even
   when reps aren't.
2. **Retention after week 3** — novelty decays. The designed retention stack:
   handicaps (always winnable) + chosen days (no streak guilt) + charity stakes
   (real consequence) + chat presence (no app-opening required). Needs a
   season/league structure to give the loop long arcs.
3. **WhatsApp economics** — Cloud API charges per conversation; a chatty match
   bot in a 20-group portfolio could burn real money. Mitigation: batch
   standings (not per-rep), Qalarc Hub for dev, model costs before scale.
4. **Charity-wager legal structure** — "winner picks charity" must avoid being
   classified as a raffle/betting product under AU state law. Needs a proper
   legal opinion before money moves. (Nico's idea is good — it just needs
   structure.)
5. **Apple Messages** — no official bot API. Correct call: skip for MVP, say so
   plainly.
6. **Single-founder dependency** — Ben is design/vision; the build partner
   (us) is the other half. Equity conversation should reflect co-founder
   reality, not contractor pricing.

---

## 6. Verdict

**Strong opportunity. Take the call. Push for the Figma + blueprint.**

- Differentiated product with two genuine moats (handicap system, chat-native loop)
- Design risk already paid down; founder is collaborator-shaped with a real publicity lever
- Sits directly on our existing infrastructure and skills
- Corporate wellness is the quiet, large revenue pool underneath the fun B2C story

**Position for:** co-founder-track equity + build ownership, not a paid build.
The email explicitly invites that conversation — take it.
