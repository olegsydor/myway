import hmac
from datetime import timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.mail import send_action
from app.core.security import (blocked, check_password, db_now, digest, hash_password, hasher,
    issue_action, random_token, rate_limit, revoke_all, signed_csrf, valid_pre_csrf)
from app.dependencies.auth import get_current_user
from app.models import User
from app.models.auth import ActionToken, AuthSession
from app.schemas.auth import EmailInput, RegisterInput, LoginInput, TokenPasswordInput, ChangePasswordInput, CurrentPasswordInput

from app.schemas.entitlement import Entitlements
from app.services.entitlements import public_entitlements

router = APIRouter(prefix="/auth", tags=["auth"])
ACK = {"message": "If this address is eligible, an email will arrive shortly."}

def safe_user(user):
    return {"id": user.id, "email": user.email, "display_name": user.display_name}

def clear_cookie(response):
    settings = get_settings()
    response.delete_cookie(settings.session_cookie, path="/", secure=settings.is_production, httponly=True, samesite="lax")

async def lock_email(session, email):
    return await session.scalar(select(User).where(User.email_normalized == email).with_for_update().execution_options(populate_existing=True))

@router.get("/csrf")
async def csrf(response: Response):
    value = signed_csrf()
    settings = get_settings()
    response.set_cookie(settings.csrf_cookie, value, max_age=3600, path="/", secure=settings.is_production, httponly=True, samesite="lax")
    return {"csrf_token": value}

@router.post("/register", status_code=202)
async def register(data: RegisterInput, request: Request, session: AsyncSession = Depends(get_db_session)):
    if not get_settings().registration_enabled:
        raise HTTPException(403, "registration_disabled")
    await rate_limit(session, request, "register", data.email)
    encoded = await hash_password(data.password)
    if await lock_email(session, data.email):
        return ACK
    user = User(email=data.email, email_normalized=data.email, display_name=data.display_name, password_hash=encoded, activation_allowed=True)
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return ACK
    token = await issue_action(session, user.id, "verify_email")
    await session.commit()
    await send_action(user.email, "verify_email", token)
    return ACK

@router.post("/login")
async def login(data: LoginInput, request: Request, response: Response, session: AsyncSession = Depends(get_db_session)):
    await rate_limit(session, request, "login", data.email)
    user = await lock_email(session, data.email)
    if not await check_password(user.password_hash if user else None, data.password):
        raise HTTPException(401, "invalid_credentials")
    now = await db_now(session)
    if blocked(user, now):
        raise HTTPException(403, "account_blocked")
    if user.email_verified_at is None:
        raise HTTPException(403, "email_verification_required")
    if user.deletion_due_at is not None:
        raise HTTPException(403, {
            "code": "account_pending_deletion",
            "deletion_due_at": user.deletion_due_at.isoformat(),
            "can_cancel": now < user.deletion_due_at,
        })
    if user.status == "blocked":
        user.status, user.blocked_until, user.blocked_reason = "active", None, None
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = await hash_password(data.password)
    raw, csrf_value = random_token(), random_token()
    settings = get_settings()
    # Replace the current browser session, without affecting other devices.
    old = request.cookies.get(settings.session_cookie)
    if old:
        old_session = await session.scalar(select(AuthSession).where(AuthSession.token_hash == digest(old), AuthSession.user_id == user.id))
        if old_session:
            old_session.revoked_at = now
    session.add(AuthSession(user_id=user.id, token_hash=digest(raw), csrf_token=csrf_value, created_at=now, last_seen_at=now, absolute_expires_at=now+timedelta(days=settings.session_absolute_days)))
    await session.commit()
    response.set_cookie(settings.session_cookie, raw, max_age=settings.session_absolute_days*86400, path="/", secure=settings.is_production, httponly=True, samesite="lax")
    return {"user": safe_user(user), "csrf_token": csrf_value}

@router.get("/me")
async def me(request: Request, user: User = Depends(get_current_user)):
    return {"user": safe_user(user), "csrf_token": request.state.auth_session.csrf_token}

@router.post("/logout", status_code=204)
async def logout(request: Request, session: AsyncSession = Depends(get_db_session)):
    settings = get_settings()
    raw = request.cookies.get(settings.session_cookie)
    if raw:
        auth = await session.scalar(select(AuthSession).where(AuthSession.token_hash == digest(raw)))
        if auth:
            if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), auth.csrf_token):
                raise HTTPException(403, "csrf_failed")
            # CSRF was checked by middleware, including for expired sessions.
            owner = await session.scalar(select(User.id).where(User.id == auth.user_id).with_for_update())
            if owner is not None:
                auth = await session.get(AuthSession, auth.id, populate_existing=True)
                if auth is not None:
                    auth.revoked_at = await db_now(session)
                    await session.commit()
    response = Response(status_code=204)
    clear_cookie(response)
    return response

