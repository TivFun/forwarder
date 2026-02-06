import "dotenv/config";
import { runTikTokDownloadOnce } from "./tiktok-download";
import { checkTikTokVideoInfo } from "./tiktok-check";
import { uploadTikTokOnce } from "../upload-tiktok/index";
import { getLatestDownloadedVideo } from "../upload-tiktok/read-downloaded";
import fs from "fs";
import path from "path";

/**
 * Complete automated workflow: Check → Download → Upload to Bilibili
 * 
 * Optimized flow to avoid unnecessary downloads:
 * 1. Sniff for new videos (fetch info only, no download)
 * 2. Check if it's a new video (by comparing with last processed URL)
 * 3. Only if new video: Download the video using Downie
 * 4. Wait for download to complete
 * 5. Upload to Bilibili
 * 
 * This avoids downloading videos that have already been processed.
 * 
 * Usage:
 *   bun run tiktok-auto-once
 * 
 * Or schedule it:
 *   ENABLE_TIKTOK_AUTO=true in .env
 */

const LOGS_DIR = path.join(__dirname, "..", "logs");
const LAST_PROCESSED_URL_FILE = path.join(LOGS_DIR, "last_processed_tiktok_url.txt");

/**
 * Get the last processed TikTok video URL to avoid duplicate processing
 */
function getLastProcessedUrl(): string | null {
  try {
    if (fs.existsSync(LAST_PROCESSED_URL_FILE)) {
      const url = fs.readFileSync(LAST_PROCESSED_URL_FILE, "utf8").trim();
      return url || null;
    }
  } catch (err) {
    console.warn(
      `[TikTok-Auto] Failed to read last processed URL: ${err}`
    );
  }
  return null;
}

/**
 * Save the processed TikTok video URL
 */
function saveLastProcessedUrl(url: string): void {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    fs.writeFileSync(LAST_PROCESSED_URL_FILE, url, "utf8");
    console.log(`[TikTok-Auto] Saved processed URL: ${url}`);
  } catch (err) {
    console.error(`[TikTok-Auto] Failed to save processed URL: ${err}`);
  }
}

/**
 * Wait for a new video file to appear in the download directory
 * Returns the new video file path, or null if timeout
 * 
 * This function monitors the download directory for new video files
 * and waits until the file size stabilizes (not changing for 5 seconds).
 */
async function waitForDownload(
  downloadDir: string,
  timeoutMs: number = 300000, // 5 minutes default timeout
  checkIntervalMs: number = 3000 // Check every 3 seconds
): Promise<string | null> {
  const startTime = Date.now();
  const initialFiles = new Set<string>();
  const fileSizes = new Map<string, number>(); // Track file sizes to detect stability
  
  // Get initial file list
  try {
    if (fs.existsSync(downloadDir)) {
      const files = fs.readdirSync(downloadDir);
      files.forEach((file) => {
        const ext = path.extname(file).toLowerCase();
        if ([".mp4", ".mov", ".mkv", ".webm"].includes(ext)) {
          initialFiles.add(file);
          try {
            const filePath = path.join(downloadDir, file);
            const stat = fs.statSync(filePath);
            fileSizes.set(file, stat.size);
          } catch {
            // Ignore errors reading initial file size
          }
        }
      });
    }
  } catch (err) {
    console.warn(`[TikTok-Auto] Failed to read initial files: ${err}`);
  }

  console.log(
    `[TikTok-Auto] Waiting for new video file in ${downloadDir} (timeout: ${timeoutMs / 1000}s)...`
  );

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      try {
        if (!fs.existsSync(downloadDir)) {
          return; // Directory doesn't exist yet, keep waiting
        }

        const files = fs.readdirSync(downloadDir);
        const videoFiles = files.filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return [".mp4", ".mov", ".mkv", ".webm"].includes(ext);
        });

        // Check for new files
        for (const file of videoFiles) {
          const isNewFile = !initialFiles.has(file);
          if (!isNewFile) continue; // Skip existing files

          const filePath = path.join(downloadDir, file);
          try {
            const stat = fs.statSync(filePath);
            const currentSize = stat.size;
            const lastSize = fileSizes.get(file);

            if (currentSize === 0) {
              // File exists but empty, still downloading
              continue;
            }

            if (lastSize === undefined) {
              // First time seeing this new file
              fileSizes.set(file, currentSize);
              console.log(
                `[TikTok-Auto] New file detected: ${file} (size: ${currentSize} bytes, monitoring...)`
              );
            } else if (currentSize === lastSize) {
              // File size hasn't changed - check if stable for enough time
              const firstSeenTime = fileSizes.get(`${file}_first_seen`) as number | undefined;
              if (firstSeenTime === undefined) {
                // First time we see it stable, record the time
                fileSizes.set(`${file}_first_seen`, Date.now());
              } else {
                // Check if stable for at least 5 seconds
                const stableDuration = Date.now() - firstSeenTime;
                if (stableDuration >= 5000) {
                  // File size stable for 5+ seconds, consider it complete
                  clearInterval(checkInterval);
                  console.log(
                    `[TikTok-Auto] ✅ New video file ready: ${filePath} (size: ${currentSize} bytes, stable for ${Math.round(stableDuration / 1000)}s)`
                  );
                  resolve(filePath);
                  return;
                }
              }
            } else {
              // File size changed, reset stability tracking
              fileSizes.set(file, currentSize);
              fileSizes.delete(`${file}_first_seen`);
            }
          } catch (err) {
            // File might be locked, continue checking
            continue;
          }
        }

        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          console.warn(
            `[TikTok-Auto] ⏱️ Timeout waiting for download (${timeoutMs / 1000}s)`
          );
          resolve(null);
        }
      } catch (err) {
        console.warn(`[TikTok-Auto] Error checking for new files: ${err}`);
      }
    }, checkIntervalMs);
  });
}

