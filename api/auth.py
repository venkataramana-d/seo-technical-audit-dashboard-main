"""Auth API — signup / login / logout / me. Same one-file/action-dispatch
convention as the other api/*.py handlers, but POST actions may also set or
clear the session cookie, so responses go through a small cookie-aware
responder instead of modules._http.send_json.

  POST /api/auth {"action": "signup", "email", "password", "orgName"}
  POST /api/auth {"action": "login",  "email", "password"}
  POST /api/auth {"action": "logout"}
  GET  /api/auth   -> {"user": {...}} or {"user": null}
"""

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules._http import read_json_body, require_str, send_json  # noqa: E402
from worker.auth import (  # noqa: E402
    AuthError, build_session_cookie, create_session_token, get_session_user_id,
    login as auth_login, primary_org_id, signup as auth_signup,
)
from worker.db.models import User  # noqa: E402
from worker.db.session import SessionLocal  # noqa: E402

logger = logging.getLogger(__name__)


def _send_json_with_cookie(handler, status, data, cookie: str | None = None):
    body = json.dumps(data, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    if cookie:
        handler.send_header("Set-Cookie", cookie)
    handler.end_headers()
    handler.wfile.write(body)


def _user_dto(db, user: User) -> dict:
    return {"id": user.id, "email": user.email, "orgId": primary_org_id(db, user.id)}


def _handle_signup(handler, payload):
    email = require_str(handler, payload, "email", field_name="email")
    if email is None:
        return
    password = require_str(handler, payload, "password", field_name="password")
    if password is None:
        return
    if len(password) < 8:
        send_json(handler, 400, {"error": "password must be at least 8 characters"})
        return
    org_name = (payload.get("orgName") or payload.get("org_name") or "").strip()

    try:
        with SessionLocal() as db:
            user = auth_signup(db, email, password, org_name)
            dto = _user_dto(db, user)
            cookie = build_session_cookie(create_session_token(user.id))
            _send_json_with_cookie(handler, 201, {"user": dto}, cookie)
    except AuthError as e:
        send_json(handler, e.status, {"error": e.message})
    except Exception:  # noqa: BLE001
        logger.exception("auth.py signup failed")
        send_json(handler, 500, {"error": "Internal error during signup."})


def _handle_login(handler, payload):
    email = require_str(handler, payload, "email", field_name="email")
    if email is None:
        return
    password = require_str(handler, payload, "password", field_name="password")
    if password is None:
        return
    try:
        with SessionLocal() as db:
            user = auth_login(db, email, password)
            if user is None:
                send_json(handler, 401, {"error": "invalid email or password"})
                return
            dto = _user_dto(db, user)
            cookie = build_session_cookie(create_session_token(user.id))
            _send_json_with_cookie(handler, 200, {"user": dto}, cookie)
    except Exception:  # noqa: BLE001
        logger.exception("auth.py login failed")
        send_json(handler, 500, {"error": "Internal error during login."})


def _handle_logout(handler, payload):
    _send_json_with_cookie(handler, 200, {"ok": True}, build_session_cookie("", clear=True))


_ACTIONS = {
    "signup": _handle_signup,
    "login": _handle_login,
    "logout": _handle_logout,
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # "me" — current session user, or null.
        try:
            uid = get_session_user_id(self)
            if uid is None:
                send_json(self, 200, {"user": None})
                return
            with SessionLocal() as db:
                user = db.get(User, uid)
                send_json(self, 200, {"user": _user_dto(db, user) if user else None})
        except Exception:  # noqa: BLE001
            logger.exception("auth.py me failed")
            send_json(self, 500, {"error": "Internal error."})

    def do_POST(self):
        try:
            payload = read_json_body(self)
        except Exception:  # noqa: BLE001
            logger.exception("auth.py request body could not be parsed")
            send_json(self, 500, {"error": "Internal error while processing the request."})
            return
        action = payload.get("action")
        fn = _ACTIONS.get(action)
        if fn is None:
            send_json(self, 400, {"error": f"Unknown or missing action (expected one of {sorted(_ACTIONS)})"})
            return
        fn(self, payload)
