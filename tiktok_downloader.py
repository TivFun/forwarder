import asyncio
import argparse
import os
import sys
from pathlib import Path

# Ensure the TikTok-Api project is on sys.path so that `from TikTokApi import TikTokApi` works.
PROJECT_ROOT = Path(__file__).resolve()
# Go up to the Desktop directory and then into TikTok-Api
DESKTOP_DIR = PROJECT_ROOT.parents[2] / "TikTok-Api"
if DESKTOP_DIR.exists():
    sys.path.append(str(DESKTOP_DIR))

from TikTokApi import TikTokApi
from datetime import datetime


async def get_latest_video_info(
    username: str,
) -> tuple[str, str | None, str | None] | None:
    """
    Find the latest non-pinned TikTok video of a user and return its URL,
    title (caption) and creation time (ISO string).

    This function relies on TikTokApi's internal Playwright-based logic,
    including session management and anti-bot techniques.
    """
    # Try multiple environment variable names for msToken to be flexible:
    # - ms_token (recommended, lower case)
    # - MS_TOKEN
    # - Tiktok_msToken / TikTok_msToken (legacy)
    ms_token = os.environ.get("MS_TOKEN")
    if not ms_token:
        raise RuntimeError(
            "Environment variable 'ms_token' (or 'MS_TOKEN') is not set. "
            "Please export your TikTok msToken cookie as ms_token before running this script."
        )

    async with TikTokApi() as api:
        # Create one browser session. You can adjust num_sessions if needed.
        await api.create_sessions(
            ms_tokens=[ms_token],
            num_sessions=1,
            sleep_after=3,
            headless=False,
            browser=os.getenv("TIKTOK_BROWSER", "firefox"),
        )

        user = api.user(username=username)

        print(f"Fetching latest videos for TikTok user: {username}")

        # Collect a batch of recent videos, then pick the truly newest (by create_time)
        # and ignore pinned ones where possible.
        candidates: list[tuple[float, bool, object]] = []

        async for video in user.videos(count=50):
            # Ensure we have raw data and extracted attributes for this video
            if not getattr(video, "as_dict", None):
                await video.info()

            data = video.as_dict

            # Many TikTok item structures use `isTop` to indicate pinned content.
            # Some implementations use 1/0 instead of True/False, so cast to int/bool.
            raw_is_top = (
                data.get("isTop")
                or data.get("video", {}).get("isTop")
                or data.get("author", {}).get("isTop")
            )
            is_top = (
                bool(int(raw_is_top))
                if isinstance(raw_is_top, (int, str))
                else bool(raw_is_top)
            )

            # Use the already parsed datetime if available
            create_dt = getattr(video, "create_time", None)
            if create_dt is None:
                # Fallback: parse from raw data if needed
                ts_val = data.get("createTime")
                try:
                    ts_int = int(ts_val)
                except (TypeError, ValueError):
                    continue
                else:
                    create_ts = float(ts_int)
            else:
                create_ts = float(create_dt.timestamp())

            candidates.append((create_ts, is_top, video))

        # Only consider non-pinned videos (pinned videos are old content, never new)
        non_pinned = [item for item in candidates if not item[1]]

        if not non_pinned:
            # No non-pinned videos found - return None
            # The TypeScript code will handle comparison with last processed video
            return None

        # max by create_ts - get the newest non-pinned video
        create_ts, is_top, latest_video = max(non_pinned, key=lambda t: t[0])

        # Prepare human-readable creation time
        try:
            created_at = datetime.fromtimestamp(create_ts).isoformat()
        except Exception:
            created_at = None

        # Extract a human-readable title / caption if possible
        title: str | None = None
        try:
            latest_data = latest_video.as_dict  # type: ignore[attr-defined]
            title = (
                latest_data.get("desc")
                or latest_data.get("title")
                or latest_data.get("shareInfo", {}).get("shareTitle")
            )
        except Exception:
            title = None

        # Prefer explicit url attribute if present
        if getattr(latest_video, "url", None):
            return latest_video.url, title, created_at

        # Fallback: construct URL from username and video id
        if getattr(latest_video, "id", None):
            url = f"https://www.tiktok.com/@{username}/video/{latest_video.id}"
            return url, title, created_at

        return None  # pragma: no cover


async def main() -> None:
    """
    Command line entry point for finding the latest non-pinned TikTok video URL.
    """
    parser = argparse.ArgumentParser(
        description="Find latest (non-pinned) TikTok video URL of a user."
    )
    parser.add_argument(
        "--username",
        required=True,
        help="TikTok username (uniqueId) to download videos from.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        help="Deprecated: kept for backwards compatibility, no longer used.",
    )

    args = parser.parse_args()

    info = await get_latest_video_info(args.username)
    if info:
        latest_url, title, created_at = info
        print(f"[RESULT] latest_video_url={latest_url}")
        if title:
            print(f"[RESULT] latest_video_title={title}")
        if created_at:
            print(f"[RESULT] latest_video_time={created_at}")
    else:
        print("[RESULT] latest_video_url=None (no suitable non-pinned video found)")


if __name__ == "__main__":
    asyncio.run(main())
