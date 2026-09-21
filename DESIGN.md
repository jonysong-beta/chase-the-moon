# DESIGN.md — 逐月计划 (Chase the Moon / CATCH THE MOON)

## 1. Objective

玩家扮演地球，在单局约 2–4 分钟的竖屏追逐中把被黑暗天体拖走的月亮拉回轨道。视觉 bar：**复古太空主义印刷海报**——奶油纸边、深空青蓝场、扁平天体、虚线轨道、任务徽章；禁止手游软球与光污染。质量 bar：打开即可玩、失败可立刻重开、结算三档且分数透明。

## 2. Product Context

- **What:** 竖屏网页游戏：摇杆控地球，躲引力井、取舍小天体，套环捕获月亮。
- **Who:** 喜欢复古印刷/太空海报美学、碎片时间重开的手机用户。
- **Feel like:** 1960s NASA 旅行海报 + Apollo 任务补丁 + 可玩竖版街机。
- **Do not feel like:** 3D 写实太空、抽卡手游软 UI、苏维埃大斜线宣传画、彩虹宇宙射线插画。
- **Cultural register:** playful + 略带 melancholy；玩法 arcade，叙事一句一顿。

## 3. Visual Foundations（复古太空主义 · 定稿）

三屏三角色（参考 `design-refs/`）：

| 屏 | 参考图 | 角色 |
|----|--------|------|
| 封面 cover | `generated-1789399937244.png`（内芯 + 向下延展星空） | 海报封面：单圈轨道 + 标题 + 开始 |
| 任务面板 menu | `generated-1789400331735.png`（内芯 + 奶油带 DOM 控制区） | 仪场 + 开始/声音/返回 |
| 局内 play | `06-gameplay-stipple.png` | 可玩 stipple 海报：虚线走廊 + 扁平天体 |

底图管线：两张 generated 原图裁内框（去 AI 水印）→ 封面抹掉烘焙月亮（DOM 月亮沿环公转，几何在 `COVER_ORBIT`）→ 竖幅延展为合成星空；按钮/文字全部 DOM，不再依赖烘焙印版。

月亮资产：`tools/make_gold_moon.py` 从 7244 原图抠金色圆月（连通域定位 + 合成光晕，原光晕含金环弧段不能带走），同一张生成 `assets/ui/cover-moon.webp`（552² 盘心居中）与 `assets/sprites/moon.{png,webp}`（245² 局内）。封面延展区颗粒：`tools/patch_cover_grain.py`（源 `tools/cover-bg-prgrain.webp`，重绘 y≥962：底色取接缝上中位数 + 双八度颗粒 + 四档星 + 全图统一星层，接缝原有一条烘焙金框底线，勿只补噪不重绘）。金环缺口修复：`tools/repair_cover_ring.py`（参数化：`SRC OUT T0 T1 SHIFT`，从完好弧段角向复制 + 环心亚像素对齐）。已修两处：-24°~-15°（烘焙月盘压住处，源 `tools/cover-bg-prring.webp`）和 -76°~-65°（烘焙月晕擦除处、顶部闪星右侧，源 `tools/cover-bg-prfix2.webp`，SHIFT=120）→ 随后 `tools/patch_moonspot_stars.py`（抹月区星密度只有周边一半会读成暗斑，补到 ≈0.83%；**加法不可重复执行**）。教训：判断"设计断口 vs 损伤"必须与原图同区视觉对比，数值扫描会因环半径漂移误报。

封面 DOM 装饰：`.cover-keyline`（细金内框 + 四角刻度，inset 3.2%）、`.cover-ornament`（标题与按钮间的 — ✦ — 饰线，top 79.2%）、`.cover-ver` 收进内框（bottom 4.5%）。面板 DOM：`.menu-status` 胶囊、`.menu-ruler`（SVG data-uri 刻度尺，pin 奶油带底）；`.menu-panel` top 68.5% bottom 4%，子元素 `flex-shrink:0`（否则刻度尺被 flex 压成 0 高）。

### 3a. Color

- Paper: `#E8DCC8`
- Navy: cover `#1B3A52` · menu `#0E1C2C` · play `#15202E`
- Cream: `#F0E6D3` / dim `#C5B89A`
- Gold: `#D4A84B` / bright `#E8C878` / rust `#D97B3A`
- Earth: teal `#3D8B7A` + terra `#C4A35A`
- Danger: `#8B2E3E` 仅作细描边；禁止品红光雾
- 深蓝场已向 Kimi 深空蓝（`#002F5B` 方向）微调；品牌蓝不进游戏色板（月辉保持金色，用户定）

### 3b. Typography

