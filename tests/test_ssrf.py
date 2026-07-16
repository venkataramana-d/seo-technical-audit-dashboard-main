"""SSRF-protection regression tests for modules/auditor.py and callers.

These pin the behavior the whole-project audit flagged as missing: literal
private IPs, hostnames that *resolve* to private IPs, and redirect targets
pointing at internal hosts must all be blocked before any content is fetched.
Network is mocked throughout.
"""

from unittest.mock import MagicMock, patch

import pytest
import requests

from modules.auditor import BlockedURLError, safe_get, validate_audit_url


# ── validate_audit_url ──────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://localhost/admin",
    "http://169.254.169.254/latest/meta-data/",   # cloud metadata endpoint
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "ftp://example.com/",                          # non-http scheme
    "https://",                                    # no host
])
def test_validate_rejects_unsafe_urls(url):
    ok, _ = validate_audit_url(url)
    assert ok is False


def test_validate_allows_public_url():
    ok, _ = validate_audit_url("https://example.com/page")
    assert ok is True


@patch("modules.auditor.socket.getaddrinfo")
def test_validate_blocks_hostname_resolving_to_private_ip(mock_getaddrinfo):
    # A public-looking hostname whose DNS points at an internal address.
    mock_getaddrinfo.return_value = [(2, 1, 6, "", ("169.254.169.254", 0))]
    ok, msg = validate_audit_url("https://evil.example.com/")
    assert ok is False
    assert "private or reserved" in msg.lower()


@patch("modules.auditor.socket.getaddrinfo")
def test_validate_allows_hostname_resolving_to_public_ip(mock_getaddrinfo):
    mock_getaddrinfo.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
    ok, _ = validate_audit_url("https://example.com/")
    assert ok is True


@patch("modules.auditor.socket.getaddrinfo", side_effect=OSError("dns fail"))
def test_validate_degrades_gracefully_on_resolution_failure(mock_getaddrinfo):
    # Can't resolve -> allow (the fetch itself will fail); must not crash.
    ok, _ = validate_audit_url("https://unresolvable.invalid/")
    assert ok is True


# ── safe_get redirect handling ──────────────────────────────────────────────

def _resp(status, url, location=None):
    m = MagicMock(spec=requests.Response)
    m.status_code = status
    m.url = url
    m.headers = {"Location": location} if location else {}
    m.is_redirect = status in (301, 302, 303, 307, 308) and location is not None
    return m


@patch("modules.auditor.requests.get")
def test_safe_get_blocks_redirect_to_internal_host(mock_get):
    # Public URL 302s to the cloud metadata endpoint: must be blocked mid-chain,
    # and the metadata endpoint must never be fetched.
    mock_get.return_value = _resp(302, "https://example.com/", location="http://169.254.169.254/latest/")
    with pytest.raises(BlockedURLError):
        safe_get("https://example.com/")
    # Only the first (public) URL was ever requested; the redirect was refused
    # before a second GET.
    assert mock_get.call_count == 1
    assert mock_get.call_args_list[0][0][0] == "https://example.com/"


@patch("modules.auditor.requests.get")
def test_safe_get_follows_safe_redirect(mock_get):
    mock_get.side_effect = [
        _resp(301, "http://example.com/", location="https://example.com/"),
        _resp(200, "https://example.com/"),
    ]
    with patch("modules.auditor.validate_audit_url", return_value=(True, "")):
        resp = safe_get("http://example.com/")
    assert resp.status_code == 200
    assert len(resp.history) == 1


@patch("modules.auditor.requests.get")
def test_safe_get_refuses_blocked_initial_url(mock_get):
    with pytest.raises(BlockedURLError):
        safe_get("http://169.254.169.254/")
    mock_get.assert_not_called()  # blocked before any network call


# ── link_auditor SSRF guard ─────────────────────────────────────────────────

def test_link_validation_blocks_internal_url():
    from modules.link_auditor import validate_url
    result = validate_url("http://169.254.169.254/latest/meta-data/")
    assert result["health"] == "blocked"
    assert result["is_broken"] is False
