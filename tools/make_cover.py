#!/usr/bin/env python3
"""High-fidelity cover poster — mid-century aerospace print."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import random
import os

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
OUT = f"{BASE}/assets/ui/cover.png"
W, H = 1024, 1536

NAVY = (24, 54, 78, 255)
NAVY_IN = (16, 40, 60, 255)
CREAM = (240, 230, 211, 255)
CREAM_D = (210, 196, 168, 255)
GOLD = (201, 154, 58, 255)
GOLD_L = (232, 200, 120, 255)
GOLD_D = (150, 110, 40, 255)
PAPER = (236, 226, 206, 255)
PAPER_E = (200, 184, 152, 255)

fp = "/System/Library/Fonts/STHeiti Medium.ttc"
f_title = ImageFont.truetype(fp, 108)
f_sub = ImageFont.truetype(fp, 26)
f_btn = ImageFont.truetype(fp, 36)
f_tiny = ImageFont.truetype(fp, 16)
f_badge = ImageFont.truetype(fp, 15)

img = Image.new("RGBA", (W, H), PAPER)
d = ImageDraw.Draw(img, "RGBA")

# paper stock layers
rnd = random.Random(42)
# outer cream border with deckle feel
for i in range(3):
    o = 8 + i * 6
    d.rectangle([o, o, W - 1 - o, H - 1 - o], outline=PAPER_E if i else CREAM_D, width=1)

# inner navy field with slight inset (poster mat)
mx, my = 36, 36
d.rectangle([mx, my, W - mx, H - my], fill=NAVY)
# inner vignette ring
d.rectangle([mx + 10, my + 10, W - mx - 10, H - my - 10], outline=(30, 62, 88, 255), width=2)

# paper grain inside navy (soft)
grain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grain)
for _ in range(14000):
    x = rnd.randint(mx, W - mx)
    y = rnd.randint(my, H - my)
    a = rnd.randint(4, 18)
    gd.point((x, y), fill=(240, 230, 211, a))
grain = grain.filter(ImageFilter.GaussianBlur(0.4))
img.alpha_composite(grain)

# cream paper fiber on border
for _ in range(800):
    x = rnd.randint(0, W - 1)
    y = rnd.randint(0, H - 1)
    if mx - 2 <= x <= W - mx + 2 and my - 2 <= y <= H - my + 2:
        continue
    d.point((x, y), fill=(180, 160, 120, rnd.randint(10, 30)))


def star4(cx, cy, r, color, alpha=255):
    if len(color) == 4:
        fill = color
    else:
        fill = color + (alpha,)
    pts = [
        (cx, cy - r),
        (cx + r * 0.22, cy - r * 0.22),
        (cx + r, cy),
        (cx + r * 0.22, cy + r * 0.22),
        (cx, cy + r),
        (cx - r * 0.22, cy + r * 0.22),
        (cx - r, cy),
        (cx - r * 0.22, cy - r * 0.22),
    ]
    d.polygon(pts, fill=fill)


# decorative stars — varied, elegant
stars = [
    (118, 300, 12), (900, 260, 16), (150, 720, 9), (880, 680, 11),
    (200, 980, 8), (860, 1020, 10), (90, 1100, 7), (930, 900, 8),
    (240, 200, 7), (780, 180, 9), (100, 500, 6), (940, 480, 7),
    (480, 130, 8), (520, 1380, 6),
]
for sx, sy, sr in stars:
    star4(sx, sy, sr, CREAM)
for sx, sy, sr in [(760, 220, 7), (170, 860, 6), (840, 540, 5)]:
    star4(sx, sy, sr, GOLD_L)

# large hero star right of patch
star4(860, 780, 22, CREAM)
star4(860, 780, 10, GOLD_L)

# dashed orbital arc sweeping top
for i in range(28):
    t = i / 28
    ang = math.pi * (1.15 + t * 0.7)
    x = 512 + int(360 * math.cos(ang))
    y = 560 + int(320 * math.sin(ang))
    if mx + 20 < x < W - mx - 20 and my + 20 < y < H - my - 20:
        rr = 3 if i % 2 == 0 else 2
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(201,154,58,170))

# ── LUNA badge top-left ──
bcx, bcy, br = 128, 148, 54
# double ring
d.ellipse([bcx - br, bcy - br, bcx + br, bcy + br], outline=GOLD, width=5)
d.ellipse([bcx - br + 7, bcy - br + 7, bcx + br - 7, bcy + br - 7], outline=CREAM, width=1)
d.ellipse([bcx - br + 11, bcy - br + 11, bcx + br - 11, bcy + br - 11], outline=GOLD_L, width=1)
# crescent
d.ellipse([bcx - 20, bcy - 24, bcx + 20, bcy + 24], fill=GOLD_L)
d.ellipse([bcx - 4, bcy - 24, bcx + 30, bcy + 24], fill=NAVY)
star4(bcx + 26, bcy - 20, 7, CREAM)
d.text((bcx, bcy + 38), "LUNA", font=f_badge, fill=CREAM, anchor="mm")

# ── top-right plate ──
d.rectangle([690, 88, 968, 168], outline=CREAM, width=2)
d.line([968, 168, 968, 220], fill=CREAM, width=2)
for i, bw in enumerate([190, 160, 175]):
    d.rectangle([710, 106 + i * 20, 710 + bw, 114 + i * 20], fill=(240, 230, 211, 200))

# ── Mission patch ──
cx, cy, R = 512, 540, 255
# outer gold thick
d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=GOLD, width=12)
# mid cream
d.ellipse([cx - R + 16, cy - R + 16, cx + R - 16, cy + R - 16], outline=CREAM, width=2)
# inner gold thin
d.ellipse([cx - R + 24, cy - R + 24, cx + R - 24, cy + R - 24], outline=GOLD_L, width=1)
# inner navy disc
d.ellipse([cx - R + 30, cy - R + 30, cx + R - 30, cy + R - 30], fill=NAVY_IN)

# ring ornaments (diamonds / ticks)
for i in range(16):
    a = i * math.pi / 8
    if i % 4 == 0:
        # diamond
        px = cx + math.cos(a) * (R + 2)
        py = cy + math.sin(a) * (R + 2)
        s = 9
        d.polygon([(px, py - s), (px + s * 0.5, py), (px, py + s), (px - s * 0.5, py)], fill=GOLD_L)
    else:
        x1 = cx + math.cos(a) * (R - 4)
        y1 = cy + math.sin(a) * (R - 4)
        x2 = cx + math.cos(a) * (R + 8)
        y2 = cy + math.sin(a) * (R + 8)
        d.line([x1, y1, x2, y2], fill=GOLD, width=2)

# earth — poster crop (blue ocean + gold continents from original)
earth_path = f"{BASE}/assets/sprites/earth-poster.png"
if os.path.exists(earth_path):
    earth = Image.open(earth_path).convert("RGBA")
    # recolor blue ocean → teal to unify with play earth
    # light touch: leave as poster gold/blue if recolor fails
    es = 310
    earth = earth.resize((es, es), Image.Resampling.LANCZOS)
    # circular mask
    mask = Image.new("L", (es, es), 0)
    ImageDraw.Draw(mask).ellipse([2, 2, es - 3, es - 3], fill=255)
    earth.putalpha(mask)
    img.alpha_composite(earth, (cx - 185, cy - 155))
else:
    d.ellipse([cx - 150, cy - 130, cx + 130, cy + 150], fill=(61, 139, 122, 255))

# moon
moon_path = f"{BASE}/assets/sprites/moon.png"
if os.path.exists(moon_path):
    moon = Image.open(moon_path).convert("RGBA")
    ms = 130
    moon = moon.resize((ms, ms), Image.Resampling.LANCZOS)
    mask = Image.new("L", (ms, ms), 0)
    ImageDraw.Draw(mask).ellipse([1, 1, ms - 2, ms - 2], fill=255)
    # soft: use existing alpha
    img.alpha_composite(moon, (cx + 55, cy - 175))

# dashed orbit through patch (gold)
for i in range(18):
    t = i / 18
    x = int(cx - 170 + t * 360)
    y = int(cy + 50 + math.sin(t * math.pi) * 55)
    if i % 2 == 0:
        d.rectangle([x, y, x + 18, y + 7], fill=GOLD)
        d.rectangle([x + 2, y + 2, x + 16, y + 5], fill=GOLD_L)

# small cream stars inside patch
star4(cx - 100, cy - 80, 6, CREAM)
star4(cx + 90, cy + 40, 5, CREAM)
star4(cx - 60, cy + 100, 4, CREAM)

# ── Title ──
# soft gold shadow
d.text((516, 930), "逐月计划", font=f_title, fill=(90, 70, 30, 120), anchor="mm")
d.text((512, 924), "逐月计划", font=f_title, fill=CREAM, anchor="mm")

# gold rules + center star
d.line([200, 1018, 455, 1018], fill=GOLD, width=2)
d.line([569, 1018, 824, 1018], fill=GOLD, width=2)
star4(512, 1018, 11, GOLD_L)
d.text((512, 1072), "CATCH THE MOON", font=f_sub, fill=GOLD_L, anchor="mm")

# ── Buttons ──
def btn(x0, y0, x1, y1, label):
    # outer cream, inner navy, gold hairline
    d.rectangle([x0, y0, x1, y1], fill=NAVY_IN, outline=CREAM, width=3)
    d.rectangle([x0 + 5, y0 + 5, x1 - 5, y1 - 5], outline=GOLD, width=1)
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), label, font=f_btn, fill=CREAM, anchor="mm")


btn(200, 1288, 490, 1372, "开始任务")
btn(534, 1288, 824, 1372, "今日同场")

# footer
d.text((72, 1460), "VER. 1.0  ·  CHASE THE MOON", font=f_tiny, fill=CREAM_D, anchor="lm")
# crescent mark
d.ellipse([900, 1438, 948, 1486], fill=GOLD_L)
d.ellipse([916, 1438, 960, 1486], fill=NAVY)

img.save(OUT)
print("wrote", OUT)
