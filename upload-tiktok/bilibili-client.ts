import axios, { AxiosInstance } from "axios";

/**
 * Create an Axios client configured for Bilibili web APIs using cookies.
 *
 * Required env variables:
 *   - SESSDATA: Bilibili SESSDATA cookie.
 *   - CSRF:     Bilibili bili_jct (csrf) token.
 *   - BUVID3:   Optional BUVID3 cookie.
 */
export function createBilibiliClient(): AxiosInstance {
  const sessdata = process.env.SESSDATA;
  const csrf = process.env.CSRF;
  const buvid3 = process.env.BUVID3;

  if (!sessdata || !csrf) {
    throw new Error(
      "Missing SESSDATA or CSRF env var. Please set Bilibili cookies in .env."
    );
  }

  const cookie = [
    `SESSDATA=${sessdata}`,
    `bili_jct=${csrf}`,
    buvid3 ? `BUVID3=${buvid3}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return axios.create({
    baseURL: "https://member.bilibili.com",
    timeout: 60000,
    headers: {
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://member.bilibili.com/platform/upload/video/frame",
    },
  });
}


