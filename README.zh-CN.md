[English](README.md)

# 自动化的内容转发

## 1. 目的

本项目提供了一个自动化的工作流程，用于从源平台（当前为 Twitter）获取内容，进行翻译，然后发布到目标平台（当前为 Bilibili）。

## 2. 核心功能解释

整个工作流程由 `tasks/integral-process.ts` 文件进行统筹，并由以下几个关键模块组成：

### 数据获取

- **`tasks/tweets/fetch-tweets.ts`**
  - 此模块负责从源平台的 API 获取原始数据。根据配置，它会从一个指定的 Twitter 账户抓取特定时间窗口内的最新推文。

### 数据标准化 (适配器)

- **`tasks/tweets/tweet-standardiser.ts`**
  - 这是一个关键的适配器组件。它接收由 `fetch-tweets.ts` 传来的、特定于平台的原始数据，并将其转换为在 `tasks/types.ts` (`BilibiliPost`) 中定义的标准化内部数据模型。这个过程将应用程序的其余部分与源平台 API 复杂的数据结构隔离开来。

### 内容翻译

- **`tasks/translation/translate.ts`**
  - 此模块接收标准化数据对象中的文本内容，并通过翻译服务（当前为 DeepL）进行处理，最后返回可直接用于发布的译文。

### 内容发布 (发布器)

- **`tasks/post/bilibili-poster.ts`**
  - 此模块负责工作流的最后一步——发布内容。它接收经过标准化和翻译的数据，并与目标平台（Bilibili）的 API 进行交互。它处理了特定于平台的需求，例如图片上传和构造创建动态所需的正确请求体。

## 3. 使用方法

### 先决条件

- 已安装 Node.js 和 npm。
- 拥有源平台、翻译服务和目标平台的 API 密钥及凭据。

### 配置

1.  在 `.env` 文件中填入你的凭据：

    ```env
    # Twitter API 凭据 (来自 twitterapi.io)
    TWITTERAPI_IO_API_KEY=your_twitterapi_io_key
    TWITTER_USERNAME=target_twitter_username_without_@

    # Gemini API 密钥
    GOOGLE_API_KEY=your_gemini_api_key
    GOOGLE_MODEL=gemini-2.5-flash-lite

    # Bilibili 凭据
    SESSDATA=your_bilibili_sessdata
    CSRF=your_bilibili_csrf_token
    ```

### 安装

本项目现在推荐使用 **Bun** 而不是 npm 来管理依赖和运行脚本。

运行以下命令安装项目所需的依赖：

```bash
bun install
```

### 运行脚本

若要单次执行完整的“获取-翻译-发布”流程，可以通过 Bun 调用 `package.json` 中的脚本：

```bash
bun run integral-once
```

### 作为持久化服务运行

项目的持续运行入口是 `index.ts`，它会按预设的时间间隔自动执行转发任务。为了高效地管理这个常驻后台的进程，我们使用 `pm2`。

对于本项目，使用 `pm2`原因如下：

- **进程持久化**: `pm2` 能确保脚本持续运行，并在脚本崩溃或服务器重启后自动重启。
- **日志管理**: 它能集中管理日志，方便监控脚本输出和诊断问题。
- **后台运行**: 它会将脚本作为真正的后台服务运行，与终端会话分离。

#### 如何使用 `pm2` 运行：

1.  **全局安装 `pm2`** (如果尚未安装):

    ```bash
    bun install pm2 -g
    # 或者如果你更习惯 npm：
    # npm install pm2 -g
    ```

2.  **进入项目根目录**:
    在执行下一步命令前，请确保你位于项目的根目录。

    ```bash
    cd /path/to/your/project
    ```

3.  **启动服务**:
    使用 `pm2` 启动 `index.ts` 脚本。使用 Bun 时，可以直接把 Bun 作为解释器。

    ```bash
    pm2 start index.ts --name forwarder --interpreter bun --max-memory-restart 200M
    ```

4.  **监控进程**:
    你可以用以下命令检查应用的运行状态：

    ```bash
    pm2 list
    ```

    或查看更详细的信息：

    ```bash
    pm2 show content-forwarding-automator
    ```

5.  **查看日志**:
    实时检查脚本的输出和任何控制台错误：

    ```bash
    pm2 logs content-forwarding-automator
    ```

6.  **停止与删除**:
    停止进程：
    ```bash
    pm2 stop content-forwarding-automator
    ```
    停止并从 `pm2` 列表中移除进程：
    ```bash
    pm2 delete content-forwarding-automator
    ```
