# Lane 2 — App (phone-first PWA)

**Mission:** the app is home base — profile, crew, match creation, rep logging,
live standings — and the *link-to-chat* flow that pulls the bots into the
user's existing group chats. Phone-first, zero-friction onboarding.

**Owns:** `apps/web/`

## Current state
✅ **BUILT (Aug 2026).** Full flow live at `/app`: onboard → crew (create/join,
6-char code) → new match (exercises/target/play-days) → link-chats screen
(big code + copy, WhatsApp/Slack cards, demo-crew button) → match view (live
standings, rep logging + stepper, canned taunts, crew feed, camera-verify
placeholder logging `verified:false`) → result (champion card, final standings,
charity pot picker) → profile/history. State in `localStorage rwf.state.v1`.
Build: `bun build apps/web/src/main.ts --outdir apps/web/dist --minify`.
Tests: `bun apps/web/test/flow.ts` (21 checks) and `bun apps/web/test/browser.ts`
(29 real-Chromium checks, 0 console errors). See `apps/web/README.md`.

## Product flow (build exactly this)
1. **Onboard** (one screen): name + fitness tier (couch/casual/fit/athlete). Persist localStorage.
2. **Crew**: create a crew (get a 6-char code like `KX4T9C`) or join by code.
3. **New match**: pick exercises (pushup/squat/situp/burpee/lunge), target (100/300/500), play days.
4. **Link chats** screen (the friction-killer): WhatsApp + Slack cards →
   "Add the bot to your group, then send `link <CODE>`". Show the code big, with copy button.
5. **Match view**: live standings (adjusted score, raw, progress bars, verified %),
   log-reps panel (exercise chips + stepper), taunt button (canned lines), end→result card + charity pot picker.
6. **Profile/history**: matches played, wins, total reps, tier.

## Tech
- Vanilla TS + handcrafted CSS. Bundle: `bun build apps/web/src/main.ts --outdir apps/web/dist --minify`.
- Import `@rwf/game-core` directly (bun resolves workspace TS). Run engine client-side; persist to localStorage (key `rwf.state.v1`).
- Design: import `../../design/tokens.css`; fonts at `/design/fonts/` (served). Mobile-first (max-width 480px frame on desktop, full-bleed on phone).
- Camera rep-counting: NOT this lane — show a "camera verify (coming)" button that logs `verified:false`.

## Definition of done
`bun build` succeeds; served at `/app` (via root `serve.ts`) the full flow works
on a phone-width viewport: onboard → crew → match → link screen shows code →
log reps → standings update live → result card. No console errors.
