#!/usr/bin/env python3
"""
Upload a TikTok video file to Bilibili using bilibili-api-python.

This script is called from Node/TypeScript and receives video metadata via
command-line arguments and environment variables.

Usage:
    python3 upload_tiktok_to_bilibili.py \
        --video-path /path/to/video.mp4 \
        --title "Video Title" \
        --desc "Video Description" \
        --source-url "https://www.tiktok.com/..." \
        --tags "tag1,tag2,tag3" \
        --tid 160

Environment variables required:
    - SESSDATA: Bilibili SESSDATA cookie
    - CSRF: Bilibili bili_jct (csrf) token
    - BUVID3: Optional BUVID3 cookie
"""

import asyncio
import argparse
import os
import sys
import subprocess
import tempfile
from pathlib import Path

# Ensure bilibili-api is on sys.path
# Try to find it in common locations
possible_paths = [
    Path(__file__).parents[2] / "bilibili-api-main",
    Path(__file__).parents[1] / "bilibili-api-main",
    Path.home() / "Desktop" / "bilibili-api-main",
]

for p in possible_paths:
    if p.exists():
        sys.path.insert(0, str(p))
        break

try:
    from bilibili_api import video_uploader, Credential
except ImportError:
    print(
        "ERROR: bilibili-api-python is not installed or not found.",
        file=sys.stderr,
    )
    print(
        "Please install it: pip install bilibili-api-python",
        file=sys.stderr,
    )
    sys.exit(1)


