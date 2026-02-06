import "dotenv/config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getPythonInterpreter } from "../utils/python-env";

/**
 * Run the Python-based TikTok helper once, then pass the result to Downie.
 *
 * This script is designed to be called manually via Bun:
 *
 *   bun run tiktok-download-once
 *
 * It relies on:
 *   - Environment variable `ms_token` (or `MS_TOKEN`) for TikTok cookie.
 *   - Environment variable `TIKTOK_USERNAME` as the target TikTok account.
 *   - Optional environment variable `TIKTOK_COUNT` for number of videos (kept for compatibility, not used by Python now).
 *   - Optional environment variable `DOWNIE_APP_NAME` (default: "Downie 4").
 *
 * The Python script will output the latest non-pinned TikTok video URL, and this
 * script will invoke Downie to download it locally.
 */

async function openWithDownie(videoUrl: string): Promise<void> {
  const downieAppName = process.env.DOWNIE_APP_NAME || "Downie 4";

  console.log(
    `[TikTok] Launching Downie (${downieAppName}) for URL: ${videoUrl}`
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn("open", ["-a", downieAppName, videoUrl], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      console.error("[TikTok] Failed to open Downie:", err);
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("[TikTok] Downie launched successfully.");
        resolve();
      } else {
        console.error(`[TikTok] Downie process exited with code ${code}.`);
        reject(new Error(`Downie exited with code ${code}`));
      }
    });
  });
}

export async function runTikTokDownloadOnce(): Promise<void> {
  const username = process.env.TIKTOK_USERNAME;
  const count = Number(process.env.TIKTOK_COUNT || "1");

  if (!username) {
    console.error(
      "[TikTok] Environment variable TIKTOK_USERNAME is not set. Please set it before running."
    );
    return;
  }

  if (
    !process.env.ms_token &&
    !process.env.MS_TOKEN &&
    !process.env.Tiktok_msToken &&
    !process.env.TikTok_msToken
  ) {
    console.error(
      "[TikTok] Environment variable ms_token (or MS_TOKEN) is not set. "
      + "Please export your TikTok msToken cookie as ms_token before running."
    );
    return;
  }

  const scriptPath = path.resolve(__dirname, "..", "tiktok_downloader.py");

  console.log(
    `[TikTok] Starting Python downloader for user "${username}", count=${count} using script: ${scriptPath}`
  );

  await new Promise<void>((resolve, reject) => {
    let latestUrl: string | null = null;
    let stdoutBuffer = "";

    const pythonInterpreter = getPythonInterpreter();
    
    const child = spawn(
      pythonInterpreter,
      [scriptPath, "--username", username, "--count", String(count)],
      {
        // Capture stdout so we can parse the result line, keep stderr attached.
        stdio: ["ignore", "pipe", "inherit"],
        env: process.env,
      }
    );

    let latestTitle: string | null = null;
    let latestTime: string | null = null;

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutBuffer += text;

      let index: number;
      while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);

        // Pass-through logging
        if (line) {
          console.log(line);
        }

        const urlMarker = "[RESULT] latest_video_url=";
        if (line.startsWith(urlMarker)) {
          latestUrl = line.slice(urlMarker.length).trim();
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
      console.error("[TikTok] Failed to start Python downloader:", err);
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("[TikTok] Downloader finished successfully.");

        if (!latestUrl) {
          console.warn(
            "[TikTok] No latest_video_url found in Python output. Nothing to send to Downie."
          );
          resolve();
          return;
        }

        // Save the TikTok URL, title, and time to files so upload-tiktok can read them later
        const logsDir = path.join(__dirname, "..", "logs");
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const urlFilePath = path.join(logsDir, "last_tiktok_url.txt");
        fs.writeFileSync(urlFilePath, latestUrl, "utf8");
        console.log(`[TikTok] Saved latest video URL to: ${urlFilePath}`);

        if (latestTitle) {
          const titleFilePath = path.join(logsDir, "last_tiktok_title.txt");
          fs.writeFileSync(titleFilePath, latestTitle, "utf8");
          console.log(`[TikTok] Saved latest video title to: ${titleFilePath}`);
        }

        if (latestTime) {
          const timeFilePath = path.join(logsDir, "last_tiktok_time.txt");
          fs.writeFileSync(timeFilePath, latestTime, "utf8");
          console.log(`[TikTok] Saved latest video time to: ${timeFilePath}`);
        }

        openWithDownie(latestUrl)
          .then(() => resolve())
          .catch((err) => reject(err));
      } else {
        console.error(`[TikTok] Downloader exited with code ${code}.`);
        reject(new Error(`Downloader exited with code ${code}`));
      }
    });
  });
}

// Allow running directly via `bun run tasks/tiktok-download.ts`
if (require.main === module) {
  runTikTokDownloadOnce().catch((err) => {
    console.error("[TikTok] Unhandled error during download:", err);
    process.exit(1);
  });
}


