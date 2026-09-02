#!/usr/bin/env python3
"""Test subject for the img2threejs REAL vision-driven run (docs/23 §5).

Composes a flat-colour cartoon character BUST with PIL — an image, no person,
no licence exposure (we drew it; ground truth is this script). Colours are the
RWF design tokens (design/tokens.css) so any faithful reconstruction lands in
our palette by construction.

Ground truth (for scoring the vision model's description):
  canvas 768x768, flat bg --ink-navy #131a2e
  bust, centred, fills ~78% height:
    head      ellipse, skin #e8b88a, centre (384, 300), rx 118 ry 132
    hair      coral #ff5c38 — cap over top of head + asymmetric fringe sweep
              over the LEFT eye (viewer left) + top-knot bun at (384, 148)
    eyes      two rounded-rect eyes sky #6ec1ff, 34x20 @ (330,300) & (438,300),
              the LEFT one half-covered by the coral fringe
    mouth     small open smile, dark #0a0b0d arc+chord, centre (384, 368)
    hoodie    energy purple #8b5cf6 shoulders trapezoid, base y 640,
              hood collar arc behind neck, gold #ffc821 zip pull dot (384, 520)
    drawstrings lime #c6f32e, two verticals x=364 & x=404, y 430..510
    headphones: charcoal #1a1d23 band over the hair + two ear cups (circles
              r 46) at (266,312) & (502,312) with gold #ffc821 outer ring
  signature silhouette: top-knot + headphones + wide square shoulders
"""

from PIL import Image, ImageDraw

W = H = 768
BG = "#131a2e"  # --ink-navy
SKIN = "#e8b88a"
HAIR = "#ff5c38"  # --coral
EYE = "#6ec1ff"  # --sky
DARK = "#0a0b0d"  # --bg
HOODIE = "#8b5cf6"  # --energy
GOLD = "#ffc821"  # --gold
LIME = "#c6f32e"  # --lime
CHAR = "#1a1d23"  # --surface-2

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# hoodie shoulders — wide square-ish trapezoid (signature silhouette)
d.polygon([(140, 640), (628, 640), (560, 470), (208, 470)], fill=HOODIE)
# hood collar behind the neck (arc rising above shoulder line)
d.ellipse((296, 420, 472, 560), fill=HOODIE)
# zip pull
d.ellipse((372, 506, 396, 530), fill=GOLD)
# drawstrings
d.line((364, 430, 364, 510), fill=LIME, width=10)
d.line((404, 430, 404, 510), fill=LIME, width=10)
for x in (364, 404):  # string tips
    d.ellipse((x - 9, 510, x + 9, 528), fill=LIME)

# neck
d.rectangle((352, 380, 416, 470), fill=SKIN)

# head
d.ellipse((266, 168, 502, 432), fill=SKIN)

# hair — cap over the top of the head
d.pieslice((262, 158, 506, 400), 180, 360, fill=HAIR)
# asymmetric fringe sweeping over the viewer-LEFT eye
d.polygon([(266, 300), (384, 210), (396, 250), (352, 318), (300, 330)], fill=HAIR)
# top-knot bun (signature)
d.ellipse((348, 108, 420, 180), fill=HAIR)

# eyes — rounded rects, LEFT one partially under the fringe
d.rounded_rectangle((312, 290, 346, 310), 10, fill=EYE)
d.rounded_rectangle((422, 290, 456, 310), 10, fill=EYE)
# brows — short dark strokes above
d.line((314, 274, 344, 270), fill=DARK, width=7)
d.line((424, 270, 454, 274), fill=DARK, width=7)

# mouth — small open smile
d.pieslice((352, 348, 416, 400), 20, 160, fill=DARK)

# headphones — band over the hair, cups on the ears
d.arc((240, 140, 528, 430), 180, 360, fill=CHAR, width=22)
for cx in (266, 502):  # ear cups + gold rings
    d.ellipse((cx - 52, 260, cx + 52, 364), fill=GOLD)
    d.ellipse((cx - 40, 272, cx + 40, 352), fill=CHAR)

img.save("test_subject.png")
print("wrote test_subject.png", img.size)
