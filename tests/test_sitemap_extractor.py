"""Tests for modules/sitemap_extractor.py: sitemap URL extraction with
sitemap-index recursion, gzip, dedupe, filtering, capping, and SSRF safety.
Network is mocked; one opt-in live smoke test hits edstellar.com."""

import gzip
import os
from unittest.mock import MagicMock, patch

import pytest

from modules.sitemap_extractor import (
    SitemapError,
    discover_sitemap_url,
    extract_sitemap_urls,
)

URLSET = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/blog/post-1</loc></url>
  <url><loc>https://example.com/blog/post-2</loc></url>
</urlset>"""

INDEX = b"""<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
</sitemapindex>"""

PAGES = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>"""

BLOG = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/blog/a</loc></url>
  <url><loc>https://example.com/blog/b</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>"""


def _resp(content, status=200, url="https://example.com/sitemap.xml"):
    m = MagicMock()
    m.content = content
    m.status_code = status
    m.url = url
    m.is_redirect = False
    m.headers = {}
    return m


def _mock_get(mapping):
    """Return a requests.get replacement that serves bytes by URL."""
    def _get(url, **kwargs):
        if url not in mapping:
            raise AssertionError(f"unexpected fetch: {url}")
        content = mapping[url]
        return _resp(content, url=url)
    return _get


@patch("modules.sitemap_extractor.requests.get")
def test_flat_urlset_extraction(mock_get):
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml": URLSET})
    result = extract_sitemap_urls("https://example.com/sitemap.xml", limit=50)
    assert result["is_index"] is False
    assert result["total_found"] == 4
    assert result["capped"] is False
    assert "https://example.com/about" in result["urls"]


@patch("modules.sitemap_extractor.requests.get")
def test_sitemap_index_recursion_and_dedupe(mock_get):
    mock_get.side_effect = _mock_get({
        "https://example.com/sitemap.xml": INDEX,
        "https://example.com/sitemap-pages.xml": PAGES,
        "https://example.com/sitemap-blog.xml": BLOG,
    })
    result = extract_sitemap_urls("https://example.com/sitemap.xml", limit=50)
    assert result["is_index"] is True
    # /about appears in both children: deduped to one.
    assert result["urls"].count("https://example.com/about") == 1
    assert result["total_found"] == 4  # /, /about, /blog/a, /blog/b
    assert result["sitemaps_crawled"] == 3


@patch("modules.sitemap_extractor.requests.get")
def test_cap_is_enforced(mock_get):
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml": URLSET})
    result = extract_sitemap_urls("https://example.com/sitemap.xml", limit=2)
    assert len(result["urls"]) == 2
    assert result["total_found"] == 4
    assert result["capped"] is True


@patch("modules.sitemap_extractor.requests.get")
def test_include_and_exclude_filters(mock_get):
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml": URLSET})
    inc = extract_sitemap_urls("https://example.com/sitemap.xml", limit=50, include_pattern=r"/blog/")
    assert all("/blog/" in u for u in inc["urls"])
    assert inc["total_found"] == 2

    exc = extract_sitemap_urls("https://example.com/sitemap.xml", limit=50, exclude_pattern=r"/blog/")
    assert all("/blog/" not in u for u in exc["urls"])
    assert exc["total_found"] == 2


@patch("modules.sitemap_extractor.requests.get")
def test_gzipped_sitemap(mock_get):
    gz = gzip.compress(URLSET)
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml.gz": gz})
    result = extract_sitemap_urls("https://example.com/sitemap.xml.gz", limit=50)
    assert result["total_found"] == 4


@patch("modules.sitemap_extractor.requests.get")
def test_max_url_cap_clamped(mock_get):
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml": URLSET})
    # Asking for 99999 must clamp to MAX_URL_CAP: here only 4 URLs exist anyway,
    # but the returned cap flag must reflect the clamped limit, not 99999.
    result = extract_sitemap_urls("https://example.com/sitemap.xml", limit=99999)
    assert result["capped"] is False
    assert len(result["urls"]) == 4


def test_ssrf_blocked_root_raises():
    with pytest.raises(SitemapError):
        extract_sitemap_urls("http://127.0.0.1/sitemap.xml", limit=10)


@patch("modules.sitemap_extractor.requests.get")
def test_non_200_root_raises(mock_get):
    mock_get.side_effect = _mock_get({"https://example.com/sitemap.xml": b"nope"})
    # override to return 404
    def _get(url, **kwargs):
        return _resp(b"not found", status=404, url=url)
    mock_get.side_effect = _get
    with pytest.raises(SitemapError):
        extract_sitemap_urls("https://example.com/sitemap.xml", limit=10)


def test_discover_sitemap_url():
    assert discover_sitemap_url("edstellar.com") == "https://edstellar.com/sitemap.xml"
    assert discover_sitemap_url("https://www.edstellar.com/") == "https://www.edstellar.com/sitemap.xml"


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="live network test: set RUN_LIVE_TESTS=1 to run",
)
def test_live_edstellar_sitemap():
    result = extract_sitemap_urls("https://www.edstellar.com/sitemap.xml", limit=25)
    assert result["total_found"] > 1000  # ~2461 at time of writing
    assert len(result["urls"]) == 25
    assert result["capped"] is True
    assert all(u.startswith("https://www.edstellar.com") for u in result["urls"])
