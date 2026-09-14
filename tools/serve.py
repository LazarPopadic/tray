"""Local dev server. Identical to `python -m http.server` except that it tells the
browser never to cache, which `http.server` does not — without this, editing a module
and reloading can still run the old one. Development only; GitHub Pages serves the
real thing and sw.js handles caching there.

    python tools/serve.py [port]
"""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5190
    print(f"serving {ROOT} on http://localhost:{port} (no-cache)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
