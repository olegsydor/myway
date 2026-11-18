import hmac
from fastapi import Request
from starlette.responses import JSONResponse
from app.core.config import get_settings
from app.core.database import AsyncSessionFactory
from app.core.security import digest, valid_pre_csrf
from app.models.auth import AuthSession
from sqlalchemy import select

async def auth_boundary(request: Request, call_next):
    settings = get_settings()
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("origin") != settings.public_origin:
            return JSONResponse({"detail": "origin_failed"}, status_code=403)
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            return JSONResponse({"detail": "json_required"}, status_code=415)
        # Limit authentication payloads before parsing. Streaming bounded read prevents chunked bypass.
        if request.url.path.startswith("/auth/"):
            size = 0
            chunks = []
            async for chunk in request.stream():
                chunks.append(chunk)
                size += len(chunk)
                if size > 16384:
                    return JSONResponse({"detail": "request_too_large"}, status_code=413)
            request._body = b"".join(chunks)
        valid = valid_pre_csrf(request)
        raw = request.cookies.get(settings.session_cookie)
        if not valid and raw:
            async with AsyncSessionFactory() as session:
                csrf_value = await session.scalar(select(AuthSession.csrf_token).where(AuthSession.token_hash == digest(raw)))
                valid = bool(csrf_value) and hmac.compare_digest(request.headers.get("x-csrf-token", ""), csrf_value)
        if not valid:
            return JSONResponse({"detail": "csrf_failed"}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response
