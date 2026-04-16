"""API 키 암호화. Fernet(AES-128-CBC + HMAC)."""
import base64
import hashlib
import os

from cryptography.fernet import Fernet


def _derive_fernet_key(master: str) -> bytes:
    # Fernet requires 32-byte base64 key. Derive via SHA-256 so MASTER_KEY can be any string.
    digest = hashlib.sha256(master.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    master = os.getenv("APP_MASTER_KEY", "")
    if not master:
        raise RuntimeError("APP_MASTER_KEY not set")
    return Fernet(_derive_fernet_key(master))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")


def mask(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    return "*" * (len(value) - 4) + value[-4:]
