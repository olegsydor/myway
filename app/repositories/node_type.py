from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node_type import NodeType


# Established dictionary order, keyed by stable type code.
STANDARD_ORDER = (
    "person",
    "place",
    "organization",
    "skill",
    "event",
    "project",
    "hobby",
    "story",
)


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
    rank = case(
        {code: index for index, code in enumerate(STANDARD_ORDER)},
        value=NodeType.code,
        else_=len(STANDARD_ORDER),
    )
    result = await session.execute(select(NodeType).order_by(rank, NodeType.code))

    return list(result.scalars().all())
