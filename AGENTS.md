# AGENTS.md

本文件是仓库内 AI 编码代理的工作约定。面向使用者的介绍见 `README.md`；若两份文档重复，以本文件中的工程约定为准。修改前先确认当前实现与这里的说明一致，发现过期处时一并修正。

## 项目边界

- 项目是「大英默写器 Pro」的纯前端 Web 应用：Next.js 15 App Router、React 19、TypeScript，静态导出到 `out/`。没有应用后端、登录或云端用户数据。
- 运行时词库来自 `public/data/` 的 JSON；用户数据保存在浏览器 `localStorage`。
- 桌面与 Android 分发由 `src-tauri/` 的 Tauri 2 壳复用同一份 `out/` 产物（asset protocol 从根路径提供，`/data/...` 绝对路径在两端都兼容），只提供原生窗口、安装包和 APK，不写 Rust 业务逻辑；原 PyQt6 桌面版仍不属于当前产品，不要恢复 Python 运行时。
- UI 使用 `@radix-ui/themes` 与 UnoCSS。不要另加组件库或单独安装 `@radix-ui/react-*` 原语。

## 开发命令

```bash
npm install
npm run dev         # 开发服务器 http://localhost:3300
npm run typecheck   # tsc --noEmit
npm run check:data  # 校验 public/data
npm run test:unit   # 编译并运行 tests/*.test.ts（node:test）
npm test            # check:data + test:unit
npm run build       # Next.js 静态导出到 out/
npm run start       # 用 serve 托管 out/（先运行 build）
npm run desktop:dev   # Tauri 桌面窗口调试（需要 Rust 工具链，devUrl 指向 3300）
npm run desktop:build # 打当前平台安装包到 src-tauri/target/release/bundle/
npm run android:dev   # Android 模拟器/设备调试（额外需要 JAVA_HOME(17+)、ANDROID_HOME、NDK_HOME）
npm run android:build # 打通用 APK 到 src-tauri/gen/android/app/build/outputs/apk/
```

按改动范围验证：词库改动跑 `npm run check:data`；纯逻辑改动跑相关单测或 `npm test`；应用、路由或配置改动跑类型检查和构建，并在浏览器检查受影响页面。UI 改动还要检查窄屏布局（390px）和键盘可用性。`src-tauri/` 改动先 `npm run build` 再 `cargo check --manifest-path src-tauri/Cargo.toml`，或 `npm run desktop:dev` 冒烟；涉及移动端改动再跑 `npm run android:build`。不要为纯文档改动启动应用或运行构建。

