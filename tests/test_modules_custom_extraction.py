"""Unit tests for Custom Extraction (08-SF §4). Pure, HTML-fixture based, no DB."""
import pytest

from modules.custom_extraction import (
    MAX_EXTRACTORS_PER_CRAWL,
    CustomExtractor,
    ExtractorConfigError,
    SelectorType,
    SourceType,
    parse_extractors,
    run_extractor,
    run_extractors,
)

HTML = """
<html><body>
  <h1 class="title">Main Heading</h1>
  <div class="price" data-sku="A1">$19.99</div>
  <div class="price" data-sku="B2">$29.99</div>
  <ul id="tags"><li>alpha</li><li>beta</li></ul>
  <a href="/p/1">Product 1</a>
  <span class="sku">SKU-12345</span>
</body></html>
"""


# ---- config parsing / validation ----

def test_parse_valid_config():
    cfg = [
        {"name": "prices", "selector_type": "css", "expression": ".price", "source": "raw"},
        {"name": "h1", "selector_type": "xpath", "expression": "//h1/text()"},
    ]
    extractors = parse_extractors(cfg)
    assert len(extractors) == 2
    assert extractors[0].selector_type is SelectorType.css
    assert extractors[0].source is SourceType.raw
    assert extractors[1].source is SourceType.raw  # defaulted


def test_parse_empty_returns_empty():
    assert parse_extractors(None) == []
    assert parse_extractors([]) == []


def test_parse_rejects_too_many_extractors():
    cfg = [{"name": f"e{i}", "selector_type": "regex", "expression": "x"} for i in range(MAX_EXTRACTORS_PER_CRAWL + 1)]
    with pytest.raises(ExtractorConfigError, match="maximum"):
        parse_extractors(cfg)


def test_parse_rejects_bad_selector_type():
    with pytest.raises(ExtractorConfigError, match="selector_type"):
        parse_extractors([{"name": "x", "selector_type": "jsonpath", "expression": "a"}])


def test_parse_rejects_missing_name_and_empty_expression():
    with pytest.raises(ExtractorConfigError, match="name"):
        parse_extractors([{"selector_type": "css", "expression": ".x"}])
    with pytest.raises(ExtractorConfigError, match="expression"):
        parse_extractors([{"name": "x", "selector_type": "css", "expression": "   "}])


def test_parse_rejects_duplicate_names():
    with pytest.raises(ExtractorConfigError, match="Duplicate"):
        parse_extractors([
            {"name": "dup", "selector_type": "css", "expression": ".a"},
            {"name": "dup", "selector_type": "css", "expression": ".b"},
        ])


# ---- extraction: the three selector types ----

def test_css_extraction():
    r = run_extractor(CustomExtractor("prices", SelectorType.css, ".price"), HTML)
    assert r.error is None
    assert r.values == ["$19.99", "$29.99"]
    assert r.match_count == 2


def test_xpath_text_extraction():
    r = run_extractor(CustomExtractor("h1", SelectorType.xpath, "//h1/text()"), HTML)
    assert r.values == ["Main Heading"]


def test_xpath_attribute_extraction():
    r = run_extractor(CustomExtractor("skus", SelectorType.xpath, "//div[@class='price']/@data-sku"), HTML)
    assert r.values == ["A1", "B2"]


def test_regex_with_capturing_group():
    r = run_extractor(CustomExtractor("sku", SelectorType.regex, r"SKU-(\d+)"), HTML)
    assert r.values == ["12345"]


def test_regex_without_group_returns_full_match():
    r = run_extractor(CustomExtractor("dollar", SelectorType.regex, r"\$\d+\.\d+"), HTML)
    assert r.values == ["$19.99", "$29.99"]


def test_empty_matches_dropped():
    r = run_extractor(CustomExtractor("none", SelectorType.css, ".does-not-exist"), HTML)
    assert r.values == []
    assert r.error is None


# ---- error handling: a bad expression is captured, never raised ----

def test_bad_xpath_captured_as_error():
    r = run_extractor(CustomExtractor("bad", SelectorType.xpath, "//["), HTML)
    assert r.values == []
    assert r.error is not None


def test_bad_regex_captured_as_error():
    r = run_extractor(CustomExtractor("bad", SelectorType.regex, r"([unclosed"), HTML)
    assert r.values == []
    assert r.error is not None


# ---- crawl-wide 1000-value combined cap ----

def test_run_extractors_tracks_budget_across_pages():
    extractors = parse_extractors([{"name": "p", "selector_type": "css", "expression": ".price"}])
    results, remaining = run_extractors(extractors, HTML, remaining_budget=1000)
    assert results[0].values == ["$19.99", "$29.99"]
    assert remaining == 998  # 2 values consumed


def test_run_extractors_truncates_at_cap():
    extractors = parse_extractors([{"name": "p", "selector_type": "css", "expression": ".price"}])
    # only room for 1 more value in the whole crawl
    results, remaining = run_extractors(extractors, HTML, remaining_budget=1)
    assert results[0].values == ["$19.99"]  # truncated to the budget
    assert results[0].error == "crawl_extraction_cap_reached"
    assert remaining == 0


def test_run_extractors_marks_extractors_after_cap_exhausted():
    extractors = parse_extractors([
        {"name": "a", "selector_type": "css", "expression": ".price"},
        {"name": "b", "selector_type": "css", "expression": ".sku"},
    ])
    results, remaining = run_extractors(extractors, HTML, remaining_budget=0)
    assert all(r.error == "crawl_extraction_cap_reached" and r.values == [] for r in results)
    assert remaining == 0
