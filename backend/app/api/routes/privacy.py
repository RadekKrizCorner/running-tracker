from __future__ import annotations

from fastapi import APIRouter, Response
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, WritableUser
from app.services.export_service import export_user_data

router = APIRouter(tags=["privacy"])


@router.get("/export/data")
def export_data(session: DbSession, user: WritableUser) -> StreamingResponse:
    """Return a ZIP export of local owner data."""
    data = export_user_data(session, user)
    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=running-tracker-export.zip"},
    )


@router.delete("/account", status_code=204)
def delete_account(session: DbSession, user: WritableUser) -> Response:
    """Delete the local owner account and cascaded data."""
    session.delete(user)
    session.commit()
    return Response(status_code=204)
