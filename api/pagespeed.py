import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.pagespeed import fetch_pagespeed  # noqa: E402


def _send_json(handler, status, data):
    body = json.dumps(data, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length) if length else b"{}"
            payload = json.loads(body or b"{}")

            url = (payload.get("url") or "").strip()
            if not url:
                _send_json(self, 400, {"error": "url is required"})
                return

            strategy = payload.get("strategy", "mobile")
            api_key = payload.get("apiKey") or os.environ.get("PSI_API_KEY")

            result = fetch_pagespeed(url, strategy=strategy, api_key=api_key)
            _send_json(self, 200, result)
        except Exception as e:  # noqa: BLE001
            _send_json(self, 500, {"error": str(e)})
