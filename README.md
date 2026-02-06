# forwarder

这是一个**自动搬运内容**的小工具：

- **Twitter → Bilibili**：抓取指定账号的推文 →（可翻译）→ 发到 B站
- **TikTok → 下载 → Bilibili 投稿**：检查指定 TikTok 账号是否更新 → 用 Downie 下载 → 自动投稿到 B站（并可在投稿成功后删除本地视频节省空间）

照着做即可。

---

## 你需要准备什么（一次性）

### 1) 安装 Bun（运行本项目用）

Bun 是一个“运行/安装 JavaScript 依赖”的工具，类似 npm，但更快。我们用它来运行本项目。

打开终端执行：

```bash
curl -fsSL https://bun.sh/install | bash
```

装完后重开终端，确认：

```bash
bun -v
```

### 2) 安装 PM2（让脚本在后台常驻）

PM2 是“进程守护工具”：让脚本在后台一直跑、崩了自动重启、方便看日志。

```bash
bun add -g pm2
pm2 -v
```

### 3) TikTok 下载：安装 Downie 4（可选但推荐）

假设你已经在用 Downie 4 了。本项目会用系统命令唤起 Downie：

- `open -a "Downie 4" "<tiktok_url>"`

请在 Downie 设置里开启尽可能自动的下载方式（否则可能需要你手动选择清晰度）。

### 4) TikTok 嗅探/上传：需要 Python 虚拟环境

TikTok 嗅探/投稿这部分是通过 **Python** 跑的，所以需要一个 Python 虚拟环境（venv）来安装依赖。

在项目根目录执行：

```bash
# 1) 创建虚拟环境目录
python3 -m venv your-venv

# 2) 激活虚拟环境
source your-venv/bin/activate

# 3) 安装依赖
python -m pip install TikTokApi playwright bilibili-api-python requests pillow

# 4) 安装 Playwright 浏览器组件
python -m playwright install
```

创建完成后，在 `.env` 里写：

```env
PYTHON_VENV_PATH=your-venv
```

> 说明：PM2 后台运行时不需要你“激活”虚拟环境；本项目会直接使用 `PYTHON_VENV_PATH` 指向的 `your-venv/bin/python3` 来运行 Python 脚本。

---

## 安装依赖（第一次运行前）

在项目根目录（有 `package.json` 的那个目录）执行：

```bash
bun install
```

---

## 配置 `.env`（最重要）

手动在项目根目录里创建 `.env`文件，你需要把下面这些填好（按需启用功能）。

> 注意：改了 `.env` 后，需要 `pm2 restart ... --update-env` 才会生效。

### A. Twitter → Bilibili（推文转发）

```env
# 开关：true 启用 / false 禁用
ENABLE_TWITTER_FORWARDER=true

# 抓推文需要
TWITTERAPI_IO_API_KEY=xxx
TWITTER_USERNAME=xxx

# 翻译（Gemini）
GOOGLE_API_KEY=xxx
GOOGLE_MODEL=gemini-2.5-flash-lite

# 发 B 站动态需要
SESSDATA=xxx
CSRF=xxx
```

可选：推文转发间隔（cron 表达式），默认每 15 分钟：

```env
TWITTER_FORWARDER_INTERVAL=*/15 * * * *
```

可选：启动时立刻执行一次：

```env
TWITTER_RUN_ON_STARTUP=true
```

### B. TikTok → 下载 → Bilibili 投稿

```env
# 开关：true 启用 / false 禁用
ENABLE_TIKTOK_AUTO=true

# TikTok 用户名
TIKTOK_USERNAME=xxx

# TikTok msToken（cookie）
MS_TOKEN=xxx

# Downie 下载目录（必须是绝对路径）
TIKTOK_DOWNLOADED_DIR=/Users/你的用户名/.../tiktok-videos

# Downie 应用名（默认 Downie 4）
DOWNIE_APP_NAME=Downie 4

# Python venv（你项目里就是 tiktok-download）
PYTHON_VENV_PATH=tiktok-download

# B 站投稿凭证（同上，投稿也需要）
SESSDATA=xxx
CSRF=xxx

# 投稿分区（示例 85）
BILIBILI_TID=85

# 是否让 B 站用视频第一帧做封面（true=不自己截封面）
BILIBILI_USE_VIDEO_COVER=true

# 合集 ID（可选）
BILIBILI_COLLECTION_ID=1234567
```

可选：TikTok 执行间隔（默认每 30 分钟）

```env
TIKTOK_AUTO_INTERVAL=*/30 * * * *
```

可选：启动时立刻执行一次

```env
TIKTOK_RUN_ON_STARTUP=true
```

---

## 启动（推荐：用 PM2 常驻后台）

### 1) 创建日志目录

```bash
mkdir -p logs
```

### 2) 启动 TikTok 转发

```bash
pm2 start ecosystem.config.js --only tiktok-forwarder
```

看日志：

```bash
pm2 logs tiktok-forwarder --lines 100
```

### 3) 启动 Twitter 转发

```bash
pm2 start ecosystem.config.js --only twitter-forwarder
```

看日志：

```bash
pm2 logs twitter-forwarder --lines 100
```

### 4) 修改 `.env` 后如何生效

```bash
pm2 restart tiktok-forwarder --update-env
pm2 restart twitter-forwarder --update-env
```

---

## 常用排查

### 看进程是否在跑

```bash
pm2 list
```

### 看日志文件在哪里

- TikTok：
  - `logs/tiktok-forwarder-out.log`
  - `logs/tiktok-forwarder-error.log`
- Twitter：
  - `logs/twitter-forwarder-out.log`
  - `logs/twitter-forwarder-error.log`

### 停止/删除

```bash
pm2 stop tiktok-forwarder
pm2 stop twitter-forwarder

pm2 delete tiktok-forwarder
pm2 delete twitter-forwarder
```

---

## “我只想手动跑一次”怎么做（不常驻）

```bash
# 推文转发跑一次
bun run integral-once

# TikTok 下载跑一次（会唤起 Downie）
bun run tiktok-download-once

# TikTok 投稿跑一次（从下载目录取最新视频投稿）
bun run upload-tiktok-once

# TikTok 全流程跑一次（嗅探→下载→投稿→成功后删本地视频）
bun run tiktok-auto-once
```

---

## 免责声明

本项目涉及对第三方平台的自动化操作。请遵守平台规则与当地法律法规，并自行承担使用风险。
