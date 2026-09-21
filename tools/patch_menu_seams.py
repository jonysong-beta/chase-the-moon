#!/usr/bin/env python3
"""抹掉 menu.webp 仪场里的烘焙断口 + 下移奶油带：
- y≈1041-43 / y≈1205-10 两条横向金线（原方图内框底线 + 延展接缝）
- x=0 / x=1043 两条 1px 竖直框线（仅仪场 navy 区，奶油带无此线）
- 右缘水印残迹（x≈920-1043, y≈970-1080，原 AI 水印未除净）
- 奶油边界 y1265 → y1330（屏 68% → 71.7%；操作面板扩容，仪场仍大于初版）
- 星图收进圆角矩形「屏幕框」：四周奶油边距 36px、圆角 r30、2px 深墨描边，
  监视器隐喻——奶油色是仪表机身，星图是显示出来的屏幕（用户定）

重绘配方同 patch_cover_grain.py：底色取邻近干净星空逐通道中位数，
颗粒 = 细噪（std 实测于干净区）+ 低频斑驳，星星小/中/亮/四芒四档、暖金色。
源文件用 tools/menu-prseam.webp（打补丁前备份）。
"""
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/tools/menu-prseam.webp"
OUT = f"{BASE}/assets/ui/menu.webp"
NAVY_END = 1264  # 奶油带从 1265 开始

rng = np.random.default_rng(20260921)
im = np.array(Image.open(SRC).convert("RGB")).astype(float)
H, W = im.shape[:2]

# ── 实测干净区颗粒强度（避开星点：用高通行中位数估计）──
clean = im[1100:1190, 100:900]
hipass = clean - ndimage.gaussian_filter(clean, (2, 2, 0))
FINE_STD = float(np.median(np.abs(hipass)) * 1.4826)
FINE_STD = min(max(FINE_STD, 4.0), 9.0)

STAR_RGB = np.array([205.0, 182.0, 126.0])


def synth(h, w, base, star_scale=1.0):
    """生成 h×w 星空纹理块"""
    blk = np.ones((h, w, 3)) * base
    fine = rng.normal(0, FINE_STD, (h, w))
    coarse = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)), 2.2)
    coarse = coarse / coarse.std() * (FINE_STD * 0.42)
    noise = fine + coarse
    blk[..., 0] += noise * 1.00
    blk[..., 1] += noise * 0.92
    blk[..., 2] += noise * 0.78

    def splat(cx, cy, r, peak):
        y0, y1 = max(0, int(cy - r * 3)), min(h, int(cy + r * 3) + 1)
        x0, x1 = max(0, int(cx - r * 3)), min(w, int(cx + r * 3) + 1)
        if y1 <= y0 or x1 <= x0:
            return
        gy, gx = np.mgrid[y0:y1, x0:x1]
        sig = max(r / 1.8, 0.42)
        g = peak * np.exp(-(((gy - cy) ** 2 + (gx - cx) ** 2) / (2 * sig * sig)))
        tint = 0.85 + 0.3 * rng.random()
        for c, k in enumerate((1.0, 0.9, 0.72)):
            blk[y0:y1, x0:x1, c] += g * STAR_RGB[c] / 205 * tint * k

    for _ in range(int(0.0011 * h * w * star_scale)):
        splat(rng.uniform(0, w), rng.uniform(0, h), rng.uniform(0.7, 1.1), rng.uniform(60, 130))
    for _ in range(int(0.00028 * h * w * star_scale)):
        splat(rng.uniform(0, w), rng.uniform(0, h), rng.uniform(1.2, 1.8), rng.uniform(140, 210))
    for _ in range(int(0.00008 * h * w * star_scale)):
        splat(rng.uniform(0, w), rng.uniform(0, h), rng.uniform(1.8, 2.4), rng.uniform(190, 240))
    return blk


def med(y0, y1, x0, x1):
    return np.median(im[y0:y1, x0:x1].reshape(-1, 3), axis=0)


def repaint(y0, y1, x0, x1, base):
    im[y0:y1, x0:x1] = np.clip(synth(y1 - y0, x1 - x0, base), 0, 255)


# ── 横线 A（y 1040-1044，含上下影行）：底色取 1010-1036 ──
repaint(1038, 1047, 0, W, med(1010, 1036, 0, W))
# ── 横线 B（y 1201-1214，双线更宽）：底色取 1170-1198 ──
repaint(1200, 1215, 0, W, med(1170, 1198, 0, W))
# ── 竖直框线（x 0-4 / x 1039-1043，仅 navy 区）──
repaint(0, NAVY_END, 0, 5, med(200, 1000, 8, 30))
repaint(0, NAVY_END, 1039, W, med(200, 1000, 1010, 1036))
# ── 水印残迹（整区重绘，覆盖横线 A 右端也已处理）──
repaint(968, 1082, 918, W, med(968, 1082, 780, 905))

# ── 奶油带下移：y1265 → y1410（仪场加长，inset 细线同步）──
NEW_BOUND = 1330
navy_base = med(1216, 1260, 100, 900)  # 补丁后该区已是干净星空，取边界下缘附近底色
repaint(NAVY_END - 4, NEW_BOUND, 0, W, navy_base)  # 原奶油边界实际起于 ~1262（webp 柔化），多吞几行
CREAM = np.array([240.0, 230.0, 210.0])  # 原奶油带中位色（原图几乎无颗粒，保持平涂）
im[NEW_BOUND:H] = CREAM
HL = np.array([27.0, 23.0, 20.0])  # 深墨描边色（取自原 inset 细线）

# ── 星图收进圆角矩形「屏幕框」：外边距 M、圆角 R、2px 深墨描边 ──
M, R = 36, 30
yy, xx = np.mgrid[0:H, 0:W]
outside = (xx < M) | (xx >= W - M) | (yy < M) | (yy >= NEW_BOUND)
corners = (
    (M + R, M + R, xx < M + R, yy < M + R),  # 左上
    (W - M - R - 1, M + R, xx >= W - M - R, yy < M + R),  # 右上
    (M + R, NEW_BOUND - R - 1, xx < M + R, yy >= NEW_BOUND - R),  # 左下
    (W - M - R - 1, NEW_BOUND - R - 1, xx >= W - M - R, yy >= NEW_BOUND - R),  # 右下
)
for cx, cy, qx, qy in corners:
    outside |= ((xx - cx) ** 2 + (yy - cy) ** 2 > R * R) & qx & qy
border = (~outside) & ndimage.binary_dilation(outside, iterations=2)
im[outside] = CREAM
im[border] = HL

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), "RGB").save(OUT, quality=90)
print(f"seams patched (grain std={FINE_STD:.2f}), cream moved 1265 -> {NEW_BOUND}, rounded frame M={M} R={R} -> {OUT}")
