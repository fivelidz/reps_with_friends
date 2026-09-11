# RWF POWER-UP ART · the symbol studio

Procedural **sports-poster icon system** for the 21-card deck — real vector
symbols (no emoji) rendered in **7 named style kits**. The "local media
studio": canvas-path drawing turned into committed SVG + PNG assets by a
build script. No image API, no runtime generation, zero deps.

```
site/powerup-art/
  symbols.js       21 glyphs + drawSymbol() + drawCardSymbol() (poster master)
  styles.js        the 7 style kits + drawPoster() / drawBack()
  svg-recorder.js  Canvas2D-shaped recorder → SVG (the export path)
  generate.mjs     THE BUILD — renders gen/ (run: bun site/powerup-art/generate.mjs)
  gen/             COMMITTED ASSETS (do not hand-edit)
    <style>/<card>.svg|.png   512×512 poster per card per style
    <style>/_back.svg|.png    the deck reverse, per style
    chips/<card>.svg|.png     96px poster-master chips (the v4 app icons, 2×)
    manifest.json             index (styles, cards, files)
```

## The style kits

| kit | tagline | the look |
| --- | --- | --- |
| `poster` | the house style | speed-line halo · chromatic misregistration · halftone shade · thick keyline. **The master** — feeds the v3 3D card faces (`site/models/cards3d.js`) and the v4 app chips. |
| `varsity` | stitched felt patch | college green/gold on cream felt, chenille stitch rings, chain-stitch border, star pips, blank winner's banner |
| `risograph` | two-ink print run | riso blue + alarm red on cream, printed out of register, paper grain, offset plate circles |
| `gold-etch` | engraved on ink | gold linework in deep ink, engraved plate, hatch fields, filigree corners, double rules |
| `halftone` | ben-day action print | silver-age comic: ben-day dot field, sticker-gap ink over a comic burst, heavy blacks |
| `neon` | lights on the dark | the 11pm arena: floodlight beams, floor grid, layered neon strokes under a hot white core |
| `boxing` | aged letterpress | turn-of-the-century fight bill: ink double-struck on aged paper, oxblood accents, rosettes, star rows, wear |

Review them all at **/powerups** (apps/powerups) — big, switchable,
front + back, with the engine's card data and per-card 💛/💬 feedback.

## Craft rules (the sports-poster language)

Every poster layers the same moves, in kit-specific palettes
(`{ deep, paper, ink, accent, glow }`):

1. **Star-burst / speed-line background** — radiating tapering rays behind the glyph
2. **2–3 colour layers** — glow halo pass → offset accent pass → key ink pass
3. **Offset print misregistration** — the accent layer re-prints ~1.5px off-register
4. **Halftone-dot shading** — batched dot fields (one path, keeps SVGs small)
5. **Thick keyline** — double frame rules, corner rosettes / star rows per kit

Glyphs draw in a 100×100 box using a **constrained canvas API** (no text,
no shadows, no Path2D — see symbols.js header) so the exact same code
renders to canvas (v3 card faces) *and* SVG (the gen/ masters) via the
recorder. Glow is layered strokes, never shadowBlur.

## Rebuilding

```bash
bun site/powerup-art/generate.mjs     # ~1 min: SVG masters → chromium raster → PNGs + manifest
```

Verification is built in downstream: `apps/powerups/test/e2e.mjs` asserts
every kit's 21 files decode; `apps/v3/cards3d_verify.mjs` walks the 3D
faces. Committed assets are deterministic (seeded rng in the kits).

## Where the art ships

- **v3 battle course** — `site/models/cards3d.js` draws `drawCardSymbol()`
  (the poster master, glow ink = rarity colour) onto the 256×358 canvas faces.
- **v4 SoT app** — `apps/sot/app.js` renders `gen/chips/<id>.png` in the
  power-up grid, card sheets and tutorial faces (emoji fallback on error).
- **/powerups** — the founder review page (apps/powerups), served by
  serve.ts (`/powerups`), copied by scripts/build-deploy.sh.
