# Pinboard — Ben's ideation board (design reference wall)

**`/pinboard`** — token-styled masonry wall of Ben Gillies' Pinterest ideation
references for Reps With Friends. Internal design reference, shared by the
founder (Alexei) for exactly this purpose: *"download so you can see these
layouts and styles to work with to design the app."*

## Provenance (v2 — 2026-09-03)

| | |
|---|---|
| Primary source | **“Reps With Friends ideation”** — secret board, founder's full-page save at `design/references/Pinterest.html` + `Pinterest_files/` (16 MB) |
| Completeness | Pinterest's DOM declares **39 pins — all 39 captured** (not lazy-truncated). 1 carousel pin (10 frames), 1 image pinned 3× → **37 unique covers** (`ideation_01..37.jpg`) at 736px from `i.pinimg.com` |
| Earlier source | **REPS WITH FRIENDS** public board + profile feed — https://au.pinterest.com/bengillies888/reps-with-friends/ · 22 images (`pin_01..22`), original resolution |
| Overlap | **Zero** — checked by pin id AND image signature; the two sets are disjoint |
| Merged wall | **59 cards** in two sections (ideation board first), tag-filterable |
| Account | bengillies888 ("B G") — https://au.pinterest.com/bengillies888/ |
| Analysis | **`design/references/ANALYSIS.md`** — clusters, palettes, theme implications |

## What's in here

- `ideation_01.jpg … ideation_37.jpg` — covers from the saved secret board at
  736px (fallback: the founder's 236px thumbs). Organised copies + the 9 extra
  carousel frames live in `design/references/pinterest_ideation/`.
- `pin_01.jpg … pin_22.png` — original-resolution pins from the earlier scrape
  (8 public board + 14 profile feed).
- `manifest.json` — v2: per-pin metadata for both sets (tag, title/description,
  pin URL, dimensions, image signature, repin notes, `source` field
  `ideation board` vs earlier), plus `ideation_board` provenance block.
- `index.html` + `pinboard.css` + `pinboard.js` — the `/pinboard` wall page:
  grouped masonry (two sections), clickable tag filters, lightbox with notes,
  RWF tokens, `data-theme="gold"`.
- `shots/` — v1 verification screenshots. v2 screenshots: `apps/screenshots/pinboard/`.

## Method

**v2 (ideation board):** the founder saved the secret board page while logged
in. Pins were parsed from the saved DOM (`data-test-pin-id` +
`data-test-image-signature`, alt-text from `<img alt>`); covers re-fetched at
736px from `i.pinimg.com` per the srcset URLs embedded in the page. Pin pages
return only the SPA shell anonymously, so titles derive from Pinterest's
auto-alt-text ("This may contain: …") — noted honestly in ANALYSIS.md.

**v1 (public board/profile):** board/profile pages embed SSR JSON in
`__PWS_INITIAL_PROPS__` (`initialReduxState.pins`) — that supplied pin IDs + all
image variants. Pin pages SSR `og:title`/`og:description` for annotations. The
`widgets.pinterest.com/v3/pidgets` widget API cross-checked board pins.
The scraper is preserved at `scripts/pinboard/scrape_pins.py`.

Respect: Ben's own board, shared for this use. Internal reference only —
do not redistribute images outside the team. Never delete the founder's saved
files under `design/references/`.
