#!/usr/bin/env python3
"""write_themes_bindings.py — regenerate design/themes.css from the split.

design/themes.css = the RWF BINDINGS file: it imports the portable library
(design/style-library/index.css) and then binds RWF app surfaces (fg-* figma
library, bd-* board app, pop-btn, rwf-btn, fx-*) onto each kit. Run after
split_style_library.py whenever the bindings buckets change:

    python3 scripts/styles/split_style_library.py
    python3 scripts/styles/write_themes_bindings.py

Hand-edits to binding sections belong in this script's EXTRA dict or in
themes.css directly (re-run only rewrites from the pkl + EXTRA).
"""

from __future__ import annotations
import pickle
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
LIB = ROOT / "design" / "style-library"
THEMES = ROOT / "design" / "themes.css"

# Binding sections appended verbatim after the pkl buckets, in this order.
# Used for hand-authored skins (e.g. the founder-site themes' fg/bd bindings).
EXTRA: dict[str, str] = {}

# Founder-site kits (mined 2026-09-03) — fg-* library + bd-* board skins.
# Each carries its site's recognisable DNA onto the app's real components.
EXTRA["x10"] = """
/* ── x10 · BINDINGS — the after-dark directory ────────────────────────── */
[data-theme="x10"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                       .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 700; letter-spacing: -0.01em;
}
[data-theme="x10"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot, .fg-lbrow__ruf) {
  font-family: var(--font-mono); font-size: 0.78em; letter-spacing: 0.04em;
}
[data-theme="x10"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: linear-gradient(180deg, rgba(201, 162, 78, 0.04), transparent 24%), var(--surface);
  border: 1px solid var(--line);
  border-top: 2px solid color-mix(in srgb, var(--gold) 42%, var(--line));
  border-radius: 8px;
}
[data-theme="x10"] .fg-lbrow:nth-child(even) {           /* the zebra listing */
  background: rgba(26, 34, 26, 0.5);
}
[data-theme="x10"] .fg-lbrow__rank {
  font-family: var(--font-mono); font-size: 0.8em;
  background: rgba(74, 107, 71, 0.35); border-radius: 4px;
}
[data-theme="x10"] .fg-lbrow--leader { border-left-color: var(--gold); }
[data-theme="x10"] .fg-status { font-family: var(--font-mono); border-radius: 6px; border: 1px solid color-mix(in srgb, var(--lime) 45%, var(--line)); }
[data-theme="x10"] .fg-chip { border-radius: 6px; font-family: var(--font-body); font-weight: 600; }
[data-theme="x10"] .fg-chip[aria-pressed="true"], [data-theme="x10"] .fg-chip.is-selected { box-shadow: 0 0 0 3px rgba(74, 107, 71, 0.3); }
[data-theme="x10"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  border-radius: 7px; font-weight: 600;
  box-shadow: 0 2px 12px -2px rgba(201, 162, 78, 0.3);
}
[data-theme="x10"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { transform: translateY(1px); }
[data-theme="x10"] .fg-dz { border-radius: 8px; border-left: 3px solid var(--gold); }
[data-theme="x10"] .bd-table {               /* the green index floor */
  background:
    repeating-linear-gradient(90deg, rgba(238, 242, 234, 0.03) 0 1px, transparent 1px 56px),
    radial-gradient(80% 70% at 50% 10%, rgba(110, 154, 106, 0.08), transparent 60%),
    linear-gradient(#14210f, #0e1810);
  border: 1px solid var(--line-bright);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.5);
}
[data-theme="x10"] .bd-lane { border: 1px dashed rgba(110, 154, 106, 0.28); }
[data-theme="x10"] .bd-pot {                  /* gold-rimmed listing plate */
  background: linear-gradient(180deg, #1c261b, #141c13);
  border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--line));
  border-radius: 10px;
  box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.7), 0 2px 12px -2px rgba(201, 162, 78, 0.3);
}
[data-theme="x10"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); letter-spacing: 0.12em; font-size: 0.8em; }
[data-theme="x10"] .bd-pot__total { color: var(--gold-glow); font-family: 'Space Grotesk', sans-serif; font-weight: 700; }
[data-theme="x10"] .bd-card__face--front {
  background: linear-gradient(180deg, #16211a, #101812);
  border: 1px solid var(--line-bright);
  border-top: 2px solid color-mix(in srgb, var(--gold) 45%, var(--line));
  border-radius: 8px;
}
[data-theme="x10"] .bd-card__name { color: var(--text); font-weight: 600; }
[data-theme="x10"] .bd-prow { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--lime-dim); border-radius: 6px; }
[data-theme="x10"] .bd-prow--you { border-left-color: var(--gold); }
[data-theme="x10"] .bd-tcard { border: 1px solid var(--line-bright); border-radius: 8px; background: var(--surface); }
[data-theme="x10"] .pop-btn { border-radius: 7px; font-weight: 600; box-shadow: 0 2px 12px -2px rgba(201, 162, 78, 0.3); }
"""

EXTRA["doof"] = """
/* ── doof · BINDINGS — glow-stained void ──────────────────────────────── */
[data-theme="doof"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                        .fg-event__title) {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700;
  background: var(--gradient-sacred);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
[data-theme="doof"] :is(.fg-count__time, .fg-lbrow__pct) {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: var(--cyan);
  text-shadow: 0 0 16px rgba(34, 211, 238, 0.4);
}
[data-theme="doof"] :is(.fg-battle, .fg-dialog, .fg-state) {
  background: linear-gradient(160deg, rgba(168, 85, 247, 0.08), transparent 46%, rgba(34, 211, 238, 0.04)), var(--surface);
  border: 1px solid rgba(168, 85, 247, 0.34);
  border-radius: 30px 18px 34px 20px / 20px 34px 18px 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 30px rgba(147, 51, 234, 0.2);
}
[data-theme="doof"] .fg-sheet { border-radius: 26px 16px 30px 18px / 18px 30px 16px 26px; border: 1px solid rgba(34, 211, 238, 0.28); }
[data-theme="doof"] .fg-lbrow { border-radius: 20px 12px 22px 14px / 14px 22px 12px 20px; border-left: 2px solid rgba(168, 85, 247, 0.4); }
[data-theme="doof"] .fg-lbrow--leader {
  border-left-color: var(--orange);
  background: linear-gradient(90deg, rgba(249, 115, 22, 0.1), transparent 60%), var(--surface);
  box-shadow: 0 0 22px rgba(249, 115, 22, 0.14);
}
[data-theme="doof"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 999px;
  background: var(--gradient-mystical);
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.45);
}
[data-theme="doof"] .fg-chip { border-radius: 999px; border-color: rgba(168, 85, 247, 0.3); }
[data-theme="doof"] .fg-chip[aria-pressed="true"], [data-theme="doof"] .fg-chip.is-selected {
  background: rgba(168, 85, 247, 0.16); color: var(--purple);
  box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.5), 0 0 18px rgba(168, 85, 247, 0.3);
}
[data-theme="doof"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  border: 0; border-radius: 999px;
  background: var(--gradient-mystical);
  box-shadow: 0 0 26px rgba(249, 115, 22, 0.5), 0 3px 14px rgba(234, 88, 12, 0.35);
  transition: background 0.4s var(--ease), box-shadow 0.3s var(--ease);
}
[data-theme="doof"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):hover {
  background: var(--gradient-fire);
  box-shadow: 0 0 34px rgba(168, 85, 247, 0.55);
}
[data-theme="doof"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { transform: scale(0.96); }
[data-theme="doof"] .fg-status {
  font-family: var(--font-mono); border-radius: 999px;
  color: var(--cyan); background: rgba(34, 211, 238, 0.1);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.4), 0 0 14px rgba(34, 211, 238, 0.25);
}
[data-theme="doof"] .fg-dz {
  border-radius: 18px 10px 20px 12px / 12px 20px 10px 18px;
  border: 1px solid rgba(249, 115, 22, 0.5);
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.28), rgba(168, 85, 247, 0.18)), #16161f;
  box-shadow: 0 0 26px rgba(249, 115, 22, 0.3);
}
[data-theme="doof"] .bd-table {               /* the dancefloor */
  background:
    radial-gradient(60% 44% at 30% -6%, rgba(168, 85, 247, 0.22), transparent 62%),
    radial-gradient(50% 40% at 85% 90%, rgba(34, 211, 238, 0.12), transparent 60%),
    linear-gradient(#0d0d16, #080810);
  border: 1px solid rgba(168, 85, 247, 0.4);
  box-shadow: 0 0 40px rgba(147, 51, 234, 0.18), inset 0 0 80px rgba(0, 0, 0, 0.55);
}
[data-theme="doof"] .bd-lane { border: 1px solid rgba(34, 211, 238, 0.22); border-radius: 999px; }
[data-theme="doof"] .bd-finish { background: repeating-linear-gradient(45deg, rgba(168, 85, 247, 0.5) 0 8px, transparent 8px 16px), rgba(34, 211, 238, 0.2); }
[data-theme="doof"] .bd-pot {                  /* the glow orb */
  background:
    radial-gradient(60% 60% at 32% 28%, rgba(34, 211, 238, 0.25), transparent 60%),
    linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(147, 51, 234, 0.2)), #16121f;
  border: 1px solid rgba(168, 85, 247, 0.55);
  border-radius: 34px 22px 36px 24px / 24px 36px 22px 34px;
  box-shadow: 0 0 34px rgba(147, 51, 234, 0.35), 0 14px 34px rgba(0, 0, 0, 0.6);
}
[data-theme="doof"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); font-size: 0.78em; letter-spacing: 0.14em; }
[data-theme="doof"] .bd-pot__total {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700;
  background: var(--gradient-mystical); -webkit-background-clip: text; background-clip: text; color: transparent;
}
[data-theme="doof"] .bd-card__face--front {
  background: linear-gradient(160deg, rgba(168, 85, 247, 0.16), rgba(34, 211, 238, 0.05)), #131320;
  border: 1px solid rgba(168, 85, 247, 0.45);
  border-radius: 24px 14px 26px 16px / 16px 26px 14px 24px;
  box-shadow: 0 0 22px rgba(147, 51, 234, 0.2);
}
[data-theme="doof"] .bd-card__face--back { background: repeating-linear-gradient(45deg, rgba(34, 211, 238, 0.1) 0 8px, transparent 8px 16px), #1a1030; border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 24px 14px 26px 16px / 16px 26px 14px 24px; }
[data-theme="doof"] .bd-card__name { color: var(--text); }
[data-theme="doof"] .bd-card__cost { color: var(--orange); font-family: var(--font-mono); }
[data-theme="doof"] .bd-prow { background: rgba(17, 17, 24, 0.85); border: 1px solid #1e1e2e; border-left: 3px solid var(--purple); border-radius: 18px 10px 20px 12px / 12px 20px 10px 18px; }
[data-theme="doof"] .bd-prow--you { border-left-color: var(--cyan); box-shadow: 0 0 18px rgba(34, 211, 238, 0.18); }
[data-theme="doof"] .bd-tcard { border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 20px 12px 22px 14px / 14px 22px 12px 20px; background: var(--surface); }
[data-theme="doof"] .pop-btn {
  border: 0; border-radius: 999px;
  background: var(--gradient-mystical);
  box-shadow: 0 0 26px rgba(249, 115, 22, 0.5), 0 3px 14px rgba(234, 88, 12, 0.35);
  transition: background 0.4s var(--ease), transform 0.2s var(--ease);
}
[data-theme="doof"] .pop-btn:active { transform: scale(0.95); }
"""

