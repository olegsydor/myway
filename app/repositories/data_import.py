from uuid import uuid4

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Edge, EdgeType, Layout, LayoutAnnotation, LayoutNodePosition, Node, NodeType
from app.repositories.layout import write_annotations, write_positions
from app.schemas.data_import import DataImport
from app.schemas.layout import WorkspaceSnapshot


class ImportRequiresEmptyAccount(Exception):
    pass


async def find_replaceable_layout(session: AsyncSession, user_id: int) -> Layout | None:
    # The caller holds the account row lock through commit or rollback.
    if await session.scalar(select(
        exists().where(Node.user_id == user_id)
        | exists().where(Edge.user_id == user_id)
        | exists().where(LayoutAnnotation.user_id == user_id)
        | exists().where(LayoutNodePosition.user_id == user_id)
    )):
        raise ImportRequiresEmptyAccount

    layouts = (await session.scalars(select(Layout).where(
        Layout.user_id == user_id,
    ).limit(2))).all()
    if not layouts:
        return None

    initial = layouts[0]
    if len(layouts) != 1 or not initial.is_initial or not initial.is_default or initial.name != "Main":
        raise ImportRequiresEmptyAccount

    return initial


async def restore_data(session: AsyncSession, user_id: int, data: DataImport) -> None:
    node_types = dict((await session.execute(select(NodeType.code, NodeType.id))).all())
    edge_types = dict((await session.execute(select(EdgeType.code, EdgeType.id))).all())
    if any(node.type not in node_types for node in data.nodes):
        raise ValueError("Unknown node type")
    if any(edge.type not in edge_types for edge in data.edges):
        raise ValueError("Unknown edge type")

    nodes = {
        record.id: Node(
            user_id=user_id, node_type_id=node_types[record.type],
            **record.model_dump(exclude={"id", "type"}),
        )
        for record in data.nodes
    }
    session.add_all(nodes.values())
    await session.flush()
    session.add_all([
        Edge(
            user_id=user_id, edge_type_id=edge_types[record.type],
            source_node_id=nodes[record.source_node_id].id,
            target_node_id=nodes[record.target_node_id].id,
            **record.model_dump(exclude={"id", "type", "source_node_id", "target_node_id"}),
        )
        for record in data.edges
    ])
    layouts = [
        Layout(
            user_id=user_id, **record.model_dump(exclude={"id", "positions", "annotations"}),
        )
        for record in data.layouts
    ]
    session.add_all(layouts)
    await session.flush()
    for layout, record in zip(layouts, data.layouts):
        snapshot = WorkspaceSnapshot(
            positions=[
                position.model_copy(update={"node_id": nodes[position.node_id].id})
                for position in record.positions
            ],
            annotations=[annotation.model_copy(update={"id": uuid4()}) for annotation in record.annotations],
        )
        await write_positions(session, user_id, layout.id, snapshot)
        await write_annotations(session, user_id, layout.id, snapshot)
