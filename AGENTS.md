# AGENTS.md

本文件是仓库内 AI 编码代理的工作约定。面向使用者的介绍见 `README.md`；若两份文档重复，以本文件中的工程约定为准。修改前先确认当前实现与这里的说明一致，发现过期处时一并修正。

## 项目边界

- 项目是「大英默写器 Pro」的纯前端 Web 应用：Next.js 15 App Router、React 19、TypeScript，静态导出到 `out/`。没有应用后端、登录或云端用户数据。
- 运行时词库来自 `public/data/` 的 JSON；用户数据保存在浏览器 `localStorage`。原 PyQt6 桌面版不属于当前产品，不要恢复桌面程序、Python 运行时或 exe 发布逻辑。
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
```

按改动范围验证：词库改动跑 `npm run check:data`；纯逻辑改动跑相关单测或 `npm test`；应用、路由或配置改动跑类型检查和构建，并在浏览器检查受影响页面。UI 改动还要检查窄屏布局（390px）和键盘可用性。不要为纯文档改动启动应用或运行构建。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| `app/` | 路由薄壳、根布局、全局 CSS；布局统一渲染页头和根 `<Theme>` |
| `components/` | 客户端页面视图与可复用 UI；页面主体放在 `*-view.tsx` |
| `lib/data.ts` | 加载 `public/data/index.json` 与单元 JSON；失败不缓存，允许重试 |
| `lib/model.ts` | 词库类型、练习卡片、多义词出题、例句空缺提取 |
| `lib/session.ts` | 会话与结果的 URL 查询串编解码 |
| `lib/engine.ts` | 练习牌组、判分、错题/掌握状态和统计；模块级单例 |
| `lib/storage.ts` | 用户数据类型、默认值、旧格式兼容与 `localStorage` 读写 |
| `lib/stats.ts` | 日期、连续练习天数和每日统计的纯函数 |
| `lib/hooks.ts` | React 组件读取词库、设置、偏好、引擎和统计的订阅入口 |
| `lib/backup.ts` | 用户数据 JSON 备份导入与导出 |
| `public/data/` | 随仓库维护的 v3 词库 JSON，唯一运行时词库来源 |
| `scripts/` | 词库校验、历史格式迁移和人工例句拆分工具 |
| `archive/` | v2/v3 历史 JSON 快照；不参与运行时和常规构建 |
| `tests/` | `node:test` 纯逻辑测试；不引入测试框架依赖 |

路由由 `app/` 中的页面文件映射：`/` 首页、`/browse` 预习、`/practice` 练习、`/result` 成绩、`/wrong-words` 错题本、`/settings` 设置、`/help` 帮助。页面文件尽量只处理 metadata、加载边界和 Suspense；页面交互放在对应视图组件。使用 `useSearchParams` 的 `/browse`、`/practice`、`/result` 页面必须在页面层套 `<Suspense>`，静态导出依赖这个边界。

## 关键数据流与不变量

### 页面、会话与引擎

- URL 是练习会话参数的来源。`SessionOptions` 定义在 `lib/storage.ts`，编码和解码在 `lib/session.ts`；新增或更改练习选项时要同步更新默认值、校验、URL 编解码、设置 UI 和测试。默认值不写进 URL。
- `/practice` 查询串包含词书、单元和练习选项；`/result` 查询串还包含本轮结果。URL 不包含逐题输入或当前进度：整页刷新会按 URL 参数重新开局；应用内前进/后退回到同一会话时，`engine.isActive(query)` 会让仍有余题的牌组续做。
- `getEngine()` 创建的单例会读 `localStorage`。只从挂载后可用的 `useEngine()` 或用户事件访问；不要在组件渲染期、模块顶层或服务端读取引擎。
- 组件取设置、偏好和统计走 `lib/hooks.ts`。新增引擎订阅 hook 时复用内部 `useEngineValue(read, fallback)`，其中 `read` 必须是模块级稳定函数。
- `engine.checkAnswer()` 无论答对或答错都会推进。首次全程无错才计首次正确；打字中任何错误即使之后修正、或按 Esc 看答案，都会记入错题本。跳过通过 `skipWithoutPenalty()`，不记学习统计；如果该词已在错题本中则会移除。
- 错题本、已掌握和单词统计按 `card.english`（单词）记录，而不是按释义记录。一个单词的多个释义通过 `SenseCard.senses` 展示。视图使用 `engine.stats()` 展示本轮数据，不另算一套。
- 复习开始时按错误次数由多到少、最近答错时间由久到近排序，并清空当前错题队列；复习中答错的词会重新进入错题本。复习强制单词默写和首字母提示。标记已掌握会从练习/复习中排除，取消掌握会将该词放回错题本。

### 本地数据和备份

- 已有存储键是兼容契约，不要改名：`zjueh.wrong-words`、`zjueh.mastered`、`zjueh.settings`、`zjueh.prefs`、`zjueh.word-stats`、`zjueh.day-stats`、`zjueh.theme`。改名会让既有用户数据无法按原键读取。
- 新增持久化数据时，在 `lib/storage.ts` 加载/保存函数、默认值与必要的旧数据兼容，并将键加入 `lib/backup.ts` 的 `BACKUP_KEYS`。不要把主题键误认为新增的业务设置；它由主题切换组件直接读写。
- 浏览器 API 只能在 effect、事件处理器或有 `typeof window` 守卫的客户端路径使用，避免静态预渲染和水合错误。`localStorage` 写入失败需要保持功能可降级。
- `autoSpeak` 是旧偏好兼容字段，不是当前设置 UI 或练习前自动朗读开关。只有听写题会在题目出现时自动朗读；答对后各模式都会朗读答案。

### 词库与例句

- v3 词条结构：`{ english, senses: [{ pos, zh, en, examples }] }`。词性属于释义，允许为 `null`；同一词的多个用法合并进 `senses`。中文和英文释义分开保存，例句也属于各自释义。
- 修改或新增数据直接编辑 `public/data/`，运行 `npm run check:data`。该命令检查清单与文件对应关系、必需字段、重复词头、词性格式及零宽空格/NBSP。运行时不替数据做兜底清洗。
- 新词书需添加数据目录和单元 JSON、更新 `public/data/index.json`，并按需在 `lib/data.ts` 的 `BOOK_NAME_MAP` 配显示名。界面通过清单读取词书和单元，不要在视图中硬编码单元列表。
- 例句空缺用 `[[...]]` 标记；方括号内的拼写就是作答形式，可为语法所需的变形。一个句子多个不同空缺按顺序以空格连接作答；多个相同空缺只输入一次。例句练习按释义出题，没有可用空缺的卡片会自动跳过；若所选牌组都没有可用例句，显示无可用例句状态。
- `buildCards(words, merge)` 的 `sense` 为每条释义各出一题，`first` 为每词一题并提示首条释义，`all` 为每词一题并列出全部释义。例句模式固定使用 `sense`，不要改变题目与释义配对关系。
- `scripts/convert-v2.mjs`、`scripts/convert-v3.mjs` 和 `scripts/apply-example-split.mjs` 是历史迁移工具，会重写 `public/data/` 或创建归档快照，不属于日常数据编辑流程。执行前先阅读脚本、确认输入与备份；不要为了普通词条修订运行它们。历史 CSV 和从 CSV 重建 v1 词库的脚本已移除；`archive/v2-json/`、`archive/v3-json/` 仅保留格式迁移快照。

## UI 与浏览器约定

- 基础组件优先使用 `@radix-ui/themes`（如 Button、Card、Dialog、Flex、Grid、TextField、Switch、Progress、Badge、AlertDialog）。图标使用 `lucide-react`。Themes 没有的简单空态用 Themes 布局组件组合；危险操作用 `AlertDialog`。
- UnoCSS 只负责布局、间距、网格、定位与响应式，不替代组件库。颜色用 Radix Themes CSS 变量和 `<Theme>` props；不要写 `dark:` 变体，暗色由根 `<html>` 的 `.dark` 类和 `appearance="inherit"` 驱动。
- 交互文案用中文，遵循已有视觉语言。设置、帮助、错题本页头复用只有标题的 `components/section-card.tsx`。首页单元选择是整格按钮网格；错题行内操作保留带文字的按钮。
- 页面文案保持简洁：删除页脚致谢/归属、冗余副标题、重复辅助说明和悬停提示；保留字段标签、操作状态、错误与危险操作确认，以及必要的 `aria-label`。
- 保持响应式、可键盘操作和可访问名称。小屏隐藏按钮文字时补 `aria-label`；透明打字输入框字号不得小于 16px；页面布局变更需检查 390px 宽度没有横向溢出。
- 动效简短并遵守 `app/globals.css` 的 `prefers-reduced-motion`；按压反馈可用 `active:scale-[0.97]`，已有入场类为 `.anim-in-up` 和 `.anim-pop`。
- 需要跨出页头的移动端菜单必须使用 Radix `Portal`，且在 Portal 子树中再包与根布局一致的 `<Theme>`。页头有 `backdrop-blur`，裸的 fixed 子元素会受其包含块影响，Portal 则需要 Theme tokens。
- Themes CSS 在 UnoCSS 工具类之后可能覆盖组件自身属性。不要用工具类硬改 `.rt-*` 组件的 `position` 等内置属性，优先调整 DOM 包装结构。根主题全屏高度只应用到 `html .radix-themes[data-is-root-theme='true']`，不能撑大 Portal 弹层；需要视口裁剪的长 Select 使用 `position="popper"`。Dialog 长内容需限制高度并放进 `ScrollArea`。
- 不要给 Chromium 表格重新添加 sticky 表头：目前会与首行错位。练习页状态、输入和计时的边界见下节。

### 打字练习和语音

- `components/typing-area.tsx` 用单个透明、受控 `<input>` 同时接收桌面键盘和移动软键盘输入；通过新旧 value 的 diff 更新逐字母格子。不要加全局 `keydown` 监听，也不要用 `key` 强制重挂载打字区，否则会打断输入焦点。
- 处理输入先经过 `acceptInput()`：裁掉超出答案长度的字符，并吞掉当前答案位置不需要的空格，保证输入与格子逐位对应。首字母提示占据首格，用户照着整词输入时要由 `normalizeInput()` 去掉重复的提示首字母。
- 保持四种状态 `typing / complete / reveal / error`：正确字符绿色、错误字符红色并保留，退格可修正且已正确字符继续保持正确色；全对后约 420ms 自动推进，空格或 Enter 可立即推进。Tab 跳过并 `preventDefault`，但 Shift+Tab 应允许离开输入区。Esc 显示答案并按错题记。
- 音效由 `lib/sound.ts` 使用 Web Audio 合成，只在输入 diff 的事件路径触发一次，不要放入 state updater（Strict Mode 下可能重复执行）。听写模式在题目出现时朗读；普通默写和例句填空不能提前泄露答案。答对后排队朗读作答答案。
- `useSearchParams` 所在路由首屏显示 Suspense fallback 属预期行为。`next.config.mjs` 的 `trailingSlash: true` 生成 `out/<route>/index.html`；词库 fetch 使用 `/data/...` 绝对路径，部署到站点子路径时需要相应配置，不能直接双击 `out/index.html`。

## 测试与变更维护

- 纯逻辑放在可独立测试的 `lib/` 函数中；现有测试覆盖引擎、会话编解码、词条模型、统计、存储和备份。逻辑行为变更时补对应 `tests/*.test.ts`，使用 `node:test` 和 `node:assert`，不要为测试给生产代码加无必要的导出或钩子。
- 纯 UI 与路由靠浏览器检查；优先验证受影响路径和交互，不把浏览器手测伪装成自动化测试。
- 修改数据格式、持久化格式、URL 参数、判分推进语义或公开使用说明时，同时检查相关调用点、兼容路径、备份和文档。
- README 面向用户与新开发者，只保留安装、功能、数据及部署说明；本文件承载实现不变量和容易回归的边界。新坑应写成可复现条件与应采取的做法，避免堆叠不再适用的历史描述。
