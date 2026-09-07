# 2026-09-07 · /styles — header diet, 📱 phone review mode, ★ shortlist

**Scope:** `apps/styles/` only (e2e server also touches `/v2` + `/design` read-only).
**Founder brief:** "the style screen header takes up too much of the screen and I
cannot close it" (preview bar) · "swapping styles with arrow keys is good" ·
"a phone style switcher — swipe between styles, swipe up to view the other
pages, the client reviews and picks."

**State:** e2e green — **251/251** (`bun apps/styles/e2e.mjs`). 209 pre-existing
checks untouched and passing (desktop review unchanged) + 42 new. No commits made.

---

## 1 · The founder's "cannot close it" bug — root cause

`.st-previewbar { display:flex }` (author CSS) **beats the UA's
`[hidden] { display:none }`** regardless of specificity — so the preview bar
rendered from page load and the ✕ (which only sets `hidden = true`) never hid
it. Fix: a page-wide guard at the top of `styles.css`:

```css
[hidden] { display: none !important; }
```

The e2e now asserts this through a **real click** on `#previewExit` (the old
suite only called `exitPreview()` directly and missed the bug).

## 2 · Header diet (`index.html`, `styles.css`)

- `<header class="st-header">` is now **one compact bar** (~50px): `RWF` chip ·
  title · "26 kits" count · `📱 Review mode` · `?`. Asserted ≤ 64px.
- The long subtitle + related-links nav moved into a **"?" sheet**
  (`#stSheet`): modal, esc/backdrop/✕ close, `aria-expanded` on the button.
- Preview bar stays one slim line; ✕ actually exits (asserted).

## 3 · 📱 Phone review mode (`review.js` — NEW, + markup in `index.html`, styles in `styles.css`)

The client-review tool — the founder hands his phone to Ben:

- **Full-screen theme slides**: `.sw[data-theme=<id>]` overlay wears the theme;
  each slide is a real app-screen render — `appdemo.html?t=<id>&screen=home&bare=1`
  (new `bare=1` full-bleed mode in `appdemo.html`: no phone chrome/padding/radius).
- **Swipe ← →** between the 26 themes: touch (drag-follow + momentum via
  px/ms velocity), trackpad (`wheel` deltaX), and **arrow keys still cycle**
  (`gallery.js` key handler defers while `__rwfReview.modalOpen()`).
- **Crossfade** between slides (three slide layers, cur ± 1 preloaded — swipes
  never wait on an iframe load; far layers unmount, 3 mounted max).
- **Progress dots** (26, one row, clickable to jump; picked slides wear a ring).
- **♥ Pick** → shortlist in `localStorage rwf.styles.shortlist` (ordered).
- **Swipe ↑ or ⊞** exits to the gallery; a tap on dots/heart/grid still works.
- **Auto-opens on touch devices** (coarse pointer, or touch + ≤500px viewport —
  not touch laptops). `?review=1` forces it (any device, resumes at the first
  picked theme); `#review=<id>` deep-links. Exiting sets a sessionStorage flag
  so reloads don't force it back open.
- **AA contrast**: chrome text sits on solid `--surface`/`--lime` chips —
  asserted ≥ 4.5:1 for name/desc/pick/count in the e2e (handles `color-mix`
  serializing as `color(srgb … / a)`).

Gotcha discovered: **touch events over an iframe target the inner document**
and never bubble out — `.sw__frame { pointer-events:none }` (the slide is a
display render, gestures belong to the overlay). Touch listeners attach to the
`.sw` root, not the stage, because swipes often start on the bottom panel.

## 4 · ★ Shortlist view (gallery top)

`#shortlist` section (hidden when empty): "★ Picked for review — N" row of
chips (theme-coloured dot + name; click → full preview, ✕ removes), plus:

- **⧉ Copy summary for chat** — plain text: numbered `name — describe-it line`
  list + link. Clipboard API with `execCommand` fallback.
- **Clear picks**.
- Picks made on the phone surface the moment review mode closes; `storage`
  events sync across tabs.

## 5 · e2e (`e2e.mjs` — sections F & G appended before "done")

- **F · HEADER DIET (11 checks)** — bar ≤ 64px, subtitle out of header, sheet
  open/esc/✕, preview bar `display:none` at rest → `flex` in preview →
  **✕ click** hides it + theme back to lime. Zero console errors.
- **G · PHONE REVIEW MODE (31 checks)** — 390×844 mobile + touch emulation:
  auto-open, slide chrome/theme/count, real app screen full-bleed inside,
  geometry (panel inside viewport, dots one row, ⊞ reachable), **synthetic
  swipes via `Input.dispatchTouchEvent`** (drag-follow mid-swipe, momentum
  advance, pick persists, arrows cycle, up-swipe exits, scroll unlock),
  shortlist row + summary text + clear, `?review=1` resume-at-pick, ⊞ exit +
  session suppression. Zero console errors. Screenshots:
  `229-review-worn_phone.png`, `230-review-midswipe_phone.png`,
  `242-shortlist_phone.png` (390×844 @2x, viewport-only via new `shotViewport()`
  — `shot()`'s `captureBeyondViewport` would shoot the whole gallery behind).

Fixes made to the harness itself: `/favicon.ico` → 204 (its 404 is a console
error), `setTouchEmulationEnabled` disable must **omit** `maxTouchPoints`
(0 is rejected: "Touch points must be between 1 and 16"), and `\\d` escaping
inside template-literal evals (`\d` degrades to `d`).

## 6 · Fast smoke tool

`apps/styles/_smoke_review.mjs` — 20-check desktop+phone pass over just the
review layer (~30s), no 26-iframe waits. Use it while iterating on the
switcher; run the full `e2e.mjs` before handover.

## 7 · Files

| file | change |
|---|---|
| `apps/styles/review.js` | **NEW** — sheet, shortlist, phone review mode |
| `apps/styles/index.html` | compact header, sheet, shortlist section, switcher markup, `review.js` include |
| `apps/styles/styles.css` | `[hidden]` guard, compact bar, sheet, shortlist, switcher styles |
| `apps/styles/gallery.js` | key handler defers to `__rwfReview.modalOpen()` (arrows/esc/numbers) |
| `apps/styles/appdemo.html` | `bare=1` full-bleed mode |
| `apps/styles/e2e.mjs` | sections F + G, `shotViewport()`, favicon 204, touch-emulation fixes |
| `apps/styles/_smoke_review.mjs` | **NEW** — fast smoke (see §6) |
| `apps/styles/shots/` | regenerated; +3 `_phone` shots |

Nothing deleted; no commits; `/v2`, `/design`, `apps/board` untouched.
