"""Tests for the auth core (worker/auth.py) and the api/auth.py handler.

Unit-tests the scrypt hashing + stateless HMAC session token, then drives the
signup/login/logout/me flow through a MagicMock BaseHTTPRequestHandler exactly
like tests/test_api_crawls.py.
"""
import importlib.util
import io
import json
import os
import time
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from worker import auth
from worker.db.models import Base


def _load(name, relative_path):
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), relative_path)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


auth_api = _load("auth_under_test", "api/auth.py")


def _mock_handler(body: dict | None = None, cookie: str | None = None):
    encoded = json.dumps(body or {}).encode()
    h = MagicMock()
    headers = {"Content-Length": str(len(encoded))}
    if cookie:
        headers["Cookie"] = cookie
    h.headers = headers
    h.rfile = io.BytesIO(encoded)
    h.wfile = io.BytesIO()
    return h


def _status_and_body(h):
    return h.send_response.call_args[0][0], json.loads(h.wfile.getvalue())


def _set_cookie(h) -> str | None:
    for call in h.send_header.call_args_list:
        if call[0][0] == "Set-Cookie":
            return call[0][1]
    return None


def _cookie_header_from(set_cookie: str) -> str:
    # "sa_session=<token>; HttpOnly; ..." -> "sa_session=<token>"
    return set_cookie.split(";", 1)[0]


ADMIN_EMAIL = "owner@acme.test"


@pytest.fixture
def isolated_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(auth_api, "SessionLocal", factory)
    return factory


@pytest.fixture(autouse=True)
def pinned_admin(monkeypatch):
    """Pin a deterministic workspace admin for every test (the real default is
    a hard-coded company email)."""
    monkeypatch.setattr(auth, "ADMIN_EMAIL", ADMIN_EMAIL)
    return ADMIN_EMAIL


def _signup(email, password="hunter2xy", org="Acme"):
    h = _mock_handler({"action": "signup", "email": email, "password": password, "orgName": org})
    auth_api.handler.do_POST(h)
    return h


# ---- password hashing ----

def test_hash_and_verify_password():
    stored = auth.hash_password("correct horse battery staple")
    assert stored.startswith("scrypt:")
    assert auth.verify_password("correct horse battery staple", stored)
    assert not auth.verify_password("wrong", stored)


def test_verify_rejects_malformed_hash():
    assert not auth.verify_password("x", "not-a-hash")
    assert not auth.verify_password("x", "scrypt:zz:zz")


# ---- session token ----

def test_session_token_roundtrip():
    tok = auth.create_session_token(42)
    assert auth.verify_session_token(tok) == 42


def test_session_token_tampered_is_rejected():
    tok = auth.create_session_token(42)
    payload, _, sig = tok.partition(".")
    assert auth.verify_session_token(f"{payload}.{sig}x") is None
    assert auth.verify_session_token("garbage") is None
    assert auth.verify_session_token(None) is None


def test_session_token_expired_is_rejected(monkeypatch):
    tok = auth.create_session_token(7)
    future = time.time() + auth.SESSION_TTL_SECONDS + 10
    monkeypatch.setattr(auth.time, "time", lambda: future)
    assert auth.verify_session_token(tok) is None


# ---- api/auth.py flow ----

def test_signup_sets_cookie_and_returns_user(isolated_db):
    h = _signup(ADMIN_EMAIL, org="Acme")
    status, body = _status_and_body(h)
    assert status == 201
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["orgId"] is not None
    assert _set_cookie(h) and _cookie_header_from(_set_cookie(h)).startswith("sa_session=")


def test_duplicate_signup_returns_409(isolated_db):
    _signup(ADMIN_EMAIL, org="A")
    h2 = _signup(ADMIN_EMAIL, org="B")
    status, _ = _status_and_body(h2)
    assert status == 409


def test_short_password_rejected(isolated_db):
    h = _signup(ADMIN_EMAIL, password="short")
    status, _ = _status_and_body(h)
    assert status == 400


def test_login_wrong_password_401_no_leak(isolated_db):
    _signup(ADMIN_EMAIL, org="A")
    h2 = _mock_handler({"action": "login", "email": ADMIN_EMAIL, "password": "nope"})
    auth_api.handler.do_POST(h2)
    status, body = _status_and_body(h2)
    assert status == 401
    # same message whether the email exists or not (no existence leak)
    h3 = _mock_handler({"action": "login", "email": "ghost@b.com", "password": "nope"})
    auth_api.handler.do_POST(h3)
    _, body3 = _status_and_body(h3)
    assert body["error"] == body3["error"]


def test_login_then_me_roundtrip(isolated_db):
    h = _signup(ADMIN_EMAIL, org="A")
    cookie = _cookie_header_from(_set_cookie(h))

    me = _mock_handler(cookie=cookie)
    auth_api.handler.do_GET(me)
    status, body = _status_and_body(me)
    assert status == 200
    assert body["user"]["email"] == ADMIN_EMAIL


# ---- roles: admin vs user in one shared workspace ----

def test_admin_email_signup_gets_admin_role(isolated_db):
    h = _signup(ADMIN_EMAIL)
    status, body = _status_and_body(h)
    assert status == 201
    assert body["user"]["role"] == "admin"


def test_admin_email_is_case_insensitive(isolated_db):
    h = _signup("Owner@ACME.test")
    status, body = _status_and_body(h)
    assert status == 201
    assert body["user"]["role"] == "admin"


def test_user_joins_admin_workspace_as_user_role(isolated_db):
    admin_h = _signup(ADMIN_EMAIL, org="HQ")
    _, admin_body = _status_and_body(admin_h)
    admin_org = admin_body["user"]["orgId"]

    user_h = _signup("teammate@acme.test")
    status, body = _status_and_body(user_h)
    assert status == 201
    assert body["user"]["role"] == "user"
    # a regular user lands in the SAME shared workspace as the admin
    assert body["user"]["orgId"] == admin_org


def test_user_signup_blocked_until_admin_exists(isolated_db):
    h = _signup("teammate@acme.test")
    status, _ = _status_and_body(h)
    assert status == 403


def test_require_admin_allows_admin_blocks_user(isolated_db):
    factory = isolated_db
    admin_cookie = _cookie_header_from(_set_cookie(_signup(ADMIN_EMAIL)))
    user_cookie = _cookie_header_from(_set_cookie(_signup("teammate@acme.test")))

    with factory() as db:
        # admin passes (returns their uid, no raise)
        assert auth.require_admin(_mock_handler(cookie=admin_cookie), db) > 0
        # a signed-in regular user is rejected with 403
        with pytest.raises(auth.AuthError) as ei:
            auth.require_admin(_mock_handler(cookie=user_cookie), db)
        assert ei.value.status == 403


def test_me_without_cookie_is_null(isolated_db):
    me = _mock_handler()
    auth_api.handler.do_GET(me)
    status, body = _status_and_body(me)
    assert status == 200 and body["user"] is None


def test_logout_clears_cookie(isolated_db):
    h = _mock_handler({"action": "logout"})
    auth_api.handler.do_POST(h)
    status, _ = _status_and_body(h)
    assert status == 200
    assert "Max-Age=0" in _set_cookie(h)
