# 砚白 · Inkstone

<p align="center">
  <img src="docs/mockup.svg" width="280" alt="砚白 Inkstone 手机界面示意"/>
</p>

## 📱 界面预览

| 书架（底部导航） | 阅读内页（墨水屏分页） |
|------|----------|
| ![书架](docs/screenshots/02-shelf-flat.png) | ![阅读内页](docs/screenshots/03-reader.png) |
| 阅读统计（独立页面） | 设置 · 主题皮肤 |
| ![阅读统计](docs/screenshots/06-stats-day.png) | ![设置·皮肤](docs/screenshots/04-settings.png) |
| 分组书架（AI 类型） | 设置 · AI 引擎 / 打卡 |
| ![分组书架](docs/screenshots/03-shelf-grouped.png) | ![设置·AI](docs/screenshots/04b-settings-ai.png) |

<p align="center">
  <a href="https://github.com/rayyang-dev/ink-reader/releases"><img src="https://img.shields.io/badge/APK-下载-brightgreen" alt="APK"/></a>
  <img src="https://img.shields.io/badge/platform-Android%20%2F%20PWA-blue" alt="platform"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license"/>
  <img src="https://img.shields.io/badge/format-EPUB%20%7C%20PDF%20%7C%20TXT%20%7C%20MOBI%20%7C%20FB2%20%7C%20HTML%20%7C%20DOCX-orange" alt="format"/>
</p>

**砚白（Inkstone）** 是一款面向「墨水屏阅读器 / 手机 / 平板」的本地优先电子书阅读应用。
它吸收了 KOReader、Moon+、Kindle、reMarkable、Neo Reader 的优点，解决传统方案的三大痛点：

- 排版与自定义差 → 提供克制的排版引擎与可调字体 / 边距 / 行距
- 翻页卡顿、残影严重 → **分页式阅读 + 翻页零动画 + 整屏反相刷新（Regal）**，贴合墨水屏特性
- 导入麻烦、广告多 → 纯本地、无广告、**App 内直接解析 MOBI**（无需 Calibre）

> 设计原则：**本地优先、零追踪、离线可用**。书籍与进度只存在你自己的设备上。

---

## ✨ 特性

- 📚 **多格式导入**：EPUB / PDF / TXT / MOBI / FB2 / HTML / DOCX，App 内原生解析，MOBI 无需借助 Calibre（AZW3/KFX 仍建议用 Calibre 转 EPUB）
- 📖 **分页式阅读**：非滚动，按屏幕真实分页，接近纸质书体验
- ⚡ **墨水屏友好**：默认翻页零动画、即时整屏刷新（Regal）规避残影；可在设置开启「翻书页动画」，手机端像翻书一样过渡
- 🎨 **8 款主题皮肤**：墨白 / 宣纸 / 茶色 / 青简 / 黛蓝 / 墨韵 / 素白 / 夜墨，设置页一点即换，其中「墨韵」为墨瓶·水墨晕染风格
- 🧭 **底部导航 + 独立页面**：书架 / 统计 / 设置 三页通过底部导航栏切换；**阅读统计与设置均为独立页面**（不再内嵌在阅读器里），设置页内置皮肤切换
- 🔤 **中英互译**：划词即译，可用 DeepSeek / 通义 / 本地 Ollama 等任意 OpenAI 兼容模型（详见下方「AI 引擎配置」），密钥仅存本地，默认关闭
- 🤖 **AI 助手（本地优先）**：同一套 Key/模型即可解锁「全书/本章导读、选中即问、书中问答、人物脉络笔记、智能书架标签、段落双语对照」；结果缓存到本机，默认关闭、按需联网
- 📱 **响应式 + PWA**：同一套界面适配手机 / 平板；可「添加到主屏幕」离线使用
- 💾 **本地存储**：书籍内容存 IndexedDB，设置 / 进度 / 书签 / 统计存 localStorage（均带内存兜底）
- 📊 **阅读统计与打卡**：按日 / 周 / 月统计读了哪些书、各花多少时间；当日累计达「打卡阈值」（默认 10 分钟，可设置）自动打卡
- 🗂 **书架自动整理**：开启「书架按 AI 类型分组」后，书架空按 AI 标签归类，配合顶部标签筛选条快速找书
- 🤖 **Android 原生壳**：基于 Capacitor，包名 `com.rayyang.inkstone`（应用名「砚白」，英文名 **Inkstone**）

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

- **阅读统计**：底部导航的「统计」进入独立统计页，按 **日 / 周 / 月** 切换，展示总时长、阅读书目数、打卡状态，以及每本书的阅读分钟数明细。
- **自动打卡**：在阅读页停留即累计时长；**切到后台或打开任意面板时自动暂停**，避免虚高。当日累计达到「打卡阈值」即自动打卡并弹出轻提示。打卡阈值默认 10 分钟，可在 **设置 → 阅读与书架** 调整（1–60 分钟）。
- **书架自动整理**：在 **设置 → 阅读与书架** 开启「书架按 AI 类型分组」后，书架空按每本书的 AI 标签归类，未分类的归入「未分类」；书架顶部的标签筛选条可一键按标签过滤。

