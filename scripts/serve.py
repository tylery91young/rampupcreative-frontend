#!/usr/bin/env python3
"""
Local preview for the static site (no Cloudflare Functions).

    python scripts/serve.py                 # build + optimise local media + serve
    python scripts/serve.py --port 9000
    python scripts/serve.py --no-media      # skip the local media copy (faster)

Serves dist/ with clean-URL routing at http://localhost:8000 .
For the contact form + /admin (D1, Turnstile), use `wrangler pages dev` instead
(see README).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
LOCAL_MEDIA_BASE = "/media-local"


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):  # noqa: N802
        path = self.translate_path(self.path)
        p = Path(path)
        if p.is_dir():
            idx = p / "index.html"
            if idx.exists():
                self.path = self.path.rstrip("/") + "/index.html"
        elif not p.exists() and "." not in p.name:
            # /about  ->  /about/index.html
            cand = Path(self.translate_path(self.path.rstrip("/") + "/index.html"))
            if cand.exists():
                self.path = self.path.rstrip("/") + "/index.html"
        return super().send_head()

    def do_GET(self):  # noqa: N802
        path = Path(self.translate_path(self.path))
        if not path.exists() and "." not in path.name and not str(path).endswith("index.html"):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            body = (DIST / "404.html").read_bytes() if (DIST / "404.html").exists() else b"404"
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-media", action="store_true", help="don't (re)build local media at all")
    ap.add_argument("--with-video", action="store_true", help="also copy the (large) local video files")
    args = ap.parse_args()

    print("building site (media base = %s) ..." % LOCAL_MEDIA_BASE)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py"),
                    "--media-base", LOCAL_MEDIA_BASE], check=True)

    if not args.no_media:
        up = ROOT / "scripts" / "upload_media.py"
        if up.exists():
            print("optimising local media into dist%s/ ..." % LOCAL_MEDIA_BASE)
            cmd = [sys.executable, str(up), "--local",
                   "--out", str(DIST / LOCAL_MEDIA_BASE.strip("/"))]
            if not args.with_video:
                cmd.append("--skip-video")
            r = subprocess.run(cmd)
            if r.returncode != 0:
                print("  (local media step skipped — see message above)")

    handler = partial(Handler, directory=str(DIST))
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"\n  http://localhost:{args.port}\n  Ctrl+C to stop\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
