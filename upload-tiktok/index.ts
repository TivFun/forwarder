import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import { getLatestDownloadedVideo } from "./read-downloaded";
import { BilibiliUploadMeta } from "./types";
import { getPythonInterpreter } from "../utils/python-env";

/**
 * Orchestrator for uploading the latest downloaded TikTok video to Bilibili.
 *
 * Usage:
 *   TIKTOK_DOWNLOADED_DIR=/path/to/Downie/output \
 *   SESSDATA=... CSRF=... BUVID3=... \
 *   bun run upload-tiktok-once
 * 
 * @param videoInfo Required video info (url, title, time). 
 *   - url must be a valid HTTP URL (not null)
 *   - title and time can be null, but url is mandatory
 *   - If videoInfo is incomplete, will throw an error
 * @returns The video info that was actually used for upload
 */
export async function uploadTikTokOnce(
  videoInfo: { url: string | null; title: string | null; time: string | null }
): Promise<{ url: string | null; title: string | null; time: string | null }> {
  const latest = getLatestDownloadedVideo();

  if (!latest) {
    throw new Error("[upload-tiktok] No downloaded video found in TIKTOK_DOWNLOADED_DIR.");
  }

  console.log(
    `[upload-tiktok] Found latest downloaded video: ${latest.filePath} (mtime=${latest.mtime.toISOString()})`
  );

  // Validate videoInfo - url is mandatory and must be a valid HTTP URL
  if (!videoInfo || !videoInfo.url || !videoInfo.url.startsWith("http")) {
    throw new Error(
      `[upload-tiktok] Invalid videoInfo: url must be a valid HTTP URL. Got: ${videoInfo?.url || "null"}`
    );
  }

  // Use the provided videoInfo strictly - no fallback
  const sourceUrl = videoInfo.url;
  const originalTitle = videoInfo.title;
  const videoTime = videoInfo.time;
  
  console.log(`[upload-tiktok] Using provided video info: URL=${sourceUrl}, Title=${originalTitle || "null"}, Time=${videoTime || "null"}`);
  console.log(`[upload-tiktok] Using TikTok source URL: ${sourceUrl}`);

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
  const collectionId = process.env.BILIBILI_COLLECTION_ID
    ? Number(process.env.BILIBILI_COLLECTION_ID)
    : undefined;
  
  if (collectionId) {
    console.log(
      `[upload-tiktok] Using collection ID from BILIBILI_COLLECTION_ID: ${collectionId}`
    );
  } else {
    console.log(
      "[upload-tiktok] No collection ID set (BILIBILI_COLLECTION_ID not found), video will not be added to any collection"
    );
  }

  const meta: BilibiliUploadMeta = {
    title: formattedTitle,
    desc: sourceUrl ? `${sourceUrl}` : "",
    tags: ["反田叶月"], 
    tid: Number(process.env.BILIBILI_TID || "85"), 
    sourceUrl: sourceUrl || undefined, 
    copyright: 2,
    act_reserve_create: collectionId, // Collection ID (合集 ID) from environment variable
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

  return await new Promise<{ url: string | null; title: string | null; time: string | null }>((resolve, reject) => {
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

    // Pass original/copyright setting: copyright=1 -> original=true, copyright=2 -> original=false
    // If copyright is 2 (reprint), we need sourceUrl, so original=false
    // If copyright is 1 (original), original=true
    if (meta.copyright === 1) {
      args.push("--original", "true");
    } else if (meta.copyright === 2) {
      args.push("--original", "false");
    }
    // If copyright is not set or is other value, let Python auto-detect from sourceUrl

    // Pass collection ID if provided
    if (meta.act_reserve_create) {
      args.push("--act-reserve-create", String(meta.act_reserve_create));
    }

    const pythonInterpreter = getPythonInterpreter();
    
    const child = spawn(pythonInterpreter, args, {
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
          // Return the video info that was actually used for upload
          resolve({ url: sourceUrl, title: originalTitle, time: videoTime });
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
  console.error("[upload-tiktok] This script cannot be run directly.");
  console.error("[upload-tiktok] It must be called from tiktok-auto.ts with videoInfo parameter.");
  console.error("[upload-tiktok] Use: bun run tiktok-auto-once");
  process.exit(1);
}