EXTRA["qalarc"] = """
/* ── qalarc · BINDINGS — glass on the pastel garden ────────────────────── */
[data-theme="qalarc"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                          .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'DM Serif Display', Georgia, serif; font-weight: 400;
}
[data-theme="qalarc"] :is(.fg-battle__title, .fg-sheet__title) em { color: var(--lime); font-style: italic; }
[data-theme="qalarc"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot) {
  font-family: var(--font-mono); font-size: 0.76em; letter-spacing: 0.02em;
}
[data-theme="qalarc"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: var(--glass);
  backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  box-shadow: 0 2px 16px rgba(90, 60, 120, 0.12), 0 4px 32px rgba(90, 60, 120, 0.08);
}
[data-theme="qalarc"] .fg-lbrow { border-radius: var(--pill); border: 1px solid transparent; background: rgba(255, 255, 255, 0.45); }
[data-theme="qalarc"] .fg-lbrow--leader { background: linear-gradient(90deg, var(--blush), transparent 70%), rgba(255, 255, 255, 0.55); }
[data-theme="qalarc"] .fg-lbrow__rank { border-radius: var(--pill); background: var(--lavender); color: #3d2a5e; font-weight: 600; }
[data-theme="qalarc"] :is(.fg-battle__bar, .fg-lbrow__bar) { border-radius: var(--pill); background: rgba(42, 32, 53, 0.08); }
[data-theme="qalarc"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: var(--pill);
  background: linear-gradient(90deg, #6d4fa3, #a85a68 34%, #9a6b3c 62%, #4e8d63);
}
[data-theme="qalarc"] .fg-chip { border-radius: var(--pill); border-color: var(--glass-border); background: rgba(255, 255, 255, 0.55); }
[data-theme="qalarc"] .fg-chip[aria-pressed="true"], [data-theme="qalarc"] .fg-chip.is-selected { background: var(--lavender); color: #3d2a5e; border-color: transparent; }
[data-theme="qalarc"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  border-radius: var(--pill); font-family: var(--font-body); font-weight: 600;
  box-shadow: 0 4px 18px rgba(109, 79, 163, 0.2);
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
[data-theme="qalarc"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):hover { transform: translateY(-2px); box-shadow: 0 8px 26px rgba(109, 79, 163, 0.26); }
[data-theme="qalarc"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { transform: translateY(0) scale(0.98); }
[data-theme="qalarc"] .fg-status { border-radius: var(--pill); background: var(--sky-pastel); color: #2a3a4a; font-weight: 700; }
[data-theme="qalarc"] .fg-dz { border-radius: var(--pill); background: linear-gradient(135deg, var(--blush), var(--peach)); color: #4a2a35; }
[data-theme="qalarc"] .fg-count { border-radius: var(--radius-lg); background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--glass-border); }
[data-theme="qalarc"] .fg-count__time { font-family: 'DM Serif Display', Georgia, serif; color: var(--lime); }
[data-theme="qalarc"] .bd-table {               /* the garden lawn */
  background:
    radial-gradient(70% 55% at 24% -8%, rgba(184, 232, 200, 0.5), transparent 60%),
    radial-gradient(60% 50% at 88% 96%, rgba(168, 216, 234, 0.4), transparent 62%),
    linear-gradient(#f4ecdf, #efe6d4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 32px rgba(90, 60, 120, 0.1);
}
[data-theme="qalarc"] .bd-lane { border: 1.5px dashed rgba(109, 79, 163, 0.25); border-radius: var(--pill); }
[data-theme="qalarc"] .bd-finish { background: repeating-linear-gradient(45deg, var(--blush) 0 8px, transparent 8px 16px), rgba(255,255,255,0.4); border-radius: var(--pill); }
[data-theme="qalarc"] .bd-pot {                 /* lavender glass medallion */
  background: var(--glass);
  backdrop-filter: blur(12px);
  border: 1.5px solid var(--lavender);
  border-radius: var(--pill);
  box-shadow: 0 8px 26px rgba(109, 79, 163, 0.18), 0 0 0 5px rgba(255, 255, 255, 0.5);
}
[data-theme="qalarc"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); font-size: 0.76em; letter-spacing: 0.12em; }
[data-theme="qalarc"] .bd-pot__total { font-family: 'DM Serif Display', Georgia, serif; color: var(--lime); }
[data-theme="qalarc"] .bd-card__face--front {   /* pastel-top glass card */
  background: var(--glass); backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border);
  border-top: 4px solid var(--mint);
  border-radius: var(--radius);
  box-shadow: 0 2px 16px rgba(90, 60, 120, 0.12);
}
[data-theme="qalarc"] .bd-card__face--back { background: var(--lavender); border: 1px solid var(--glass-border); border-radius: var(--radius); }
[data-theme="qalarc"] .bd-card__name { color: var(--text); font-family: var(--font-body); font-weight: 700; }
[data-theme="qalarc"] .bd-card__cost { color: #a85a68; font-weight: 700; }
[data-theme="qalarc"] .bd-prow { background: rgba(255, 255, 255, 0.55); border: 1px solid transparent; border-left: 4px solid var(--peach); border-radius: var(--pill); }
[data-theme="qalarc"] .bd-prow--you { border-left-color: var(--mint); }
[data-theme="qalarc"] .bd-tcard { border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: var(--glass); }
[data-theme="qalarc"] .pop-btn { border-radius: var(--pill); font-family: var(--font-body); font-weight: 600; box-shadow: 0 4px 18px rgba(109, 79, 163, 0.2); transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease); }
[data-theme="qalarc"] .pop-btn:active { transform: scale(0.97); }
"""

EXTRA["tradez"] = """
/* ── tradez · BINDINGS — the honest ledger ─────────────────────────────── */
[data-theme="tradez"] :is(.fg-battle__title, .fg-sheet__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Fraunces', Georgia, serif; font-weight: 800;
}
[data-theme="tradez"] :is(.fg-pwr__name, .fg-event__title) {
  font-family: 'Fraunces', Georgia, serif; font-weight: 700;
}
[data-theme="tradez"] :is(.fg-count__time, .fg-lbrow__pct) {
  font-family: 'Fraunces', Georgia, serif; font-weight: 900;
  font-variation-settings: 'opsz' 144, 'WONK' 1;
}
[data-theme="tradez"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 18px 40px -12px rgba(31, 42, 31, 0.18);
}
[data-theme="tradez"] .fg-lbrow:nth-child(even) {           /* the workbook stripe */
  background: var(--surface-2);
}
[data-theme="tradez"] .fg-lbrow__rank {
  font-family: 'Fraunces', Georgia, serif; font-weight: 800;
  background: var(--surface-2); border-radius: 6px;
}
[data-theme="tradez"] .fg-lbrow--leader { border-left-color: var(--gold); background: linear-gradient(90deg, rgba(201, 162, 78, 0.14), transparent 60%), var(--surface); }
[data-theme="tradez"] :is(.fg-battle__bar, .fg-lbrow__bar) { border-radius: 999px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
[data-theme="tradez"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 999px; background: linear-gradient(90deg, var(--lime), #5a7d56);
  box-shadow: inset 0 0 0 1px rgba(201, 162, 78, 0.45);
}
[data-theme="tradez"] .fg-chip { border-radius: 8px; border-color: var(--line-bright); background: var(--surface); font-weight: 600; }
[data-theme="tradez"] .fg-chip[aria-pressed="true"], [data-theme="tradez"] .fg-chip.is-selected { box-shadow: 0 0 0 3px rgba(74, 107, 71, 0.3); }
[data-theme="tradez"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  border-radius: 8px; font-family: 'Fraunces', Georgia, serif; font-weight: 700;
  box-shadow: 0 3px 0 rgba(31, 42, 31, 0.35);
  transition: transform 0.14s var(--ease), box-shadow 0.14s var(--ease);
}
[data-theme="tradez"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):hover { transform: translateY(-1px); box-shadow: 0 4px 0 rgba(31, 42, 31, 0.4); }
[data-theme="tradez"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(31, 42, 31, 0.35); }
[data-theme="tradez"] .fg-status { border-radius: 6px; background: color-mix(in srgb, var(--gold) 16%, var(--surface)); color: #5c470f; border: 1px solid color-mix(in srgb, var(--gold) 40%, var(--line)); font-weight: 700; }
[data-theme="tradez"] .fg-dz { border-radius: 8px; border: 1px solid rgba(163, 84, 28, 0.4); border-left: 4px solid var(--urgency); background: linear-gradient(90deg, rgba(163, 84, 28, 0.1), transparent 65%), var(--surface); color: #5e3210; }
[data-theme="tradez"] .bd-table {               /* the work site */
  background:
    repeating-linear-gradient(90deg, rgba(31, 42, 31, 0.03) 0 2px, transparent 2px 48px),
    linear-gradient(135deg, #FBF8EF 0%, #F2EEDD 100%);
  border: 2px solid var(--lime);
  border-radius: 10px;
  box-shadow: 0 18px 40px -12px rgba(31, 42, 31, 0.2);
}
[data-theme="tradez"] .bd-lane { border: 1.5px dashed rgba(61, 92, 58, 0.3); }
[data-theme="tradez"] .bd-finish { background: repeating-linear-gradient(45deg, var(--gold-glow) 0 8px, var(--lime) 8px 16px); }
[data-theme="tradez"] .bd-pot {                  /* gum-stamped quote block */
  background: linear-gradient(135deg, #1F2A1F 0%, #34402F 100%);
  border: 1px solid #1F2A1F;
  border-radius: 8px;
  box-shadow: 0 3px 0 rgba(31, 42, 31, 0.4), 0 18px 40px -12px rgba(31, 42, 31, 0.35);
}
[data-theme="tradez"] .bd-pot__label { color: rgba(251, 248, 239, 0.7); font-family: var(--font-mono); font-size: 0.76em; letter-spacing: 0.14em; }
[data-theme="tradez"] .bd-pot__total { font-family: 'Fraunces', Georgia, serif; font-weight: 900; color: var(--gold-glow); }
[data-theme="tradez"] .bd-card__face--front {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid var(--lime);
  border-radius: 8px;
  box-shadow: 0 10px 26px -10px rgba(31, 42, 31, 0.22);
}
[data-theme="tradez"] .bd-card__face--back { background: var(--lime); border: 1px solid var(--lime-dim); border-radius: 8px; }
[data-theme="tradez"] .bd-card__name { color: var(--text); font-family: 'Fraunces', Georgia, serif; font-weight: 700; }
[data-theme="tradez"] .bd-card__cost { color: #8a6e2e; font-weight: 800; }
[data-theme="tradez"] .bd-prow { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--lime); border-radius: 8px; box-shadow: 0 2px 0 rgba(31, 42, 31, 0.12); }
[data-theme="tradez"] .bd-prow--you { border-left-color: var(--gold); }
[data-theme="tradez"] .bd-tcard { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 26px -10px rgba(31, 42, 31, 0.2); }
[data-theme="tradez"] .pop-btn { border-radius: 8px; font-family: 'Fraunces', Georgia, serif; font-weight: 700; box-shadow: 0 3px 0 rgba(31, 42, 31, 0.35); transition: transform 0.14s var(--ease), box-shadow 0.14s var(--ease); }
[data-theme="tradez"] .pop-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(31, 42, 31, 0.35); }
"""

