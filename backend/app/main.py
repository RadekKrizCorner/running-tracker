from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import AppException, app_exception_handler, validation_exception_handler
from app.core.logging import configure_logging
from app.db.init_db import create_database, ensure_owner
from app.db.session import get_session_factory


def create_app() -> FastAPI:
    """Create the FastAPI application."""
    configure_logging()
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        """Initialize local database state during app lifespan startup."""
        create_database()
        with get_session_factory()() as session:
            ensure_owner(session)
        yield

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_local_frontend_origins(settings.frontend_base_url),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.include_router(api_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        """Return service health."""
        return {"status": "ok"}

    return app


def _local_frontend_origins(frontend_base_url: str) -> list[str]:
    """Return allowed frontend origins including local host aliases."""
    parsed = urlsplit(frontend_base_url.rstrip("/"))
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else frontend_base_url.rstrip("/")
    origins = {origin}
    if "localhost" in origin:
        origins.add(origin.replace("localhost", "127.0.0.1"))
    if "127.0.0.1" in origin:
        origins.add(origin.replace("127.0.0.1", "localhost"))
    return sorted(origins)


app = create_app()
