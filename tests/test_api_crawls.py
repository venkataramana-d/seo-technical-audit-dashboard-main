"""Tests for api/crawls.py — the first-slice frontend API (list/create/
status/thematic/trend). Follows tests/test_api_consolidation.py's pattern
for loading a hyphen-free api/*.py file via importlib and driving do_POST
with a MagicMock-based fake BaseHTTPRequestHandler, combined with the
in-memory-SQLite monkeypatch pattern used across tests/test_worker_*.py."""

import importlib.util
import io
import json
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from worker import crawl_diff, queue as queue_module, site_audit
from worker.db.models import Base, Crawl, CrawlConfig, Issue, Job, Organization, Page, Project


def _load(name, relative_path):
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), relative_path)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


crawls = _load("crawls_under_test", "api/crawls.py")


def _mock_handler(body: dict):
    encoded = json.dumps(body).encode()
    h = MagicMock()
    h.headers = {"Content-Length": str(len(encoded))}
    h.rfile = io.BytesIO(encoded)
    h.wfile = io.BytesIO()
    return h


def _sent_status_and_body(h):
    status = h.send_response.call_args[0][0]
    return status, json.loads(h.wfile.getvalue())


def _isolated_session_factory():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def isolated_db(monkeypatch):
    session_factory = _isolated_session_factory()
    monkeypatch.setattr(crawls, "SessionLocal", session_factory)
    monkeypatch.setattr(queue_module, "SessionLocal", session_factory)  # enqueue() in "create"
    monkeypatch.setattr(site_audit, "SessionLocal", session_factory)  # get_thematic_report()
    monkeypatch.setattr(crawl_diff, "SessionLocal", session_factory)  # get_score_trend()
    return session_factory


def _seed_crawl(session_factory, *, status="completed", health_score=80.0, seo_score_avg=85.0,
                 project_id=None, finished_at=None) -> int:
    """Creates a new org/project by default; pass an existing `project_id`
    (e.g. from a prior _seed_crawl call) to add a second crawl to the same
    project — needed for the "compare" action's tests, which diff two
    crawls of one project."""
    with session_factory() as db:
        if project_id is None:
            org = Organization(name="Test Org")
            db.add(org)
            db.flush()
            project = Project(org_id=org.id, name="example.com", root_url="https://example.com")
            db.add(project)
            db.flush()
            project_id = project.id
        config = CrawlConfig(project_id=project_id, source_type="homepage", robots_mode="respect", max_pages=50)
        db.add(config)
        db.flush()
        crawl = Crawl(
            project_id=project_id, crawl_config_id=config.id, status=status,
            health_score=health_score, seo_score_avg=seo_score_avg, pages_crawled=3,
            finished_at=finished_at,
        )
        db.add(crawl)
        db.commit()
        return crawl.id


def _project_id_of(session_factory, crawl_id) -> int:
    with session_factory() as db:
        return db.get(Crawl, crawl_id).project_id


def test_all_actions_registered():
    assert set(crawls._ACTIONS) == {
        "list", "create", "status", "thematic", "trend", "pages", "issues", "compare", "setSchedule",
    }


