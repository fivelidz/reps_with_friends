# HANDOVER: pinterest-ideation-analysis — 2026-09-03

## Shipped
- **`/pinboard` upgraded to v2** — 59 cards in two sections: the complete secret
  board **“Reps With Friends ideation”** (37 unique covers, `ideation_01..37.jpg`,
  736px) + the earlier 22-pin public-board/profile scrape. Clickable tag filters,
  lightbox now shows repin/carousel notes, grouped headers, provenance footer.
- **`design/references/ANALYSIS.md`** — the real deliverable: clusters (sports
  numbers / Quizly case / neo-brutalism / wellness-habit apps / brand posters),
  quantified colour census, the “board says” quotable, and 4 theme-delta
  recommendations (explicitly NOT implemented).
- **`design/references/pinterest_ideation/`** — organised copies of all 37 covers
  + the 9 Quizly carousel frames (`carousel_quizly/`).
- `site/pinboard/manifest.json` v2 (merged, source-tagged, repin notes) ·
  README.md v2 provenance · screenshots in `apps/screenshots/pinboard/` (5).

## Verified
- Playwright (system chromium): **59/59 images decode** after full scroll,
  both group heads render, tag filter works (sports betting → 4 cards, 1 head),
  lightbox opens with correct pin, **zero console errors, zero failed requests**.
- Completeness: Pinterest's own DOM says **“39 Pins” — all 39 captured** (39
  `data-test-pin-id`s). Not lazy-truncated. The 5 stray 474px images after the
  last pin are Pinterest's related-ideas rail — excluded deliberately.
- Dedupe: **zero overlap** between saved board and the earlier 22 — checked by
  pin id AND `data-test-image-signature` (both manifest sets carry signatures).

## Next agent should
- **Themes lane**: read ANALYSIS.md §5 — 4 concrete deltas: (1) light “Cream Gold”
  variant of theme-gold (cream `#f2e7c5` base, keep `#ffc821` accent),
  (2) `theme-sportsbook` kit from the exact I02/I35 palette
  (`#ebd9c1`/`#7ab3ad`/`#313d3b` + red `#f11814`), (3) neo-brutal challenge/task
  card pass (`#fed01a`/`#9888ab`), (4) violet player-card component (I34
  `#ab70f8` on `#3c1e36`) for crew/leaderboard identity.
- If a vision-capable session runs later: re-verify clusters by eye — current
  analysis is alt-text + PIL palette + aspect only (image input unavailable;
  stated in the analysis honesty box). The contact sheets are already built at
  `/tmp/rwf_pins/sheets/` (regenerate from `site/pinboard/*.jpg` if gone).
- Founder/Ben quote-back: ANALYSIS.md §4 is written to be sent as-is.

## Gotchas hit
- `__PWS_INITIAL_PROPS__` redux store in the saved page is **empty** (saved
  post-hydration); the pin data lives in the hydrated DOM — parse
  `data-test-pin-id` + `data-test-image-signature`, not SSR JSON.
- The founder's save holds **236px lazy thumbs**; the srcset attrs still name the
  736x/originals CDN URLs — `i.pinimg.com` serves them anonymously (37/37 OK).
  Pin *pages* however only return the SPA shell anonymously (no og: metadata).
- One local file breaks the signature==filename rule:
  `405d8b87….0000000.jpg` is the “Pure Taste Power” pin (sig `8e63f9e8…`) —
  mapped by hand.
- `b97d767b…` (player-props betting UI) appears as **3 separate pins** — Ben
  saved it three times; wall shows it once with a “pinned 3×” note.
- Playwright isn't a dep of this repo (rule: no new deps) — borrowed via
  `NODE_PATH=~/projects/GLM_projects/RTC/rtc_agents/PERF/node_modules` with
  `executablePath: '/usr/bin/chromium'` (its own pinned browser build is missing).
- The founder's saved files in `design/references/Pinterest.html` +
  `Pinterest_files/` are **untouched** — everything new is additive.
