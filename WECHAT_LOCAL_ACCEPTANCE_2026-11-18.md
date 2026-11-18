# 《逐月计划》微信版本机验收报告

- 日期：2026-11-18（含 22:47 字体错误闭环）
- 仓库：`jonysong-beta/chase-the-moon`
- 分支：`feat/wechat-iaa`
- 代码基线：`2d5f556`，与 `origin/feat/wechat-iaa` 一致；另含本报告列出的未提交修正
- 本机环境：Node.js 24.22.1、Google Chrome、微信开发者工具 2.02.2608060、基础库 3.17.6
- 边界：未上传、未提审、未发布，未修改仓库可见性，未合并 `main`，未配置真实广告或排行服务

## 1. 当前结论

本地工程、自动测试、浏览器集成和生产包检查均通过。微信开发者工具重新登录后已能正常打开项目；正式生产包封面已在模拟器中真实显示，工作台、L01 和暂停层也已通过临时内部动作驱动完成实际渲染检查。

用户提供的首条控制台错误已确认是 `wx.loadFont` 对 `assets/fonts/GeistMono.woff2` 返回 `NOT_WHITELIST_FILE`；4 条红错正好对应 4 个 WOFF2 字体。微信包改用同源转换的 TTF 后，四个字体均返回真实 family，**正式入口复验为 0 条红色错误**。剩余 1 条为微信 HarmonyOS 平台提示，不是游戏资源错误。

用户已实际操作确认“开始任务 → 摇杆移动 → 暂停”正常，随后又确认真实触摸完整打一局 L01、音乐、音效和暂停恢复正常。另有临时驱动通过真实物理与拾取规则完成 L01（36 秒、8 月辉、2 成长点），第二次启动后完成状态、成长点和工作台计数均保持；原始模拟器存档已恢复。

至此，**微信基础体验闭环已由用户操作确认与自动证据共同覆盖**。仍未完成的是：多点摇杆＋喷射、完整主线、后台／前台、分享，以及 `App.*` 自动化控制通道。

| 检查项 | 结果 | 证据 |
|---|---|---|
| 生产包重建 | 通过 | 32 文件，1,259,771 字节，约 1.20 MiB |
| manifest 哈希与体积 | 通过 | 逐文件 SHA-256 一致，体积一致 |
| Node 自动测试 | 通过 | 171／171，0 失败、0 跳过 |
| 语法与 JSON | 通过 | 40 个 JavaScript、2 个 JSON |
| 浏览器集成脚本 | 通过 | 经典广告／QTE、L01–L04、每日、存档、4 视口、H5 |
| 包体文件类型 | 通过 | 17 JS、1 JSON、10 WebP、4 TTF，无额外文件 |
| 网络与敏感信息扫描 | 通过 | 无硬编码外部 URL，未发现密钥类内容 |
| 生产开关 | 通过 | `debug:false`、预览排行关闭、广告位为空、世界端点为空、好友榜关闭 |
| 微信正式封面 | 通过 | 正式入口重新编译后封面和“开始任务”可见 |
| 微信核心页面渲染 | 部分通过 | 工作台、L01、暂停层可见；由临时内部动作驱动 |
| 微信字体加载 | **通过** | 四个 `wx.loadFont` 均返回真实 family |
| 微信控制台 | **通过本轮错误清理** | 正式入口 0 红错；仅 1 条平台 HarmonyOS 提示 |
| 微信完整基础体验 | **用户确认通过** | 真实触摸完整 L01、音乐、音效、暂停恢复正常 |
| 微信 L01 结算与存档重启 | **通过** | 自动操控真实物理通关；第二次启动数据保持，原存档恢复 |
| 微信自动化控制通道 | 未通过 | `App.*` 接口仍超时；`Tool.getInfo` 正常 |

## 2. 自动测试与浏览器验收

### Node 与构建

执行：

```bash
node tools/pack_wechat.js --preview
node --test tests/*.test.js
```

结果：

- 当前生产候选：32 个文件，1,259,771 字节，约 1.20 MiB。
- 字体修复后的 171 项测试全部通过，最近一轮约 0.93 秒。
- 独立重算包内文件哈希，无不一致。
- 40 个 JavaScript 语法检查及 2 个 JSON 解析检查通过。
- 所有临时验收入口和字体探针均已由正式打包器覆盖。

### Chrome 移动端集成

使用本机 Chrome 和临时放置在忽略目录中的 `playwright-core` 驱动运行仓库现有脚本；未下载浏览器、未增加生产依赖。

