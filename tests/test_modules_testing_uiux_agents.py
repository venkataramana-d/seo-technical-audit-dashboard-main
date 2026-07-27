"""Pure tests for the Testing (§3) and UI/UX (§4) agents. FakeLLM, no DB."""
import json

import pytest

from modules.testing_agent import anonymize_html, propose_fixture_from_flag
# NOTE: emitted_issue_types / run_fixture_suite / Fixture depend on the per-page
# audit pipeline (modules.pipeline), which lands with the core-engine merge.
# Their tests are deferred until then; the pure helpers below are covered here.
from modules.llm import FakeLLM
from modules.uiux_agent import (
    QUERY_TEMPLATES, QuerySelectionError, SummaryFacts, default_view_for_role,
    narrate, render_summary, select_query, validate_selection,
)

# HTML that trips known per-page checks.
_MISSING_TITLE_HTML = "<html><head></head><body><h1>Hi</h1></body></html>"
_GOOD_HTML = (
    "<html><head><title>A perfectly reasonable title of decent length here</title>"
    "<meta charset='utf-8'><meta name='viewport' content='width=device-width'>"
    "<link rel='canonical' href='http://x/'><link rel='icon' href='/f.ico'>"
    "<meta name='description' content='" + ("x" * 100) + "'></head>"
    "<body><h1>H</h1><p>" + ("word " * 300) + "</p></body></html>"
)


# ---- Testing Agent (pure helpers) ----

def test_anonymize_html_strips_identifying_content_but_keeps_structure():
    html = ("<html><body><a href='https://acme-corp.com/pricing'>Buy</a>"
            "<a href='mailto:ceo@acme-corp.com'>Email</a>"
            "<p>Acme Corp secret revenue figures</p></body></html>")
    out = anonymize_html(html)
    assert "acme-corp.com" not in out
    assert "ceo@acme-corp.com" not in out
    assert "secret revenue" not in out
    assert "https://example.com/" in out          # external href anonymized
    assert "mailto:ceo@acme-corp.com" not in out
    assert "<a " in out and "</a>" in out          # link structure preserved


def test_propose_fixture_is_anonymized_and_flagged():
    fx = propose_fixture_from_flag("<html><body><p>Acme confidential</p></body></html>", {"thin_content"})
    assert fx.source == "production_flagged"
    assert "Acme confidential" not in fx.html
    assert fx.expected_issue_types == {"thin_content"}


# ---- UI/UX Agent: summary ----

def test_render_summary_uses_only_given_numbers():
    facts = SummaryFacts(total_pages=340, health_score=78.0, seo_score_avg=82.5,
                         health_delta=-4.0, top_issue_types=[("missing_meta_description", 30), ("thin_content", 12)],
                         new_error_count=3)
    s = render_summary(facts)
    assert "340 page" in s
    assert "78.0%" in s and "down 4.0 pts" in s
    assert "82.5" in s
    assert "missing_meta_description (30)" in s
    assert "3 new error" in s


def test_narrate_falls_back_to_render_on_empty_llm():
    facts = SummaryFacts(total_pages=5, health_score=None, seo_score_avg=None, health_delta=None)
    llm = FakeLLM(lambda s, u: "")  # empty -> fall back to deterministic base
    assert narrate(llm, facts) == render_summary(facts)


def test_narrate_uses_llm_text_when_present():
    facts = SummaryFacts(total_pages=5, health_score=90.0, seo_score_avg=None, health_delta=None)
    llm = FakeLLM(lambda s, u: "Nice crawl! " + u)  # rephrase carrying the numbers
    out = narrate(llm, facts)
    assert out.startswith("Nice crawl!")


# ---- UI/UX Agent: ask-your-crawl query selection ----

def test_validate_selection_accepts_known_and_rejects_unknown():
    assert validate_selection("top_issue_types", {}) == {}
    with pytest.raises(QuerySelectionError):
        validate_selection("drop_tables", {})


def test_validate_selection_validates_issue_type_param():
    assert validate_selection("pages_with_issue_type", {"issue_type": "missing_title"}) == {"issue_type": "missing_title"}
    with pytest.raises(QuerySelectionError):
        validate_selection("pages_with_issue_type", {"issue_type": "DROP TABLE pages"})


def test_select_query_routes_via_llm():
    llm = FakeLLM(lambda s, u: json.dumps({"template": "pages_with_issue_type",
                                           "params": {"issue_type": "missing_title"}}))
    template, params = select_query(llm, "which pages have no title?")
    assert template == "pages_with_issue_type" and params == {"issue_type": "missing_title"}


def test_select_query_rejects_hallucinated_template():
    llm = FakeLLM(lambda s, u: json.dumps({"template": "raw_sql", "params": {"sql": "SELECT *"}}))
    with pytest.raises(QuerySelectionError):
        select_query(llm, "run this sql")


def test_select_query_rejects_bad_issue_type_param():
    # model picks a valid template but injects a bad param -> rejected server-side
    llm = FakeLLM(lambda s, u: json.dumps({"template": "pages_with_issue_type",
                                           "params": {"issue_type": "'; DROP TABLE issues; --"}}))
    with pytest.raises(QuerySelectionError):
        select_query(llm, "malicious")


# ---- UI/UX Agent: role views ----

def test_default_view_for_role():
    assert default_view_for_role("developer")["primary_widget"] == "status_codes_and_redirects"
    assert default_view_for_role("executive")["primary_widget"] == "health_score_trend"
    assert default_view_for_role("nonsense") == default_view_for_role("developer")  # fallback
