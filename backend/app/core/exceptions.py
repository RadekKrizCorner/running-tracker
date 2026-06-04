from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Represent a structured application error."""

    def __init__(self, status_code: int, code: str, detail: str) -> None:
        """Create a structured application error."""
        self.status_code = status_code
        self.code = code
        self.detail = detail


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Return the project error response format for application errors."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
    )


async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Return the project error response format for validation errors."""
    return JSONResponse(
        status_code=422,
        content={"detail": "Request validation failed", "code": "VALIDATION_ERROR", "errors": exc.errors()},
    )

