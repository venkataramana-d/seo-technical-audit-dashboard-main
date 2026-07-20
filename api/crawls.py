"""First-slice frontend API for the crawler platform (Phases 0-3): start a
crawl, watch it run, see its results. Same one-file/action-dispatch
convention as api/audit-pipeline.py — POST {"action": ..., ...} rather than
REST verbs/path params.

Deferred (not this file's job yet): paginated pages/issues tables, the
links tab, site-structure graph, the compare/diff UI, schedule config, the
API-key vault. Each is an incremental addition to this same dispatch table
once the first slice (list/create/status/thematic/trend) is in place.

Talks straight to worker/*.py — same DB file the worker process reads/
writes (worker/db/session.py resolves an absolute path), no separate
network layer, exactly like this repo's existing api/*.py already import
modules/*.py directly.
"""

import logging
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules._http import bulk_url_cap, read_json_body, require_str, send_json  # noqa: E402
from sqlalchemy import select  # noqa: E402
from worker.crawl_diff import get_score_trend  # noqa: E402
from worker.crawl_service import create_crawl  # noqa: E402
from worker.db.models import Crawl, Project  # noqa: E402
from worker.db.session import SessionLocal  # noqa: E402
from worker.queue import enqueue  # noqa: E402
from worker.site_audit import get_thematic_report  # noqa: E402

logger = logging.getLogger(__name__)


def _crawl_summary(crawl: Crawl, root_url: str | None = None) -> dict:
    return {
        "id": crawl.id,
        "rootUrl": root_url,
        "status": crawl.status,
        "healthScore": crawl.health_score,
        "seoScoreAvg": crawl.seo_score_avg,
        "pagesCrawled": crawl.pages_crawled,
        "pagesTotalEstimate": crawl.pages_total_estimate,
        "startedAt": crawl.started_at.isoformat() if crawl.started_at else None,
        "finishedAt": crawl.finished_at.isoformat() if crawl.finished_at else None,
    }


def _parse_crawl_id(handler, payload) -> int | None:
    try:
        return int(payload.get("crawlId"))
    except (TypeError, ValueError):
        send_json(handler, 400, {"error": "crawlId is required and must be an integer"})
        return None


def _handle_list(handler, payload):
    try:
        with SessionLocal() as db:
            rows = db.execute(
                select(Crawl, Project.root_url)
                .join(Project, Crawl.project_id == Project.id)
                .order_by(Crawl.id.desc())
                .limit(50)
            ).all()
            crawls = [_crawl_summary(crawl, root_url) for crawl, root_url in rows]
        send_json(handler, 200, {"crawls": crawls})
    except Exception:  # noqa: BLE001
        logger.exception("crawls.py (list) request failed")
        send_json(handler, 500, {"error": "Internal error while listing crawls."})


def _handle_create(handler, payload):
    try:
        root_url = require_str(handler, payload, "rootUrl")
        if root_url is None:
            return

        max_pages = min(int(payload.get("maxPages", 50) or 50), bulk_url_cap())
        max_depth = max(0, int(payload.get("maxDepth", 3) or 3))
        robots_mode = payload.get("robotsMode") or "respect"

        with SessionLocal() as db:
            crawl = create_crawl(db, root_url, max_pages=max_pages, max_depth=max_depth, robots_mode=robots_mode)
            crawl_id = crawl.id

        enqueue("crawl.start", {"crawl_id": crawl_id})
        send_json(handler, 200, {"crawlId": crawl_id})
    except Exception:  # noqa: BLE001
        logger.exception("crawls.py (create) request failed")
        send_json(handler, 500, {"error": "Internal error while starting the crawl."})


def _handle_status(handler, payload):
    try:
        crawl_id = _parse_crawl_id(handler, payload)
        if crawl_id is None:
            return
        with SessionLocal() as db:
            crawl = db.get(Crawl, crawl_id)
            if crawl is None:
                send_json(handler, 404, {"error": f"No crawl with id {crawl_id}"})
                return
            project = db.get(Project, crawl.project_id)
            send_json(handler, 200, _crawl_summary(crawl, project.root_url if project else None))
    except Exception:  # noqa: BLE001
        logger.exception("crawls.py (status) request failed")
        send_json(handler, 500, {"error": "Internal error while fetching crawl status."})


def _handle_thematic(handler, payload):
    try:
        crawl_id = _parse_crawl_id(handler, payload)
        if crawl_id is None:
            return
        send_json(handler, 200, {"themes": get_thematic_report(crawl_id)})
    except Exception:  # noqa: BLE001
        logger.exception("crawls.py (thematic) request failed")
        send_json(handler, 500, {"error": "Internal error while building the thematic report."})


def _handle_trend(handler, payload):
    try:
        crawl_id = _parse_crawl_id(handler, payload)
        if crawl_id is None:
            return
        with SessionLocal() as db:
            crawl = db.get(Crawl, crawl_id)
            if crawl is None:
                send_json(handler, 404, {"error": f"No crawl with id {crawl_id}"})
                return
            project_id = crawl.project_id
        send_json(handler, 200, {"trend": get_score_trend(project_id)})
    except Exception:  # noqa: BLE001
        logger.exception("crawls.py (trend) request failed")
        send_json(handler, 500, {"error": "Internal error while building the score trend."})


_ACTIONS = {
    "list": _handle_list,
    "create": _handle_create,
    "status": _handle_status,
    "thematic": _handle_thematic,
    "trend": _handle_trend,
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            payload = read_json_body(self)
        except Exception:  # noqa: BLE001
            logger.exception("crawls.py request body could not be parsed")
            send_json(self, 500, {"error": "Internal error while processing the request."})
            return

        action = payload.get("action")
        fn = _ACTIONS.get(action)
        if fn is None:
            send_json(self, 400, {"error": f"Unknown or missing action (expected one of {sorted(_ACTIONS)})"})
            return
        fn(self, payload)
