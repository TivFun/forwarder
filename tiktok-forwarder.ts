import "dotenv/config";
import * as cron from "node-cron";
import { runTikTokAutoOnce } from "./tasks/tiktok-auto";
import { runTikTokDownloadOnce } from "./tasks/tiktok-download";

/**
 * TikTok Forwarder - Standalone process for TikTok video workflow
 * 
 * This process only handles TikTok video workflow (get → download → upload),
 * independent from Twitter forwarding.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --only tiktok-forwarder
 *   pm2 stop tiktok-forwarder
 *   pm2 restart tiktok-forwarder
 */

// Force output to ensure logs are written
console.log("[TikTok-Forwarder] ========================================");
console.log("[TikTok-Forwarder] Starting TikTok forwarder process...");
console.log(`[TikTok-Forwarder] Timestamp: ${new Date().toISOString()}`);

// Debug: Log environment variables
console.log(`[TikTok-Forwarder] DEBUG - ENABLE_TIKTOK_AUTO=${process.env.ENABLE_TIKTOK_AUTO}`);
console.log(`[TikTok-Forwarder] DEBUG - ENABLE_TIKTOK_DOWNLOADER=${process.env.ENABLE_TIKTOK_DOWNLOADER}`);
console.log(`[TikTok-Forwarder] DEBUG - process.cwd()=${process.cwd()}`);
console.log("[TikTok-Forwarder] ========================================");

const enableTikTokAuto =
  (process.env.ENABLE_TIKTOK_AUTO || "false").toLowerCase() === "true";
const enableTikTokDownload =
  (process.env.ENABLE_TIKTOK_DOWNLOADER || "false").toLowerCase() === "true";

if (enableTikTokAuto) {
  // Complete automated workflow: Get → Download → Upload
  const scheduleInterval = process.env.TIKTOK_AUTO_INTERVAL || "*/30 * * * *"; // Default: every 30 minutes
  console.log(
    `[TikTok-Forwarder] ✅ Scheduling complete TikTok workflow (get → download → upload) with cron: ${scheduleInterval}`
  );
  cron.schedule(scheduleInterval, () => {
    console.log("[TikTok-Forwarder] ⏰ Running scheduled TikTok auto workflow...");
    void runTikTokAutoOnce().catch((err) => {
      console.error("[TikTok-Forwarder] ❌ Scheduled workflow failed:", err);
    });
  });
  
  // Run once immediately on startup (optional)
  if (process.env.TIKTOK_RUN_ON_STARTUP === "true") {
    console.log("[TikTok-Forwarder] 🚀 Running TikTok auto workflow immediately on startup...");
    void runTikTokAutoOnce().catch((err) => {
      console.error("[TikTok-Forwarder] ❌ Startup workflow failed:", err);
    });
  } else {
    console.log(
      `[TikTok-Forwarder] ℹ️ TIKTOK_RUN_ON_STARTUP is not set to "true", will wait for scheduled time (${scheduleInterval})`
    );
  }
} else if (enableTikTokDownload) {
  // Download only (legacy mode)
  console.log(
    "[TikTok-Forwarder] Scheduling TikTok downloader only (no auto-upload) every 30 minutes."
  );
  cron.schedule("*/30 * * * *", () => {
    console.log("[TikTok-Forwarder] Running scheduled TikTok download...");
    void runTikTokDownloadOnce();
  });
  
  // Run once immediately on startup (optional)
  if (process.env.TIKTOK_RUN_ON_STARTUP === "true") {
    console.log("[TikTok-Forwarder] Running TikTok download immediately on startup...");
    void runTikTokDownloadOnce();
  }
} else {
  console.log(
    "[TikTok-Forwarder] ENABLE_TIKTOK_AUTO and ENABLE_TIKTOK_DOWNLOADER are both false."
  );
  console.log("[TikTok-Forwarder] Process will exit. Set ENABLE_TIKTOK_AUTO=true to enable.");
  process.exit(0);
}

console.log("[TikTok-Forwarder] TikTok forwarder scheduled. Process will keep running.");

