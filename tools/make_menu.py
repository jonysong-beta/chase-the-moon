#!/usr/bin/env python3
"""Mission panel art — aligns with 01 instrument-poster language."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import random
import os

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
OUT = f"{BASE}/assets/ui/menu.png"
W, H = 1024, 1536

NAVY = (10, 22, 36, 255)
CREAM = (240, 230, 211, 255)
GOLD = (201, 154, 58, 255)
GOLD_L = (232, 200, 120, 255)
RUST = (217, 100, 48, 255)
PAPER = (236, 226, 206, 255)
INK = (10, 20, 32, 255)

fp = "/System/Library/Fonts/STHeiti Medium.ttc"
f = ImageFont.truetype(fp, 28)
fs = ImageFont.truetype(fp, 20)
fxs = ImageFont.truetype(fp, 15)
fbtn = ImageFont.truetype(fp, 32)

img = Image.new("RGBA", (W, H), PAPER)
d = ImageDraw.Draw(img, "RGBA")
mx, my = 24, 24
d.rectangle([mx, my, W - mx, H - my], fill=NAVY)

rnd = random.Random(9)
grain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grain)
for _ in range(10000):
    x = rnd.randint(mx, W - mx)
    y = rnd.randint(my, H - my)
    gd.point((x, y), fill=(240, 230, 211, rnd.randint(3, 14)))
img.alpha_composite(grain.filter(ImageFilter.GaussianBlur(0.35)))


def star4(cx, cy, r, color):
    d.polygon(
        [
            (cx, cy - r),
            (cx + r * 0.22, cy - r * 0.22),
            (cx + r, cy),
            (cx + r * 0.22, cy + r * 0.22),
            (cx, cy + r),
            (cx - r * 0.22, cy + r * 0.22),
            (cx - r, cy),
            (cx - r * 0.22, cy - r * 0.22),
        ],
        fill=color,
    )


for sx, sy, sr in [(70, 200, 8), (950, 240, 10), (50, 720, 7), (970, 800, 8),
                   (80, 1080, 9), (940, 1100, 7), (40, 460, 5), (980, 500, 6),
                   (120, 360, 5), (900, 400, 5)]:
    star4(sx, sy, sr, CREAM)

# reticles
def reticle_c(cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CREAM, width=2)
    d.line([cx - r - 14, cy, cx + r + 14, cy], fill=CREAM, width=1)
    d.line([cx, cy - r - 14, cx, cy + r + 14], fill=CREAM, width=1)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], outline=CREAM, width=2)


def reticle_s(cx, cy, r):
    # corner brackets like 01
    L = 18
    for sx, sy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        x = cx + sx * r
        y = cy + sy * r
        d.line([x, y, x - sx * L, y], fill=CREAM, width=2)
        d.line([x, y, x, y - sy * L], fill=CREAM, width=2)
    d.line([cx - r - 8, cy, cx + r + 8, cy], fill=CREAM, width=1)
    d.line([cx, cy - r - 8, cx, cy + r + 8], fill=CREAM, width=1)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=CREAM)


reticle_c(130, 140, 50)
reticle_s(890, 140, 48)

d.text((512, 72), "SOL III / EARTH", font=fs, fill=CREAM, anchor="mm")
d.text((130, 240), "MISSION 07 / LUNA", font=fs, fill=CREAM, anchor="lm")
d.text((130, 272), "T+ 00:00:12", font=fxs, fill=GOLD_L, anchor="lm")
d.text((890, 240), "TARGET / LUNA", font=fs, fill=CREAM, anchor="rm")
d.text((890, 272), "RNG 384.40", font=fxs, fill=GOLD_L, anchor="rm")

# orange dashed orbits (like 01)
for i in range(30):
    a = i * math.pi / 15
    x = 400 + int(300 * math.cos(a))
    y = 640 + int(100 * math.sin(a) - 40 * math.cos(2 * a))
    if i % 2 == 0:
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(217,100,48,200))

for i in range(26):
    a = i * math.pi / 13 + 0.5
    x = 580 + int(340 * math.cos(a))
    y = 700 + int(130 * math.sin(a))
    if i % 2 == 0:
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(201,154,58,180))

# cream dashed path moon→earth
for i in range(16):
    t = i / 16
    x = int(720 - t * 380)
    y = int(520 + t * 280)
    if i % 2 == 0:
        d.rectangle([x, y, x + 12, y + 3], fill=(240, 230, 211, 160))


def paste_circle(path, cx, cy, size):
    if not os.path.exists(path):
        return
    im = Image.open(path).convert("RGBA")
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([1, 1, size - 2, size - 2], fill=255)
    a = im.split()[-1]
    im.putalpha(Image.composite(a, Image.new("L", (size, size), 0), mask))
    img.alpha_composite(im, (cx - size // 2, cy - size // 2))


paste_circle(f"{BASE}/assets/sprites/moon.png", 700, 520, 380)
paste_circle(f"{BASE}/assets/sprites/earth.png", 300, 780, 220)

# well
well = Image.open(f"{BASE}/assets/sprites/well.png").convert("RGBA")
well = well.resize((340, 230), Image.Resampling.LANCZOS)
img.alpha_composite(well, (600, 900))

# signals
sig = Image.open(f"{BASE}/assets/sprites/signal.png").convert("RGBA")
sig = sig.resize((72, 72), Image.Resampling.LANCZOS)
img.alpha_composite(sig, (400, 480))
img.alpha_composite(sig, (460, 820))
img.alpha_composite(sig, (250, 620))

# rock
rock = Image.open(f"{BASE}/assets/sprites/rock.png").convert("RGBA")
rock = rock.resize((110, 100), Image.Resampling.LANCZOS)
img.alpha_composite(rock, (160, 980))

d.text((320, 940), "RNG 7120.44", font=fxs, fill=GOLD_L, anchor="lm")
d.text((320, 968), "RT 03:42:18", font=fxs, fill=GOLD_L, anchor="lm")

# ── cream instrument footer (01 language) — compact ──
fy = 1120
d.rectangle([mx, fy, W - mx, H - my], fill=CREAM)
for i in range(40):
    x = 40 + i * 24
    h = 10 if i % 5 == 0 else 5
    d.line([x, fy + 8, x, fy + 8 + h], fill=(40, 40, 40, 200), width=2)

d.rectangle([40, fy + 30, W - 40, fy + 78], outline=(40, 40, 40, 220), width=2)
rcx, rcy = 78, fy + 54
d.ellipse([rcx - 12, rcy - 12, rcx + 12, rcy + 12], outline=(40, 40, 40, 220), width=2)
d.line([rcx - 18, rcy, rcx + 18, rcy], fill=(40, 40, 40, 220), width=1)
d.line([rcx, rcy - 18, rcx, rcy + 18], fill=(40, 40, 40, 220), width=1)
d.text((108, fy + 54), "COURSE / 045.2°", font=fxs, fill=(30, 30, 30, 255), anchor="lm")
d.text((W - 50, fy + 46), "RNG 7120.44", font=fxs, fill=(30, 30, 30, 255), anchor="rm")
d.text((W - 50, fy + 66), "RT 03:42:18", font=fxs, fill=(30, 30, 30, 255), anchor="rm")

d.rectangle([40, fy + 92, W - 40, fy + 112], fill=RUST)
d.rectangle([40, fy + 120, W - 40, fy + 134], fill=(180, 80, 40, 255))
d.rectangle([40, fy + 142, W - 40, fy + 152], fill=(150, 60, 30, 255))

slot_y = fy + 168

def slot(x0, y0, x1, y1, label, fill=None, tcol=None, font=None):
    if fill:
        d.rectangle([x0, y0, x1, y1], fill=fill, outline=(20, 20, 20, 255), width=3)
    else:
        d.rectangle([x0, y0, x1, y1], outline=(20, 20, 20, 255), width=3)
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), label, font=font or fbtn, fill=tcol or (20, 20, 20, 255), anchor="mm")


slot(250, slot_y, 430, slot_y + 54, "休闲", fill=None)
slot(470, slot_y, 650, slot_y + 54, "标准", fill=(232, 200, 120, 255), tcol=INK)
d.rectangle([140, slot_y + 70, 884, slot_y + 134], fill=(250, 246, 236, 255), outline=(20, 20, 20, 255), width=4)
d.text((512, slot_y + 102), "开始追逐", font=fbtn, fill=INK, anchor="mm")

for i, lab in enumerate(["今日同场", "本机榜单", "声音"]):
    x0 = 140 + i * 250
    slot(x0, slot_y + 150, x0 + 230, slot_y + 200, lab, font=fs)

d.text((512, slot_y + 228), "返回封面", font=fxs, fill=(70, 70, 70, 255), anchor="mm")

img.save(OUT)
print("wrote", OUT)
