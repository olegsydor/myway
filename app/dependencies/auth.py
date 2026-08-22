from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models.user import User
from app.repositories.user import get_user_by_id


TEST_USER_ID = 1


async def get_current_user(
    session: AsyncSession = Depends(get_db_session),
) -> User:
    user = await get_user_by_id(
        session,
        TEST_USER_ID,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current user not found",
        )

    return user
