"""Tests for modules/_http.py: the shared send_json/read_json_body/require_str/
validate_url_or_400/validate_pattern helpers now used by every api/*.py
handler (consolidated from 8 near-identical copies)."""

import io
import json
from unittest.mock import MagicMock

from modules._http import read_json_body, require_str, send_json, validate_pattern, validate_url_or_400


def _mock_handler(body: bytes = b""):
    h = MagicMock()
    h.headers = {"Content-Length": str(len(body))} if body else {}
    h.rfile = io.BytesIO(body)
    h.wfile = io.BytesIO()
    return h


def test_send_json_writes_status_headers_and_body():
    h = _mock_handler()
    send_json(h, 201, {"ok": True})
    h.send_response.assert_called_once_with(201)
    h.send_header.assert_any_call("Content-Type", "application/json")
    written = h.wfile.getvalue()
    assert json.loads(written) == {"ok": True}


def test_read_json_body_parses_valid_json():
    h = _mock_handler(json.dumps({"url": "https://example.com/"}).encode())
    assert read_json_body(h) == {"url": "https://example.com/"}


def test_read_json_body_empty_returns_empty_dict():
    h = _mock_handler(b"")
    assert read_json_body(h) == {}


def test_require_str_returns_first_present_key():
    h = _mock_handler()
    assert require_str(h, {"seedUrl": " https://example.com/ "}, "seedUrl", "url") == "https://example.com/"


def test_require_str_falls_back_to_second_key():
    h = _mock_handler()
    assert require_str(h, {"url": "https://example.com/"}, "seedUrl", "url") == "https://example.com/"


def test_require_str_sends_400_when_all_keys_missing():
    h = _mock_handler()
    result = require_str(h, {}, "seedUrl", "url", field_name="seedUrl")
    assert result is None
    h.send_response.assert_called_once_with(400)
    body = json.loads(h.wfile.getvalue())
    assert body["error"] == "seedUrl is required"


def test_validate_url_or_400_blocks_internal_address():
    h = _mock_handler()
    assert validate_url_or_400(h, "http://169.254.169.254/") is False
    h.send_response.assert_called_once_with(400)


def test_validate_url_or_400_allows_public_url():
    h = _mock_handler()
    assert validate_url_or_400(h, "https://example.com/") is True
    h.send_response.assert_not_called()


def test_validate_pattern_rejects_overlong_pattern():
    assert validate_pattern("a" * 300) is not None


def test_validate_pattern_rejects_invalid_regex():
    assert validate_pattern("(unclosed") is not None


def test_validate_pattern_accepts_valid_regex():
    assert validate_pattern(r"^/blog/") is None
