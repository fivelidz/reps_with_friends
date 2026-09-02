#!/usr/bin/env python3
"""make_test_portrait.py — synthetic licence-clean test portrait for the PHOTO
BOOTH (apps/booth). PIL-composed cartoon bust — NOT a real person, no likeness.

Different subject from scripts/img2threejs_run/make_test_subject.py (beacon:
coral top-knot + headphones + purple hoodie) so the booth pipeline is proven on
NEW features: round gold glasses, short chestnut crop, stubble beard, mustard
crew tee with a coral chest stripe.

AUTHORED GROUND TRUTH (for honest intake scoring — every hex and shape known):
  background      #20293a   (flat, no gradients)
  skin            #caa27a   (face + neck + ears)
  hair (crop)     #7a4a2b   (short cap + tiny fringe hint, covers crown)
  beard/stubble   #5d3a22   (jaw band + chin patch)
  glasses rings   #e8b93e   (two round wire rings ON THE FACE, joined by bridge)
  garment         #e0a52e   (mustard crew tee, wide shoulders)
  chest stripe    #ff6b5e   (one horizontal coral band on the chest)
  eyes (behind)   #2e2a26   (two small dark rounds inside the rings)
  mouth           #7c4a3c   (small neutral line)

Usage: python3 scripts/booth/make_test_portrait.py [out.png]
"""

import sys

from PIL import Image, ImageDraw

W, H = 512, 640


def hex2rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def draw(path):
    im = Image.new("RGB", (W, H), hex2rgb("#20293a"))
    d = ImageDraw.Draw(im)

    # ── bust scaffold: tee shoulders + neck + head (same geometry language as
    #    the beacon test subject so intake framing generalises) ──────────────
    # mustard crew tee — trapezoid shoulders + collar
    d.polygon(
        [(96, 640), (140, 492), (372, 492), (416, 640)],
        fill=hex2rgb("#e0a52e"),
    )
    # coral chest stripe (identity accent)
    d.rectangle([128, 560, 384, 596], fill=hex2rgb("#ff6b5e"))
    # collar dip
    d.polygon(
        [(222, 492), (290, 492), (256, 526)],
        fill=hex2rgb("#caa27a"),
    )

    # neck
    d.rectangle([226, 420, 286, 500], fill=hex2rgb("#caa27a"))

    # head — slightly tall oval centred (256, 300), rx 118 ry 138
    d.ellipse([138, 162, 374, 438], fill=hex2rgb("#caa27a"))
    # ears
    d.ellipse([124, 272, 158, 322], fill=hex2rgb("#caa27a"))
    d.ellipse([354, 272, 388, 322], fill=hex2rgb("#caa27a"))

    # ── hair: short chestnut crop — cap band over crown + slight fringe ─────
    # (shallow pieslice so a skin forehead band shows below the cap line)
    d.pieslice([134, 150, 378, 330], 180, 360, fill=hex2rgb("#7a4a2b"))
    # fringe hint: two shallow scallops under the cap line
    d.ellipse([168, 208, 240, 240], fill=hex2rgb("#7a4a2b"))
    d.ellipse([280, 208, 352, 240], fill=hex2rgb("#7a4a2b"))

    # ── beard/stubble: jaw band + chin patch, darker than hair ──────────────
    d.arc([160, 250, 352, 452], 20, 160, fill=hex2rgb("#5d3a22"), width=26)
    d.ellipse([228, 388, 284, 430], fill=hex2rgb("#5d3a22"))

    # ── glasses: two round GOLD wire rings on the face + bridge + temples ──
    ring = hex2rgb("#e8b93e")
    d.ellipse([178, 272, 246, 340], outline=ring, width=7)  # left lens
    d.ellipse([266, 272, 334, 340], outline=ring, width=7)  # right lens
    d.line([246, 302, 266, 302], fill=ring, width=7)  # bridge
    d.line([178, 302, 150, 296], fill=ring, width=6)  # temple L
    d.line([334, 302, 362, 296], fill=ring, width=6)  # temple R
    # eyes behind the lenses
    d.ellipse([202, 292, 226, 316], fill=hex2rgb("#2e2a26"))
    d.ellipse([290, 292, 314, 316], fill=hex2rgb("#2e2a26"))

    # mouth — small neutral line, clear of the beard chin patch
    d.rounded_rectangle([238, 366, 274, 376], 5, fill=hex2rgb("#7c4a3c"))

    im.save(path)
    print(f"wrote {path} ({W}x{H}) — authored ground truth in module docstring")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "scripts/booth/test_portrait.png"
    draw(out)