通过范围：

- 经典模式：触摸入口、广告取消、广告完整观看、第二次失败、QTE、结算和成绩榜规则。
- 主线 L01–L04：真实摇杆输入完成，通关有效时间约 36.0／50.0／58.0／70.0 秒。
- 成长：喷射授予、强化至Ⅱ、刷新后存档恢复。
- 每日 A：150 秒有效航行、暂停冻结、900 分金评级、5 点成长奖励和存档写入。
- 视口：360×740、390×790、430×932、1024×768。
- 原 H5：封面、开始、跳过开场并进入追逐的冒烟测试通过，无页面运行异常。

证据：`.playwright-cli/wechat-v2/browser-results.json`、`.playwright-cli/local-acceptance/browser-tests.log`。

## 3. 本轮修正

### 3.1 浏览器验收脚本过期断言

`tools/test_wechat_browser.js` 原先把完成 L04 当作全部主线完成；现行产品有十二关，因此改为断言：

- `hub.complete === false`
- `hub.nextId === 'L05'`
- `hub.completedCount === 4`

修正后浏览器集成流程通过。

### 3.2 启动异常诊断信息

`minigame/game.js` 原先只输出通用 `[moon] startup_failed`，现在保留原资源失败提示，同时输出真实 `error.stack` 或错误对象，不改变玩法、资源加载、奖励或存档逻辑。

### 3.3 微信专用 TTF 字体

根因证据：`loadFont:fail NOT_WHITELIST_FILE: no such file or directory assets/fonts/GeistMono.woff2`。四个 WOFF2 实际都在包内，因此不是漏打包，而是当前 `wx.loadFont` 通道不接受该文件类型。

处理：

- 从原 WOFF2 同源转换生成 4 个 TTF，没有重新子集化或删除字符。
- `minigame/src/platform.js` 的 `FONT_PATHS` 全部改用 TTF。
- `tools/pack_wechat.js` 只将 TTF 打入微信包。
- `tests/wechat-runtime.test.js` 新增防回退断言：四个 `loadFont` 路径必须全部为 `.ttf`。
- 原 WOFF2 保留在 `assets/fonts/`，H5／小红书继续使用，不改变网页字体管线。

| 字体 | TTF 字节 | 微信实际返回 family |
|---|---:|---|
| GeistMono | 42,472 | Geist Mono |
| NotoSerifSC-700-sub | 47,248 | Noto Serif SC |
| Limelight | 55,500 | Limelight |
| JosefinSans-300 | 116,004 | Josefin Sans Thin |

包体从修正启动日志后的 1,112,899 字节调整为 1,259,771 字节，增加 146,872 字节。

字体证据：

- 用户错误截图副本：`.playwright-cli/local-acceptance/console-error.png`
- 四个成功返回值：`.playwright-cli/local-acceptance/wechat-fonts-ttf.png`
- 正式入口 0 红错：`.playwright-cli/local-acceptance/wechat-font-final.png`

## 4. 微信开发者工具与模拟器

### 4.1 登录与启动

- 初次普通 `cli open` 返回 `code 10：需要重新登录`。
- 用户重新登录后，`cli islogin` 返回 `{"login":true}`，普通 `cli open` 返回成功。
- 正式生产包已在模拟器中显示封面、地月视觉和“开始任务”。

### 4.2 核心页面渲染

只截取微信项目窗口，已确认：

- 工作台显示主线、每日航线、无尽追寻、星空冥想及底部导航。
- L01 显示关卡 HUD、提示、天体、星场和虚拟摇杆。
- 暂停层显示“航行暂停”“继续航行”和“回工作台”。
- 中文、包内图片、Canvas 绘制和主要版式可见。

后三项由 `dist/wechat` 生成目录中的临时入口调用真实 `game.action()` 驱动；没有修改 `minigame/` 源稿伪造结果，也没有把临时入口留在生产包中。

关键截图：

- `.playwright-cli/local-acceptance/wechat-production-cover.png`
- `.playwright-cli/local-acceptance/wechat-hub.png`
- `.playwright-cli/local-acceptance/wechat-l01.png`
- `.playwright-cli/local-acceptance/wechat-pause.png`

### 4.3 自动化控制通道仍异常

重新登录并启动干净实例后：

- `Tool.getInfo` 正常返回工具 2.02.2608060、基础库 3.17.6。
- `App.enableLog`、`App.captureScreenshot`、`App.callWxMethod`、`App.callFunction` 仍分别在 10 秒后超时。

