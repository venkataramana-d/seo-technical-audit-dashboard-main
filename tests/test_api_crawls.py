"""Tests for api/crawls.py — the first-slice frontend API (list/create/
status/thematic/trend). Follows tests/test_api_consolidation.py's pattern
for loading a hyphen-free api/*.py file via importlib and driving do_POST
with a MagicMock-based fake BaseHTTPRequestHandler, combined with the
in-memory-SQLite monkeypatch pattern used across tests/test_worker_*.py."""

import importlib.util
import io
import json
import os
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from worker import crawl_diff, queue as queue_module, site_audit
from worker.db.models import Base, Crawl, CrawlConfig, Job, Organization, Project


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


def _seed_crawl(session_factory, *, status="completed", health_score=80.0, seo_score_avg=85.0) -> int:
    with session_factory() as db:
        org = Organization(name="Test Org")
        db.add(org)
        db.flush()
        project = Project(org_id=org.id, name="example.com", root_url="https://example.com")
        db.add(project)
        db.flush()
        config = CrawlConfig(project_id=project.id, source_type="homepage", robots_mode="respect", max_pages=50)
        db.add(config)
        db.flush()
        crawl = Crawl(
            project_id=project.id, crawl_config_id=config.id, status=status,
            health_score=health_score, seo_score_avg=seo_score_avg, pages_crawled=3,
        )
        db.add(crawl)
        db.commit()
        return crawl.id


def test_all_five_actions_registered():
    assert set(crawls._ACTIONS) == {"list", "create", "status", "thematic", "trend"}


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
        from worker.db.models import Issue

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
