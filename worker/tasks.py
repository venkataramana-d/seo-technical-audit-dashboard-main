"""Job handler registry — the "packaging, not rewriting" proof point.

Each handler is a thin wrapper: it unpacks a job payload and calls existing
`modules/*.py` functions completely unchanged, then hands the result back to
the queue to persist. No audit logic lives in this file.
"""

from __future__ import annotations

from modules.auditor import audit_url
from worker.queue import register


@register("audit.page")
def handle_audit_page(payload: dict) -> dict:
    """Runs the existing single-URL audit pipeline unchanged. `payload`
    matches `audit_url`'s keyword arguments (url, audit_type, check_links,
    validate_links, fetch_pagespeed, psi_api_key)."""
    return audit_url(**payload)


@register("crawl.start")
def handle_crawl_start(payload: dict) -> dict:
    """Placeholder — the BFS crawl loop is Phase 1 (`01-CRAWLER-ENGINE.md`).
    Registered now so the job_type exists for Phase 1 to implement against."""
    raise NotImplementedError("crawl.start is implemented in Phase 1")
