"""Tests for worker/crawl_service.py + worker/tasks.py's handle_crawl_start —
verifies DB persistence, severity mapping, and Crawl status transitions
without network access. modules.crawler.crawl_site's own BFS logic is
already covered by tests/test_crawler.py; this tests the persistence/
job-wrapping layer built on top of it, so crawl_site itself is faked."""

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from worker import crawl_service, tasks
from worker.db.models import Base, Crawl, Issue, Link, Page


def _isolated_session_factory():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _fake_crawl_site_success(config, on_result=None, progress_callback=None):
    """Synthesizes a 2-page crawl and drives the same on_result callback the
    real crawl_site would, so persist_result is exercised exactly as it
    would be in production."""
    outcomes = {
        "https://example.com/": {
            "page": {
                "url": "https://example.com/",
                "status_code": 200,
                "audit": {
                    "seo_score": 88.0,
                    "metadata": {"title": "Home", "description": "Homepage desc"},
                    "headings": {"h1_texts": ["Welcome"]},
                    "all_issues": [
                        {
                            "issue": "Missing alt text", "category": "Images", "severity": "Low",
                            "recommendation": "Add alt text", "impact_score": 3, "effort": "Low",
                        },
                    ],
                },
            },
            "links": {"https://example.com/about"},
        },
        "https://example.com/about": {
            "page": {
                "url": "https://example.com/about",
                "status_code": 200,
                "audit": {
                    "seo_score": 40.0,
                    "metadata": {"title": "About", "description": None},
                    "headings": {"h1_texts": []},
                    "all_issues": [
                        {
                            "issue": "Missing H1 Tag", "category": "Headings", "severity": "Critical",
                            "recommendation": "Add an H1", "impact_score": 9, "effort": "Low",
                        },
                    ],
                },
            },
            "links": set(),
        },
    }
    for url, outcome in outcomes.items():
        if on_result:
            on_result(url, outcome)
    return {"pages": [o["page"] for o in outcomes.values()], "stats": {"pages_crawled": len(outcomes)}}


def _fake_crawl_site_raises(config, on_result=None, progress_callback=None):
    raise RuntimeError("network exploded")


@pytest.fixture
def isolated_db(monkeypatch):
    session_factory = _isolated_session_factory()
    monkeypatch.setattr(crawl_service, "SessionLocal", session_factory)
    monkeypatch.setattr(tasks, "SessionLocal", session_factory)
    return session_factory


def test_create_crawl_creates_project_config_and_queued_crawl(isolated_db):
    with isolated_db() as db:
        crawl = crawl_service.create_crawl(db, "https://example.com", max_pages=10)
        assert crawl.status == "queued"
        assert crawl.crawl_config_id is not None
        assert crawl.project_id is not None


def test_handle_crawl_start_persists_pages_links_issues_and_scores(monkeypatch, isolated_db):
    monkeypatch.setattr(tasks, "crawl_site", _fake_crawl_site_success)

    with isolated_db() as db:
        crawl = crawl_service.create_crawl(db, "https://example.com", max_pages=10)
        crawl_id = crawl.id

    result = tasks.handle_crawl_start({"crawl_id": crawl_id})

    with isolated_db() as db:
        crawl = db.get(Crawl, crawl_id)
        assert crawl.status == "completed"
        assert crawl.pages_crawled == 2
        assert crawl.finished_at is not None

        pages = db.execute(select(Page).where(Page.crawl_id == crawl_id)).scalars().all()
        assert len(pages) == 2
        home = next(p for p in pages if p.url == "https://example.com/")
        assert home.title == "Home"
        assert home.h1 == "Welcome"
        assert home.seo_score == 88.0

        links = db.execute(select(Link)).scalars().all()
        assert len(links) == 1
        assert links[0].target_url == "https://example.com/about"
        assert links[0].link_type == "internal"

        issues = db.execute(select(Issue).where(Issue.crawl_id == crawl_id)).scalars().all()
        assert len(issues) == 2
        by_type = {i.issue_type: i for i in issues}
        assert by_type["Missing alt text"].severity == "notice"  # Low -> notice
        assert by_type["Missing alt text"].explanation_json["original_severity"] == "Low"
        assert by_type["Missing H1 Tag"].severity == "error"  # Critical -> error

        # health_score: 1 of 2 audited pages has zero "error"-severity issues
        assert crawl.health_score == 50.0
        # seo_score_avg: mean(88.0, 40.0)
        assert crawl.seo_score_avg == 64.0

    assert result["crawl_id"] == crawl_id
    assert result["health_score"] == 50.0


def test_handle_crawl_start_marks_crawl_failed_on_exception(monkeypatch, isolated_db):
    monkeypatch.setattr(tasks, "crawl_site", _fake_crawl_site_raises)

    with isolated_db() as db:
        crawl = crawl_service.create_crawl(db, "https://example.com", max_pages=10)
        crawl_id = crawl.id

    with pytest.raises(RuntimeError, match="network exploded"):
        tasks.handle_crawl_start({"crawl_id": crawl_id})

    with isolated_db() as db:
        crawl = db.get(Crawl, crawl_id)
        assert crawl.status == "failed"
        assert crawl.finished_at is not None


def test_handle_crawl_start_persists_page_row_for_robots_skip_and_error(monkeypatch, isolated_db):
    def fake_crawl_site(config, on_result=None, progress_callback=None):
        on_result("https://example.com/private", {"skipped": "robots", "url": "https://example.com/private"})
        on_result("https://example.com/broken", {"error": "connection refused", "url": "https://example.com/broken"})
        return {"pages": [], "stats": {"pages_crawled": 0}}

    monkeypatch.setattr(tasks, "crawl_site", fake_crawl_site)

    with isolated_db() as db:
        crawl = crawl_service.create_crawl(db, "https://example.com", max_pages=10)
        crawl_id = crawl.id

    tasks.handle_crawl_start({"crawl_id": crawl_id})

    with isolated_db() as db:
        pages = db.execute(select(Page).where(Page.crawl_id == crawl_id)).scalars().all()
        assert {p.url for p in pages} == {"https://example.com/private", "https://example.com/broken"}
        assert all(p.seo_score is None for p in pages)

        crawl = db.get(Crawl, crawl_id)
        # no audited pages (no seo_score) -> health_score/seo_score_avg stay None
        assert crawl.health_score is None
        assert crawl.seo_score_avg is None
        assert crawl.status == "completed"
