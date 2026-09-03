# Source of Truth Reconciliation — RWF build vs Ben's master spec

*3 Sep 2026. Against: design/references/90e253a1…pdf (v2026-09-02, Narwhal Ent
Pty Ltd, 36pp, 299 inventoried screens). That PDF is now THE product spec —
this doc maps it to our build and drives the v4 work.*

## The headline changes (what the SOT supersedes)

| Area | SOT (canonical) | Our build | Action |
|---|---|---|---|
| **Battle model** | DAILY battle: adjusted target **200 reps**, **first eligible to target = Daily Win**; battle CONTINUES — later completers bank the day (streak/participation/history) | 300-format matches, first-to-close ENDS match, winner = highest adjusted | **Engine v4** — daily model |
| **Seasons** | **Weekly default** (Monthly optional, Major future); **1 Daily Win = 1 season point**; stakes resolve at SEASON end | 4-week seasons, 3/2/1 + MVP points | **Engine v4** |
| **Stakes** | **Dinner / Dare / Deliverable / Charity Pot** — agreed before season, resolve after; Charity = contributions + winner directs + disclosed platform fee | Charity pot only, points-in-lieu | **Engine v4** (stake objects, points stay as the trial currency) |
| **Rep Steal** | Activator GAINS 10% equivalent — **target keeps their score** (pure gain, not transfer) | Ours transfers reps away | Fix semantics |
| **Group Shield** | Protects the group from an agreed **daily failure consequence** (exact scope open) | Ours blocks steals | Align to SOT (streak-protection reading) |
| **Power-up canon** | 4 launch: Lightning ×3/10min, Rep Steal, Group Shield, Time Freeze. Post-launch set: Combo Boost, Double Down, Assist Boost, **Surprise Bomb** (+20 reps/10min), **Rescue Rope** (50-rep credit to inactive mate), Shield Bash | We have 14 incl. ~8 of these + extras | Reconcile names/effects to canon; extras become "experimental/preserved" |
| **Modes** | Individual / **Team (min 2/side, 3v2 allowed, scoring open)** / Corporate | Individual + seeded corporate console | Team mode scaffold |
| **Scoring term** | **RUF internal, "reps" in UI** (interim ruling) | mixed | Align copy |
| **Brand** | Near-black + **gold/yellow primary** + purple secondary; thick rounded cards, bold display, hero numerals; loot-style presentation; **nav: Battle / Feed / central Log / Power-Ups / Profile**; "Join the Battle. Win the Day." | gold theme exists (validated!) | Gold becomes default skin of the SOT app |
| **Company** | **Narwhal Ent Pty Ltd** | "Ben [surname TBD]" in contract | Update contract parties |
| **Tech** (open Qs) | Flutter? NestJS+Postgres+Redis+AWS? Cognito? — UNLOCKED questions | Bun/PWA/Hono — our velocity argument | Founder+Ben decision; our stack remains the fastest prototype path |

## What we have that the SOT wants (validated, keep)

Dual-surface architecture (hero app + chat layer, app authoritative — matches
§1.3 exactly) · bots on 3 transports · charity pot as preferred money mechanic
· power-up cards + draft/catch-up (SOT Q240-242 are OPEN — our draft/expiry
system is a live answer to propose) · camera verification (§2.11 proof
direction) · PWA/Android presence · the wiki/docs culture.

## The build order (this wave)

1. **Engine v4** (game-core + app engine): daily-200 model, first-to-target
   Daily Win, bank-day continuation, weekly seasons w/ 1:1 points, stake
   objects (4 types, season resolution, agreement states), SOT power-up
   semantics (steal = pure gain; shield = streak protection), Surprise Bomb +
   Rescue Rope + the post-launch set, team-mode scaffolding (scoring left
   pluggable per SOT "UNCLEAR"), RUF internal/reps UI. All parity-tested.
2. **App v4** (the SOT app): 5-tab nav (Battle/Feed/Log/Power-Ups/Profile),
   black-gold default, Battle Home (adjusted target, progress, clock,
   leaderboard, activity), quick-log flow, the winner/recap family (You Won
   The Day / Other Player Won / Target Completed / Failed Day / streaks),
   Season Hub + stake setup/resolution, group creation wizard per §4.1
   (24 steps), join flow per §4.2.
3. **Contract update**: Narwhal Ent Pty Ltd as the engaging entity.

## Open questions we can answer with working software (propose to Ben)

- Q240-242 (power-up economy): our draft-from-3 + catch-up + expiry is LIVE —
  propose it as the answer
- Q216 (RUF/reps): implemented as ruled — RUF internal, reps UI
- Q222 (200 target): configurable, default 200 — shipped
- Q223 (1:1 points): shipped as default

## Still founder/Ben decisions (SOT §6 — not ours to guess)

Handicap formula details (Q217-221), team scoring (Q229-231), brand lock
(Q270-275), monetisation (Q276-282), platform (Q263-269, 292-299).