EXTRA["gmux"] = """
/* ── gmux · BINDINGS — paper terminal ──────────────────────────────────── */
[data-theme="gmux"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                        .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: var(--font-mono); font-weight: 700; letter-spacing: -0.02em;
}
[data-theme="gmux"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot, .fg-lbrow__ruf) {
  font-family: var(--font-mono); font-size: 0.76em; letter-spacing: 0.03em;
}
[data-theme="gmux"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-top: 2px solid var(--lime);
  border-radius: 8px;
  box-shadow: 0 8px 22px -10px rgba(26, 32, 26, 0.22);
}
[data-theme="gmux"] .fg-lbrow { border: 1px solid var(--rule); border-radius: var(--pill); background: var(--paper); }
[data-theme="gmux"] .fg-lbrow::before {          /* the agent status dot */
  content: ""; width: 8px; height: 8px; border-radius: 50%; align-self: center;
  background: var(--idle); margin-right: 4px; flex: none;
}
[data-theme="gmux"] .fg-lbrow--leader { border-color: color-mix(in srgb, var(--lime) 55%, var(--rule)); }
[data-theme="gmux"] .fg-lbrow--leader::before { background: var(--ok); box-shadow: 0 0 8px rgba(46, 107, 64, 0.5); }
[data-theme="gmux"] .fg-lbrow__rank { font-family: var(--font-mono); background: var(--surface-2); border-radius: 4px; }
[data-theme="gmux"] :is(.fg-battle__bar, .fg-lbrow__bar) { border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--rule); height: 10px; }
[data-theme="gmux"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {  /* segmented — no gradient */
  border-radius: 2px;
  background: repeating-linear-gradient(90deg, rgba(250, 251, 243, 0.85) 0 2px, transparent 2px 10px), var(--lime);
}
[data-theme="gmux"] .fg-chip { font-family: var(--font-mono); font-size: 0.82em; border-radius: var(--pill); border: 1px solid var(--rule); background: var(--paper); }
[data-theme="gmux"] .fg-chip::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--idle); margin-right: 6px; vertical-align: 1px; }
[data-theme="gmux"] .fg-chip[aria-pressed="true"], [data-theme="gmux"] .fg-chip.is-selected { color: var(--lime); border-color: color-mix(in srgb, var(--lime) 60%, var(--rule)); }
[data-theme="gmux"] .fg-chip[aria-pressed="true"]::before, [data-theme="gmux"] .fg-chip.is-selected::before { background: var(--ok); box-shadow: 0 0 6px rgba(46, 107, 64, 0.5); }
[data-theme="gmux"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.9em;
  border-radius: 6px; border: 1px solid color-mix(in srgb, var(--lime) 55%, var(--rule));
  box-shadow: 0 2px 0 rgba(26, 32, 26, 0.16);
  transition: box-shadow 0.1s steps(2, end), transform 0.1s steps(2, end);
}
[data-theme="gmux"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { transform: translateY(2px); box-shadow: 0 0 0 rgba(26, 32, 26, 0); }
[data-theme="gmux"] .fg-status { font-family: var(--font-mono); border-radius: var(--pill); background: color-mix(in srgb, var(--wait) 12%, var(--paper)); color: #5c430e; border: 1px solid color-mix(in srgb, var(--wait) 40%, var(--rule)); }
[data-theme="gmux"] .fg-dz { font-family: var(--font-mono); border-radius: 6px; border: 1px solid color-mix(in srgb, var(--alert) 45%, var(--rule)); border-left: 4px solid var(--alert); background: color-mix(in srgb, var(--alert) 8%, var(--paper)); color: #5e2d1a; }
[data-theme="gmux"] .fg-count { border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); }
[data-theme="gmux"] .fg-count__time { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink, var(--text)); text-shadow: 0 1px 0 rgba(212, 168, 74, 0.35); }
[data-theme="gmux"] .bd-table {                 /* the clearing floor */
  background:
    radial-gradient(circle at 1px 1px, rgba(26, 32, 26, 0.08) 1px, transparent 1.6px) 0 0/22px 22px,
    linear-gradient(#f4f6ec, #edefe6);
  border: 1px solid var(--rule);
  border-top: 3px solid var(--lime);
  border-radius: 8px;
  box-shadow: 0 8px 22px -10px rgba(26, 32, 26, 0.22);
}
[data-theme="gmux"] .bd-lane { border: 1px dashed rgba(46, 107, 64, 0.3); }
[data-theme="gmux"] .bd-finish { background: repeating-linear-gradient(45deg, var(--wait) 0 8px, var(--paper) 8px 16px); }
[data-theme="gmux"] .bd-pot {                    /* the terminal readout */
  background: var(--paper);
  border: 1px solid var(--rule);
  border-top: 3px solid var(--lime);
  border-radius: 8px;
  box-shadow: 0 8px 22px -10px rgba(26, 32, 26, 0.3);
}
[data-theme="gmux"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); font-size: 0.72em; letter-spacing: 0.16em; text-transform: uppercase; }
[data-theme="gmux"] .bd-pot__total { font-family: var(--font-mono); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink, var(--text)); text-shadow: 0 1px 0 rgba(212, 168, 74, 0.4); }
[data-theme="gmux"] .bd-card__face--front {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-top: 3px solid var(--wait);
  border-radius: 8px;
}
[data-theme="gmux"] .bd-card__face--back { background: var(--surface-2); border: 1px solid var(--rule); border-radius: 8px; }
[data-theme="gmux"] .bd-card__name { color: var(--text); font-family: var(--font-mono); font-weight: 600; font-size: 0.95em; }
[data-theme="gmux"] .bd-card__cost { color: var(--alert); font-family: var(--font-mono); }
[data-theme="gmux"] .bd-prow { background: var(--paper); border: 1px solid var(--rule); border-left: 3px solid var(--idle); border-radius: var(--pill); }
[data-theme="gmux"] .bd-prow--you { border-left-color: var(--ok); }
[data-theme="gmux"] .bd-tcard { border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); }
[data-theme="gmux"] .pop-btn { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--lime) 55%, var(--rule)); box-shadow: 0 2px 0 rgba(26, 32, 26, 0.16); transition: box-shadow 0.1s steps(2, end), transform 0.1s steps(2, end); }
[data-theme="gmux"] .pop-btn:active { transform: translateY(2px); box-shadow: none; }
"""

EXTRA["volkus"] = """
/* ── volkus · BINDINGS — the portrait wall ─────────────────────────────── */
[data-theme="volkus"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                          .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: Georgia, serif; font-style: italic; font-weight: 400; letter-spacing: 0.01em;
}
[data-theme="volkus"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot, .fg-lbrow__ruf) {
  font-family: 'Courier New', monospace; font-size: 0.78em; letter-spacing: 0.02em;
}
[data-theme="volkus"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: linear-gradient(180deg, rgba(240, 196, 154, 0.03), transparent 20%), var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: 0 14px 34px -14px rgba(0, 0, 0, 0.8);
}
[data-theme="volkus"] .fg-lbrow { border: 1px solid var(--line); border-radius: 6px; background: transparent; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+1) .fg-lbrow__rank { background: var(--skin-white); color: #3a2a18; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+2) .fg-lbrow__rank { background: var(--skin-east-asian); color: #3a2414; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+3) .fg-lbrow__rank { background: var(--skin-latino); color: #2c180a; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+4) .fg-lbrow__rank { background: var(--skin-s-asian); color: #140a04; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+5) .fg-lbrow__rank { background: var(--skin-mixed); color: #f5e8dc; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+6) .fg-lbrow__rank { background: var(--skin-m-east); color: #f5e8dc; }
[data-theme="volkus"] .fg-lbrow:nth-child(8n+7) .fg-lbrow__rank { background: var(--skin-black-l); color: #f5e8dc; }
[data-theme="volkus"] .fg-lbrow__rank { border-radius: 4px; font-family: Georgia, serif; font-style: italic; }
[data-theme="volkus"] .fg-lbrow--leader { border-color: rgba(240, 196, 154, 0.4); }
[data-theme="volkus"] :is(.fg-battle__bar, .fg-lbrow__bar) { border-radius: 3px; background: #1a1a1a; box-shadow: inset 0 0 0 1px var(--line); }
[data-theme="volkus"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {   /* every bar is people */
  border-radius: 3px; background: var(--skin-ramp);
}
[data-theme="volkus"] .fg-chip { font-family: 'Courier New', monospace; font-size: 0.82em; border-radius: 999px; border: 1px solid var(--line-bright); background: transparent; }
[data-theme="volkus"] .fg-chip[aria-pressed="true"], [data-theme="volkus"] .fg-chip.is-selected { background: var(--skin-black-d); color: var(--sky); border-color: transparent; }
[data-theme="volkus"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  font-family: Georgia, serif; font-style: italic;
  border-radius: 6px; border: 1px solid rgba(194, 120, 64, 0.55);
  background: rgba(194, 120, 64, 0.12); color: var(--text);
  box-shadow: none; transition: background 0.2s ease, color 0.2s ease;
}
[data-theme="volkus"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):hover { background: var(--lime); color: var(--on-accent); }
[data-theme="volkus"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):active { background: var(--lime-dim); color: var(--on-accent); }
[data-theme="volkus"] .fg-status { font-family: 'Courier New', monospace; border-radius: 4px; border: 1px solid rgba(240, 196, 154, 0.4); color: var(--sky); }
[data-theme="volkus"] .fg-dz { font-family: 'Courier New', monospace; border-radius: 4px; border: 1px solid rgba(212, 85, 46, 0.5); border-left: 4px solid var(--coral); background: linear-gradient(90deg, rgba(212, 85, 46, 0.12), transparent 70%), var(--surface); }
[data-theme="volkus"] .fg-count { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
[data-theme="volkus"] .fg-count__time { font-family: Georgia, serif; font-style: italic; color: var(--sky); }
[data-theme="volkus"] .bd-table {               /* the quiet gallery floor */
  background:
    radial-gradient(60% 46% at 50% -6%, rgba(194, 120, 64, 0.1), transparent 62%),
    linear-gradient(#121212, #0d0d0d 70%);
  border: 1px solid var(--line-bright);
  border-radius: 6px;
  box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.9);
}
[data-theme="volkus"] .bd-lane { border: 1px solid rgba(240, 196, 154, 0.14); border-radius: 4px; }
[data-theme="volkus"] .bd-finish { background: var(--skin-ramp); border-radius: 2px; }
[data-theme="volkus"] .bd-pot {                  /* the warm spotlight plate */
  background: linear-gradient(180deg, rgba(240, 196, 154, 0.07), transparent 40%), var(--surface);
  border: 1px solid var(--line-bright);
  border-top: 3px solid transparent;
  border-image: var(--skin-ramp) 1;
  border-image-slice: 1 0 0 0;
  box-shadow: 0 14px 34px -14px rgba(0, 0, 0, 0.9);
}
[data-theme="volkus"] .bd-pot__label { color: var(--muted); font-family: 'Courier New', monospace; font-size: 0.76em; letter-spacing: 0.14em; }
[data-theme="volkus"] .bd-pot__total { font-family: Georgia, serif; font-style: italic; color: var(--sky); }
[data-theme="volkus"] .bd-card__face--front {
  background: linear-gradient(180deg, rgba(240, 196, 154, 0.03), transparent 24%), var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid transparent;
  border-image: var(--skin-ramp) 1;
  border-image-slice: 1 0 0 0;
}
[data-theme="volkus"] .bd-card__face--back { background: #241a12; border: 1px solid var(--line); }
[data-theme="volkus"] .bd-card__name { color: var(--text); font-family: Georgia, serif; }
[data-theme="volkus"] .bd-card__cost { color: var(--coral); font-family: 'Courier New', monospace; }
[data-theme="volkus"] .bd-prow { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--skin-s-asian); border-radius: 4px; }
[data-theme="volkus"] .bd-prow--you { border-left-color: var(--sky); }
[data-theme="volkus"] .bd-tcard { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
[data-theme="volkus"] .pop-btn { font-family: Georgia, serif; font-style: italic; border-radius: 6px; border: 1px solid rgba(194, 120, 64, 0.55); background: rgba(194, 120, 64, 0.12); color: var(--text); box-shadow: none; transition: background 0.2s ease, color 0.2s ease; }
[data-theme="volkus"] .pop-btn:hover { background: var(--lime); color: var(--on-accent); }
[data-theme="volkus"] .pop-btn:active { background: var(--lime-dim); color: var(--on-accent); }
"""

