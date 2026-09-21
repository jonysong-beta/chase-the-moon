#!/usr/bin/env python3
"""Compose vertical cover from AI square art + printed title/buttons."""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/generated-1789399937244.png"
OUT = f"{BASE}/assets/ui/cover.png"
W, H = 1024, 1536

NAVY = (18, 36, 52, 255)
CREAM = (240, 230, 211, 255)
GOLD = (201, 154, 58, 255)
GOLD_L = (232, 200, 120, 255)
PAPER = (236, 222, 196, 255)
INK = (12, 22, 34, 255)

fp = "/System/Library/Fonts/STHeiti Medium.ttc"
f_title = ImageFont.truetype(fp, 96)
f_sub = ImageFont.truetype(fp, 24)
f_btn = ImageFont.truetype(fp, 34)
f_tiny = ImageFont.truetype(fp, 15)

src = Image.open(SRC).convert("RGBA")
# place square art in upper 2/3
art = src.resize((920, 920), Image.Resampling.LANCZOS)

img = Image.new("RGBA", (W, H), NAVY)
# paper border
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W - 1, H - 1], fill=PAPER)
bw = 28
d.rectangle([bw, bw, W - bw, H - bw], fill=NAVY)

# paste art centered in upper area, slight inset from paper
img.alpha_composite(art, (52, 48))

# extend navy below art with subtle stars
import random
rnd = random.Random(3)
for _ in range(40):
    x = rnd.randint(bw + 10, W - bw - 10)
    y = rnd.randint(980, 1280)
    if rnd.random() < 0.25:
        # tiny 4-point
        r = rnd.randint(3, 7)
        d = ImageDraw.Draw(img)
        d.polygon([(x, y - r), (x + 2, y - 2), (x + r, y), (x + 2, y + 2),
                   (x, y + r), (x - 2, y + 2), (x - r, y), (x - 2, y - 2)], fill=CREAM)
    else:
        ImageDraw.Draw(img).point((x, y), fill=CREAM)

d = ImageDraw.Draw(img)
# title
d.text((516, 1048), "逐月计划", font=f_title, fill=(60, 50, 30, 100), anchor="mm")
d.text((512, 1042), "逐月计划", font=f_title, fill=CREAM, anchor="mm")
d.line([230, 1125, 455, 1125], fill=GOLD, width=2)
d.line([569, 1125, 794, 1125], fill=GOLD, width=2)
# center diamond
d.polygon([(512, 1114), (520, 1125), (512, 1136), (504, 1125)], fill=GOLD_L)
d.text((512, 1175), "CATCH THE MOON", font=f_sub, fill=GOLD_L, anchor="mm")


def btn(x0, y0, x1, y1, label):
    d.rectangle([x0, y0, x1, y1], fill=INK, outline=CREAM, width=3)
    d.rectangle([x0 + 5, y0 + 5, x1 - 5, y1 - 5], outline=GOLD, width=1)
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), label, font=f_btn, fill=CREAM, anchor="mm")


btn(200, 1310, 490, 1394, "开始任务")
btn(534, 1310, 824, 1394, "今日同场")
d.text((72, 1470), "VER. 1.0  ·  CHASE THE MOON", font=f_tiny, fill=(200, 190, 160, 255), anchor="lm")
# crescent
d.ellipse([900, 1448, 944, 1492], fill=GOLD_L)
d.ellipse([914, 1448, 954, 1492], fill=NAVY)

# LUNA badge top-left over art paper? art has its own border - draw badge on navy strip if needed
# small badge over top-left of stage
bcx, bcy, br = 120, 130, 42
d.ellipse([bcx - br, bcy - br, bcx + br, bcy + br], outline=GOLD, width=4)
d.ellipse([bcx - br + 6, bcy - br + 6, bcx + br - 6, bcy + br - 6], outline=CREAM, width=1)
d.ellipse([bcx - 14, bcy - 16, bcx + 14, bcy + 16], fill=GOLD_L)
d.ellipse([bcx - 2, bcy - 16, bcx + 22, bcy + 16], fill=NAVY)
d.text((bcx, bcy + 30), "LUNA", font=f_tiny, fill=CREAM, anchor="mm")

img.save(OUT)
print("wrote", OUT, img.size)
