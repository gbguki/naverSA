"""회원가입/로그인/세션.

- 화이트리스트: @growthb.co.kr 도메인만 가입 허용
- 비밀번호: bcrypt
- 세션: 랜덤 토큰 쿠키(httpOnly, SameSite=Lax), 14일
"""
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, field_validator

from .db import get_conn

ALLOWED_DOMAIN = "growthb.co.kr"
SESSION_COOKIE = "gb_naver_sa_session"
SESSION_TTL_DAYS = 14

router = APIRouter()


class SignupRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _pw_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v

    @field_validator("email")
    @classmethod
    def _domain(cls, v: str) -> str:
        if not v.lower().endswith(f"@{ALLOWED_DOMAIN}"):
            raise ValueError(f"email must be a @{ALLOWED_DOMAIN} address")
        return v.lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _issue_session(user_id: int) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires.isoformat()),
        )
        conn.commit()
    return token, expires


def _set_cookie(response: Response, token: str, expires: datetime) -> None:
    response.set_cookie(
        key=SESSION_COOKIE, value=token, httponly=True,
        samesite="lax", secure=False,  # 사내망/HTTP 가능. HTTPS 배포 시 secure=True
        expires=int(expires.timestamp()),
        path="/",
    )


def current_user(session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict:
    if not session:
        raise HTTPException(401, "not authenticated")
    with get_conn() as conn:
        row = conn.execute(
            """SELECT u.id, u.email, u.active_credential_id, s.expires_at
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token = ?""",
            (session,),
        ).fetchone()
    if not row:
        raise HTTPException(401, "invalid session")
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(401, "session expired")
    return {"id": row["id"], "email": row["email"], "active_credential_id": row["active_credential_id"]}


@router.post("/auth/signup")
def signup(req: SignupRequest, response: Response):
    with get_conn() as conn:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (req.email,)).fetchone()
        if existing:
            raise HTTPException(409, "email already registered")
        cur = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (req.email, _hash_pw(req.password)),
        )
        conn.commit()
        user_id = cur.lastrowid
    token, exp = _issue_session(user_id)
    _set_cookie(response, token, exp)
    return {"ok": True, "email": req.email}


@router.post("/auth/login")
def login(req: LoginRequest, response: Response):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE email = ?", (req.email.lower(),)
        ).fetchone()
    if not row or not _verify_pw(req.password, row["password_hash"]):
        raise HTTPException(401, "invalid email or password")
    token, exp = _issue_session(row["id"])
    _set_cookie(response, token, exp)
    return {"ok": True, "email": req.email.lower()}


@router.post("/auth/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias=SESSION_COOKIE)):
    if session:
        with get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (session,))
            conn.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(user=Depends(current_user)):
    return {"email": user["email"], "activeCredentialId": user["active_credential_id"]}
