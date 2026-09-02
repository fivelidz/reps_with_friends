# Changelog — RWF app (apps/figma-app)

Ben's complete Figma design (65 screens) with the real game engine behind the
core loop. Deployed at `rwf.qalarc.com/figma-app` — installable PWA, works
offline. Status facts mirror the wiki (`/wiki` → status).

## POWER-UP SYSTEM v2 — 2 Sep 2026 — "draft-from-3, points, expiry, dual deadline"

Founder spec: "powerups selected from a set of three… reroll by adding points
to the pot… favour those coming last… cards can expire… reps as a time
deadline too… points in lieu of money — bought later after trialing."

### Points (engine `FLOW-05b` — trial currency, NO money in v1)
- `player.points` starts at **500**; every debit/credit is a reason-tagged
  ledger entry (`addPoints` / `removePoints` / `pointsLedger`: reasons
  `reroll`, `double_down`, `photo_finish`). Commented as trial-first: points
  become purchasable post-trial, deliberately unwired from any payment rail.
- Battle header gains a **◆ PTS chip + KITTY chip**; the arsenal shows the
  balance + reroll price ladder.

### 14 card kinds (4 launch + 10 new — full table in engine.js comments)
- **Second Wind** (rare): comeback ×1.2 → **×1.5** for 15 min.
- **Anchor** (rare): 24h wall — blocks steals FROM you (doesn't break;
  thief keeps their card), **vetoes rival freezes**, bounces handicap swaps.
- **Sprint** (common): next **3 logs ×2** (steal transfers never burn charges).
- **Rabbit's Foot** (epic): next draft **guaranteed Rare+** (45/35/20).
- **Sandbag Detector** (common): leader's next 3 logs flagged `revealed` (public).
- **Handicap Swap** (epic): swap tier multipliers with the leading rival for
  1 day — the ledger re-scores at the new tiers, auto-reverts on expiry.
- **Pit Crew** (common): next **0-rep day keeps the streak** — consumed at
  day close, recorded on the day result (`pitCrewSaved`).
- **Photo Finish** (rare): passive — **+25 pts** if you WIN by <5% margin
  (settles at match close, card consumed).
- **Double Down** (epic): next log **×3** — activation pays **50 pts to the kitty**.
- **Wildcard** (legendary): **copies the last card played against you**
  (steal/swap/detector fuel it; refuses while nothing has).

### Draft-from-3 + reroll
- `draftOptions(match, playerId, {count, at, rng, curve})` → 3 face-up
  options, stored as a pending draft. Triggers: **match start + every day
  close** (mates auto-pick; you choose in the new draft sheet — 3 cards,
  tap to pick, **REROLL** button, expiry "LASTS 24h/6h" badges).
- **Catch-up curve**: rarity odds shift with how far behind you are by raw
  reps — behind 0 → base 50/30/15/5, behind 100% → **10/50/27/13**. Linear,
  clamped, **injectable** (`draftOptions({curve})`), statistically tested
  with a seeded LCG (n=4000).
- **Reroll** pays points **TO THE KITTY** (grows the pot): **50 → 100 → 200**
  per player per match, then holds. Refused honestly when broke. Reps-cost
  reroll noted as TODO in code.

### Expiry
- Every granted card carries `expiresAt` (default 24h; sprint 6h, second
  wind / double down / wildcard 12h). `sweepExpired` drops dead cards
  (powerLog audit), reverts lapsed tier swaps, releases stale drafts —
  runs at each day close. Pre-v2 cards (no `expiresAt`) never sweep.
  Expiry badges (`24h LEFT`) on the arsenal + inventory sheet.

### Dual deadline
- `config.deadline = { reps, time }` — **EITHER fires**: reps target
  reached (as before) OR `time` passes → `closeIfPastDeadline` freezes the
  match → winner by **adjusted standings, no closure bonus**. `deadlineMode:
  "hard"` matches never roll their deadline (daily.settleDay completes them
  via `state.settleMatchClose`, season result + photo finish settle);
  day-mode matches keep the 21:00-AEST roll convention.

