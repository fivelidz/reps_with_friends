# Pinboard — Ben's ideation board (design reference wall)

**`/pinboard`** — token-styled masonry wall of Ben Gillies' Pinterest ideation
references for Reps With Friends. Internal design reference, shared by the
founder (Alexei) for exactly this purpose: *"download so you can see these
layouts and styles to work with to design the app."*

## Provenance

| | |
|---|---|
| Board | **REPS WITH FRIENDS** — https://au.pinterest.com/bengillies888/reps-with-friends/ |
| Shared link | https://au.pinterest.com/bengillies888/reps-with-friends-ideation/ (secret board — soft-404s anonymously) |
| Account | bengillies888 ("B G") — https://au.pinterest.com/bengillies888/ |
| Scraped | 2026-09-03 · 22 unique images (23 pins, 1 duplicate pruned) |
| Owner | Ben Gillies (design partner) · shared for RWF design ideation |

## What's in here

- `pin_01.jpg … pin_22.png` — original-resolution pin images from
  `i.pinimg.com/originals/` (fallback `736x/`), rate-limited scrape (0.3s).
  Pins 01–08 come from the public board; 09–22 surface via Ben's public
  profile pin feed (the visible part of the shared ideation material).
- `manifest.json` — per-pin metadata: tag, title/description (og: scraped),
  pin URL, dimensions, image signature, video flag. Light-touch tags:
  brand identity · logo · photography · app ui · interiors · illustration · fashion.
- `index.html` + `pinboard.css` + `pinboard.js` — the `/pinboard` wall page
  (masonry grid + lightbox, RWF tokens, `data-theme="gold"` — Ben's palette).
- `shots/` — verification screenshots (desktop + 390px). Local only, not deployed.

## Method (no auth, public data only)

Board/profile pages embed SSR JSON in `__PWS_INITIAL_PROPS__`
(`initialReduxState.pins`) — that supplied pin IDs + all image variants.
Pin pages SSR `og:title`/`og:description` for annotations. The
`widgets.pinterest.com/v3/pidgets` widget API cross-checked board pins.
The scraper is preserved at `scripts/pinboard/scrape_pins.py`.

Respect: Ben's own board, shared for this use. Internal reference only —
do not redistribute images outside the team.
