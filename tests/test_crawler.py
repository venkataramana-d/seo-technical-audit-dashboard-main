"""Tests for modules/crawler.py: BFS site crawl, scope control, robots.txt modes."""

import os
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup

from modules.crawler import CrawlConfig, _in_scope, _normalize_url, crawl_site


def _soup_with_links(*hrefs):
    body = "".join(f'<a href="{h}">link</a>' for h in hrefs)
    return BeautifulSoup(f"<html><body>{body}</body></html>", "lxml")


def _fetch_result(url, soup, status_code=200):
    return {
        "success": True,
        "status_code": status_code,
        "final_url": url,
        "redirect_count": 0,
        "redirect_history": [],
        "soup": soup,
        "html": str(soup),
        "response_time": 0.1,
        "http_headers": {},
        "page_size_bytes": len(str(soup)),
    }


def _stub_audit_url(url, check_links=True, prefetched=None, **kwargs):
    return {"url": url, "seo_score": 90, "all_issues": []}


def _allow_all_robots_get(*args, **kwargs):
    resp = MagicMock()
    resp.status_code = 404
    resp.text = ""
    resp.is_redirect = False
    resp.headers = {}
    return resp


# ── pure helpers ───────────────────────────────────────────────────────────────

def test_normalize_url_strips_fragment_and_trailing_slash():
    assert _normalize_url("https://example.com/about/#section") == "https://example.com/about"
    assert _normalize_url("https://example.com/") == "https://example.com/"


def test_in_scope_rejects_other_domains_by_default():
    config = CrawlConfig(seed_url="https://example.com/")
    assert _in_scope("https://example.com/page", "example.com", config) is True
    assert _in_scope("https://other.com/page", "example.com", config) is False


def test_in_scope_allows_subdomains_when_enabled():
    config = CrawlConfig(seed_url="https://example.com/", include_subdomains=True)
    assert _in_scope("https://blog.example.com/post", "example.com", config) is True


def test_in_scope_respects_include_exclude_patterns():
    config = CrawlConfig(
        seed_url="https://example.com/",
        include_patterns=[r"/blog/"],
        exclude_patterns=[r"/blog/draft"],
    )
    assert _in_scope("https://example.com/blog/post-1", "example.com", config) is True
    assert _in_scope("https://example.com/blog/draft-1", "example.com", config) is False
    assert _in_scope("https://example.com/about", "example.com", config) is False


def test_config_rejects_invalid_choices():
    import pytest

    with pytest.raises(ValueError):
        CrawlConfig(seed_url="https://example.com/", seed_source="bogus")
    with pytest.raises(ValueError):
        CrawlConfig(seed_url="https://example.com/", robots_mode="bogus")
    with pytest.raises(ValueError):
        CrawlConfig(seed_url="https://example.com/", max_pages=0)


# ── crawl_site ───────────────────────────────────────────────────────────────

@patch("modules.crawler.audit_url", side_effect=_stub_audit_url)
@patch("modules.crawler.requests.get", side_effect=_allow_all_robots_get)
@patch("modules.crawler.fetch_page")
def test_crawl_discovers_linked_pages_within_domain(mock_fetch, mock_robots_get, mock_audit):
    pages = {
        "https://example.com/": _soup_with_links("/about", "/contact", "https://external.com/x"),
        "https://example.com/about": _soup_with_links(),
        "https://example.com/contact": _soup_with_links(),
    }
    mock_fetch.side_effect = lambda url: _fetch_result(url, pages[url])

    config = CrawlConfig(seed_url="https://example.com/", max_pages=10, max_depth=2)
    result = crawl_site(config)

    crawled_urls = {p["url"] for p in result["pages"]}
    assert crawled_urls == set(pages.keys())
    assert result["stats"]["pages_crawled"] == 3
    assert result["stats"]["errors"] == 0


@patch("modules.crawler.audit_url", side_effect=_stub_audit_url)
@patch("modules.crawler.requests.get", side_effect=_allow_all_robots_get)
@patch("modules.crawler.fetch_page")
def test_crawl_respects_max_pages(mock_fetch, mock_robots_get, mock_audit):
    pages = {
        "https://example.com": _soup_with_links("/a", "/b", "/c"),
        "https://example.com/a": _soup_with_links(),
        "https://example.com/b": _soup_with_links(),
        "https://example.com/c": _soup_with_links(),
    }
    mock_fetch.side_effect = lambda url: _fetch_result(url, pages[url])

    config = CrawlConfig(seed_url="https://example.com", max_pages=2, max_depth=2)
    result = crawl_site(config)

    assert result["stats"]["pages_crawled"] <= 2


