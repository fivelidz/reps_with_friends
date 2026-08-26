# Brainstorm — Element Backlog (run-by-Alexei)

*Every element worth considering, ranked by impact ÷ effort. Status key:
✅ built · 🔨 next · 💡 proposed (needs your sign-off) · 🧊 later*

## A. Core loop (mostly built)

| # | Element | What it is | Status | Note |
|---|---|---|---|---|
| 1 | 300-format match | Any reps, any order, first to target closes | ✅ | Engine + bots + app |
| 2 | Tier handicap v1 | couch 1.5× → athlete 0.85× | ✅ | Self-set; socially policed |
| 3 | Effort handicap v2 | %HRR (Karvonen) vs personal baseline | 🔨 | Engine ready (`avgHrrPct`); needs strap data |
| 4 | Closure bonus | +15 to whoever hits target — urgency without raw-speed dominance | ✅ | Bug found by tests, fixed |
| 5 | Charity pot | Winner directs contributions; no cash to winner | ✅ | Legal structure pending (docs/08 §6) |
| 6 | Taunt engine | Canned lines now; AI-generated later | ✅ basic | Rate-limit + "roast tier" setting 💡 |

## B. Retention arc (the week-3 cliff fix) — 💡 all proposed

| # | Element | Why it earns a place |
|---|---|---|
| 7 | **Seasons** (4-week series, points per match, champion belt) | Long arcs; the single highest-leverage retention element |
| 8 | **Relegation/promotion** (A/B divisions within a crew) | Keeps mid-table meaningful |
| 9 | **Comeback multiplier** (×1.2 when >30% behind, once per match) | Prevents blowout demotivation — the "everyone has a shot" promise, mechanically enforced |
| 10 | **MVP vote** (crew votes best effort, not winner) | Second podium = second reason to show up |
| 11 | **Streak forgiveness** (miss a play-day, keep streak via charity top-up) | Converts guilt into pot money |
| 12 | **Baseline learning** (rolling player baseline from history; anti-sandbagging drift) | Closes the self-reported tier loophole |

## C. Social / viral — 💡 proposed

| # | Element | Why |
|---|---|---|
| 13 | **Result cards as images** (auto-generated, branded, screenshot-worthy) | THE viral artefact — every match end is an ad in the chat |
| 14 | **Mid-set drop-cam** (10s clip capture prompt during verified sets) | Ben's "friends filming friends" — shareable moments |
| 15 | **Spectator mode** (chat-only followers get standings without joining) | Widens the funnel; spectators convert |
| 16 | **Crew vs Crew challenges** (two group chats, one match) | Cross-chat growth; corporate team-vs-team |
| 17 | **Public ladder opt-in** (crews can publish their season to a web ladder) | Content/SEO; Ben's publicity wave lands somewhere |

## D. Corporate (the quiet business) — 💡 proposed

| # | Element | Why |
|---|---|---|
| 18 | **Org leagues** (Slack workspace install, team-vs-team seasons) | The sellable unit |
| 19 | **Employer-funded pots** (company puts in the charity pot) | Legally cleanest pot structure per docs/08 — and HR loves it |
| 20 | **Admin dashboard** (participation, effort trends — NOT individual health data) | The renewal argument; privacy-safe aggregate only |
| 21 | **Onboarding-as-a-service** (we run the first month's season for a client) | Services revenue while product matures |

## E. Verification depth — from docs/05 phasing

| # | Element | Status |
|---|---|---|
| 22 | In-browser camera counting (MoveNet) | 🔨 lane 7 activates after app ships |
| 23 | BLE HR strap via Web Bluetooth | 🔨 same |
| 24 | Apple Watch live HR / HealthKit | 🧊 Phase 3 |
| 25 | WHOOP/Garmin cloud cross-check + recovery-adjusted handicap | 🧊 Phase 3 |

## F. Wilder cards 🧊

- **Referee review** (crew votes on a flagged set; video never leaves device, verdict only)
- **Exercise NFT-free "belt" system** — physical trophies shipped to season champions (real-world stakes, zero crypto)
- **Radio mode** — Ben-curated workout playlists with his drumming on rep-count cues (the Silverchair lever used *in-product*, not just PR)
- **Charity championship** — inter-crew annual, sponsored pot, media story

---

## G. Second wave — proposed 27 Aug (post-prototype, from live build learnings)

| # | Element | What | Why it earns a place | Status |
|---|---|---|---|---|
| 26 | **Rematch button** | One tap on a result card → next match, same crew, same settings | The cheapest retention mechanic that exists; momentum at peak interest | 💡 |
| 27 | **Monday digest** | AI-written weekly recap card auto-posted to the chat (results, MVP, nemesis update, pot total) | Re-opens the loop every week without anyone lifting a finger; uses the AI layer we already run | 💡 |
| 28 | **Nemesis system** | Auto-detect each player's closest rival from head-to-head record; show on profiles and result cards | Gives every player a personal storyline, not just the leaders' | 💡 |
| 29 | **Personal records** | PR detection per exercise with celebration cards | Solo-progress layer for the non-competitive half of users | 💡 |
| 30 | **Photo finish** | Special result card + slow-motion replay styling when top two finish within 5% | Manufactures shareable drama from close matches | 💡 |
| 31 | **Ghost race** | Solo mode: race your own past performance (your last match's pace as a ghost bar) | Fills the gap between play days; handicap v2 makes it effort-fair | 💡 |
| 32 | **Guest slot** | Account-less one-match visitor joins via link (no profile, no history) | Removes the last onboarding friction for that one hesitant mate | 💡 |
| 33 | **Charity all-time ladder** | Crew leaderboard by total charity directed, all-time | Makes the giving competitive too; corporate loves this number | 💡 |
| 34 | **Roast-tier setting** | Per-crew banter intensity: gentle / standard / feral (gates the AI taunt engine) | Taunting is a feature — but consented. Also the corporate-safe switch | 💡 |
| 35 | **Adaptive equivalents** | Seated/low-impact exercise variants mapped 1:1 in the exercise library | Accessibility + older family members in "friends, family" mode | 💡 |
| 36 | **Warm-up predictions** | Before `start`, everyone predicts the winner; correct calls earn a season point | Pre-match engagement + social pressure to show up | 💡 |

**Recommended first four from G:** 26 Rematch, 27 Monday digest, 30 Photo
finish, 28 Nemesis — one per job (retention, re-engagement, drama, identity),
all cheap on the existing engine.

---

## My recommendation for sign-off

Build next (after app polish): **7 Seasons, 13 Result-card images, 9 Comeback
multiplier, 19 Employer-funded pots** — one from each family, all cheap, all
compounding. Everything else waits for real users.

**What I need from you:** thumbs up/down per family (A–F), or line edits on
specific elements. The 💡 items shape the next two build sessions.