### Tests (all green, combined tree incl. the SQD wave)
- `engine.test.js` **49** (was 23): points ledger, draft/reroll economy +
  escalation + kitty, catch-up curve exact + statistical, expiry sweep +
  tier-swap revert, dual deadline both closures, every new card + its counters.
- `e2e.mjs` **122** (was 98): wallet 500 → reroll → 450, kitty growth,
  draft sheet pick + expiry badges, points chips on the battle header.
- `e2e-daily.mjs` **74** (was 62): day-close drafts, pit-crew save on a
  0-rep day, hard-deadline completion via the ticker (adjusted winner).
- `e2e-squads` 90 / `e2e-sw` / `e2e-demo` 48 — untouched suites, still green.

## SQD + SFX wave — 2 Sep 2026 — "multi-squad dashboard + local audio"

### Multi-squad dashboard (`squads.js` — new module, new screens)
- **sqd-001 — tabbed dashboard**: one tab per squad; squad name + `SQD-`
  code, leaderboard with position chips, and your standing THREE WAYS —
  **from top / above 2nd / above last** (green ahead, red behind), streak +
  points balance. A squad IS its own battle (own match, own crew), so the
  same reps count in every squad you're in — the founder's rule.
- **sqd-002 — create squad**: name, pick mates, pick target → live squad
  battle, every member starts with 200 house points.
- **Cross-squad logging**: the quick-log sheet gains an "ALSO LOG TO…"
  multi-select when you're in squads — one effort, credited in every ticked
  battle. FAIRNESS NOTE (in-app + code): intentional client-side
  double-credit; a server dedupes/normalises later.
- **Wagers (state-layer)**: propose (description + points) → per-player
  agreement flags → ALL agree → **ACTIVE** → points **escrow-on-close**:
  when the squad battle completes, last place pays the winner (lazy,
  idempotent settlement on dashboard render). House points only, never cash.
- **Last-place notice**: on your squad tab when you're last — cheeky, never
  mean ("42 REPS OFF THE PACE — COMEBACK ARMED"), surfaces the comeback ×1.2
  and what the active wager means for last place.
- **Home**: `BATTLES | SQUADS` segmented tabs on every home screen.
- Squad house points (200, wager escrow) are separate from the engine's
  power-up points (500, reroll kitty) — two economies, both trial currency.

### SFX — local audio generator (`sfx.js`, zero audio files)
- WebAudio synthesis, lazy AudioContext (first gesture), master gain 0.3.
- 13-sound catalogue on `window.rwfSfx.play(name)`: tap / primary / log
  (pitch rises with your combo) / deal / flip / play / win / lose / pot /
  tick / dz (heartbeat) / error / swipe. `apps/board` calls
  `window.rwfSfx?.play(name)` — same names.
- EVERY button wired via one delegated click listener (class/context rules)
  + specific hooks: log combos, power-up draft (deal/flip/play), charity-pot
  clinks, deadline tick (final minute) + danger-zone heartbeat (DOM watcher,
  no daily.js coupling).
- Mute: header `SFX` tool + Settings → Appearance → Sound effects, persisted
  at `rwf.sfx.muted`.
