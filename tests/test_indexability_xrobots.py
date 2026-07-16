"""Tests for modules/auditor.py::analyze_indexability's X-Robots-Tag handling.

modules/advanced_checks.py::analyze_http_headers already flags X-Robots-Tag
noindex: analyze_indexability must not duplicate that issue, but it does
need to (a) fold noindex into is_indexable and (b) flag the nofollow case,
which advanced_checks does not cover.
"""

from bs4 import BeautifulSoup

from modules.auditor import analyze_indexability

EMPTY_HTML = "<html><head></head><body></body></html>"


def _soup():
    return BeautifulSoup(EMPTY_HTML, "lxml")


def test_no_headers_defaults_indexable():
    result = analyze_indexability(_soup(), http_headers={})
    assert result["is_indexable"] is True
    assert result["issues"] == []


def test_x_robots_noindex_marks_not_indexable_without_duplicate_issue():
    result = analyze_indexability(_soup(), http_headers={"X-Robots-Tag": "noindex"})
    assert result["is_indexable"] is False
    # noindex issue is owned by advanced_checks.py: must not appear here too
    assert not any("noindex" in i["issue"].lower() for i in result["issues"])


def test_x_robots_nofollow_adds_warning_issue():
    result = analyze_indexability(_soup(), http_headers={"X-Robots-Tag": "nofollow"})
    assert result["is_indexable"] is True
    assert len(result["issues"]) == 1
    assert result["issues"][0]["severity"] == "Warning"


def test_header_lookup_is_case_insensitive():
    result = analyze_indexability(_soup(), http_headers={"x-robots-tag": "NOINDEX, NOFOLLOW"})
    assert result["is_indexable"] is False
    assert len(result["issues"]) == 1  # only the nofollow warning, noindex not duplicated


def test_missing_http_headers_arg_does_not_crash():
    result = analyze_indexability(_soup())
    assert result["is_indexable"] is True
