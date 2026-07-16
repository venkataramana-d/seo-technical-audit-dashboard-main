"""Tests for the Phase 2 domain-health split: analyze_site_health must reuse a
prefetched domain-health block instead of re-running the expensive domain-level
checks, while still running the page-level checks per page."""

from unittest.mock import patch

from modules import technical_checks as tc


def test_analyze_domain_health_runs_only_domain_checks():
    calls = []

    def rec(name, ret=None):
        def _f(*a, **k):
            calls.append(name)
            return ret or {"issues": []}
        return _f

    with patch.object(tc, "check_robots_txt", rec("robots")), \
         patch.object(tc, "check_sitemap", rec("sitemap")), \
         patch.object(tc, "check_domain_age", rec("domain_age")), \
         patch.object(tc, "check_ssl", rec("ssl")), \
         patch.object(tc, "check_https_enforcement", rec("https")), \
         patch.object(tc, "check_dns_health", rec("dns")), \
         patch.object(tc, "check_www_redirect", rec("www")), \
         patch.object(tc, "check_http2", rec("http2")), \
         patch.object(tc, "check_readability", rec("readability")), \
         patch.object(tc, "check_content_freshness", rec("freshness")):
        out = tc.analyze_domain_health("https://example.com/page")

    assert set(out) == {"robots", "sitemap", "domain_age", "ssl", "https_enforcement",
                        "dns", "www_redirect", "http2"}
    # Page-level checks must NOT run in the domain-only path.
    assert "readability" not in calls
    assert "freshness" not in calls


def test_prefetched_domain_health_skips_domain_checks_but_runs_page_checks():
    domain_calls = []
    page_calls = []

    def domain_rec(name):
        def _f(*a, **k):
            domain_calls.append(name)
            return {"issues": []}
        return _f

    def page_rec(name):
        def _f(*a, **k):
            page_calls.append(name)
            return {"issues": [], "name": name}
        return _f

    prefetched = {
        "robots": {"issues": []}, "sitemap": {"issues": []}, "domain_age": {"issues": []},
        "ssl": {"issues": []}, "https_enforcement": {"issues": []}, "dns": {"issues": []},
        "www_redirect": {"issues": []}, "http2": {"issues": []},
    }

    with patch.object(tc, "check_robots_txt", domain_rec("robots")), \
         patch.object(tc, "check_ssl", domain_rec("ssl")), \
         patch.object(tc, "check_domain_age", domain_rec("domain_age")), \
         patch.object(tc, "check_readability", page_rec("readability")), \
         patch.object(tc, "check_content_freshness", page_rec("freshness")), \
         patch.object(tc, "check_canonical_loop", page_rec("canonical_loop")):
        out = tc.analyze_site_health(
            "https://example.com/page", page_text="word " * 100,
            prefetched_domain_health=prefetched,
        )

    # No domain-level check re-ran (they were prefetched)...
    assert domain_calls == []
    # ...but the page-level checks did run, and the result merges both.
    assert set(page_calls) == {"readability", "freshness", "canonical_loop"}
    assert "robots" in out and "ssl" in out           # domain block present
    assert "readability" in out and "canonical_loop" in out  # page block present
    assert "issues" in out


def test_full_run_when_no_prefetch():
    with patch.object(tc, "analyze_domain_health", return_value={"ssl": {"issues": []}}) as dom, \
         patch.object(tc, "_analyze_page_health", return_value={"readability": {"issues": []}}) as page:
        out = tc.analyze_site_health("https://example.com/")
    dom.assert_called_once()   # domain checks run when nothing is prefetched
    page.assert_called_once()
    assert "ssl" in out and "readability" in out