- MANUAL LISTEN (headless can't hear): open the app, tap around — log two
  reps in a row (pitch climbs), open a draft (whisper) and pick (snap),
  activate a power-up (arpeggio), add to a pot (chip clink ×2), let a battle
  hit the danger zone (tick + heartbeat).

### Tests
- `e2e-squads.mjs` (new, own ports 4185/9228): 90/90 — stub AudioContext
  proves every interaction fires nodes; squads end-to-end (create ×2,
  dual-credit log, standings vs engine math, last-place notice, wager
  propose→nudge→ACTIVE, escrow settlement), zero console errors.
- Existing suites: e2e-daily 62/62 ✓, engine parity 49/49 ✓; e2e.mjs's two
  power-up-arsenal assertions moved with the concurrent power-up draft wave
  (4 → 14 kinds, new shield copy) — owned there.

## v1.0.0 — 31 Aug 2026 — "finalised prototype"

The version the founder carries on his phone.

### Live in this build (the real core loop)
- **The game engine** (`engine.js`, the game-core port): tier handicaps
  (couch ×1.5 → athlete ×0.85), effort-adjusted scoring (RUF), first-to-target
  closure + 15-point closure bonus, comeback ×1.2 (>30% behind, once per
  match), charity pots (winner directs, never receives), the 4-week season
  ladder (3/2/1 + MVP).
- **22 screens wired to real state** (localStorage `rwf.figma.v1`): onboarding
  → create → waiting room (crew code + `link <CODE>` chat grammar) → live
  battle → quick-log (3 taps) → result/podium/pot → rematch → season ladder →
  profile with real lifetime stats. Screens still carrying mock content wear
  an honest DEMO chip.
- **Power-ups (FLOW-05)**: Lightning ×3 (10 min window), Rep Steal (10%, shield-
  blockable), Shield, Time Freeze (+30 min). One random card per player per
  battle; DEV GRANT stands in for the store.
- **The temporal loop (FLOW-06/07)**: play-day deadlines on the 9PM AEST group
  clock with local-time dual display, 3-level danger zone (3h/1h/30min), and
  the nightly settle — every play day crowns a daily winner with a recap +
  moments.
- **Demo mode (new in v1.0.0)**: `▶ WATCH THE DEMO` (home screen, index,
  About) or the deep link `/figma-app/?demo=1` — a ~75-second self-playing
  tour of the real app on a shadow state: onboard → create → live battle →
  comeback → lightning → danger zone → close → result → rematch → daily
  recap → season → end card. Pause / skip / 2× speed; the user's real save is
  never touched.
- **Offline + installable**: PWA manifest, service worker caches the whole
  static+vendored bundle. **Stale-cache fix**: the SW cache name now derives
  from a build stamp (`version.js`, regenerated every deploy with git hash +
  UTC minute), the SW self-checks on activate, the page pings
  `registration.update()` on load + every 30 min, and old tabs get an
  `APP UPDATED — RELOAD` toast on `controllerchange`.
- **About screen** (Settings → About, or the ℹ️ row on Profile): version,
  build hash + date, what's real, link to the wiki.
- **Camera verify honesty note**: pose counting (MoveNet) lives in the
  prototype app — the in-app button explains rather than fakes.

### Test suites (all green at release)
- `e2e.mjs` — full-flow headless Chromium walk (onboard → create → battle →
  comeback → power-ups → close → rematch → ladder → profile → overflow audit)
- `e2e-daily.mjs` — the temporal loop (deadlines, danger zone, nightly settle,
  daily recaps) with the time-travel clock
- `engine.test.js` — the engine port unit tests
- `e2e-demo.mjs` *(new)* — the demo driver end-to-end: caption sequence,
  state transitions, shadow-state isolation, zero console errors
- `e2e-sw.mjs` *(new)* — SW update + cache-bust + offline verification

### Known limits (honest)
Single-device state (no backend sync yet — blocker T5), no auth (T4), wagers
feature-flagged behind the legal opinion (L1), corporate views demo-scoped,
mates are simulated (the bots bridge exists, but the app↔API wire is the next
unblock).

## Earlier milestones (pre-versioning)

- **FLOW-07** — daily winners: nightly settle, recap screens, streaks, next-day
  teaser. 62 e2e assertions.
- **FLOW-06** — the temporal loop: play-day deadlines, dual clock, 3-level
  danger zone, DZ3 screen wash, pulsing LOG NOW.
- **FLOW-05** — power-ups: inventory sheet, card detail, activations, steals +
  shields, lightning windows, freeze deadlines.
- **FLOW-04 and earlier** — the 65-screen Figma port, the engine integration,
  tier handicaps, charity pots, the season ladder, camera-verify note, PWA +
  service worker, phone walkthrough (on-device, Chrome, 0 console errors).
