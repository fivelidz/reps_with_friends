#!/usr/bin/env python3
"""split_style_library.py — design/themes.css → design/style-library/ split.

The personal styles repository lives in design/style-library/ as portable,
app-agnostic theme files. This tool performs/refreshes the split:

  LIBRARY (design/style-library/)
    base.css            shared [data-theme] base + @keyframes + mat defaults
    theme-<id>.css      per theme: token block + .mat-* material kit CSS
    index.css           @import chain (base + every theme file)
  BINDINGS (design/themes.css)
    the RWF app skins ([data-theme] .fg-* / .bd-* / .pop-btn / .rwf-* / .fx-*),
    preceded by @import url("style-library/index.css").

Classification is by selector vocabulary: any rule whose selector mentions an
RWF app class (fg-/bd-/pop-btn/rwf-/fx-/st-) is a binding; everything else is
library material (tokens, body/page texture, mat-* primitives, keyframes).
Rules are MOVED, never rewritten, so computed styles are identical to the
monolith (rule-count assertion + /styles e2e verify this).

The pre-split monolith is archived by the caller (house rule: never delete).
Re-run after hand-editing the monolith archive, or edit the split files
directly — this script only needs to run once per monolith generation.

Usage: python3 scripts/styles/split_style_library.py
"""

from __future__ import annotations
import pickle
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
THEMES = ROOT / "design" / "themes.css"
LIB = ROOT / "design" / "style-library"

# Gallery order — design/style-library/index.css import order.
THEME_ORDER = [
    "lime",
    "gold",
    "sunset",
    "neon",
    "forest",
    "board",
    "mycelial",
    "techy",
    "track",
    "cardtable",
    "caveman",
    "n64",
    "goldeneye",
    "neobrut",
    # founder-site themes (mined 2026-09-03 — see README provenance)
    "x10",
    "doof",
    "qalarc",
    "tradez",
    "gmux",
    "volkus",
    "endispute",
]

# RWF app vocabularies — a rule mentioning any of these in its SELECTOR is a
# binding, not library material.
APP_WORDS = (".fg-", ".bd-", ".pop-btn", ".rwf-", ".fx-", ".st-")


def parse_units(css: str):
    """Yield ordered units: ("blank",) | ("comment", text) | ("rule", text).

    Comments attach to the following unit at write time (kept as pending).
    """
    lines = css.split("\n")
    n, i = len(lines), 0
    while i < n:
        s = lines[i].strip()
        if s == "":
            yield ("blank", "")
            i += 1
        elif s.startswith("/*"):
            block = [lines[i]]
            if "*/" not in s:
                i += 1
                while i < n:
                    block.append(lines[i])
                    if "*/" in lines[i]:
                        break
                    i += 1
            yield ("comment", "\n".join(block))
            i += 1
        else:
            # a rule — accumulate until we have seen the opening "{" AND the
            # brace depth is back to 0. Multi-line selectors keep their "{"
            # on a later line; stopping at depth 0 alone would shred them
            # into one-line fragments (bug fixed 2026-09-03).
            rule = [lines[i]]
            depth = lines[i].count("{") - lines[i].count("}")
            seen_open = "{" in lines[i]
            i += 1
            while i < n and (not seen_open or depth > 0):
                rule.append(lines[i])
                if "{" in lines[i]:
                    seen_open = True
                depth += lines[i].count("{") - lines[i].count("}")
                i += 1
            yield ("rule", "\n".join(rule))


def selector_of(rule: str) -> str:
    return rule.split("{", 1)[0]


def rule_theme(rule: str):
    m = re.search(r'\[data-theme="([\w-]+)"\]', selector_of(rule))
    return m.group(1) if m else None


def is_binding(rule: str) -> bool:
    sel = selector_of(rule)
    return any(w in sel for w in APP_WORDS)


class Bucket:
    def __init__(self):
        self.lines: list[str] = []

    def add(self, text: str):
        self.lines.append(text)


MEDIA_RE = re.compile(r"(@media[^{]*\{)(.*)(\}\s*$)", re.S)


def decompose_media(rule: str):
    """Split an @media block into (prelude, [inner rules]) so inner rules can
    be classified individually (the shared motion guard mixes mat-* and fg/bd
    selectors — the library half and the binding half must part ways)."""
    m = MEDIA_RE.match(rule.strip())
    if not m:
        return None
    prelude, inner, _ = m.groups()
    rules = []
    depth, buf = 0, ""
    for ch in inner:
        if ch == "{":
            depth += 1
            buf += ch
        elif ch == "}":
            depth -= 1
            buf += ch
            if depth == 0:
                rules.append(buf.strip())
                buf = ""
        else:
            if depth > 0 or buf.strip():
                buf += ch
    return prelude, [r for r in rules if r]


# Kits hand-authored AFTER the monolith era — the file on disk is the source
# of truth; the splitter references them in index.css but never rewrites
# them from monolith rules.
HAND_MAINTAINED = {
    "sunset",
    "neobrut",  # radicalised 2026-09-03
    "x10",
    "doof",
    "qalarc",
    "tradez",
    "gmux",
    "volkus",
    "endispute",
}


