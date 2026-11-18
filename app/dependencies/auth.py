import hmac
from datetime import timedelta
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db_session
from app.core.config import get_settings
from app.core.security import blocked, db_now, digest
from app.models.auth import AuthSession
from app.models.user import User

async def get_current_user(request: Request, session: AsyncSession = Depends(get_db_session)) -> User:
    settings = get_settings()
    raw = request.cookies.get(settings.session_cookie)
    if not raw:
        raise HTTPException(401, "authentication_required")
    auth = await session.scalar(select(AuthSession).where(AuthSession.token_hash == digest(raw)))
    if auth is None:
        raise HTTPException(401, "session_expired")
    # Same lock order as block/reset/login. Serializes mutations against blocking.
    user = await session.scalar(select(User).where(User.id == auth.user_id).with_for_update().execution_options(populate_existing=True))
    # Maintenance can remove the session while this request waits for the user lock.
    auth = await session.get(AuthSession, auth.id, populate_existing=True) if user is not None else None
    now = await db_now(session)
    if auth is None or auth.revoked_at is not None or auth.absolute_expires_at <= now or auth.last_seen_at + timedelta(days=settings.session_idle_days) <= now:
        raise HTTPException(401, "session_expired")
    if user.deletion_due_at is not None:
        raise HTTPException(403, "account_pending_deletion")
    if blocked(user, now):
        raise HTTPException(403, "account_blocked")
    if user.email_verified_at is None or user.password_hash is None:
        raise HTTPException(403, "email_verification_required")
    if request.url.path != "/auth/me" and not hmac.compare_digest(request.headers.get("x-csrf-token", ""), auth.csrf_token):
        raise HTTPException(403, "csrf_failed")
    if now-auth.last_seen_at >= timedelta(minutes=5):
        auth.last_seen_at = now
    request.state.auth_session = auth
    # Reads must persist last_seen and release row lock too (writes may commit earlier).
    return user
