"""Tests for api/export.py's request-body decoding.

The frontend gzip-compresses the (already-trimmed) export payload for
xlsx/pdf requests (see lib/reportExport.ts::gzipJson) because an uncompressed
payload can exceed Vercel's serverless request-body limit. This exercises
`decode_request_body` directly rather than instantiating the
BaseHTTPRequestHandler, matching how this repo tests business logic and
leaves the thin handler classes themselves untested.
"""

import gzip
import json

import pytest

from api.export import decode_request_body


def test_decodes_plain_json_body():
    body = json.dumps({"format": "csv", "results": []}).encode("utf-8")
    assert decode_request_body(body, None) == {"format": "csv", "results": []}


def test_decodes_gzip_compressed_body():
    payload = {"format": "xlsx", "results": [{"url": "https://example.com/"}]}
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    assert decode_request_body(compressed, "gzip") == payload


def test_content_encoding_header_is_case_insensitive():
    payload = {"format": "pdf", "results": []}
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    assert decode_request_body(compressed, "GZIP") == payload


def test_empty_body_without_encoding_returns_empty_dict():
    assert decode_request_body(b"", None) == {}


def test_invalid_json_raises_json_decode_error():
    with pytest.raises(json.JSONDecodeError):
        decode_request_body(b"not json", None)


def test_non_gzip_body_with_gzip_header_raises_oserror():
    with pytest.raises(OSError):
        decode_request_body(b"not actually gzipped", "gzip")
