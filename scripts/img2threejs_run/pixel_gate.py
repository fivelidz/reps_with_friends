#!/usr/bin/env python3
"""Stage-4 pixel gate v2 — bbox-relative (model-localised) zone probes.
v1 used absolute frame fractions and mis-probed when the camera x-offset
shifted the model; this version finds the model bbox first, then checks
features as fractions OF THE MODEL. Run on beacon_shot.png."""

from PIL import Image
import sys

im = Image.open("beacon_shot.png").convert("RGB")
W, H = im.size
px = im.load()


def near(c, ref, tol=70):
    return sum((a - b) ** 2 for a, b in zip(c, ref)) ** 0.5 <= tol


REFS = {
    "hoodie": (0x8B, 0x5C, 0xF6),
    "hair": (0xFF, 0x5C, 0x38),
    "skin": (0xE8, 0xB8, 0x8A),
    "gold": (0xFF, 0xC8, 0x21),
    "lime": (0xC6, 0xF3, 0x2E),
    "sky": (0x6E, 0xC1, 0xFF),
    "dark": (0x0A, 0x0B, 0x0D),
}

# model bbox = non-background pixels (crop out the status text overlay,
# which sits in the top-left corner in lime)
bg = px[5, 5]
minx, maxx, miny, maxy = W, 0, H, 0
for y in range(40, H, 2):
    for x in range(70, W, 2):
        if not near(px[x, y], bg, 40):
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
bw, bh = maxx - minx, maxy - miny
print(f"model bbox x[{minx}..{maxx}] y[{miny}..{maxy}] {bw}x{bh}")


def zone_has(fx0, fy0, fx1, fy1, key, need=4):
    ref = REFS[key]
    n = 0
    for y in range(int(miny + fy0 * bh), int(miny + fy1 * bh), 2):
        for x in range(int(minx + fx0 * bw), int(minx + fx1 * bw), 2):
            if near(px[x, y], ref):
                n += 1
                if n >= need:
                    return True
    return False


checks = [
    ("purple hoodie mass (bottom 30%)", zone_has(0.05, 0.70, 0.95, 0.98, "hoodie", 60)),
    (
        "purple shoulders (mid flanks)",
        zone_has(0.00, 0.50, 0.30, 0.72, "hoodie", 10)
        and zone_has(0.70, 0.50, 1.00, 0.72, "hoodie", 10),
    ),
    ("skin face (centre band)", zone_has(0.30, 0.25, 0.70, 0.55, "skin", 12)),
    ("coral hair cap (upper centre)", zone_has(0.20, 0.05, 0.80, 0.30, "hair", 30)),
    (
        "coral top-knot ABOVE hair cap (top 12%)",
        zone_has(0.30, 0.00, 0.70, 0.12, "hair", 4),
    ),
    ("gold ring LEFT flank (ear height)", zone_has(0.00, 0.32, 0.28, 0.58, "gold", 3)),
    ("gold ring RIGHT flank (ear height)", zone_has(0.72, 0.32, 1.00, 0.58, "gold", 3)),
    ("dark headphone band/cups present", zone_has(0.10, 0.05, 0.90, 0.55, "dark", 8)),
    ("lime drawstrings (centre chest)", zone_has(0.30, 0.55, 0.70, 0.80, "lime", 3)),
    ("sky eyes on face front", zone_has(0.30, 0.30, 0.75, 0.52, "sky", 10)),
]

fails = 0
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
    fails += not ok

aspect = bw / bh
ok = 0.6 < aspect < 1.2
print(f"silhouette aspect {aspect:.2f} (expect 0.6-1.2)")
fails += not ok
total = len(checks) + 1
print(f"\nPIXEL GATE v2: {total - fails}/{total}")
sys.exit(1 if fails else 0)
