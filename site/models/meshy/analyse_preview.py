#!/usr/bin/env python3
"""Numeric silhouette analysis of Meshy preview thumbnails (no human eyes).

For each PNG: content bbox + aspect, mirror-symmetry IoU (bilateral character
read), top-edge profile (frog tell: TWO eye bumps above the skull dome), and
vertical mass split (head share vs body share). Runs on RGBA or RGB.

Usage: python3 analyse_preview.py A_preview.png B_preview.png ...
"""

import sys
import numpy as np
from PIL import Image


def analyse(path):
    im = Image.open(path)
    W, H = im.size
    a = np.asarray(im.convert("RGBA"), dtype=np.uint8)
    rgb, alpha = a[..., :3].astype(int), a[..., 3]
    # content = non-background: alpha>10 OR far from the corner colour
    corner = rgb[2, 2]
    mask = (alpha > 10) & (np.abs(rgb - corner).sum(axis=2) > 24)
    ys, xs = np.where(mask)
    if not len(xs):
        print(f"{path}: EMPTY")
        return
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    m = mask[y0 : y1 + 1, x0 : x1 + 1]
    h, w = m.shape
    # mirror symmetry: IoU of mask with its horizontal flip
    iou = (m & m[:, ::-1]).sum() / max(1, (m | m[:, ::-1]).sum())
    # top profile: for each x, the topmost content row (relative, 0=skull top)
    top = np.full(w, h)
    for xx in range(w):
        col = np.where(m[:, xx])[0]
        if len(col):
            top[xx] = col.min()
    tmin, tmax = top.min(), top.max()
    bumps = int(
        (top < tmin + (tmax - tmin) * 0.18).sum()
    )  # columns near the highest points
    # count distinct raised zones (eye bumps) along the top edge
    raised = top < tmin + (tmax - tmin) * 0.30
    zones, prev = 0, False
    for v in raised:
        if v and not prev:
            zones += 1
        prev = v
    # vertical mass split: which row halves hold the content
    rows = m.sum(axis=1)
    head_share = rows[: h // 2].sum() / max(1, rows.sum())
    print(
        f"{path}: {W}x{H} bbox {bw}x{bh} aspect {bw / bh:.2f} "
        f"symmetryIoU {iou:.2f} topBumps zones={zones} cols={bumps} "
        f"headMass(top half) {head_share:.2f}"
    )


if __name__ == "__main__":
    for p in sys.argv[1:]:
        analyse(p)
