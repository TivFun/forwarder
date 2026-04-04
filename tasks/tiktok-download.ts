import "dotenv/config";
import { fetchLatestVideoInfo, downloadVideo } from "../utils/ytdlp";

/**
 * Fetch and download the latest TikTok video using yt-dlp.
 *
 * Replaces the old Downie-based workflow with a direct yt-dlp download.
 *
 * Usage:
 *   bun run tiktok-download-once
 */
export async function runTikTokDownloadOnce(): Promise<void> {
  const username = process.env.TIKTOK_USERNAME;
  const downloadDir = process.env.TIKTOK_DOWNLOADED_DIR;

  if (!username) {
    console.error(
      "[TikTok] Environment variable TIKTOK_USERNAME is not set."
    );
    return;
  }

  if (!downloadDir) {
    console.error(
      "[TikTok] Environment variable TIKTOK_DOWNLOADED_DIR is not set."
    );
    return;
  }

  console.log(`[TikTok] Fetching latest video for user "${username}"...`);

  const info = await fetchLatestVideoInfo(username);

  if (!info || !info.url || !info.url.startsWith("http")) {
    console.warn(
      `[TikTok] No valid TikTok URL found (got: ${info?.url || "null"}). Nothing to download.`
    );
    return;
  }

  console.log(`[TikTok] Downloading: ${info.url}`);

  const downloaded = await downloadVideo(info.url, downloadDir);

  if (downloaded) {
    console.log(`[TikTok] Download complete: ${downloaded}`);
  } else {
    console.error("[TikTok] Download failed.");
  }
}

if (require.main === module) {
  runTikTokDownloadOnce().catch((err) => {
    console.error("[TikTok] Unhandled error during download:", err);
    process.exit(1);
  });
}
