# AGENTS.md — 逐月计划 (Chase the Moon)

**类别口径（扩展先读）：** 太空时代印刷海报 × 竖屏纵深街机（追击与捕获）。  
「复古未来主义」只作族谱概括，不是标签主称。完整三层定位与空间模型定稿见 `DESIGN.md` §2a。

竖屏像素网页游戏：玩家扮演地球，追回被黑暗天体拖走的月亮。纯静态三件套，无构建。

**规范路径：** `/Users/jonysong/Work/Products/chase-the-moon`  
（已从 MiMo 会话临时目录迁出；后续所有改动以此为准。）

## 当前状态（2026-09-22 晚 · 新会话先读这里）

- **版本**：git tag **`v1.0.1`** + HEAD `a49a239`（音频修复）已推 `origin`。交付包 `dist/chase-the-moon.zip`（**772K**，audit PASS 17 文件）。
- **产品完成**：四档难度+竞速；月之暗面（blood+暗月）；QTE 体验包（真判定环三态/连套升级/顿帧 juice）；**MoBA 摇杆**（96px 盘、t^1.1、steer 24、无双死区）；井黏滞软化；金标无 hit-stop；QTE 与追逐同族速度跟踪；工程收尾（字体只留 B、board 清洗、save 提示、noise 缓存）。
- **音频结论（小红书容器实测，勿再走弯路）**：
  1. **Web Audio 可用**，但 **`AudioContext` 只能在用户手势里 `new`**——否则永久 `suspended`（按键有声 = 已通）。
  2. 上传白名单**无音频扩展名**（jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff）→ 不能打 mp3/wav。
  3. `data:`/`blob:` 的 `<audio>` 被 CSP 拦 → base64 方案无效。
  4. **唯一路径 = Web Audio 合成 BGM + SFX**（`unlockFromGesture` + `AudioEngine.patterns`）。
- **待真机/容器验证**：合成 BGM 音色与音量；竞速结算三行；Chrome 61 旧内核；06-stipple/浮动摇杆手感终验。
- **未做**：竞速 streak；仓库大文件瘦身（template/ / design-refs / bgm 母带仍入库）。

## 项目根目录

本文件所在目录即项目根。所有路径相对根目录。

```
.
├── index.html          # 入口（Canvas + DOM HUD）
├── game.js             # 全部逻辑：状态机、手感、音频、渲染
├── style.css           # 像素 UI / HUD / 虚拟摇杆
├── DESIGN.md           # 视觉与产品蓝图（调色、字号、反模式）
├── bgm/                # 音乐母带（mp3/wav 仅存档；运行时不加载，不进小红书包）
│   ├── waiting_lobby.mp3/.wav
│   └── results_score.mp3/.wav
├── assets/ui/          # 封面/菜单海报 webp（menu 延迟加载）
├── assets/sprites/     # 局内天体 webp
└── music/              # 音乐工作区（不直接被 index.html 引用）
    ├── src/            # Python 生成脚本
    ├── raw/            # 脚本产出的原始 wav
    ├── pack/           # 对比试听包 + 简易播放页
    └── scores/         # ABC 乐谱
```

## 运行

无构建。本地预览：

```bash
python3 -m http.server 8787 --bind 0.0.0.0 .
# 手机同 Wi-Fi: http://<本机IP>:8787
```

直接双击 `index.html` 也可玩（BGM 全合成，无文件依赖）。

## 架构速览（game.js）

| 模块 | 职责 |
|------|------|
| `PHYS` / `VIEW` / `PROG` | 物理、伪 3D 纵深投影（定稿空间模型，见 DESIGN §2a）、进度 |
| `AudioEngine` | Web Audio：SFX + 全合成 BGM |
| `Input` | 虚拟摇杆 / 喷射键 / 键盘 |
| `G` | 运行时状态 |
| 状态机 | title → intro → play → discover → qte → result |

逻辑分辨率 **270×480**，`imageSmoothingEnabled = false`。

## 音频映射（当前约定 · 全合成）

