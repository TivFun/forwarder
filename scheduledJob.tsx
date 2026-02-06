import * as cron from "node-cron";
import { integralProcess } from "./tasks/integral-process";
import { runTikTokDownloadOnce } from "./tasks/tiktok-download";
import { runTikTokAutoOnce } from "./tasks/tiktok-auto";

/**
 * Schedule background jobs based on feature flags.
 *
 * Flags (environment variables):
 *   - ENABLE_TWITTER_FORWARDER=true  => enable Twitter → Bilibili text/image workflow.
 *   - ENABLE_TIKTOK_DOWNLOADER=true => enable periodic TikTok video downloads (download only).
 *   - ENABLE_TIKTOK_AUTO=true => enable complete TikTok workflow (get → download → upload).
 *
 * With this design, users can decide which features to enable
 * instead of always running everything at once.
 * 
 * Note: ENABLE_TIKTOK_AUTO takes precedence over ENABLE_TIKTOK_DOWNLOADER
 * (if both are true, only auto workflow will run).
 */
export const scheduledProcess = async () => {
  const enableTwitter =
    (process.env.ENABLE_TWITTER_FORWARDER || "true").toLowerCase() === "true";
  const enableTikTokAuto =
    (process.env.ENABLE_TIKTOK_AUTO || "false").toLowerCase() === "true";
  const enableTikTokDownload =
    (process.env.ENABLE_TIKTOK_DOWNLOADER || "false").toLowerCase() === "true";

  if (enableTwitter) {
    console.log(
      "[Scheduler] ENABLE_TWITTER_FORWARDER=true, scheduling Twitter→Bilibili integral process every 15 minutes."
    );
    cron.schedule("*/15 * * * *", integralProcess);
  } else {
    console.log(
      "[Scheduler] ENABLE_TWITTER_FORWARDER is not true, Twitter workflow will not be scheduled."
    );
  }

  if (enableTikTokAuto) {
    // Complete automated workflow: Get → Download → Upload
    const scheduleInterval = process.env.TIKTOK_AUTO_INTERVAL || "*/30 * * * *"; // Default: every 30 minutes
    console.log(
      `[Scheduler] ENABLE_TIKTOK_AUTO=true, scheduling complete TikTok workflow (get → download → upload) with cron: ${scheduleInterval}`
    );
    cron.schedule(scheduleInterval, () => {
      // Fire and forget, errors are logged inside runTikTokAutoOnce.
      void runTikTokAutoOnce();
    });
  } else if (enableTikTokDownload) {
    // Download only (legacy mode)
    console.log(
      "[Scheduler] ENABLE_TIKTOK_DOWNLOADER=true, scheduling TikTok downloader only (no auto-upload) every 30 minutes."
    );
    cron.schedule("*/30 * * * *", () => {
      // Fire and forget, errors are logged inside runTikTokDownloadOnce.
      void runTikTokDownloadOnce();
    });
  } else {
    console.log(
      "[Scheduler] TikTok features are disabled (ENABLE_TIKTOK_AUTO and ENABLE_TIKTOK_DOWNLOADER are both false)."
    );
  }
};

