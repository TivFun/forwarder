import * as cron from "node-cron";
import { integralProcess } from "./tasks/integral-process";
import { runTikTokDownloadOnce } from "./tasks/tiktok-download";

/**
 * Schedule background jobs based on feature flags.
 *
 * Flags (environment variables):
 *   - ENABLE_TWITTER_FORWARDER=true  => enable Twitter → Bilibili text/image workflow.
 *   - ENABLE_TIKTOK_DOWNLOADER=true => enable periodic TikTok video downloads.
 *
 * With this design, users can decide which features to enable
 * instead of always running everything at once.
 */
export const scheduledProcess = async () => {
  const enableTwitter =
    (process.env.ENABLE_TWITTER_FORWARDER || "true").toLowerCase() === "true";
  const enableTikTok =
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

  if (enableTikTok) {
    console.log(
      "[Scheduler] ENABLE_TIKTOK_DOWNLOADER=true, scheduling TikTok downloader every 30 minutes."
    );
    cron.schedule("*/30 * * * *", () => {
      // Fire and forget, errors are logged inside runTikTokDownloadOnce.
      void runTikTokDownloadOnce();
    });
  } else {
    console.log(
      "[Scheduler] ENABLE_TIKTOK_DOWNLOADER is not true, TikTok downloader will not be scheduled."
    );
  }
};

