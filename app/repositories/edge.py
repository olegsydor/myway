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

async def get_edges(
    session: AsyncSession,
    *,
    user_id: int,
) -> list[Edge]:
    result = await session.execute(
        select(Edge)
        .where(Edge.user_id == user_id)
        .order_by(Edge.id)
    )

    return list(result.scalars().all())

async def update_edge(
    session: AsyncSession,
    *,
    edge: Edge,
    data: dict,
) -> Edge | None:
    if "source_node_id" in data:
        source_node = await get_node_by_id(
            session,
            user_id=edge.user_id,
            node_id=data["source_node_id"],
        )

        if source_node is None:
            return None

    if "target_node_id" in data:
        target_node = await get_node_by_id(
            session,
            user_id=edge.user_id,
            node_id=data["target_node_id"],
        )

        if target_node is None:
            return None

    for field, value in data.items():
        setattr(edge, field, value)

    await session.commit()
    await session.refresh(edge)

    return edge

async def delete_edge(
    session: AsyncSession,
    *,
    edge: Edge,
) -> None:
    await session.delete(edge)
    await session.commit()

async def node_has_edges(
    session: AsyncSession,
    *,
    user_id: int,
    node_id: int,
) -> bool:
    result = await session.execute(
        select(Edge.id)
        .where(
            Edge.user_id == user_id,
            (
                (Edge.source_node_id == node_id)
                | (Edge.target_node_id == node_id)
            ),
        )
        .limit(1)
    )

    return result.scalar_one_or_none() is not None