/**
 * Complete automated workflow: Check → Download → Upload
 * 
 * Optimized flow:
 * 1. Check for new videos (sniff only, no download)
 * 2. If new video found, then download
 * 3. Upload to Bilibili
 */
export async function runTikTokAutoOnce(): Promise<void> {
  console.log("[TikTok-Auto] Starting automated TikTok workflow...");

  // Step 1: Check for new videos (sniff only, no download)
  console.log("[TikTok-Auto] Step 1: Checking for new videos (sniff mode, no download)...");
  let videoInfo: { url: string | null; title: string | null; time: string | null };
  try {
    videoInfo = await checkTikTokVideoInfo();
  } catch (err) {
    console.error("[TikTok-Auto] Failed to check TikTok videos:", err);
    throw err;
  }

  const latestUrl = videoInfo.url;
  if (!latestUrl) {
    console.warn(
      "[TikTok-Auto] No TikTok URL found. Skipping download/upload."
    );
    return;
  }

  // Step 2: Check if this is a new video (duplicate check)
  const lastProcessedUrl = getLastProcessedUrl();
  if (lastProcessedUrl === latestUrl) {
    console.log(
      `[TikTok-Auto] Video ${latestUrl} was already processed. Skipping download/upload.`
    );
    return;
  }

  console.log(
    `[TikTok-Auto] ✅ New video detected: ${latestUrl} (previous: ${lastProcessedUrl || "none"})`
  );
  console.log(
    `[TikTok-Auto] Video info - Title: ${videoInfo.title || "N/A"}, Time: ${videoInfo.time || "N/A"}`
  );

  // Step 3: Save video info for download script to use
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  // Save the video info so download script can use it
  if (latestUrl) {
    fs.writeFileSync(path.join(LOGS_DIR, "last_tiktok_url.txt"), latestUrl, "utf8");
  }
  if (videoInfo.title) {
    fs.writeFileSync(path.join(LOGS_DIR, "last_tiktok_title.txt"), videoInfo.title, "utf8");
  }
  if (videoInfo.time) {
    fs.writeFileSync(path.join(LOGS_DIR, "last_tiktok_time.txt"), videoInfo.time, "utf8");
  }

  // Step 4: Now trigger download (only for new videos)
  console.log("[TikTok-Auto] Step 2: Triggering download for new video...");
  try {
    await runTikTokDownloadOnce();
  } catch (err) {
    console.error("[TikTok-Auto] Failed to trigger download:", err);
    throw err;
  }

  // Step 5: Wait for download to complete
  const downloadDir = process.env.TIKTOK_DOWNLOADED_DIR;
  if (!downloadDir) {
    console.error(
      "[TikTok-Auto] TIKTOK_DOWNLOADED_DIR is not set. Cannot wait for download."
    );
    return;
  }

  console.log("[TikTok-Auto] Step 3: Waiting for download to complete...");
  const downloadTimeout = Number(process.env.TIKTOK_DOWNLOAD_TIMEOUT || "300000"); // 5 minutes default
  const downloadedFile = await waitForDownload(downloadDir, downloadTimeout);

  if (!downloadedFile) {
    console.error(
      "[TikTok-Auto] Download timeout or failed. Cannot proceed with upload."
    );
    return;
  }

  // Step 6: Upload to Bilibili
  console.log("[TikTok-Auto] Step 4: Uploading to Bilibili...");
  let uploadedVideoPath: string | null = null;
  try {
    // Get the video path before uploading (in case it changes during upload)
    const videoToUpload = getLatestDownloadedVideo();
    if (videoToUpload) {
      uploadedVideoPath = videoToUpload.filePath;
    }

    await uploadTikTokOnce();
    console.log("[TikTok-Auto] ✅ Upload completed successfully!");
    
    // Mark this URL as processed
    saveLastProcessedUrl(latestUrl);
  } catch (err) {
    console.error("[TikTok-Auto] Upload failed:", err);
    // Don't mark as processed if upload failed, so we can retry
    throw err;
  }

  // Step 7: Delete uploaded video to save space
  if (uploadedVideoPath && fs.existsSync(uploadedVideoPath)) {
    try {
      console.log(`[TikTok-Auto] Deleting uploaded video to save space: ${uploadedVideoPath}`);
      fs.unlinkSync(uploadedVideoPath);
      console.log(`[TikTok-Auto] ✅ Video file deleted successfully`);
    } catch (deleteErr) {
      console.error(
        `[TikTok-Auto] ⚠️ Failed to delete video file: ${deleteErr}. ` +
        `You may need to manually delete: ${uploadedVideoPath}`
      );
      // Don't throw - deletion failure shouldn't break the workflow
    }
  } else if (uploadedVideoPath) {
    console.warn(
      `[TikTok-Auto] Video file not found for deletion: ${uploadedVideoPath} (may have been deleted already)`
    );
  }

  console.log("[TikTok-Auto] ✅ Complete workflow finished successfully!");
}

// Allow running directly
if (require.main === module) {
  runTikTokAutoOnce().catch((err) => {
    console.error("[TikTok-Auto] Unhandled error:", err);
    process.exit(1);
  });
}

