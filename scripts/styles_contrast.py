#!/usr/bin/env python3
"""RWF theme contrast checker — the style library (21 kits).

Parses :root from design/tokens.css + every [data-theme="X"] token block
from design/style-library/*.css (and design/themes.css, which may restate),
resolves var() chains + rgba(), and computes WCAG 2.1
contrast ratios for every pairing that matters for AA:

  · text hierarchy (text/muted/faint) on bg/surface/surface-2   → need 4.5
  · primary (--lime slot) as text on bg/surface                 → need 3.0
    (large display type; we also report it against 4.5)
  · on-accent on primary fill, on-warn on urgency/amber fills   → need 4.5
  · state axes (success/danger/urgency/amber/sky/coral/energy) as
    text on bg/surface                                          → need 4.5
  · energy-light (avatar initials) on energy-tint               → need 4.5

Exit code 1 if any required pairing fails. Prints the full matrix.
Run:  python3 scripts/styles_contrast.py [--strict-45-primary]
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "design" / "tokens.css"
THEMES_SOURCES = [ROOT / "design" / "themes.css"]
THEMES_SOURCES += sorted((ROOT / "design" / "style-library").glob("*.css"))

STRICT_PRIMARY = "--strict-45-primary" in sys.argv


def parse_blocks(css: str) -> dict[str, dict[str, str]]:
    """Return {selector-or-':root': {--name: value}} for custom-prop blocks."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)  # strip comments first —
    # otherwise a comment before a selector glues onto it and breaks matching
    out: dict[str, dict[str, str]] = {}
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel, body = m.group(1).strip(), m.group(2)
        props = dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body))
        parts = [p for p in re.split(r"[,\s>+~]+", sel) if p]
        if props and (
            ":root" in parts or any(p.startswith("[data-theme") for p in parts)
        ):
            # a kit may declare several blocks under the same selector
            # (tokens + --mat-page) — MERGE, never overwrite
            out.setdefault(sel, {}).update(props)
    return out


def srgb(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(hex_or_rgba: str) -> float:
    v = hex_or_rgba.strip()
    if v.startswith("var("):  # unresolved — caller already substituted; guard
        raise ValueError(f"unresolved var: {v}")
    if v.startswith("rgba"):
        r, g, b, a = [float(x) for x in re.findall(r"[\d.]+", v)[:4]]
        premix = lambda ch: ch * a + 255 * (1 - a)  # over the page bg below
        r, g, b = premix(r), premix(g), premix(b)
    else:
        h = v.lstrip("#")
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    lin = [srgb(ch / 255) for ch in (r, g, b)]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(fg: str, bg: str) -> float:
    l1, l2 = sorted((lum(fg), lum(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def resolve(name: str, scope: dict, root: dict) -> str:
    """Resolve a token value through var() chains (theme scope wins over :root)."""
    seen, val = set(), scope.get(name, root.get(name, ""))
    while (m := re.fullmatch(r"\s*var\((--[\w-]+)\)\s*", val)) and m.group(
        1
    ) not in seen:
        seen.add(m.group(1))
        val = scope.get(m.group(1), root.get(m.group(1), val))
    return val.strip()


blocks = parse_blocks(TOKENS.read_text())
root = blocks.get(":root", {})

# Pair matrix: (fg-token, bg-token, required-ratio, label)
PAIRS: list[tuple[str, str, float, str]] = []
for s in ("bg", "surface", "surface-2"):
    PAIRS += [
        ("--text", f"--{s}", 4.5, "text"),
        ("--muted", f"--{s}", 4.5, "muted"),
        ("--faint", f"--{s}", 4.5, "faint"),
    ]
for s in ("bg", "surface"):
    PAIRS += [
        ("--lime", f"--{s}", 4.5 if STRICT_PRIMARY else 3.0, "primary-as-text"),
        ("--coral", f"--{s}", 4.5, "effort-as-text"),
        ("--success", f"--{s}", 4.5, "success-as-text"),
        ("--danger", f"--{s}", 4.5, "danger-as-text"),
        ("--urgency", f"--{s}", 4.5, "urgency-as-text"),
        ("--amber", f"--{s}", 4.5, "warning-as-text"),
        ("--sky", f"--{s}", 4.5, "info-as-text"),
    ]
PAIRS += [
    ("--on-accent", "--lime", 4.5, "on-accent/primary-fill"),
    ("--on-warn", "--urgency", 4.5, "on-warn/urgency-fill"),
    ("--on-warn", "--amber", 4.5, "on-warn/warning-fill"),
    ("--energy-light", "--energy-tint", 4.5, "initials/energy-tint"),
]

# Themes: lime is the :root default (themes.css restates it) — evaluate all five.
theme_blocks = {}
for src in THEMES_SOURCES:
    for sel, props in parse_blocks(src.read_text()).items():
        theme_blocks.setdefault(sel, {}).update(props)
order = [":root"] + [f'[data-theme="{tid}"]' for tid in [
    "lime", "gold", "sunset", "neon", "forest",
    "board", "mycelial", "techy", "track", "cardtable",
    "caveman", "n64", "goldeneye", "neobrut",
    "x10", "doof", "qalarc", "tradez", "gmux", "volkus", "endispute",
]]
theme_blocks.setdefault(":root", {})  # lime row uses :root defaults
# :root row should also see themes.css :root additions (--on-accent etc.)
# the default (unthemed) page IS the lime skin — evaluate it as such
theme_blocks[":root"] = {**root, **theme_blocks.get(":root", {}), **theme_blocks.get('[data-theme="lime"]', {})}

fails = 0
for sel in order:
    name = "default/lime" if sel == ":root" else sel.split('"')[1]
    scope = {**root, **theme_blocks.get(sel, {})}
    print(f"\n── {name} " + "─" * (58 - len(name)))
    for fg_tok, bg_tok, need, label in PAIRS:
        try:
            fg, bg = resolve(fg_tok, scope, root), resolve(bg_tok, scope, root)
            r = ratio(fg, bg)
        except Exception as e:  # unresolvable token — surface loudly
            print(f"  ✗ {label:<24} {fg_tok} on {bg_tok}: ERROR {e}")
            fails += 1
            continue
        ok = r >= need
        fails += 0 if ok else 1
        flag = "✓" if ok else "✗"
        note = "" if r >= 4.5 else "  (AA-large only)" if r >= 3 else "  (FAIL)"
        print(
            f"  {flag} {label:<24} {fg:>9} on {bg:<9} {r:5.2f}:1  (need {need}){note}"
        )

print(f"\n{'ALL PASS' if fails == 0 else f'{fails} FAILURES'}")
sys.exit(1 if fails else 0)
