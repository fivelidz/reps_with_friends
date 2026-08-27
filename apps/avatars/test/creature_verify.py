#!/usr/bin/env python3
"""Pixel-verify the creature cards: landmark sampling, membrane-vs-background
WCAG contrast, colour census, and an ASCII silhouette map (the analyst model
cannot view images — per the investigation's method note, pixel evidence and
silhouette maps are the evidence). Usage: python3 creature_verify.py"""

import json, sys
from PIL import Image

_LM = json.load(open("/tmp/creature_landmarks.json"))
LM = {c["stage"]: c for c in (_LM["cards"] if isinstance(_LM, dict) else _LM)}


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = c[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def wcag(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def sample(img, xy, r=3):
    x, y = xy
    px = [
        img.getpixel(
            (min(max(x + dx, 0), img.width - 1), min(max(y + dy, 0), img.height - 1))
        )
        for dx in range(-r, r + 1)
        for dy in range(-r, r + 1)
    ]
    px.sort(key=lambda p: p[0] + p[1] + p[2])
    return px[len(px) // 2]


def hexs(c):
    return "#%02x%02x%02x" % c[:3]


def classify(p):
    r, g, b = p[:3]
    if abs(r - 0xFF) < 70 and abs(g - 0x5C) < 80 and abs(b - 0x38) < 80 and r > b + 60:
        return "membrane"
    if r > 200 and g > 150 and b < 110:
        return "eye/horn/tooth"
    if g > r and g > b:
        return "green"  # body OR tile — separated by census below
    return "other"


for stage in ["hatchling", "fledgling", "elder"]:
    img = Image.open(f"/tmp/creature_stage_{stage}.png").convert("RGB")
    card = LM[stage]["rect"]
    off = (round(card["x"]), round(card["y"]))
    print(f"\n=== {stage} ===  img {img.width}x{img.height}  card off {off}")

    # landmark samples
    for name, lm in LM[stage]["landmarks"].items():
        if not lm:
            continue
        x, y = lm["page"][0] - off[0], lm["page"][1] - off[1]
        if 0 <= x < img.width and 0 <= y < img.height:
            c = sample(img, (x, y))
            print(f"  {name:12s} ({x:3d},{y:3d}) {hexs(c)}  {classify(c)}")
        else:
            print(f"  {name:12s} ({x:3d},{y:3d}) OUT OF FRAME")

    # census + contrast
    counts, mem_px, tile_px, body_px = {}, [], [], []
    for y in range(0, img.height, 2):
        for x in range(0, img.width, 2):
            p = img.getpixel((x, y))
            k = classify(p)
            counts[k] = counts.get(k, 0) + 1
            if k == "membrane":
                mem_px.append(p)
            elif k == "green":
                # body greens are saturated (g/r ≥ ~1.9); tile moss is muted (~1.6-1.75)
                (tile_px if p[1] < p[0] * 1.9 else body_px).append(p)
    tot = sum(counts.values())
    print(
        "  census:",
        {
            k: f"{v * 100 // tot}%"
            for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
        },
    )
    print(
        f"  membrane px: {len(mem_px)}, body-green px: {len(body_px)}, tile-green px: {len(tile_px)}"
    )

    # dragon size in canvas: bbox of membrane+body pixels within the 240x300 canvas
    dx, dy = [], []
    for y in range(0, min(300, img.height), 2):
        for x in range(0, img.width, 2):
            p = img.getpixel((x, y))
            k = classify(p)
            if k == "membrane" or (k == "green" and p[1] >= p[0] * 1.9):
                dx.append(x)
                dy.append(y)
    if dx:
        print(
            f"  dragon bbox: x[{min(dx)}..{max(dx)}] y[{min(dy)}..{max(dy)}] of 240x300"
            f" → fills {(max(dx) - min(dx)) / 240 * 100:.0f}% w, {(max(dy) - min(dy)) / 300 * 100:.0f}% h"
        )

    if mem_px and tile_px:
        avg = lambda ps: tuple(sum(c[i] for c in ps) // len(ps) for i in range(3))
        am, at = avg(mem_px), avg(tile_px)
        print(
            f"  avg membrane {hexs(am)}  vs avg tile {hexs(at)}  → WCAG contrast {wcag(am, at):.2f}:1"
        )

    # ASCII silhouette: dragon = membrane ∪ body-green (excludes tiles)
    W, H = 76, 34
    sx, sy = img.width / W, img.height / H
    grid = []
    for gy in range(H):
        row = ""
        for gx in range(W):
            hits = {"m": 0, "b": 0, "t": 0}
            for yy in range(int(gy * sy), min(int((gy + 1) * sy), img.height), 3):
                for xx in range(int(gx * sx), min(int((gx + 1) * sx), img.width), 3):
                    k = classify(img.getpixel((xx, yy)))
                    if k == "membrane":
                        hits["m"] += 1
                    elif k == "green":
                        q = img.getpixel((xx, yy))
                        hits["t" if q[1] < q[0] * 1.9 else "b"] += 1
            row += (
                "M"
                if hits["m"] > 2
                else ("#" if hits["b"] > 2 else ("." if hits["t"] > 2 else " "))
            )
        grid.append(row)
    print("  silhouette (M=membrane #=body .=tile):")
    for row in grid:
        if row.strip():
            print("   |" + row + "|")
