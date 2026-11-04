# Paperleaf · 文献阅读工作台

英文文献阅读、云端笔记与 GPT 研究助手。提供网页版和内置 Codex 的 Windows 桌面预览版。

**[打开网页版](https://paperleaf-xcz-reader.shamboo2003.chatgpt.site) · [Windows 发行版本](https://github.com/XCZchaos/paperleaf-reader/releases) · [English / Technical notes](README.en.md)**

## 开始使用

1. 网页版保留 ChatGPT 私密访问保护，先使用原来的 ChatGPT 身份完成验证。
2. 注册 Paperleaf 用户名和独立密码，保存账号恢复码；已有文献与笔记会保留。
3. 从 Releases 下载 `Paperleaf-Setup-1.1.1-Windows-x64.exe`，双击并按向导安装；之后从桌面或开始菜单打开。
4. 在桌面版点击「使用 ChatGPT 登录」，在系统浏览器完成 Codex 官方授权，回到阅读器即可开启 GPT 功能。无需另装 Node.js、运行命令或填写配对码。

Paperleaf 账号负责云端资料；Codex 授权保留在本机。换电脑时使用相同的 ChatGPT 网站访问身份和 Paperleaf 账号，Codex 需在新电脑重新授权。当前网站为个人私密空间，GitHub 仓库可见性不会改变网站的访问范围。

## 功能

- **PDF 文献库**：批量导入、去重、主题分类、标签、收藏与阅读状态；单个文件上限 40 MB。
- **智能识别**：登录 Codex 后，GPT 从 PDF 前三页识别标题、作者、年份、期刊/会议、DOI、摘要与关键词，并生成文件名；保留原文件名，可手动校正。
- **阅读工作台**：PDF 文本选择、目录、搜索、缩放、页码跳转、摘录、高亮和 Markdown 笔记。
- **英文翻译**：划词翻译、可选自动划译、连续段落翻译、暂停与重试、译文编辑、双语笔记和 Markdown 导出。
- **GPT 助手**：围绕选段提问、指定页码总结、文献内容梳理与历史记录。
- **文献汇报**：生成 6 / 8 / 10 / 12 页汇报，预览编辑后导出真实 PPTX，包含可编辑文字、讲稿和来源页码。
- **云端账号**：注册、密码登录、恢复码重置、修改密码和退出其他设备。
- **跨设备记录**：PDF、元信息、笔记、草稿、阅读进度、翻译与 GPT 成果按账号保存。

## 数据与边界

| 内容 | 位置 |
| --- | --- |
| PDF 原文件 | 私密云端对象存储 |
| 文献信息、笔记、草稿、高亮、进度与 GPT 记录 | 按账号隔离的云端数据库 |
| Codex 授权 | 当前电脑的独立用户配置目录 |
| 网络故障时待同步的草稿与翻译会话 | 当前设备暂存，联网后重试 |
| 界面偏好 | 当前设备 |

客户端需要联网，不提供完整离线 PDF 阅读或多人实时合并。同一篇文献的草稿和翻译会话以最后成功保存为准。重新打开文献时载入云端记录。

PDF 文字提取不等同于 OCR，也不代表模型理解了图表图片。自动翻译需用户主动开启；GPT 功能使用已登录 Codex 账号的可用模型与额度，生成内容请结合原文核对。

## 项目结构

```text
app/                网页界面、账号入口、文献阅读器与服务端 API
lib/                客户端接口、账号会话与云端同步逻辑
db/                 数据表定义
drizzle/            已发布的数据库迁移
desktop/            Electron 主进程、Preload、Codex 运行管理与发行信息
companion/          Codex App Server 协议及可选浏览器连接程序
public/             PDF.js 资源、使用指南和连接程序下载
scripts/            构建、打包与自动化检查
docs/releases/      版本说明
```

技术栈：React、TypeScript、Vinext/Vite、Cloudflare Workers、D1、R2、PDF.js、PptxGenJS、Electron、Codex App Server（stdio / JSON-RPC）。

## 开发与验证

需要 Node.js 22.13 或更新版本，以及项目 `package.json` 指定的 pnpm 版本。

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node --experimental-vm-modules scripts/check-api.mjs
node scripts/check-companion.mjs
node scripts/check-codex-protocol.mjs
node scripts/check-pptx.mjs
pnpm dev
```

账号服务需要单独配置 `PAPERLEAF_PASSWORD_PEPPER` 环境密钥；它不在仓库中，也不是 OpenAI API Key。开发环境可生成自己的测试值，不能拿开发值替换已部署站点的生产值。云端数据和用户凭据不包含在源码中。

`.openai/hosting.json` 对应现有 Sites 站点。此仓库用于该项目源码管理与版本归档，不会因 push 自动覆盖线上网站。网页版依赖 Worker、数据库、对象存储和可信身份入口，不能直接作为纯静态 GitHub Pages 部署。新的独立部署应单独配置站点身份、存储和环境密钥。

### 桌面构建

```bash
node scripts/build-desktop.mjs
node scripts/check-desktop.mjs
node scripts/build-installer.mjs
```

当前构建脚本在 Linux 环境打包 Windows x64 客户端，需系统 `tar`，并联网下载官方 Electron 和 Codex 包。程序目录在 `work/desktop/release/Paperleaf-win32-x64/`，最终 EXE 安装包在 `work/desktop/installer/`，生成物不提交到 Git。安装脚本生成仅删除随包文件的卸载清单，保留账号目录与云端资料。

修改 `companion/` 后，还需运行 `node scripts/package-companion.mjs` 更新浏览器连接程序下载包。数据库已有迁移不可改写，结构变化请添加新迁移。

## v1.1.1 验证范围

已完成 TypeScript 检查、网站构建、账号注册/登录/恢复与会话撤销、旧数据保留、跨设备记录接口、账号隔离、PDF 与笔记接口、Codex 协议和桌面包结构检查。桌面包内的主程序源码与本版本源码一致，并检查 NSIS 安装器、完整程序资源及 SHA-256。

**Windows 桌面版是未签名的预览版本，新版安装向导与真实模型调用仍需 Windows 实机验证。** 系统阻止启动时可继续使用网页版。详细说明见 [v1.1.1 发行说明](docs/releases/v1.1.1.md)。

## 第三方组件

第三方许可证保留在对应目录及发行包中。Electron、Chromium、Codex、PDF.js 等遵循各自许可证；本项目目前未另行指定开源许可证。

网页版源码基线：`8ee18fdcc5d3935b1e2b13330907298bbbd0f5d1`。GitHub 归档补充中文说明、发行文档和项目名称/版本信息；应用运行代码与此已发布基线一致。
