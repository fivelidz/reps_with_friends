# The Personal Styles Repository

**One design-system asset, mined and built across every qalarc project.**
Twenty-six complete, app-agnostic "material kits" — portable to ANY project in
three lines.

Born 2026-09-03 from the founder's brief: *"building a full and varied style
set is helpful for other projects too. Should make a styles repository that can
include themes from x10.au, doof.ing, …different unique UI I have made and
more"* — and the standing verdict: *"styles presented are not distinguished
enough, too similar."*

---

## The contract (use in any project)

Vendor three folders — `design/style-library/`, `design/fonts/` (woff2s the
kits reference), and the slot contract (or define the slots yourself):

```html
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/style-library/index.css">
<html data-theme="caveman">
```

That's it. Everything else is two hooks:

1. **`data-theme="<id>"`** on any ancestor (`<html>`, a panel, a probe) flips
   the full token slot set — colours, type, radii, motion. Slot consumers
   (anything reading `var(--bg)`, `var(--lime)`, `var(--font-display)`…)
   re-skin with zero markup changes.
2. **`.mat-*` classes** opt into the PRONOUNCED material layer — components
   built from the kit's actual material, not re-tinted generics:

| class | what it is |
|---|---|
| `.mat-page` | the kit's page texture (put on `<body>`; also auto-applies) |
| `.mat-surface` | a panel constructed from the material |
| `.mat-btn` (+ `--ghost`) | a button that IS the material |
| `.mat-chip` (+ `.is-on`) | a small toggle |
| `.mat-input` | a text field in the material |
| `.mat-num` | display numeral (split-flap / serif / gradient-ink / LED…) |
| `.mat-progress` + `<i>` | progress; the `<i>` is the fill |
| `.mat-divider` | the kit's divider language (hairline / ramp / double rule / tendril…) |
| `.mat-avatar` / `.mat-dialog` / `.mat-dz` / `.mat-badge` | the rest of the vocabulary |

**The library is app-agnostic by contract**: no `fg-*`, `bd-*`, `pop-btn`,
`rwf-*` or any product selectors live in here. RWF's app bindings live in
`design/themes.css` (which imports this library); your project writes its own
bindings — or uses none and just consumes tokens + `mat-*`.

### Files

```
style-library/
  index.css        ← import this (base + every kit, gallery order)
  base.css         ← shared foundation: page texture application, mat-* defaults,
                     @keyframes, reduced-motion guards
  theme-<id>.css   ← one kit: token block + mat-* treatments
  README.md        ← this file (catalogue + provenance + how to add a kit)
```

Maintenance: kits are plain CSS — edit `theme-<id>.css` directly. The
monolith-era tooling (`scripts/styles/split_style_library.py`,
`write_themes_bindings.py`, `vendor_library.py`) documents how the split was
made and re-vendors figma-app's single-file copy; hand-maintained kits are
never overwritten by the splitter.

---

## The catalogue — 26 kits, every pair structurally distinct

Each kit is a **full design language**: page texture, button material, divider
language, numeral language, shadow language, motion signature. The rule that
settled the "too similar" verdict: **strip the colour from any two kits and
they must still be recognisably different** (enforced headlessly — grayscale
pairwise diff + a 10-dimension structural signature, see
`apps/styles/e2e.mjs`).

### Built for RWF (18)

