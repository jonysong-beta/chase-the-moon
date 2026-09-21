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
cp assets/fonts/*.woff2 "$OUT/assets/fonts/"
cp assets/sprites/earth.webp assets/sprites/moon.webp assets/sprites/rock.webp \
   assets/sprites/well.webp assets/sprites/signal.webp "$OUT/assets/sprites/"
cp assets/ui/cover-bg.webp assets/ui/cover-moon.webp assets/ui/cover.webp \
   assets/ui/menu.webp "$OUT/assets/ui/"

# 卫生检查：禁止文件类型 / 禁用 API 残留
echo "── 白名单外文件："
find "$OUT" -type f ! -name "*.html" ! -name "*.css" ! -name "*.js" \
  ! -name "*.webp" ! -name "*.woff2" -print || true
echo "── 禁用 API 扫描（应为空）："
grep -rnE "eval\(|new Function|XMLHttpRequest|navigator\.clipboard|execCommand|window\.open|WebAssembly|Worker\(|onclick=|<iframe|<form" "$OUT" || echo "  clean"
grep -rn "fetch(" "$OUT" || echo "  no fetch"

cd dist
zip -qr chase-the-moon.zip chase-the-moon -x "*.DS_Store"
cd ..
du -sh "$OUT" dist/chase-the-moon.zip
echo "done → dist/chase-the-moon.zip"
