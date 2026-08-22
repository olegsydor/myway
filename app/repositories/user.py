from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def create_user(
    session: AsyncSession,
    *,
    email: str,
    display_name: str,
) -> User:
    user = User(
        email=email,
        display_name=display_name,
    )

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user


async def get_user_by_id(
    session: AsyncSession,
    user_id: int,
) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_email(
    session: AsyncSession,
    email: str,
) -> User | None:
    result = await session.execute(
        select(User).where(User.email == email)
    )

    return result.scalar_one_or_none()
