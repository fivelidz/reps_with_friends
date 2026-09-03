# Handover — Steddi kit + Sports Poster variants (2026-09-03, wave 2)

**Scope delivered:** two founder jobs on the personal styles repository —
(1) the `steddi` kit mined from his live page
qalarc.com/projects/steddi-overlap, and (2) **four variants** of the named
favourite "Neo-Brutalist Sports Poster with a Soft Underbelly" for review,
each a genuinely different reading with full treatment. Library is now
**26 kits**. Everything verified green.

**Verify state at handover:**
- `bun apps/styles/e2e.mjs` → **ALL PASS 209/209** (extended: 26 cards,
  21 app-strip frames, Sports-Poster-family structural check, per-variant
  computed tells, steddi × 8 screens + DNA hex check, grayscale 325 pairs
  worst 5.53 vs threshold 2.0)
- `python3 scripts/styles_contrast.py` → **ALL PASS** (27 rows: default +
  26 kits — first-pass AA for all five new kits, only coral needed tuning)
- Regressions: game-core+bot-core+api 147 tests ✓ · figma-app engine 49 ✓ ·
  figma-app e2e 122/122 ✓ · e2e-sw ✓ (vendored themes.css SW hazard —
  clean) · e2e-daily ✓ · e2e-squads ✓ · e2e-demo ✓ · board e2e 65/65 ✓ +
  geom 27/27 ✓ · `build-deploy.sh` bundle assembles (603 assets,
  style-library + fonts + resolved figma-app themes.css all land)

---

## 1 · JOB 1 — the steddi kit (`steddi`, "Steddi — from your page" ◈)

The "never found" mystery from the last handover resolved: the founder meant
**his own project page** — qalarc.com/projects/steddi-overlap, design system
v3 "rail measurement blueprint" (styles.css?v=32, fetched read-only to
/tmp/rwf_steddi/ scratch).

**DNA carried (verbatim hexes + type):**
- Surface ramp `#0f0b0d / #191217 / #20161c`, plum hairlines `#2c1f26 /
  #3d2a33`, ink `#f1e8e6`, ink-2 `#d9cbc8`, muted `#a59195`
- The red/maroon signal: red `#d94a3d`, red-bright `#ff6a55`, maroon
  `#7c2736/#5a1c28`, **655nm laser `#ff3b2f`** — "no green, no gold" is
  preserved (success = pale "measured" rose `#e8a396`)
- **Sora** display (the qalarc wordmark face — newly vendored
  `design/fonts/sora-var.woff2`) · Inter · JetBrains Mono
- Structures: fine 8px grid under a **drifting red 96px major grid**, page
  grain + vignette, **the laser sweep** (`body::after`, 11s cycle — the
  single strongest "oh that's my page" tell), KPI numerals gradient-clipped
  in mono, **dimension-line dividers** (ticks + CSS arrowheads), callout
  panels (2px red datum edge + fade), linklist hover nudge, blinking LED on
  danger zones, `mist` blur-in dialogs, `--r:10px` hairline geometry
- **AA twins** (documented in the file): primary `#c23b2f` and effort
  `#df5040` stand in for the site's `#d94a3d` wherever 4.5:1 text is
  required; `#d94a3d` itself survives in the gradients.

## 2 · JOB 2 — four Sports Poster variants (◐) for founder review

Original `neobrut` kept as baseline, re-labelled **"Sports Poster ·
original"**. Each variant = full treatment (tokens + mat-* + page texture +
motion + fg/bd bindings + 8 appdemo screens + describe-as copy + ◐ badge).

