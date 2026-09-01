from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edge_type import EdgeType


async def get_edge_type_by_id(
    session: AsyncSession,
    *,
    edge_type_id: int,
) -> EdgeType | None:
    result = await session.execute(
        select(EdgeType).where(
            EdgeType.id == edge_type_id,
        )
    )

    return result.scalar_one_or_none()


async def get_edge_types(
    session: AsyncSession,
) -> list[EdgeType]:
    result = await session.execute(
        select(EdgeType).order_by(EdgeType.id)
    )

    return list(result.scalars().all())