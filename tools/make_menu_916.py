#!/usr/bin/env python3
"""Menu 1080x1920 — 01 language: cream course bar, orange ornamental bands, clean control row."""
from PIL import Image, ImageDraw, ImageFont

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/assets/sprites/menu-field-src.png"
OUT = f"{BASE}/assets/ui/menu.png"
W, H = 1080, 1920

NAVY = (10, 24, 38, 255)
CREAM = (240, 230, 211, 255)
GOLD = (201, 154, 58, 255)
GOLD_L = (232, 200, 120, 255)
RUST = (200, 92, 42, 255)
RUST_D = (150, 64, 30, 255)
RUST_L = (225, 125, 58, 255)
PAPER = (236, 222, 196, 255)
INK = (14, 18, 24, 255)

fp = "/System/Library/Fonts/STHeiti Medium.ttc"
fs = ImageFont.truetype(fp, 22)
fxs = ImageFont.truetype(fp, 16)
fbtn = ImageFont.truetype(fp, 36)
fbtn_s = ImageFont.truetype(fp, 26)
ftiny = ImageFont.truetype(fp, 14)

src = Image.open(SRC).convert("RGBA")
sw, sh = src.size
art = src.crop((40, 40, sw - 40, sh - 68))
aw, ah = art.size
for y in range(ah - 50, ah):
    for x in range(aw - 180, aw):
        art.putpixel((x, y), art.getpixel((max(0, aw - 180 - (x - (aw - 180)) - 16), y)))

field_h = 1280
field_w = W - 48
field_aspect = field_w / (field_h - 36)
aw, ah = art.size
if aw / ah > field_aspect:
    nw = int(ah * field_aspect)
    art = art.crop(((aw - nw) // 2, 0, (aw - nw) // 2 + nw, ah))
else:
    nh = int(aw / field_aspect)
    top = max(0, (ah - nh) // 3)
    art = art.crop((0, top, aw, top + nh))
art2 = art.resize((field_w, field_h - 36), Image.Resampling.LANCZOS)

img = Image.new("RGBA", (W, H), PAPER)
d = ImageDraw.Draw(img)
d.rectangle([0, 0, W - 1, H - 1], fill=PAPER)
mx, my = 18, 18
d.rectangle([mx, my, W - mx, H - my], fill=NAVY)
img.alpha_composite(art2, (24, 26))

d = ImageDraw.Draw(img)
d.text((W // 2, 48), "SOL III / EARTH", font=fs, fill=CREAM, anchor="mm")
d.text((40, field_h - 24), "MISSION 07 / LUNA", font=fxs, fill=GOLD_L, anchor="lm")
d.text((W - 40, field_h - 24), "TARGET / LUNA", font=fxs, fill=GOLD_L, anchor="rm")

# ── footer instrument (01: ticks → course → orange bands → readout) ──
fy = field_h
d.rectangle([mx, fy, W - mx, H - my], fill=CREAM)

# tick ruler
for i in range(42):
    x = 36 + i * 24
    h = 11 if i % 5 == 0 else 5
    d.line([x, fy + 12, x, fy + 12 + h], fill=(35, 35, 35, 220), width=2)

# COURSE bar
cy0, cy1 = fy + 42, fy + 96
d.rectangle([32, cy0, W - 32, cy1], outline=INK, width=3)
rcx, rcy = 70, (cy0 + cy1) // 2
d.ellipse([rcx - 13, rcy - 13, rcx + 13, rcy + 13], outline=INK, width=2)
d.line([rcx - 18, rcy, rcx + 18, rcy], fill=INK, width=1)
d.line([rcx, rcy - 18, rcx, rcy + 18], fill=INK, width=1)
d.text((106, rcy), "COURSE / 045.2°", font=fxs, fill=(25, 25, 25, 255), anchor="lm")
for i in range(16):
    x = 300 + i * 24
    d.rectangle([x, rcy - 1, x + 12, rcy + 1], fill=(40, 40, 40, 170))
d.text((W - 40, rcy - 11), "RNG 7120.44", font=fxs, fill=(25, 25, 25, 255), anchor="rm")
d.text((W - 40, rcy + 13), "RT 03:42:18", font=fxs, fill=(25, 25, 25, 255), anchor="rm")

# hairline + crosses
hy = fy + 114
d.line([32, hy, W - 32, hy], fill=(40, 40, 40, 210), width=2)
for i in range(11):
    x = 70 + i * 90
    d.line([x, hy - 7, x, hy + 7], fill=(40, 40, 40, 210), width=2)

# ── orange ornamental bands only ──
oy = fy + 128
d.rectangle([32, oy, W - 32, oy + 14], fill=RUST_L)
d.rectangle([32, oy + 22, W - 32, oy + 54], fill=RUST)
d.rectangle([32, oy + 62, W - 32, oy + 82], fill=RUST_D)
d.rectangle([32, oy + 90, W - 32, oy + 104], fill=RUST)

# ── control row on cream ──
sy = oy + 122

def plate(x0, y0, x1, y1, label, selected=False, font=None):
    # all plates same print style; selection shown only via CSS ink outline
    d.rectangle([x0, y0, x1, y1], fill=CREAM, outline=INK, width=3)
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), label, font=font or fbtn, fill=INK, anchor="mm")


plate(70, sy, 500, sy + 64, "休闲")
plate(540, sy, 970, sy + 64, "标准")

d.rectangle([70, sy + 82, 1010, sy + 154], fill=(250, 246, 236, 255), outline=INK, width=4)
d.text((W // 2, sy + 118), "开始追逐", font=fbtn, fill=INK, anchor="mm")

for i, lab in enumerate(["今日同场", "本机榜单", "声音"]):
    x0 = 70 + i * 320
    plate(x0, sy + 172, x0 + 300, sy + 224, lab, selected=False, font=fbtn_s)

# bottom readouts
by = sy + 244
d.text((48, by + 18), "0000", font=fs, fill=(20, 20, 20, 255), anchor="lm")
d.text((48, by + 44), "APOAPSIS", font=ftiny, fill=(55, 55, 55, 255), anchor="lm")
d.text((W - 48, by + 18), "9999", font=fs, fill=(20, 20, 20, 255), anchor="rm")
d.text((W - 48, by + 44), "PERIAPSIS", font=ftiny, fill=(55, 55, 55, 255), anchor="rm")
d.polygon([(W // 2, by + 2), (W // 2 + 8, by + 18), (W // 2, by + 34), (W // 2 - 8, by + 18)], fill=INK)
d.text((W // 2, by + 54), "LUNA 7120", font=ftiny, fill=(40, 40, 40, 255), anchor="mm")
d.text((W // 2, by + 78), "返回封面", font=ftiny, fill=(80, 80, 80, 255), anchor="mm")

img.save(OUT)
img.save("/tmp/menu-redesign.png")
print("wrote", OUT, img.size)

boxes = {
    "easy": (70, sy, 500, sy + 64),
    "normal": (540, sy, 970, sy + 64),
    "start": (70, sy + 82, 1010, sy + 154),
    "daily": (70, sy + 172, 370, sy + 224),
    "board": (390, sy + 172, 690, sy + 224),
    "sound": (710, sy + 172, 1010, sy + 224),
    "back": (W // 2 - 90, by + 66, W // 2 + 90, by + 96),
}
for name, (x0, y0, x1, y1) in boxes.items():
    print(f"{name}: left={x0/W*100:.1f}% top={y0/H*100:.1f}% w={(x1-x0)/W*100:.1f}% h={(y1-y0)/H*100:.1f}%")

