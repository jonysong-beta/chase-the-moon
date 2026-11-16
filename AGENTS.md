# AGENTS.md — 逐月计划 (Chase the Moon)

**类别口径（扩展先读）：** 太空时代印刷海报 × 竖屏纵深街机（追击与捕获）。  
2026-11-16 用户进一步明确视觉核心为「宇宙航行、航线、工作台、复古未来风格」；复古未来不再只作族谱概括。完整三层定位、空间模型与统一美术定稿见 `DESIGN.md` §2a、F4–F7。

竖屏像素游戏：玩家扮演地球，追回被黑暗天体拖走的月亮。原网页版为纯静态三件套；微信小游戏源稿位于 `minigame/`，不引入框架或 npm 依赖。

**规范路径：** `/Users/jonysong/Work/Products/chase-the-moon`  
（已从 MiMo 会话临时目录迁出；后续所有改动以此为准。）

## 当前状态（2026-11-17 · 四板块本地候选，已完成统一美术运行化）

- **最新产品定稿（四板块与统一美术已实施）**：产品由整体大成长线、每日航线挑战、无尽追寻、星空冥想组成；技巧与当局变化融入每日/无尽，不另设 Roguelite 主入口。不做实时联机，保留世界排名、好友排名与分享的异步社交方向。成长章节有限，每日和无尽直接携带当前永久成长并排名，**不拆标准挑战/自由航线**。所有入口、排行、结算、分享和冥想统一使用宇宙航行、航线、工作台与复古未来视觉语言。详见 `DESIGN.md` F1–F7；无尽、冥想、分享和异步排行适配已在本地实现并验证，真实服务端与正式微信身份尚未配置，第一张统一视觉探索稿见 `design-refs/wechat-unified/visual-exploration.html`。
- **美术优先级（用户定）**：机制保持简单，强烈美术风格是核心产品力，要明确吸引喜欢太空时代印刷海报、Apollo 任务图形、复古未来与独立短局街机的审美人群。后续每个板块都需要能单独成立的主视觉，不能只用程序线稿和通用 UI 充当美术；强风格与信息减法并存。详见 `DESIGN.md` F7。
- **目标与范围**：以本游戏验证个人微信 IAA 的开发、上线、真实广告收入与银行卡到账；用户明确按 `DESIGN.md`「微信扩展完整设计 V2」E13 第一阶段实施。本轮已完成三章十二关、喷射/双脉冲/引力帆Ⅰ–Ⅲ、每日 A/B/C 池、无尽与冥想、分章航图/成长/每日简报/校准/最终重聚/结算/分享卡和统一美术；等待用户体验验收。V2 三章十二关仍是内容与教学基础，最新四板块及统一美术方向以 F1–F7 为准。
- **候选与保护**：仍在 `feat/wechat-iaa`，网页基线 `e1b6b63`；微信第一阶段候选与产品定稿已于 2026-11-16 本地提交为 **`153faac`**，未推送或上传。统一视觉探索、第一批 Canvas 实施与状态更新作为后续独立视觉基线保存，不自动推送。根 `game.js/index.html/style.css/assets` 与网页 Git 基线无差异；原 H5/小红书 ZIP 在提交前验证中重建并通过审计。无框架、npm 依赖或新增下载。
- **可玩循环**：L01 追光、L02 三组岩阵、L03 星尘补给、L04 安全授予并立即练习定向喷射；目标需真实拾取/操作及追近满条，漏收有安全尾段，无自然追近代过关。喷射按下沿触发，无方向不扣费；首通共 8 点，可花 4 点强化Ⅱ级，再进入 150 秒每日 A。L04 后主键转每日，三章十二关 L01–L12 全部可玩，主线最终进入重聚演出；喷射、双脉冲与引力帆均可授予、使用并强化至Ⅲ，每日 A/B/C 分别在 L04/L08/L12 后开放。
- **存档与奖励**：独立 `campaignV2/growthV2/dailyV2`，保留经典成绩/解锁和未知扩展字段；能力授予、强化、结算均先一次持久化，成功后才更新余额与状态，失败保留重试。主线首通一次；每日 UTC+8 开局日归属、四模板无重复选三、三段各 20 月辉/1 技巧门、评级补差与每日共用 5 点上限；日期回拨账本保留，成绩保留最近 30 个挑战日。
- **页面与美术**：复用原海报和天体，新增程序航图节点、能力图形、章节航线裁片、技巧门、稀疏第一章星场与喷射反馈；中文沿用字体子集与系统回退。可编辑源稿为 `minigame/src/{ui,core,campaign,daily,progression,endless,challenge,share,leaderboard}.js`。第一章标注视觉稿见 `design-refs/wechat-v2/phase1-review.html`（当时候选截图，非用户验收记录）。2026-11-16 已按用户初步认可的探索方向落地 Canvas 工作台、每日航线简报和 V2 分享卡；随后根据用户对信息堆叠与海报质感的反馈二次修订：每日只保留航线、时长、最佳/下一目标、成长奖励与开始，分享卡改为大成绩、大天体、任务徽章、纸边和颗粒，不再复制结算明细。真实运行截图见 `design-refs/wechat-unified/canvas-{workbench,daily,share}.png`。无尽已在 L04 后开放，携带永久能力，以真实生存时间写入独立 `endlessV2` 最佳纪录且不发成长点；冥想从工作台随时可进入，提供真实 2 / 5 / 10 分钟计时、动态观测窗与呼吸节奏，不写成绩、不发奖励。第一组四板块原创主视觉已形成可编辑 SVG 与 Chrome 渲染 PNG；成长构图获用户明确认可并保持，每日经复审改为漫画三格叙事，无尽采用远处暗月与近大远小的纵深航道，冥想使用用户认可的圆形观测窗构图。四张海报已统一底部色带与文字基线，冥想使用青绿色带；每日三幕统一白底，不加短标签、不画路线；第一格保留地月远景，第二格仅岩石特写，第三格仅黑洞特写，避免重复月亮。审看入口为 `design-refs/wechat-unified/key-visuals-review.html`，整组构图已获用户 LGTM。每日漫画区域已运行化为 `minigame/assets/ui/daily-scenes.webp`（888×798，69,062 字节）并接入真实每日简报；其余完整海报仍仅作设计源稿，不进入运行包。
- **生成物**：`node tools/pack_wechat.js --preview` → `dist/wechat/`，当前 **32 文件 / 1,112,850 字节**；逐文件 manifest 与源码/包内 SHA-256 及总大小一致。预览模拟广告与调试入口不在生产包，生产 `debug: false`；根 `project.config.json` 继续指向 `dist/wechat/`。
- **本轮验证**：**171 项 Node 测试全部通过**（原基线、微信 V2、三章十二关、统一视觉、无尽、冥想、分享、排行与续玩回归）；**40 个 JS 语法与 2 个 JSON 检查通过**。微信 manifest 的 32 个包内文件 SHA-256 与总大小独立复核通过；小红书目录/ZIP 各 **17 文件、0 警告**，双审计 PASS。完整本机 Chrome 流程使用真实触摸/摇杆与广告 DOM 按钮，无控制台异常或资源失败；原始 Node 日志为 `.playwright-cli/wechat-unified/node-tests-final.log`，浏览器结果在同目录 `results.json`。此前独立复核发现的暂停退出静音已修复并复核通过，本轮没有剩余确定的本地 P1/P2。
- **证据与临时产物**：本轮原始测试日志、浏览器结果、关键单张裁剪截图及修改前 core/ui 副本位于 `.playwright-cli/wechat-v2/`；正式视觉稿所用截图已复制到 `design-refs/wechat-v2/`，不依赖临时目录。生成包留 `dist/`，上述两个生成物目录继续由既有忽略规则管理。验证进程已结束，无持续轮询或遗留预览服务。
- **统一视觉探索验证（2026-11-16）**：`design-refs/wechat-unified/visual-exploration.html` 已在本机 Chrome 以 360×740、390×844、430×932 三种移动视口逐页检查工作台、成长、每日、无尽、冥想与分享，共 18 组；无横向溢出、可见动作裁切、控制台错误或资源加载失败，可见操作区高度均至少 44 CSS px。冥想时长切换与演示反馈已实际操作。原始结果和其余页面截图在 `.playwright-cli/wechat-unified/`；该静态 DOM 探索不等于 Canvas 实施或微信真机验收。
- **统一视觉 Canvas 验证（2026-11-17）**：使用本机 Chrome CDP 的真实触摸事件与预览多指适配器，从新存档实际完成 L01–L04（36.0/50.0/58.0/70.0 秒）、保存授予、强化喷射Ⅱ、返回新工作台、进入每日、完成 150 秒并获 5 点，再打开每日分享卡；另检查第一章分享卡、原生转发和经典入口往返。正式 Canvas 截图已复制到 `design-refs/wechat-unified/`，原始流程结果在 `.playwright-cli/wechat-unified/results.json`，无页面异常或资源失败；最新每日简报已实际加载包内漫画 WebP，而非程序图回退；另从工作台真实进入无尽，操控 20 秒后失败结算、保存最佳、生成分享卡并返回工作台确认纪录；随后选择 2 分钟冥想，验证后台冻结、恢复计时和安静完成；再真实通关 L05、L06，保存双脉冲授予并在成长页触摸选择、强化至Ⅱ；继续通关 L07，使用真实摇杆与捕获键完成 L08 两次线稿靶校准，最后完成每日 B 150 秒并验证跨池奖励为 0；随后真实通关 L09、L10，检查外缘蓄力带、免费借力释放与引力帆Ⅱ升级；最后通关 L11/L12，经历一次挣脱、三次有效锁定与重聚演出，并完成每日 C 150 秒、验证跨池奖励为 0。L05 另实际完成广告取消后重试、完整观看、恢复与首通，确认标记已续玩且不更新最佳；每日/无尽排行预览、世界/好友切换、海报导出及 C 池邀请重启也已实际验证。自动操控补充了真实摇杆避井，没有修改物理、血量或通关条件。
- **分享适配（2026-11-17）**：每日成绩与邀请、无尽纪录、主线结算和冥想场景已接入原生转发适配；真实 540×860 海报生成 500×400 微信缩略图，失败时使用官方文档允许的游戏画面回退。每日邀请严格校验日期、池和版本，未解锁不越权、过期不合榜、旧参数不打断局内；微信调用不冒充分享成功、不发奖励。本机 Chrome 已真实触摸调用分享、检查导出图片并重进同一 C 池航线，模拟 SDK 覆盖无接口/导出失败/启动参数；真实微信转发尚未验证。
- **排行适配（2026-11-17）**：每日按日期/池/版本比较完整航行得分，无尽按版本比较生存毫秒，永久能力直接计入。世界榜 HTTPS GET/POST 适配包含响应校验、幂等身份、失败重试、过期响应隔离，不伪造世界名次；好友榜需主动授权，KV 读写与好友渲染隔离在 `minigame/open-data/`，部分每日成绩不能借好友通道绕过完整航行门槛，销毁后的迟到回调不能继续写入。`minigame/src/leaderboard.js` 与真实每日/无尽结算、航道记录页面已接通。生产默认空世界端点、关闭好友榜与预览榜；预览数据显著标注非真实排名且不得入生产配置。当前没有真实服务端、正式好友权限或真机验证，**适配完成不等于排行已上线**。
- **尚未验证**：微信开发者工具编译、iOS/Android 微信真机、真实音频手感、微信中文字体回退、真实广告展示/收益、真实世界榜服务端、好友授权与开放数据域、原生分享、正式账号资质/备案/流量主及到账。**浏览器模拟通过不等于微信真机、用户体验或商业验收通过。** 用户此前「暂不安装开发者工具」约束继续有效。
- **账号与广告**：AppID 继续仅按测试用途配置；`minigame/config.js` 广告位为空，生产不显示续玩入口、不伪造奖励。L05–L12 的追逐失败在配置有效广告位后可自愿续玩一次，恢复本关开局质量、保留进度与事件游标、清理近身危险并选择井影响区外落点；可首通和领取尚未领取的奖励，但标记已续玩且不更新最佳。L01–L04、每日、无尽、校准和最终捕获不提供续玩；经典原规则不变。取消、无填充、重复回调和第二次失败均有回归。
- **统一美术运行化已完成**：四板块保留各自获认可的构图，而非复制整张静态海报。工作台使用任务环与遥测频道；每日使用真实 WebP 漫画三格；无尽使用远处暗月、近大远小岩石与纵深航道；冥想使用动态圆形观测窗、地月与轨道带。成长与校准、引力帆、重聚及结算/分享卡沿用同一套天体、纸边、金色航线和印刷颗粒。完整海报保留为可编辑设计源稿，不整体进入运行包；真实运行截图见 `canvas-{workbench-complete,map-complete,daily-b,daily-c,endless,meditation,reunion,share}.png`。分享、排行与续玩的本地适配已实现；正式世界榜服务端、微信好友权限和原生能力仍未验证，详见上方边界。
- **下一步与责任**：本地实现与候选封版已完成。真实世界榜仍需部署带身份、成绩校验和幂等处理的服务端；好友榜需正式账号权限与真机授权链；原生分享、广告、字体、音频和商业收益仍需微信工具及真机验收。用户此前「暂不安装开发者工具」约束继续有效；不自动推送、上传、提审或发布。

