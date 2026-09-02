#!/usr/bin/env python3
"""pixel_gate.py — PHOTO BOOTH stage-3 deterministic pixel gate (PIL, no LLM).

The vision reviewer is GENEROUS (docs/23 §5.3 finding #8: it missed 3 real
defects) — deterministic probes own the gate. This generalises the proven
bbox-relative zone method from scripts/img2threejs_run/pixel_gate.py to ANY
bust: instead of hand-authored zones we check the invariants that make a bust
shippable:
  1. RENDERS       — model bbox occupies a sane fraction of the frame and the
                     silhouette aspect is bust-like (0.45–1.35, not a pancake).
  2. MULTI-PART    — the render is not one blob: >= 4 distinct colour clusters
                     inside the model bbox.
  3. PALETTE FIDELITY — >= 2 of the intake palette's top 3 hexes actually appear
                     in the render (tolerance 80 — lights shift flat colours;
                     the beacon gate passed at tol 70 against lit renders).
Exit 0 = PASS. stdout = one-line JSON verdict (fed to the retry prompt on fail).
"""

import json
import sys
from collections import Counter

from PIL import Image

BG_TOL = 40
PAL_TOL = 80


def rgb(hexv: str):
    h = hexv.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def near(c, ref, tol: float) -> bool:
    return sum((a - b) ** 2 for a, b in zip(c, ref)) ** 0.5 <= tol


def main(shot_path: str, palette_json: str) -> int:
    im = Image.open(shot_path).convert("RGB")
    W, H = im.size

    # ── model bbox: non-background pixels (skip 40px top strip — status text) ─
    scan = im.crop((0, 40, W, H))
    sw, sh = scan.size
    data = scan.tobytes()  # raw RGB bytes: index = (y * sw + x) * 3
    bg = data[(5 * sw + 5) * 3:(5 * sw + 5) * 3 + 3]

    minx, miny, maxx, maxy = sw, sh, 0, 0
    covered = 0
    for iy in range(0, sh, 2):
        row = iy * sw * 3
        for ix in range(0, sw, 2):
            i = row + ix * 3
            c = (data[i], data[i + 1], data[i + 2])
            if not near(c, bg, BG_TOL):
                minx, maxx = min(minx, ix), max(maxx, ix)
                miny, maxy = min(miny, iy), max(maxy, iy)
                covered += 1

    def verdict(ok, checks):
        print(json.dumps({"ok": ok, "checks": checks}))
        return 0 if ok else 1

    if maxx <= minx or maxy <= miny:
        return verdict(
            False,
            [
                {
                    "name": "renders",
                    "pass": False,
                    "detail": "no model pixels found — blank render",
                }
            ],
        )

    bw, bh = maxx - minx, maxy - miny
    frac = covered / ((sw * sh) / 4)
    aspect = bw / bh
    checks = [
        {
            "name": "renders",
            "pass": frac >= 0.04 and 0.45 <= aspect <= 1.35,
            "detail": f"bbox {bw}x{bh} aspect {aspect:.2f} coverage {frac * 100:.1f}%",
        }
    ]

    # ── distinct colour clusters inside the bbox (quantised to 4-bit/channel) ─
    crop = im.crop((minx, 40 + miny, maxx + 1, 40 + maxy + 1))
    clusters: Counter = Counter()
    cdata = crop.tobytes()
    for iy in range(0, crop.height, 2):
        row = iy * crop.width * 3
        for ix in range(0, crop.width, 2):
            i = row + ix * 3
            c = (cdata[i], cdata[i + 1], cdata[i + 2])
            if near(c, bg, BG_TOL):
                continue
            clusters[(c[0] >> 4, c[1] >> 4, c[2] >> 4)] += 1
    distinct = sum(1 for _, n in clusters.most_common(24) if n >= 25)
    checks.append(
        {
            "name": "multi-part",
            "pass": distinct >= 4,
            "detail": f"{distinct} distinct colour clusters (need >=4)",
        }
    )

    # ── palette fidelity: top-3 intake hexes present in the render ────────────
    palette = [str(h) for h in json.loads(palette_json)]
    hits = []
    for hexv in palette[:3]:
        ref = rgb(hexv)
        n = sum(
            cnt
            for (q, cnt) in clusters.items()
            if near((q[0] << 4, q[1] << 4, q[2] << 4), ref, PAL_TOL + 22)
        )
        hits.append((hexv, n))
    pal_ok = sum(1 for _, n in hits if n >= 25)
    checks.append(
        {
            "name": "palette-fidelity",
            "pass": pal_ok >= 2,
            "detail": f"{pal_ok}/3 top palette colours present: "
            + ", ".join(f"{h}~{n}px" for h, n in hits),
        }
    )

    return verdict(all(c["pass"] for c in checks), checks)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
