# forwarder

这是一个**自动搬运内容**的小工具：

- **Twitter → Bilibili**：抓取指定账号的推文 →（可翻译）→ 发到 B站
- **TikTok → 下载 → Bilibili 投稿**：检查指定 TikTok 账号是否更新 → 用 yt-dlp 下载 → 自动投稿到 B站（投稿成功后自动删除本地视频节省空间）

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

### 3) TikTok 下载/上传：安装 ffmpeg + Python 虚拟环境

TikTok 视频的下载通过 **yt-dlp** 完成（命令行工具，装在 Python 虚拟环境里），上传到 B 站通过 **Python** 脚本完成。

#### 安装 ffmpeg（封面提取 + 视频合并需要）

```bash
brew install ffmpeg
```

#### 创建 Python 虚拟环境

在项目根目录执行：

```bash
# 1) 创建虚拟环境目录
python3 -m venv tiktok-download

# 2) 激活虚拟环境
source tiktok-download/bin/activate

# 3) 安装依赖（yt-dlp 负责下载，bilibili-api-python 负责投稿）
pip install yt-dlp bilibili-api-python pillow

# 4) 退出虚拟环境
deactivate
```

创建完成后，在 `.env` 里写：

```env
PYTHON_VENV_PATH=tiktok-download
```

> 说明：PM2 后台运行时不需要你”激活”虚拟环境；本项目会自动使用 `PYTHON_VENV_PATH` 指向的虚拟环境里的 `python3` 和 `yt-dlp`。

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

# TikTok 用户名（@后面那串，不带@）
TIKTOK_USERNAME=xxx

# 下载目录（绝对路径，yt-dlp 会把视频下到这里）
TIKTOK_DOWNLOADED_DIR=/Users/你的用户名/path/to/tiktok-videos

# Python 虚拟环境目录名（相对项目根目录）
PYTHON_VENV_PATH=tiktok-download

# B 站投稿凭证（同上）
SESSDATA=xxx
CSRF=xxx

# 投稿分区 ID（示例：85 = 短片·手书·配音）
BILIBILI_TID=85

# 封面：true = 让 B 站自动用视频第一帧，false = 用 ffmpeg 截取并裁成 16:9
BILIBILI_USE_VIDEO_COVER=true

# 合集 ID（可选，不填就不加入合集）
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

# TikTok 只下载不投稿（视频保存到 TIKTOK_DOWNLOADED_DIR）
bun run tiktok-download-once

# TikTok 全流程跑一次（检查更新→下载→投稿→删本地视频）
bun run tiktok-auto-once
```

---

## 免责声明

本项目涉及对第三方平台的自动化操作。请遵守平台规则与当地法律法规，并自行承担使用风险。
