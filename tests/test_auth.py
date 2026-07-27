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


@pytest.fixture
def isolated_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(auth_api, "SessionLocal", factory)
    return factory


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
    h = _mock_handler({"action": "signup", "email": "a@b.com", "password": "hunter2xy", "orgName": "Acme"})
    auth_api.handler.do_POST(h)
    status, body = _status_and_body(h)
    assert status == 201
    assert body["user"]["email"] == "a@b.com"
    assert body["user"]["orgId"] is not None
    assert _set_cookie(h) and _cookie_header_from(_set_cookie(h)).startswith("sa_session=")


def test_duplicate_signup_returns_409(isolated_db):
    for _ in range(1):
        h = _mock_handler({"action": "signup", "email": "dup@b.com", "password": "hunter2xy", "orgName": "A"})
        auth_api.handler.do_POST(h)
    h2 = _mock_handler({"action": "signup", "email": "dup@b.com", "password": "hunter2xy", "orgName": "B"})
    auth_api.handler.do_POST(h2)
    status, body = _status_and_body(h2)
    assert status == 409


def test_short_password_rejected(isolated_db):
    h = _mock_handler({"action": "signup", "email": "s@b.com", "password": "short", "orgName": "A"})
    auth_api.handler.do_POST(h)
    status, _ = _status_and_body(h)
    assert status == 400


def test_login_wrong_password_401_no_leak(isolated_db):
    h = _mock_handler({"action": "signup", "email": "u@b.com", "password": "hunter2xy", "orgName": "A"})
    auth_api.handler.do_POST(h)
    h2 = _mock_handler({"action": "login", "email": "u@b.com", "password": "nope"})
    auth_api.handler.do_POST(h2)
    status, body = _status_and_body(h2)
    assert status == 401
    # same message whether the email exists or not (no existence leak)
    h3 = _mock_handler({"action": "login", "email": "ghost@b.com", "password": "nope"})
    auth_api.handler.do_POST(h3)
    _, body3 = _status_and_body(h3)
    assert body["error"] == body3["error"]


def test_login_then_me_roundtrip(isolated_db):
    h = _mock_handler({"action": "signup", "email": "me@b.com", "password": "hunter2xy", "orgName": "A"})
    auth_api.handler.do_POST(h)
    cookie = _cookie_header_from(_set_cookie(h))

    me = _mock_handler(cookie=cookie)
    auth_api.handler.do_GET(me)
    status, body = _status_and_body(me)
    assert status == 200
    assert body["user"]["email"] == "me@b.com"


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
