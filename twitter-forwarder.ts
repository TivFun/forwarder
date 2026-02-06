import "dotenv/config";
import * as cron from "node-cron";
import { integralProcess } from "./tasks/integral-process";

/**
 * Twitter Forwarder - Standalone process for Twitter → Bilibili forwarding
 * 
 * This process only handles Twitter forwarding, independent from TikTok workflow.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --only twitter-forwarder
 *   pm2 stop twitter-forwarder
 *   pm2 restart twitter-forwarder
 */

console.log("[Twitter-Forwarder] Starting Twitter forwarder process...");

const enableTwitter =
  (process.env.ENABLE_TWITTER_FORWARDER || "true").toLowerCase() === "true";

if (enableTwitter) {
  const scheduleInterval = process.env.TWITTER_FORWARDER_INTERVAL || "*/15 * * * *"; // Default: every 15 minutes
  console.log(
    `[Twitter-Forwarder] Scheduling Twitter→Bilibili process with cron: ${scheduleInterval}`
  );
  cron.schedule(scheduleInterval, () => {
    console.log("[Twitter-Forwarder] Running scheduled Twitter forward process...");
    void integralProcess();
  });
  
  // Run once immediately on startup (optional)
  if (process.env.TWITTER_RUN_ON_STARTUP === "true") {
    console.log("[Twitter-Forwarder] Running Twitter forward process immediately on startup...");
    void integralProcess();
  }
} else {
  console.log(
    "[Twitter-Forwarder] ENABLE_TWITTER_FORWARDER is not true, Twitter workflow is disabled."
  );
  console.log("[Twitter-Forwarder] Process will exit. Set ENABLE_TWITTER_FORWARDER=true to enable.");
  process.exit(0);
}

console.log("[Twitter-Forwarder] Twitter forwarder scheduled. Process will keep running.");