该问题不再归因于登录，也不能据此认定游戏未运行。直接窗口截图和真实字体返回值才是本轮微信运行证据。

### 4.4 真实触摸与音频

尝试自动点击时，macOS 返回“`osascript` 不允许辅助访问”，因此未绕过系统权限。用户随后亲自在模拟器中操作，分两次确认：

- “开始任务 → 摇杆移动 → 暂停”正常；
- 真实触摸完整打一局 L01 正常；
- 音乐、音效和暂停恢复正常。

因此，微信基础体验闭环记为**用户确认通过**。该结果不扩大为多点摇杆＋喷射、完整主线或所有菜单按钮均已覆盖。

### 4.5 L01 结算与存档重启

临时生成驱动先备份 `chase_moon_v3`，再以新存档通过真实加速度、纵深交互和月辉拾取规则完成 L01；没有修改血量、目标、位置、无敌状态或通关条件。

结果：

- L01 结算成功：36.0 秒、8 个月辉、2 点成长。
- 结算已持久化到微信存储。
- 第二次启动后：`completed=true`、`points=2`、`hubCount=1`，日志为 `restart PASS`。
- 随后恢复用户原始模拟器存档，日志确认 `original_restore=true`。
- 正式打包器已再次覆盖临时驱动，最终包哈希通过。

证据：

- `.playwright-cli/local-acceptance/wechat-l01-result.png`
- `.playwright-cli/local-acceptance/wechat-save-restart.png`

## 5. 最终包体与生产配置

最大文件：

| 文件 | 字节 |
|---|---:|
| `assets/ui/cover-bg.webp` | 295,470 |
| `assets/ui/menu.webp` | 211,556 |
| `src/core.js` | 153,969 |
| `assets/fonts/JosefinSans-300.ttf` | 116,004 |
| `assets/ui/daily-scenes.webp` | 69,062 |

审计结果：

- 包内没有预览 HTML、模拟广告 DOM、Node 测试、临时驱动、字体探针或截图。
- 未发现 `eval`、`new Function`、硬编码 HTTP／HTTPS 地址或敏感密钥。
- 世界端点为空时不会启用世界榜；广告位为空时不配置续玩能力。
- 原网页运行文件未改变，网页版仍使用 WOFF2。
- 最终生产配置再次确认：广告位／世界端点为空，好友榜／预览榜／调试均关闭。
- 包内不再包含 WOFF2，manifest 与实际 1,259,771 字节一致。

完整结果：`.playwright-cli/local-acceptance/package-audit.json`。

## 6. 尚需人工或外部环境完成

1. 补充多点摇杆＋喷射、结算后返回工作台及其他菜单按钮；真实触摸完整 L01 已由用户确认。
2. 排查 `App.*` 自动化通道超时；与已经成功的游戏画面、字体加载、基础体验、L01 结算和存档重启分开记录。
3. 完成微信环境中的完整主线、后台／前台和分享；音乐、音效与暂停恢复已由用户确认。
4. iOS 与 Android 微信真机：触控、音频、字体、安全区、前后台、存档和完整内容抽样。
5. 正式激励广告位、真实广告链、收入和银行卡到账。
6. 世界榜服务端、HTTPS 合法域名、身份与成绩校验、幂等和反作弊。
7. 好友关系权限、隐私审核、开放数据域与原生分享真机链。
8. 账号、类目、备案、流量主、提审材料、上传、审核和发布。
9. 仓库公开状态确认、功能分支合并策略、自动 CI 与正式微信版 Release。

## 7. 交付物与工作区状态

- `AGENTS.md`：加入最新模拟器与字体修复状态。
- `WECHAT_RELEASE_CHECKLIST.md`：持续勾选清单。
- `WECHAT_LOCAL_ACCEPTANCE_2026-11-18.md`：本报告。
- 未提交代码／测试：`minigame/game.js`、`minigame/src/platform.js`、`tools/pack_wechat.js`、`tools/test_wechat_browser.js`、`tests/wechat-runtime.test.js`。
- 未提交字体：4 个 `assets/fonts/*.ttf`。
- 未提交文档：`AGENTS.md` 及两份验收 Markdown。
- 临时依赖与验收入口只位于 `.playwright-cli` 忽略目录，不属于生产依赖。
- 未留下本地 HTTP 服务、浏览器测试进程或后台任务。
