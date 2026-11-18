import hashlib
import hmac
import secrets
import time
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from app.core.config import get_settings
from app.models.auth import ActionToken, AuthRateLimit, AuthSession

hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))

def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def random_token() -> str:
    return secrets.token_urlsafe(32)

async def hash_password(password: str) -> str:
    return await run_in_threadpool(hasher.hash, password)

async def check_password(encoded: str | None, password: str) -> bool:
    def verify():
        try:
            result = hasher.verify(encoded or DUMMY_HASH, password)
            return bool(encoded) and result
        except (VerificationError, InvalidHashError):
            return False
    return await run_in_threadpool(verify)

async def db_now(session):
    return await session.scalar(select(func.clock_timestamp()))

def blocked(user, now):
    return user.status == "blocked" and (user.blocked_until is None or user.blocked_until > now)

async def revoke_all(session, user_id, now):
    await session.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).values(revoked_at=now))
    await session.execute(update(ActionToken).where(ActionToken.user_id == user_id, ActionToken.consumed_at.is_(None)).values(consumed_at=now))

async def issue_action(session, user_id, purpose):
    now = await db_now(session)
    await session.execute(update(ActionToken).where(ActionToken.user_id == user_id, ActionToken.purpose == purpose, ActionToken.consumed_at.is_(None)).values(consumed_at=now))
    raw = random_token()
    settings = get_settings()
    ttl = timedelta(hours=settings.verify_ttl_hours) if purpose == "verify_email" else timedelta(minutes=settings.reset_ttl_minutes)
    session.add(ActionToken(user_id=user_id, purpose=purpose, token_hash=digest(raw), created_at=now, expires_at=now+ttl))
    return raw

async def rate_limit(session, request: Request, action: str, email: str = ""):
    # DB-backed fixed windows work across workers. Never trust arbitrary forwarded headers.
    now = await db_now(session)
    ip = request.client.host if request.client else "unknown"
    window = 900 if action == "login" else 3600
    limits = [(f"{action}:ip:{ip}", 10 if action == "login" else 30)]
    if email:
        limits.append((f"{action}:email:{email}", 5 if action == "login" else 3))
        if action in ("register", "resend", "forgot"):
            limits.append((f"mail:cooldown:{email}", 1))
    exceeded = False
    retry = 1
    for key, limit in limits:
        seconds = 60 if key.startswith("mail:cooldown:") else window
        start = int(now.timestamp()) // seconds * seconds
        statement = insert(AuthRateLimit).values(key=digest(key), window_start=start, count=1, expires_at=now+timedelta(seconds=seconds*2))
        count = await session.scalar(statement.on_conflict_do_update(index_elements=["key", "window_start"], set_={"count": AuthRateLimit.count+1}).returning(AuthRateLimit.count))
        if count > limit:
            exceeded = True
            retry = max(retry, start+seconds-int(now.timestamp()))
    # Limits survive unsuccessful login and exceptions; no user locks acquired yet.
    await session.commit()
    if exceeded:
        raise HTTPException(429, "rate_limited", headers={"Retry-After": str(retry)})

def signed_csrf():
    payload = f"{int(time.time())}.{random_token()}"
    signature = hmac.new(get_settings().auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"

def valid_pre_csrf(request: Request):
    supplied = request.headers.get("x-csrf-token", "")
    cookie = request.cookies.get(get_settings().csrf_cookie, "")
    if not supplied or not hmac.compare_digest(supplied, cookie):
        return False
    try:
        stamp, nonce, signature = supplied.split(".")
        payload = f"{stamp}.{nonce}"
        expected = hmac.new(get_settings().auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return 0 <= time.time()-int(stamp) <= 3600 and hmac.compare_digest(signature, expected)
    except (ValueError, TypeError):
        return False
