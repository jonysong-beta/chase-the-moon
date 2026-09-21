# DESIGN.md — 逐月计划 (Chase the Moon / CATCH THE MOON)

## 1. Objective

玩家扮演地球，在单局约 2–4 分钟的竖屏追逐中把被黑暗天体拖走的月亮拉回轨道。视觉 bar：**复古太空主义印刷海报**——细金内框、深空青蓝场、扁平天体、虚线轨道、任务徽章；禁止手游软球与光污染。质量 bar：打开即可玩、失败可立刻重开、结算三档且分数透明、竞速有计时与 PB。

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

### 3-1. 封面底图资产管线（重跑必须按序）

1. `tools/patch_cover_grain.py`（源 `tools/cover-bg-prgrain.webp`）：重绘 y≥962 延展区——底色取接缝上中位数 + 双八度颗粒 + 四档星（小/中/亮/四芒，暖金 `rgb(205,182,126)`）+ **全图统一星层**（暗部掩码避开地球/金环/月亮，上下密度才一致）。接缝原有一条烘焙金框底线，必须整区重绘，勿只补噪。
2. `tools/repair_cover_ring.py`（参数化 `SRC OUT T0 T1 SHIFT`，从完好弧段角向复制 + 环心亚像素对齐）修金环缺口两处：-24°~-15°（烘焙月盘压住处，源 `tools/cover-bg-prring.webp`，SHIFT=50）、-76°~-65°（烘焙月晕擦除处、顶部闪星右侧，源 `tools/cover-bg-prfix2.webp`，SHIFT=120）。对齐测量必须在缺口**外侧**完好弧头上做（在缺口内测会落回理想圆、接缝成台阶）。
3. `tools/patch_moonspot_stars.py`：抹月区补星到 ≈0.83%（与周边一致，少了读成暗斑，多了读成亮斑）。**加法不可重复执行**。

教训：判断「设计断口 vs 损伤」必须与原图同区**视觉**对比，数值扫描会因手绘环半径漂移误报；右侧圆点、底部闪星、左侧 9 点钟弧段均为原图设计，不要"修"。

### 3-1b. 面板底图管线

`tools/patch_menu_seams.py`（源 `tools/menu-prseam.webp` → `assets/ui/menu.webp`）：抹仪场烘焙断口——横向金线 y≈1041-43 / y≈1205-10、x=0/1043 竖框线（仅 navy 区）、右缘 AI 水印残迹（x≈920-1043, y≈970-1080）；配方同封面（邻近中位底色 + 双八度颗粒 + 四档星，颗粒 std 实测于干净区）。**奶油带整体下移 y1265→y1410**（屏 68%→76%，仪场加长；原边界实际起于 ~1262，webp 柔化需多吞几行），inset 细线（x62-981, rgb(27,23,20)）同步画在 1425-26。

### 3-2. 月亮资产（全局金色圆月）

`tools/make_gold_moon.py` 从 7244 原图抠金色圆月（连通域定位月盘 (739,283) r74 + **合成光晕**——原光晕含金环弧段，不能带走），同一张生成 `assets/ui/cover-moon.webp`（552² 盘心居中，封面公转）与 `assets/sprites/moon.{png,webp}`（245²，局内/QTE/开场共用）。盘色 ≈ `rgb(234,205,151)`，光晕 `rgb(240,214,150)`。**暗月/血月不做，留给未来「月之暗面」关卡当专属视觉**（用户定）。

### 3-3. 封面 / 面板 DOM 装饰

- 封面：`.cover-keyline` 细金内框（inset 1%，四角刻度断口；**图层在月亮与徽章之下**——月亮转到轨道最高点会从框前飞过，不压线）；`.cover-ornament` 标题与按钮间 — ✦ — 饰线（top 79.2%）；`.cover-ver` 收进内框（bottom 4.5%）；`.cover-badge` LUNA 徽章（left 5.5% top 2.6%）。
- 面板：`.menu-ruler` SVG data-uri 刻度尺（pin 奶油带底）；`.menu-panel` top 77.5% bottom 4%（奶油带在图 y1410 ≈ 屏 76%），子元素 `flex-shrink:0`（否则刻度尺被 flex 压成 0 高）。状态胶囊已废（难度档由 `CLASS` 遥测标签承载，避免重复）。仪场遥测（`01-mission-patch.png` 参考）：`.menu-tel` 三块（TARGET/LUNA=今日最佳、SOL III/EARTH=难度档、ANOMALY/VOID=装饰，数据在 `refreshTitleUI` 刷新）；`.menu-reticle` 左十字准星 + `.menu-bracket` 右上角框（SVG data-uri 细金）。定位用屏 %：舞台锁 9:16 + `object-fit:cover` 顶锚，底图 1044×1884 只被裁底部 28px，屏 y% ≈ 图 y/1856，各机型稳定。
- **不要做奶油纸边框**：纸边是"海报印在纸上"的隐喻，手机屏幕满版沉浸才忠于海报本意；且局内无法跟入会撕裂（用户定，勿回退）。

