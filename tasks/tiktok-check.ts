import "dotenv/config";
import { fetchLatestVideoInfo } from "../utils/ytdlp";

/**
 * Check for new TikTok videos without downloading.
 * Uses yt-dlp to fetch the latest video metadata.
 */
export async function checkTikTokVideoInfo(): Promise<{
  url: string | null;
  title: string | null;
  time: string | null;
}> {
  const username = process.env.TIKTOK_USERNAME;

  if (!username) {
    console.error(
      "[TikTok-Check] Environment variable TIKTOK_USERNAME is not set."
    );
    return { url: null, title: null, time: null };
  }

  console.log(
    `[TikTok-Check] Checking for new videos for user "${username}"...`
  );

  const info = await fetchLatestVideoInfo(username);

  if (!info) {
    console.log("[TikTok-Check] No video info returned.");
    return { url: null, title: null, time: null };
  }

  console.log(`[TikTok-Check] Latest video: ${info.url}`);
  return info;
}