def test_unknown_action_returns_400():
    h = _mock_handler({"action": "not-a-real-action"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)
    assert status == 400
    assert "Unknown or missing action" in body["error"]


def test_list_returns_crawls_newest_first(isolated_db):
    _seed_crawl(isolated_db, status="completed")
    second_id = _seed_crawl(isolated_db, status="running", health_score=None, seo_score_avg=None)

    h = _mock_handler({"action": "list"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert len(body["crawls"]) == 2
    assert body["crawls"][0]["id"] == second_id  # newest first
    assert body["crawls"][0]["rootUrl"] == "https://example.com"


def test_create_creates_crawl_and_enqueues_job(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com", "maxPages": 10, "maxDepth": 2})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    crawl_id = body["crawlId"]

    with isolated_db() as db:
        crawl = db.get(Crawl, crawl_id)
        assert crawl.status == "queued"

        jobs = db.query(Job).filter(Job.job_type == "crawl.start").all()
        assert len(jobs) == 1
        assert jobs[0].payload_json == {"crawl_id": crawl_id}


def test_create_without_root_url_returns_400():
    h = _mock_handler({"action": "create"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)
    assert status == 400
    assert "error" in body


def test_status_returns_crawl_summary(isolated_db):
    crawl_id = _seed_crawl(isolated_db, status="completed", health_score=72.5, seo_score_avg=88.0)

    h = _mock_handler({"action": "status", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["id"] == crawl_id
    assert body["status"] == "completed"
    assert body["healthScore"] == 72.5
    assert body["seoScoreAvg"] == 88.0
    assert body["rootUrl"] == "https://example.com"
    assert body["pagesCrawled"] == 3


def test_status_for_unknown_crawl_returns_404():
    h = _mock_handler({"action": "status", "crawlId": 9999})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)
    assert status == 404


def test_status_without_crawl_id_returns_400():
    h = _mock_handler({"action": "status"})
    crawls.handler.do_POST(h)
    status, _ = _sent_status_and_body(h)
    assert status == 400


def test_thematic_groups_issues_by_theme(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    with isolated_db() as db:
        db.add(Issue(crawl_id=crawl_id, page_id=None, issue_type="Duplicate title", severity="warning",
                      explanation_json={"category": "Metadata", "recommendation": "fix it"}))
        db.commit()

    h = _mock_handler({"action": "thematic", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["themes"]["Metadata"]["count"] == 1
    assert body["themes"]["Metadata"]["by_severity"] == {"warning": 1}


def test_trend_returns_project_history(isolated_db):
    crawl_id = _seed_crawl(isolated_db, health_score=60.0)

    h = _mock_handler({"action": "trend", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert len(body["trend"]) == 1
    assert body["trend"][0]["health_score"] == 60.0


def _seed_page(session_factory, crawl_id, *, url, status_code=200, title=None, seo_score=None) -> int:
    with session_factory() as db:
        page = Page(crawl_id=crawl_id, url=url, normalized_url=url, status_code=status_code,
                    title=title, seo_score=seo_score)
        db.add(page)
        db.commit()
        return page.id


def test_pages_returns_paginated_results_with_severity_counts(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    page_id = _seed_page(isolated_db, crawl_id, url="https://example.com/a", title="A", seo_score=80.0)
    _seed_page(isolated_db, crawl_id, url="https://example.com/b", title="B", seo_score=90.0)
    with isolated_db() as db:
        db.add(Issue(crawl_id=crawl_id, page_id=page_id, issue_type="Missing alt text", severity="notice"))
        db.add(Issue(crawl_id=crawl_id, page_id=page_id, issue_type="Missing canonical", severity="warning"))
        db.commit()

    h = _mock_handler({"action": "pages", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 2
    assert body["page"] == 1
    page_a = next(p for p in body["pages"] if p["url"] == "https://example.com/a")
    assert page_a["title"] == "A"
    assert page_a["seoScore"] == 80.0
    assert page_a["issueCounts"] == {"notice": 1, "warning": 1}
    page_b = next(p for p in body["pages"] if p["url"] == "https://example.com/b")
    assert page_b["issueCounts"] == {}


def test_pages_search_filters_by_url_substring(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    _seed_page(isolated_db, crawl_id, url="https://example.com/blog/post-1")
    _seed_page(isolated_db, crawl_id, url="https://example.com/about")

    h = _mock_handler({"action": "pages", "crawlId": crawl_id, "search": "blog"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 1
    assert body["pages"][0]["url"] == "https://example.com/blog/post-1"


def test_pages_pagination_math(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    for i in range(5):
        _seed_page(isolated_db, crawl_id, url=f"https://example.com/{i}")

    h = _mock_handler({"action": "pages", "crawlId": crawl_id, "page": 2, "pageSize": 2})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 5
    assert body["page"] == 2
    assert body["pageSize"] == 2
    assert len(body["pages"]) == 2


def _seed_issue(session_factory, crawl_id, *, page_id=None, issue_type, severity, category):
    with session_factory() as db:
        db.add(Issue(crawl_id=crawl_id, page_id=page_id, issue_type=issue_type, severity=severity,
                      explanation_json={"category": category, "recommendation": f"Fix {issue_type}"}))
        db.commit()


def test_issues_filters_by_severity(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    _seed_issue(isolated_db, crawl_id, issue_type="A", severity="error", category="Content")
    _seed_issue(isolated_db, crawl_id, issue_type="B", severity="warning", category="Content")

    h = _mock_handler({"action": "issues", "crawlId": crawl_id, "severity": "error"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 1
    assert body["issues"][0]["issueType"] == "A"


def test_issues_filters_by_category(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    _seed_issue(isolated_db, crawl_id, issue_type="A", severity="warning", category="Metadata")
    _seed_issue(isolated_db, crawl_id, issue_type="B", severity="warning", category="Content")

    h = _mock_handler({"action": "issues", "crawlId": crawl_id, "category": "Content"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 1
    assert body["issues"][0]["issueType"] == "B"
    # categories list reflects everything available, not just the selected one
    assert body["categories"] == ["Content", "Metadata"]


def test_issues_search_filters_by_issue_type(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    _seed_issue(isolated_db, crawl_id, issue_type="Missing alt text", severity="notice", category="Images")
    _seed_issue(isolated_db, crawl_id, issue_type="Missing canonical", severity="warning", category="Technical")

    h = _mock_handler({"action": "issues", "crawlId": crawl_id, "search": "alt"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 1
    assert body["issues"][0]["issueType"] == "Missing alt text"


def test_issues_includes_page_url_or_null_for_sitewide(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    page_id = _seed_page(isolated_db, crawl_id, url="https://example.com/a")
    _seed_issue(isolated_db, crawl_id, page_id=page_id, issue_type="Page issue", severity="warning", category="Content")
    _seed_issue(isolated_db, crawl_id, page_id=None, issue_type="Sitewide issue", severity="warning", category="Content")

    h = _mock_handler({"action": "issues", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    page_issue = next(i for i in body["issues"] if i["issueType"] == "Page issue")
    sitewide_issue = next(i for i in body["issues"] if i["issueType"] == "Sitewide issue")
    assert page_issue["pageUrl"] == "https://example.com/a"
    assert sitewide_issue["pageUrl"] is None


def test_issues_pagination_math(isolated_db):
    crawl_id = _seed_crawl(isolated_db)
    for i in range(5):
        _seed_issue(isolated_db, crawl_id, issue_type=f"Issue {i}", severity="warning", category="Content")

    h = _mock_handler({"action": "issues", "crawlId": crawl_id, "page": 2, "pageSize": 2})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["total"] == 5
    assert body["page"] == 2
    assert len(body["issues"]) == 2


def test_compare_returns_not_available_for_a_project_first_crawl(isolated_db):
    crawl_id = _seed_crawl(isolated_db, finished_at=datetime(2026, 1, 1, tzinfo=timezone.utc))

    h = _mock_handler({"action": "compare", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["available"] is False


def test_compare_auto_selects_the_previous_completed_crawl(isolated_db):
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    old_id = _seed_crawl(isolated_db, health_score=50.0, seo_score_avg=85.0, finished_at=t0)
    project_id = _project_id_of(isolated_db, old_id)
    new_id = _seed_crawl(
        isolated_db, project_id=project_id, health_score=75.0, seo_score_avg=80.0,
        finished_at=t0 + timedelta(days=7),
    )

    h = _mock_handler({"action": "compare", "crawlId": new_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["available"] is True
    assert body["compareToId"] == old_id
    assert body["diff"]["healthScoreDelta"] == 25.0
    assert body["diff"]["seoScoreAvgDelta"] == -5.0


def test_compare_accepts_an_explicit_compare_to_id(isolated_db):
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    oldest_id = _seed_crawl(isolated_db, health_score=40.0, finished_at=t0)
    project_id = _project_id_of(isolated_db, oldest_id)
    _seed_crawl(isolated_db, project_id=project_id, health_score=60.0, finished_at=t0 + timedelta(days=3))
    newest_id = _seed_crawl(isolated_db, project_id=project_id, health_score=90.0, finished_at=t0 + timedelta(days=7))

    # explicitly diff against the oldest crawl, skipping the auto-selected
    # (most recent prior) one
    h = _mock_handler({"action": "compare", "crawlId": newest_id, "compareToId": oldest_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["compareToId"] == oldest_id
    assert body["diff"]["healthScoreDelta"] == 50.0  # 90 - 40, not 90 - 60


def test_compare_includes_new_and_fixed_issues(isolated_db):
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    old_id = _seed_crawl(isolated_db, finished_at=t0)
    project_id = _project_id_of(isolated_db, old_id)
    new_id = _seed_crawl(isolated_db, project_id=project_id, finished_at=t0 + timedelta(days=7))

    with isolated_db() as db:
        old_page = Page(crawl_id=old_id, url="https://example.com/a", normalized_url="https://example.com/a")
        new_page = Page(crawl_id=new_id, url="https://example.com/a", normalized_url="https://example.com/a")
        db.add_all([old_page, new_page])
        db.flush()
        db.add(Issue(crawl_id=old_id, page_id=old_page.id, issue_type="Fixed issue", severity="warning"))
        db.add(Issue(crawl_id=new_id, page_id=new_page.id, issue_type="New issue", severity="error"))
        db.commit()

    h = _mock_handler({"action": "compare", "crawlId": new_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert {"url": "https://example.com/a", "issue_type": "New issue"} in body["diff"]["newIssues"]
    assert {"url": "https://example.com/a", "issue_type": "Fixed issue"} in body["diff"]["fixedIssues"]


def test_compare_with_invalid_crawl_id_returns_400():
    h = _mock_handler({"action": "compare"})
    crawls.handler.do_POST(h)
    status, _ = _sent_status_and_body(h)
    assert status == 400


def test_create_with_schedule_cron_sets_it_on_the_crawl_config(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com", "scheduleCron": "0 0 * * *"})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    with isolated_db() as db:
        crawl = db.get(Crawl, body["crawlId"])
        config = db.get(CrawlConfig, crawl.crawl_config_id)
        assert config.schedule_cron == "0 0 * * *"
        assert config.next_run_at is not None


def test_status_includes_null_schedule_when_unscheduled(isolated_db):
    crawl_id = _seed_crawl(isolated_db)

    h = _mock_handler({"action": "status", "crawlId": crawl_id})
    crawls.handler.do_POST(h)
    status, body = _sent_status_and_body(h)

    assert status == 200
    assert body["scheduleCron"] is None
    assert body["nextRunAt"] is None


def test_status_includes_schedule_when_set(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com", "scheduleCron": "0 0 * * *"})
    crawls.handler.do_POST(h)
    crawl_id = _sent_status_and_body(h)[1]["crawlId"]

    h2 = _mock_handler({"action": "status", "crawlId": crawl_id})
    crawls.handler.do_POST(h2)
    status, body = _sent_status_and_body(h2)

    assert status == 200
    assert body["scheduleCron"] == "0 0 * * *"
    assert body["nextRunAt"] is not None


def test_set_schedule_updates_an_existing_crawl(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com"})
    crawls.handler.do_POST(h)
    crawl_id = _sent_status_and_body(h)[1]["crawlId"]

    h2 = _mock_handler({"action": "setSchedule", "crawlId": crawl_id, "scheduleCron": "0 */6 * * *"})
    crawls.handler.do_POST(h2)
    status, body = _sent_status_and_body(h2)

    assert status == 200
    assert body["scheduleCron"] == "0 */6 * * *"
    assert body["nextRunAt"] is not None


def test_set_schedule_with_empty_string_clears_it(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com", "scheduleCron": "0 0 * * *"})
    crawls.handler.do_POST(h)
    crawl_id = _sent_status_and_body(h)[1]["crawlId"]

    h2 = _mock_handler({"action": "setSchedule", "crawlId": crawl_id, "scheduleCron": ""})
    crawls.handler.do_POST(h2)
    status, body = _sent_status_and_body(h2)

    assert status == 200
    assert body["scheduleCron"] is None
    assert body["nextRunAt"] is None


def test_set_schedule_with_invalid_cron_returns_400(isolated_db):
    h = _mock_handler({"action": "create", "rootUrl": "https://example.com"})
    crawls.handler.do_POST(h)
    crawl_id = _sent_status_and_body(h)[1]["crawlId"]

    h2 = _mock_handler({"action": "setSchedule", "crawlId": crawl_id, "scheduleCron": "garbage"})
    crawls.handler.do_POST(h2)
    status, body = _sent_status_and_body(h2)

    assert status == 400
    assert "error" in body


def test_set_schedule_for_unknown_crawl_returns_404(isolated_db):
    h = _mock_handler({"action": "setSchedule", "crawlId": 9999, "scheduleCron": "0 0 * * *"})
    crawls.handler.do_POST(h)
    status, _ = _sent_status_and_body(h)
    assert status == 404
