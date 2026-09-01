from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node_type import NodeType


async def get_node_type_by_id(
    session: AsyncSession,
    *,
    node_type_id: int,
) -> NodeType | None:
    result = await session.execute(
        select(NodeType).where(
            NodeType.id == node_type_id,
        )
    )

    return result.scalar_one_or_none()


async def get_node_types(
    session: AsyncSession,
) -> list[NodeType]:
    result = await session.execute(
        select(NodeType).order_by(NodeType.id)
    )

    return list(result.scalars().all())