## 原网页基线与待验收项（2026-09-22）

- **版本**：git tag **`v1.0.1`** 后追加音频修复 `a49a239` 与状态收口 `e1b6b63`，已推 `origin`。原交付包 `dist/chase-the-moon.zip`（**772K**，audit PASS 17 文件）本轮未重建。
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
├── minigame/           # 微信小游戏可编辑源稿（入口、核心、UI、平台、广告）
├── tests/              # 微信迁移的 Node 逻辑与模拟 SDK 回归
├── project.config.json # 微信工具配置，运行目录 dist/wechat/
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
| **类别口径：太空时代印刷海报 × 竖屏纵深街机**；2026-11-16 起「复古未来」明确成为画面核心，不再只作族谱 | 用户定（2026-09-22）：扩展/文案/美术对齐按 DESIGN §2a 三层表；用户补充（2026-11-16）：所有入口与分享统一按宇宙航行、航线、工作台、复古未来视觉语言，见 F4–F7 |

## Git 治理（2026-09-21 起）

- 基线 tag：`v1.0.0` → **`v1.0.1`**（2026-09-22）；GitHub 远程为 `jonysong-beta/chase-the-moon`。微信第一阶段候选与产品定稿已本地提交 `153faac`（2026-11-16），尚未推送；后续视觉探索作为独立视觉基线保存，尚未推送。
- **提交纪律**：动运行时文件（html/css/js/assets）后，先 `node --check game.js` + `tools/pack_xhs.sh`，再 commit；message 写「改了什么 + 为什么」。
- **缓存版本号**：封面/面板三张图（`cover-bg.webp` / `cover-moon.webp` / `menu.webp`）每次内容变更，必须同步升 `index.html` 和 `game.js` 里的 `?v=N`——iOS Safari 图片缓存极顽固，只刷新不一定拿新图。
- 不入库：`dist/`、`.playwright-cli/`、`music/raw/`、`music/pack/`（均为生成物，见 `.gitignore`）。
- **`.skill/minitool-zip-builder/` 不入库**（gitignore），但是交付门禁依赖它：打包后必须跑  
  `python3 .skill/minitool-zip-builder/scripts/audit_artifact.py ./dist/chase-the-moon`
  以及对 `dist/chase-the-moon.zip` 再跑一次。若本机没有该目录，从技能包安装 minitool-zip-builder v1.6.0 后再验收，**不要跳过 audit**。