### 3a. Color

- Paper: `#E8DCC8`
- Navy: cover `#1B3A52` · menu `#0E1C2C` · play `#15202E`
- Cream: `#F0E6D3` / dim `#C5B89A`
- Gold: `#D4A84B` / bright `#E8C878` / rust `#D97B3A`
- Earth: teal `#3D8B7A` + terra `#C4A35A`
- Moon: 金奶油盘 `rgb(234,205,151)`（7244 采样）+ 合成光晕 `rgb(240,214,150)`
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
- 边框：封面细金内框 keyline（CSS inset 1%，四角刻度）；无奶油纸边
- 基数 4px；HUD 顶条 + 底摇杆区，不遮中线航道

### 3d. Component seeds

- **任务补丁:** 双金圈 + 内嵌几何地球/暖金月 + 虚线轨
- **天体:** 扁平 2–3 色 + 描边；**月亮=金色圆月（7244 同源，淡陨坑、少暗部）**
- **信号:** 金色菱形 + 四向短线
- **引力井:** 黑核 + 同心硬环（赭/奶油），细 danger 描边
- **走廊:** 奶油虚线消失点射线 + 深度刻度
- **HUD:** 分段块（MASS 奶油 / SIGNAL 金）+ 刻度尺，无圆角卡片；竞速局中央加 Geist Mono 计时器（tabular-nums）
- **星:** 四档分布——小点为主，中星/亮星渐进，四角芒星点缀；暖金不偏白

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
- localStorage：榜、成就、难度、声音、竞速（今日最佳/按难度 PB）
- 小红书打包：`tools/pack_xhs.sh` → `dist/chase-the-moon.zip`（白名单文件 + 禁用 API 自检）

## 6a. 未来方向（已留钩子，未实现）

- **「月之暗面」模式**：升档梯终点（blood 档），月亮会攻击、套捕会挣脱。命名致敬月之暗面，内部 key 仍为 `blood`（存档兼容），仅用户可见文案改名。专属视觉=暗月/血月（与全局金色圆月对撞）。
- **竞速 streak（候选，未拍板）**：连续 N 天完成今日竞速给称号，复用现有 `Store.unlock` 成就机制。
- **开场/局内 stipple 噪点（候选，未拍板）**：Canvas 背景颗粒对齐 ref 06 密度，工作量与风险大于封面侧改动，等真机反馈再定。

## 7. Anti-Patterns

- 软径向光晕当主体、紫蓝青渐变、圆角阴影卡片
- emoji 图标、写实 3D 星球、彩虹射线光污染
- 苏维埃满屏斜线构图（局内会打架）
- 屏幕里假装一张纸（奶油纸边/相框）；海报感靠颗粒与版式，不靠物理隐喻
- AI 图与合成/DOM 区域质感断层（颗粒、星密度必须同参数衔接）
- 凭数值扫描判定"损伤"，不与原图视觉对比就动手修图

## 8. Decision-Making

| 冲突 | 选择 |
|------|------|
| 可读性 vs 海报密度 | 局内扁平可读优先，封面可更「海报」 |
| 月亮亮度 | 金色圆月（7244 同源抠图，合成光晕），暗月只留给月之暗面 |
| 难度选择位置 | 不设选择器：通关自动升档（2026-09 用户定） |

## 9. Workflow

封面 → 任务面板 → 过场 → 局内 → QTE → 结算 → 再来/回封面。

---

# 游戏结构

## 屏幕流

```
cover(封面) → menu(开始/声音/返回) → intro(可跳) → play → discover → qte → result
                ↑__________________________ 失败 __________________________|
```

### 1. 封面 cover
- 细金内框 + 深青场 + 金环地球（DOM 金色圆月沿环公转）+ LUNA 徽章
- 标题「逐月计划」+ — ✦ — 饰线；「开始任务」「今日竞速」；版本行
- 可进 menu

### 2. 任务面板 menu
- 仪表场：十字准星、遥测标签、虚线轨道、月/井/地球示意（下半奶油带留白）
- DOM 控制区：档位胶囊 + 主按钮「开始追逐」+「声音：开/关」「返回封面」+ 底部刻度尺
- **难度不在面板**：通关（捕获成功）自动升档 标准→虚空→月之暗面，失败原地重来
- 今日竞速只在封面；本机榜单只在结算屏

### 3. 开场旁白（3–5 行，可跳）

### 4. 追逐主循环
- 摇杆 + 喷射；金色信号拉近、白石补质量、硬岩碰撞
- 虚线走廊消失点；进度条满 → discover → qte

### 5. 捕获 QTE
- 奶油/金双描边套环；进圈按「捕获」；3–4 锁

### 6. 结算 3 档
- score = 0.35*质量 + 0.30*追近 + 0.35*QTE
- 完美重聚 / 险胜偏轨 / 擦肩而过
- 通关局附「用时 / 纪录(PB) / 今日最佳（竞速局）」；破纪录金色「新纪录」

## 文件结构

```
index.html  style.css  game.js  DESIGN.md  bgm/  music/
```