> 计时与打卡数据仅存于本机 localStorage，不上传、不联网。AI 归类（标签来源）默认关闭、按需使用，不影响离线阅读。

---

## 📸 功能一览（截图 + 说明）

### 📚 多格式导入与书架
![书架（平铺）](docs/screenshots/02-shelf-flat.png)
本地优先的书架：支持 EPUB / PDF / TXT / MOBI / FB2 / HTML / DOCX 一键导入（MOBI 在 App 内原生解析，无需 Calibre；AZW3/KFX 仍建议用 Calibre 转 EPUB），顶部按 AI 标签快速筛选；底部导航栏在书架 / 统计 / 设置 间切换；空书架有友好引导。

### 📖 分页式阅读（墨水屏优化）
![阅读内页](docs/screenshots/03-reader.png)
按屏幕真实尺寸分页（非滚动）。**默认翻页零动画、整屏反相刷新（Regal）** 规避残影；可在 **设置 → 屏幕与翻页** 开启「翻页动画」，前后翻页以翻书页的方式 3D 过渡。可调字体 / 边距 / 行距 / 段距 / 字间距、两端对齐与首行缩进。

### 🎨 主题皮肤 + 底部导航 + 独立页面
![设置·主题皮肤](docs/screenshots/04-settings.png)
底部导航的「设置」是**独立页面**，内置 **8 款一键切换的皮肤**：墨白 / 宣纸 / 茶色 / 青简 / 黛蓝 / 墨韵 / 素白 / 夜墨。其中「墨韵」为墨瓶·水墨晕染风格（纸纹之上叠加极淡水墨扩散）。所有设置只存本机。

### 📊 阅读统计与自动打卡
![阅读统计（日）](docs/screenshots/06-stats-day.png)
底部导航的「统计」进入**独立统计页**，按 **日 / 周 / 月** 汇总：总时长、阅读书目数、打卡状态，以及每本书的阅读分钟数明细。在阅读页停留即累计时长，切后台或打开面板自动暂停；当日累计达「打卡阈值」（默认 10 分钟）自动打卡。

### 🗂 书架按 AI 类型自动分组
![分组书架](docs/screenshots/03-shelf-grouped.png)
在 **设置 → 阅读与书架** 开启「书架按 AI 类型分组」后，书架空按每本书的 AI 标签归类（未分类归入「未分类」），配合顶部标签筛选条快速找书。

### 🤖 AI 助手（本地优先）
![AI 助手面板](docs/screenshots/05-ai-panel.png)
阅读页「AI」按钮打开面板：全书/本章导读、书中问答（轻量 RAG，只引用书中内容）、人物脉络笔记、段落双语对照；结果缓存到本机，默认关闭、按需联网。

### 🔤 中英互译（DeepSeek 等通用模型）
![设置·AI 引擎](docs/screenshots/04b-settings-ai.png)
划词即译，可用 DeepSeek / 通义 / 本地 Ollama 等任意 OpenAI 兼容模型（详见下方「AI 引擎配置」）。选中文字还可用「AI 解释」结合全书上下文讲解术语或难句。在 **设置 → AI 引擎** 选「AI 大模型」并填 Key 即可（例如 DeepSeek：Base `https://api.deepseek.com/v1`、Model `deepseek-chat`）。

### 📭 空书架引导
![空书架](docs/screenshots/01-shelf-empty.png)
首次打开或暂无书籍时的引导页，提示从本地导入电子书（支持 EPUB / PDF / TXT / MOBI / FB2 / HTML / DOCX）。

## 📦 安装

### Android APK（推荐）

