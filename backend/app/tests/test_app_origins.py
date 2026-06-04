from __future__ import annotations

from app.main import _local_frontend_origins


def test_frontend_origin_ignores_subpath() -> None:
    """Verify CORS origins use only scheme, host, and port."""
    origins = _local_frontend_origins("https://mydomain.com/behame")

    assert origins == ["https://mydomain.com"]


def test_localhost_origin_alias_is_preserved() -> None:
    """Verify local development origins include localhost and loopback aliases."""
    origins = _local_frontend_origins("http://localhost:5173/behame")

    assert "http://localhost:5173" in origins
    assert "http://127.0.0.1:5173" in origins