小红书小工具白名单不含音频文件、且禁用 fetch → **BGM 全部走 Web Audio 合成**（`AudioEngine.patterns`），`bgm/` 仅作母带存档，不进包。

| 场景 | 来源 |
|------|------|
| 标题（开始前） | 合成 `patterns.title`（88 BPM，soft 声部，64 步氛围版） |
| 开场旁白 | 合成 `patterns.intro`（84 BPM，soft） |
| **局内追逐** | 合成 `patterns.chase`（**148 BPM**，boost≈1.35，紧迫感） |
| QTE | 合成 `patterns.qte` |
| 发现/捕获前奏 | 合成 `patterns.discover` |
| 结算 | 合成 `patterns.ending`（96 BPM，soft，64 步） |

要点：

- 全部走 **Web Audio**（与 SFX 同一条 `AudioContext` 解锁链），不要改回独立 `HTMLAudio`（曾导致局内全哑），也不要重新引入文件 BGM（小红书禁用 fetch + 音频文件类型）。
- `patterns.*.soft = true` 时声部变软（triangle/sine、长音、低增益）——标题/intro/结算用。
- `updatePlay` / `startRun` / 按钮里调用 `AudioEngine.resume()`。
- 浏览器需一次用户手势才出声。
- 海报/sprite 用 webp；menu 海报在进入任务面板时才设 `src`（延迟加载）。

## 音乐再生成

```bash
cd music/src
python3 generate_chase_the_moon.py   # 主 BGM → 写到脚本旁 assets/
python3 generate_midautumn.py
python3 generate_moon_variants.py
```

产出后拷贝到运行时目录并转 mp3：

```bash
cp <生成的 chase_the_moon.wav> ../../bgm/waiting_lobby.wav
cp <生成的 moon_midautumn_8bit.wav> ../../bgm/results_score.wav
ffmpeg -y -i ../../bgm/waiting_lobby.wav -codec:a libmp3lame -b:a 96k -ar 22050 -ac 1 ../../bgm/waiting_lobby.mp3
ffmpeg -y -i ../../bgm/results_score.wav -codec:a libmp3lame -b:a 96k -ar 22050 -ac 1 ../../bgm/results_score.mp3
```

版权：全部为本项目**原创**曲，非任何商业歌曲改编，可商用。

## 手感相关（2026-09-22 再调）

- **软目标（尘埃/金标）**：强磁吸 + 近距真空；判定 pad 较宽；吃到 scale pop + 粒子（**金标不再 hit-stop**，避免连吃卡顿）。
- **硬岩碰撞**：击退约 95、无敌 0.55s、hit-stop 70ms、shake、爆裂粒子（打击感保留）。
- **喷射**：点按立刻沿摇杆/速度方向冲量，带轻 shake。
- **摇杆（MoBA 级 · 2026-09-22 二调）**：浮动原点；盘 **96px** / 行程 **44px** / 死区 **3px** / 满行程 **40px**；响应 **t^1.1 近线性**；`updatePlay` **无二次死区**；基座先 `.live` 再贴指（禁止 CSS 滑入）。
- **速度跟踪**：play `steer: 24`，QTE `22`——同族近直连（90% ≈ 95–105ms）。
- **井黏滞**：拖曳 **1.1**、余黏 0.25s 软衰减到 **0.82×** 限速（已非二值 0.72 换挡）。
- **QTE**：与追逐同族速度跟踪，不再用加速度+阻尼两套手感。
- 改手感优先搜 `game.js`：`pickupPop`、`hitStop`、`pad =`、`jet`、`pullR`、`FULL`、`wellSticky`。

## 修改纪律

1. 只改任务相关文件；不顺手重构 `game.js` 其他段落。
2. 动逻辑后跑：`node --check game.js`。
3. UI/手感必须在手机竖屏或 DevTools 移动模式下真机感过再收工。
4. 不要把会话临时目录当项目根；**以本 AGENTS.md 所在目录为准**。
5. 数值集中在文件顶部常量（`PHYS` / `QTE` / `PROG` / `DIFF`）和 `AudioEngine.patterns`。

