from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.graph import get_graph_data
from app.schemas.graph import (
    GraphEdge,
    GraphMeta,
    GraphNode,
    GraphResponse,
)


router = APIRouter(
    prefix="/graph",
    tags=["graph"],
)


@router.get(
    "",
    response_model=GraphResponse,
)
async def get_graph_endpoint(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> GraphResponse:
    nodes, edges = await get_graph_data(
        session,
        user_id=current_user.id,
    )

    graph_nodes = [
        GraphNode(
            id=node.id,
            type=node.node_type.code,
            label=node.display_name,
            description=node.description,
            attributes=node.properties,
        )
        for node in nodes
    ]

    graph_edges = [
        GraphEdge(
            id=edge.id,
            type=edge.edge_type.code,
            source=edge.source_node_id,
            target=edge.target_node_id,
            description=edge.description,
            attributes=edge.properties,
        )
        for edge in edges
    ]

    return GraphResponse(
        nodes=graph_nodes,
        edges=graph_edges,
        meta=GraphMeta(
            nodes_count=len(graph_nodes),
            edges_count=len(graph_edges),
        ),
    )
