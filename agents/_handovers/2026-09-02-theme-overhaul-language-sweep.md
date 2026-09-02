# HANDOVER: 13-themes + 12-board — theme-system overhaul + REPS language sweep (2 Sep 2026, PM)

## Shipped

### PART 1 — Language sweep (apps/board — /v2)
- **`kitty` → `the pot`** everywhere (DOM ids, classes, engine fields, comments, test
  strings): `#kitty→#pot`, `.bd-kitty→.bd-pot`, `kittyTotal()→potTotal()`,
  `KITTY_TIP→POT_TIP`, `match.board.kitty→board.pot`, keyframes `bdKittyBump→bdPotBump`.
- **`ante` → `entry`**: `ANTE→ENTRY` (engine export), `board.ante→board.entry`,
  copy "posts a 20-point entry into the pot".
- **Poker copy → board-game/race language**: hero "Cards. Lanes. *The pot.*";
  "A board game that's also a track…"; "Shuffle up & deal"→"Set the board";
  "Dealing"→"Drafting"; "Table night"→"Race night"; "deal the crew in"→"call the
  crew in"; medallion label "KITTY"→"THE POT"; toasts/feed "takes the pot".
  **Chips stay as visuals** — copy now says points ("every log adds points").
- **Theme rename `poker` → `cardtable`** ("Card Table") — felt/chips/cards kept as
  pure visual style, zero card-room jargon in language.
- Same sweep applied to user-facing strings in `apps/hub-public` (/v1 hub), plus
  comments in `serve.ts` / `scripts/build-deploy.sh`.

### PART 2 — Theme overhaul (design/themes.css, 905 → 2256 lines)
The eight V2 themes are now **full design languages**, not token swaps. Each block
carries five layers: TOKENS (+ BOARD EXTRAS: felt/lanes/chips/card faces per theme),
TYPE, SURFACES (fg-\* library), BOARD APP (bd-\* /v2 table), MOTION (named signature
animations, all behind a shared `prefers-reduced-motion` guard):
1. **board · Stadium Board** — floodlit infield + terracotta lane ring, gold scoreboard
   numerals, lane-stripe progress bars, photo-finish tape finish, trophy-pedestal pot,
   stadium-lamp LIVE blink, photo-finish sheen sweep.
2. **mycelial** — asymmetric blob cards (organic per-nth radii), growth-ring bars,
   spore-drift particles on the pot, breathing mycelium core, root-curve feed.
3. **techy · Mission Control** — graph paper + scanlines, `//` telemetry labels,
   `T−` mission clock, corner brackets, leaderboard sparklines, boot-sequence
   staggered reveals, scan sweep, plotting-table with crosshair pot.
4. **track · Track & Field** — signage cap rails, moving lane-paint marquee on the
   battle head, race-bib rank blocks, BIG Anton timing numerals, marshal-flag events,
   lane-numbered track (CSS counters), finish-clock pot (white face, red numerals).
5. **cardtable** — burgundy club felt as pure style: serif small-caps + gold
   hairlines, ornate double borders, chip-edged round buttons (dashed outline
   insets), **cream card faces** with re-pointed rarity inks, candlelit vignette,
   one slow gold shimmer (motion is deliberately calm).
6. **caveman** — wobbled hand-drawn radii (per-nth rotations), rock-strata +
   speckle surfaces, scratched-tally clock underline, carved-bone buttons,
   fire-pit pot with flicker, thud-overshoot deal animation.
7. **n64** — fog wash body, chunky outlines + hard offsets, memory-card corner
   screws (4-corner radial dots), **square avatars/tokens** (character select),
   segmented bars, cartridge gloss buttons, spawn-pop overshoots, bobbing star pot.
8. **goldeneye** — notched clip-path panels, gold dossier mono (wide tracking),
   segmented health-armor meters, reticle brackets pulsing on the leader,
   `[ BRIEFING ]`-style rarity tags, blinking `_` cursor on status, alarm-stripe
   blinking DZ, facility-map grid table, objective-marker pot.

### PART 2b — "On the app" showcase (/styles)
- New **`apps/styles/appdemo.html`** — the v2 app's real `bd-*` markup (home +
  battle phones: track, pot + chip stacks, runner tokens, fanned 3-card hand, boards,
  buttons) loading the REAL `/v2/board.css`, themed via `?t=` (same pre-paint iframe
  pattern as demo.html). `?screen=home|battle|both`.