def split(source: pathlib.Path | None = None) -> int:
    css = (source or THEMES).read_text()

    # Skip the monolith's file-header comment: rules start at the first rule
    # line ("[data-theme] body, .mat-page {").
    start = next(
        i for i, l in enumerate(css.split("\n")) if l.startswith("[data-theme]")
    )
    body = "\n".join(css.split("\n")[start:])

    library = {t: Bucket() for t in THEME_ORDER}
    base = Bucket()
    bindings: dict = {}  # theme-id-or-None -> Bucket (order preserved below)
    order: list = []  # binding bucket insertion order

    pending: list[str] = []  # comments waiting to attach
    pending_blank = False  # a blank line is pending before next unit

    def emit(bucket: Bucket, text: str):
        for c in pending:
            bucket.add(c)
        pending.clear()
        if pending_blank and bucket.lines:
            bucket.add("")
        bucket.add(text)

    for kind, text in parse_units(body):
        if kind == "blank":
            # blank AFTER a comment detaches it (section marker); else pending
            if pending:
                pending_blank = True
            else:
                pending_blank = pending_blank or False
            pending_blank = True if not pending else pending_blank
            # a blank immediately after emitted rule just sets the flag
            if not pending:
                pending_blank = True
            continue
        if kind == "comment":
            pending.append(text)
            continue
        # rule
        theme = rule_theme(text)
        if text.lstrip().startswith("@media"):
            decom = decompose_media(text)
            if decom:
                prelude, inners = decom
                for inner in inners:
                    if is_binding(inner):
                        key = theme
                        if key not in bindings:
                            bindings[key] = Bucket()
                            order.append(key)
                        emit(bindings[key], prelude + "\n  " + inner + "\n}")
                    elif theme in library:
                        emit(library[theme], prelude + "\n  " + inner + "\n}")
                    else:
                        emit(base, prelude + "\n  " + inner + "\n}")
                pending_blank = False
                continue
        if is_binding(text):
            key = theme
            if key not in bindings:
                bindings[key] = Bucket()
                order.append(key)
            emit(bindings[key], text)
        elif theme in library:
            emit(library[theme], text)
        else:
            emit(base, text)
        pending_blank = False

    # ── write library files ────────────────────────────────────────────
    LIB.mkdir(exist_ok=True)
    (LIB / "base.css").write_text(
        "/* style-library/base.css — the shared foundation of every kit\n"
        "   (AUTO-SPLIT from the design/themes.css monolith by\n"
        "   scripts/styles/split_style_library.py — move/re-run, don't fork).\n"
        "   Applies the active kit's page texture, .mat-* primitive defaults\n"
        "   and shared @keyframes. App-agnostic by contract: no app classes.\n"
        "   selectors live in the library. */\n\n"
        + "\n".join(base.lines).rstrip()
        + "\n"
    )
    written = []
    for tid in THEME_ORDER:
        b = library[tid]
        preexisting = (LIB / f"theme-{tid}.css").exists()
        if not b.lines and not preexisting:
            continue  # no monolith rules and no hand-authored file — skip
        written.append(tid)
        if b.lines and tid not in HAND_MAINTAINED:
            # monolith contributed rules → (re)write the split file.
            # Hand-maintained kits keep their file as-is (disk is truth).
            (LIB / f"theme-{tid}.css").write_text(
                f'/* style-library/theme-{tid}.css — the "{tid}" material kit.\n'
                "   Tokens + .mat- primitives only. RWF app bindings (fg / bd classes)\n"
                "   live in design/themes.css. Name/label/provenance: README.md. */\n\n"
                + "\n".join(b.lines).rstrip()
                + "\n"
            )
    (LIB / "index.css").write_text(
        "/* style-library/index.css — master import chain (gallery order).\n"
        "   Import this one file; every kit is inert until an ancestor carries\n"
        '   data-theme="<id>". Contract + full catalogue: README.md. */\n'
        '@import url("base.css");\n'
        + "\n".join(f'@import url("theme-{t}.css");' for t in written)
        + "\n"
    )

    counts = {
        "library_rules": sum(
            len([l for l in library[t].lines if l and not l.lstrip().startswith("/*")])
            for t in written
        ),
        "base_rules": len(
            [l for l in base.lines if l and not l.lstrip().startswith("/*")]
        ),
        "binding_rules": sum(
            len([l for l in bindings[k].lines if l and not l.lstrip().startswith("/*")])
            for k in bindings
        ),
    }
    print("split OK —", counts)
    print("theme files:", ", ".join(written))
    print("binding buckets (in order):", [k or "shared" for k in order])
    for k in order:
        rules = [l for l in bindings[k].lines if l and not l.lstrip().startswith("/*")]
        print(f"  {k or 'shared'}: {len(rules)} rules")

    # phase-2 handoff: bindings for the themes.css writer
    (LIB / ".split-bindings.pkl").write_bytes(
        pickle.dumps(
            {"order": order, "bindings": {k: bindings[k].lines for k in order}}
        )
    )
    print("\nbindings stashed → design/style-library/.split-bindings.pkl")
    print("now write design/themes.css from the writer phase (import + these)")
    return 0


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--input",
        type=pathlib.Path,
        default=None,
        help="monolith to split from (default: design/themes.css; "
        "use design/archive/themes_v3_monolith_*.css to re-split)",
    )
    args = ap.parse_args()
    sys.exit(split(args.input))
