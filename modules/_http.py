"""Shared request/response helpers for the api/*.py Vercel handlers.

Each api/*.py file is its own isolated Vercel serverless function, but they
all already import freely from modules/* (see the sys.path shim at the top
of each file) and ship in the same deployed bundle, so sharing these tiny
helpers here costs nothing at runtime while avoiding ~150 lines of
byte-identical boilerplate that had drifted into 8 near-copies.
"""

import json
import os
import re

from modules.auditor import validate_audit_url

# Client-supplied regex bound: rejects both pathological (ReDoS-prone) input
# and outright invalid regex before it ever reaches per-URL matching.
MAX_PATTERN_LENGTH = 200

# Bulk URL cap for sitemap/crawl/CSV audits, shared by modules/sitemap_extractor.py
# and api/audit-pipeline.py. Vercel sets VERCEL=1 for every deployed function
# invocation (production AND preview) -- these api/*.py handlers never run
# anywhere else (plain `next dev` 404s on API calls, see agents.md), so this
# is effectively always the "prod" branch in real usage; the local branch only
# matters for direct pytest/module calls that don't set VERCEL. Raised past
# 200 previously (up to 4000) drove real Vercel CPU-usage overage: each URL in
# a bulk audit fans out to its own per-URL invocation with several
# ThreadPoolExecutor-backed site-health checks (WHOIS/DNS/SSL/etc.), so a
# 4000-URL crawl could spin up thousands of concurrent invocations.
BULK_URL_CAP_PROD = 200
BULK_URL_CAP_LOCAL = 5000


def bulk_url_cap() -> int:
    return BULK_URL_CAP_PROD if os.environ.get("VERCEL") else BULK_URL_CAP_LOCAL


def send_json(handler, status, data):
    body = json.dumps(data, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler) -> dict:
    """Read and JSON-parse the request body (empty body -> {})."""
    length = int(handler.headers.get("Content-Length", 0) or 0)
    body = handler.rfile.read(length) if length else b"{}"
    return json.loads(body or b"{}")


def require_str(handler, payload, *keys, field_name=None):
    """First non-empty stripped string found among `keys` in `payload`.

    Sends a 400 (`"{field_name} is required"`) and returns None if every key
    is missing/blank.
    """
    value = ""
    for key in keys:
        value = (payload.get(key) or "").strip()
        if value:
            break
    if not value:
        send_json(handler, 400, {"error": f"{field_name or keys[0]} is required"})
        return None
    return value


def validate_url_or_400(handler, url) -> bool:
    """Runs `validate_audit_url`; sends a 400 and returns False if blocked."""
    ok, msg = validate_audit_url(url)
    if not ok:
        send_json(handler, 400, {"error": msg})
        return False
    return True


def validate_pattern(pattern):
    """Return an error message string if `pattern` is unsafe/invalid, else None."""
    if len(pattern) > MAX_PATTERN_LENGTH:
        return f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)"
    try:
        re.compile(pattern)
    except re.error as e:
        return f"Invalid pattern: {e}"
    return None
