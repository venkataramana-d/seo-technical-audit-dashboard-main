"""Regression tests for modules/technical_checks.py false-positive fixes that do
NOT require network (they exercise the early-return guards added to stop the
false positives before any fetch happens)."""

from bs4 import BeautifulSoup

from modules.technical_checks import check_content_freshness, check_www_redirect


def test_www_redirect_skips_deep_subdomain_without_probing():
    # Auditing blog.example.com must NOT probe www.blog.example.com (which almost
    # never exists) and report it "Does Not Resolve". The guard returns before any
    # network call, so this runs offline.
    result = check_www_redirect("https://blog.example.com/post")
    assert result["issues"] == []
    assert result.get("consolidated") is True


def test_www_redirect_skips_multi_label_tld_non_www():
    result = check_www_redirect("https://shop.example.co.uk/item")
    assert result["issues"] == []


def test_content_freshness_no_signal_is_not_a_scored_issue():
    # A page with neither an article:modified_time meta nor a Last-Modified header
    # (the common case) must degrade gracefully, not emit "No Content-Freshness
    # Signals".
    soup = BeautifulSoup("<html><body><p>content</p></body></html>", "lxml")
    result = check_content_freshness({}, soup)
    assert result["issues"] == []
    assert result["available"] is False
