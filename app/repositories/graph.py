from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.edge import Edge
from app.models.node import Node


async def get_graph_data(
    session: AsyncSession,
    *,
    user_id: int,
) -> tuple[list[Node], list[Edge]]:
    nodes_result = await session.execute(
        select(Node)
        .options(joinedload(Node.node_type))
        .where(Node.user_id == user_id)
        .order_by(Node.id)
    )

    edges_result = await session.execute(
        select(Edge)
        .options(joinedload(Edge.edge_type))
        .where(Edge.user_id == user_id)
        .order_by(Edge.id)
    )

    nodes = list(nodes_result.scalars().all())
    edges = list(edges_result.scalars().all())

    return nodes, edges