EXTRA["endispute"] = """
/* ── endispute · BINDINGS — the signed brief ───────────────────────────── */
[data-theme="endispute"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                             .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; font-size: 1.35em; letter-spacing: 0.01em;
}
[data-theme="endispute"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot, .fg-lbrow__ruf) {
  font-family: var(--font-mono); font-size: 0.76em; letter-spacing: 0.08em;
}
[data-theme="endispute"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  background: var(--surface);
  border: 1px solid var(--ink);
  border-radius: 0;
  box-shadow: 0 0 0 4px var(--bg), 0 0 0 5px var(--gold-rule);
}
[data-theme="endispute"] .fg-lbrow { border: none; border-bottom: 1px solid color-mix(in srgb, var(--ink) 25%, var(--bg)); border-radius: 0; }   /* ledger rows */
[data-theme="endispute"] .fg-lbrow__rank { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; color: var(--lime-dim); }
[data-theme="endispute"] .fg-lbrow--leader { background: color-mix(in srgb, var(--gold-rule) 10%, var(--surface)); }
[data-theme="endispute"] :is(.fg-battle__bar, .fg-lbrow__bar) { border: 1px solid var(--ink); border-radius: 0; background: var(--surface-2); }
[data-theme="endispute"] :is(.fg-battle__bar i, .fg-lbrow__bar i) { border-radius: 0; background: linear-gradient(90deg, var(--lime), var(--gold-rule)); }
[data-theme="endispute"] .fg-chip { font-family: var(--font-mono); font-size: 0.8em; letter-spacing: 0.06em; border: none; border-radius: 0; background: transparent; color: var(--ink); }
[data-theme="endispute"] .fg-chip::before { content: "[ "; color: var(--lime-dim); }
[data-theme="endispute"] .fg-chip::after { content: " ]"; color: var(--lime-dim); }
[data-theme="endispute"] .fg-chip[aria-pressed="true"], [data-theme="endispute"] .fg-chip.is-selected { color: var(--lime-dim); font-weight: 600; }
[data-theme="endispute"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta) {
  font-family: var(--font-body); font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.86em;
  border-radius: 0; border: 1px solid var(--ink); background: var(--ink); color: var(--bg);
  box-shadow: none; transition: box-shadow 0.18s ease;
}
[data-theme="endispute"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta, .fg-pro__cta, .fg-state__cta):hover { box-shadow: inset 0 -3px 0 var(--gold-rule); }
[data-theme="endispute"] .fg-status { font-family: var(--font-mono); border-radius: 0; border: 1px solid var(--gold-rule); color: var(--lime-dim); background: rgba(212, 161, 74, 0.1); }
[data-theme="endispute"] .fg-dz {                 /* the red-stamp clause */
  font-family: var(--font-mono); font-weight: 600; letter-spacing: 0.1em;
  border-radius: 0; border: 2px solid var(--coral); background: transparent; color: var(--coral);
  box-shadow: 3px 3px 0 rgba(138, 45, 22, 0.25);
}
[data-theme="endispute"] .fg-count { border: 1px solid var(--ink); border-radius: 0; background: var(--surface); box-shadow: 0 0 0 3px var(--bg), 0 0 0 4px var(--gold-rule); }
[data-theme="endispute"] .fg-count__time { font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: var(--ink); }
[data-theme="endispute"] .bd-table {              /* the negotiation table = a document */
  background:
    repeating-linear-gradient(180deg, transparent 0 27px, rgba(10, 10, 10, 0.05) 27px 28px),
    var(--surface);
  border: 1px solid var(--ink);
  border-radius: 0;
  box-shadow: 0 0 0 5px var(--bg), 0 0 0 6px var(--gold-rule), 0 26px 60px -18px rgba(10, 10, 10, 0.4);
}
[data-theme="endispute"] .bd-lane { border: 1px solid color-mix(in srgb, var(--ink) 22%, transparent); }
[data-theme="endispute"] .bd-finish { background: repeating-linear-gradient(45deg, var(--gold-rule) 0 8px, var(--surface) 8px 16px); }
[data-theme="endispute"] .bd-pot {                /* the executed clause */
  background: var(--surface);
  border: 1px solid var(--ink); border-radius: 0;
  box-shadow: 0 0 0 4px var(--bg), 0 0 0 5px var(--gold-rule), 0 18px 44px -14px rgba(10, 10, 10, 0.35);
}
[data-theme="endispute"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); font-size: 0.72em; letter-spacing: 0.18em; text-transform: uppercase; }
[data-theme="endispute"] .bd-pot__total { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; color: var(--ink); }
[data-theme="endispute"] .bd-card__face--front {  /* letterhead card */
  background: var(--surface);
  border: 1px solid var(--ink);
  border-top: 3px double var(--gold-rule);
  border-radius: 0;
  box-shadow: 2px 2px 0 rgba(10, 10, 10, 0.12);
}
[data-theme="endispute"] .bd-card__face--back { background: color-mix(in srgb, var(--gold-rule) 22%, var(--surface)); border: 1px solid var(--ink); border-radius: 0; }
[data-theme="endispute"] .bd-card__name { color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; }
[data-theme="endispute"] .bd-card__cost { color: var(--coral); font-family: var(--font-mono); font-weight: 600; }
[data-theme="endispute"] .bd-prow { background: var(--surface); border: none; border-bottom: 1px solid color-mix(in srgb, var(--ink) 25%, transparent); border-left: 3px solid var(--lime); border-radius: 0; }
[data-theme="endispute"] .bd-prow--you { border-left-color: var(--gold-rule); }
[data-theme="endispute"] .bd-tcard { border: 1px solid var(--ink); border-radius: 0; background: var(--surface); box-shadow: 2px 2px 0 var(--gold-rule); }
[data-theme="endispute"] .pop-btn {
  font-family: var(--font-body); font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em;
  border-radius: 0; border: 1px solid var(--ink); background: var(--ink); color: var(--bg);
  box-shadow: none; transition: box-shadow 0.18s ease;
}
[data-theme="endispute"] .pop-btn:hover { box-shadow: inset 0 -3px 0 var(--gold-rule); }
[data-theme="endispute"] .pop-btn:active { background: #262626; }
"""

# ── Sports Poster variants (2026-09-03) — four readings of the founder's
# "harsh poster + soft underbelly" brief, structurally distinct from the
# original neobrut AND each other (field/zine/ticket/locker). ─────────────
EXTRA["neobrut-field"] = """
/* ── neobrut-field · BINDINGS — the stadium take (sports side dominant) ─ */
[data-theme="neobrut-field"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                                 .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Anton', 'Archivo', sans-serif;
  text-transform: uppercase; letter-spacing: 0.02em; line-height: 0.96;
}
[data-theme="neobrut-field"] :is(.fg-count__time, .fg-lbrow__pct, .fg-lbrow__ruf) {
  font-family: 'Anton', 'Archivo', sans-serif;
  text-shadow: 3px 3px 0 rgba(156, 61, 24, 0.4);
}
[data-theme="neobrut-field"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot) {
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.8em;
}
[data-theme="neobrut-field"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  border: 2.5px solid var(--line);
  border-radius: 18px;
  background:
    radial-gradient(circle at 1.4px 1.4px, rgba(20, 27, 13, 0.08) 1.4px, transparent 2px) 0 0/11px 11px,
    var(--surface);
  box-shadow: 6px 6px 0 rgba(156, 61, 24, 0.24);        /* ONE warm plate */
}
[data-theme="neobrut-field"] .fg-count {                /* the scoreboard module */
  border: 2.5px solid var(--line); border-radius: 16px;
  background: var(--line);
  box-shadow: 6px 6px 0 rgba(156, 61, 24, 0.24);
}
[data-theme="neobrut-field"] .fg-count__time { color: #f7c948; text-shadow: none; }
[data-theme="neobrut-field"] .fg-count__sub { color: rgba(248, 250, 238, 0.75); }
[data-theme="neobrut-field"] :is(.fg-battle__bar, .fg-lbrow__bar) {
  border: 2.5px solid var(--line); border-radius: 999px;
  background: var(--surface-2); padding: 2px;
}
[data-theme="neobrut-field"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 999px;
  background: repeating-linear-gradient(-45deg, #2b7a40 0 10px, #236a37 10px 20px);  /* mown turf */
  transition: width 0.55s cubic-bezier(0.34, 1.4, 0.5, 1);
}
[data-theme="neobrut-field"] .fg-lbrow { border-bottom: 1.5px solid rgba(20, 27, 13, 0.35); border-radius: 0; }
[data-theme="neobrut-field"] .fg-lbrow__rank {
  font-family: 'Anton', sans-serif; color: var(--on-accent); background: var(--lime);
  border-radius: 999px; padding: 2px 8px;
}
[data-theme="neobrut-field"] .fg-lbrow--leader {
  border-left: 5px solid var(--coral);
  background: linear-gradient(90deg, rgba(156, 61, 24, 0.08), transparent 55%), var(--surface);
}
[data-theme="neobrut-field"] .fg-event { border-left: 4px solid var(--coral); border-radius: 4px 12px 12px 4px; }
[data-theme="neobrut-field"] .fg-status {
  font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
  border: 2px solid var(--line); border-radius: 999px; background: var(--surface);
}
[data-theme="neobrut-field"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                 .fg-pro__cta, .fg-state__cta) {
  font-family: 'Anton', 'Archivo', sans-serif; text-transform: uppercase; letter-spacing: 0.04em;
  border: 2.5px solid var(--line); border-radius: 14px;        /* badge, not pill */
  box-shadow: 4px 4px 0 var(--line);
  transition: transform 0.4s cubic-bezier(0.34, 1.4, 0.5, 1), box-shadow 0.4s cubic-bezier(0.34, 1.4, 0.5, 1);
}
[data-theme="neobrut-field"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                 .fg-pro__cta, .fg-state__cta):hover {
  transform: translateY(-3px) rotate(-0.5deg); box-shadow: 6px 7px 0 var(--line);
}
[data-theme="neobrut-field"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                 .fg-pro__cta, .fg-state__cta):active {
  transform: translateY(2px); box-shadow: 2px 2px 0 var(--line);
}
[data-theme="neobrut-field"] .pop-btn {
  border: 2.5px solid var(--line); border-radius: 14px;
  box-shadow: 4px 4px 0 var(--line);
  font-family: 'Anton', 'Archivo', sans-serif; text-transform: uppercase; letter-spacing: 0.04em;
  transition: transform 0.4s cubic-bezier(0.34, 1.4, 0.5, 1), box-shadow 0.4s cubic-bezier(0.34, 1.4, 0.5, 1);
}
[data-theme="neobrut-field"] .pop-btn:active { transform: translateY(2px); box-shadow: 2px 2px 0 var(--line); }
[data-theme="neobrut-field"] .fg-dz {
  font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: #5c3a00; font-family: var(--font-mono); font-size: 0.85em;
  background: repeating-linear-gradient(-45deg, rgba(156, 61, 24, 0.14) 0 12px, transparent 12px 24px), var(--dz-hero);
  border: 2.5px solid var(--line); border-radius: 12px;
}
[data-theme="neobrut-field"] .bd-table {             /* THE PITCH — mown stripes */
  background:
    repeating-linear-gradient(90deg, rgba(248, 250, 238, 0.05) 0 26px, transparent 26px 52px),
    radial-gradient(80% 70% at 50% 12%, rgba(248, 250, 238, 0.12), transparent 60%),
    linear-gradient(#2e7c42, #226033);   /* hard turf — var(--felt) is remapped by board.css */
  border: 4px solid var(--rail);
  box-shadow: 7px 7px 0 rgba(156, 61, 24, 0.3);
}
[data-theme="neobrut-field"] .bd-lane { border: 1.5px solid var(--felt-line); }
[data-theme="neobrut-field"] .bd-lane:nth-child(even) { border-color: rgba(248, 250, 238, 0.2); }
[data-theme="neobrut-field"] .bd-finish { background: repeating-linear-gradient(45deg, var(--chip-white) 0 8px, var(--lane) 8px 16px); }
[data-theme="neobrut-field"] .bd-pot {               /* the trophy plate + roundel */
  position: relative;
  background: #f8faee;
  border: 2.5px solid var(--line); border-radius: 14px;
  box-shadow: 5px 5px 0 rgba(156, 61, 24, 0.28);
}
[data-theme="neobrut-field"] .bd-pot::after {          /* the team roundel */
  content: "◈";
  position: absolute; top: -11px; right: -10px;
  width: 28px; height: 28px; display: grid; place-items: center;
  background: var(--chip-gold, #d9a521); color: #141b0d; font-size: 13px;
  border: 2.5px solid var(--line); border-radius: 999px;
  box-shadow: 0 0 0 3px var(--chip-white), 2px 3px 0 rgba(20, 27, 13, 0.8);
  transform: rotate(-6deg);
}
[data-theme="neobrut-field"] .bd-pot__label { color: var(--line); font-family: 'Anton', sans-serif; letter-spacing: 0.14em; }
[data-theme="neobrut-field"] .bd-pot__total { color: var(--coral); font-family: 'Anton', sans-serif; text-shadow: 3px 3px 0 rgba(30, 107, 51, 0.35); }
[data-theme="neobrut-field"] .bd-pot__pts { color: var(--text); }
[data-theme="neobrut-field"] .bd-card__face--front { /* the TICKET STUB — punched + perforated */
  background:
    linear-gradient(90deg, transparent calc(50% - 0.75px), rgba(20, 27, 13, 0.4) calc(50% - 0.75px) calc(50% + 0.75px), transparent calc(50% + 0.75px)) 0 12px / 100% calc(100% - 24px) no-repeat,
    radial-gradient(circle at 1.4px 1.4px, rgba(20, 27, 13, 0.08) 1.4px, transparent 2px) 0 0/11px 11px,
    var(--card-face);
  border: 2.5px solid var(--line); border-radius: 12px;
  box-shadow: 4px 4px 0 rgba(156, 61, 24, 0.28);
  -webkit-mask: radial-gradient(circle 7px at 0 50%, transparent 6.5px, #000 7px),
                radial-gradient(circle 7px at 100% 50%, transparent 6.5px, #000 7px);
  -webkit-mask-composite: source-in;
  mask: radial-gradient(circle 7px at 0 50%, transparent 6.5px, #000 7px),
        radial-gradient(circle 7px at 100% 50%, transparent 6.5px, #000 7px);
  mask-composite: intersect;
}
[data-theme="neobrut-field"] .bd-card__rar { font-family: var(--font-mono); font-size: 0.72em; letter-spacing: 0.14em; text-transform: uppercase; border-bottom: 1.5px dashed rgba(20, 27, 13, 0.4); padding-bottom: 3px; }
[data-theme="neobrut-field"] .bd-card__name { color: var(--line); font-family: 'Anton', sans-serif; text-transform: uppercase; }
[data-theme="neobrut-field"] .bd-card__fx { color: var(--muted); }
[data-theme="neobrut-field"] .bd-card__cost { color: var(--coral); font-weight: 800; }
[data-theme="neobrut-field"] .bd-card__face--back {
  background: repeating-linear-gradient(90deg, rgba(248, 250, 238, 0.1) 0 13px, transparent 13px 26px), var(--card-back-1);
  border: 2.5px solid var(--line); border-radius: 10px;
}
[data-theme="neobrut-field"] .bd-prow { border: 1.5px solid var(--line); border-left: 5px solid var(--line); border-radius: 12px; background: var(--surface); }
[data-theme="neobrut-field"] .bd-prow--you { border-left-color: var(--lime); }
[data-theme="neobrut-field"] .bd-prow__pos { font-family: 'Anton', sans-serif; color: var(--lime-dim); }
[data-theme="neobrut-field"] .bd-top { border-bottom: 2.5px solid var(--line); }
[data-theme="neobrut-field"] .bd-clock { background: var(--line); border-radius: 10px; border: 2px solid var(--line); }
[data-theme="neobrut-field"] .bd-clock__time { color: #f7c948; font-family: var(--font-mono); }
[data-theme="neobrut-field"] .bd-clock__lap { color: rgba(248, 250, 238, 0.7); font-family: var(--font-mono); }
[data-theme="neobrut-field"] .bd-tcard { border: 2.5px solid var(--line); border-radius: 16px; box-shadow: 5px 5px 0 rgba(156, 61, 24, 0.26); }
[data-theme="neobrut-field"] .bd-tcard__felt {
  background:
    repeating-linear-gradient(90deg, rgba(248, 250, 238, 0.08) 0 7px, transparent 7px 14px),
    var(--felt);
  border: 1.5px solid var(--line); border-radius: 8px;
}
[data-theme="neobrut-field"] .bd-tcard__status { border: 2px solid var(--line); border-radius: 999px; }
[data-theme="neobrut-field"] .bd-card--deal { animation: matFieldBounce 0.55s cubic-bezier(0.34, 1.4, 0.5, 1) both; }
"""

