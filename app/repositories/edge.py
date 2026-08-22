from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edge import Edge
from app.repositories.node import get_node_by_id


async def create_edge(
    session: AsyncSession,
    *,
    user_id: int,
    source_node_id: int,
    target_node_id: int,
    edge_type_id: int,
    description: str | None = None,
    properties: dict | None = None,
) -> Edge | None:
    source_node = await get_node_by_id(
        session,
        user_id=user_id,
        node_id=source_node_id,
    )

    if source_node is None:
        return None

    target_node = await get_node_by_id(
        session,
        user_id=user_id,
        node_id=target_node_id,
    )

    if target_node is None:
        return None

    edge = Edge(
        user_id=user_id,
        source_node_id=source_node_id,
        target_node_id=target_node_id,
        edge_type_id=edge_type_id,
        description=description,
        properties=properties or {},
    )

    session.add(edge)
    await session.commit()
    await session.refresh(edge)

    return edge


async def get_edge_by_id(
    session: AsyncSession,
    *,
    user_id: int,
    edge_id: int,
) -> Edge | None:
    result = await session.execute(
        select(Edge).where(
            Edge.id == edge_id,
            Edge.user_id == user_id,
        )
    )

    return result.scalar_one_or_none()
