# MATERIAL CONTRACT v3 — frozen 3 Sep 2026 (theme-system rebuild)

This file is the SINGLE SOURCE OF TRUTH for the theme-rebuild wave.
Any agent touching `design/themes.css`, `apps/styles/*` must obey it.
Owner of the wave: the orchestrator writing themes.css.

## THE 14 THEMES (id, gallery order, name, "describe it as" line)

| # | id | name | describe it as… |
|---|----|------|-----------------|
| 1 | `lime` | Lime Athletic | …a steel weight-room floor under fluorescent light — matte charcoal, one lime stripe, technical type. |
| 2 | `gold` | Gold Arcade | …a late-night arcade cabinet — deep purple shell, marquee-gold buttons, Anton capitals. |
| 3 | `sunset` | Sunset Brutalist | …a screen-printed sport poster — cream stock, ink-black rules, hard offset shadows. |
| 4 | `neon` | Midnight Neon | …an esports broadcast desk — blue-black glass, cyan + magenta rim-light, mono numerals. |
| 5 | `forest` | Forest Retro | …a 1970s family board-game box — walnut tones, mustard + burnt-orange, soft rounded everything. |
| 6 | `board` | Stadium Board | …a flip-scoreboard stadium — split-flap numerals, lane-paint stripes, starting-block buttons, photo-finish tape. |
| 7 | `mycelial` | Mycelial | …a bioluminescent root network — tendril dividers, spore-drift air, fungus-cap buttons, growth-ring progress. Everything breathes. |
| 8 | `techy` | Mission Control | …a flight telemetry console — brushed metal, corner rivets, scanlines, LED numerals, guarded switches, boot-up reveals. |
| 9 | `track` | Track & Field | …stadium signage — condensed timing type, painted lane rows, race-bib ranks, chalk grids. |
| 10 | `cardtable` | Card Table | …green felt and bone — brushed felt noise, dealer-chip buttons, cream letterpress cards, brass hairlines. |
| 11 | `caveman` | Caveman | …carved stone and fire — ROCK buttons with chiselled facets, ochre cave-paint walls, bone-white type, fire-glow danger. |
| 12 | `n64` | N64 | …a low-poly fog console — vertex-gradient washes, stepped bevels, cartridge-slot buttons, square avatars, fog reveals. |
| 13 | `goldeneye` | GoldenEye | …a spy dossier HUD — gunmetal notched panels, watch gauges, typewriter objectives under redaction, reticle focus. |
| 14 | `neobrut` | Sports Poster *(NEW)* | …a neo-brutalist sports poster with a soft underbelly — huge loud type on warm cream, thick rules, off-register duotone print edges; then every touch is buttery, pill-soft and gentle. |

The 8 board kits (`board…goldeneye`) + `neobrut` = the 9 that appear in the
"On the app" strip. All 14 appear in: picker cards, compare strip, verify, previews.

## THE MATERIAL VOCABULARY (frozen class names — styled per theme in themes.css)

Generic, app-agnostic, usable in ANY project that loads the library:

```
.mat-page      page/wrapper texture (themes.css also applies it to body)
.mat-surface   a panel of the material (cards, sheets)
.mat-btn       primary button that IS the material   (+ .mat-btn--ghost)
.mat-chip      small toggle                           (+ .is-on)
.mat-input     text field
.mat-num       display numeral (scoreboard/LED/tally per theme)
.mat-progress  progress track, fill is the child <i>
.mat-divider   divider (tendrils / tape / hazard / bone per theme)
.mat-avatar    avatar treatment
.mat-dialog    dialog panel   (.mat-dialog__title inside)
.mat-dz        danger-zone banner
.mat-badge     small status badge
.mat-lab       demo grid container (utility only)
```

### The mat-lab demo markup (verbatim — used by appdemo.html + e2e probes)