def extract_cover_from_video(video_path: str) -> str:
    """Extract first frame from video as cover image using ffmpeg.

    Ensures proper aspect ratio by maintaining original video proportions
    and fitting to Bilibili's recommended dimensions (16:9 ratio).
    """
    # Create a temporary file for the cover image
    cover_path = tempfile.NamedTemporaryFile(
        suffix=".jpg", delete=False, dir=os.path.dirname(video_path)
    ).name

    try:
        # First, get video dimensions to calculate proper scaling
        try:
            probe_result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height",
                    "-of",
                    "json",
                    video_path,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            import json

            probe_data = json.loads(probe_result.stdout.decode("utf-8"))
            video_width = int(probe_data["streams"][0]["width"])
            video_height = int(probe_data["streams"][0]["height"])
            video_aspect = video_width / video_height

            print(
                f"[Bilibili] Video dimensions: {video_width}x{video_height} (aspect ratio: {video_aspect:.3f})",
                file=sys.stderr,
            )
        except (
            FileNotFoundError,
            subprocess.CalledProcessError,
            KeyError,
            ValueError,
        ) as e:
            # Fallback: use default dimensions if ffprobe fails
            print(
                f"[Bilibili] Warning: Could not probe video dimensions ({e}), using default scaling",
                file=sys.stderr,
            )
            video_width = 1080
            video_height = 1920  # Common TikTok vertical video size
            video_aspect = video_width / video_height

        # Bilibili recommended aspect ratio is 16:9 (≈1.778)
        target_aspect = 16 / 9
        target_width = 1280
        target_height = 720

        # Calculate scaling to maintain aspect ratio
        # Always crop to maintain proper aspect ratio (like the reference images)
        # This ensures the image may be incomplete but has correct proportions
        if video_aspect > target_aspect:
            # Video is wider than 16:9, scale by height and crop width (center crop)
            scale_filter = f"scale=-1:{target_height},crop={target_width}:{target_height}:(iw-ow)/2:0"
            print(
                f"[Bilibili] Video is wider than 16:9, will crop sides to maintain aspect ratio",
                file=sys.stderr,
            )
        elif video_aspect < target_aspect:
            # Video is taller than 16:9, scale by width and crop height (center crop)
            scale_filter = f"scale={target_width}:-1,crop={target_width}:{target_height}:0:(ih-oh)/2"
            print(
                f"[Bilibili] Video is taller than 16:9, will crop top/bottom to maintain aspect ratio",
                file=sys.stderr,
            )
        else:
            # Video is already 16:9, just scale
            scale_filter = f"scale={target_width}:{target_height}"
            print(
                f"[Bilibili] Video is already 16:9, scaling to {target_width}x{target_height}",
                file=sys.stderr,
            )

        # Use ffmpeg to extract first frame with proper aspect ratio
        result = subprocess.run(
            [
                "ffmpeg",
                "-i",
                video_path,
                "-ss",
                "00:00:01",  # Extract frame at 1 second (skip black frames)
                "-vframes",
                "1",
                "-vf",
                scale_filter,  # Scale and crop/pad to maintain proper aspect ratio
                "-q:v",
                "2",  # High quality
                "-f",
                "image2",  # Force image format
                "-y",  # Overwrite output file
                cover_path,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # Verify the extracted file exists and is not empty
        if not os.path.exists(cover_path) or os.path.getsize(cover_path) == 0:
            raise RuntimeError(
                f"Failed to extract cover image: file {cover_path} is empty or missing"
            )

        # Verify it's a valid image by trying to open it
        try:
            from PIL import Image

            # Open and verify the image
            img = Image.open(cover_path)
            img.verify()  # Verify it's a valid image

            # Reopen for actual use (verify() closes the file)
            img = Image.open(cover_path)
            # Convert to RGB if necessary (some formats like PNG need conversion)
            if img.mode != "RGB":
                img = img.convert("RGB")
            # Save as proper JPEG to ensure compatibility
            final_cover_path = cover_path.replace(".jpg", "_final.jpg")
            img.save(final_cover_path, "JPEG", quality=95)
            img.close()

            # Remove the original and use the converted one
            if os.path.exists(cover_path):
                os.unlink(cover_path)

            return final_cover_path
        except ImportError:
            # PIL not available, just return the path and hope for the best
            print(
                "WARNING: PIL not available, cannot verify cover image",
                file=sys.stderr,
            )
            return cover_path
        except Exception as e:
            raise RuntimeError(
                f"Extracted cover image is invalid: {e}. "
                f"ffmpeg may have failed silently."
            )
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode("utf-8") if e.stderr else ""
        raise RuntimeError(
            f"ffmpeg failed to extract cover image: {stderr}. "
            f"Please ensure ffmpeg is installed: brew install ffmpeg (on macOS)"
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg is not installed. Please install it: brew install ffmpeg (on macOS)"
        )


async def upload_video(
    video_path: str,
    title: str,
    desc: str,
    source_url: str | None,
    tags: list[str],
    tid: int,
    original: bool
    | None = None,  # Optional: True=原创, False=转载. If None, auto-detect from source_url
    act_reserve_create: int | None = None,  # Optional: Collection ID (合集 ID)
):
    """Upload video to Bilibili using bilibili-api-python."""
    sessdata = os.environ.get("SESSDATA")
    csrf = os.environ.get("CSRF")
    buvid3 = os.environ.get("BUVID3", "")

    if not sessdata or not csrf:
        raise RuntimeError("SESSDATA and CSRF environment variables are required.")

    credential = Credential(
        sessdata=sessdata,
        bili_jct=csrf,
        buvid3=buvid3,
    )

    # Check if we should use video's first frame as cover (no custom cover extraction)
    use_video_cover = (
        os.environ.get("BILIBILI_USE_VIDEO_COVER", "false").lower() == "true"
    )

    cover_for_meta = None
    cover_path = None

    if use_video_cover:
        # Don't extract cover, let Bilibili use video's first frame
        print(
            "[Bilibili] Using video's first frame as cover (BILIBILI_USE_VIDEO_COVER=true)",
            file=sys.stderr,
        )
    else:
        # Extract cover image from video with proper 16:9 aspect ratio
        cover_path = extract_cover_from_video(video_path)
        # Ensure absolute path
        cover_path = os.path.abspath(cover_path)
        print(f"[Bilibili] Extracted cover image: {cover_path}", file=sys.stderr)

        # Verify cover file exists before passing to VideoMeta
        if not os.path.exists(cover_path):
            raise RuntimeError(f"Cover image file does not exist: {cover_path}")
        if os.path.getsize(cover_path) == 0:
            raise RuntimeError(f"Cover image file is empty: {cover_path}")

        # Try to create Picture object from file bytes to avoid path issues
        try:
            from bilibili_api.utils.picture import Picture

            # Read image bytes and create Picture object
            with open(cover_path, "rb") as f:
                cover_bytes = f.read()

            # Try from_bytes if available, otherwise fallback to from_file
            try:
                picture_obj = Picture().from_bytes(cover_bytes, "jpg")
                cover_for_meta = picture_obj
            except (AttributeError, TypeError):
                # Fallback to from_file with absolute path
                cover_for_meta = cover_path
        except Exception as e:
            print(
                f"WARNING: Failed to create Picture object, using path directly: {e}",
                file=sys.stderr,
            )
            cover_for_meta = cover_path

    # Build VideoMeta using bilibili-api-python's native API
    # Set original=False for reprint (转载), original=True for original (原创)
    # When original=False, source URL is required
    # If original is not explicitly provided, auto-detect from source_url
    if original is None:
        original = False if source_url else True  # Auto-detect: 有 source_url 就是转载

    meta = video_uploader.VideoMeta(
        tid=tid,
        title=title,
        desc=desc,
        tags=tags,
        cover=cover_for_meta,  # None = use video's first frame, or extracted cover with 16:9 aspect ratio
        original=original,  # Use the provided or auto-detected value
        source=source_url if source_url else None,  # Required when original=False
        no_reprint=False,  # Allow secondary creation
        act_reserve_create=act_reserve_create,  # Collection ID (合集 ID), if provided
    )

    print(
        f"[Bilibili] Created VideoMeta: original={meta.original}, tid={tid}, source={meta.source}, act_reserve_create={getattr(meta, 'act_reserve_create', None)}",
        file=sys.stderr,
    )

    if act_reserve_create:
        print(
            f"[Bilibili] ✅ Collection ID set: {act_reserve_create} (视频将添加到合集 ID: {act_reserve_create})",
            file=sys.stderr,
        )
    else:
        print(
            "[Bilibili] No collection ID provided, video will not be added to any collection",
            file=sys.stderr,
        )

    # Create uploader page
    page = video_uploader.VideoUploaderPage(
        path=video_path,
        title=title,
        description=desc,
    )

    # Create uploader using bilibili-api-python's native API
    uploader = video_uploader.VideoUploader(
        [page],
        meta,
        credential,
        line=video_uploader.Lines.QN,
    )

    # Optional: log upload events for debugging
    @uploader.on("__ALL__")
    async def on_event(data):
        print(f"[Bilibili Upload Event] {data}", file=sys.stderr)

    try:
        print(f"[Bilibili] Starting upload: {video_path}", file=sys.stderr)
        print(
            f"[Bilibili] Meta state - original={meta.original}, tid={meta.tid}, source={meta.source}",
            file=sys.stderr,
        )
        await uploader.start()
        print("[Bilibili] Upload completed successfully", file=sys.stderr)
    except Exception as e:
        error_msg = str(e)
        if "403" in error_msg or "NetworkException" in str(type(e).__name__):
            print(
                "\n[Bilibili] Upload failed with 403 error. Possible causes:",
                file=sys.stderr,
            )
            print(
                "1. SESSDATA/CSRF cookies may be expired. Please refresh them from your browser.",
                file=sys.stderr,
            )
            print(
                "2. Your Bilibili account may not have upload permissions (need to enable Creative Center).",
                file=sys.stderr,
            )
            print(
                "3. Your account may need real-name verification.",
                file=sys.stderr,
            )
            print(
                "4. The request may have been blocked by Bilibili's anti-bot system.",
                file=sys.stderr,
            )
        raise
    finally:
        # Clean up temporary cover image (if we extracted one)
        if cover_path and os.path.exists(cover_path):
            try:
                os.unlink(cover_path)
            except Exception:
                pass  # Ignore cleanup errors


async def main():
    parser = argparse.ArgumentParser(description="Upload TikTok video to Bilibili")
    parser.add_argument("--video-path", required=True, help="Path to video file")
    parser.add_argument("--title", required=True, help="Video title")
    parser.add_argument("--desc", default="", help="Video description")
    parser.add_argument("--source-url", default=None, help="Original TikTok URL")
    parser.add_argument("--tags", default="转载,TikTok", help="Comma-separated tags")
    parser.add_argument(
        "--tid", type=int, default=160, help="Bilibili category ID (tid)"
    )
    parser.add_argument(
        "--original",
        type=lambda x: x.lower() in ("true", "1", "yes"),
        default=None,
        help="Whether video is original (True) or reprint (False). If not provided, auto-detect from source-url",
    )
    parser.add_argument(
        "--act-reserve-create",
        type=int,
        default=None,
        help="Collection ID (合集 ID) to add video to. If not provided, video will not be added to any collection.",
    )

    args = parser.parse_args()

    # Validate video file exists
    if not Path(args.video_path).exists():
        print(f"ERROR: Video file not found: {args.video_path}", file=sys.stderr)
        sys.exit(1)

    tags_list = [t.strip() for t in args.tags.split(",") if t.strip()]

    try:
        await upload_video(
            video_path=args.video_path,
            title=args.title,
            desc=args.desc,
            source_url=args.source_url,
            tags=tags_list,
            tid=args.tid,
            original=args.original,
            act_reserve_create=args.act_reserve_create,
        )
        print("SUCCESS", file=sys.stdout)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