- 封面底图管线（重跑必须按序）：`tools/patch_cover_grain.py` → `tools/repair_cover_ring.py`（两处缺口，参数见 DESIGN.md）→ `tools/patch_moonspot_stars.py`（加法，不可重复执行）。
- 面板底图管线：`tools/patch_menu_seams.py`（源 `tools/menu-prseam.webp`）抹仪场烘焙断口——两条横向金线（y≈1041/1205）、x=0/1043 竖框线（仅 navy 区）、右缘 AI 水印残迹；奶油边界 y1265→y1410；星图收进圆角矩形屏幕框（边距 36 / 圆角 30 / 2px 深墨描边，监视器隐喻，用户定）。
- 运行时字体只装 B 套装 + Geist Mono + Noto Serif SC；`assets/fonts/` 里 A/C/D 实验室 woff2 可留仓库作档案，但 `fonts.css` / `style.css` 不得再引用（引用了包内会 404）。

## 小红书小工具约束（打包前自查）

- 白名单文件类型：html/css/js/png/jpg/jpeg/gif/webp/svg/woff/woff2/json；**无音频/视频**
- 禁：内联 `<script>`、`onclick=` 行内事件、fetch/XHR/一切网络请求、eval/new Function、WASM、Worker、iframe、form 提交、window.open/prompt、clipboard/execCommand、外部 CDN/图片/字体
- 可用：Canvas 2D、WebGL（受限）、包内资源 src 引用、内联样式、localStorage/IndexedDB、文本选择
- 打包：`tools/pack_xhs.sh` → `dist/chase-the-moon.zip`（自带白名单/禁用 API 自检）
- **官方构建规范**（`.skill/minitool-zip-builder/`，v1.6.0；仅适用小红书包）：zip 根目录必须直接是 `index.html`（`cd dist/chase-the-moon && zip -qr ../chase-the-moon.zip .`，不可带目录层）；JS ≤ ES2017（禁 `?.`/`??`/对象 spread/可选 catch 绑定等，Chrome 61 基线）；CSS 走「Chrome 61 基线 + 增强层覆盖」（禁 inset/gap/clamp/min()/dvh/env()/aspect-ratio 单实现——本项目全部用「基线声明在前、增强声明在后」或 margin 基线）；交付前跑 `python3 .skill/minitool-zip-builder/scripts/audit_artifact.py ./dist/chase-the-moon` 和 zip 各一次

## 不做

- 不引入打包器 / 框架 / npm 依赖（除非用户明确要求）。
- 不在 HUD 用 emoji 或现代 SaaS 控件（见 `DESIGN.md`）。
- 不把 `music/pack`、`music/raw`、`bgm/` 挂进游戏运行时（BGM 全合成；母带仅存档）。
