from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LayoutAnnotation, LayoutNodePosition
from app.repositories.graph import get_graph_data
from app.repositories.layout import build_layout_detail, list_layouts
from app.schemas.data_export import DataExport, ExportEdge, ExportNode


async def read_data_export(session: AsyncSession, user_id: int) -> DataExport:
    exported_at = datetime.now(timezone.utc)
    nodes, edges = await get_graph_data(session, user_id=user_id)
    layouts = await list_layouts(session, user_id)

    positions = defaultdict(list)
    for row in await session.scalars(
        select(LayoutNodePosition)
        .where(LayoutNodePosition.user_id == user_id)
        .order_by(LayoutNodePosition.layout_id, LayoutNodePosition.node_id)
    ):
        positions[row.layout_id].append(row)

    annotations = defaultdict(list)
    for row in await session.scalars(
        select(LayoutAnnotation)
        .where(LayoutAnnotation.user_id == user_id)
        .order_by(LayoutAnnotation.layout_id, LayoutAnnotation.order_index)
    ):
        annotations[row.layout_id].append(row)

    return DataExport(
        exported_at=exported_at,
        nodes=[ExportNode.model_validate(node) for node in nodes],
        edges=[ExportEdge.model_validate(edge) for edge in edges],
        layouts=[
            build_layout_detail(layout, positions[layout.id], annotations[layout.id])
            for layout in layouts
        ],
    )
