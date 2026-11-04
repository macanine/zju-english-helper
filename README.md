<div align="center">

# 大英默写器 Pro

**ZJU 大英课程单词与短语练习工具**

纯前端 · 免账号 · 多端可用

</div>

<br>

| 一个词，三种练法 | 一个字母，都不放过 | 错过的，不会再错 |
| :---: | :---: | :---: |
| [![一个词，三种练法](./pics/01-three-modes.png)](./pics/01-three-modes.png) | [![一个字母，都不放过](./pics/02-every-letter.png)](./pics/02-every-letter.png) | [![错过的，不会再错](./pics/03-wrong-book.png)](./pics/03-wrong-book.png) |
| 默写 · 听写 · 例句填空 | 逐字母判分，错误即标红 | 错题自动收录并优先复习 |

支持网页版，以及基于同一份前端的 Windows、macOS、Linux 和 Android 安装包。

## 功能

### 练习

- **Book 1 / Book 2 / Book 3**：选择一个或多个单元，也可组合练习。
- **三种练习**：看释义默写、听发音默写、例句填空；例句按句中实际词形作答。
- **出题方式**：筛选单词或短语，顺序或随机出题；多义词可按释义出题，也可每词只出一题。

### 反馈与纠错

- **逐字母反馈**：正确字母标绿、错误字母标红，支持退格修正、首字母提示、显示答案和跳过。
- **复习本**：答错自动收录，也可手动添加、收藏和记录笔记；支持搜索与筛选。
- **间隔复习**：到期复习按 1、2、4、7、15、30 天安排；答错、看答案或使用提示后重新进入学习。
- **学习统计**：查看今日练习数、首次正确率、用时、连续练习天数和近期记录。

### 词库与语音

- **词库预习**：按词书和单元浏览释义、例句与完整词表，也可从当前范围开始练习。
- **语音与显示**：可选国内 Edge TTS、国际 Edge TTS 或浏览器语音；支持音色、语速、英释显示、例句显示、键盘音效和深色模式。
- **本地备份**：导出或导入复习本、学习记录和设置，方便迁移设备。

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

练习页和成绩页链接包含当前词书、单元、选项或本轮成绩，可直接分享。

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

构建产物位于 `out/`，可直接部署到站点根路径。路由文件为 `out/<route>/index.html`。

## 桌面版与 Android

GitHub Releases 提供 Windows、macOS、Linux 和 Android 安装包。桌面版与 Android 版复用网页前端，各自保存本地数据。

本地桌面调试与打包需要 Rust 工具链，参见 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)：

```bash
npm run desktop:dev    # 在桌面窗口运行开发版本
npm run desktop:build  # 构建当前平台安装包到 src-tauri/target/release/bundle/
```

Android 还需要 JDK 17+、Android SDK（平台 37、Build-Tools 37、NDK 29.0.13846066）和 Rust Android target：

```bash
npm run android:dev    # 在模拟器或连接的设备上运行
npm run android:build  # 构建 APK 到 src-tauri/gen/android/app/build/outputs/apk/
```

推送与 `package.json` 版本一致的 `v<版本>` 标签后，GitHub Actions 会构建安装包并创建草稿 Release。

## 数据与隐私

词库文件位于 `public/data/`，每本词书的单元由 `index.json` 列出。学习记录、复习计划和设置保存在本地；使用 Edge TTS 时，朗读文本会发送到所选服务。

Book 1 的词条、释义和例句整理自[大英默写器](https://eng.zjueva.net/)，按来源保留 8 个单元。

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

词性属于释义；没有词性时 `pos` 可为 `null`。例句挖空用 `[[...]]` 标记，标记中的单词形式就是答案。新增词书时同步更新 `public/data/index.json` 中的单元列表和显示名。

## 项目结构

```text
app/                 Next.js 路由、根布局与全局样式
components/          客户端页面视图与交互组件
lib/                 词库、会话、引擎、本地存储、统计和备份
pics/                README 展示用海报
public/data/         运行时词库 JSON
scripts/             词库校验工具
src-tauri/           Tauri 2 桌面与 Android 壳、打包配置
tests/               node:test 单元测试
.github/workflows/   CI 与 Release 流水线
```

面向仓库编码代理的架构说明与实现约定见 [`AGENTS.md`](./AGENTS.md)。
