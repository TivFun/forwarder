import fs from "fs";
import path from "path";
import { DownloadedVideo } from "./types";

/**
 * Find downloaded TikTok videos from a directory.
 *
 * The directory should be configured via env:
 *   - TIKTOK_DOWNLOADED_DIR=/absolute/path/to/downie/output
 *
 * This script does not depend on how videos are downloaded (Downie, other tools, etc.),
 * it only inspects the target folder.
 */
export function listDownloadedVideos(
  dirFromEnv: string | undefined = process.env.TIKTOK_DOWNLOADED_DIR
): DownloadedVideo[] {
  if (!dirFromEnv) {
    throw new Error(
      "TIKTOK_DOWNLOADED_DIR is not set. Please set it to your Downie output directory."
    );
  }

  const dir = path.resolve(dirFromEnv);

  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`TIKTOK_DOWNLOADED_DIR is not a directory: ${dir}`);
  }

  const entries = fs.readdirSync(dir);
  const videos: DownloadedVideo[] = [];

  for (const name of entries) {
    const full = path.join(dir, name);
    const s = fs.statSync(full);
    if (!s.isFile()) continue;

    const ext = path.extname(name).toLowerCase();
    if (![".mp4", ".mov", ".mkv", ".webm"].includes(ext)) continue;

    const basename = path.basename(name, ext);

    videos.push({
      filePath: full,
      basename,
      ext,
      size: s.size,
      mtime: s.mtime,
    });
  }

  return videos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/**
 * Get the single newest downloaded video, or null if none.
 */
export function getLatestDownloadedVideo(): DownloadedVideo | null {
  const all = listDownloadedVideos();
  return all[0] ?? null;
}

const LOGS_DIR = path.join(__dirname, "..", "logs");

/**
 * Read the last TikTok video URL saved by tiktok-download.ts.
 * Returns null if the file doesn't exist or can't be read.
 */
export function getLastTikTokUrl(): string | null {
  const urlFilePath = path.join(LOGS_DIR, "last_tiktok_url.txt");
  try {
    if (fs.existsSync(urlFilePath)) {
      const url = fs.readFileSync(urlFilePath, "utf8").trim();
      return url || null;
    }
  } catch (err) {
    console.warn(
      `[upload-tiktok] Failed to read last TikTok URL from ${urlFilePath}:`,
      err
    );
  }
  return null;
}

/**
 * Read the last TikTok video title saved by tiktok-download.ts.
 * Returns null if the file doesn't exist or can't be read.
 */
export function getLastTikTokTitle(): string | null {
  const titleFilePath = path.join(LOGS_DIR, "last_tiktok_title.txt");
  try {
    if (fs.existsSync(titleFilePath)) {
      const title = fs.readFileSync(titleFilePath, "utf8").trim();
      return title || null;
    }
  } catch (err) {
    console.warn(
      `[upload-tiktok] Failed to read last TikTok title from ${titleFilePath}:`,
      err
    );
  }
  return null;
}

/**
 * Read the last TikTok video time saved by tiktok-download.ts.
 * Returns null if the file doesn't exist or can't be read.
 */
export function getLastTikTokTime(): string | null {
  const timeFilePath = path.join(LOGS_DIR, "last_tiktok_time.txt");
  try {
    if (fs.existsSync(timeFilePath)) {
      const time = fs.readFileSync(timeFilePath, "utf8").trim();
      return time || null;
    }
  } catch (err) {
    console.warn(
      `[upload-tiktok] Failed to read last TikTok time from ${timeFilePath}:`,
      err
    );
  }
  return null;
}


