/**
 * PM2 Ecosystem Configuration for Bilibili Forwarder
 * 
 * 注意：所有环境变量配置都在 .env 文件中，不在本文件中设置。
 * 应用会自动通过 dotenv/config 从 .env 文件读取配置。
 * 
 * 两个独立的应用：
 *   - twitter-forwarder: Twitter → Bilibili 转发
 *   - tiktok-forwarder: TikTok 视频获取 → 下载 → 上传
 * 
 * Usage:
 *   # 启动所有应用
 *   pm2 start ecosystem.config.js
 * 
 *   # 只启动 Twitter 转发
 *   pm2 start ecosystem.config.js --only twitter-forwarder
 * 
 *   # 只启动 TikTok 转发
 *   pm2 start ecosystem.config.js --only tiktok-forwarder
 * 
 *   # 分别控制
 *   pm2 stop twitter-forwarder
 *   pm2 stop tiktok-forwarder
 *   pm2 restart twitter-forwarder
 *   pm2 restart tiktok-forwarder
 * 
 *   # 查看日志
 *   pm2 logs twitter-forwarder
 *   pm2 logs tiktok-forwarder
 *   pm2 logs  # 查看所有日志
 * 
 * 功能开关（在 .env 文件中设置）:
 *   ENABLE_TWITTER_FORWARDER=true/false   # Twitter 转发功能（twitter-forwarder 应用）
 *   ENABLE_TIKTOK_AUTO=true/false         # TikTok 完整流程（tiktok-forwarder 应用）
 *   ENABLE_TIKTOK_DOWNLOADER=true/false   # TikTok 仅下载（tiktok-forwarder 应用，legacy）
 */

const path = require("path");

// Get project root directory (where ecosystem.config.js is located)
const projectRoot = __dirname;

module.exports = {
    apps: [
        {
            name: "twitter-forwarder",
            // Run via Bun directly so PM2 does not need to interpret TS itself.
            script: "bun",
            args: "twitter-forwarder.ts",
            interpreter: "none",
            cwd: projectRoot,
            exec_mode: "fork",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "100M",
            error_file: path.join(projectRoot, "logs", "twitter-forwarder-error.log"),
            out_file: path.join(projectRoot, "logs", "twitter-forwarder-out.log"),
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            merge_logs: true,
        },
        {
            name: "tiktok-forwarder",
            // Run via Bun directly so PM2 does not need to interpret TS itself.
            script: "bun",
            args: "tiktok-forwarder.ts",
            interpreter: "none",
            cwd: projectRoot,
            exec_mode: "fork",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "100M",
            error_file: path.join(projectRoot, "logs", "tiktok-forwarder-error.log"),
            out_file: path.join(projectRoot, "logs", "tiktok-forwarder-out.log"),
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            merge_logs: true,
        },
    ],
};

