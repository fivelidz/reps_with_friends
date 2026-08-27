#!/usr/bin/env python3
"""Stitch per-card verification shots into one contact sheet per exercise.
Usage: python3 contact_sheet.py <shots_dir> <out_dir>"""

import sys, os, glob
from PIL import Image, ImageDraw


def sheet(shots_dir, out_dir, exercise):
    files = sorted(glob.glob(os.path.join(shots_dir, f"{exercise}_*.png")))
    if not files:
        return False
    cards = [Image.open(f).convert("RGB") for f in files]
    w, h = cards[0].size
    cols = 4
    rows = (len(cards) + cols - 1) // cols
    pad, label_h = 8, 22
    out = Image.new(
        "RGB", (cols * (w + pad) + pad, rows * (h + pad + label_h) + pad), (10, 11, 13)
    )
    d = ImageDraw.Draw(out)
    for i, (f, im) in enumerate(zip(files, cards)):
        r, c = divmod(i, cols)
        x = pad + c * (w + pad)
        y = pad + r * (h + pad + label_h)
        out.paste(im, (x, y))
        name = os.path.basename(f).replace(f"{exercise}_", "").rsplit(".", 1)[0]
        name = name.split("_", 1)[-1].replace("-", " ")[:38]
        d.text((x + 4, y + h + 4), name, fill=(200, 204, 214))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"models_{exercise}.png")
    out.save(path)
    print("wrote", path, out.size)
    return True


if __name__ == "__main__":
    shots, out = sys.argv[1], sys.argv[2]
    for ex in ["stand", "squat", "pushup", "jumpingjack", "curl"]:
        sheet(shots, out, ex)
