# 砚白 · Inkstone

<p align="center">
  <img src="docs/mockup.svg" width="280" alt="砚白 Inkstone 手机界面示意"/>
</p>

## 📱 界面预览

| 书架 | 阅读内页 |
|------|----------|
| ![书架](docs/screen-shelf.png) | ![阅读内页](docs/screen-reader.png) |
| ![AI 助手面板](docs/screen-ai.png) | ![选中即问 / AI 解释](docs/screen-select.png) |
| 分组书架（按 AI 类型） | 阅读统计与打卡 |
| ![分组书架](docs/screenshots/03-shelf-grouped.png) | ![阅读统计](docs/screenshots/06-stats-day.png) |

<p align="center">
  <a href="https://github.com/rayyang-dev/ink-reader/releases"><img src="https://img.shields.io/badge/APK-下载-brightgreen" alt="APK"/></a>
  <img src="https://img.shields.io/badge/platform-Android%20%2F%20PWA-blue" alt="platform"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license"/>
  <img src="https://img.shields.io/badge/format-EPUB%20%7C%20PDF%20%7C%20TXT%20%7C%20MOBI-orange" alt="format"/>
</p>

**砚白（Inkstone）** 是一款面向「墨水屏阅读器 / 手机 / 平板」的本地优先电子书阅读应用。
它吸收了 KOReader、Moon+、Kindle、reMarkable、Neo Reader 的优点，解决传统方案的三大痛点：

- 排版与自定义差 → 提供克制的排版引擎与可调字体 / 边距 / 行距
- 翻页卡顿、残影严重 → **分页式阅读 + 翻页零动画 + 整屏反相刷新（Regal）**，贴合墨水屏特性
- 导入麻烦、广告多 → 纯本地、无广告、**App 内直接解析 MOBI**（无需 Calibre）

> 设计原则：**本地优先、零追踪、离线可用**。书籍与进度只存在你自己的设备上。

---

## ✨ 特性

- 📚 **多格式导入**：EPUB / PDF / TXT / MOBI，App 内原生解析，MOBI 无需借助 Calibre
- 📖 **分页式阅读**：非滚动，按屏幕真实分页，接近纸质书体验
- ⚡ **墨水屏友好**：翻页零动画、即时整屏刷新，规避残影与拖影
- 🔤 **中英互译**：划词即译，可选 Mock / DeepL / Google / 兼容 OpenAI 的 LLM 后端，密钥仅存本地，默认关闭
- 🤖 **AI 助手（本地优先）**：同一套 Key/模型即可解锁「全书/本章导读、选中即问、书中问答、人物脉络笔记、智能书架标签、段落双语对照」；结果缓存到本机，默认关闭、按需联网
- 📱 **响应式 + PWA**：同一套界面适配手机 / 平板；可「添加到主屏幕」离线使用
- 💾 **本地存储**：书籍内容存 IndexedDB，设置 / 进度 / 书签 / 统计存 localStorage（均带内存兜底）
- 📊 **阅读统计与打卡**：按日 / 周 / 月统计读了哪些书、各花多少时间；当日累计达「打卡阈值」（默认 10 分钟，可设置）自动打卡
- 🗂 **书架自动整理**：开启「书架按 AI 类型分组」后，书架空按 AI 标签归类，配合顶部标签筛选条快速找书
- 🤖 **Android 原生壳**：基于 Capacitor，打包为 `com.inkstone.reader`（应用名「砚白」）

---

## 🤖 AI 助手（本地优先）

砚白的 AI 不是另一个聊天机器人，而是**贴合阅读场景的伴读能力**。它在「阅读设置 → AI 引擎」里复用你自己的 Key 与模型（兼容任意 OpenAI 接口：OpenAI / DeepSeek / 通义 / 本地 Ollama），**密钥只存本机，本应用没有服务器**，默认完全关闭、仅在你需要时联网。

阅读页底部「AI」按钮打开 AI 助手面板，含四个标签页：

| 能力 | 说明 |
|------|------|
| **导读**（T1） | 一键生成「内容概要 + 阅读导读」，可生成全书或当前章节；结果缓存到本书，离线也能再看 |
| **问答**（T1） | 就本书提问，基于**轻量 RAG**（按关键词检索最相关段落再作答），只引用书中内容 |
| **笔记**（T2） | 抽取人物/实体关系、关键脉络时间线、核心要点，生成结构化阅读笔记 |
| **双语**（T2） | 把当前页拆成段落，逐段中英对照（依赖翻译方向设置） |

此外：

- **选中即问**：阅读时选中任意文字，浮出「译 / AI 解释」工具条——「AI 解释」会结合全书上下文解释术语、典故或难句。
- **智能书架**：在书架可一键「AI 归类」，自动给书打主题/题材/难度/情绪标签；书架顶部出现标签筛选条，按标签快速找书。
- **自动导读**（可选开关）：导入新书且已配置 AI 时，后台静默生成导读并缓存，打开即看。

> 隐私与设计原则：**本地优先、零追踪**。AI 功能默认关闭；启用后也只有当你主动触发（生成/提问/解释/翻译）才会向你所填的接口地址发请求，书籍与结果始终只存你自己的设备。

---

## 📊 阅读统计 · 打卡 · 自动整理书架

砚白把「读得多认真」也留在本地（同样只存本机、不联网）：

- **阅读统计**：阅读页底部「统计」按钮打开统计面板，按 **日 / 周 / 月** 切换，展示总时长、阅读书目数、打卡状态，以及每本书的阅读分钟数明细。
- **自动打卡**：在阅读页停留即累计时长；**切到后台或打开任意面板时自动暂停**，避免虚高。当日累计达到「打卡阈值」即自动打卡并弹出轻提示。打卡阈值默认 10 分钟，可在 **阅读设置 → 阅读与书架** 调整（1–60 分钟）。
- **书架自动整理**：在 **阅读设置 → 阅读与书架** 开启「书架按 AI 类型分组」后，书架空按每本书的 AI 标签归类，未分类的归入「未分类」；书架顶部的标签筛选条可一键按标签过滤。

