import "dotenv/config";
import { checkTikTokVideoInfo } from "./tiktok-check";
import { uploadTikTokOnce } from "../upload-tiktok/index";
import { downloadVideo } from "../utils/ytdlp";
import fs from "fs";
import path from "path";

/**
 * Complete automated workflow: Check → Download (yt-dlp) → Upload to Bilibili
 *
 * 1. Check for new videos via yt-dlp (lightweight metadata fetch)
 * 2. Compare with last processed video to skip duplicates
 * 3. Download via yt-dlp (replaces Downie)
 * 4. Upload to Bilibili
 *
 * Usage:
 *   bun run tiktok-auto-once
 */

const LOGS_DIR = path.join(__dirname, "..", "logs");
const LAST_PROCESSED_VIDEO_FILE = path.join(LOGS_DIR, "last_processed_tiktok_video.json");

interface ProcessedVideoInfo {
  url: string;
  title: string | null;
  time: string | null;
}

function getLastProcessedVideo(): ProcessedVideoInfo | null {
  try {
    if (fs.existsSync(LAST_PROCESSED_VIDEO_FILE)) {
      const content = fs.readFileSync(LAST_PROCESSED_VIDEO_FILE, "utf8").trim();
      if (content) {
        const videoInfo = JSON.parse(content) as ProcessedVideoInfo;
        if (videoInfo.url && videoInfo.url.startsWith("http")) {
          return videoInfo;
        }
      }
    }
  } catch (err) {
    console.warn(`[TikTok-Auto] Failed to read last processed video info: ${err}`);
  }
  return null;
}

function saveLastProcessedVideo(info: ProcessedVideoInfo): void {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    fs.writeFileSync(LAST_PROCESSED_VIDEO_FILE, JSON.stringify(info, null, 2), "utf8");
    console.log(`[TikTok-Auto] Saved processed video info: ${info.url}`);
  } catch (err) {
    console.error(`[TikTok-Auto] Failed to save processed video info: ${err}`);
  }
}

function isDuplicateVideo(
  current: { url: string; title: string | null; time: string | null },
  last: ProcessedVideoInfo | null
): boolean {
  if (!last) return false;

  if (current.url === last.url) return true;

  if (
    current.title && last.title && current.time && last.time &&
    current.title === last.title && current.time === last.time
  ) {
    return true;
  }

  return false;
}

export async function runTikTokAutoOnce(): Promise<void> {
  console.log("[TikTok-Auto] Starting automated TikTok workflow...");

  // Step 1: Check for new videos
  console.log("[TikTok-Auto] Step 1: Checking for new videos...");
  let videoInfo: { url: string | null; title: string | null; time: string | null };
  try {
    videoInfo = await checkTikTokVideoInfo();
  } catch (err) {
    console.error("[TikTok-Auto] Failed to check TikTok videos:", err);
    throw err;
  }

  if (!videoInfo.url || !videoInfo.url.startsWith("http")) {
    console.log("[TikTok-Auto] No valid video found. Skipping.");
    return;
  }

  // Step 2: Duplicate check
  const lastProcessed = getLastProcessedVideo();
  if (isDuplicateVideo(videoInfo as { url: string; title: string | null; time: string | null }, lastProcessed)) {
    console.log("[TikTok-Auto] Video already processed. Skipping.");
    return;
  }

  console.log(`[TikTok-Auto] New video detected: ${videoInfo.url}`);

  // Step 3: Download via yt-dlp
  const downloadDir = process.env.TIKTOK_DOWNLOADED_DIR;
  if (!downloadDir) {
    console.error("[TikTok-Auto] TIKTOK_DOWNLOADED_DIR is not set.");
    return;
  }

  console.log("[TikTok-Auto] Step 2: Downloading video via yt-dlp...");
  const downloadedFile = await downloadVideo(videoInfo.url, downloadDir);

  if (!downloadedFile) {
    console.error("[TikTok-Auto] Download failed. Cannot proceed with upload.");
    return;
  }

  console.log(`[TikTok-Auto] Downloaded: ${downloadedFile}`);

  // Step 4: Upload to Bilibili
  console.log("[TikTok-Auto] Step 3: Uploading to Bilibili...");
  try {
    const uploadedVideoInfo = await uploadTikTokOnce(videoInfo);
    console.log("[TikTok-Auto] Upload completed successfully!");

    saveLastProcessedVideo({
      url: uploadedVideoInfo.url || videoInfo.url,
      title: uploadedVideoInfo.title,
      time: uploadedVideoInfo.time,
    });
  } catch (err) {
    console.error("[TikTok-Auto] Upload failed:", err);
    throw err;
  }

  // Step 5: Clean up downloaded file
  if (fs.existsSync(downloadedFile)) {
    try {
      fs.unlinkSync(downloadedFile);
      console.log(`[TikTok-Auto] Deleted video file: ${downloadedFile}`);
    } catch (deleteErr) {
      console.warn(`[TikTok-Auto] Failed to delete video file: ${deleteErr}`);
    }
  }

  console.log("[TikTok-Auto] Workflow finished successfully!");
}

if (require.main === module) {
  runTikTokAutoOnce().catch((err) => {
    console.error("[TikTok-Auto] Unhandled error:", err);
    process.exit(1);
  });
}
