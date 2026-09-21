#!/usr/bin/env python3
"""抹月区（烘焙月亮抹除后星密度偏低的暗斑）补星。
需在 repair_cover_ring.py 之后执行；输入输出均为 assets/ui/cover-bg.webp。
目标密度对齐周边星空（star% ≈0.83）。"""
import numpy as np
from PIL import Image

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
P = f"{BASE}/assets/ui/cover-bg.webp"
rng = np.random.default_rng(77)
im = np.array(Image.open(P).convert("RGB")).astype(float)
H, W = im.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
d_moon = np.hypot(yy - 258, xx - 779)  # 烘焙月心 (webp 坐标)
d_ring = np.abs(np.hypot(yy - 519, xx - 517) - 395)
STAR_RGB = np.array([205.0, 182.0, 126.0])


def splat(cx, cy, r, peak):
    y0, y1 = max(0, int(cy - r * 3)), min(H, int(cy + r * 3) + 1)
    x0, x1 = max(0, int(cx - r * 3)), min(W, int(cx + r * 3) + 1)
    if y1 <= y0 or x1 <= x0:
        return
    gy, gx = np.mgrid[y0:y1, x0:x1]
    sig = max(r / 1.8, 0.42)
    g = peak * np.exp(-(((gy - cx) ** 2 + (gx - cx) ** 2) / (2 * sig * sig)))
    tint = 0.85 + 0.3 * rng.random()
    for c, k in enumerate((1.0, 0.9, 0.72)):
        im[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * tint * k


added = 0
for _ in range(150):
    x = rng.uniform(640, 920)
    y = rng.uniform(110, 410)
    dm = np.hypot(y - 258, x - 779)
    if dm > 150 or d_ring[int(y), int(x)] <= 8:
        continue
    fade = 1.0 if dm < 125 else (150 - dm) / 25
    if rng.random() > fade:
        continue
    u = rng.random()
    if u < 0.70:
        splat(x, y, rng.uniform(0.7, 1.1), rng.uniform(60, 130))
    elif u < 0.94:
        splat(x, y, rng.uniform(1.2, 1.8), rng.uniform(140, 210))
    else:
        splat(x, y, rng.uniform(1.8, 2.4), rng.uniform(190, 240))
    added += 1

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), "RGB").save(P, quality=80)
print("moonspot stars added:", added)
