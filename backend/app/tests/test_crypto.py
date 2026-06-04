from __future__ import annotations


def test_encrypt_secret_roundtrip(monkeypatch) -> None:
    """Verify encrypted secrets can be decrypted and are not stored as plaintext."""
    from app.core.config import get_settings
    from app.core.crypto import decrypt_secret, encrypt_secret

    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "4RI7HbCS8X1exbEKeJ9UCEWvhIHg3vlbbCfKKvr1lhY=")
    get_settings.cache_clear()

    encrypted = encrypt_secret("refresh-token")

    assert encrypted != "refresh-token"
    assert encrypted.startswith("gAAAAA")
    assert decrypt_secret(encrypted) == "refresh-token"
