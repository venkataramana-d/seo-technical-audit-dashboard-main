"""Authentication core (Python port of web/lib/auth.ts) —
05-INFRASTRUCTURE-AND-OPS.md §4: every API query must scope by an org_id
derived from the authenticated session, never a client-supplied id.

Dependency-free by design: passwords use hashlib.scrypt, sessions are
stateless HMAC-SHA256-signed cookies — no bcrypt / jwt / auth libs. The live
tool's backend is Python serverless functions, so both signing and verifying
happen here; a revocable server-side session store can replace the stateless
token later without changing the api/*.py call sites (require_user_id).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from http.cookies import SimpleCookie

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from worker.db.models import Membership, Organization, User

SESSION_COOKIE = "sa_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

# scrypt cost parameters (interop not required — Python signs and verifies).
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 64
_SCRYPT_MAXMEM = 128 * 1024 * 1024


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _auth_secret() -> str:
    s = os.environ.get("AUTH_SECRET")
    if s and len(s) >= 16:
        return s
    # VERCEL=1 is set for every deployed (prod + preview) invocation.
    if os.environ.get("VERCEL"):
        raise AuthError(500, "AUTH_SECRET must be set (>= 16 chars) in production")
    return "dev-insecure-secret-do-not-use-in-prod"


def _is_prod() -> bool:
    return bool(os.environ.get("VERCEL"))


# --------------------------------------------------------------------------- #
# password hashing (scrypt)
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN, maxmem=_SCRYPT_MAXMEM,
    )
    return f"scrypt:{salt.hex()}:{derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    parts = (stored or "").split(":")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    try:
        salt = bytes.fromhex(parts[1])
        expected = bytes.fromhex(parts[2])
    except ValueError:
        return False
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=len(expected), maxmem=_SCRYPT_MAXMEM,
    )
    return hmac.compare_digest(expected, derived)


# --------------------------------------------------------------------------- #
# stateless session token (HMAC-SHA256)
# --------------------------------------------------------------------------- #
def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(payload: str) -> str:
    sig = hmac.new(_auth_secret().encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    return _b64url(sig)


def create_session_token(user_id: int) -> str:
    exp = int(time.time()) + SESSION_TTL_SECONDS
    payload = _b64url(json.dumps({"uid": int(user_id), "exp": exp}).encode("utf-8"))
    return f"{payload}.{_sign(payload)}"


def verify_session_token(token: str | None) -> int | None:
    if not token or "." not in token:
        return None
    payload, _, sig = token.partition(".")
    if not payload or not sig:
        return None
    if not hmac.compare_digest(sig, _sign(payload)):
        return None
    try:
        obj = json.loads(_b64url_decode(payload))
        uid, exp = obj.get("uid"), obj.get("exp")
        if not isinstance(uid, int) or not isinstance(exp, int):
            return None
        if exp < int(time.time()):
            return None
        return uid
    except (ValueError, TypeError):
        return None


# --------------------------------------------------------------------------- #
# cookie helpers for the http.server-style handlers
# --------------------------------------------------------------------------- #
def build_session_cookie(token: str, *, clear: bool = False) -> str:
    parts = [
        f"{SESSION_COOKIE}={'' if clear else token}",
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        f"Max-Age={0 if clear else SESSION_TTL_SECONDS}",
    ]
    if _is_prod():
        parts.append("Secure")
    return "; ".join(parts)


def read_session_cookie(handler) -> str | None:
    raw = handler.headers.get("Cookie")
    if not raw:
        return None
    jar = SimpleCookie()
    try:
        jar.load(raw)
    except Exception:  # noqa: BLE001
        return None
    morsel = jar.get(SESSION_COOKIE)
    return morsel.value if morsel else None


def get_session_user_id(handler) -> int | None:
    """The authenticated user id from the request's session cookie, or None."""
    return verify_session_token(read_session_cookie(handler))


def require_user_id(handler) -> int:
    """Authenticated user id, or raise AuthError(401)."""
    uid = get_session_user_id(handler)
    if uid is None:
        raise AuthError(401, "authentication required")
    return uid


# --------------------------------------------------------------------------- #
# DB operations (users / organizations / memberships)
# --------------------------------------------------------------------------- #
def signup(db, email: str, password: str, org_name: str) -> User:
    """Create a user, their organization, and an owner membership. Raises
    AuthError(409) if the email already exists."""
    email = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise AuthError(409, "an account with this email already exists")

    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.flush()
        org = Organization(name=org_name.strip() or f"{email}'s workspace")
        db.add(org)
        db.flush()
        db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AuthError(409, "an account with this email already exists")
    return user


def login(db, email: str, password: str) -> User | None:
    """Return the user on valid credentials, else None (no existence leak)."""
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def primary_org_id(db, user_id: int) -> int | None:
    """The org id for the user's first membership (owner workspace)."""
    return db.scalar(
        select(Membership.org_id).where(Membership.user_id == user_id).order_by(Membership.org_id)
    )
