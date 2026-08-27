#!/usr/bin/env python3
"""Analyse model-card screenshots: stage-only figure detection, dominant
colours overall + per vertical third (torso/legs split), silhouette metrics.
Usage: python3 model_analyse.py [dir]"""

import sys, os, glob, collections
from PIL import Image

STAGE_H = 300  # .style-stage is the top 300px of the card; text follows below


def fig_pixels(im):
    px = im.load()
    W, H = im.size
    out = []
    for y in range(0, H):
        for x in range(0, W):
            r, g, b = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            if mx > 60 and (mx > 110 or mx - mn > 45):
                out.append((x, y, (r, g, b)))
    return out


def dom(cols, n=4):
    if not cols:
        return []
    cc = collections.Counter(
        (c[0] >> 5 << 5, c[1] >> 5 << 5, c[2] >> 5 << 5) for c in cols
    )
    return [
        f"#{r:02x}{g:02x}{b:02x}({round(k * 100 / len(cols))}%)"
        for (r, g, b), k in cc.most_common(n)
    ]


def analyse(path):
    im = Image.open(path).convert("RGB")
    stage = im.crop((0, 0, im.size[0], min(STAGE_H, im.size[1])))
    fp = fig_pixels(stage)
    if not fp:
        return None
    xs = [p[0] for p in fp]
    ys = [p[1] for p in fp]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W, H = stage.size
    thirds = []
    for i in range(3):
        ya, yb = y0 + (y1 - y0) * i // 3, y0 + (y1 - y0) * (i + 1) // 3
        part = [c for x, y, c in fp if ya <= y < yb]
        thirds.append(dom(part, 2))
    return {
        "fill": len(fp) / (W * H),
        "bbox": (x1 - x0, y1 - y0),
        "cx": (x0 + x1) / 2 / W,
        "aspect": (x1 - x0) / max(1, y1 - y0),
        "dom": dom([c for _, _, c in fp]),
        "top": thirds[0],
        "mid": thirds[1],
        "bot": thirds[2],
    }


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else "/tmp/mv"
    for p in sorted(glob.glob(os.path.join(d, "*.png"))):
        r = analyse(p)
        name = os.path.basename(p)
        if not r:
            print(f"{name:44s} EMPTY STAGE (no figure pixels!)")
            continue
        print(
            f"{name:40s} fill={r['fill'] * 100:4.1f}% bbox={r['bbox'][0]}x{r['bbox'][1]} ar={r['aspect']:.2f} cx={r['cx']:.2f}"
        )
        print(f"{'':40s}   dom={r['dom']}")
        print(f"{'':40s}   top={r['top']} mid={r['mid']} bot={r['bot']}")