```html
<div class="mat-lab" id="matlab" aria-label="Material kit demo">
  <div class="mat-surface">
    <span class="mat-badge">LIVE</span>
    <p class="mat-num">85</p>
    <div class="mat-progress"><i style="width:62%"></i></div>
    <button class="mat-btn" type="button">Log reps</button>
    <button class="mat-btn mat-btn--ghost" type="button">Mates</button>
    <input class="mat-input" placeholder="reps…" aria-label="reps">
    <button class="mat-chip is-on" type="button">squats</button>
    <button class="mat-chip" type="button">push-ups</button>
    <div class="mat-divider"></div>
    <span class="mat-avatar">AB</span>
  </div>
  <div class="mat-dialog" role="dialog" aria-label="demo dialog">
    <h3 class="mat-dialog__title">Play Lightning?</h3>
    <p>×3 reps for 10 minutes.</p>
    <button class="mat-btn" type="button">Play card</button>
  </div>
</div>
```

## APPDEMO SCREENS (apps/styles/appdemo.html — ?screen=…)

Existing: `home`, `battle`, `both` (kept verbatim).
New (added by agent A): `log`, `cards`, `profile`, `dialogs`, `dz`, `matlab`.
`all` = every phone visible (grid). Theme allow-list in the OK regex becomes
all 14 ids. `window.__appDemoReady` hook stays.

## GALLERY API (apps/styles/gallery.js — extended by agent B)

```
window.__rwfStyles = {
  THEMES,           // 14 × { id, name, desc }   (desc = the "describe it as…" line)
  KIT_THEMES,       // the 9 board kits (was V2_THEMES)
  enterPreview(id), exitPreview(),
  active(),         // current preview id | null
  cycleTheme(dir),  // dir ±1 — INSTANT swap in preview (no reload):
                    //   sets data-theme on gallery docElement AND inside
                    //   #previewFrame's contentDocument.documentElement
  jumpTo(i),        // index 0-13 — same instant swap; auto-enters preview
  screen/appScreen get/set, setScreen, setAppScreen   (kept)
}
```
Keyboard (page-level): ArrowRight/ArrowLeft = cycleTheme (wrap-around),
keys `1`–`9` = jumpTo(0..8) of the FULL 14-list order, Escape = exit preview.
A visible hint chip (`#kbdHint`) shows: `← → swap · 1–9 jump · esc exit`.
Each theme card shows name + desc + a copy-snippet button (copies
`<html data-theme="…">` + `rwf.qalarc.com/styles/#theme=…`, clipboard API,
visual confirm state for ≥1.2s).

## E2E DISTINCTION METRIC (10 dims, computed in each theme frame)

On the mat-lab + body, pairwise string-inequality ≥ **6/10** for ALL 14×13/2 pairs:
1. body backgroundImage (first 90 chars) — texture, NEVER none
2. .mat-surface backgroundImage (60)
3. .mat-surface borderRadius
4. .mat-surface borderTop (width+style+color)
5. .mat-btn clipPath (caveman polygon / goldeneye notch / others none)
6. .mat-btn boxShadow (70)
7. .mat-btn borderRadius
8. .mat-num fontFamily
9. .mat-divider build (backgroundImage + height)
10. .mat-progress i build (borderRadius + backgroundImage)

Existing bd-* 10-dim signature (≥3/10) stays as a second assertion.
Buttons must be materially themed: each theme's .mat-btn has clip-path ≠ none
OR multi-layer/offset shadow OR background-image texture — pairwise distinct.

## TOKEN CONTRACT (unchanged — no regressions)

Every `[data-theme]` block keeps ALL existing slots (bg/surface(-2)/line(-bright)/
text/muted/faint(-deco)/lime(-dim,-glow)/coral(-glow)/amber/sky/success/danger/
urgency/energy(-light,-tint)/dz-bg/dz3-surface/dz-hero/fonts/radius*/pill/
on-accent/primary-hover/on-warn/on-gold). The 9 kits keep their BOARD EXTRAS
(--felt/--felt-deep/--felt-line/--lane/--lane-paint/--rail/--rail-edge/
--chip-*/--card-back-*/--card-face/--pop-shadow/--speed). neobrut defines all
of the above too (it renders bd-* markup in the app strip).