async def email_action(data, request, session, purpose, action):
    await rate_limit(session, request, action, data.email)
    user = await lock_email(session, data.email)
    now = await db_now(session)
    eligible = user is not None and user.deletion_due_at is None and not blocked(user, now)
    if purpose == "verify_email":
        eligible = eligible and user.email_verified_at is None and user.activation_allowed
    else:
        eligible = eligible and user.email_verified_at is not None and user.password_hash is not None
    if eligible:
        token = await issue_action(session, user.id, purpose)
        await session.commit()
        await send_action(user.email, purpose, token)
    return ACK

@router.post("/email/resend", status_code=202)
async def resend(data: EmailInput, request: Request, session: AsyncSession = Depends(get_db_session)):
    return await email_action(data, request, session, "verify_email", "resend")

@router.post("/password/forgot", status_code=202)
async def forgot(data: EmailInput, request: Request, session: AsyncSession = Depends(get_db_session)):
    return await email_action(data, request, session, "reset_password", "forgot")

async def consume(data, request, session, purpose):
    await rate_limit(session, request, "token")
    action = await session.scalar(select(ActionToken).where(ActionToken.token_hash == digest(data.token), ActionToken.purpose == purpose))
    if action is None:
        raise HTTPException(400, "invalid_or_expired_token")
    user = await session.scalar(select(User).where(User.id == action.user_id).with_for_update().execution_options(populate_existing=True))
    action = await session.get(ActionToken, action.id, populate_existing=True) if user is not None else None
    now = await db_now(session)
    if (action is None or action.consumed_at is not None or action.expires_at <= now
            or user.deletion_due_at is not None or blocked(user, now)):
        raise HTTPException(400, "invalid_or_expired_token")
    if purpose == "verify_email" and (not user.activation_allowed or user.email_verified_at is not None):
        raise HTTPException(400, "invalid_or_expired_token")
    if purpose == "reset_password" and (user.email_verified_at is None or user.password_hash is None):
        raise HTTPException(400, "invalid_or_expired_token")
    user.password_hash = await hash_password(data.password)
    if purpose == "verify_email":
        user.email_verified_at = now
        user.activation_allowed = False
    user.updated_at = now
    await revoke_all(session, user.id, now)
    await session.commit()
    response = Response(status_code=204)
    clear_cookie(response)
    return response

@router.post("/email/verify", status_code=204)
async def verify(data: TokenPasswordInput, request: Request, session: AsyncSession = Depends(get_db_session)):
    return await consume(data, request, session, "verify_email")

@router.post("/password/reset", status_code=204)
async def reset(data: TokenPasswordInput, request: Request, session: AsyncSession = Depends(get_db_session)):
    return await consume(data, request, session, "reset_password")

@router.post("/password/change", status_code=204)
async def change(data: ChangePasswordInput, request: Request, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)):
    await rate_limit(session, request, "change", user.email_normalized)
    # rate_limit commits its counters; reacquire and revalidate after that boundary.
    user = await get_current_user(request, session)
    if not await check_password(user.password_hash, data.current_password):
        raise HTTPException(400, "invalid_current_password")
    user.password_hash = await hash_password(data.password)
    user.updated_at = await db_now(session)
    await revoke_all(session, user.id, user.updated_at)
    await session.commit()
    response = Response(status_code=204)
    clear_cookie(response)
    return response


@router.post("/account/deletion")
async def request_deletion(
    data: CurrentPasswordInput,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    await rate_limit(session, request, "request_deletion", user.email_normalized)
    # The rate limiter commits. Check the session again under the owner lock.
    user = await get_current_user(request, session)
    if not await check_password(user.password_hash, data.current_password):
        raise HTTPException(400, "invalid_current_password")
    now = (await db_now(session)).astimezone(timezone.utc)
    user.deletion_due_at = now + timedelta(days=30)
    user.updated_at = now
    await revoke_all(session, user.id, now)
    await session.commit()
    clear_cookie(response)
    return {"deletion_due_at": user.deletion_due_at.isoformat()}


@router.post("/account/deletion/cancel", status_code=204)
async def cancel_deletion(
    data: LoginInput,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    if not valid_pre_csrf(request):
        raise HTTPException(403, "csrf_failed")
    await rate_limit(session, request, "cancel_deletion", data.email)
    user = await lock_email(session, data.email)
    if not await check_password(user.password_hash if user else None, data.password):
        raise HTTPException(401, "invalid_credentials")
    now = await db_now(session)
    if blocked(user, now):
        raise HTTPException(403, "account_blocked")
    if user.deletion_due_at is None:
        raise HTTPException(409, "deletion_not_pending")
    if user.deletion_due_at <= now:
        raise HTTPException(409, "deletion_window_closed")
    user.deletion_due_at = None
    user.updated_at = now
    await session.commit()
    return Response(status_code=204)


@router.get("/entitlements")
async def entitlements(
    response: Response,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Entitlements:
    response.headers["Cache-Control"] = "no-store"
    return await public_entitlements(session, user.id)
