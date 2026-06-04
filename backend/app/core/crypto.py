from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.exceptions import AppException


def encrypt_secret(value: str) -> str:
    """Encrypt a secret value for database storage."""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    """Decrypt a secret value from database storage."""
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise AppException(500, "SECRET_DECRYPT_FAILED", "Stored secret could not be decrypted") from exc


def _fernet() -> Fernet:
    """Return a Fernet instance from the configured key."""
    key = get_settings().token_encryption_key.strip()
    try:
        return Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise AppException(500, "TOKEN_ENCRYPTION_KEY_INVALID", "Token encryption key is missing or invalid") from exc
