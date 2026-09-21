#!/usr/bin/env python3
"""修复 cover-bg.webp 金环缺口（月亮烘焙抹除时毁坏的角度区间 -24°~-15°）：
从 +50° 偏移的完好弧段（22°~41°）连纹理一起角向复制，两端按环心亚像素对齐并交叉淡化。
源：tools/cover-bg-prring.webp（修复前备份）。"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
# 用法: repair_cover_ring.py [SRC OUT T0 T1 SHIFT]
SRC = sys.argv[1] if len(sys.argv) > 1 else f"{BASE}/tools/cover-bg-prring.webp"
OUT = sys.argv[2] if len(sys.argv) > 2 else f"{BASE}/assets/ui/cover-bg.webp"
T0 = float(sys.argv[3]) if len(sys.argv) > 3 else -28.5  # 修复区间起（度，atan2 系）
T1 = float(sys.argv[4]) if len(sys.argv) > 4 else -8.5
SHIFT = float(sys.argv[5]) if len(sys.argv) > 5 else 50.0  # 角向复制偏移（度）
CX, CY, R = 517.0, 519.0, 395.0
FADE = 1.5            # 两端交叉淡化宽度（度）
RMAX = 10             # 径向修复半宽

im = np.array(Image.open(SRC).convert("RGB")).astype(float)
H, W = im.shape[:2]
lum = im.mean(axis=2)


def center_offset(deg):
    """该角度上金环亮峰相对 R 的偏移（亚像素加权）"""
    a = np.radians(deg)
    ds, ws = [], []
    for d in range(-6, 7):
        x, y = CX + (R + d) * np.cos(a), CY + (R + d) * np.sin(a)
        v = ndimage.map_coordinates(lum, [[y], [x]], order=1)[0]
        ds.append(d)
        ws.append(max(v - 60, 0))  # 只让金色亮环参与
    ws = np.array(ws)
    if ws.sum() < 1:
        return 0.0
    return float((np.array(ds) * ws).sum() / ws.sum())


# 对齐测量点：缺口外侧的完好弧头（目标）与源弧对应端
c_t1, c_s1 = center_offset(T0 - 0.6), center_offset(T0 + SHIFT)
c_t2, c_s2 = center_offset(T1 + 0.6), center_offset(T1 + SHIFT)
print("joint offsets:", c_t1, c_s1, c_t2, c_s2)

yy, xx = np.mgrid[0:H, 0:W]
dx, dy = xx - CX, yy - CY
rho = np.hypot(dx, dy)
theta = np.degrees(np.arctan2(dy, dx))

sector = (theta >= T0) & (theta <= T1) & (np.abs(rho - R) <= RMAX)
frac = (theta - T0) / max(T1 - T0, 1.0)
shift = (c_t1 - c_s1) * (1 - frac) + (c_t2 - c_s2) * frac

src_theta = np.radians(theta + SHIFT)
src_rho = rho - shift
sx = CX + src_rho * np.cos(src_theta)
sy = CY + src_rho * np.sin(src_theta)

w = np.minimum((theta - T0) / FADE, (T1 - theta) / FADE)
w = np.clip(w, 0, 1)

for c in range(3):
    sampled = ndimage.map_coordinates(im[..., c], [sy[sector], sx[sector]], order=1)
    im[..., c][sector] = sampled * w[sector] + im[..., c][sector] * (1 - w[sector])

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), "RGB").save(OUT, quality=90)
print("ring repaired over", T0, "to", T1, "deg")