## 历史决策（勿静默回退）

| 决策 | 原因 |
|------|------|
| ~~标题/结算用文件 BGM~~ → 2026-09 改**全合成** | 小红书白名单无音频文件 + 禁 fetch；`patterns.title/ending` 扩为 64 步 soft 氛围版顶替 |
| 禁止 HTMLAudio 播 BGM | 与 Web Audio 解锁冲突，局内无声 |
| 禁止 navigator.clipboard / execCommand | 小红书容器禁用；分享文案改「展示+全选，长按复制」 |
| 月辉保持金色；Kimi 元素 = Geist Mono + 深空蓝场微调 | 用户定：品牌蓝不进游戏色板，致敬靠字体/色调/叙事 |
| ~~任务面板只留 开始追逐/声音/返回封面~~ → 2026-09-21 难度刻度盘回归 | 初判面板杂乱砍了选择器；四档叙事化后用户要求选择回归：**仅已解锁档可选**（刻度盘置灰带锁），竞速开关同步入面板 |
| 四档难度叙事名：追寻之旅/宇宙冒险/坠入虚空/月之暗面（key 仍 easy/normal/hard/blood），逐级通关解锁 | 用户定（2026-09-21）：起步档 = 追寻之旅（原休眠 easy 档启用）；老存档追溯解锁宇宙冒险不降级 |
| blood 档用户可见名 = 「月之暗面」（key 不动） | 血月模式本来就是月亮攻击模式，用户指定正名；存档兼容故内部仍叫 blood |
| 全局金色圆月（封面/局内/QTE 同一张 7244 抠图）；**例外：blood（月之暗面）局内+intro 用惨白坑洞月**（`assets/sprites/moon-dark.webp`，`tools/make_dark_moon.py` 从 06-gameplay-stipple 海报顶部那颗抠出） | 用户定：暗月只留给「月之暗面」关卡；用户指认要的就是 06 海报风那颗（旧 245px 棕斑 webp 不是，勿再用） |
| 「今日同场」→「今日竞速」：指标从分数改通关用时 | 用户定：单机比分无感知；固定种子保证用时可比，对手是过去的自己。计时=play+discover+qte 的 `G.runT`，通关才计（`G.clearT`），PB 按难度存 `Store.data.pb`，今日最佳存 `daily.bestTime`；HUD 计时器仅竞速局显示 |
| 竞速入口收进任务面板（LED 开关），封面只留全长「开始任务」 | 用户定（2026-09-21）：封面双键视觉不平衡，单 CTA 更干净 |
| 封面不要奶油纸边框，用细金内框 keyline（`.cover-keyline`） | 纸边是「海报印在纸上」的隐喻，手机上满版沉浸才对；且局内无法跟入会撕裂 |
| 开场 WAV 无前置空拍 | 用户反馈「最前面进得太慢」 |
| chase BPM 148 + boost | 用户要「紧迫和节奏感」 |
| 局内 06-stipple 化（星噪层/表盘控件）+ QTE 时间条删除；**局内不要 keyline 内框**（加了被退回） | 用户定：局内对齐 06-gameplay-stipple 参考；两个控件间的时间条「没有必要」；满版沉浸，框线多余 |
| 摇杆浮动原点（按哪跟哪）+ 死区 5px/满行程 26px + steer 12.5 | 用户要「更跟手」；固定原点+线性全行程是主因 |
| **空间模型 = 伪 3D 纵深截击**（`projectBody` z+消失点投影；躲闪/陨石飞入带 3D 感是设计） | 用户确认（2026-09-22）：正常，不改纯平面；扩展勿删 z、勿改成同平面生成 |
| **类别口径：太空时代印刷海报 × 竖屏纵深街机**（「复古未来主义」只作族谱） | 用户定（2026-09-22）：扩展/文案/美术对齐都按 DESIGN §2a 三层表，避免跑偏 |