| id | name | describe it as… |
|---|---|---|
| `lime` | Lime Athletic | …a steel weight-room floor under fluorescent light — matte charcoal, one lime stripe, technical type. |
| `gold` | Gold Arcade | …a late-night arcade cabinet — deep purple shell, marquee-gold buttons, Anton capitals. |
| `sunset` | Sunset Swiss | …a Swiss-designed race timing sheet — flat warm paper, hairline ink rules on a faint alignment grid, one vermillion accent doing functional work. No shadow exists in this kit. |
| `neon` | Midnight Neon | …an esports broadcast desk — blue-black glass, cyan + magenta rim-light, mono numerals. |
| `forest` | Forest Retro | …a 1970s family board-game box — walnut tones, mustard + burnt-orange, soft rounded everything. |
| `board` | Stadium Board | …a flip-scoreboard stadium — split-flap numerals, lane-paint stripes, starting-block buttons, photo-finish tape. |
| `mycelial` | Mycelial | …a bioluminescent root network — tendril dividers, spore-drift air, fungus-cap buttons, growth-ring progress. Everything breathes. |
| `techy` | Mission Control | …a flight telemetry console — brushed metal, corner rivets, scanlines, LED numerals, guarded switches, boot-up reveals. |
| `track` | Track & Field | …stadium signage — condensed timing type, painted lane rows, race-bib ranks, chalk grids. |
| `cardtable` | Card Table | …green felt and bone — brushed felt noise, dealer-chip buttons, cream letterpress cards, brass hairlines. |
| `caveman` | Caveman | …carved stone and fire — ROCK buttons with chiselled facets, ochre cave-paint walls, bone-white type, fire-glow danger. |
| `n64` | N64 | …a low-poly fog console — vertex-gradient washes, stepped bevels, cartridge-slot buttons, square avatars, fog reveals. |
| `goldeneye` | GoldenEye | …a spy dossier HUD — gunmetal notched panels, watch gauges, typewriter objectives under redaction, reticle focus. |
| `neobrut` ★ | **Sports Poster · original** | …a neo-brutalist sports poster with a soft underbelly — huge duotone type shouting on warm cream, halftone dots, thick ink rules, sticker badges, an exposed grid — then every corner underneath is rounded, every press soft, every hover gentle. **The founder-named favourite; the baseline the four variants below riff on.** |
| `neobrut-field` | Sports Poster · Field Day | …the SPORTS side dominant — a stadium day-poster: giant condensed scoreboard type on ink modules, team-badge roundels, ticket-stub chips with punched perforations, halftone crowd haze, mown-stripe rules — and the underbelly is cream paper, corners rounded under, one warm clay plate shadow, buttery 0.4s eases. |
| `neobrut-zine` | Sports Poster · Fan Zine | …the POSTER side dominant — the club fanzine photocopied at 3am: heavy copier grain, plates misregistered 2–3px into cyan + riso-pink, hand-torn panels, typewriter headlines with marker swipes, rubber-stamp toggles — and the underbelly is pastel risograph inks and a gentle wobble. |
| `neobrut-ticket` | Sports Poster · Wayfinding | …the STRUCTURAL side — the venue as a signage system: departure-board numerals flipping amber on ink modules, numbered-section badges, pictogram rings, dashed platform rules with floor arrows — and the underbelly is soft paper, 16px corners on every hard module, ink softened off pure black. |
| `neobrut-locker` | Sports Poster · Clubhouse | …the CLUBHOUSE side (the agent's own fourth reading) — the equipment room after training: vent-slot lockers, screwed-on nameplates, jersey numbers on mesh bibs, sports-tape rules, wristband toggles — everything towel-soft, rounded, comfortably worn in. |

### Mined from the founder's live sites (8) — ◈

Each kit was mined from the real CSS of a live property (2026-09-03): palette
hexes verbatim, the site's type stack (vendored to `design/fonts/`), its
radii/shadow grammar and its signature structures. **The "oh that's my site"
test.**

| id | name | from | DNA carried |
|---|---|---|---|
| `x10` | Gum Professional | **x10.au** | near-black green `#0b0e0b/#141a14`, gum green `#6E9A6A` + gold `#C9A24E`, Space Grotesk + JetBrains Mono, the 200px inset vignette, gold focus rings `0 0 0 3px`, zebra listing rows, 6–8px radii |
| `doof` | Void Rave | **doof.ing** | the void `#0a0a0f`, sacred trinity purple `#a855f7` / orange `#f97316` / cyan `#22d3ee`, ritual 135° gradients, 30px glow shadows, blob radii, gradient-clipped headings |
| `qalarc` | Pastel Studio | **qalarc.com** | cream `#fdf6ee`, ink `#2a2035`, the pastel garden (blush `#f2c4ce` · lavender `#c9b8e8` · sky `#a8d8ea` · mint `#b8e8c8` · peach), glass cards `rgba(255,255,255,.6)` + blur, 16/8/100px radii, DM Serif Display + Space Mono |
| `tradez` | Warm Trade | **tradez.au** | warm sand `#FBF8EF`, gum-leaf `#3d5c3a` (AA-deepened from `#4A6B47`), gold `#C9A24E`, chunky **Fraunces 800/900 wonky-cut** headlines, Inter + JBMono, zebra rows, dark-green CTA blocks, honest 6–10px radii |
| `gmux` | Forest Terminal | **gmux.ai** | sage-ivory `#edefe6`, paper `#fafbf3`, forest `#2e6b40` / clay `#9c4a2b` / honey `#8a6414`, JetBrains-Mono-everything, 22px dot grid, dashed rules, segmented progress, the ok/wait/alert/idle status-dot grammar |
| `volkus` | Humanist | **volkus.net** | quiet black `#0d0d0d`, warm brown `#c27840` ("the mixed skin tone"), pale warm `#f0c49a`, **Georgia + Courier New (system)**, and the eight-step skin-tone ramp `#F5D5B8→#2C1506` as dividers/progress/rank plates |
| `endispute` | Legal Brief | **endispute.com.au** | cream `#f4eedf`, ink `#0a0a0a`, gold `#d4a14a` rules (deep gold `#7d5a0e` wherever text needs AA), **Cormorant Garamond** + IBM Plex Mono, radius ZERO (the only sharp light kit), certificate double-rule frames, `[ bracketed ]` chips, ledger rows |
| `steddi` | **Steddi — from your page** | **qalarc.com/projects/steddi-overlap** (styles.css?v=32 "rail measurement blueprint", mined 2026-09-03) | warm near-black `#0f0b0d`/`#191217`, plum hairlines `#2c1f26`, ink `#f1e8e6`, the red/maroon signal — red `#d94a3d`, red-bright `#ff6a55`, maroon `#7c2736`, **655nm laser `#ff3b2f`** — the fine 8px blueprint grid under a drifting red 96px major grid, KPI numerals gradient-clipped in JetBrains Mono, dimension-line dividers with ticks + arrowheads, callout panels with the 2px red datum edge, and the Class-2 laser sweeping the whole page every 11s. Type: **Sora** (the qalarc wordmark face) · Inter · JBMono. AA note: primary `#c23b2f` and effort `#df5040` are the AA-tuned twins of the site's `#d94a3d` (which survives in the gradients). |

**Skipped as too-close to another kit** (founder rule: skip near-duplicates):
`chanalyse.org` shares endispute's exact gold/cream pair (Fraunces vs
Cormorant aside); `museall.qalarc.com/suite` is doof's trinity on navy;
`biodata.fit` currently serves the qalarc.com page (parked alias). Revisit if
any of them diverge. `steddi` — "never found" in the first mining pass —
was located 2026-09-03 at the founder's own project page
(qalarc.com/projects/steddi-overlap) and mined as the 8th site kit above.

