import gzip
import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules._http import send_json  # noqa: E402
from modules.report_generator import generate_csv, generate_excel, generate_pdf  # noqa: E402

logger = logging.getLogger(__name__)

MIME = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
    "json": "application/json",
}


def decode_request_body(raw_body: bytes, content_encoding: str | None) -> dict:
    """Gunzip the body if the client compressed it, then parse as JSON.

    The frontend gzip-compresses the (already-trimmed) results payload for
    xlsx/pdf exports before sending it (see lib/reportExport.ts::gzipJson),
    since a large uncompressed payload can exceed Vercel's serverless
    request-body limit. Raises json.JSONDecodeError on invalid JSON, same as
    the caller's previous bare `json.loads`.
    """
    body = raw_body or b"{}"
    if (content_encoding or "").lower() == "gzip":
        body = gzip.decompress(body)
    return json.loads(body or b"{}")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw_body = self.rfile.read(length) if length else b""
            try:
                payload = decode_request_body(raw_body, self.headers.get("Content-Encoding"))
            except (json.JSONDecodeError, OSError):
                send_json(self, 400, {"error": "request body must be valid JSON"})
                return

            results = payload.get("results") or []
            fmt = payload.get("format", "csv")
            if fmt not in MIME:
                send_json(self, 400, {"error": "format must be csv, xlsx, pdf, or json"})
                return
            if not isinstance(results, list) or not results:
                send_json(self, 400, {"error": "results must be a non-empty list of audit results"})
                return

            if fmt == "csv":
                data = generate_csv(results)
            elif fmt == "xlsx":
                data = generate_excel(results)
            elif fmt == "json":
                data = json.dumps(results, default=str, indent=2).encode("utf-8")
            else:
                data = generate_pdf(results)

            self.send_response(200)
            self.send_header("Content-Type", MIME[fmt])
            self.send_header(
                "Content-Disposition", f'attachment; filename="seo-audit-report.{fmt}"'
            )
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:  # noqa: BLE001
            logger.exception("export.py request failed")
            send_json(self, 500, {"error": "Internal error while generating the export."})