@patch("modules.crawler.audit_url", side_effect=_stub_audit_url)
@patch("modules.crawler.requests.get", side_effect=_allow_all_robots_get)
@patch("modules.crawler.fetch_page")
def test_crawl_never_follows_external_links(mock_fetch, mock_robots_get, mock_audit):
    pages = {"https://example.com/": _soup_with_links("https://external.com/page")}
    mock_fetch.side_effect = lambda url: _fetch_result(url, pages[url])

    config = CrawlConfig(seed_url="https://example.com/", max_pages=10)
    result = crawl_site(config)

    assert result["stats"]["pages_crawled"] == 1
    assert all(p["url"].startswith("https://example.com") for p in result["pages"])


@patch("modules.crawler.audit_url", side_effect=_stub_audit_url)
@patch("modules.crawler.fetch_page")
def test_robots_respect_mode_skips_disallowed_url(mock_fetch, mock_audit):
    disallow_resp = MagicMock()
    disallow_resp.status_code = 200
    disallow_resp.text = "User-agent: *\nDisallow: /private\n"
    disallow_resp.is_redirect = False
    disallow_resp.headers = {}

    with patch("modules.crawler.requests.get", return_value=disallow_resp):
        mock_fetch.side_effect = lambda url: _fetch_result(url, _soup_with_links())
        config = CrawlConfig(seed_url="https://example.com/private", robots_mode="respect")
        result = crawl_site(config)

    assert result["stats"]["pages_crawled"] == 0
    assert result["skipped_robots"] == ["https://example.com/private"]


@patch("modules.crawler.audit_url", side_effect=_stub_audit_url)
@patch("modules.crawler.fetch_page")
def test_robots_ignore_mode_crawls_disallowed_url(mock_fetch, mock_audit):
    disallow_resp = MagicMock()
    disallow_resp.status_code = 200
    disallow_resp.text = "User-agent: *\nDisallow: /private\n"
    disallow_resp.is_redirect = False
    disallow_resp.headers = {}

    with patch("modules.crawler.requests.get", return_value=disallow_resp):
        mock_fetch.side_effect = lambda url: _fetch_result(url, _soup_with_links())
        config = CrawlConfig(seed_url="https://example.com/private", robots_mode="ignore")
        result = crawl_site(config)

    assert result["stats"]["pages_crawled"] == 1
    assert result["skipped_robots"] == []


def test_crawl_blocks_ssrf_targets():
    config = CrawlConfig(seed_url="http://127.0.0.1/admin")
    result = crawl_site(config)
    assert result["pages"] == []
    assert "error" in result


@patch("modules.crawler.audit_url")
@patch("modules.crawler.requests.get", side_effect=_allow_all_robots_get)
@patch("modules.crawler.fetch_page")
def test_discovery_only_mode_skips_per_page_audit(mock_fetch, mock_robots_get, mock_audit):
    # api/crawl.py always runs with run_full_audit=False: the browser fans out
    # per-page /api/audit calls itself (lib/crawl/orchestrator.ts) to stay
    # within the serverless maxDuration cap. Discovered pages must NOT carry
    # an "audit" key, and audit_url must never be called in this mode.
    pages = {
        "https://example.com/": _soup_with_links("/about"),
        "https://example.com/about": _soup_with_links(),
    }
    mock_fetch.side_effect = lambda url: _fetch_result(url, pages[url])

    config = CrawlConfig(seed_url="https://example.com/", max_pages=10, run_full_audit=False)
    result = crawl_site(config)

    assert result["stats"]["pages_crawled"] == 2
    assert all("audit" not in p for p in result["pages"])
    mock_audit.assert_not_called()


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="live network test: set RUN_LIVE_TESTS=1 to run",
)
def test_live_edstellar_discovery_crawl():
    # Mirrors what api/crawl.py runs in production: discovery-only, bounded,
    # against a real site.
    config = CrawlConfig(
        seed_url="https://www.edstellar.com/",
        max_pages=10,
        max_depth=2,
        run_full_audit=False,
    )
    result = crawl_site(config)
    assert result["stats"]["pages_crawled"] > 0
    assert result["stats"]["pages_crawled"] <= 10
    assert all(u.startswith("https://www.edstellar.com") for u in [p["url"] for p in result["pages"]])
    assert all("audit" not in p for p in result["pages"])
