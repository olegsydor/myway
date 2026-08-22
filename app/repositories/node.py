from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node import Node

async def create_node(
    session: AsyncSession,
    *,
    user_id: int,
    node_type_id: int,
    display_name: str,
    description: str | None = None,
    properties: dict | None = None,
) -> Node:
    node = Node(
        user_id=user_id,
        node_type_id=node_type_id,
        display_name=display_name,
        description=description,
        properties=properties or {},
    )

    session.add(node)
    await session.commit()
    await session.refresh(node)

    return node

async def get_node_by_id(
    session: AsyncSession,
    *,
    user_id: int,
    node_id: int,
) -> Node | None:
    result = await session.execute(
        select(Node).where(
            Node.id == node_id,
            Node.user_id == user_id,
        )
    )

    return result.scalar_one_or_none()
