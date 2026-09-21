#!/usr/bin/env python3
"""从 design-refs/06-gameplay-stipple.png 抠出惨白坑洞月，生成：
- assets/sprites/moon-dark.webp (局内「月之暗面」档专用月亮)
圆形蒙版按最大亮斑外接圆，羽毛 1px；海报底的轨道虚线/星点在盘外，不带走。
"""
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = "/Users/jonysong/Work/Products/chase-the-moon"
SRC = f"{BASE}/design-refs/06-gameplay-stipple.png"

src = np.array(Image.open(SRC).convert("RGB")).astype(float)
H, W = src.shape[:2]

# 月亮核心亮斑：顶部中央区域内的最大连通域
reg = src[120:520, 300:760]
lum = reg.mean(axis=2)
lab, n = ndimage.label(lum > 150)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
i = int(np.argmax(sizes)) + 1
ys, xs = np.where(lab == i)
cx = (xs.min() + xs.max()) / 2 + 300
cy = (ys.min() + ys.max()) / 2 + 120
bw = xs.max() - xs.min()
bh = ys.max() - ys.min()
r = min(bw, bh) / 2 - 1.5  # 收 1.5px 避边缘 fringe
print(f"moon center=({cx:.1f},{cy:.1f}) bbox={bw}x{bh} r={r:.1f}")

# 4x 超采样圆蒙版，抗锯齿羽毛边
SS = 4
side = int(np.ceil(r * 2))
yy, xx = np.mgrid[0 : side * SS, 0 : side * SS]
d = np.sqrt((xx / SS - r) ** 2 + (yy / SS - r) ** 2)
alpha = np.clip((r - d) * SS, 0, 1)
alpha = alpha.reshape(side, SS, side, SS).mean(axis=(1, 3))

x0, y0 = int(round(cx - r)), int(round(cy - r))
disc = src[y0 : y0 + side, x0 : x0 + side]
out = np.dstack([disc, alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, "RGBA")
img.save(f"{BASE}/assets/sprites/moon-dark.webp", quality=92)
print(f"saved assets/sprites/moon-dark.webp {side}x{side}")
