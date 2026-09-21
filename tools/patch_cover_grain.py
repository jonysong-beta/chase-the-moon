#!/usr/bin/env python3
"""重建 cover-bg.webp 的合成延展区（y >= SEAM）：
- 原接缝处有一条烘焙进去的金框底线，直接整区重绘抹掉
- 底色取接缝上方中位数，颗粒两个八度匹配上方 std≈8.4
- 星星分小/中/亮/四芒星四档，暖金色，密度对齐上方
几何不动（只重绘接缝以下像素）。源文件用 /tmp/cover-bg-backup.webp。
"""
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/tools/cover-bg-prgrain.webp"  # 未打补丁的原版（颗粒重建前）
OUT = f"{BASE}/assets/ui/cover-bg.webp"
SEAM = 962
RAMP = 40

rng = np.random.default_rng(20260921)
im = np.array(Image.open(SRC).convert("RGB")).astype(float)
H, W = im.shape[:2]
h = H - SEAM

# 底色：接缝上方星空的中位数（逐通道）
bg = np.median(im[880:945].reshape(-1, 3), axis=0)
ext = np.ones((h, W, 3)) * bg

# ── 颗粒：细噪 + 低频斑驳（重绘区无原噪，需全额补齐到 ~8.6）──
fine = rng.normal(0, 7.6, (h, W))
coarse = ndimage.gaussian_filter(rng.normal(0, 1, (h, W)), 2.2)
coarse = coarse / coarse.std() * 3.2
noise = fine + coarse
ext[..., 0] += noise * 1.00
ext[..., 1] += noise * 0.92
ext[..., 2] += noise * 0.78

# ── 星星 ──
STAR_RGB = np.array([205.0, 182.0, 126.0])
yy, xx = np.mgrid[0:h, 0:W]
ramp = np.clip(yy / RAMP, 0.0, 1.0) ** 2  # 顶部渐入，遮接缝


def splat(cx, cy, r, peak):
    """高斯星点，peak=中心亮度增量(0-255)"""
    y0, y1 = max(0, int(cy - r * 3)), min(h, int(cy + r * 3) + 1)
    x0, x1 = max(0, int(cx - r * 3)), min(W, int(cx + r * 3) + 1)
    if y1 <= y0 or x1 <= x0:
        return
    gy, gx = np.mgrid[y0:y1, x0:x1]
    sig = max(r / 1.8, 0.42)
    g = peak * np.exp(-(((gy - cy) ** 2 + (gx - cx) ** 2) / (2 * sig * sig)))
    tint = 0.85 + 0.3 * rng.random()
    for c, k in enumerate((1.0, 0.9, 0.72)):
        ext[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * tint * k


def sparkle(cx, cy, arm, peak):
    """四芒星：中心亮点 + 水平/垂直细芒"""
    splat(cx, cy, arm * 0.28, peak)
    A = int(arm * 3) + 1
    y0, y1 = max(0, int(cy) - 1), min(h, int(cy) + 2)
    x0, x1 = max(0, int(cx - A)), min(W, int(cx + A) + 1)
    if y1 <= y0 or x1 <= x0:
        return
    gy, gx = np.mgrid[y0:y1, x0:x1]
    hor = np.exp(-((gx - cx) ** 2) / (2 * (arm * 0.9) ** 2)) * np.exp(-((gy - cy) ** 2) / 0.5)
    ver = np.exp(-((gy - cy) ** 2) / (2 * (arm * 0.9) ** 2)) * np.exp(-((gx - cx) ** 2) / 0.5)
    g = peak * 0.55 * (hor + ver)
    for c, k in enumerate((1.0, 0.9, 0.72)):
        ext[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * k


def density_ok(x, y):
    return rng.random() < (0.15 + 0.85 * ramp[int(y), int(x)])


# 小星（大量、暗）/ 中星 / 亮星 / 四芒星
for _ in range(int(0.0011 * h * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, h)
    if density_ok(x, y):
        splat(x, y, rng.uniform(0.7, 1.1), rng.uniform(60, 130))
for _ in range(int(0.00028 * h * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, h)
    if density_ok(x, y):
        splat(x, y, rng.uniform(1.2, 1.8), rng.uniform(140, 210))
for _ in range(int(0.00008 * h * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, h)
    if density_ok(x, y):
        splat(x, y, rng.uniform(1.8, 2.4), rng.uniform(190, 240))
for _ in range(int(0.000025 * h * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, h)
    if density_ok(x, y):
        sparkle(x, y, rng.uniform(3.5, 7.0), rng.uniform(200, 245))

im[SEAM:H] = np.clip(ext, 0, 255)

# ── 第二阶段：全图统一星层（含顶部 AI 区），暗部掩码避开地球/金环/月亮 ──
lum = im.mean(axis=2)
dark = lum < 58


def splat_im(cx, cy, r, peak):
    y0, y1 = max(0, int(cy - r * 3)), min(H, int(cy + r * 3) + 1)
    x0, x1 = max(0, int(cx - r * 3)), min(W, int(cx + r * 3) + 1)
    if y1 <= y0 or x1 <= x0:
        return
    gy, gx = np.mgrid[y0:y1, x0:x1]
    sig = max(r / 1.8, 0.42)
    g = peak * np.exp(-(((gy - cy) ** 2 + (gx - cx) ** 2) / (2 * sig * sig)))
    tint = 0.85 + 0.3 * rng.random()
    for c, k in enumerate((1.0, 0.9, 0.72)):
        im[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * tint * k


def ok(x, y):
    return dark[int(y), int(x)]


FH = H  # 全图
for _ in range(int(0.0022 * FH * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, FH)
    if ok(x, y):
        splat_im(x, y, rng.uniform(0.7, 1.1), rng.uniform(60, 130))
for _ in range(int(0.0006 * FH * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, FH)
    if ok(x, y):
        splat_im(x, y, rng.uniform(1.2, 1.8), rng.uniform(140, 210))
for _ in range(int(0.00012 * FH * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, FH)
    if ok(x, y):
        splat_im(x, y, rng.uniform(1.8, 2.4), rng.uniform(190, 240))
for _ in range(int(0.00005 * FH * W)):
    x, y = rng.uniform(0, W), rng.uniform(0, FH)
    if ok(x, y):
        # 四芒星直接画在 im 上
        cx, cy, arm, peak = x, y, rng.uniform(3.5, 7.0), rng.uniform(200, 245)
        splat_im(cx, cy, arm * 0.28, peak)
        A = int(arm * 3) + 1
        y0, y1 = max(0, int(cy) - 1), min(H, int(cy) + 2)
        x0, x1 = max(0, int(cx - A)), min(W, int(cx + A) + 1)
        if y1 > y0 and x1 > x0:
            gy, gx = np.mgrid[y0:y1, x0:x1]
            hor = np.exp(-((gx - cx) ** 2) / (2 * (arm * 0.9) ** 2)) * np.exp(-((gy - cy) ** 2) / 0.5)
            ver = np.exp(-((gy - cy) ** 2) / (2 * (arm * 0.9) ** 2)) * np.exp(-((gx - cx) ** 2) / 0.5)
            g = peak * 0.55 * (hor + ver)
            for c, k in enumerate((1.0, 0.9, 0.72)):
                im[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * k

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), "RGB").save(OUT, quality=80)
print("extension rebuilt below y =", SEAM, "+ unified star layer full image")
