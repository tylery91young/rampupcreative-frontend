#!/usr/bin/env python3
"""
Ramp Up Creative — static site builder (zero dependencies).

Reads page bodies from src/*.html, wraps them in src/_partials/base.html,
substitutes {{ TOKENS }} from config.json (plus a few computed ones), and
writes the finished site to dist/.

Usage:
    python scripts/build.py                # normal build
    python scripts/build.py --media-base /media-local   # override media host (local preview)

Cloudflare Pages build command:  python3 scripts/build.py   (output dir: dist)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PARTIALS = SRC / "_partials"
ASSETS = ROOT / "assets"
STATIC = ROOT / "static"
DIST = ROOT / "dist"

# Pages that render at the site root instead of /<slug>/
ROOT_PAGES = {"index": "index.html", "404": "404.html"}


def load_config(media_base_override: str | None) -> dict:
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    override = media_base_override or os.environ.get("MEDIA_BASE")
    if override:
        # Git Bash on Windows rewrites a leading "/media-local" arg into
        # "C:/Program Files/Git/media-local"; undo that.
        mangled = re.search(r"/Git(/[^/].*)$", override)
        if mangled:
            override = mangled.group(1)
        cfg["media_base"] = override.rstrip("/")
    cfg["media_base"] = cfg["media_base"].rstrip("/")
    cfg["site_url"] = cfg["site_url"].rstrip("/")
    return cfg


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Optional leading block:  <!--meta\n key: value\n ... \n-->"""
    m = re.match(r"\s*<!--meta\s*(.*?)-->\s*", text, re.S)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        meta[key.strip()] = val.strip()
    return meta, text[m.end():]


TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def substitute(text: str, values: dict, strict: bool = True) -> str:
    def repl(match: re.Match) -> str:
        key = match.group(1).strip()
        if key in values:
            return str(values[key])
        if strict:
            raise KeyError(f"Unknown template token: {{{{ {key} }}}}")
        return match.group(0)

    return TOKEN_RE.sub(repl, text)


def build(media_base_override: str | None = None) -> None:
    cfg = load_config(media_base_override)
    base = (PARTIALS / "base.html").read_text(encoding="utf-8")
    header = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8")

    # Wipe dist/ but keep the locally-generated media folder (scripts/serve.py
    # populates dist/media-local/ and it is expensive to rebuild every time).
    DIST.mkdir(parents=True, exist_ok=True)
    for child in DIST.iterdir():
        if child.name == "media-local":
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()

    # Copy verbatim asset trees.
    if ASSETS.exists():
        shutil.copytree(ASSETS, DIST / "assets")
    if STATIC.exists():
        for item in STATIC.iterdir():
            dest = DIST / item.name
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

    pages = sorted(p for p in SRC.glob("*.html"))
    if not pages:
        sys.exit("No pages found in src/*.html")

    built = []
    for page in pages:
        slug = page.stem
        raw = page.read_text(encoding="utf-8")
        meta, body = parse_front_matter(raw)

        canonical_path = "/" if slug == "index" else f"/{slug}/"
        og_image = meta.get("og_image", "").strip()
        if og_image and not og_image.startswith(("http://", "https://")):
            og_image = f"{cfg['media_base']}/{og_image.lstrip('/')}"

        values = {
            **cfg,
            "title": meta.get("title", cfg["site_name"]),
            "meta_description": meta.get("description", cfg["description"]),
            "body_class": meta.get("body_class", ""),
            "head_extra": meta.get("head_extra", ""),
            "page_scripts": meta.get("scripts", ""),
            "canonical": cfg["site_url"] + canonical_path,
            "og_image": og_image or f"{cfg['media_base']}/og/default.jpg",
            "noindex": (
                '<meta name="robots" content="noindex">'
                if meta.get("noindex", "").lower() in ("1", "true", "yes")
                else ""
            ),
            "header": substitute(header, cfg),
            "footer": substitute(footer, {**cfg, "body_class": meta.get("body_class", "")}),
        }
        # Page bodies may use {{ media_base }}, {{ contact_email }}, etc.
        # Substitute them here (non-strict) before the body goes into the shell.
        values["content"] = substitute(body.strip(), values, strict=False)

        html = substitute(base, values)

        if slug in ROOT_PAGES:
            out = DIST / ROOT_PAGES[slug]
        else:
            out = DIST / slug / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        built.append(out.relative_to(DIST).as_posix())

    print(f"Built {len(built)} pages -> {DIST.relative_to(ROOT)}/")
    for b in built:
        print(f"  {b}")
    print(f"media_base = {cfg['media_base']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--media-base", default=None, help="Override media host (e.g. /media-local)")
    args = ap.parse_args()
    build(args.media_base)
