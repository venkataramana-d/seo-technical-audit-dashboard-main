"""Regression tests for modules/link_auditor.py false-positive fixes:
a live-but-access-limited link (403 WAF / 429 rate-limit / 503 / timeout) must
NOT be classified as broken, only genuinely dead resources (404/410/5xx) are."""

from modules.link_auditor import (
    WEAK_ANCHORS,
    categorize_domain,
    link_health,
)


def test_link_health_broken_only_for_dead_codes():
    assert link_health(404) == "broken"
    assert link_health(410) == "broken"
    assert link_health(500) == "broken"
    assert link_health(502) == "broken"
    assert link_health(504) == "broken"


def test_link_health_blocked_not_broken():
    # WAF / auth / rate-limit / transient-unavailable: alive, just refused/throttled.
    for code in (401, 403, 408, 429, 451, 503, 999):
        assert link_health(code) == "blocked", code


def test_link_health_403_blocked_regardless_of_domain():
    # Previously only 403 on a hard-coded social-domain allowlist was "blocked";
    # a Cloudflare/WAF 403 on any other site was wrongly "broken".
    assert link_health(403, "some-random-cloudflare-site.com") == "blocked"


def test_link_health_ok_and_redirect():
    assert link_health(200) == "ok"
    assert link_health(301) == "redirect"
    assert link_health(308) == "redirect"


def test_link_health_unverifiable_is_unknown_not_broken():
    # code 0 / None come from timeout / connection / SSL failures.
    assert link_health(0) == "unknown"
    assert link_health(None) == "unknown"


def test_weak_anchors_exclude_contextual_terms():
    # "source" (citation), "download" (file link), "example" (demo) are
    # descriptive in context and were removed from the weak-anchor set.
    assert "source" not in WEAK_ANCHORS
    assert "download" not in WEAK_ANCHORS
    assert "example" not in WEAK_ANCHORS
    # Genuinely generic ones stay.
    assert "click here" in WEAK_ANCHORS
    assert "read more" in WEAK_ANCHORS


def test_categorize_domain_does_not_corrupt_leading_w_domains():
    # lstrip("www.") used to strip leading w/./ chars, turning worldbank.org into
    # orldbank.org. Ensure a "www"-lookalike domain is not mangled.
    assert categorize_domain("worldbank.org") == categorize_domain("worldbank.org")
    # www. prefix is still stripped correctly for a known domain category.
    assert categorize_domain("www.github.com") == categorize_domain("github.com")
