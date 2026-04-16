"""네이버 API 자격증명 등록/목록/삭제/활성 전환."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from . import crypto
from .auth import current_user
from .db import get_conn
from .naver_api import NaverAdsClient

router = APIRouter()


class AddCredentialRequest(BaseModel):
    label: str
    customerId: str
    apiKey: str
    secretKey: str

    @field_validator("label", "customerId", "apiKey", "secretKey")
    @classmethod
    def _nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


@router.get("/credentials")
def list_credentials(user=Depends(current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT id, label, customer_id, api_key_masked, created_at
               FROM credentials WHERE user_id = ? ORDER BY id""",
            (user["id"],),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "label": r["label"],
            "customerId": r["customer_id"],
            "apiKeyMasked": r["api_key_masked"],
            "createdAt": r["created_at"],
            "isActive": r["id"] == user["active_credential_id"],
        }
        for r in rows
    ]


@router.post("/credentials")
def add_credential(req: AddCredentialRequest, user=Depends(current_user)):
    api_key_enc = crypto.encrypt(req.apiKey)
    secret_key_enc = crypto.encrypt(req.secretKey)
    masked = crypto.mask(req.apiKey)
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO credentials (user_id, label, customer_id, api_key_masked, api_key_enc, secret_key_enc)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user["id"], req.label, req.customerId, masked, api_key_enc, secret_key_enc),
        )
        cred_id = cur.lastrowid
        # 추가한 계정을 항상 활성화 (마지막 등록이 현재 편집 대상일 확률이 높음)
        conn.execute("UPDATE users SET active_credential_id = ? WHERE id = ?", (cred_id, user["id"]))
        conn.commit()
    return {"ok": True, "id": cred_id}


@router.delete("/credentials/{cred_id}")
def delete_credential(cred_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM credentials WHERE id = ? AND user_id = ?",
            (cred_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        conn.execute("DELETE FROM credentials WHERE id = ?", (cred_id,))
        if user["active_credential_id"] == cred_id:
            next_row = conn.execute(
                "SELECT id FROM credentials WHERE user_id = ? ORDER BY id LIMIT 1", (user["id"],)
            ).fetchone()
            conn.execute(
                "UPDATE users SET active_credential_id = ? WHERE id = ?",
                (next_row["id"] if next_row else None, user["id"]),
            )
        conn.commit()
    return {"ok": True}


@router.post("/credentials/{cred_id}/activate")
def activate_credential(cred_id: int, user=Depends(current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM credentials WHERE id = ? AND user_id = ?",
            (cred_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        conn.execute("UPDATE users SET active_credential_id = ? WHERE id = ?", (cred_id, user["id"]))
        conn.commit()
    return {"ok": True}


def get_active_client(user: dict) -> NaverAdsClient:
    """현재 유저의 활성 자격증명으로 NaverAdsClient 생성."""
    cred_id = user.get("active_credential_id")
    if not cred_id:
        raise HTTPException(400, "no active credential — register one in settings")
    with get_conn() as conn:
        row = conn.execute(
            """SELECT customer_id, api_key_enc, secret_key_enc
               FROM credentials WHERE id = ? AND user_id = ?""",
            (cred_id, user["id"]),
        ).fetchone()
    if not row:
        raise HTTPException(400, "active credential not found")
    return NaverAdsClient(
        api_key=crypto.decrypt(row["api_key_enc"]),
        secret_key=crypto.decrypt(row["secret_key_enc"]),
        customer_id=row["customer_id"],
    )
