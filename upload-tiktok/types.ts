export interface DownloadedVideo {
  /** Absolute path to the downloaded video file. */
  filePath: string;
  /** File name without extension, used as default title. */
  basename: string;
  /** File extension, e.g. .mp4 */
  ext: string;
  /** File size in bytes. */
  size: number;
  /** Last modified time as Date object. */
  mtime: Date;
}

export interface BilibiliUploadMeta {
  /** Video title shown on Bilibili. */
  title: string;
  /** Video description. */
  desc: string;
  /** Comma-separated tags or array of tags. */
  tags: string[];
  /** Bilibili category ID (tid). */
  tid: number;
  /** Original TikTok URL for attribution (required when copyright=2). */
  sourceUrl?: string;
  /** Copyright type: 1=原创 (original), 2=转载 (reprint). */
  copyright?: number;
  /** Cover image URL (must be uploaded separately first via Bilibili's cover API). */
  cover?: string;
  /** Scheduled publish time (Unix timestamp). If set, video will be published at this time. */
  dtime?: number;
  /** Visibility: 0=公开可见 (public), 1=仅自己可见 (private). */
  open_elec?: 0 | 1;
  /** Disable reprint: 0=允许二创 (allow), 1=禁止二创 (disallow). */
  no_reprint?: 0 | 1;
  /** Fan dynamic text (shown in user's feed). */
  dynamic?: string;
  /** Close danmaku: false=开启弹幕, true=关闭弹幕. */
  up_close_danmaku?: boolean;
  /** Close comments: false=开启评论, true=关闭评论. */
  up_close_reply?: boolean;
  /** Collection ID (if you want to add to a collection). */
  act_reserve_create?: number;
}


