#!/usr/bin/env python3
"""Pixel-level analysis of the frog expression shots (no human eyes needed).
Per shot: head bbox (skin hue — composition consistency check) and pale eye
pixels per side (open vs lidded vs wink). The MOUTH curvature read lives in
the page itself (__atelier.frogMouthProbe — it projects the tube's corner/mid
rings, which is exact; a jaw-shadow-contaminated pixel fit lives in git
history and was removed).

Usage: python3 frog_px_analyse.py shot1.png [shot2.png ...]
NOTE the sidedness convention: the camera looks at the character's face, so
viewer-LEFT = character side −1, viewer-RIGHT = side +1 (the side that winks
in `cheeky`).
"""

import sys


def hsv_hue(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d < 12:
        return None
    if mx == r:
        h = 60 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60 * (((b - r) / d) + 2)
    else:
        h = 60 * (((r - g) / d) + 4)
    return h if h < 360 else h - 360


def analyse(path):
    from PIL import Image

    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    skin_xs, skin_ys, pale_l, pale_r = [], [], [], []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            h = hsv_hue(r, g, b)
            if h is not None and 95 <= h <= 125 and max(r, g, b) > 55:  # green skin
                skin_xs.append(x)
                skin_ys.append(y)
            if (
                r > 150
                and g > 150
                and b > 90
                and g > b + 20
                and g > r - 25
                and r > b + 10
            ):  # pale eye-bulb yellow
                (pale_l if x < W // 2 else pale_r).append((x, y))
    name = path.split("/")[-1]
    if not skin_xs:
        return f"{name:32s} NO HEAD PIXELS"
    x0, x1, y0, y1 = min(skin_xs), max(skin_xs), min(skin_ys), max(skin_ys)
    return (
        f"{name:32s} head {x1 - x0:4d}x{y1 - y0:4d} at cx={(x0 + x1) / 2:4.0f} | "
        f"pale eye px  L(-1)={len(pale_l):5d}  R(+1)={len(pale_r):5d}"
    )


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(analyse(p))
