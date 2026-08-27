# F3 implementation divergences (Figma spec → our build)

Every place the built components deviate from Ben's extracted specs, and why.
Anything not listed here matches the spec value exactly (verified: 98 style/
geometry checks + 15 rendered-pixel checks — see BRIEF.md).

| # | Component | His spec | Our build | Why |
|---|---|---|---|---|
| 1 | Bottom nav, inactive label/icon | #63637A (3.4:1 on ink — fails AA) | `--faint` (#8E8EA3 in gold, 6.1:1) | His own a11y page demands ≥4.5:1; the spec value contradicts it. AA wins (§7 row 18 adopt). |
| 2 | Radius scale | 8/12/16/24/28 exact | mapped: 8→`--radius-sm`(9) · 12/14→`--radius`(14) · 16→`--radius-lg`(16) · 20/24/28→`--radius-xl`(24) | Brief: "map onto ours", not fork a second scale. Two closest-step collapses (12→14, 20/28→24), invisible at render size. |
| 3 | Icon vectors | 22 line icons, paths not in REST dump | redrawn same-school (24px grid, stroke 2, round caps) | Geometry isn't exportable from file.json; F2 already flagged icon art for a human pass (his A3). Swap-in later is a drop-in (`data-fg-icon` map). |
| 4 | Text on accent | #07060D | `--bg` slot (lime theme #0A0B0D, gold theme #0B0A12) | Slot semantics — on-accent tracks the theme's ink. ΔE invisible. |
| 5 | DZ banner L1/L2 | only L3 shown in file (red, white text) | L1 gold + on-accent text, L2 orange + white text (solid fills, ⚠ + label all levels) | F2 §N2 describes the 3-level ramp; L1/L2 fills inferred from the ramp colours. Flagged for the human pass. |
| 6 | Countdown sub-line copy | "3 hours left — gold alert" (annotation-style) | kept verbatim on /figma; production copy should be the dual-clock line | His sub-line reads like a spec annotation; the dual-clock variant (also his, 9:165 Normal) is the real pattern. |
| 7 | Log sheet footnote | #63637A 11px | `--faint-deco` (decorative-only token per our rules) — same value in gold theme | Token discipline: that value is below AA, so it may only carry decorative text. It is a hint line; acceptable, matches his intent. |
| 8 | Avatar initials | "BW" placeholder on every avatar | real initials (SK/YT/JP/AT) | Demo data, not a style divergence. |

**Not divergences, but noted:** gradients reproduced as two-stop
`linear-gradient` on tokens (his are identical two-stop fades);
`color-mix()` used for every @NN% stroke/fill (his opacity values kept
verbatim); Anton rendered via `text-transform: uppercase` (his frames are
pre-uppercased, Anton lowercase glyphs exist but are never used).
