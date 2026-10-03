import secrets
import sqlite3
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.database import get_connection
from app.schemas import Credentials, ProfileUpdate
from app.security import issue_session, password_hash, require_user, revoke_session, valid_password

router = APIRouter(prefix="/api/auth", tags=["authentication"])


def auth_response(user_id: str, username: str) -> dict[str, object]:
    with get_connection() as connection:
        user = connection.execute("SELECT id, username, display_name, height_cm, biological_sex, avatar FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"token": issue_session(user_id), **profile_response(user)}


def profile_response(user: sqlite3.Row) -> dict[str, object]:
    return {"user": {"id": user["id"], "username": user["username"], "display_name": user["display_name"] or user["username"], "height_cm": user["height_cm"], "biological_sex": user["biological_sex"], "avatar": user["avatar"]}}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(credentials: Credentials) -> dict[str, object]:
    salt = secrets.token_bytes(16)
    try:
        with get_connection() as connection:
            user_id = str(uuid4())
            connection.execute(
                "INSERT INTO users (id, username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, credentials.username, salt, password_hash(credentials.password, salt), datetime.now(UTC).isoformat()),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That username is already taken.") from error
    return auth_response(user_id, credentials.username)


@router.post("/login")
async def login(credentials: Credentials) -> dict[str, object]:
    with get_connection() as connection:
        user = connection.execute(
            "SELECT id, username, password_salt, password_hash FROM users WHERE username = ?", (credentials.username,),
        ).fetchone()
    if not user or not valid_password(credentials.password, user["password_salt"], user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    return auth_response(user["id"], user["username"])


@router.get("/me")
async def me(user: sqlite3.Row = Depends(require_user)) -> dict[str, object]:
    with get_connection() as connection:
        profile = connection.execute("SELECT id, username, display_name, height_cm, biological_sex, avatar FROM users WHERE id = ?", (user["id"],)).fetchone()
    return profile_response(profile)


@router.api_route("/me", methods=["PATCH", "POST"])
async def update_profile(profile: ProfileUpdate, user: sqlite3.Row = Depends(require_user)) -> dict[str, object]:
    if profile.avatar is not None and not profile.avatar.startswith("data:image/"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Avatar must be an image.")
    with get_connection() as connection:
        if profile.avatar is None:
            connection.execute("UPDATE users SET display_name = ?, height_cm = ?, biological_sex = ? WHERE id = ?", (profile.display_name, profile.height_cm, profile.biological_sex, user["id"]))
        else:
            connection.execute("UPDATE users SET display_name = ?, height_cm = ?, biological_sex = ?, avatar = ? WHERE id = ?", (profile.display_name, profile.height_cm, profile.biological_sex, profile.avatar, user["id"]))
        updated = connection.execute("SELECT id, username, display_name, height_cm, biological_sex, avatar FROM users WHERE id = ?", (user["id"],)).fetchone()
    return profile_response(updated)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(authorization: str | None = Header(default=None)) -> None:
    revoke_session(authorization)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(user: sqlite3.Row = Depends(require_user)) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        connection.execute("DELETE FROM user_dishes WHERE user_id = ?", (user["id"],))
        connection.execute("DELETE FROM plans WHERE user_id = ?", (user["id"],))
        connection.execute("DELETE FROM users WHERE id = ?", (user["id"],))
