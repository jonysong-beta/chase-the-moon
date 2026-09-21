#!/usr/bin/env python3
"""Vertical menu from AI square art + cream instrument footer."""
from PIL import Image, ImageDraw, ImageFont
from collections import deque
import os

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/generated-1789400331735.png"
OUT = f"{BASE}/assets/ui/menu.png"
W, H = 1024, 1536

NAVY = (12, 28, 42, 255)
CREAM = (240, 230, 211, 255)
GOLD = (201, 154, 58, 255)
GOLD_L = (232, 200, 120, 255)
RUST = (217, 100, 48, 255)
PAPER = (236, 222, 196, 255)
INK = (12, 22, 34, 255)

fp = "/System/Library/Fonts/STHeiti Medium.ttc"
fs = ImageFont.truetype(fp, 20)
fxs = ImageFont.truetype(fp, 15)
fbtn = ImageFont.truetype(fp, 32)

src = Image.open(SRC).convert("RGBA")
# crop paper frame + watermark
w, h = src.size
art = src.crop((42, 42, w - 42, h - 70))
# paint watermark corner if any left
ad = ImageDraw.Draw(art)
aw, ah = art.size
navy_s = art.getpixel((aw // 2, 20))
for y in range(ah - 60, ah):
    for x in range(aw - 200, aw):
        art.putpixel((x, y), art.getpixel((max(0, aw - 200 - (x - (aw - 200)) - 20), y)))

art = art.resize((920, 920), Image.Resampling.LANCZOS)

img = Image.new("RGBA", (W, H), NAVY)
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W - 1, H - 1], fill=PAPER)
mx, my = 24, 24
d.rectangle([mx, my, W - mx, H - my], fill=NAVY)
img.alpha_composite(art, (52, 40))

d = ImageDraw.Draw(img)
# telemetry overlay
d.text((512, 70), "SOL III / EARTH", font=fs, fill=CREAM, anchor="mm")
d.text((60, 980), "MISSION 07 / LUNA", font=fxs, fill=GOLD_L, anchor="lm")
d.text((964, 980), "TARGET / LUNA", font=fxs, fill=GOLD_L, anchor="rm")

# cream footer
fy = 1080
d.rectangle([mx, fy, W - mx, H - my], fill=CREAM)
for i in range(40):
    x = 40 + i * 24
    hh = 10 if i % 5 == 0 else 5
    d.line([x, fy + 8, x, fy + 8 + hh], fill=(40, 40, 40, 200), width=2)

d.rectangle([40, fy + 28, W - 40, fy + 72], outline=(40, 40, 40, 220), width=2)
rcx, rcy = 78, fy + 50
d.ellipse([rcx - 12, rcy - 12, rcx + 12, rcy + 12], outline=(40, 40, 40, 220), width=2)
d.line([rcx - 18, rcy, rcx + 18, rcy], fill=(40, 40, 40, 220), width=1)
d.line([rcx, rcy - 18, rcx, rcy + 18], fill=(40, 40, 40, 220), width=1)
d.text((108, fy + 50), "COURSE / 045.2°", font=fxs, fill=(30, 30, 30, 255), anchor="lm")
d.text((W - 50, fy + 42), "RNG 7120.44", font=fxs, fill=(30, 30, 30, 255), anchor="rm")
d.text((W - 50, fy + 62), "RT 03:42:18", font=fxs, fill=(30, 30, 30, 255), anchor="rm")

d.rectangle([40, fy + 88, W - 40, fy + 108], fill=RUST)
d.rectangle([40, fy + 116, W - 40, fy + 130], fill=(180, 80, 40, 255))
d.rectangle([40, fy + 138, W - 40, fy + 148], fill=(150, 60, 30, 255))

slot_y = fy + 168

def slot(x0, y0, x1, y1, label, fill=None, tcol=None, font=None):
    if fill:
        d.rectangle([x0, y0, x1, y1], fill=fill, outline=(20, 20, 20, 255), width=3)
    else:
        d.rectangle([x0, y0, x1, y1], outline=(20, 20, 20, 255), width=3)
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), label, font=font or fbtn, fill=tcol or (20, 20, 20, 255), anchor="mm")


slot(250, slot_y, 430, slot_y + 54, "休闲")
slot(470, slot_y, 650, slot_y + 54, "标准", fill=GOLD_L, tcol=INK)
d.rectangle([140, slot_y + 70, 884, slot_y + 134], fill=(250, 246, 236, 255), outline=(20, 20, 20, 255), width=4)
d.text((512, slot_y + 102), "开始追逐", font=fbtn, fill=INK, anchor="mm")
for i, lab in enumerate(["今日同场", "本机榜单", "声音"]):
    x0 = 140 + i * 250
    slot(x0, slot_y + 150, x0 + 230, slot_y + 200, lab, font=fs)
d.text((512, slot_y + 228), "返回封面", font=fxs, fill=(70, 70, 70, 255), anchor="mm")

img.save(OUT)
img.save("/tmp/menu-final.png")
print("wrote", OUT)
