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


# Order the hand-authored founder-site kits appear in themes.css (after the
# pkl buckets, mirroring style-library/index.css order).
EXTRA_ORDER = ["x10", "doof", "qalarc", "tradez", "gmux", "volkus", "endispute"]


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