EXTRA["neobrut-zine"] = """
/* ── neobrut-zine · BINDINGS — the print-shop take (poster side dominant) */
[data-theme="neobrut-zine"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                                .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Space Mono', 'Courier New', monospace;
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em; line-height: 1.05;
}
[data-theme="neobrut-zine"] :is(.fg-count__time, .fg-lbrow__pct, .fg-lbrow__ruf) {
  font-family: 'Space Mono', monospace; font-weight: 700;
  text-shadow: 2.5px 0 0 var(--misreg-c), -2.5px 0 0 var(--misreg-m);   /* misregistered plates */
}
[data-theme="neobrut-zine"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot) {
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.78em;
}
[data-theme="neobrut-zine"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  border: 2px solid var(--line);
  border-radius: 16px 6px 20px 8px / 7px 18px 6px 15px;              /* torn */
  background:
    radial-gradient(circle at 1.1px 1.1px, rgba(32, 29, 26, 0.07) 1.1px, transparent 1.7px) 0 0/6px 6px,
    var(--surface);
  box-shadow: 3px 0 0 var(--misreg-c), -3px 0 0 var(--misreg-m), 7px 9px 14px rgba(32, 29, 26, 0.22);
  transform: rotate(-0.25deg);
}
[data-theme="neobrut-zine"] .fg-count {
  border: 2px solid var(--line);
  border-radius: 14px 6px 16px 7px / 6px 14px 7px 12px;
  background:
    radial-gradient(circle at 1.1px 1.1px, rgba(32, 29, 26, 0.06) 1.1px, transparent 1.7px) 0 0/6px 6px,
    var(--surface);
  box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m);
}
[data-theme="neobrut-zine"] :is(.fg-battle__bar, .fg-lbrow__bar) {
  border: 2px solid var(--line); border-radius: 6px 3px 7px 4px;
  background: var(--surface-2); padding: 2px;
}
[data-theme="neobrut-zine"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: inherit;
  background: repeating-linear-gradient(-55deg, #d61f7d 0 9px, #b8166a 9px 18px);   /* riso ink */
  transition: width 0.6s cubic-bezier(0.3, 1.4, 0.5, 1);
}
[data-theme="neobrut-zine"] .fg-lbrow { border-bottom: 1.5px dashed rgba(32, 29, 26, 0.4); border-radius: 0; }
[data-theme="neobrut-zine"] .fg-lbrow__rank { font-family: 'Space Mono', monospace; color: var(--lime-dim); }
[data-theme="neobrut-zine"] .fg-lbrow--leader {
  background: linear-gradient(180deg, transparent 68%, rgba(214, 31, 125, 0.35) 68%);  /* marker swipe */
}
[data-theme="neobrut-zine"] .fg-event {
  border-left: 4px solid var(--lime);
  border-radius: 5px 12px 12px 5px;
  transform: rotate(-0.3deg);
}
[data-theme="neobrut-zine"] .fg-status {
  font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
  border: 2px dashed var(--line); border-radius: 5px; background: var(--surface);
  transform: rotate(-1deg);
}
[data-theme="neobrut-zine"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                .fg-pro__cta, .fg-state__cta) {
  font-family: 'Space Mono', monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  border: 2px solid var(--line); border-radius: 10px 5px 12px 6px / 5px 11px 6px 10px;
  box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m), 4px 5px 0 rgba(32, 29, 26, 0.85);
  text-shadow: 1px 1px 0 rgba(32, 29, 26, 0.55);
  transition: transform 0.3s cubic-bezier(0.3, 1.4, 0.5, 1), box-shadow 0.3s cubic-bezier(0.3, 1.4, 0.5, 1);
}
[data-theme="neobrut-zine"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                .fg-pro__cta, .fg-state__cta):hover {
  transform: rotate(-1deg) translateY(-2px);
}
[data-theme="neobrut-zine"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                .fg-pro__cta, .fg-state__cta):active {
  transform: translate(2px, 2px) rotate(0.4deg);
  box-shadow: 1px 0 0 var(--misreg-c), -1px 0 0 var(--misreg-m), 1px 2px 0 rgba(32, 29, 26, 0.85);
}
[data-theme="neobrut-zine"] .pop-btn {
  border: 2px solid var(--line); border-radius: 10px 5px 12px 6px / 5px 11px 6px 10px;
  box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m), 4px 5px 0 rgba(32, 29, 26, 0.85);
  font-family: 'Space Mono', monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  text-shadow: 1px 1px 0 rgba(32, 29, 26, 0.55);
  transition: transform 0.3s cubic-bezier(0.3, 1.4, 0.5, 1), box-shadow 0.3s cubic-bezier(0.3, 1.4, 0.5, 1);
}
[data-theme="neobrut-zine"] .pop-btn:active {
  transform: translate(2px, 2px) rotate(0.4deg);
  box-shadow: 1px 0 0 var(--misreg-c), -1px 0 0 var(--misreg-m), 1px 2px 0 rgba(32, 29, 26, 0.85);
}
[data-theme="neobrut-zine"] .fg-dz {
  font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--on-accent); background: var(--danger);
  border: 2px solid var(--line); border-radius: 7px 3px 8px 4px;
  box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m);
  text-shadow: 1px 1px 0 rgba(32, 29, 26, 0.6);
}
[data-theme="neobrut-zine"] .bd-table {             /* the photocopied pitch */
  background:
    radial-gradient(circle at 1.3px 1.3px, rgba(233, 230, 222, 0.09) 1.3px, transparent 2px) 0 0/7px 7px,
    repeating-linear-gradient(90deg, rgba(233, 230, 222, 0.05) 0 2px, transparent 2px 46px),
    linear-gradient(#3c4a44, #2e3a35);   /* hard riso teal-black */
  border: 3px solid var(--rail);
  box-shadow: 3px 0 0 var(--misreg-c), -3px 0 0 var(--misreg-m), 8px 9px 0 rgba(32, 29, 26, 0.75);
}
[data-theme="neobrut-zine"] .bd-lane { border: 1.5px dashed var(--felt-line); box-shadow: 2px 0 0 rgba(214, 31, 125, 0.28); }
[data-theme="neobrut-zine"] .bd-finish { background: repeating-linear-gradient(45deg, var(--chip-white) 0 7px, transparent 7px 14px); border-right: 1.5px dashed var(--rail); }
[data-theme="neobrut-zine"] .bd-pot {               /* the pasted plate */
  position: relative;
  background:
    radial-gradient(circle at 1.1px 1.1px, rgba(32, 29, 26, 0.07) 1.1px, transparent 1.7px) 0 0/6px 6px,
    #e9e6de;   /* hard copier paper — var(--card-face) is remapped by board.css */
  border: 2px solid var(--line); border-radius: 16px 6px 18px 8px / 7px 16px 6px 14px;
  box-shadow: 3px 0 0 var(--misreg-c), -3px 0 0 var(--misreg-m), 6px 8px 12px rgba(32, 29, 26, 0.3);
  transform: translate(-50%, -50%) rotate(-0.5deg);   /* keep the base centring */
}
[data-theme="neobrut-zine"] .bd-pot__label { color: var(--muted); font-family: 'Space Mono', monospace; letter-spacing: 0.18em; font-size: 0.78em; }
[data-theme="neobrut-zine"] .bd-pot__total { color: var(--line); font-family: 'Space Mono', monospace; font-weight: 700; text-shadow: 2.5px 0 0 var(--misreg-c), -2.5px 0 0 var(--misreg-m); }
[data-theme="neobrut-zine"] .bd-pot__pts { color: var(--text); font-family: 'Space Mono', monospace; }
[data-theme="neobrut-zine"] .bd-card__face--front { /* cut-and-paste card */
  background:
    radial-gradient(circle at 1.1px 1.1px, rgba(32, 29, 26, 0.07) 1.1px, transparent 1.7px) 0 0/6px 6px,
    var(--card-face);
  border: 2px solid var(--line); border-radius: 14px 5px 16px 6px / 6px 13px 5px 12px;
  box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m);
}
[data-theme="neobrut-zine"] .bd-card__rar { font-family: 'Space Mono', monospace; font-size: 0.7em; letter-spacing: 0.16em; text-transform: uppercase; color: var(--coral); border: 1.5px dashed var(--coral); border-radius: 4px; padding: 2px 6px; transform: rotate(-2deg); display: inline-block; }
[data-theme="neobrut-zine"] .bd-card__name { color: var(--line); font-family: 'Space Mono', monospace; font-weight: 700; text-transform: uppercase; }
[data-theme="neobrut-zine"] .bd-card__fx { color: var(--muted); }
[data-theme="neobrut-zine"] .bd-card__cost { color: var(--lime-dim); font-weight: 700; font-family: 'Space Mono', monospace; }
[data-theme="neobrut-zine"] .bd-card__face--back {
  background: repeating-linear-gradient(45deg, rgba(233, 230, 222, 0.14) 0 7px, transparent 7px 14px), var(--card-back-1);
  border: 2px solid var(--line); border-radius: 6px 12px 5px 11px;
}
[data-theme="neobrut-zine"] .bd-prow { border-bottom: 1.5px dashed rgba(32, 29, 26, 0.4); border-radius: 0; background: transparent; }
[data-theme="neobrut-zine"] .bd-prow--you { background: linear-gradient(180deg, transparent 70%, rgba(214, 31, 125, 0.28) 70%); }
[data-theme="neobrut-zine"] .bd-prow__pos { font-family: 'Space Mono', monospace; font-weight: 700; color: var(--lime-dim); }
[data-theme="neobrut-zine"] .bd-top { border-bottom: 2px solid var(--line); }
[data-theme="neobrut-zine"] .bd-h1 em, [data-theme="neobrut-zine"] .bd-h1 i {
  background: linear-gradient(180deg, transparent 64%, rgba(214, 31, 125, 0.45) 64%);
  font-style: normal;
}
[data-theme="neobrut-zine"] .bd-tcard { border: 2px solid var(--line); border-radius: 14px 6px 16px 7px / 6px 14px 7px 13px; box-shadow: 2px 0 0 var(--misreg-c), -2px 0 0 var(--misreg-m), 5px 6px 0 rgba(32, 29, 26, 0.6); }
[data-theme="neobrut-zine"] .bd-tcard__felt { background: radial-gradient(circle at 1.1px 1.1px, rgba(32, 29, 26, 0.16) 1.1px, transparent 1.7px) 0 0/6px 6px, var(--felt); border: 1.5px solid var(--line); border-radius: 4px 8px 5px 7px; }
[data-theme="neobrut-zine"] .bd-tcard__status { border: 1.5px dashed var(--line); border-radius: 4px; font-family: 'Space Mono', monospace; }
[data-theme="neobrut-zine"] .bd-card--deal { animation: matZinePaste 0.55s cubic-bezier(0.3, 1.4, 0.5, 1) both; }
"""