> 计时与打卡数据仅存于本机 localStorage，不上传、不联网。AI 归类（标签来源）默认关闭、按需使用，不影响离线阅读。

---

## 📦 安装

### Android APK（推荐）

前往 **[Releases](https://github.com/rayyang-dev/ink-reader/releases)** 下载 `app-release.apk`（已签名发布版，推荐）或 `app-debug.apk`（调试版），
在手机上允许「未知来源」安装即可。无需登录、无后台联网。

### Web / PWA

直接用浏览器打开托管地址，或本地启动静态服务：

```bash
# 在本仓库 www/ 目录下起一个静态服务器即可
npx serve www
```

在手机浏览器中「添加到主屏幕」，即可获得类原生体验。

---

## 🛠 从源码构建（Android）

环境要求：**JDK 21+**（Capacitor 8 原生模块需 Java 21 编译）、**Android SDK（platform 36 + build-tools 36.0.0）**、Node 22+。

```bash
# 1. 安装依赖
npm install

# 2. 同步 Web 资源到原生工程
npx cap sync android

# 3. 构建 Debug 包
cd android
./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk

# 4. 构建签名 Release 包（需自行提供 keystore，见下）
./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

> 若 `JAVA_HOME` 指向了旧 JDK，请先修正，例如：
> `export JAVA_HOME="C:/Android/jdk-21.0.13+9"`
> 安装 SDK 平台：`sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"`

### Release 签名

Release 包需要签名。本项目在 `android/app/build.gradle` 中读取 `android/local.properties` 的签名配置（该文件已被 `.gitignore` 忽略，不会进仓库）。在 `local.properties` 末尾追加：

```properties
keystore.path=C:/path/to/your-release-key.jks
keystore.alias=inkreader
keystore.password=你的密钥库密码
keystore.keyPassword=你的密钥密码
```

没有 keystore？用 JDK 的 `keytool` 生成（妥善保管，丢失将无法更新同一签名的包）：

```bash
keytool -genkeypair -v -keystore release-key.jks -alias inkreader \
  -keyalg RSA -keysize 2048 -validity 10000
```

---

## 🌐 AI 引擎配置（翻译 / 摘要 / 问答 / 标签 / 笔记 共用）

默认关闭，且不影响离线阅读。在阅读页**选中一段文字**会浮出「译 / AI 解释」工具条；点「AI」按钮可打开 AI 助手面板。

设置项（存于 localStorage，不上传）：

| 配置 | 说明 |
|------|------|
| AI 引擎 | none / mock / DeepL / Google / LLM（AI 大模型） |
| API Key | 仅本地保存，默认空 |
| LLM Base | 兼容 OpenAI 的 `/v1` 地址，默认 `https://api.openai.com/v1` |
| LLM Model | 如 `gpt-4o-mini` |
| 方向 | 自动 / 中→英 / 英→中 |
| 导入后自动生成导读 | 开关，开启后导入新书自动后台生成导读 |

`mock` 后端离线返回占位译文，可用于体验流程；真实翻译与 AI 能力请填入对应后端 Key（选「AI 大模型」即同时解锁摘要/问答/笔记/标签/双语）。

---

## 🧱 技术栈

- 前端：原生 ES Modules（无打包构建）、IndexedDB、Service Worker（PWA）
- 解析：[fflate](https://github.com/101arrowz/fflate)（EPUB）、[pdf.js v4](https://github.com/mozilla/pdf.js)（PDF）、自研 MOBI 解析器
- 原生壳：Capacitor 8（Android）
- 测试：Node 原生 `node:test` + Playwright；含「设置 / 统计打卡 / 日周月聚合 / 书架元数据」全功能自测、真实浏览器冒烟（断言新控件已接入 DOM 并全页面截图）、解析 / 翻译 / 端到端共 20+ 用例，全部通过

---

## 📁 项目结构

```
ink-reader/
├── www/                  # Web 应用（PWA 入口，也是 Capacitor 的 webDir）
│   ├── index.html
│   ├── css/style.css
│   └── js/               # app / store / translate / mobidec 等模块
├── android/              # Capacitor 生成的 Android 原生工程
├── docs/mockup.svg       # 界面示意图
├── tests/                # 解析与翻译的单元 / 端到端测试
├── capacitor.config.json
└── README.md
```

---

## ✅ 测试

```bash
node tests/features.test.mjs        # 全功能自测：设置 / 阅读统计打卡 / 日周月聚合 / 书架元数据（29 断言全过）
node tests/capture-screenshots.mjs  # 真实浏览器（Playwright）冒烟：断言新控件已接入 DOM + 全页面截图（20 断言全过）
node --test tests/                  # EPUB / PDF / MOBI 管线、翻译后端路由、端到端流程
```

`features.test.mjs` 覆盖本次新增功能的纯逻辑层（打卡阈值触发、日/周/月聚合边界、设置读写、书架 AI 标签元数据）；
`capture-screenshots.mjs` 用 Playwright 真实加载应用，断言空书架 / 平铺书架 / 分组书架 / 阅读器 / 设置 / AI 面板 / 统计面板 的新控件确实接在 DOM 上，并产出各页面截图。
其余用例覆盖 EPUB 管线、PDF 管线、MOBI 模块（含中文 124 章 / 英文 33 章解析）、翻译后端路由，以及「MOBI 解析 → 取章 → 翻译」的端到端流程，全部通过。

---

## 📜 许可证

[MIT](LICENSE) —— 自由使用、修改与分发。