- `/styles` gains section **"03 · On the app"** (8 themes × home+battle iframes,
  screen switcher), renumbered preview/checks to 04/05; gallery.js builds it
  (`V2_THEMES`, `setAppScreen` hook); verify.js + demo.html regex follow the
  `cardtable` rename.

### PART 3 — /v2 picker
- `board.js` THEMES reordered: the eight V2 skins first (**board = default**),
  athletic names ("Stadium Board", "Track & Field", "Mission Control", …), then the
  original five. Picker switches skins live (verified per-skin).

## Verified (all green, run from repo root)
- `bun apps/board/e2e.mjs` → **65/65** (incl. new: all 8 skins apply live from the
  picker + distinct felt signatures on the real app; shots `skin-*.png` in
  apps/board/shots)
- `bun apps/board/geom.mjs` → **27/27**
- `bun apps/styles/e2e.mjs` → **100/100** (incl. 106/106 in-page verify, 8 appdemo
  iframes render, **zero console errors**, geometry probes: pot centred Δ≤0.5px,
  4 tokens in the felt, card hand fully inside the phone, no horizontal overflow;
  **signature distinctness: every theme pair differs in ≥4/10 structural dims**
  — worst pair board↔track = 4; screenshots `2x-appdemo-<theme>.png` + `app-strip-both.png`)
- `python3 scripts/styles_contrast.py` → **ALL PASS** (AA matrix, tokens unchanged)
- `rg -in "kitty|poker" apps/board apps/styles design/themes.css apps/hub-public/index.html serve.ts scripts/build-deploy.sh` → **0 hits**
- Pixel evidence (can't view images in that session — sampled instead): all 8
  appdemo table regions render distinct mean colours, 8/8.
- Real server routes content-type checked: `/styles/appdemo.html` 200 html,
  `/v2/board.css` 200 css.

## Next agent should
- **Look at the screenshots** (I could not render images in-session):
  `apps/styles/shots/2[4-9]-appdemo-*.png`, `31-appdemo-goldeneye.png`,
  `23-app-strip-both.png`, `apps/board/shots/skin-*.png` — judge the craft with eyes.
- The `demo.html` fg-\* mocks for the 8 themes now wear the new component languages
  too — worth an eyeball at `/styles` compare strip.
- Founder verdict pending on the eight; likely follow-ups: pick favourites, tune
  per-theme copy flavor in-app, maybe promote one as alt default.
- `apps/figma-app` picker still offers the original five only — fine (v1 preserved),
  but if the founder adopts new names, keep the /v2 + /styles catalogues in sync
  (`gallery.js` THEMES ↔ `verify.js` THEMES ↔ `demo.html` OK-regex ↔ `board.js` THEMES).
- Deploy when the founder's seen it: `./scripts/build-deploy.sh && …wrangler…`
  (per ORCHESTRATION §HOW TO ORCHESTRATE step 5).

## Gotchas hit
- **`appdemo.html` must load `/v2/board.css` by URL** — apps/styles/e2e's static
  server now maps `/v2/* → apps/board/*` (mirrors serve.ts) or the iframes would 404.
- `themes.css` loads BEFORE `figma-components.css` and `board.css` — per-theme rules
  always prefix `[data-theme="x"]` (specificity 0-2-0+) to win regardless of order.
- figma-components.css uses NO pseudo-elements — free for themes; board.css reserves
  `::after` on `.bd-token--armed`, `.bd-burst`, `.bd-card__face--back`, `.bd-fx__ring`.
- `.bd-app` has `min-height:100dvh` — inside a fixed-height demo phone it overflows;
  appdemo wraps content in `.demo-scroll` + compaction (`aspect-ratio 10/8.2` table).
- Saved `rwf.board.v2` state from BEFORE this wave has `board.kitty` — the field is
  now `board.pot`, so stale local matches show pot 0 (fresh matches fine; demo-app
  localStorage, accepted).
- Concurrent agents left uncommitted work in `apps/figma-app/{themes.css,version.js}`
  and `site/` — untouched by this wave. **Nothing committed** (per wave rules).