EXTRA["neobrut-ticket"] = """
/* ── neobrut-ticket · BINDINGS — the signage take (structural side) ──── */
[data-theme="neobrut-ticket"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                                  .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-weight: 700; letter-spacing: -0.01em;
}
[data-theme="neobrut-ticket"] :is(.fg-count__time, .fg-lbrow__pct, .fg-lbrow__ruf) {
  font-family: var(--font-mono); font-weight: 600; letter-spacing: 0.05em;
}
[data-theme="neobrut-ticket"] .fg-count {              /* THE DEPARTURE BOARD */
  background: #17191c; border-radius: 14px; border: 1.5px solid var(--rail);
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.06), inset 0 -4px 0 rgba(0, 0, 0, 0.5), 0 6px 16px rgba(26, 28, 31, 0.22);
}
[data-theme="neobrut-ticket"] .fg-count__time { color: var(--amber-display); }
[data-theme="neobrut-ticket"] .fg-count__sub { color: rgba(248, 249, 245, 0.72); font-family: var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; }
[data-theme="neobrut-ticket"] :is(.fg-battle__meta, .fg-battle__foot) {
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.78em;
}
[data-theme="neobrut-ticket"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  border: 1.5px solid var(--rail);
  border-top: 4px solid var(--amber-display);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 10px 24px rgba(26, 28, 31, 0.09);
}
[data-theme="neobrut-ticket"] :is(.fg-battle__bar, .fg-lbrow__bar) {
  height: 5px; border-radius: 3px; background: var(--surface-2); padding: 0;
}
[data-theme="neobrut-ticket"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 3px; background: var(--lime);
  box-shadow: 7px 0 0 -1px var(--amber-display);       /* the next-stop marker */
  transition: width 0.6s cubic-bezier(0.25, 0.9, 0.3, 1);
}
[data-theme="neobrut-ticket"] .fg-lbrow { border-bottom: 1px solid var(--line); border-radius: 0; }
[data-theme="neobrut-ticket"] .fg-lbrow__rank {
  font-family: var(--font-mono); font-size: 0.72em; letter-spacing: 0.1em;
  color: var(--amber-display); background: #17191c; border-radius: 6px; padding: 3px 7px;
}
[data-theme="neobrut-ticket"] .fg-lbrow--leader { border-left: 4px solid var(--lime); background: rgba(28, 58, 94, 0.05); }
[data-theme="neobrut-ticket"] .fg-event { border-left: 4px solid var(--amber-display); border-radius: 0 10px 10px 0; }
[data-theme="neobrut-ticket"] .fg-status {
  font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--lime); border: 2px solid var(--lime); border-radius: 999px; background: var(--surface);
}
[data-theme="neobrut-ticket"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta) {
  font-family: var(--font-display); font-weight: 700; letter-spacing: 0.01em;
  border: 0; border-radius: 12px;
  box-shadow: 0 8px 20px rgba(28, 58, 94, 0.25);
  transition: transform 0.25s cubic-bezier(0.25, 0.9, 0.3, 1), box-shadow 0.25s cubic-bezier(0.25, 0.9, 0.3, 1), background 0.25s;
}
[data-theme="neobrut-ticket"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta):hover {
  background: var(--primary-hover); transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(28, 58, 94, 0.3);
}
[data-theme="neobrut-ticket"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta):active {
  transform: translateY(1px); box-shadow: 0 4px 10px rgba(28, 58, 94, 0.25);
}
[data-theme="neobrut-ticket"] .pop-btn {
  border: 0; border-radius: 12px;
  box-shadow: 0 8px 20px rgba(28, 58, 94, 0.25);
  font-family: var(--font-display); font-weight: 700;
  transition: transform 0.25s cubic-bezier(0.25, 0.9, 0.3, 1), box-shadow 0.25s cubic-bezier(0.25, 0.9, 0.3, 1), background 0.25s;
}
[data-theme="neobrut-ticket"] .pop-btn:active { transform: translateY(1px); box-shadow: 0 4px 10px rgba(28, 58, 94, 0.25); }
[data-theme="neobrut-ticket"] .fg-dz {
  font-family: var(--font-mono); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--amber-display); background: #17191c;
  border-radius: 10px; border-left: 4px solid var(--amber-display);
}
[data-theme="neobrut-ticket"] .bd-table {             /* the LIGHT platform floor */
  background:
    radial-gradient(circle at 2px 2px, rgba(26, 28, 31, 0.06) 1.6px, transparent 2.4px) 0 0/26px 26px,
    repeating-linear-gradient(90deg, rgba(28, 58, 94, 0.05) 0 2px, transparent 2px 64px),
    var(--felt);
  border: 1.5px solid var(--rail);
  box-shadow: 0 12px 28px rgba(26, 28, 31, 0.12);
}
[data-theme="neobrut-ticket"] .bd-lane { border: 1.5px solid var(--felt-line); }
[data-theme="neobrut-ticket"] .bd-lane:nth-child(even) { border-color: rgba(28, 58, 94, 0.28); }
[data-theme="neobrut-ticket"] .bd-finish { background: repeating-linear-gradient(90deg, var(--amber-display) 0 10px, transparent 10px 17px); border-right: 2px solid var(--rail); }
[data-theme="neobrut-ticket"] .bd-pot {               /* the departure module */
  position: relative;
  background: #17191c; border: 1.5px solid var(--rail); border-radius: 14px;
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.06), inset 0 -4px 0 rgba(0, 0, 0, 0.5), 0 8px 20px rgba(26, 28, 31, 0.25);
}
[data-theme="neobrut-ticket"] .bd-pot__label { color: rgba(248, 249, 245, 0.72); font-family: var(--font-mono); letter-spacing: 0.22em; font-size: 0.72em; }
[data-theme="neobrut-ticket"] .bd-pot__total { color: var(--amber-display); font-family: var(--font-mono); font-weight: 600; }
[data-theme="neobrut-ticket"] .bd-pot__pts { color: rgba(248, 249, 245, 0.72); font-family: var(--font-mono); }
[data-theme="neobrut-ticket"] .bd-card__face--front { /* the signage plate */
  background: var(--card-face);
  border: 1.5px solid var(--rail); border-top: 4px solid var(--amber-display); border-radius: 16px;
  box-shadow: 0 8px 18px rgba(26, 28, 31, 0.1);
}
[data-theme="neobrut-ticket"] .bd-card__rar {
  font-family: var(--font-mono); font-size: 0.68em; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--amber-display); background: #17191c; border-radius: 6px; padding: 3px 8px;
}
[data-theme="neobrut-ticket"] .bd-card__name { color: var(--text); font-family: var(--font-display); font-weight: 700; }
[data-theme="neobrut-ticket"] .bd-card__fx { color: var(--muted); }
[data-theme="neobrut-ticket"] .bd-card__cost { color: var(--lime); font-weight: 600; font-family: var(--font-mono); }
[data-theme="neobrut-ticket"] .bd-card__face--back {
  background: radial-gradient(circle at 2px 2px, rgba(248, 249, 245, 0.08) 1.6px, transparent 2.4px) 0 0/26px 26px, var(--card-back-1);
  border: 1.5px solid var(--rail); border-radius: 14px;
}
[data-theme="neobrut-ticket"] .bd-prow { border: 1px solid var(--line); border-left: 4px solid var(--lime); border-radius: 10px; background: var(--surface); }
[data-theme="neobrut-ticket"] .bd-prow--you { border-left-color: var(--coral); }
[data-theme="neobrut-ticket"] .bd-prow__pos { font-family: var(--font-mono); color: var(--lime); }
[data-theme="neobrut-ticket"] .bd-top { border-bottom: 1.5px solid var(--rail); }
[data-theme="neobrut-ticket"] .bd-clock {
  background: #17191c; border: 1.5px solid var(--rail); border-radius: 10px;
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.5);
}
[data-theme="neobrut-ticket"] .bd-clock__time { color: var(--amber-display); font-family: var(--font-mono); letter-spacing: 0.04em; }
[data-theme="neobrut-ticket"] .bd-clock__lap { color: rgba(248, 249, 245, 0.72); font-family: var(--font-mono); letter-spacing: 0.14em; }
[data-theme="neobrut-ticket"] .bd-h1 em { background: linear-gradient(180deg, transparent 66%, rgba(255, 176, 32, 0.55) 66%); font-style: normal; }
[data-theme="neobrut-ticket"] .bd-tcard { border: 1.5px solid var(--rail); border-top: 4px solid var(--amber-display); border-radius: 16px; background: var(--surface); box-shadow: 0 8px 18px rgba(26, 28, 31, 0.09); }
[data-theme="neobrut-ticket"] .bd-tcard__felt { background: radial-gradient(circle at 2px 2px, rgba(26, 28, 31, 0.09) 1.6px, transparent 2.4px) 0 0/26px 26px, var(--felt); border: 1px solid var(--line); border-radius: 12px; }
[data-theme="neobrut-ticket"] .bd-tcard__status { border: 2px solid var(--lime); border-radius: 999px; color: var(--lime); font-family: var(--font-mono); }
[data-theme="neobrut-ticket"] .bd-card--deal { animation: matBoardIn 0.5s cubic-bezier(0.25, 0.9, 0.3, 1) both; }
"""

