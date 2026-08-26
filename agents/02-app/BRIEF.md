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
Tests: `bun apps/web/test/flow.ts` (30 checks) and `bun apps/web/test/browser.ts`
(35 real-Chromium checks, 0 console errors). See `apps/web/README.md`.

✅ **BACKLOG + AI DEMO (Aug 26 2026).** Six features added on top:
1. **AI match narrator** — `🎙️ NARRATE THE MATCH` on the match screen POSTs a
   standings summary to `/api/ai` (serve.ts → GLM) → 2-3 sentence commentary in
   a lime callout; last narration cached per match (survives re-renders).
   Client: `src/ai.ts` (AbortController timeouts, null-on-failure).
2. **AI taunt composer** — taunt button asks the AI for a fresh taunt aimed at
   a random opponent's name + stats; falls back to the canned `TAUNTS` list on
   failure/timeout (3s). Button shows "COOKING A TAUNT…" while in flight.
3. **Seasons UI** — new "Season" bottom-nav tab (`#/season`, `src/screens/season.ts`):
   start a 4-week season, week N/4 progress, ladder (points/played/wins/MVP),
   🔥 streak badges per player, "FORGIVE STREAK — $2 TO POT" when today is a
   play-day you haven't logged, 🏆 champion belt card + START NEXT SEASON when
   ended (past seasons → champions list). Matches that complete while a season
   is live score: win +3, played +1, MVP +1.
4. **Comeback badge** — players >30% behind the leader (once per match) show
   `⚡ COMEBACK ×1.2 ARMED` on their standings row; the next logged entry is
   flagged `comeback:true` (`RepEntry.comeback`) and toasts.
5. **MVP vote** — result screen player chips, one local vote per match
   (`state.mvp[matchId]`), locked display + 🏅 badge; flows into the season
   ladder via `recordMatch` `mvpPlayerId`.
6. **Result card image** — 1200×675 canvas (`src/card.ts`: #0a0b0d, lime,
   Space Grotesk, champion block, standings bars, pot/MVP lines) previewed on
   the result screen; SAVE CARD downloads a PNG via `canvas.toBlob`.

**Lane-6 bridge:** `src/engine-extras.ts` re-exports comeback/season/baseline
(`COMEBACK_MULTIPLIER`, `comebackEligible`, `applyComeback`, `createSeason`,
`recordSeasonMatch`, `seasonLadder`, `forgiveStreak`, `endSeason`,
`updateBaseline`) from `src/engine.ts` **when lane 6 lands them**, with
runtime-detected local fallbacks (identical behaviour) until then — the build
stays green mid-flight and a rebuild auto-upgrades to the real engine fns.
⚠️ WHEN LANE 6 LANDS: rebuild and check the bun "will always be undefined"
warnings for engine-extras disappear; if their signatures differ, adjust ONLY
the delegation blocks in engine-extras.ts. Scoring note: the ×1.2 multiplier
itself is engine-side (lane 6) — the app flags entries; current engine ignores
the flag, so scores are unchanged until then.

localStorage: `rwf.state.v1` unchanged (added optional `season`,
`seasonHistory`, `mvp` fields — old states normalise on load).

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
