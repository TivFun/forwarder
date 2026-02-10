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
const LAST_PROCESSED_VIDEO_FILE = path.join(LOGS_DIR, "last_processed_tiktok_video.json");

interface ProcessedVideoInfo {
  url: string;
  title: string | null;
  time: string | null;
}

/**
 * Get the last processed TikTok video info to avoid duplicate processing
 */
function getLastProcessedVideo(): ProcessedVideoInfo | null {
  try {
    if (fs.existsSync(LAST_PROCESSED_VIDEO_FILE)) {
      const content = fs.readFileSync(LAST_PROCESSED_VIDEO_FILE, "utf8").trim();
      if (content) {
        const videoInfo = JSON.parse(content) as ProcessedVideoInfo;
        // Validate the structure
        if (videoInfo.url && videoInfo.url.startsWith("http")) {
          return videoInfo;
        }
      }
    }
  } catch (err) {
    console.warn(
      `[TikTok-Auto] Failed to read last processed video info: ${err}`
    );
  }
  return null;
}

/**
 * Save the processed TikTok video info
 */
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

/**
 * Check if the current video is the same as the last processed one
 * Returns true if it's a duplicate (should skip), false if it's new
 */
function isDuplicateVideo(
  current: { url: string; title: string | null; time: string | null },
  last: ProcessedVideoInfo | null
): boolean {
  if (!last) {
    return false; // No previous video, so this is new
  }

  // Check 1: All three match (URL, title, time)
  if (
    current.url === last.url &&
    current.title === last.title &&
    current.time === last.time
  ) {
    return true;
  }

  // Check 2: Title and time both match (even if URL differs, it's likely the same video)
  if (
    current.title &&
    last.title &&
    current.time &&
    last.time &&
    current.title === last.title &&
    current.time === last.time
  ) {
    return true;
  }

  return false; // Different video
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

  // Step 2: Check if we got a valid video
  // If Python returned None (no new non-pinned videos found), skip directly
  if (!videoInfo.url || 
      videoInfo.url === "None" || 
      videoInfo.url.startsWith("None ") ||
      !videoInfo.url.startsWith("http")) {
    console.log(
      `[TikTok-Auto] No new non-pinned videos found. Skipping download/upload.`
    );
    return;
  }

  // Step 3: Check if this is a duplicate video (enhanced comparison with URL, title, time)
  const lastProcessed = getLastProcessedVideo();
  if (isDuplicateVideo({ url: videoInfo.url, title: videoInfo.title, time: videoInfo.time }, lastProcessed)) {
    console.log(
      `[TikTok-Auto] Video already processed. Skipping download/upload.`
    );
    console.log(
      `[TikTok-Auto] Current - URL: ${videoInfo.url}, Title: ${videoInfo.title || "N/A"}, Time: ${videoInfo.time || "N/A"}`
    );
    if (lastProcessed) {
      console.log(
        `[TikTok-Auto] Previous - URL: ${lastProcessed.url}, Title: ${lastProcessed.title || "N/A"}, Time: ${lastProcessed.time || "N/A"}`
      );
    }
    return;
  }

  console.log(
    `[TikTok-Auto] ✅ New video detected: ${videoInfo.url}`
  );
  console.log(
    `[TikTok-Auto] Video info - Title: ${videoInfo.title || "N/A"}, Time: ${videoInfo.time || "N/A"}`
  );
  if (lastProcessed) {
    console.log(
      `[TikTok-Auto] Previous video - URL: ${lastProcessed.url}, Title: ${lastProcessed.title || "N/A"}, Time: ${lastProcessed.time || "N/A"}`
    );
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

    // Upload and get the actual video info that was used
    const uploadedVideoInfo = await uploadTikTokOnce(videoInfo);
    console.log("[TikTok-Auto] ✅ Upload completed successfully!");
    
    // Mark this video as processed (save all info: URL, title, time) - only after successful upload
    // Use the info returned from upload function to ensure consistency
    saveLastProcessedVideo({
      url: uploadedVideoInfo.url || videoInfo.url, // Fallback to videoInfo.url if upload returned null
      title: uploadedVideoInfo.title,
      time: uploadedVideoInfo.time,
    });
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

