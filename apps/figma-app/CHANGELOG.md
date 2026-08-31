# Changelog — RWF app (apps/figma-app)

Ben's complete Figma design (65 screens) with the real game engine behind the
core loop. Deployed at `rwf.qalarc.com/figma-app` — installable PWA, works
offline. Status facts mirror the wiki (`/wiki` → status).

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
