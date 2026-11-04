# Paperleaf Codex 本机连接程序

用你的 ChatGPT 账号登录 Codex，为 Paperleaf 网站提供 GPT 智能导入、划词翻译、连续翻译、文献问答、总结和 PPT 内容生成。网站地址：
https://paperleaf-xcz-reader.shamboo2003.chatgpt.site

## 开始使用

1. 安装 Node.js 22 或更新版本：https://nodejs.org/ 。
2. 解压整个文件夹。Windows 双击 `start-windows.cmd`。macOS 在终端进入解压文件夹，运行 `bash start-macos.command`。Linux 运行 `npm install`，然后 `npm start`。
3. 首次启动会安装固定版本的官方 `@openai/codex`，需要访问 npm 和 OpenAI。保留终端窗口。
4. 在同一台电脑的 Chrome / Edge 中打开程序显示的网址。网站如果先要求 ChatGPT 登录，完成网站登录后再次打开程序显示的配对链接；也可在“连接 Codex”中手动粘贴配对码。
5. 允许浏览器访问本地网络。在网站“连接 Codex”面板点击登录，通过官方页面授权。回到网站，确认显示账号和模型。
6. 导入 PDF 时默认开启 GPT 智能识别。登录 Codex 后，会读取前 3 页，提取标题、作者、年份、期刊、DOI、中文摘要和关键词，并按“年份 - 第一作者 - 标题.pdf”命名，原文件名仍保留。未知字段留空，可在文献信息中核对修改。已有文献也能点击“GPT 识别并重新命名”。关闭智能识别后，可按原文件名普通导入。
7. 在翻译页开启“自动划译”即可选中即翻译；开启“连续翻译”可跨页追加多个段落。Shift 划词也会追加。支持完成当前段后暂停、继续、单段重试、保存双语笔记与导出。
8. GPT 助手支持当前页、全文或指定页码问答、总结、6/8/10/12 页汇报。PPT 内容可预览、编辑，先“生成可编辑 PPTX”，再点击“下载 PPTX 文件”。下载后可在 PowerPoint / WPS 中继续编辑；含讲稿备注与 PDF 来源页码。

## 使用范围

- 网站是云端私密文献库，模型调用由你自己电脑上的 Codex App Server 运行。这不是完全云端 AI 服务；电脑关机或关闭连接程序后，GPT 功能不可用。手机和平板不能连接另一台电脑的回环地址。
- 使用账号的 Codex 可用额度；登录成功不代表所有模型可用，实际以 OpenAI 账号的套餐、地域与额度为准。程序不自动切换至按量计费 API。
- 账号凭据保存在用户主目录的 `.paperleaf-codex/account`，通过独立 Codex 配置管理，不读写你已有的 Codex CLI 登录。点击“退出 Codex”退出此连接程序的账号；“断开配对”只解除当前浏览器连接。
- 本地服务只监听 `127.0.0.1:17624`，只允许上面的 Paperleaf 域名，通过每次启动生成的随机配对码校验。配对码只存当前浏览器会话，不上传到网站。不要把它发给其他人。程序不提供通用 RPC、文件或命令接口。
- 文献文字经本机 Codex 发送给 OpenAI；登录凭据不会发送到 Paperleaf 网站。成功的问答/总结/PPT 原稿自动保存到你的私密文献库，译文需要点击保存笔记。关闭阅读器会停止当前生成；翻译会话保存在当前标签页，恢复后点击继续，已完成的段落不会重复请求。关闭标签页前请保存笔记或导出。
- 最多一次读取 16 万字符；超长文献请指定页码。仅支持 PDF 文字层，不支持 OCR、图片或完整公式图像识别。GPT 输出请对照原文核对。

## 排查连接

- 配对失败：重启程序后配对码会改变，使用终端显示的新链接或新配对码。
- 浏览器提示本地网络：允许当前网站访问本地网络。其他浏览器可能限制 HTTPS 网站连接本地 HTTP，优先在桌面 Chrome / Edge 使用。
- 登录回调打不开：确认在运行连接程序的电脑上打开登录页面；关闭重复的 Codex 登录窗口，检查 1455 回调端口占用，重新登录。
- 17624 端口占用：已有连接程序正在运行，关闭旧窗口再重启。
- 额度不足或模型不可用：在连接面板刷新账号状态，选择可用模型或等待额度重置。失败的请求不会自动重新生成。
- Windows ARM / 某些系统安装官方 Codex 失败时，使用官方支持的平台或 WSL，并确认浏览器能连接本机回环地址。

## 技术与授权

Node.js HTTP → 本机 stdio / JSON-RPC → 官方 Codex App Server。先 initialize/initialized，再通过 account/login/start、account/read、model/list、thread/start、turn/start 处理任务。只有 turn/completed 的 completed 状态才会保存结果。每个任务有唯一 ID，重复提交不会重复启动，支持中断与超时。

阅读线程使用独立空目录、只读受限访问，关闭 shell、MCP apps、插件、浏览器、文件图像与多代理等工具；所有审批请求拒绝。请勿把此程序部署成公开网络服务。官方文档：https://learn.chatgpt.com/docs/app-server

配套源码随下载包提供；Codex npm 包遵循其 Apache-2.0 许可证。

## 1.4.1 连接兼容模式

使用 requires_openai_auth 的独立 HTTP Responses provider，保留 Codex 的 ChatGPT 登录与后端选择，不读取或复制登录凭据，不使用 API Key。禁用模型连接的 WebSocket 握手；按 Codex 返回的类型展示真实重试原因、次数和首次输出时间。升级后重启连接程序。HTTP 仍可能遇到限流、服务错误或网络中断，无法保证零重试。
