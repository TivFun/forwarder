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
    """Extract first frame from video as cover image using ffmpeg."""
    # Create a temporary file for the cover image
    cover_path = tempfile.NamedTemporaryFile(
        suffix=".jpg", delete=False, dir=os.path.dirname(video_path)
    ).name

    try:
        # Use ffmpeg to extract first frame
        # Use -y to overwrite if exists, and ensure proper JPEG format
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
                "scale=1280:720",  # Resize to standard dimensions
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

    # Extract cover image from video
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

    # Build VideoMeta with copyright parameter if supported
    # Try to pass copyright directly in __init__, fallback to setattr if needed
    copyright_value = 2  # 2=转载, 1=原创

    try:
        # Try creating VideoMeta with copyright parameter
        meta = video_uploader.VideoMeta(
            tid=tid,
            title=title,
            tags=tags,
            desc=desc,
            cover=cover_for_meta,
            no_reprint=False,
            copyright=copyright_value,  # Try passing copyright directly
        )
        print(
            f"[Bilibili] Created VideoMeta with copyright={copyright_value} in __init__",
            file=sys.stderr,
        )
    except TypeError:
        # If copyright is not a valid parameter, create without it and set later
        print(
            "[Bilibili] copyright not supported in VideoMeta.__init__, will set via attribute",
            file=sys.stderr,
        )
        meta = video_uploader.VideoMeta(
            tid=tid,
            title=title,
            tags=tags,
            desc=desc,
            cover=cover_for_meta,
            no_reprint=False,
        )
        # Set copyright and source via attributes
        try:
            meta.copyright = copyright_value
            if source_url:
                meta.source = source_url
            print(
                f"[Bilibili] Set copyright={copyright_value} via attribute",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"[Bilibili] Warning: Failed to set copyright via attribute: {e}",
                file=sys.stderr,
            )

    # Also try setattr as backup
    if source_url:
        try:
            setattr(meta, "copyright", 2)
            setattr(meta, "source", source_url)
            print(
                f"[Bilibili] Set copyright=2 (转载), source={source_url} via setattr",
                file=sys.stderr,
            )
        except Exception as e:
            print(f"[Bilibili] Warning: setattr failed: {e}", file=sys.stderr)

    print(f"[Bilibili] Using tid={tid} (分区ID: 85=情感)", file=sys.stderr)

    # Create uploader page
    page = video_uploader.VideoUploaderPage(
        path=video_path,
        title=title,
        description=desc,
    )

    # Create uploader
    uploader = video_uploader.VideoUploader(
        [page],
        meta,
        credential,
        line=video_uploader.Lines.QN,  # Use Qiniu (七牛) line
    )

    # Ensure copyright and source are set on the uploader's meta
    # Some versions of bilibili-api-python may need this set after creation
    if source_url:
        if hasattr(uploader, "meta"):
            # Try direct attribute assignment
            try:
                uploader.meta.copyright = 2
                uploader.meta.source = source_url
                print(
                    "[Bilibili] Set copyright and source on uploader.meta",
                    file=sys.stderr,
                )
            except Exception as e:
                print(
                    f"[Bilibili] Warning: Failed to set on uploader.meta: {e}",
                    file=sys.stderr,
                )

    # Optional: log upload events and intercept PRE_SUBMIT to modify data
    @uploader.on("__ALL__")
    async def on_event(data):
        # Intercept PRE_SUBMIT event to modify copyright and tid
        if isinstance(data, dict) and data.get("name") == "PRE_SUBMIT":
            submit_data = data.get("data")
            if submit_data and isinstance(submit_data, dict):
                # Force set copyright to 2 (转载) and tid to the correct value
                submit_data["copyright"] = 2
                submit_data["tid"] = tid
                if source_url:
                    submit_data["source"] = source_url
                print(
                    f"[Bilibili] INTERCEPTED PRE_SUBMIT: Modified copyright={submit_data['copyright']}, tid={tid}, source={source_url}",
                    file=sys.stderr,
                )
        elif isinstance(data, tuple) and len(data) >= 2:
            # Handle tuple format: (event_name, event_data)
            event_name = data[0] if len(data) > 0 else None
            event_data = data[1] if len(data) > 1 else None
            if event_name == "PRE_SUBMIT" and isinstance(event_data, dict):
                event_data["copyright"] = 2
                event_data["tid"] = tid
                if source_url:
                    event_data["source"] = source_url
                print(
                    f"[Bilibili] INTERCEPTED PRE_SUBMIT (tuple): Modified copyright={event_data['copyright']}, tid={tid}",
                    file=sys.stderr,
                )

        print(f"[Bilibili Upload Event] {data}", file=sys.stderr)

    # Hook into the submission process to ensure copyright and source are set
    # Patch the _submit_video method to modify data before submission
    if hasattr(uploader, "_submit_video"):
        original_submit = uploader._submit_video

        async def patched_submit_video(*args, **kwargs):
            # Modify kwargs or args to ensure copyright and tid are correct
            if kwargs and "data" in kwargs:
                kwargs["data"]["copyright"] = 2
                kwargs["data"]["tid"] = tid
                if source_url:
                    kwargs["data"]["source"] = source_url
            elif args and len(args) > 0 and isinstance(args[0], dict):
                args[0]["copyright"] = 2
                args[0]["tid"] = tid
                if source_url:
                    args[0]["source"] = source_url
            result = await original_submit(*args, **kwargs)
            return result

        uploader._submit_video = patched_submit_video
        print("[Bilibili] Patched _submit_video method", file=sys.stderr)

    # Also try to modify meta's internal data structure directly
    # This might not work if as_dict() returns a copy, but worth trying
    if hasattr(meta, "as_dict") and callable(meta.as_dict):
        try:
            meta_dict = meta.as_dict()
            if isinstance(meta_dict, dict):
                meta_dict["copyright"] = copyright_value
                if source_url:
                    meta_dict["source"] = source_url
                meta_dict["tid"] = tid  # Ensure tid is set
                print(
                    f"[Bilibili] Modified meta.as_dict(): copyright={copyright_value}, tid={tid}",
                    file=sys.stderr,
                )
        except Exception as e:
            print(
                f"[Bilibili] Warning: Failed to modify meta.as_dict(): {e}",
                file=sys.stderr,
            )

    # Try to patch the _build_submit_data method if it exists
    if hasattr(uploader, "_build_submit_data"):
        original_build = uploader._build_submit_data

        def patched_build_submit_data(*args, **kwargs):
            data = original_build(*args, **kwargs)
            if isinstance(data, dict):
                data["copyright"] = 2
                data["tid"] = tid
                if source_url:
                    data["source"] = source_url
                print(
                    f"[Bilibili] Patched _build_submit_data: copyright={data['copyright']}, tid={tid}",
                    file=sys.stderr,
                )
            return data

        uploader._build_submit_data = patched_build_submit_data
        print("[Bilibili] Patched _build_submit_data method", file=sys.stderr)

    # Before starting, try to ensure copyright and tid are set in the uploader's internal state
    # Some versions may store this in different places
    try:
        # Try to access and modify the internal meta object
        if hasattr(uploader, "meta"):
            # Force set copyright and source on meta
            uploader.meta.copyright = copyright_value
            if source_url:
                uploader.meta.source = source_url
            uploader.meta.tid = tid
            print(
                f"[Bilibili] Set uploader.meta: copyright={copyright_value}, tid={tid}",
                file=sys.stderr,
            )

        # Also try to modify any internal dict that might be used for submission
        if hasattr(uploader, "_meta_dict"):
            uploader._meta_dict["copyright"] = copyright_value
            uploader._meta_dict["tid"] = tid
            if source_url:
                uploader._meta_dict["source"] = source_url
            print(f"[Bilibili] Modified uploader._meta_dict", file=sys.stderr)
    except Exception as e:
        print(
            f"[Bilibili] Warning: Failed to modify uploader internal state: {e}",
            file=sys.stderr,
        )

    try:
        print(f"[Bilibili] Starting upload: {video_path}", file=sys.stderr)
        print(
            f"[Bilibili] Final meta state - copyright: {getattr(meta, 'copyright', 'NOT SET')}, tid: {getattr(meta, 'tid', 'NOT SET')}",
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
        # Clean up temporary cover image
        if os.path.exists(cover_path):
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
        )
        print("SUCCESS", file=sys.stdout)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