发布只认版本：`package.json` 的 version 与 `v*` tag 必须一致（`release.yml` 先校验再构建），打包版本号由 `tauri.conf.json` 的 `version: "../package.json"` 从根 `package.json` 读取，Android `versionCode` 由 CLI 从同一版本生成写入 `tauri.properties`，不要在两处分别维护或在 Gradle 工程里手改版本。Android 发布签名读取 `ANDROID_KEY_BASE64`、`ANDROID_KEY_ALIAS`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_PASSWORD` secrets，未配置时回退 debug 签名（仅适合测试）；APK 由 `attach-android` job 附加到草稿 Release。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| `app/` | 路由薄壳、根布局、全局 CSS；布局统一渲染页头和根 `<Theme>` |
| `components/` | 客户端页面视图与可复用 UI；页面主体放在 `*-view.tsx` |
| `components/storage-error-boundary.tsx` | 当前本地 schema 错误边界与用户主动重置入口 |
| `components/prefs-error.tsx` | 偏好 schema 错误提示与仅重置显示设置入口 |
| `lib/data.ts` | 加载 `public/data/index.json` 与单元 JSON；失败不缓存，允许重试 |
| `lib/model.ts` | 词库类型、练习卡片、多义词出题、例句空缺提取 |
| `lib/session.ts` | 会话与结果的 URL 查询串编解码 |
| `lib/engine.ts` | 练习牌组、判分、错题/掌握状态和统计；模块级单例 |
| `lib/storage.ts` | 当前 schema、首次安装默认值与严格 `localStorage` 读写 |
| `lib/stats.ts` | 日期、连续练习天数和每日统计的纯函数 |
| `lib/hooks.ts` | React 组件读取词库、设置、偏好、引擎和统计的订阅入口 |
| `lib/backup.ts` | 用户数据 JSON 备份导入与导出 |
| `public/data/` | 随仓库维护的当前词库 JSON，唯一运行时词库来源 |
| `scripts/` | 词库校验工具 |
| `tests/` | `node:test` 纯逻辑测试；不引入测试框架依赖 |
| `src-tauri/` | Tauri 2 壳（桌面与 Android）：窗口、打包和图标配置；`frontendDist` 指向 `../out`，无自定义 Rust 命令 |
| `src-tauri/gen/android/` | 已入库的 Android 工程；`keystore.properties`、签名密钥与构建产物由其间 `.gitignore` 排除，不要提交 |
| `.github/workflows/` | `ci.yml` 检查 PR 与 main；`release.yml` 由 `v*` tag 触发，构建全平台安装包与 Android APK 并创建草稿 Release |

路由由 `app/` 中的页面文件映射：`/` 首页、`/browse` 预习、`/practice` 练习、`/result` 成绩、`/wrong-words` 错题本、`/settings` 设置、`/help` 帮助。页面文件尽量只处理 metadata、加载边界和 Suspense；页面交互放在对应视图组件。使用 `useSearchParams` 的 `/browse`、`/practice`、`/result` 页面必须在页面层套 `<Suspense>`，静态导出依赖这个边界。

## 关键数据流与不变量

### 页面、会话与引擎

- URL 是练习会话参数的来源。`SessionOptions` 定义在 `lib/storage.ts`，编码和解码在 `lib/session.ts`；新增或更改练习选项时要同步更新默认值、校验、URL 编解码、设置 UI 和测试。默认值不写进 URL。
- `/practice` 查询串包含词书、单元和练习选项；`/result` 查询串还包含本轮结果。URL 不包含逐题输入或当前进度：整页刷新会按 URL 参数重新开局；应用内前进/后退回到同一会话时，`engine.isActive(query)` 会让仍有余题的牌组续做。
- `getEngine()` 创建的单例会读 `localStorage`。只从挂载后可用的 `useEngine()` 或用户事件访问；不要在组件渲染期、模块顶层或服务端读取引擎。
- 组件取设置、偏好和统计走 `lib/hooks.ts`。新增引擎订阅 hook 时复用内部 `useEngineValue(read, fallback)`，其中 `read` 必须是模块级稳定函数。
- `engine.checkAnswer()` 无论答对或答错都会推进。独立全程无错才计首次正确；打错后修正、看答案或首字母提示都不算独立回忆。跳过通过 `skipWithoutPenalty()`，不记学习统计、不修改复习计划、不删除词条。
- 错题本、已掌握和单词统计按 `card.english`（单词）记录，而不是按释义记录。一个单词的多个释义通过 `SenseCard.senses` 展示。视图使用 `engine.stats()` 展示本轮数据，不另算一套。
- 复习本统一保存收藏、主动加入和自动错题，收藏不自动加入计划。`lib/review.ts` 定义间隔 1/2/4/7/15/30 天及重学规则；首次自动错题立即到期，已有词失败 10 分钟后重学。开始复习不清空词条，按到期时间取最多 20 词快照，无首字母提示，列出全部释义。只有计划复习中的到期独立成功升级，额外练习不延期，同轮失败优先。已稳固默认不进入常规练习，includeConsolidated 可覆盖；暂停/稳固词实际失败重新激活。

### 本地数据和备份

- 当前业务存储为 `zjueh.review-notebook`、settings、prefs、speech、word-stats、day-stats（均带 zjueh. 前缀），主题单独存储。经用户授权，仅支持上一版完整 SenseCard 错题/已掌握及 v2 备份的一次升级；其他旧结构仍拒绝。升级先将原数据写到 `zjueh.upgrade-backup-v2`，再写新本，成功后移除旧集合键；已有新本绝不重复迁移或重置。备份当前 v3，设置可下载升级前 v2 快照。
- 新增持久化数据时，在 `lib/storage.ts` 增加当前 schema 的校验、首次安装默认值、加载/保存函数，并将键加入 `lib/backup.ts` 的 `BACKUP_KEYS`。不要把主题键误认为业务设置；它由主题切换组件直接读写。
- 浏览器 API 只能在 effect、事件处理器或有 `typeof window` 守卫的客户端路径使用，避免静态预渲染和水合错误。存储读写错误应明确暴露，不要静默吞掉或用旧数据兜底。
- 练习作答与跳过的保存由 `lib/persistence.ts` 按键合并，在新题绘制后执行；页面转后台、pagehide、离开练习及备份导出/导入前应落盘。保存失败保留待保存任务，由根布局的 `SaveStatus` 提示并提供重试。主动清空用户数据前取消待保存任务，避免旧记录回写；不要把序列化或 localStorage 写入放回切题的同步路径。
- 练习与复习的朗读由 `Prefs.practiceTts` 控制，首次安装默认开启。开启时只有听写题会在题目出现时自动朗读，答对后各模式都会朗读答案；关闭时听写题显示释义提示，不调用自动或手动练习朗读。语音服务由 `zjueh.speech` 保存，可选国内 Edge TTS、国际 Edge TTS 和本地浏览器（`browser`），默认国内。云端探测、合成或播放失败时自动使用浏览器语音，不改写保存的服务选择；设置页显示实际使用的服务和音色。失败服务 30 秒后可重试，重试探测时继续提供浏览器兜底，避免禁用朗读或打断焦点。

### 词库与例句

- 词条结构：`{ english, senses: [{ pos, zh, en, examples }] }`。词性属于释义，允许为 `null`；同一词的多个用法合并进 `senses`。中文和英文释义分开保存，例句也属于各自释义。
- 修改或新增数据直接编辑 `public/data/`，运行 `npm run check:data`。该命令检查清单与文件对应关系、必需字段、重复词头、词性格式及零宽空格/NBSP。运行时不替数据做兜底清洗。
- 新词书需添加数据目录和单元 JSON、更新 `public/data/index.json`，并按需在 `lib/data.ts` 的 `BOOK_NAME_MAP` 配显示名。界面通过清单读取词书和单元，不要在视图中硬编码单元列表。
- 例句空缺用 `[[...]]` 标记；方括号内的拼写就是作答形式，可为语法所需的变形。一个句子多个不同空缺按顺序以空格连接作答；多个相同空缺只输入一次。例句练习按释义出题，没有可用空缺的卡片会自动跳过；若所选牌组都没有可用例句，显示无可用例句状态。
- `buildCards(words, merge)` 的 `sense` 为每条释义各出一题，`first` 为每词一题并提示首条释义，`all` 为每词一题并列出全部释义。例句模式固定使用 `sense`，不要改变题目与释义配对关系。
- `scripts/convert-v2.mjs`、`scripts/convert-v3.mjs` 和 `scripts/apply-example-split.mjs` 是历史迁移工具，会重写 `public/data/` 或创建归档快照，不属于日常数据编辑流程。执行前先阅读脚本、确认输入与备份；不要为了普通词条修订运行它们。历史 CSV 和从 CSV 重建 v1 词库的脚本已移除；`archive/v2-json/`、`archive/v3-json/` 仅保留格式迁移快照。

## UI 与浏览器约定

- 基础组件优先使用 `@radix-ui/themes`（如 Button、Card、Dialog、Flex、Grid、TextField、Switch、Progress、Badge、AlertDialog）。图标使用 `lucide-react`。Themes 没有的简单空态用 Themes 布局组件组合；危险操作用 `AlertDialog`。
- UnoCSS 只负责布局、间距、网格、定位与响应式，不替代组件库。颜色用 Radix Themes CSS 变量和 `<Theme>` props；不要写 `dark:` 变体，暗色由根 `<html>` 的 `.dark` 类和 `appearance="inherit"` 驱动。
- 交互文案用中文，遵循已有视觉语言。设置、帮助、错题本分区复用 `components/section-card.tsx` 的图标标题卡片。首页单元选择是整格按钮网格，小屏 4 列、640px 起 8 列；错题行内操作保留带文字的按钮。
- 页面统一使用 `Container size="3"`；表单中并排的选择器要统一 Radix `size`，同时检查上下边缘。卡片使用响应式内边距，小屏 size 2、宽屏 size 3；设置页紧凑分区只收紧内容间距，卡片内边距与其他页面一致。
- 词典表格与完整桌面导航从 768px 起显示，较窄屏幕使用词卡和移动菜单。桌面错题操作列保留整行按钮宽度；单词朗读用可聚焦按钮，不能只绑定文字点击。
- 词条展开状态留在独立词条组件中，避免展开一词重渲染整份列表；复习本筛选后每页最多 50 条，删除最后一页词条后回到有效页。页头只订阅到期数量，并定期刷新时间；复习本初次加载或添加词后立即刷新当前时间，避免新词 dueAt 晚于组件旧 now 而暂时漏算。
- 页面文案保持简洁：删除页脚致谢/归属、冗余副标题、重复辅助说明和悬停提示；保留字段标签、操作状态、错误与危险操作确认，以及必要的 `aria-label`。
- 保持响应式、可键盘操作和可访问名称。小屏隐藏按钮文字时补 `aria-label`；透明打字输入框字号不得小于 16px；页面布局变更需检查 390px 宽度没有横向溢出。
- 页头宽度使用 `100%` 跟随页面可用宽度；`100vw` 会在出现竖向滚动条时撑出页面，不能靠根节点裁剪掩盖溢出。
- 动效简短并遵守 `app/globals.css` 的 `prefers-reduced-motion`；按压反馈可用 `active:scale-[0.97]`，已有入场类为 `.anim-in-up` 和 `.anim-pop`。
- 需要跨出页头的移动端菜单必须使用 Radix `Portal`，且在 Portal 子树中再包与根布局一致的 `<Theme>`。页头有 `backdrop-blur`，裸的 fixed 子元素会受其包含块影响，Portal 则需要 Theme tokens。
- Themes CSS 在 UnoCSS 工具类之后可能覆盖组件自身属性。不要用工具类硬改 `.rt-*` 组件的 `position` 等内置属性，优先调整 DOM 包装结构。根主题全屏高度只应用到 `html .radix-themes[data-is-root-theme='true']`，不能撑大 Portal 弹层；需要视口裁剪的长 Select 使用 `position="popper"`。Dialog 长内容需限制高度并放进 `ScrollArea`。
- 不要给 Chromium 表格重新添加 sticky 表头：目前会与首行错位。练习页状态、输入和计时的边界见下节。

### 打字练习和语音

- 练习题面与输入区分区显示；英文例句用 `.serif-en`，中文提示独立成行，词性与释义分开对齐，避免把中文提示插进英文句子。字母格按完整单词分组换行，字号根据输入区宽度和最长单词缩放；透明输入层仍保持至少 16px 字号。

- `components/typing-area.tsx` 用单个透明、受控 `<input>` 同时接收桌面键盘和移动软键盘输入；通过新旧 value 的 diff 更新逐字母格子。不要加全局 `keydown` 监听，也不要用 `key` 强制重挂载打字区，否则会打断输入焦点。
- 处理输入先经过 `acceptInput()`：裁掉超出答案长度的字符，并吞掉当前答案位置不需要的空格，保证输入与格子逐位对应。首字母提示占据首格，用户照着整词输入时要由 `normalizeInput()` 去掉重复的提示首字母。
- 保持四种状态 `typing / complete / reveal / error`：正确字符绿色、错误字符红色并保留，退格可修正且已正确字符继续保持正确色；全对后约 420ms 自动推进，空格或 Enter 可立即推进。Tab 跳过并 `preventDefault`，但 Shift+Tab 应允许离开输入区。Esc 显示答案并按错题记。
- 音效由 `lib/sound.ts` 使用 Web Audio 合成，由 `Prefs.keySound` 控制；只在输入 diff 的事件路径触发一次，不要放入 state updater（Strict Mode 下可能重复执行）。启用练习朗读时，听写模式在题目出现时通过所选语音服务朗读，答对后排队朗读作答答案；普通默写和例句填空不能提前泄露答案。浏览器朗读由 `lib/browser-speech.ts` 使用 `speechSynthesis` 实现，等待首次 `voiceschanged` 并优先选本机英文音色；音色 ID 只在所属服务中匹配，切换服务后失配时自动选英文音色。云端与浏览器共享播放队列，播放结束后才出队；停止朗读要取消合成请求、音频、浏览器朗读和队列，旧请求或取消事件不能启动兜底或后续播放。兜底状态变化不能让同一道听写题重复自动朗读。
- `useSearchParams` 所在路由首屏显示 Suspense fallback 属预期行为。`next.config.mjs` 的 `trailingSlash: true` 生成 `out/<route>/index.html`；词库 fetch 使用 `/data/...` 绝对路径，部署到站点子路径时需要相应配置，不能直接双击 `out/index.html`。

## 测试与变更维护

- 纯逻辑放在可独立测试的 `lib/` 函数中；现有测试覆盖引擎、会话编解码、词条模型、统计、存储和备份。逻辑行为变更时补对应 `tests/*.test.ts`，使用 `node:test` 和 `node:assert`，不要为测试给生产代码加无必要的导出或钩子。
- `tests/tsconfig.json` 必须自行覆盖 `exclude`，不能继承主配置对 `tests` 的排除，否则只会编译 `lib` 并误跑 `.test-build/tests` 中的旧产物。
- 纯 UI 与路由靠浏览器检查；优先验证受影响路径和交互，不把浏览器手测伪装成自动化测试。
- 修改数据格式、持久化格式、URL 参数、判分推进语义或公开使用说明时，同时检查相关调用点、备份和文档。持久化格式只维护当前版本，不增加旧数据迁移路径。
- README 面向用户与新开发者，只保留安装、功能、数据及部署说明；本文件承载实现不变量和容易回归的边界。新坑应写成可复现条件与应采取的做法，避免堆叠不再适用的历史描述。
