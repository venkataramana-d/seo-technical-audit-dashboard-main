# Worker service (Phase 0 — foundations)

Phase 0 of the site-wide crawling platform rebuild (see
[SEMRUSH-AHREFS-TECHNICAL-REFERENCE.md](../SEMRUSH-AHREFS-TECHNICAL-REFERENCE.md)
for the competitive/technical grounding behind it) — the DB schema, a local
job queue, and packaging for the existing `modules/*.py` audit logic to run
as worker-callable functions. **No behavior change** to any existing audit
check; nothing in `modules/`, `api/`, `app/`, or `components/` was touched.

Local dev needs no external services: SQLite substitutes for Postgres, and a
DB-backed queue (`worker/queue.py`) substitutes for Redis+Celery/arq. Both
are designed to swap to the real thing later via `DATABASE_URL` alone — see
"Going to production" below.

## Run it locally

```bash
pip install -r requirements.txt   # adds sqlalchemy + alembic + playwright, etc.
playwright install chromium       # one-time: downloads the browser Playwright drives (~300MB)
python -m alembic upgrade head    # creates worker/dev.db with all tables
python -m worker                  # starts the polling worker (Ctrl+C to stop)
```

Enqueue a job from another shell/script while the worker is running:

```python
from worker.queue import enqueue
enqueue("audit.page", {"url": "https://example.com", "check_links": True})
```

The worker picks it up within `poll_interval` seconds (default 2s), runs the
existing `modules.auditor.audit_url()` unchanged, and writes the result back
to the `jobs` table's `result_json` column.

## What's here

| File | Purpose |
|---|---|
| `db/models.py` | SQLAlchemy models — tenancy, projects, crawls, pages, links, issues, and the `jobs` table backing the local queue |
| `db/session.py` | Engine/session factory, reads `DATABASE_URL` (defaults to local SQLite) |
| `queue.py` | `enqueue()` + `Worker` — atomic claim via `UPDATE ... RETURNING`, works unchanged on SQLite 3.35+ and Postgres |
| `tasks.py` | Job handler registry — thin wrappers calling existing `modules/*.py` functions |
| `__main__.py` | `python -m worker` entry point |

## Going to production

Set `DATABASE_URL=postgresql://...` — no code changes needed; `db/models.py`
uses dialect-neutral types throughout. The queue itself (`queue.py`) is the
one piece expected to be *replaced*, not reconfigured, when real concurrent
worker replicas are needed: swap it for Celery/arq + Redis behind the same
`enqueue()` call sites, per `05-INFRASTRUCTURE-AND-OPS.md` in the rebuild
plan.

## Not in this phase

The BFS crawl loop (`crawl.start` is registered as a job type in `tasks.py`
but raises `NotImplementedError` — that's Phase 1), any new frontend pages,
and a real login flow (the `users`/`organizations`/`memberships` tables
exist for foreign-key completeness only; no auth UI yet).