前往 **[Releases](https://github.com/rayyang-dev/ink-reader/releases)** 下载 `Inkstone-release.apk`（已签名发布版，推荐）或 `Inkstone-debug.apk`（调试版），
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
# 产物：android/app/build/outputs/apk/debug/Inkstone-debug.apk

# 4. 构建签名 Release 包（需自行提供 keystore，见下）
./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/Inkstone-release.apk
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

> **中英翻译可用 DeepSeek 等通用大模型**：只要填「AI 大模型」并把 **LLM Base** 设为 OpenAI 兼容地址、**LLM Model** 设为对应模型名、**API Key** 填该平台的 Key 即可。例如用 DeepSeek：Base `https://api.deepseek.com/v1`、Model `deepseek-chat`、Key 填 DeepSeek 控制台获取的 Key——翻译、导读、书中问答、人物笔记、智能标签、段落双语全部走这一个模型，无需单独对接翻译 API。同样可换通义 / 智谱 / 本地 Ollama 等任意 OpenAI 兼容服务。

---

## 🧱 技术栈

- 前端：原生 ES Modules（无打包构建）、IndexedDB、Service Worker（PWA）
- 解析：[fflate](https://github.com/101arrowz/fflate)（EPUB / DOCX）、[pdf.js v4](https://github.com/mozilla/pdf.js)（PDF）、自研 MOBI 解析器、原生 DOMParser（FB2 / HTML）
- 原生壳：Capacitor 8（Android）
- 测试：Node 原生 `node:test` + Playwright；含「设置 / 统计打卡 / 日周月聚合 / 书架元数据」全功能自测、真实浏览器冒烟（断言新控件已接入 DOM 并全页面截图）、解析 / 翻译 / 端到端，以及 FB2 / HTML / DOCX 三种新格式导入的端到端校验，全部通过

---

## 📁 项目结构

```
ink-reader/
├── www/                            # Web 应用（PWA 入口，也是 Capacitor 的 webDir）
│   ├── index.html                  # 单页结构：书架 / 阅读器 / 统计页 / 设置页 / 底部导航栏（阅读器内仍保留目录/书签/AI 侧滑面板）
│   ├── css/style.css               # 墨水屏主题与全部样式（8 款可切换皮肤 / 翻书页 3D 动画 / Regal 整屏反色 / 纸感设计令牌）
│   ├── books/sample.js             # 内置示例书《阅读者手记》（无版权风险，用于演示）
│   └── js/
│       ├── app.js                  # 主控：书架渲染 / 分页翻页（含翻书页动画）/ 底部导航与独立页面切换 / 阅读计时打卡 / 面板与设置接线
│       ├── store.js                # 存储层：IndexedDB 存书籍 + localStorage 存设置/进度/书签/统计（均带内存兜底）
│       ├── paginate.js             # 按屏幕真实尺寸的分页引擎（非滚动）
│       ├── translate.js            # 中英互译（mock / DeepL / Google / 通用 LLM 可插拔）
│       ├── llm.js                  # OpenAI 兼容统一客户端（翻译 / 摘要 / 问答 / 笔记 共用）
│       ├── ai.js                   # AI 能力：导读 / 选中即问解释 / 书中问答(RAG) / 人物脉络笔记 / 智能标签 / 段落双语
│       ├── importers.js            # EPUB / TXT / PDF / MOBI / FB2 / HTML / DOCX 导入解析入口
│       ├── mobidec.js              # 自研 MOBI 解析器（App 内直接解析，无需 Calibre）
│       └── pdfview.js              # pdf.js 整页渲染（扫描型 PDF 整页显示）
├── android/                        # Capacitor 生成的 Android 原生工程（包名 com.rayyang.inkstone）
├── docs/                           # 界面示意图 mockup.svg + 真实截图 screenshots/
├── tests/                          # Node 自测（features / 解析 / 翻译 / 端到端）+ Playwright 冒烟与截图
├── capacitor.config.json           # Capacitor 配置（appId / appName / webDir）
└── README.md
```

> 架构要点：前端是**零构建的原生 ES Modules**（无 webpack/vite），直接在浏览器与 Capacitor WebView 中运行；所有第三方能力（EPUB/PDF/MOBI 解析、LLM 调用）都收敛在 `js/` 下、以纯函数 + 可控的 `fetch` 实现，便于在 Node 环境下做单元测试。存储与联网均遵循「本地优先、零追踪」：书籍在 IndexedDB、设置/进度/书签/统计在 localStorage，AI 仅在用户主动触发且已填 Key 时才向用户指定的接口发请求。

---

## ✅ 测试

```bash
node tests/features.test.mjs        # 全功能自测：设置 / 阅读统计打卡 / 日周月聚合 / 书架元数据（29 断言全过）
node tests/capture-screenshots.mjs  # 真实浏览器（Playwright）冒烟：断言新控件已接入 DOM + 全页面截图（23 断言全过）
node --test tests/                  # EPUB / PDF / MOBI 管线、翻译后端路由、端到端流程
```

`features.test.mjs` 覆盖本次新增功能的纯逻辑层（打卡阈值触发、日/周/月聚合边界、设置读写、书架 AI 标签元数据）；
`capture-screenshots.mjs` 用 Playwright 真实加载应用，断言空书架 / 平铺书架 / 分组书架 / 阅读器 / 独立设置页（皮肤切换 / AI 引擎 / 翻页动画开关）/ 独立统计页（日 / 周切换）的新控件确实接在 DOM 上，并产出各页面截图。
其余用例覆盖 EPUB 管线、PDF 管线、MOBI 模块（含中文 124 章 / 英文 33 章解析）、翻译后端路由，以及「MOBI 解析 → 取章 → 翻译」的端到端流程，全部通过。

---

## 📜 许可证

[MIT](LICENSE) —— 自由使用、修改与分发。
