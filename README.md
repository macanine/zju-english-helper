<div align="center">

# 大英默写器 Pro

**面向 ZJU 大英课程的单词、短语练习工具**

纯前端 · 免账号 · 无后端 · 数据只留在你的浏览器

</div>

<br>

| 一个词，三种练法 | 一个字母，都不放过 | 错过的，不会再错 |
| :---: | :---: | :---: |
| [![一个词，三种练法](./pics/01-three-modes.png)](./pics/01-three-modes.png) | [![一个字母，都不放过](./pics/02-every-letter.png)](./pics/02-every-letter.png) | [![错过的，不会再错](./pics/03-wrong-book.png)](./pics/03-wrong-book.png) |
| 默写 · 听写 · 例句填空 | 逐字母判分，错误即标红 | 错题自动收录并优先复习 |

应用以 Next.js 静态导出，无需账号或后端；词库随项目提供，错题本、学习记录和设置保存在当前浏览器。

## 功能

### 练习

- **大英三 / 大英四**：选择一个或多个单元，也可组合练习。
- **三种练习**：看释义默写、听发音默写、例句填空。例句题按句中实际形式作答，例如过去式或复数形式。
- **筛选与排序**：练全部内容、仅单词或仅短语；顺序或随机出题。
- **多义词选项**：默认每个释义各出一道题；也可以让每个单词只出一道题，并选择提示首条释义或全部释义。例句填空仍按释义出题。

### 反馈与纠错

- **逐字母反馈**：正确字母标绿、错误字母标红；可退格修正。作答过程中打错后再改正的词仍会记入错题本。支持首字母提示、显示答案和跳过；键盘音效默认开启，可在设置中关闭。
- **复习本**：答错自动收录，也可从词库手动添加重点、收藏并记录笔记。收藏与复习计划独立；支持搜索、来源和状态筛选，每页最多 50 词。
- **间隔复习**：每轮最多 20 个到期词，无提示首次答对后依次安排 1、2、4、7、15、30 天，最后通过成为已稳固。已有词打错、看答案或使用提示后 10 分钟重学；跳过不删除，提前练习成功不延期。已稳固默认排除常规练习，可开启「包含已稳固词」。
- **学习统计**：查看今日练习数、首次正确率、用时、连续练习天数和近期记录。

### 词库与语音

- **词库预习**：按词书和单元浏览词条；查看词性、中文与英文释义、例句，点击单词朗读，也可从当前范围直接开始练习。
- **语音与显示偏好**：可选择国内 Edge TTS、国际 Edge TTS 或本地浏览器朗读，国内节点默认启用；云端检查、合成或播放失败时自动使用浏览器语音。支持选择英文音色和语速，浏览器音色和离线能力取决于设备与浏览器。设置中的「练习」可分别开关语音朗读和键盘音效。关闭练习朗读时，听写题改为显示释义提示，词库朗读和设置页试听仍可使用。分别设置英文解释和例句的显示方式；支持深色模式。
- **本地备份**：导出或导入错题本、已掌握词、学习记录和偏好，方便迁移设备。

## 页面

| 地址 | 内容 |
| --- | --- |
| `/` | 今日概览，选择词书、单元与练习选项 |
| `/browse` | 预习和筛选词库 |
| `/practice` | 当前练习 |
| `/result` | 本轮成绩 |
| `/wrong-words` | 复习本：今日、全部、收藏 |
| `/settings` | 语音、显示、键盘音效和数据备份 |
| `/help` | 应用内帮助 |

练习链接会带上词书、单元和选项，可分享相同的练习配置。成绩页链接也包含本轮成绩。逐题输入和当前进度只保存在应用运行期间的内存里；整页刷新会依据链接参数重新开始本轮。

## 本地运行

需要 Node.js 和 npm。

```bash
npm install
npm run dev       # http://localhost:3300
```

## 检查与构建

```bash
npm run typecheck  # TypeScript 类型检查
npm run check:data # 词库数据检查
npm test           # 词库检查 + node:test 单元测试
npm run build      # 静态导出到 out/
npm run start      # 本地托管 out/，先运行 build
```

