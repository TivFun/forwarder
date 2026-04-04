import "dotenv/config";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { getPythonInterpreter } from "./python-env";

/**
 * Get the yt-dlp binary path by looking in the same bin directory as the Python interpreter.
 */
function getYtDlpPath(): string {
  const pythonPath = getPythonInterpreter();
  const binDir = path.dirname(pythonPath);
  const ytdlpPath = path.join(binDir, "yt-dlp");
  if (fs.existsSync(ytdlpPath)) {
    return ytdlpPath;
  }
  // Fallback to system yt-dlp
  return "yt-dlp";
}

export interface TikTokVideoInfo {
  url: string;
  title: string | null;
  time: string | null;
}

/**
 * Fetch the latest video info for a TikTok user using yt-dlp.
 *
 * Uses `--dump-json` to get metadata without downloading.
 * Only fetches the first (newest) video via `--playlist-items 1`.
 */
export async function fetchLatestVideoInfo(
  username: string
): Promise<TikTokVideoInfo | null> {
  const ytdlp = getYtDlpPath();
  const profileUrl = `https://www.tiktok.com/@${username}`;

  const args = [
    "--dump-json",
    "--playlist-items", "1",
    "--no-warnings",
    "--no-download",
    profileUrl,
  ];

  console.log(`[yt-dlp] Fetching latest video info for @${username}...`);

  return new Promise((resolve) => {
    execFile(ytdlp, args, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[yt-dlp] Failed to fetch video info: ${err.message}`);
        if (stderr) console.error(`[yt-dlp] stderr: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        // yt-dlp may output multiple JSON lines for playlists; take the first
        const firstLine = stdout.trim().split("\n")[0];
        const data = JSON.parse(firstLine);

        const videoId = data.id;
        const url =
          data.webpage_url ||
          data.url ||
          `https://www.tiktok.com/@${username}/video/${videoId}`;

        const title: string | null = data.title || data.description || null;

        let time: string | null = null;
        if (data.timestamp) {
          time = new Date(data.timestamp * 1000).toISOString();
        } else if (data.upload_date) {
          // Format: YYYYMMDD
          const d = data.upload_date;
          time = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00.000Z`;
        }

        console.log(`[yt-dlp] Found video: ${url}`);
        console.log(`[yt-dlp] Title: ${title || "N/A"}`);
        console.log(`[yt-dlp] Time: ${time || "N/A"}`);

        resolve({ url, title, time });
      } catch (parseErr) {
        console.error(`[yt-dlp] Failed to parse output: ${parseErr}`);
        console.error(`[yt-dlp] Raw stdout: ${stdout.slice(0, 500)}`);
        resolve(null);
      }
    });
  });
}

/**
 * Download a TikTok video using yt-dlp.
 *
 * Downloads to the specified output directory with a predictable filename.
 * Returns the path to the downloaded file, or null on failure.
 */
export async function downloadVideo(
  videoUrl: string,
  outputDir: string
): Promise<string | null> {
  const ytdlp = getYtDlpPath();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use yt-dlp's output template; %(id)s ensures unique filenames
  const outputTemplate = path.join(outputDir, "%(title).80s_%(id)s.%(ext)s");

  const args = [
    "-o", outputTemplate,
    "--no-warnings",
    "--no-playlist",
    "--merge-output-format", "mp4",
    videoUrl,
  ];

  console.log(`[yt-dlp] Downloading video: ${videoUrl}`);
  console.log(`[yt-dlp] Output directory: ${outputDir}`);

  return new Promise((resolve) => {
    execFile(
      ytdlp,
      args,
      { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          console.error(`[yt-dlp] Download failed: ${err.message}`);
          if (stderr) console.error(`[yt-dlp] stderr: ${stderr}`);
          resolve(null);
          return;
        }

        // Log yt-dlp output
        if (stdout.trim()) console.log(`[yt-dlp] ${stdout.trim()}`);

        // Find the downloaded file - look for the newest video file in outputDir
        const videoExts = [".mp4", ".mov", ".mkv", ".webm"];
        const files = fs.readdirSync(outputDir)
          .filter((f) => videoExts.includes(path.extname(f).toLowerCase()))
          .map((f) => {
            const fullPath = path.join(outputDir, f);
            return { path: fullPath, mtime: fs.statSync(fullPath).mtime };
          })
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        if (files.length > 0) {
          console.log(`[yt-dlp] Downloaded: ${files[0].path}`);
          resolve(files[0].path);
        } else {
          console.error(`[yt-dlp] Download completed but no video file found in ${outputDir}`);
          resolve(null);
        }
      }
    );
  });
}
