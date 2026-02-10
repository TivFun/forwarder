import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getPythonInterpreter } from "../utils/python-env";

/**
 * Check for new TikTok videos without downloading.
 * 
 * This function only fetches video information (URL, title, time) to check
 * if there's a new video, without triggering the download process.
 * 
 * Returns the latest video URL, title, and time, or null if no video found.
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

  if (
    !process.env.ms_token &&
    !process.env.MS_TOKEN &&
    !process.env.Tiktok_msToken &&
    !process.env.TikTok_msToken
  ) {
    console.error(
      "[TikTok-Check] Environment variable ms_token (or MS_TOKEN) is not set."
    );
    return { url: null, title: null, time: null };
  }

  const scriptPath = path.resolve(__dirname, "..", "tiktok_downloader.py");

  console.log(
    `[TikTok-Check] Checking for new videos for user "${username}" (no download)...`
  );
  console.log(`[TikTok-Check] Python script path: ${scriptPath}`);
  console.log(`[TikTok-Check] Script exists: ${fs.existsSync(scriptPath)}`);

  return new Promise((resolve) => {
    let latestUrl: string | null = null;
    let latestTitle: string | null = null;
    let latestTime: string | null = null;
    let stdoutBuffer = "";

    const pythonInterpreter = getPythonInterpreter();
    console.log(`[TikTok-Check] Using Python interpreter: ${pythonInterpreter}`);

    const child = spawn(
      pythonInterpreter,
      [scriptPath, "--username", username, "--count", "1"],
      {
        stdio: ["ignore", "pipe", "inherit"],
        env: process.env,
      }
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutBuffer += text;

      let index: number;
      while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);

        // Pass-through logging
        if (line && !line.startsWith("[RESULT]")) {
          console.log(line);
        }

        const urlMarker = "[RESULT] latest_video_url=";
        if (line.startsWith(urlMarker)) {
          const urlValue = line.slice(urlMarker.length).trim();
          // Handle Python's None output - treat as null
          if (urlValue === "None" || urlValue.startsWith("None ")) {
            latestUrl = null;
          } else {
            latestUrl = urlValue;
          }
        }

        const titleMarker = "[RESULT] latest_video_title=";
        if (line.startsWith(titleMarker)) {
          latestTitle = line.slice(titleMarker.length).trim();
        }

        const timeMarker = "[RESULT] latest_video_time=";
        if (line.startsWith(timeMarker)) {
          latestTime = line.slice(timeMarker.length).trim();
        }
      }
    });

    child.on("error", (err) => {
      console.error("[TikTok-Check] ❌ Failed to start Python script:", err);
      console.error(`[TikTok-Check] Python interpreter: ${pythonInterpreter}`);
      console.error(`[TikTok-Check] Script path: ${scriptPath}`);
      resolve({ url: null, title: null, time: null });
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[TikTok-Check] ✅ Video info check completed. URL: ${latestUrl || "none"}`);
        resolve({ url: latestUrl, title: latestTitle, time: latestTime });
      } else {
        console.error(`[TikTok-Check] ❌ Python script exited with code ${code}.`);
        console.error(`[TikTok-Check] Latest URL found: ${latestUrl || "none"}`);
        resolve({ url: null, title: null, time: null });
      }
    });
  });
}