EXTRA["neobrut-locker"] = """
/* ── neobrut-locker · BINDINGS — the clubhouse take (equipment room) ─── */
[data-theme="neobrut-locker"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                                  .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Archivo', system-ui, sans-serif;
  font-weight: 800; text-transform: uppercase; letter-spacing: 0.015em;
}
[data-theme="neobrut-locker"] :is(.fg-count__time, .fg-lbrow__pct, .fg-lbrow__ruf) {
  font-family: 'Archivo', sans-serif; font-weight: 900;
  text-shadow: 3px 3px 0 rgba(31, 79, 143, 0.3);
}
[data-theme="neobrut-locker"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot) {
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; font-size: 0.8em;
}
[data-theme="neobrut-locker"] :is(.fg-battle, .fg-sheet, .fg-dialog, .fg-state, .fg-pro) {
  border: 2.5px solid var(--line); border-radius: 14px;
  background:
    repeating-linear-gradient(180deg, transparent 0 6px, rgba(38, 34, 26, 0.12) 6px 8px) 14px 12px / calc(100% - 28px) 16px no-repeat,
    var(--surface);
  box-shadow: 5px 6px 0 rgba(38, 34, 26, 0.2), 0 12px 26px rgba(38, 34, 26, 0.1);   /* worn soft */
}
[data-theme="neobrut-locker"] .fg-count {              /* the jersey number */
  border: 2.5px solid var(--line); border-radius: 12px;
  background:
    radial-gradient(circle at 1.6px 1.6px, rgba(38, 34, 26, 0.12) 1.4px, transparent 2.1px) 0 0/7px 7px,
    var(--surface);
  box-shadow: 4px 5px 0 rgba(38, 34, 26, 0.25);
}
[data-theme="neobrut-locker"] :is(.fg-battle__bar, .fg-lbrow__bar) {
  border: 2.5px solid var(--line); border-radius: 8px;
  background: var(--surface-2); padding: 2px;
}
[data-theme="neobrut-locker"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 6px;
  background: repeating-linear-gradient(90deg, transparent 0 9px, rgba(253, 249, 239, 0.5) 9px 10.5px), var(--lime);  /* tape ticks */
  transition: width 0.6s cubic-bezier(0.3, 1.35, 0.5, 1);
}
[data-theme="neobrut-locker"] .fg-lbrow { border-bottom: 1.5px solid rgba(38, 34, 26, 0.3); border-radius: 0; }
[data-theme="neobrut-locker"] .fg-lbrow__rank { font-family: 'Archivo', sans-serif; font-weight: 800; color: var(--lime); }
[data-theme="neobrut-locker"] .fg-lbrow--leader { border-left: 5px solid var(--lime); background: rgba(179, 36, 44, 0.05); }
[data-theme="neobrut-locker"] .fg-event { border-left: 5px solid var(--coral); border-radius: 4px 12px 12px 4px; }
[data-theme="neobrut-locker"] .fg-status {
  font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
  border: 2px solid var(--line); border-radius: 999px; background: var(--surface);
}
[data-theme="neobrut-locker"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta) {
  font-family: 'Archivo', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
  border: 2.5px solid var(--line); border-radius: 13px 13px 15px 15px;
  background:
    linear-gradient(90deg, rgba(253, 249, 239, 0.85) 0 7px, transparent 7px 20px) 0 0 / 100% 34% no-repeat,
    linear-gradient(-90deg, rgba(253, 249, 239, 0.85) 0 7px, transparent 7px 20px) 0 100% / 100% 34% no-repeat,
    var(--lime);
  box-shadow: 4px 5px 0 var(--line);
  transition: transform 0.4s cubic-bezier(0.3, 1.35, 0.5, 1), box-shadow 0.4s cubic-bezier(0.3, 1.35, 0.5, 1);
}
[data-theme="neobrut-locker"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta):hover {
  transform: translateY(-3px); box-shadow: 5px 7px 0 var(--line);
}
[data-theme="neobrut-locker"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                                  .fg-pro__cta, .fg-state__cta):active {
  transform: translateY(2px); box-shadow: 2px 2px 0 var(--line);
}
[data-theme="neobrut-locker"] .pop-btn {
  border: 2.5px solid var(--line); border-radius: 13px 13px 15px 15px;
  background:
    linear-gradient(90deg, rgba(253, 249, 239, 0.85) 0 7px, transparent 7px 20px) 0 0 / 100% 34% no-repeat,
    linear-gradient(-90deg, rgba(253, 249, 239, 0.85) 0 7px, transparent 7px 20px) 0 100% / 100% 34% no-repeat,
    var(--lime);
  box-shadow: 4px 5px 0 var(--line);
  font-family: 'Archivo', sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
  transition: transform 0.4s cubic-bezier(0.3, 1.35, 0.5, 1), box-shadow 0.4s cubic-bezier(0.3, 1.35, 0.5, 1);
}
[data-theme="neobrut-locker"] .pop-btn:active { transform: translateY(2px); box-shadow: 2px 2px 0 var(--line); }
[data-theme="neobrut-locker"] .fg-dz {
  font-family: 'Archivo', sans-serif; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--on-accent);
  background: repeating-linear-gradient(-45deg, rgba(253, 249, 239, 0.14) 0 10px, transparent 10px 20px), var(--danger);
  border: 2.5px solid var(--line); border-radius: 10px;
}
[data-theme="neobrut-locker"] .bd-table {             /* the gym floor */
  background:
    repeating-linear-gradient(90deg, rgba(38, 34, 26, 0.22) 0 2px, transparent 2px 92px),
    repeating-linear-gradient(90deg, rgba(253, 249, 239, 0.05) 0 46px, transparent 46px 92px),
    linear-gradient(rgba(253, 249, 239, 0.06), rgba(38, 34, 26, 0.12)),
    linear-gradient(#8a6f4d, #74603f);   /* hard varnished timber */
  border: 3px solid var(--rail);
  box-shadow: 5px 6px 0 rgba(38, 34, 26, 0.25);
}
[data-theme="neobrut-locker"] .bd-lane { border: 1.5px solid var(--felt-line); }
[data-theme="neobrut-locker"] .bd-finish { background: repeating-linear-gradient(-45deg, rgba(253, 249, 239, 0.85) 0 9px, var(--lane) 9px 18px); }
[data-theme="neobrut-locker"] .bd-pot {               /* the equipment crate */
  position: relative;
  background:
    radial-gradient(circle at 1.6px 1.6px, rgba(38, 34, 26, 0.1) 1.4px, transparent 2.1px) 0 0/7px 7px,
    #f4f1e6;
  border: 2.5px solid var(--line); border-radius: 14px;
  box-shadow: 4px 5px 0 rgba(38, 34, 26, 0.25);
}
[data-theme="neobrut-locker"] .bd-pot::after {          /* the nameplate badge */
  content: "◈";
  position: absolute; top: -11px; left: -10px;
  width: 27px; height: 27px; display: grid; place-items: center;
  background: var(--surface); color: var(--line); font-size: 12px;
  border: 2px solid var(--line); border-radius: 6px;
  box-shadow: 0 2px 0 rgba(38, 34, 26, 0.35);
  transform: rotate(-4deg);
}
[data-theme="neobrut-locker"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); letter-spacing: 0.2em; font-size: 0.74em; }
[data-theme="neobrut-locker"] .bd-pot__total { color: var(--line); font-family: 'Archivo', sans-serif; font-weight: 900; text-shadow: 3px 3px 0 rgba(31, 79, 143, 0.3); }
[data-theme="neobrut-locker"] .bd-pot__pts { color: var(--text); }
[data-theme="neobrut-locker"] .bd-card__face--front { /* the locker card */
  background:
    repeating-linear-gradient(180deg, transparent 0 6px, rgba(38, 34, 26, 0.14) 6px 8px) 12px 10px / calc(100% - 24px) 18px no-repeat,
    radial-gradient(circle at 1.6px 1.6px, rgba(38, 34, 26, 0.08) 1.4px, transparent 2.1px) 0 0/7px 7px,
    var(--card-face);
  border: 2.5px solid var(--line); border-radius: 14px;
  box-shadow: 4px 5px 0 rgba(38, 34, 26, 0.25);
}
[data-theme="neobrut-locker"] .bd-card__rar {
  font-family: var(--font-mono); font-size: 0.7em; letter-spacing: 0.14em; text-transform: uppercase;
  color: #f2c94c; background: var(--line); border-radius: 6px; padding: 3px 8px;
  transform: rotate(-0.8deg); display: inline-block;
}
[data-theme="neobrut-locker"] .bd-card__name { color: var(--line); font-family: 'Archivo', sans-serif; font-weight: 800; text-transform: uppercase; }
[data-theme="neobrut-locker"] .bd-card__fx { color: var(--muted); }
[data-theme="neobrut-locker"] .bd-card__cost { color: var(--lime-dim); font-weight: 700; }
[data-theme="neobrut-locker"] .bd-card__face--back {
  background: repeating-linear-gradient(135deg, rgba(253, 249, 239, 0.16) 0 9px, transparent 9px 18px), var(--card-back-1);
  border: 2.5px solid var(--line); border-radius: 12px;
}
[data-theme="neobrut-locker"] .bd-prow { border: 2px solid var(--line); border-radius: 10px; background: var(--surface); }
[data-theme="neobrut-locker"] .bd-prow--you { border-color: var(--lime); box-shadow: 3px 4px 0 rgba(38, 34, 26, 0.25); }
[data-theme="neobrut-locker"] .bd-prow__pos { font-family: 'Archivo', sans-serif; font-weight: 900; color: var(--lime-dim); }
[data-theme="neobrut-locker"] .bd-top { border-bottom: 2.5px solid var(--line); }
[data-theme="neobrut-locker"] .bd-tcard { border: 2.5px solid var(--line); border-radius: 14px; box-shadow: 4px 5px 0 rgba(38, 34, 26, 0.22); }
[data-theme="neobrut-locker"] .bd-tcard__felt {
  background:
    repeating-linear-gradient(180deg, transparent 0 5px, rgba(38, 34, 26, 0.28) 5px 6.5px) 0 0 / 100% 14px no-repeat,
    var(--felt);
  border: 1.5px solid var(--line); border-radius: 8px;
}
[data-theme="neobrut-locker"] .bd-tcard__status { border: 2px solid var(--line); border-radius: 999px; }
[data-theme="neobrut-locker"] .bd-card--deal { animation: matLockerClack 0.5s cubic-bezier(0.3, 1.35, 0.5, 1) both; }
"""

