from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session

settings = get_settings()

app = FastAPI(
    title="My Way API",
    version="0.1.0",
)


@app.get("/health")
async def health(
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(text("select 1"))

    return {
        "status": "ok",
        "environment": settings.app_env,
        "database": "ok",
    }