## Git 治理（2026-09-21 起）

- 基线 tag：`v1.0.0` → **`v1.0.1`**（2026-09-22）。纯本地仓库。
- **提交纪律**：动运行时文件（html/css/js/assets）后，先 `node --check game.js` + `tools/pack_xhs.sh`，再 commit；message 写「改了什么 + 为什么」。
- **缓存版本号**：封面/面板三张图（`cover-bg.webp` / `cover-moon.webp` / `menu.webp`）每次内容变更，必须同步升 `index.html` 和 `game.js` 里的 `?v=N`——iOS Safari 图片缓存极顽固，只刷新不一定拿新图。
- 不入库：`dist/`、`.playwright-cli/`、`music/raw/`、`music/pack/`（均为生成物，见 `.gitignore`）。
- **`.skill/minitool-zip-builder/` 不入库**（gitignore），但是交付门禁依赖它：打包后必须跑  
  `python3 .skill/minitool-zip-builder/minitool-zip-builder/scripts/audit_artifact.py ./dist/chase-the-moon`  
  以及对 `dist/chase-the-moon.zip` 再跑一次。若本机没有该目录，从技能包安装 minitool-zip-builder v1.6.0 后再验收，**不要跳过 audit**。
- 封面底图管线（重跑必须按序）：`tools/patch_cover_grain.py` → `tools/repair_cover_ring.py`（两处缺口，参数见 DESIGN.md）→ `tools/patch_moonspot_stars.py`（加法，不可重复执行）。
- 面板底图管线：`tools/patch_menu_seams.py`（源 `tools/menu-prseam.webp`）抹仪场烘焙断口——两条横向金线（y≈1041/1205）、x=0/1043 竖框线（仅 navy 区）、右缘 AI 水印残迹；奶油边界 y1265→y1410；星图收进圆角矩形屏幕框（边距 36 / 圆角 30 / 2px 深墨描边，监视器隐喻，用户定）。
- 运行时字体只装 B 套装 + Geist Mono + Noto Serif SC；`assets/fonts/` 里 A/C/D 实验室 woff2 可留仓库作档案，但 `fonts.css` / `style.css` 不得再引用（引用了包内会 404）。

## 小红书小工具约束（打包前自查）

- 白名单文件类型：html/css/js/png/jpg/jpeg/gif/webp/svg/woff/woff2/json；**无音频/视频**
- 禁：内联 `<script>`、`onclick=` 行内事件、fetch/XHR/一切网络请求、eval/new Function、WASM、Worker、iframe、form 提交、window.open/prompt、clipboard/execCommand、外部 CDN/图片/字体
- 可用：Canvas 2D、WebGL（受限）、包内资源 src 引用、内联样式、localStorage/IndexedDB、文本选择
- 打包：`tools/pack_xhs.sh` → `dist/chase-the-moon.zip`（自带白名单/禁用 API 自检）
- **官方构建规范**（`.skill/minitool-zip-builder/`，v1.6.0）：zip 根目录必须直接是 `index.html`（`cd dist/chase-the-moon && zip -qr ../chase-the-moon.zip .`，不可带目录层）；JS ≤ ES2017（禁 `?.`/`??`/对象 spread/可选 catch 绑定等，Chrome 61 基线）；CSS 走「Chrome 61 基线 + 增强层覆盖」（禁 inset/gap/clamp/min()/dvh/env()/aspect-ratio 单实现——本项目全部用「基线声明在前、增强声明在后」或 margin 基线）；交付前跑 `python3 .skill/minitool-zip-builder/minitool-zip-builder/scripts/audit_artifact.py ./dist/chase-the-moon` 和 zip 各一次

## 不做

- 不引入打包器 / 框架 / npm 依赖（除非用户明确要求）。
- 不在 HUD 用 emoji 或现代 SaaS 控件（见 `DESIGN.md`）。
- 不把 `music/pack`、`music/raw`、`bgm/` 挂进游戏运行时（BGM 全合成；母带仅存档）。
