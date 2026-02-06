import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import {
  getLatestDownloadedVideo,
  getLastTikTokUrl,
  getLastTikTokTitle,
  getLastTikTokTime,
} from "./read-downloaded";
import { BilibiliUploadMeta } from "./types";

/**
 * Orchestrator for uploading the latest downloaded TikTok video to Bilibili.
 *
 * Usage:
 *   TIKTOK_DOWNLOADED_DIR=/path/to/Downie/output \
 *   SESSDATA=... CSRF=... BUVID3=... \
 *   bun run upload-tiktok-once
 */
export async function uploadTikTokOnce(): Promise<void> {
  const latest = getLatestDownloadedVideo();

  if (!latest) {
    console.warn(
      "[upload-tiktok] No downloaded video found in TIKTOK_DOWNLOADED_DIR."
    );
    return;
  }

  console.log(
    `[upload-tiktok] Found latest downloaded video: ${latest.filePath} (mtime=${latest.mtime.toISOString()})`
  );

  // Try to get the TikTok source URL, title, and time from saved files
  const sourceUrl = getLastTikTokUrl() || process.env.LAST_TIKTOK_URL;
  const originalTitle = getLastTikTokTitle();
  const videoTime = getLastTikTokTime();

  if (sourceUrl) {
    console.log(`[upload-tiktok] Using TikTok source URL: ${sourceUrl}`);
  } else {
    console.warn(
      "[upload-tiktok] No TikTok source URL found. The video will be uploaded without source attribution."
    );
  }

  // Format title as "原标题 - YYYY-MM-DD TikTok"
  let formattedTitle: string;
  if (originalTitle) {
    // Parse the ISO time string and format as YYYY-MM-DD
    let dateStr = "Unknown";
    if (videoTime) {
      try {
        const date = new Date(videoTime);
        if (!isNaN(date.getTime())) {
          dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
        }
      } catch (e) {
        // Fallback to using video file's mtime
        dateStr = latest.mtime.toISOString().split("T")[0];
      }
    } else {
      // Fallback to using video file's mtime
      dateStr = latest.mtime.toISOString().split("T")[0];
    }
    formattedTitle = `${originalTitle} - ${dateStr} TikTok`;
  } else {
    // Fallback: use basename if no original title available
    const dateStr = latest.mtime.toISOString().split("T")[0];
    formattedTitle = `${latest.basename} - ${dateStr} TikTok`;
  }

  // Prepare upload metadata
  const meta: BilibiliUploadMeta = {
    title: formattedTitle,
    desc: sourceUrl ? `${sourceUrl}` : "",
    tags: ["反田叶月"], 
    tid: Number("160"), 
    sourceUrl: sourceUrl || undefined, 
    copyright: 2, 
  };

  // Call Python script to upload using bilibili-api-python
  const pythonScript = path.resolve(
    __dirname,
    "..",
    "upload_tiktok_to_bilibili.py"
  );

  console.log(
    `[upload-tiktok] Calling Python uploader: ${pythonScript}`
  );

  await new Promise<void>((resolve, reject) => {
    const args = [
      pythonScript,
      "--video-path",
      latest.filePath,
      "--title",
      meta.title,
      "--desc",
      meta.desc,
      "--tags",
      meta.tags.join(","),
      "--tid",
      String(meta.tid),
    ];

    if (meta.sourceUrl) {
      args.push("--source-url", meta.sourceUrl);
    }

    const child = spawn("python3", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (err) => {
      console.error("[upload-tiktok] Failed to start Python uploader:", err);
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        if (stdout.trim() === "SUCCESS") {
          console.log("[upload-tiktok] Upload completed successfully");
          resolve();
        } else {
          reject(
            new Error(
              `Python uploader exited with code ${code} but didn't print SUCCESS`
            )
          );
        }
      } else {
        reject(
          new Error(
            `Python uploader exited with code ${code}. stderr: ${stderr}`
          )
        );
      }
    });
  });
}

if (require.main === module) {
  uploadTikTokOnce().catch((err) => {
    console.error("[upload-tiktok] Unhandled error:", err);
    process.exit(1);
  });
}


