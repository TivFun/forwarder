import fs from "fs";
import path from "path";
import FormData from "form-data";
import { DownloadedVideo, BilibiliUploadMeta } from "./types";
import { createBilibiliClient } from "./bilibili-client";

/**
 * NOTE:
 * This file implements a *skeleton* of the Bilibili video upload flow based on
 * the public API collection. The exact endpoints and parameters may need to
 * be adjusted to match your local bilibili-API-collection README.
 */

/**
 * Submit the uploaded video to Bilibili with metadata.
 *
 * This assumes the binary upload has already been completed and you have an
 * uploaded filename / URI recognised by Bilibili.
 */
async function submitVideo(
  uploadedFilename: string,
  meta: BilibiliUploadMeta
): Promise<any> {
  const client = createBilibiliClient();

  const csrf = process.env.CSRF;
  if (!csrf) {
    throw new Error("CSRF env var is missing.");
  }

  // Body schema is inspired by bilibili-api-python's VideoMeta and the web GUI.
  const body: any = {
    videos: [
      {
        filename: uploadedFilename,
        title: meta.title,
        desc: meta.desc,
      },
    ],
    title: meta.title,
    desc: meta.desc,
    tid: meta.tid,
    tag: meta.tags.join(","),
    copyright: meta.copyright ?? 2, // 1=原创, 2=转载
    source: meta.sourceUrl ?? "",
    no_reprint: meta.no_reprint ?? 0, // 0=允许二创, 1=禁止二创
    open_elec: meta.open_elec ?? 0, // 0=公开可见, 1=仅自己可见
    up_close_danmaku: meta.up_close_danmaku ?? false,
    up_close_reply: meta.up_close_reply ?? false,
  };

  // Optional fields (only include if provided)
  if (meta.cover) {
    body.cover = meta.cover;
  }
  if (meta.dtime) {
    body.dtime = meta.dtime; // Scheduled publish time (Unix timestamp)
  }
  if (meta.dynamic) {
    body.dynamic = meta.dynamic; // Fan dynamic text
  }
  if (meta.act_reserve_create) {
    body.act_reserve_create = meta.act_reserve_create; // Collection ID
  }

  const resp = await client.post("/x/vu/web/add", body, {
    params: { csrf },
  });

  if (resp.data.code !== 0) {
    throw new Error(
      `Bilibili submit failed: ${resp.data.code} ${resp.data.message}`
    );
  }

  return resp.data;
}

/**
 * Very simplified upload that uses the "bup" web upload endpoint documented
 * in the API collection. For large files you should implement full chunked
 * upload as per the documentation.
 */
async function uploadBinarySimple(
  video: DownloadedVideo
): Promise<string> {
  const client = createBilibiliClient();

  // TODO: replace this with the real preupload endpoint and parameters
  // according to your bilibili-API-collection README.
  // For now we assume a simplified flow where we can POST the whole file.

  // Try common preupload endpoints. The exact one depends on bilibili-API-collection docs.
  // Common alternatives:
  // - /x/vu/web/add/pre
  // - /x/vu/web/add/preupload
  // - /x/v2/web/preupload (current, but may be wrong)
  const preuploadEndpoints = [
    "/x/vu/web/add/pre",
    "/x/vu/web/add/preupload",
    "/x/v2/web/preupload",
  ];

  let preuploadResp: any = null;
  let lastError: Error | null = null;

  for (const endpoint of preuploadEndpoints) {
    try {
      console.log(`[Bilibili] Trying preupload endpoint: ${endpoint}`);
      preuploadResp = await client.get(endpoint, {
        params: {
          r: "upos",
          profile: "ugcupos/bup",
          ssl: "0",
          // Additional params may be required - check bilibili-API-collection docs
        },
      });

      // If we get a valid response (not 404), break
      if (preuploadResp.status === 200 && preuploadResp.data) {
        break;
      }
    } catch (err: any) {
      lastError = err;
      if (err.response?.status === 404) {
        console.warn(`[Bilibili] Endpoint ${endpoint} returned 404, trying next...`);
        continue;
      }
      throw err;
    }
  }

  if (!preuploadResp || preuploadResp.status !== 200) {
    throw new Error(
      `Bilibili preupload failed: All endpoints returned errors. ` +
        `Please check bilibili-API-collection README for the correct preupload endpoint. ` +
        `Last error: ${lastError?.message || "Unknown"}`
    );
  }

  if (preuploadResp.data.code !== 0) {
    throw new Error(
      `Bilibili preupload failed: ${preuploadResp.data.code} ${preuploadResp.data.message}`
    );
  }

  const preData = preuploadResp.data.data;
  const uploadUrl: string = preData.url;
  const auth: string | undefined = preData.auth;
  const bizId: string | undefined = preData.biz_id;

  const form = new FormData();
  form.append("file", fs.createReadStream(video.filePath), {
    filename: path.basename(video.filePath),
  });

  if (auth) {
    form.append("auth", auth);
  }

  const uploadResp = await client.post(uploadUrl, form, {
    headers: {
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (uploadResp.status >= 400) {
    throw new Error(
      `Bilibili binary upload failed with status ${uploadResp.status}`
    );
  }

  // The exact field used as "filename" for submitVideo depends on API.
  // Commonly, preuploadResp.data.data.bfilename or .filename is used.
  const uploadedFilename: string =
    preData.bfilename || preData.filename || bizId || path.basename(video.filePath);

  return uploadedFilename;
}

/**
 * High-level helper: upload a downloaded TikTok video file to Bilibili.
 */
export async function uploadDownloadedVideo(
  video: DownloadedVideo,
  metaOverride?: Partial<BilibiliUploadMeta>
): Promise<any> {
  // Get sourceUrl from override first, then env var, then empty string
  const sourceUrl = metaOverride?.sourceUrl ?? process.env.LAST_TIKTOK_URL ?? "";

  const baseMeta: BilibiliUploadMeta = {
    title: `${video.basename} - ${video.mtime.toISOString()}`,
    desc: sourceUrl ? `Original TikTok URL: ${sourceUrl}` : "",
    tags: ["反田叶月"],
    tid: Number("160"),
    sourceUrl: sourceUrl || undefined,
    copyright: 2,
  };

  const meta: BilibiliUploadMeta = {
    ...baseMeta,
    ...metaOverride,
  };

  console.log(
    `[Bilibili] Uploading video file: ${video.filePath} with title="${meta.title}"`
  );

  const uploadedFilename = await uploadBinarySimple(video);
  console.log(`[Bilibili] Binary upload finished, filename: ${uploadedFilename}`);

  const submitResp = await submitVideo(uploadedFilename, meta);
  console.log("[Bilibili] Submit response:", submitResp);
  return submitResp;
}