- 封面英文套装 **B（Art Deco）**：徽章/CATCH THE MOON 用 Limelight；按钮/版本行用 Josefin Sans 300
- 中文标题：Noto Serif SC 700（自托管子集 `assets/fonts/NotoSerifSC-700-sub.woff2`）
- 正文：`"Courier New", ui-monospace, monospace`；标题加宽字距
- 遥测/HUD/数据行/开场解码：**Geist Mono**（自托管 `assets/fonts/GeistMono.woff2`，Kimi 品牌三件套之一）
- 字体全部自托管在 `assets/fonts/`，不依赖运行时 CDN
- 只用 400/700（Josefin 300 为 Deco 例外）；无圆角装饰体

### 3c. Spacing & rhythm

- 逻辑分辨率 **270×480**；`imageSmoothingEnabled = false`
- 纸边：舞台四边奶油 letterbox（CSS inset 约 3–4%）
- 基数 4px；HUD 顶条 + 底摇杆区，不遮中线航道

### 3d. Component seeds

- **任务补丁:** 双金圈 + 内嵌几何地球/暖金月 + 虚线轨
- **天体:** 扁平 2–3 色 + 描边；月亮=奶油 stipple + 深色环形山
- **信号:** 金色菱形 + 四向短线
- **引力井:** 黑核 + 同心硬环（赭/奶油），细 danger 描边
- **走廊:** 奶油虚线消失点射线 + 深度刻度
- **HUD:** 分段块（MASS 奶油 / SIGNAL 金）+ 刻度尺，无圆角卡片
- **星:** 四角星为主，辅以小点

## 4. Accessibility

- HUD 文字对比 ≥ 4.5:1（奶油 on 深空）
- `prefers-reduced-motion` 关抖动脉冲
- 触控 ≥ 44px；摇杆+喷射可多点

## 5. Voice & Tone

- 简短中文旁白 + 街机提示；≤14 字/句
- 用词：轨道、引力、质量、捕获、偏航、重聚
- 禁词：赋能、沉浸式、极致、史诗级、打造闭环

## 6. Implementation Practices

- 纯静态三件套；Canvas 2D + DOM HUD
- 调色 token 在 `:root`；数值在 JS 常量表
- BGM 全部 Web Audio 合成（小红书白名单无音频文件；`bgm/` 仅存母带，不进包）
- 开场旁白为普通淡入（De-coding 乱码显影做过一轮，用户判定不必要，已撤）
- localStorage：榜、成就、难度、声音、日更
- 小红书打包：`tools/pack_xhs.sh` → `dist/chase-the-moon.zip`（白名单文件 + 禁用 API 自检）

## 6a. 未来方向（已留钩子，未实现）

- **「月之暗面」模式**：升档梯终点（blood 档），月亮会攻击、套捕会挣脱。命名致敬月之暗面，内部 key 仍为 `blood`（存档兼容），仅用户可见文案改名。

## 7. Anti-Patterns

- 软径向光晕当主体、紫蓝青渐变、圆角阴影卡片
- emoji 图标、写实 3D 星球、彩虹射线光污染
- 苏维埃满屏斜线构图（局内会打架）

## 8. Decision-Making

| 冲突 | 选择 |
|------|------|
| 可读性 vs 海报密度 | 局内扁平可读优先，封面可更「海报」 |
| 月亮亮度 | 暖金 #E8C878，不用 glow |
| 难度选择位置 | 不设选择器：通关自动升档（2026-09 用户定） |

## 9. Workflow

封面 → 任务面板 → 过场 → 局内 → QTE → 结算 → 再来/回封面。

---

# 游戏结构

## 屏幕流

```
cover(封面) → menu(难度/日更/榜) → intro(可跳) → play → discover → qte → result
                ↑__________________________ 失败 __________________________|
```

### 1. 封面 cover
- 纸边 + 深青场 + 大任务补丁（地球+暖金月+虚线轨）
- 标题「逐月计划」；主按钮「开始任务」；版本号
- 可进 menu

### 2. 任务面板 menu
- 仪表场：十字准星、遥测标签、虚线轨道、月/井/地球示意（下半奶油带留白）
- DOM 控制区：当前档位状态行 + 主按钮「开始追逐」+「声音：开/关」「返回封面」
- **难度不在面板**：通关（捕获成功）自动升档 标准→虚空→月之暗面，失败原地重来
- 今日同场只在封面；本机榜单只在结算屏

### 3. 开场旁白（3–5 行，可跳）

### 4. 追逐主循环
- 摇杆 + 喷射；金色信号拉近、白石补质量、硬岩碰撞
- 虚线走廊消失点；进度条满 → discover → qte

### 5. 捕获 QTE
- 奶油/金双描边套环；进圈按「捕获」；3–4 锁

### 6. 结算 3 档
- score = 0.35*质量 + 0.30*追近 + 0.35*QTE
- 完美重聚 / 险胜偏轨 / 擦肩而过

## 文件结构

```
index.html  style.css  game.js  DESIGN.md  bgm/  music/
```