# ── steddi (2026-09-03) — mined from the founder's qalarc.com/projects/
# steddi-overlap page (the "rail measurement blueprint" microsite). ───────
EXTRA["steddi"] = """
/* ── steddi · BINDINGS — the rail measurement blueprint (the founder's page) ── */
[data-theme="steddi"] :is(.fg-battle__title, .fg-sheet__title, .fg-pwr__name,
                          .fg-event__title, .fg-state__title, .fg-dialog__title) {
  font-family: 'Sora', 'Inter', system-ui, sans-serif; font-weight: 600; letter-spacing: -0.015em;
}
[data-theme="steddi"] :is(.fg-count__time, .fg-lbrow__pct, .fg-lbrow__ruf) {
  font-family: var(--font-mono); font-weight: 600; letter-spacing: -0.02em;
  background: linear-gradient(100deg, #d94a3d, #ff6a55);        /* KPI gradient ink */
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
[data-theme="steddi"] :is(.fg-battle__meta, .fg-count__sub, .fg-battle__foot) {
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.74em;
}
[data-theme="steddi"] :is(.fg-battle, .fg-sheet, .fg-pro) {
  border: 1px solid var(--line); border-radius: 10px;
  background: linear-gradient(180deg, rgba(217, 74, 61, 0.04), transparent 26%), var(--surface);
}
[data-theme="steddi"] :is(.fg-dialog, .fg-state) {       /* the callout datum edge */
  border: 1px solid var(--line); border-left: 2px solid var(--coral); border-radius: 0 10px 10px 0;
  background: linear-gradient(90deg, rgba(217, 74, 61, 0.07), transparent 70%), var(--surface);
}
[data-theme="steddi"] .fg-count {
  border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
}
[data-theme="steddi"] :is(.fg-battle__bar, .fg-lbrow__bar) {
  height: 4px; border-radius: 2px; background: var(--surface-2); padding: 0;
}
[data-theme="steddi"] :is(.fg-battle__bar i, .fg-lbrow__bar i) {
  border-radius: 2px; background: linear-gradient(90deg, #a93546, #ff3b2f);
  box-shadow: 0 0 10px rgba(255, 59, 47, 0.4);            /* the beam */
  transition: width 0.6s cubic-bezier(0.22, 0.61, 0.36, 1);
}
[data-theme="steddi"] .fg-lbrow { border-bottom: 1px solid var(--line); border-radius: 0; transition: background 0.2s cubic-bezier(0.22, 0.61, 0.36, 1), padding-left 0.2s cubic-bezier(0.22, 0.61, 0.36, 1); }
[data-theme="steddi"] .fg-lbrow:hover { background: rgba(217, 74, 61, 0.05); padding-left: 8px; }   /* linklist nudge */
[data-theme="steddi"] .fg-lbrow__rank { font-family: var(--font-mono); font-size: 0.78em; color: var(--coral); letter-spacing: 0.2em; }
[data-theme="steddi"] .fg-lbrow--leader { border-left: 2px solid var(--coral); background: linear-gradient(90deg, rgba(217, 74, 61, 0.06), transparent 60%); }
[data-theme="steddi"] .fg-event { border-left: 2px solid var(--coral); border-radius: 0 8px 8px 0; background: linear-gradient(90deg, rgba(217, 74, 61, 0.05), transparent 65%); }
[data-theme="steddi"] .fg-status {
  font-family: var(--font-mono); font-weight: 400; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.2em;
  color: #ff6a55; border: 1px solid var(--line-bright); border-radius: 999px; background: rgba(217, 74, 61, 0.14);
}
[data-theme="steddi"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                          .fg-pro__cta, .fg-state__cta) {
  font-family: var(--font-body); font-weight: 600; font-size: 0.95em;
  border: 0; border-radius: 8px;
  background: linear-gradient(135deg, #a93546, #c23b2f);
  box-shadow: 0 6px 22px rgba(169, 53, 70, 0.3);
  transition: transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
}
[data-theme="steddi"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                          .fg-pro__cta, .fg-state__cta):hover {
  transform: translateY(-2px); box-shadow: 0 10px 30px rgba(217, 74, 61, 0.4);
}
[data-theme="steddi"] :is(.fg-nav__log, .fg-sheet__cta, .fg-dialog__cta,
                          .fg-pro__cta, .fg-state__cta):active {
  transform: translateY(0); box-shadow: 0 3px 12px rgba(169, 53, 70, 0.3);
}
[data-theme="steddi"] .pop-btn {
  border: 0; border-radius: 8px;
  background: linear-gradient(135deg, #a93546, #c23b2f);
  box-shadow: 0 6px 22px rgba(169, 53, 70, 0.3);
  font-weight: 600;
  transition: transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
}
[data-theme="steddi"] .pop-btn:active { transform: translateY(0); box-shadow: 0 3px 12px rgba(169, 53, 70, 0.3); }
[data-theme="steddi"] .fg-dz {
  font-family: var(--font-mono); font-weight: 400; font-size: 0.8em; letter-spacing: 0.16em; text-transform: uppercase;
  color: #ff6a55; background: rgba(255, 59, 47, 0.12);
  border: 1px solid rgba(255, 59, 47, 0.4); border-radius: 6px;
}
[data-theme="steddi"] .fg-dz::before {                   /* the blinking LED */
  content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 999px;
  background: #ff3b2f; box-shadow: 0 0 8px rgba(255, 59, 47, 0.7);
  margin-right: 9px; vertical-align: 1px;
  animation: matSteddiLed 1.2s steps(2, end) infinite;
}
[data-theme="steddi"] .bd-table {                     /* the blueprint floor */
  background:
    linear-gradient(rgba(241, 232, 230, 0.035) 1px, transparent 1px) 0 0 / 8px 8px,
    linear-gradient(90deg, rgba(241, 232, 230, 0.035) 1px, transparent 1px) 0 0 / 8px 8px,
    linear-gradient(rgba(217, 74, 61, 0.09) 1px, transparent 1px) 0 0 / 96px 96px,
    linear-gradient(90deg, rgba(217, 74, 61, 0.09) 1px, transparent 1px) 0 0 / 96px 96px,
    radial-gradient(80% 70% at 50% 12%, rgba(217, 74, 61, 0.1), transparent 60%),
    var(--felt);
  border: 1px solid var(--rail);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.5);
}
[data-theme="steddi"] .bd-lane { border: 1px dashed var(--felt-line); }        /* diagram dashes */
[data-theme="steddi"] .bd-finish { background: repeating-linear-gradient(90deg, var(--coral) 0 10px, transparent 10px 18px); border-right: 1px solid var(--coral); }
[data-theme="steddi"] .bd-pot {                       /* the survey plate + datum marks */
  position: relative;
  background: #20161c;   /* hard panel plum */
  border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.5);   /* replaces board.css's amber insets */
}
[data-theme="steddi"] .bd-pot::before,
[data-theme="steddi"] .bd-pot::after {                 /* datum crosshairs */
  content: "+"; position: absolute;
  font: 400 13px/1 var(--font-mono); color: var(--coral); opacity: 0.8;
}
[data-theme="steddi"] .bd-pot::before { top: -8px; left: -7px; }
[data-theme="steddi"] .bd-pot::after { bottom: -8px; right: -7px; }
[data-theme="steddi"] .bd-pot__label { color: var(--muted); font-family: var(--font-mono); letter-spacing: 0.24em; font-size: 0.7em; text-transform: uppercase; }
[data-theme="steddi"] .bd-pot__total {
  font-family: var(--font-mono); font-weight: 600;
  background: linear-gradient(100deg, #d94a3d, #ff6a55);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
[data-theme="steddi"] .bd-pot__pts { color: var(--muted); font-family: var(--font-mono); }
[data-theme="steddi"] .bd-card__face--front {         /* the diag panel */
  background: linear-gradient(180deg, rgba(217, 74, 61, 0.04), transparent 24%), var(--card-face);
  border: 1px solid var(--line); border-radius: 10px;
}
[data-theme="steddi"] .bd-card__rar { font-family: var(--font-mono); font-size: 0.68em; letter-spacing: 0.2em; text-transform: uppercase; color: #ff6a55; }
[data-theme="steddi"] .bd-card__name { color: var(--text); font-family: 'Sora', sans-serif; font-weight: 600; }
[data-theme="steddi"] .bd-card__fx { color: var(--muted); }
[data-theme="steddi"] .bd-card__cost { color: var(--coral); font-weight: 600; font-family: var(--font-mono); }
[data-theme="steddi"] .bd-card__face--back {
  background: linear-gradient(160deg, var(--card-back-1), var(--card-back-2));
  border: 1px solid var(--line); border-radius: 10px;
}
[data-theme="steddi"] .bd-prow { border: 1px solid var(--line); border-left: 2px solid var(--coral); border-radius: 0 8px 8px 0; background: var(--surface); }
[data-theme="steddi"] .bd-prow--you { border-left-color: #ff3b2f; }
[data-theme="steddi"] .bd-prow__pos { font-family: var(--font-mono); color: var(--coral); letter-spacing: 0.1em; }
[data-theme="steddi"] .bd-top { border-bottom: 1px solid var(--line); }
[data-theme="steddi"] .bd-clock { border: 1px solid var(--line); border-radius: 8px; background: rgba(25, 18, 23, 0.6); }
[data-theme="steddi"] .bd-clock__time { color: #ff6a55; font-family: var(--font-mono); }
[data-theme="steddi"] .bd-clock__lap { color: var(--muted); font-family: var(--font-mono); letter-spacing: 0.18em; }
[data-theme="steddi"] .bd-h1 em { background: linear-gradient(100deg, #d94a3d, #ff6a55); -webkit-background-clip: text; background-clip: text; color: transparent; font-style: normal; }
[data-theme="steddi"] .bd-tcard { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); transition: background 0.2s cubic-bezier(0.22, 0.61, 0.36, 1), padding-left 0.2s cubic-bezier(0.22, 0.61, 0.36, 1); }
[data-theme="steddi"] .bd-tcard:hover { background: rgba(217, 74, 61, 0.05); }
[data-theme="steddi"] .bd-tcard__felt { background: linear-gradient(160deg, var(--card-back-1), var(--card-back-2)); border: 1px solid var(--line); border-radius: 6px; }
[data-theme="steddi"] .bd-tcard__status { font-family: var(--font-mono); font-size: 0.78em; letter-spacing: 0.16em; text-transform: uppercase; color: #ff6a55; border: 1px solid var(--line-bright); border-radius: 999px; }
[data-theme="steddi"] .bd-card--deal { animation: matSteddiMist 1.1s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
"""

# Radicalisation patches applied to the pkl buckets before writing
# (sunset de-brutalised 2026-09-03 — the offset-shadow language now belongs
# to neobrut alone; sunset is the flat Swiss sheet).
PATCHES: list[tuple[str, str, str]] = [
    (
        "sunset",
        "border-width: 2px;\n  border-color: var(--line);",
        "border-width: 1px;\n  border-color: var(--line);",
    ),
    (
        "sunset",
        ".fg-nav { border-top-width: 2px; }",
        ".fg-nav { border-top-width: 1px; }",
    ),
    (
        "sunset",
        "box-shadow: 4px 4px 0 var(--line);        /* hard offset, zero blur */",
        "box-shadow: none;                            /* FLAT — no shadow exists in sunset */",
    ),
    (
        "sunset",
        "box-shadow: 1px 1px 0 var(--line);\n  transform: translate(3px, 3px);           /* pressed into the paper */",
        "transform: translateY(1px);                 /* pressed flat */",
    ),
    (
        "neobrut",
        "border: 3px solid var(--line);\n  border-radius: 6px;\n  background: var(--surface);\n  box-shadow: 6px 6px 0 rgba(196, 31, 14, 0.8);",
        "border: 3px solid var(--line);\n  border-radius: 14px;   /* chunky corners UNDER the hard edge */\n  background: var(--surface);\n  box-shadow: 6px 6px 0 rgba(196, 31, 14, 0.8);",
    ),
    (
        "neobrut",
        "border: 3px solid var(--line); border-radius: 6px;\n  background: var(--surface);\n  box-shadow: 6px 6px 0 rgba(43, 75, 236, 0.65);",
        "border: 3px solid var(--line); border-radius: 14px;\n  background: var(--surface);\n  box-shadow: 6px 6px 0 rgba(43, 75, 236, 0.65);",
    ),
    (
        "neobrut",
        ".bd-pot {               /* the headline plate */\n  background: var(--chip-white);\n  border: 3px solid var(--line); border-radius: 10px;\n  box-shadow: 5px 5px 0 var(--coral);\n}",
        '.bd-pot {               /* the headline plate + slapped sticker */\n  position: relative;\n  background: var(--chip-white);\n  border: 3px solid var(--line); border-radius: 14px;\n  box-shadow: 5px 5px 0 var(--coral);\n}\n[data-theme="neobrut"] .bd-pot::after {           /* the sticker badge */\n  content: "★";\n  position: absolute; top: -12px; right: -10px;\n  width: 30px; height: 30px; display: grid; place-items: center;\n  background: var(--chip-gold, #d9a521); color: #17130e; font-size: 15px;\n  border: 2.5px solid var(--line); border-radius: 999px;\n  box-shadow: 0 0 0 3px var(--chip-white), 2px 3px 0 rgba(23, 19, 14, 0.8);\n  transform: rotate(-8deg);\n}',
    ),
    (
        "neobrut",
        ".bd-card__face--front { /* poster card */\n  background: var(--card-face);\n  border: 3px solid var(--line); border-radius: 8px;\n  box-shadow: 4px 4px 0 rgba(196, 31, 14, 0.75);\n}",
        ".bd-card__face--front { /* poster card — soft corners under hard edges */\n  background:\n    radial-gradient(circle at 1.2px 1.2px, rgba(23, 19, 14, 0.1) 1.2px, transparent 1.8px) 0 0/9px 9px,\n    var(--card-face);\n  border: 3px solid var(--line); border-radius: 14px;\n  box-shadow: 4px 4px 0 rgba(196, 31, 14, 0.75);\n}",
    ),
]


# Order the hand-authored kits appear in themes.css (variants right after
# the neobrut bucket conceptually; steddi last, mirroring index.css order).
EXTRA_ORDER = [
    "neobrut-field",
    "neobrut-zine",
    "neobrut-ticket",
    "neobrut-locker",
    "x10",
    "doof",
    "qalarc",
    "tradez",
    "gmux",
    "volkus",
    "endispute",
    "steddi",
]


def main() -> int:
    data = pickle.loads((LIB / ".split-bindings.pkl").read_bytes())
    order, bindings = data["order"], data["bindings"]

    # Radicalisation patches (exact-string, fail loudly if drifted)
    for bucket, old, new in PATCHES:
        body = "\n".join(bindings.get(bucket, []))
        if old not in body:
            raise SystemExit(f"PATCH miss in bucket '{bucket}': {old[:60]!r} not found")
        bindings[bucket] = body.replace(old, new).split("\n")

    # EXTRA sections join the ordered bucket list (founder-site kits last)
    for key in EXTRA_ORDER:
        if key not in bindings:
            bindings[key] = []
            order.append(key)

    out = [
        "/* ═══════════════════════════════════════════════════════════════════════════",
        "   RWF THEME BINDINGS — design/themes.css v4",
        "   The portable library lives in design/style-library/ (one file per",
        "   kit + base + index + README). This file imports it and then binds",
        "   RWF app surfaces to each kit:",
        "     · figma-app component library (fg-*)  — design/figma-components.css",
        "     · board app surfaces (bd-*)           — apps/board/board.css",
        "     · shared primitives (pop-btn, rwf-btn, fx-*)",
        "   Nothing here defines tokens or mat-* primitives — those are the",
        "   library's job (app-agnostic, reusable in any project).",
        "",
        "   USAGE: vendor design/style-library/ + design/fonts/ + this file,",
        '   set <html data-theme="caveman">, and both the token slot contract',
        "   AND the app skins flip together. See style-library/README.md.",
        "   ═══════════════════════════════════════════════════════════════════════ */",
        "",
        '@import url("style-library/index.css");',
        "",
    ]

    label = {
        None: "SHARED BINDINGS — every kit: CTA/accent re-pointing + a11y floors",
        "sunset": "sunset · BINDINGS",
        "neon": "neon · BINDINGS",
        "forest": "forest · BINDINGS",
    }

    for key in order:
        name = key if key else "shared"
        out.append(
            "/* ═══════════════════════════════════════════════════════════════════════════"
        )
        out.append(
            f"   {label.get(key, name + ' · BINDINGS — fg library + bd board app')}"
        )
        out.append(
            "   ═══════════════════════════════════════════════════════════════════════ */"
        )
        body = "\n".join(bindings[key]).rstrip()
        out.append(body)
        if key in EXTRA:
            out.append(EXTRA[key].rstrip())
        out.append("")

    THEMES.write_text("\n".join(out).rstrip() + "\n")
    rules = sum(
        1
        for l in out
        if l.strip()
        and not l.strip().startswith("/*")
        and not l.strip().startswith("@import")
    )
    print(f"themes.css rewritten — {len(order)} binding sections, ~{rules} chunks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
