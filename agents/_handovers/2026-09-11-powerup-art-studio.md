# Handover — Power-Up Art Studio + /powerups (2026-09-11, wave iv)

**Task:** "format of the powerups should be better — use the local media studio to produce cool power-up symbols like they would be on sports posters. Show a range of styles as a library. Make a page for the different powerups and systems that can be fully reviewed."

## What exists now

### 1. The studio — `site/powerup-art/`
- **`symbols.js`** — 21 procedural glyphs (one per CARD_CATALOG kind) drawn in a
  100×100 box with a **constrained canvas API** (M/L/Q/C/A paths, fills, strokes,
  transforms, clip, gradients — NO text/shadowBlur/Path2D). Exports `drawSymbol()`
  and `drawCardSymbol()` (the poster-master treatment used by the 3D cards).
- **`styles.js`** — 7 named kits: `poster` (MASTER · default for v3 faces + v4
  chips), `varsity`, `risograph`, `gold-etch`, `halftone`, `neon`, `boxing`.
  Each = palette `{deep, paper, ink, accent, glow}` + a 512×512 `frame()`.
  Seeded rng → byte-stable rebuilds. Also `drawBack()` (deck reverse per style).
- **`svg-recorder.js`** — Canvas2D-shaped recorder → SVG. Points are baked
  through the matrix; arcs become TRUE elliptical arcs (singular-value math) so
  `scale(1,0.62)` coils render correctly. Gradients → defs (userSpaceOnUse).
- **`generate.mjs`** — THE BUILD: `bun site/powerup-art/generate.mjs` → renders
  SVG masters → headless-chromium raster (CDP, port 4311/4312) → PNGs + manifest.
  ~1 min. Rerun any time; output is deterministic.
- **`gen/`** — COMMITTED ASSETS: `<style>/<card>.svg|.png` (512), `<style>/_back.*`,
  `chips/<card>.png` (96, poster master), `manifest.json`. Never hand-edit.
- **`README.md`** — the labelled-kit doc (palettes, craft rules, ship map).

### 2. The review page — `apps/powerups/` at **/powerups**
- Phone-first: 21 tiles in 6 family sections · ← → / tap style rail · card
  detail sheets (front/back flip · engine blurb/target/expiry/counters verbatim
  via `import from "/powerups/sot-engine.js"`) · draft-economy block rendered
  FROM the engine constants (3 dealt · HAND_CAP · REROLL_COSTS · catch-up curve
  table at 5 positions) · deck-sheet overlay (print CSS + client-side PNG
  stitch download) · fullscreen Review mode (swipe + arrows + dots) ·
  per-card 💛 + 💬 in `localStorage["rwf.powerups.feedback.v1"]` with a
  copy-feedback export for the founder.
- Files: `index.html` · `powerups.js` · `powerups.css` · `test/e2e.mjs` · shots/.
- serve.ts: `/powerups` → dirRoute, `/powerups/sot-engine.js` → apps/sot-engine.js
  (same pattern as /v4). build-deploy.sh copies app + engine + gen assets.

### 3. Fed the system
- **`site/models/cards3d.js`** — card faces draw `drawCardSymbol()` (poster
  master, glow ink = rarity hex) instead of the emoji; ~158px at the glyph
  position, still cached once per card. Emoji remains the engine fallback.
- **`apps/sot/`** (image swap only) — `cardSymImg()` in app.js renders
  `gen/chips/<id>.png` in the power-up grid, card sheets, confirm overlays and
  tutorial faces; `onerror` falls back to the emoji so a missing asset can
  never break the app. `.sym-img` sizes in sot.css. The six v4 e2e servers
  gained a `/site/` static route (chips must 200 or the console gate trips).

## Verification status
- **/powerups e2e: 29/29** — every kit's 21 files decode, engine text verbatim,
  feedback persists across reload, review swipe/arrows, deck sheet, zero
  console errors. Run: `bun apps/powerups/test/e2e.mjs`.
- **v4 e2e-cards 58/58** · **v4 full e2e 129/129** (with chips live).
- **v3 cards3d_verify 19/21** — the 2 fails (play flight/burst) reproduce
  IDENTICALLY with my cards3d change stashed → caused by the parallel UX2
  refactor mid-flight (their own log entry reports 21/21 after they landed).
- **v3 e2e**: ran mid-refactor of the parallel session; 121 checks passed then
  the walk hung in their in-flight rematch section (port 4193 was also
  contended with their runs). Not my surface — re-run when UX2 lands.
- **Pixel-probe gates** (this model can't view images, so distinctness was
  measured): 147 posters structured + pairwise-distinct (min center-crop
  style distance 74.6) + on-palette probes per kit; old-vs-new 3D card-face
  band RMS 17.6 (art visibly changed, meshes/perf identical).
- Dev server restarted with the new serve.ts — /powerups live on :4173
  (probed: 21 cards, zero console errors).

## Gotchas for the next agent
- CARD_CATALOG entries key on **`kind`**, not `id` — apps/powerups normalises
  (`{...c, id: c.kind}`) right after import. Don't "simplify" that away.
- The e2e server regex strips only `/powerups/` (with slash) — a bare
  `/powerups.js` is an app file. The real dirRoute has the same shape; serve
  the page at `/powerups/` (trailing slash) when linking.
- gen/ is ~32MB committed (SVGs dominate: gold-etch/boxing hatch fields).
  If the deploy bundle ever needs a diet, ship `chips/` + `poster/` PNGs and
  all SVGs, drop the other styles' PNGs first — the review page prefers SVG.
- Halftone/dot fields are ONE batched path per poster (symbols.js note) —
  keep it that way or SVGs explode into thousands of nodes.
- Ports 4193/4194 are shared with whoever runs v3 suites; a parallel session
  was active during this wave (their handover: 2026-09-11-wiki-feedback-and-
  site-cleanup.md) — expect EADDRINUSE and wait, don't kill their runs.

## Founder feedback loop
Open **/powerups**, flip through the 7 kits, tap 💬 on what matters — the
"copy feedback" button in the header exports the lot for pasting into chat.