构建产物中的路由结构为 `out/<route>/index.html`。部署到提供静态文件的 Web 服务器即可。

当前词库通过 `/data/...` 绝对路径加载，因此站点应部署在域名根路径；部署到子路径时需要同时适配 Next.js 路由、静态资源和词库 fetch 路径。不要直接双击 `out/index.html`，浏览器的 `file://` 协议无法按应用使用的方式加载 JSON。

## 桌面版与 Android

GitHub Releases 提供安装包：Windows（`.exe` / `.msi`）、macOS（`.dmg`，Apple 芯片选 `aarch64`，Intel 选 `x64`）、Linux（`.deb` / `.rpm` / `.AppImage`）、Android（`.apk` 通用包，含 arm64 / armv7 / x86_64 / x86）。桌面版与 Android 版和网页版是同一份应用，数据保存在应用自己的本地存储中，与浏览器互不影响。

Android 安装时需允许安装未知来源应用。仓库未配置 Android 发布密钥时，APK 使用调试签名，仅适合自行测试；正式分发前应配置 `ANDROID_KEY_*` secrets（见 `AGENTS.md`），并使用配置后的签名重新安装。

安装包未经代码签名：macOS 首次打开如提示无法验证，请在「系统设置 → 隐私与安全性」中允许打开，或右键选择「打开」；Windows 出现 SmartScreen 提示时选择「仍要运行」。

本地桌面调试或自行打包需要 Rust 工具链（见 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)）：

```bash
npm run desktop:dev    # 在桌面窗口运行开发版本
npm run desktop:build  # 构建当前平台安装包到 src-tauri/target/release/bundle/
```

Android 本地构建还需要 JDK 17+（`JAVA_HOME`）、Android SDK（`ANDROID_HOME`，平台 37、Build-Tools 37、NDK 29.0.13846066）和 4 个 Rust Android target：

```bash
npm run android:dev    # 在模拟器或连接的设备上运行
npm run android:build  # 构建 APK 到 src-tauri/gen/android/app/build/outputs/apk/
```

发布：确认 `package.json` 版本与 `v<版本>` 标签一致后推送标签，CI 会构建各平台安装包与 Android APK 并创建草稿 Release，确认后手动发布。

## 数据与隐私

词库文件位于 `public/data/`，每本词书的单元由 `index.json` 列出。错题本、学习记录和设置使用浏览器 `localStorage`；选择云端朗读时，文本会按需发送到所选 Edge TTS 服务。本地浏览器朗读及自动兜底使用浏览器语音接口，优先选择系统本机英文音色；部分浏览器音色仍可能需要联网。

上一版完整错题与已掌握记录会平滑升级为复习本，学习统计和偏好保留；先保存原数据快照，再写新本。可在「设置 → 数据」下载升级前备份。当前备份为 v3，同时接受上一版 v2 备份；更早或损坏结构仍严格拒绝。更换设备前请导出备份。

## 维护词库

日常维护词库时直接编辑 `public/data/` 下的 JSON，并运行 `npm run check:data`。

```json
[
  {
    "english": "example",
    "senses": [
      {
        "pos": "n.",
        "zh": "例子",
        "en": "a thing characteristic of its kind",
        "examples": ["This is an [[example]]."]
      }
    ]
  }
]
```

词性属于释义；没有词性时 `pos` 可为 `null`。例句挖空用 `[[...]]` 标记，标记中的单词形式就是答案。新增词书时还要更新 `public/data/index.json`；词书显示名记录在 `public/data/index.json`。

## 项目结构

```text
app/                 Next.js 路由、根布局与全局样式
components/          客户端页面视图与交互组件
lib/                 词库、会话、引擎、本地存储、统计和备份
pics/                README 展示用海报
public/data/         运行时词库 JSON
scripts/             词库校验工具
src-tauri/           Tauri 2 桌面壳与打包配置
tests/               node:test 单元测试
.github/workflows/   CI 与 Release 流水线
```

面向仓库编码代理的架构说明与实现约定见 [`AGENTS.md`](./AGENTS.md)。
