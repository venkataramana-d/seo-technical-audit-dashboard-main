import logging
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules._http import read_json_body, require_str, send_json  # noqa: E402
from modules.ai_assist import explain_audit, suggest_fix  # noqa: E402

logger = logging.getLogger(__name__)


def _handle_summary(handler, payload):
    try:
        all_issues = payload.get("allIssues") or []
        seo_score = payload.get("seoScore", 0)
        url = (payload.get("url") or "").strip()
        # Optional: overrides the default "for {url}" phrasing, e.g. the
        # Results page's sitewide summary passes "across N audited pages".
        context_label = (payload.get("contextLabel") or "").strip() or None
        api_key = payload.get("apiKey") or os.environ.get("GROQ_API_KEY")

        summary = explain_audit(all_issues, seo_score, api_key, url=url, context_label=context_label)
        status = 200 if summary.get("ok") else 400
        send_json(handler, status, summary)
    except Exception:  # noqa: BLE001
        logger.exception("ai.py (summary) request failed")
        send_json(handler, 500, {"ok": False, "error": "Internal error while generating the summary."})


def _handle_fix_suggestion(handler, payload):
    try:
        issue_title = require_str(handler, payload, "issue", field_name="issue")
        if issue_title is None:
            return

        page_context = payload.get("pageContext") or {}
        if not isinstance(page_context, dict):
            page_context = {}
        api_key = payload.get("apiKey") or os.environ.get("GROQ_API_KEY")

        result = suggest_fix(issue_title, page_context, api_key)
        status = 200 if result.get("ok") else 400
        send_json(handler, status, result)
    except Exception:  # noqa: BLE001
        logger.exception("ai.py (fix-suggestion) request failed")
        send_json(handler, 500, {"ok": False, "error": "Internal error while generating the fix."})


# Consolidates what used to be separate api/*.py files (ai-summary,
# fix-suggestion, config-status) into one Vercel serverless function — see
# api/audit-pipeline.py's module docstring-equivalent comment for why
# (Vercel's Python builder reinstalls the full requirements.txt per function,
# so fewer functions means fewer ~14s installs at build time). Dispatch is by
# an "action" field in the POST body; callers POST to /api/ai with
# {"action": "summary"|"fix-suggestion", ...}. (The "chat" action + floating
# ChatWidget were removed in Session 24 — the AI is now focused on the
# per-page/per-issue personalized fix suggestions and the audit summary.)
_ACTIONS = {
    "summary": _handle_summary,
    "fix-suggestion": _handle_fix_suggestion,
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Config-status is the one GET in this group (just reports whether
        # server-side keys are set), so it doesn't need action dispatch.
        send_json(self, 200, {
            "psiConfigured": bool(os.environ.get("PSI_API_KEY")),
            "groqConfigured": bool(os.environ.get("GROQ_API_KEY")),
        })

    def do_POST(self):
        try:
            payload = read_json_body(self)
        except Exception:  # noqa: BLE001
            logger.exception("ai.py request body could not be parsed")
            send_json(self, 500, {"ok": False, "error": "Internal error while processing the request."})
            return

        action = payload.get("action")
        fn = _ACTIONS.get(action)
        if fn is None:
            send_json(self, 400, {"ok": False, "error": f"Unknown or missing action (expected one of {sorted(_ACTIONS)})"})
            return
        fn(self, payload)
