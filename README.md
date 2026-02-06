[中文](README.zh-CN.md)

# Content Forwarding Automation

## 1. Purpose

This project provides an automated workflow to fetch content from a source platform (currently Twitter), translate it, and subsequently post it to a destination platform (currently Bilibili).

## 2. Core Function Explanations

The main workflow is orchestrated within `tasks/integral-process.ts` and is composed of several key modules:

### Data Fetching

- **`tasks/tweets/fetch-tweets.ts`**
  - This module is responsible for retrieving the raw content data from the source platform's API. It is configured to fetch recent tweets from a specified Twitter account within a defined time window.

### Data Standardisation (Adapter)

- **`tasks/tweets/tweet-standardiser.ts`**
  - This is a crucial component that acts as an adapter. It takes the raw, platform-specific data from `fetch-tweets.ts` and transforms it into a standardised, internal data model defined in `tasks/types.ts` (`BilibiliPost`). This process isolates the rest of the application from the complexities of the source API's data structure.

### Content Translation

- **`tasks/translation/translate.ts`**
  - This module takes the text content from the standardised data object and processes it through a translation service (currently Gemini-2.5-Flash-Lite). It returns the translated text, ready for posting.

### Content Posting (Poster)

- **`tasks/post/bilibili-poster.ts`**
  - This module handles the final step of publishing the content. It takes the standardised, translated data and interacts with the destination platform's API (Bilibili). It manages platform-specific requirements such as image uploading and constructing the correct request body for creating a new post.

## 3. How to Use

### Prerequisites

- Node.js and npm installed.
- API keys and credentials for the source, translation, and destination services.

### Configuration

1.  Populate the `.env` file with your credentials:

    ```env
    # Twitter API Credentials from twitterapi.io
    TWITTERAPI_IO_API_KEY=your_twitterapi_io_key
    TWITTER_USERNAME=target_twitter_username_without_@

    # Gemini API Key
    GOOGLE_API_KEY=your_gemini_api_key
    GOOGLE_MODEL=gemini-2.5-flash-lite

    # Bilibili Credentials
    SESSDATA=your_bilibili_sessdata
    CSRF=your_bilibili_csrf_token
    ```

### Installation

This project is now intended to be used with **Bun** instead of npm.

Install the necessary project dependencies by running:

```bash
bun install
```

### Running the Script

To execute the entire fetch-translate-post workflow once, run the main process file:

```bash
bun run integral-once
```

### Scheduling the Task

The `scheduledJob.tsx` script is designed to run in a continuous loop, automatically executing the forwarding task at a set interval (e.g., every 15 minutes). To manage this persistent background process effectively, we use `pm2`, a production-grade process manager for Node.js applications.

Using `pm2` is recommended over a simple cron job for this application because:

- **Process Persistence**: It ensures the script remains active continuously and will automatically restart it if it crashes or the server reboots.
- **Log Management**: It centralises log collection, making it easy to monitor the script's output and diagnose errors.
- **Background Daemonisation**: It runs the script as a true background service, detaching it from the terminal session.

#### How to run with `pm2`:

1.  **Install `pm2` globally** (if you have not already):

    ```bash
    bun install pm2 -g
    # or use npm if you prefer:
    # npm install pm2 -g
    ```

2.  **Navigate to the project root directory**:
    Make sure you are in the main directory of the project before running the next command.

    ```bash
    cd /path/to/your/project
    ```

3.  **Start the service**:
    Use `pm2` to start the `index.ts` script. With Bun, you can set Bun as the interpreter directly.

    ```bash
    pm2 start index.ts --name forwarder --interpreter bun --max-memory-restart 200M
    ```

4.  **Monitor the process**:
    You can check the status and health of your running application with:

    ```bash
    pm2 list
    ```

    Or view more detailed information:

    ```bash
    pm2 show content-forwarding-automator
    ```

5.  **View logs**:
    To inspect the real-time output and any console errors from the script:

    ```bash
    pm2 logs content-forwarding-automator
    ```

6.  **Stopping and Deleting**:
    To stop the process:
    ```bash
    pm2 stop content-forwarding-automator
    ```
    To stop and remove it from the `pm2` list:
    ```bash
    pm2 delete content-forwarding-automator
    ```
