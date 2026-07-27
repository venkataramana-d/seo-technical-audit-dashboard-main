"""Unit tests for the crawl diff engine + alert evaluation (02-AUDIT-ENGINE.md §6)."""
from modules.crawl_diff import (
    DiffIssue,
    diff_issue_records,
    evaluate_alert_rules,
    make_scope,
)


def _i(t, sev, scope):
    return DiffIssue(issue_type=t, severity=sev, scope=scope)


def test_make_scope():
    assert make_scope("http://s/a", None) == "http://s/a"
    assert make_scope(None, ["http://s/b", "http://s/a"]) == "http://s/a|http://s/b"
    assert make_scope(None, None) == ""


def test_diff_new_fixed_persisting():
    prev = [_i("missing_title", "error", "http://s/a"), _i("thin_content", "warning", "http://s/b")]
    cur = [_i("missing_title", "error", "http://s/a"), _i("duplicate_title", "warning", "http://s/c")]
    diff = diff_issue_records(prev, cur)
    assert [i.issue_type for i in diff.new_issues] == ["duplicate_title"]
    assert [i.issue_type for i in diff.fixed_issues] == ["thin_content"]
    assert [i.issue_type for i in diff.persisting_issues] == ["missing_title"]


def test_diff_dedupes_within_crawl():
    cur = [_i("x", "warning", "http://s/a"), _i("x", "warning", "http://s/a")]
    diff = diff_issue_records([], cur)
    assert len(diff.new_issues) == 1


def test_score_deltas():
    diff = diff_issue_records([], [], prev_scores=(80.0, 70.0), cur_scores=(72.0, 74.0))
    assert diff.health_score_delta == -8.0
    assert diff.seo_score_delta == 4.0


def test_score_deltas_none_when_missing():
    diff = diff_issue_records([], [], prev_scores=(None, 70.0), cur_scores=(72.0, None))
    assert diff.health_score_delta is None
    assert diff.seo_score_delta is None


def test_counts_and_summary():
    prev = []
    cur = [_i("a", "error", "p1"), _i("b", "warning", "p2"), _i("c", "error", "p3")]
    diff = diff_issue_records(prev, cur, prev_scores=(90.0, 80.0), cur_scores=(85.0, 80.0))
    assert diff.new_count() == 3
    assert diff.new_count("error") == 2
    s = diff.summary()
    assert s["new"] == 3 and s["new_errors"] == 2 and s["health_score_delta"] == -5.0


# ---- alerts ----

class _Rule:
    def __init__(self, condition, channel="email", id="r1"):
        self.condition_json = condition
        self.channel = channel
        self.id = id


def test_alert_new_issues_by_severity():
    cur = [_i("a", "error", "p1"), _i("b", "warning", "p2")]
    diff = diff_issue_records([], cur)
    fired = evaluate_alert_rules(diff, [_Rule({"type": "new_issues", "severity": "error", "min_count": 1})])
    assert len(fired) == 1 and "new error" in fired[0].message
    # threshold not met
    assert evaluate_alert_rules(diff, [_Rule({"type": "new_issues", "severity": "error", "min_count": 5})]) == []


def test_alert_regression_shorthand():
    diff = diff_issue_records([], [_i("x", "error", "p1")])
    fired = evaluate_alert_rules(diff, [_Rule({"type": "regression"})])
    assert len(fired) == 1


def test_alert_health_score_drop():
    diff = diff_issue_records([], [], prev_scores=(90.0, None), cur_scores=(80.0, None))
    assert len(evaluate_alert_rules(diff, [_Rule({"type": "health_score_drop", "min_drop": 5})])) == 1
    # a small drop below threshold doesn't fire
    diff2 = diff_issue_records([], [], prev_scores=(90.0, None), cur_scores=(88.0, None))
    assert evaluate_alert_rules(diff2, [_Rule({"type": "health_score_drop", "min_drop": 5})]) == []


def test_alert_channel_and_tuple_rules():
    diff = diff_issue_records([], [_i("x", "error", "p1")])
    fired = evaluate_alert_rules(diff, [("rid", {"type": "regression"}, "webhook")])
    assert fired[0].channel == "webhook" and fired[0].rule_id == "rid"


def test_no_alerts_when_clean():
    diff = diff_issue_records([_i("x", "error", "p1")], [_i("x", "error", "p1")])
    assert evaluate_alert_rules(diff, [_Rule({"type": "regression"})]) == []
