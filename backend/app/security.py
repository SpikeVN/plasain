import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi import Header, HTTPException, status

from app.config import SESSION_DAYS
from app.database import get_connection


def password_hash(password: str, salt: bytes) -> bytes:
    """Return the requested salted BLAKE2b digest for a password."""
    return hashlib.blake2b(password.encode("utf-8"), salt=salt, digest_size=32).digest()


def token_hash(token: str) -> bytes:
    return hashlib.blake2b(token.encode("utf-8"), digest_size=32).digest()


def issue_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now.isoformat(),))
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token_hash(token), user_id, (now + timedelta(days=SESSION_DAYS)).isoformat(), now.isoformat()),
        )
    return token


def user_for_token(authorization: str | None) -> sqlite3.Row | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    with get_connection() as connection:
        return connection.execute(
            """SELECT users.id, users.username FROM sessions
               JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
            (token_hash(authorization.removeprefix("Bearer ")), datetime.now(UTC).isoformat()),
        ).fetchone()


def require_user(authorization: str | None = Header(default=None)) -> sqlite3.Row:
    user = user_for_token(authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user


def revoke_session(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        return
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(authorization.removeprefix("Bearer ")),))


def valid_password(password: str, salt: bytes, expected_hash: bytes) -> bool:
    return hmac.compare_digest(password_hash(password, salt), expected_hash)
