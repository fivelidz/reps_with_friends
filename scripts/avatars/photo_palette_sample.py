#!/usr/bin/env python3
"""photo_palette_sample.py — deterministic palette sampling for PHOTO AVATARS
(docs/23_IMG2THREEJS_INVESTIGATION.md §3).

Samples region-crop dominant colours from a reference image (median-cut via
Pillow) — the same method used to derive the palettes hardcoded in
site/models/photo_avatars/{pantera,mouse,monster}.js on 2026-09-02.

No vision required; runs anywhere (including on-device equivalents). The
expected evolution (docs/23 §4 step 2) is photo -> swatches -> factory params.

Usage:
    python3 scripts/avatars/photo_palette_sample.py <image> [<image> ...]
    # optional region crops: edit CROPS below per subject
"""

import sys
from collections import Counter
from PIL import Image

# named crops as (x0%, y0%, x1%, y1%) — tuned per reference subject
CROPS = {
    "head": (0.00, 0.00, 1.00, 0.13),
    "torso": (0.15, 0.25, 0.85, 0.45),
    "legs": (0.20, 0.45, 0.80, 0.85),
    "body": (0.25, 0.30, 0.75, 0.85),
    "full": (0.00, 0.00, 1.00, 1.00),
}


def palette(path, crop=None, n=6):
    im = Image.open(path).convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop(
            (int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h))
        )
    im.thumbnail((120, 120))
    q = im.quantize(colors=n, method=Image.MEDIANCUT).convert("RGB")
    cnt = Counter(list(q.getdata()))
    tot = im.width * im.height
    return [
        (f"#{r:02x}{g:02x}{b:02x}", round(v / tot * 100))
        for (r, g, b), v in cnt.most_common(n)
    ]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for path in sys.argv[1:]:
        print(f"== {path} ==")
        for name, crop in CROPS.items():
            try:
                print(
                    f"  {name:6s}",
                    " ".join(f"{c}({p}%)" for c, p in palette(path, crop)),
                )
            except Exception as e:  # crop outside image etc.
                print(f"  {name:6s} ERR {e}")
