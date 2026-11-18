from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.auth import AuthSession
from app.models.user import User
from app.repositories.data_export import read_data_export
from app.schemas.data_export import DataExport

router = APIRouter(tags=["data export"])


@router.get("/export", response_model=DataExport)
async def export_data(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    auth_session: AsyncSession = Depends(get_db_session),
) -> DataExport:
    # Authentication may update last_seen and holds an account row lock.
    # Finish that transaction before opening the read-only export snapshot.
    user_id = current_user.id
    session_id = request.state.auth_session.id
    await auth_session.commit()
    async with auth_session.begin():
        await auth_session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
        # Use the snapshot to recheck access after releasing the auth transaction.
        now = func.statement_timestamp()
        idle_limit = timedelta(days=get_settings().session_idle_days)
        eligible = await auth_session.scalar(
            select(User.id).join(AuthSession, AuthSession.user_id == User.id).where(
                User.id == user_id,
                User.deletion_due_at.is_(None),
                AuthSession.id == session_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.absolute_expires_at > now,
                AuthSession.last_seen_at + idle_limit > now,
            )
        )
        if eligible is None:
            raise HTTPException(401, "session_expired")
        export = await read_data_export(auth_session, user_id)

    date = export.exported_at.strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f'attachment; filename="my-way-export-{date}.json"'
    return export