| id | name | the reading | signature structures | soft underbelly |
|---|---|---|---|---|
| `neobrut-field` | Field Day | SPORTS side dominant — the stadium | Anton scoreboard modules (amber-on-ink), team roundel stickers, **ticket-stub cards** (mask-punched notches + dashed perforation), halftone crowd (two offset dot screens), mown-stripe rules + turf progress, hard green pitch (mown table) | cream paper, 18px corners under 2.5px ink, ONE warm clay plate shadow, buttery 0.4s eases, badge cheer on hover |
| `neobrut-zine` | Fan Zine | POSTER side dominant — the print shop | **misregistration** (`3px cyan + 3px riso-pink` plate ghosts everywhere), hand-torn panels (wonky 8-value radii, slight rotation), Space Mono typewriter headlines, marker-swipe underlines, rubber-stamp chips, franked-stamp badges, chromatic text-shadows on numerals | pastel riso inks (pink `#d61f7d` primary), gentle wobble hover, paste-in settle animation |
| `neobrut-ticket` | Wayfinding | STRUCTURAL side — the signage system | **departure boards** (ink modules, amber `#ffb020` flip numerals — reuses base `matFlap`), numbered-section badges, pictogram rings, dashed platform rules with CSS floor arrows, next-stop progress markers, the only LIGHT track in the library | soft paper `#f4f3ee`, 16px corners on every hard module, ink softened to `#17191c` (never pure black), gentle flip-settles |
| `neobrut-locker` | Clubhouse | the agent's 4th call — the equipment room | **vent-slot lockers** (repeating-gradient vents), screw-cornered panels, jersey buttons (shoulder-stripe gradients, 13/13/15/15 cut), jersey numbers on mesh, sports-tape dividers, tape-tick progress, wristband chips, nameplate badges, timber gym floor | putty cinderblock, towel-soft worn shadows (offset + diffuse), magnetic-clack settle, everything rounded 10–14px |

**Distinctness enforced:** e2e now computes the 10-dim structural signature
over all 21 app kits AND a dedicated **family check** — original + 4 variants
pairwise ≥3/10 dims (measured worst: neobrut↔neobrut-field = 7/10).
Grayscale pairwise covers all 26 (325 pairs, worst 5.53 = the pre-existing
lime↔neon pair). `--bg`/`--primary` distinct across all 26.

## 3 · Files touched (all additive except counts/regex)

- NEW `design/style-library/theme-{steddi,neobrut-field,neobrut-zine,neobrut-ticket,neobrut-locker}.css` + index.css imports
- NEW `design/fonts/sora-var.woff2` + fonts.css entry (Google latin var subset, no CDN)
- `design/themes.css` regenerated (+5 EXTRA binding sections in
  `scripts/styles/write_themes_bindings.py`, EXTRA_ORDER extended) ·
  `apps/figma-app/themes.css` re-vendored
- `apps/styles/`: gallery.js (5 THEMES entries + KIT_THEMES 16→21 + ◐ badge),
  styles.css (badge style), verify.js (+5 font rows), appdemo/demo regexes
  (+5 ids, +2 font-load probes), index.html copy (26 counts), e2e.mjs
  (extended walk, 209 checks)
- `scripts/styles_contrast.py` (kit list + docstring), README.md catalogue
  (26 kits, variant rows, steddi provenance table, guarantees updated),
  agents/ORCHESTRATION.md gallery count
- **base.css fix**: the reduced-motion guards had empty selectors (`{`
  blocks — the documented "all animations stripped" intent never actually
  applied). Now `*, *::before, *::after`. New kits carry their own guards
  regardless.

## 4 · Gotchas learned (read before touching the app bindings)

- **board.css `:root` remaps** `--felt/--card-face/--chip-*` for every theme
  (e.g. felt = 14% success over bg) and loads AFTER themes.css, so kit-level
  felt tokens lose the tie. Custom table materials must be **hard-coded in
  the fg/bd bindings** (the founder-approved original neobrut lives happily
  with the harmonised tint — that pale court is intentional baseline).
- `.bd-pot` is centred by `transform: translate(-50%,-50%)` — any binding
  that sets `transform` (zine's torn rotation) MUST re-include the translate
  or the pot drifts off-centre (caught via pixel probe, fixed + now asserted
  in e2e).
- e2e structural probes must **navigate to their own page** before reading
  computed styles (the walk's last page otherwise poisons the probe).
- Sora ships as a single variable woff2 (100–800) — `document.fonts.check`
  with any weight works.

## 5 · Not done / next

- No commits (per instructions) — working tree only; wave ready to commit +
  deploy when the founder picks (deploy = build-deploy.sh + wrangler + rsync
  per ORCHESTRATION).
- Founder review pending: which variant (if any) graduates — the others stay
  in the library as alternate readings (they're all first-class kits).
- figma-app picker still offers the original 5, /v2 theme row still the 8
  game kits (deliberate, unchanged — UX decision for the founder).
- e2e-squads re-run in foreground after a background-log glitch: **E2E
  PASSED — squads + sfx walked clean** (the background `tail -2` pipe had
  swallowed its verdict line).
- Screenshots for eyeballing: `apps/styles/shots/` —
  `NN-neobrut-{field,zine,ticket,locker}-{8 screens}.png`,
  `NN-steddi-{8 screens}.png`, `NN-appdemo-{new kits}.png`.
