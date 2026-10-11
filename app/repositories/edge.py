from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edge import Edge
from app.repositories.node import get_node_by_id

class EdgeCycleError(ValueError):
    pass


async def validate_edge_dag(
    session: AsyncSession,
    *,
    user_id: int,
    source_node_id: int,
    target_node_id: int,
    exclude_edge_id: int | None = None,
) -> None:
    if source_node_id == target_node_id:
        raise EdgeCycleError("Self-loop edges are not allowed")

    query = select(
        Edge.source_node_id,
        Edge.target_node_id,
    ).where(Edge.user_id == user_id)

    if exclude_edge_id is not None:
        query = query.where(Edge.id != exclude_edge_id)

    result = await session.execute(query)

    adjacency: dict[int, list[int]] = {}
    for source_id, target_id in result:
        adjacency.setdefault(source_id, []).append(target_id)

    pending = [target_node_id]
    visited: set[int] = set()

    while pending:
        node_id = pending.pop()

        if node_id == source_node_id:
            raise EdgeCycleError("This edge would create a cycle")

        if node_id in visited:
            continue

        visited.add(node_id)
        pending.extend(adjacency.get(node_id, []))

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

    await validate_edge_dag(
        session,
        user_id=user_id,
        source_node_id=source_node_id,
        target_node_id=target_node_id,
    )

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

    source_node_id = data.get(
        "source_node_id",
        edge.source_node_id,
    )
    target_node_id = data.get(
        "target_node_id",
        edge.target_node_id,
    )

    endpoints_changed = (
        source_node_id != edge.source_node_id
        or target_node_id != edge.target_node_id
    )

    if endpoints_changed:
        await validate_edge_dag(
            session,
            user_id=edge.user_id,
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            exclude_edge_id=edge.id,
        )

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
