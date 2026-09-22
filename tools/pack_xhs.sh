#!/usr/bin/env bash
# 小红书小工具打包：只拷贝运行时白名单文件（html/css/js/webp/woff2），产出 dist/ 与 zip
# 用法：tools/pack_xhs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/chase-the-moon"
rm -rf dist
mkdir -p "$OUT/assets/fonts" "$OUT/assets/sprites" "$OUT/assets/ui"

cp index.html style.css game.js "$OUT/"
cp assets/fonts/fonts.css "$OUT/assets/fonts/"
# 只打包运行时实际使用的字体（B 套装 + Geist Mono + 思源宋标题）；
# A/C/D 字体实验室已退役（fonts.css/style.css 不再引用），不打进包
cp assets/fonts/NotoSerifSC-700-sub.woff2 assets/fonts/GeistMono.woff2 \
   assets/fonts/Limelight.woff2 assets/fonts/JosefinSans-300.woff2 "$OUT/assets/fonts/"
cp assets/sprites/earth.webp assets/sprites/moon.webp assets/sprites/moon-dark.webp \
   assets/sprites/rock.webp assets/sprites/well.webp assets/sprites/signal.webp "$OUT/assets/sprites/"
# cover.webp 为 legacy 平海报，运行时已无引用，不打进包
cp assets/ui/cover-bg.webp assets/ui/cover-moon.webp \
   assets/ui/menu.webp "$OUT/assets/ui/"
# BGM/SFX = Web Audio 合成（data URI <audio> 被 CSP 拦；上传白名单无音频扩展名）

# 卫生检查：禁止文件类型 / 禁用 API 残留
echo "── 白名单外文件："
find "$OUT" -type f ! -name "*.html" ! -name "*.css" ! -name "*.js" \
  ! -name "*.webp" ! -name "*.woff2" -print || true
echo "── 禁用 API 扫描（应为空）："
grep -rnE "eval\(|new Function|XMLHttpRequest|navigator\.clipboard|execCommand|window\.open|WebAssembly|Worker\(|onclick=|<iframe|<form" "$OUT" || echo "  clean"
grep -rn "fetch(" "$OUT" || echo "  no fetch"

cd dist/chase-the-moon
zip -qr ../chase-the-moon.zip . -x "*.DS_Store"
cd ../..
du -sh "$OUT" dist/chase-the-moon.zip
echo "done → dist/chase-the-moon.zip"
