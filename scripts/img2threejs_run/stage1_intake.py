#!/usr/bin/env python3
"""Stage-1 INTAKE for the img2threejs run (docs/23 §5) — REAL vision call.

Follows the skill's intake shape (validation rubric -> detail inventory ->
palette) but bounded to a character BUST reconstruction, and demands STRICT JSON
so we can score the vision output against the authored ground truth
(make_test_subject.py docstring). Output: intake.json + scored verdict.
"""

import json, sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from glm_call import vision_call

RUN = pathlib.Path(__file__).parent

PROMPT = """You are the intake stage of an image->3D reconstruction pipeline (img2threejs skill).
Analyse the reference image and return STRICT JSON only (no markdown fence, no commentary):
{
 "suitable_for_3d": true/false,
 "subject_class": "character bust" | "object" | "other",
 "palette": [{"region": "...", "hex": "#rrggbb", "note": "..."}],
 "zones": [{"name": "...", "what": "...", "colour_hex": "#rrggbb", "position": "relative position", "size": "relative size"}],
 "proportions": {"head_height_vs_canvas": 0.0-1.0, "shoulder_width_vs_head_width": 0.0-9.9, "notes": "..."},
 "silhouette_signature": ["the 2-3 most identity-defining silhouette features"],
 "expression": "...",
 "quality_contract": {"target": "stylised flat-colour bust reconstruction", "must_nail": ["..."], "acceptable_approximations": ["..."]},
 "hidden_sides_note": "single image cannot show: ..."
}
Rules: sample colours as actual hex estimates from the pixels. Every distinct colour region gets a palette entry. The zones list must cover every visible element. Be precise about what is ON the head vs PART of the garment."""

text = vision_call("intake_stage1", RUN / "test_subject.png", PROMPT, max_tokens=3000)
(RUN / "intake_raw.txt").write_text(text)

# strip possible fence, parse
t = text.strip()
if t.startswith("```"):
    t = t.split("```")[1]
    if t.startswith("json"):
        t = t[4:]
try:
    intake = json.loads(t)
except Exception as e:
    print("PARSE FAIL:", e)
    print(t[:800])
    sys.exit(1)
(RUN / "intake.json").write_text(json.dumps(intake, indent=1))


# ── score against authored ground truth ──────────────────────────────────────
def hexdist(a, b):
    a = [int(a[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(b[i : i + 2], 16) for i in (1, 3, 5)]
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


GT = {  # from make_test_subject.py
    "background": "#131a2e",
    "skin": "#e8b88a",
    "hair": "#ff5c38",
    "eyes": "#6ec1ff",
    "mouth/zip-dark": "#0a0b0d",
    "hoodie": "#8b5cf6",
    "gold accents": "#ffc821",
    "drawstrings": "#c6f32e",
    "headphone charcoal": "#1a1d23",
}
reported = [p["hex"].lower() for p in intake.get("palette", [])]
print(f"palette entries reported: {len(reported)}")
hits = 0
for name, gthex in GT.items():
    best = min(reported, key=lambda h: hexdist(h, gthex)) if reported else None
    d = hexdist(best, gthex) if best else 999
    ok = d <= 60  # generous perceptual tolerance
    hits += ok
    print(
        f"  {'HIT ' if ok else 'MISS'} {name:22s} gt={gthex} best={best} dist={d:.0f}"
    )
print(f"PALETTE SCORE: {hits}/{len(GT)}")
sig = " ".join(intake.get("silhouette_signature", [])).lower()
for kw in ("headphone", "bun", "top-knot", "shoulder"):
    print(f"  silhouette mentions '{kw}':", kw in sig)
print("\nzones:", [z["name"] for z in intake.get("zones", [])])
print("\nproportions:", json.dumps(intake.get("proportions", {})))
