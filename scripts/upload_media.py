#!/usr/bin/env python3
r"""
Curate + optimise the real Ramp Up Creative media and push it to Cloudflare R2
(bucket: rampupcreativemedia), so the site references media.rampupcreative.com
URLs instead of storing binaries in the repo.

Source of truth for keys is the MEDIA list below — it must match the URLs used
in src/*.html.

USAGE
-----
Upload to R2 (needs credentials in the environment):

    export R2_ACCOUNT_ID=...            # Cloudflare account id
    export R2_ACCESS_KEY_ID=...         # R2 API token (Object Read & Write)
    export R2_SECRET_ACCESS_KEY=...
    export R2_BUCKET=rampupcreativemedia   # optional, this is the default
    python scripts/upload_media.py                 # skips objects already there
    python scripts/upload_media.py --force         # re-upload everything
    python scripts/upload_media.py --skip-video    # images only
    python scripts/upload_media.py --force --only hero   # just video/hero.mp4

Build optimised copies locally (used by scripts/serve.py, no credentials):

    python scripts/upload_media.py --local --out dist/media-local

Requirements:  pip install -r requirements-dev.txt   (boto3 only needed for upload)
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPLOADS = ROOT / "source-materials" / "uploads"
MANIFEST = ROOT / "media-manifest.json"

CACHE_CONTROL = "public, max-age=31536000, immutable"

# ---- media map ------------------------------------------------------------
# (source relative to source-materials/uploads, destination key, kind, long-edge px)
#   kind: "photo"       -> one JPEG at <long_edge>
#         "photo+thumb" -> <key> at 2000px  AND  <stem>-thumb.jpg at 1000px
#         "og"          -> 1200x630 cover crop
#         "video"       -> copied as-is
RE = "2025/09"
GALLERY = [
    "DJI_0795", "DJI_0106", "DJI_0136", "DJI_0765", "DJI_0792", "DJI_0127",
    "DJI_0778", "DJI_0794-2", "DJI_0117", "DJI_0772", "DJI_0780", "DJI_0769",
    "DJI_0803", "DJI_0132", "DJI_0768", "DJI_0441", "DJI_0104", "DJI_0763",
    "DJI_0798", "DJI_0774",
]

MEDIA: list[tuple[str, str, str, int]] = [
    # heroes
    (f"{RE}/DJI_0794.jpg",              "photos/hero/real-estate.jpg",   "photo", 2560),
    (f"{RE}/editedBYUskyline1.jpg",     "photos/hero/contact.jpg",       "photo", 2560),
    ("2025/08/events.jpg",              "photos/hero/events.jpg",         "photo", 1920),
    (f"{RE}/DJI_0794.jpg",              "photos/hero/home-poster.jpg",    "photo", 1920),
    # construction
    ("2026/04/Construction.jpg",        "photos/construction/hero.jpg",   "photo", 2560),
    # home service cards
    (f"{RE}/DJI_0765.jpg",              "photos/home/real-estate.jpg",    "photo", 1100),
    ("2026/04/Construction.jpg",        "photos/home/construction.jpg",   "photo", 1100),
    ("2025/08/events.jpg",              "photos/home/events.jpg",         "photo", 1100),
    # about
    ("2026/04/Screenshot-2026-04-04-144559.png",                       "photos/about/portrait.jpg", "photo", 1400),
    ("2026/04/dji_fly_20250125_151446_599_1737844850800_photo.jpg",    "photos/about/aerial.jpg",   "photo", 1600),
    # open graph
    (f"{RE}/DJI_0794.jpg",              "og/default.jpg",                "og",    1200),
    # event video posters — a real frame from each clip (not a stock photo), so the
    # preview matches the video. Regenerate with:
    #   ffmpeg -ss 3  -i JLMannEventVideo.mp4 -frames:v 1 -q:v 2 JLMannEventVideo-poster.jpg
    #   ffmpeg -ss 12 -i SnowTylerEmily.mp4   -frames:v 1 -q:v 2 SnowTylerEmily-poster.jpg
    ("2026/04/JLMannEventVideo-poster.jpg", "photos/events/horizontal-poster.jpg", "photo", 1600),
    ("2026/04/SnowTylerEmily-poster.jpg",   "photos/events/vertical-poster.jpg",   "photo", 1600),
    # video — uploaded as-is (not re-encoded here).
    # hero.mp4 is a web-optimised derivative of EditedHeroVideo.mp4 (72 MB -> 26 MB,
    # still 1080p, audio stripped, faststart). Regenerate it with:
    #   ffmpeg -i EditedHeroVideo.mp4 -map 0:v:0 -map_metadata -1 -an \
    #     -c:v libx264 -preset slow -crf 25 -maxrate 5M -bufsize 10M -pix_fmt yuv420p \
    #     -g 60 -movflags +faststart EditedHeroVideo.web.mp4
    ("2025/08/EditedHeroVideo.web.mp4", "video/hero.mp4",                "video", 0),
    ("2026/04/JLMannEventVideo.mp4",    "video/event-horizontal.mp4",    "video", 0),
    ("2026/04/SnowTylerEmily.mp4",      "video/event-vertical.mp4",      "video", 0),
]
for name in GALLERY:
    MEDIA.append((f"{RE}/{name}.jpg", f"photos/re/{name}.jpg", "photo+thumb", 2000))

BIG_VIDEO_WARN_MB = 25


# ---- image processing ---------------------------------------------------
def load_pillow():
    try:
        from PIL import Image, ImageOps  # noqa
        return Image, ImageOps
    except ImportError:
        sys.exit("Pillow is required:  pip install -r requirements-dev.txt")


def encode_jpeg(img, long_edge: int, quality: int) -> tuple[bytes, int, int]:
    Image, ImageOps = load_pillow()
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > long_edge:
        if w >= h:
            img = img.resize((long_edge, round(h * long_edge / w)), Image.LANCZOS)
        else:
            img = img.resize((round(w * long_edge / h), long_edge), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue(), img.size[0], img.size[1]


def encode_og(img) -> tuple[bytes, int, int]:
    Image, ImageOps = load_pillow()
    img = ImageOps.exif_transpose(img).convert("RGB")
    target_w, target_h = 1200, 630
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    img = img.resize((round(src_w * scale), round(src_h * scale)), Image.LANCZOS)
    left = (img.size[0] - target_w) // 2
    top = (img.size[1] - target_h) // 2
    img = img.crop((left, top, left + target_w, top + target_h))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True, progressive=True)
    return buf.getvalue(), target_w, target_h


def derivatives(src: Path, kind: str, long_edge: int):
    """Yield (suffix_key, bytes, content_type, w, h)."""
    Image, _ = load_pillow()
    if kind == "video":
        yield ("", src.read_bytes(), "video/mp4", 0, 0)
        return
    with Image.open(src) as im:
        if kind == "og":
            data, w, h = encode_og(im)
            yield ("", data, "image/jpeg", w, h)
            return
        data, w, h = encode_jpeg(im, long_edge, 82)
        yield ("", data, "image/jpeg", w, h)
    if kind == "photo+thumb":
        with Image.open(src) as im2:
            tdata, tw, th = encode_jpeg(im2, 1000, 78)
        yield ("-thumb", tdata, "image/jpeg", tw, th)


def thumb_key(key: str, suffix: str) -> str:
    if not suffix:
        return key
    p = Path(key)
    return str(p.with_name(p.stem + suffix + p.suffix)).replace("\\", "/")


# ---- R2 ---------------------------------------------------------------
def r2_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        sys.exit("boto3 is required for upload:  pip install -r requirements-dev.txt")
    acct = os.environ.get("R2_ACCOUNT_ID")
    ak = os.environ.get("R2_ACCESS_KEY_ID")
    sk = os.environ.get("R2_SECRET_ACCESS_KEY")
    missing = [n for n, v in [("R2_ACCOUNT_ID", acct), ("R2_ACCESS_KEY_ID", ak),
                              ("R2_SECRET_ACCESS_KEY", sk)] if not v]
    if missing:
        sys.exit("Missing env var(s): " + ", ".join(missing))
    return boto3.client(
        "s3",
        endpoint_url=f"https://{acct}.r2.cloudflarestorage.com",
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def object_exists(client, bucket, key) -> bool:
    from botocore.exceptions import ClientError
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


# ---- main -----------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="write optimised files locally instead of uploading")
    ap.add_argument("--out", default="dist/media-local", help="output dir for --local")
    ap.add_argument("--force", action="store_true", help="overwrite objects that already exist")
    ap.add_argument("--skip-video", action="store_true")
    ap.add_argument("--only", default="", help="only process dest keys containing this substring (e.g. --only hero)")
    ap.add_argument("--bucket", default=os.environ.get("R2_BUCKET", "rampupcreativemedia"))
    args = ap.parse_args()

    if not UPLOADS.exists():
        sys.exit(f"source media not found at {UPLOADS} — nothing to do")

    client = None
    if not args.local:
        client = r2_client()
        print(f"target: R2 bucket '{args.bucket}'")
    else:
        out_root = (ROOT / args.out) if not Path(args.out).is_absolute() else Path(args.out)
        out_root.mkdir(parents=True, exist_ok=True)
        print(f"target: local dir {out_root}")

    manifest = {}
    missing_src, uploaded, skipped, warnings = [], 0, 0, []

    for src_rel, key, kind, long_edge in MEDIA:
        if kind == "video" and args.skip_video:
            continue
        if args.only and args.only not in key:
            continue
        src = UPLOADS / src_rel
        if not src.exists():
            missing_src.append(src_rel)
            continue

        for suffix, data, ctype, w, h in derivatives(src, kind, long_edge):
            dest_key = thumb_key(key, suffix)
            mb = len(data) / 1e6
            if kind == "video" and mb > BIG_VIDEO_WARN_MB:
                warnings.append(f"{dest_key} is {mb:.0f} MB — consider compressing before go-live")

            if args.local:
                dest = out_root / dest_key
                dest.parent.mkdir(parents=True, exist_ok=True)
                if kind == "video" and dest.exists() and dest.stat().st_size == len(data):
                    skipped += 1
                else:
                    dest.write_bytes(data)
                    uploaded += 1
            else:
                if not args.force and object_exists(client, args.bucket, dest_key):
                    skipped += 1
                else:
                    client.put_object(
                        Bucket=args.bucket, Key=dest_key, Body=data,
                        ContentType=ctype, CacheControl=CACHE_CONTROL,
                    )
                    uploaded += 1
                    print(f"  put  {dest_key:38} {mb:6.2f} MB")

            manifest[dest_key] = {
                "src": src_rel, "bytes": len(data), "content_type": ctype,
                "w": w, "h": h,
            }

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"\n  {uploaded} written, {skipped} already present")
    print(f"  manifest -> {MANIFEST.relative_to(ROOT)}")
    if missing_src:
        print("\n  MISSING source files (key not produced):")
        for m in missing_src:
            print("   -", m)
    for w in warnings:
        print("  !", w)
    if not args.local:
        print("\n  Public URLs will be https://media.rampupcreative.com/<key> once the")
        print("  custom domain is attached to the bucket (see README > Media).")


if __name__ == "__main__":
    main()
