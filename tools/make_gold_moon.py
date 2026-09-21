#!/usr/bin/env python3
"""从 generated-1789399937244.png 抠出金色圆月，生成：
- assets/ui/cover-moon.webp  (552², 封面公转月，盘心居中)
- assets/sprites/moon.png/.webp (245², 局内月亮)
光晕为合成径向渐变（原图光晕里含有金环弧段，不能直接带走）。
"""
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/generated-1789399937244.png"
GLOW_RGB = np.array([240.0, 214.0, 150.0])

src = np.array(Image.open(SRC).convert("RGB")).astype(float)

# 月亮核心亮斑（连通域最大块）
reg = src[100:460, 560:920]
lum = reg.mean(axis=2)
lab, n = ndimage.label(lum > 205)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
i = int(np.argmax(sizes)) + 1
ys, xs = np.where(lab == i)
cx = (xs.min() + xs.max()) / 2 + 560
cy = (ys.min() + ys.max()) / 2 + 100
r_src = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 - 2  # 收 2px 避光晕 fringe

pad = int(r_src * 1.1)
x0, y0 = int(cx - pad), int(cy - pad)
disc = src[y0 : int(cy + pad), x0 : int(cx + pad)]
h, w = disc.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
dist = np.hypot(yy - (cy - y0), xx - (cx - x0))


def build(canvas, disc_frac, glow_end_frac):
    """disc_frac: 月盘直径占画布比; glow_end_frac: 光晕归零处半径占画布比"""
    half = canvas / 2
    r_disc = disc_frac * half
    scale = r_disc / r_src
    big = Image.fromarray(disc.astype(np.uint8)).resize(
        (int(w * scale), int(h * scale)), Image.Resampling.LANCZOS
    )
    bd = np.array(big).astype(float)
    bh, bw = bd.shape[:2]
    byy, bxx = np.mgrid[0:bh, 0:bw]
    bdist = np.hypot(byy - bh / 2, bxx - bw / 2)
    # 月盘 alpha：边缘 3px 羽化
    alpha = np.clip((r_disc + 1 - bdist) / 3.0, 0, 1)

    out = np.zeros((canvas, canvas, 4))
    # 合成光晕：盘缘外高斯衰减，归零于 glow_end_frac*half
    r_end = glow_end_frac * half
    yy2, xx2 = np.mgrid[0:canvas, 0:canvas]
    d2 = np.hypot(yy2 - half, xx2 - half)
    sigma = (r_end - r_disc) / 2.2
    glow_a = 0.55 * np.exp(-(((d2 - r_disc) / sigma) ** 2))
    glow_a = np.clip(glow_a, 0, 1) * (d2 > r_disc - 2)
    for c in range(3):
        out[..., c] = GLOW_RGB[c]
    out[..., 3] = glow_a * 255

    # 贴月盘（alpha over）；奇数尺寸时裁剪到画布内
    ox = int(half - bw / 2)
    oy = int(half - bh / 2)
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx0, dy0 = max(0, ox), max(0, oy)
    bw2 = min(bw - sx0, canvas - dx0)
    bh2 = min(bh - sy0, canvas - dy0)
    bd = bd[sy0 : sy0 + bh2, sx0 : sx0 + bw2]
    alpha = alpha[sy0 : sy0 + bh2, sx0 : sx0 + bw2]
    bh, bw, ox, oy = bh2, bw2, dx0, dy0
    reg_a = out[oy : oy + bh, ox : ox + bw, 3] / 255.0
    new_a = alpha + reg_a * (1 - alpha)
    for c in range(3):
        out[oy : oy + bh, ox : ox + bw, c] = (
            bd[..., c] * alpha + out[oy : oy + bh, ox : ox + bw, c] * reg_a * (1 - alpha)
        ) / np.maximum(new_a, 1e-6)
    out[oy : oy + bh, ox : ox + bw, 3] = new_a * 255
    return Image.fromarray(out.astype(np.uint8), "RGBA")


cover = build(552, 0.652, 0.97)
cover.save(f"{BASE}/assets/ui/cover-moon.webp", quality=92)

play = build(245, 0.92, 0.995)
play.save(f"{BASE}/assets/sprites/moon.png")
play.save(f"{BASE}/assets/sprites/moon.webp", quality=92)
print("moon sprites written; src center", (cx, cy), "r", r_src)