### Distinction guarantees (enforced in `apps/styles/e2e.mjs`)

- every pair of the 21 app kits differs in **≥3 of 10 structural dimensions**
  (patterns, radii, border widths, shadow geometry, type) — not hue;
- **grayscale pairwise check**: all 26 rendered in grayscale, every pair's
  mean pixel-Δ above threshold — structure survives colour-stripping;
- `--primary` and `--bg` distinct across all 26;
- each `neobrut-*` variant is additionally grayscale-distinct from the
  original `neobrut` and from every other variant (same check, same bar);
- WCAG AA per kit: text ≥4.5, faint ≥4.5, primary ≥3.0 (display),
  on-accent-on-primary ≥4.5, on-warn-on-urgency ≥4.5
  (offline source of truth: `scripts/styles_contrast.py`; live: `/styles` →
  Checks).

---

## Adding a kit

1. `theme-<id>.css`: token block (copy the full slot set from any kit —
   every slot the contract names, incl. `--on-accent`, `--on-warn`,
   `--urgency`) + `mat-*` treatments. Tokens first, structure second —
   the AA table above is a hard bar.
2. Add the `@import` to `index.css` and a row to this catalogue (name +
   describe-it-as + provenance).
3. If vendoring new fonts: Google woff2 latin subset into `design/fonts/` +
   `@font-face` in `fonts.css` (never a CDN).
4. For RWF specifically: bindings in `scripts/styles/write_themes_bindings.py`
   (`EXTRA`) → regenerate `design/themes.css` → re-vendor
   (`vendor_library.py`), then extend `apps/styles/` (gallery THEMES, verify
   fonts, e2e lists) and run the e2e.
