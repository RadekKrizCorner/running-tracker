from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.core.config import get_settings
from app.core.exceptions import AppException


def hash_password(password: str) -> str:
    """Hash a password for storage."""
    iterations = 390_000
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.urlsafe_b64encode(salt).decode("utf-8"),
        base64.urlsafe_b64encode(digest).decode("utf-8"),
    )


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verify a plaintext password against a stored hash."""
    if not password_hash:
        return False
    try:
        algorithm, iterations, salt_b64, digest_b64 = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode("utf-8"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("utf-8"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    except Exception:
        return False
    return hmac.compare_digest(actual, expected)


def create_session_token(user_id: UUID) -> str:
    """Create a signed session token for a user."""
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.session_max_age_seconds)
    payload = _b64_json({"sub": str(user_id), "exp": int(expires_at.timestamp()), "typ": "session"})
    signature = _sign(payload, settings.secret_key)
    return f"{payload}.{signature}"


def decode_session_token(token: str) -> UUID:
    """Decode a signed session token and return the user id."""
    settings = get_settings()
    try:
        payload_part, signature = token.split(".", 1)
        expected = _sign(payload_part, settings.secret_key)
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = json.loads(_b64_decode(payload_part))
        if payload.get("typ") != "session" or int(payload["exp"]) < int(datetime.now(UTC).timestamp()):
            raise ValueError("expired session")
        return UUID(str(payload["sub"]))
    except Exception as exc:
        raise AppException(401, "UNAUTHENTICATED", "Session is invalid or expired") from exc


def _b64_json(payload: dict) -> str:
    """Encode a JSON payload as URL-safe base64."""
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64_decode(value: str) -> str:
    """Decode a URL-safe base64 string."""
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")


def _sign(value: str, secret_key: str) -> str:
    """Sign a token payload with HMAC SHA-256."""
    digest = hmac.new(secret_key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
