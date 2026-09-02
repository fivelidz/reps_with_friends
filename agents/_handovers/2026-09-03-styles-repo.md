# Handover — The Personal Styles Repository (2026-09-03)

**Scope delivered:** the founder's brief — a styles repository reusable across
all projects, themes mined from his live sites, radical structural
distinction, arrow-key swapping in /styles, the named "Neo-Brutalist Sports
Poster with a Soft Underbelly" kit polished, all packaged portably and verified
green (150/150 e2e + offline WCAG matrix).

**Verify state at handover:**
- `cd apps/styles && bun e2e.mjs` → **ALL PASS 150/150** (fresh run, log below)
- `python3 scripts/styles_contrast.py` → **ALL PASS** (22 rows: default + 21 kits)
- `bash scripts/build-deploy.sh` → bundle assembles (379 assets), /styles +
  style-library + resolved figma-app themes.css all land in deploy/public

---

## 1 · What exists now

### design/style-library/ — THE repository (new)
Portable, app-agnostic, vendorable into ANY project:
- `README.md` — the contract (3-line usage), full 21-kit catalogue with
  "describe it as…" copy, per-site DNA provenance tables, how to add a kit
- `base.css` — shared foundation (page-texture application, mat-* defaults,
  all `@keyframes`, reduced-motion guards)
- `theme-<id>.css` × 21 — one kit per file: token block + `mat-*` primitives
- `index.css` — master import chain
- **Contract:** `data-theme="<id>"` flips the token slots; `.mat-*` classes are
  the pronounced material layer (`.mat-page .mat-surface .mat-btn .mat-chip
  .mat-input .mat-num .mat-progress .mat-divider .mat-avatar .mat-dialog
  .mat-dz .mat-badge`). No `fg-*`/`bd-*`/product selectors inside — ever.

### design/themes.css — RWF bindings only (was the 2004-line monolith)
Now: `@import url("style-library/index.css");` + per-theme `fg-*`/`bd-*`/
`pop-btn` app skins. Split proven lossless (selector-set diff vs the archived
monolith: zero missing). Monolith preserved at
`design/archive/themes_v3_monolith_20260903.css`.

### The 21 kits
14 RWF kits (unchanged ids) + **7 mined from the founder's live sites**:
`x10` (Gum Professional), `doof` (Void Rave), `qalarc` (Pastel Studio),
`tradez` (Warm Trade), `gmux` (Forest Terminal), `volkus` (Humanist),
`endispute` (Legal Brief). Each carries the site's real palette hexes, type
stack, radii/shadow grammar and signature structures (zebra rows, glow
trinity, glass+pastels, Fraunces wonk, status dots, skin-tone ramp,
zero-radius certificate frames). Mined source CSS in `/tmp/rwf_mining/`
(scratch) — the durable record is README.md's DNA tables + the theme files
themselves.

**Distinctness radicalisation** (founder: "still too similar"):
- `sunset` re-engineered → **Sunset Swiss**: flat timing sheet, hairline rules,
  zero shadows (was cream+ink+offset-shadows — the poster language now belongs
  to neobrut alone)
- `neobrut` (**the founder's named favourite**) → halftone dots + paper grain,
  exposed grid, sticker badges (tilted, ringed, wiggling), chunky corners
  ROUNDED UNDER the hard edges (14–18px under 3px ink), warm plate shadows,
  buttery eases; full app-overlay demos (8 screens) + pot sticker verified
- Enforcement: every pair of the 16 app kits differs in ≥3/10 structural dims;
  **grayscale pairwise check** — all 210 pairs of the 21 kits, colour stripped,
  structure still distinct (worst pair 5.55 mean-ΔL, threshold 2.0)

### /styles — the showcase
- 21 labelled cards: name + hex + swatches + **"describe it as…"** copy +
  ◈ **"from <site>"** badges on the mined kits + ★ founder-favourite badge on
  neobrut
- **Arrow keys**: ←/→ cycles full-screen preview with the theme name flashing
  LARGE (quick-flash when holding/scrubbing); works from cold (first press
  enters preview); 1–9 jump; esc exits; hint chips on the page
- Compare strip: 21 live demo iframes · App strip: 16 board-app skins
  (incl. the 7 site kits on the real bd-* markup)
- Checks section: live WCAG + distinctness in-page (`verify.js`, 21 kits)

### Tooling (all permanent, stdlib-only)
- `scripts/styles/split_style_library.py` — monolith → library splitter
  (`--input design/archive/themes_v3_monolith_*.css`); hand-maintained kits
  (sunset, neobrut, the 7 site kits) are never overwritten
- `scripts/styles/write_themes_bindings.py` — regenerates design/themes.css
  from the pkl + `EXTRA` (the 7 site kits' bindings) + `PATCHES` (sunset
  de-brutalisation, neobrut sticker/rounded)
- `scripts/styles/vendor_library.py` — resolves the import chain into the
  single-file `apps/figma-app/themes.css` (also run by build-deploy.sh)
- `scripts/styles_contrast.py` — now library-aware, 22 rows, catches the
  strict state-axes-as-text + energy-initials pairs (drove 10 token fixes)

### Fonts
9 new woff2 latin subsets vendored to `design/fonts/` (DM Sans, DM Serif
Display, Space Mono 400/700, Fraunces, Cormorant Garamond, IBM Plex Mono
400/500/600) + `fonts.css` entries. volkus deliberately uses system
Georgia/Courier (that IS its DNA). No CDN, no new dependencies.

## 2 · Fixes found along the way
- **Prod gap:** `/styles` deploy omitted `appdemo.html` (the "On the app"
  strip would 404 in production) — build-deploy.sh now copies it
- **Vendoring hazard:** figma-app's SW caches `themes.css` as ONE asset; with
  the split it would have contained an unresolved `@import` → build-deploy.sh
  now vendors it RESOLVED via vendor_library.py (repo copy regenerated too)
- e2e stale assertions (13 cards, 2 phones) updated to current reality
  (21 cards; appdemo carries 6 hidden overlay phones — checks now count
  visible ones)

## 3 · Founder notes
- **"steddi" was never found** — no Cloudflare Pages project, no qalarc.com
  path, no local folder. *Founder to point us at it*; mining a kit from it
  takes ~30 min with the README recipe.
- Skipped as too-close: chanalyse.org (shares endispute's exact gold/cream),
  museall.qalarc.com (doof's trinity on navy), biodata.fit (currently serving
  the qalarc.com page — parked alias). Revisit if they diverge.
- Screenshots for eyeballing: `apps/styles/shots/` — `NN-appdemo-<theme>.png`
  × 21, `NN-preview-<theme>.png` × 21, `NN-neobrut-<screen>.png` × 8,
  `04-gallery-compare-both.png`.
- To use in another project: copy `design/style-library/` + `design/fonts/`,
  load `fonts.css` + `style-library/index.css`, set `data-theme`. README has
  the full contract.

## 4 · Not done / next
- No commits (per instructions) — everything is working-tree only
- serve.ts untouched (routes already cover the new paths; e2e + deploy bundle
  prove the file mappings; port 4173 was held by a stale process at handover)
- Natural follow-ons: figma-app picker still offers the original 5 (adding the
  21 needs its own UX decision — deliberately untouched to avoid regression);
  /v2's in-app theme row still lists the 8 game kits (same reasoning); the
  styles_contrast.py token-fixes should be eyeballed against the live
  components in case any deepened state colour reads duller than intended
  (all changes were AA-driven and verified, but taste is the founder's)
