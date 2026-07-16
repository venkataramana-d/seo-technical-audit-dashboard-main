"""Live integration test for the sitewide Technical Audit backend pipeline.

Replicates exactly what the browser orchestrator drives against the Python
serverless handlers: resolve a sitemap to URLs (api/sitemap.py -> extractor),
then audit a small sample one URL at a time (api/audit.py -> audit_url). Proves
the real end-to-end path on edstellar.com.

Opt-in (network + slow): RUN_LIVE_TESTS=1 python -m pytest tests/test_sitewide_pipeline_live.py -v
"""

import os

import pytest

from modules.auditor import audit_url
from modules.sitemap_extractor import extract_sitemap_urls

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="live network test: set RUN_LIVE_TESTS=1 to run",
)


def test_edstellar_sitewide_sample():
    # 1. Resolve the sitemap (what api/sitemap.py does), capped small + polite.
    resolved = extract_sitemap_urls("https://www.edstellar.com/sitemap.xml", limit=3)
    assert resolved["total_found"] > 1000
    urls = resolved["urls"]
    assert len(urls) == 3

    # 2. Audit each URL (what the browser fans out to api/audit.py). Keep it
    #    light: no link validation, no PageSpeed.
    for url in urls:
        result = audit_url(url, audit_type="auto", check_links=False, fetch_pagespeed=False)
        assert result["url"] == url
        # A reachable page yields a real score and the 35-check checklist.
        assert result.get("status_code", 0) != 0, f"unreachable: {url} ({result.get('fetch_error')})"
        assert 0 <= result["seo_score"] <= 100
        checklist = result.get("technical_audit_checklist", {})
        assert checklist.get("summary", {}).get("total") == 35
        assert set(checklist.get("groups", {})) == {"crawlability", "on_page", "site_health"}
