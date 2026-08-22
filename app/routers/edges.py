from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.edge import create_edge, get_edge_by_id
from app.schemas.edge import EdgeCreate, EdgeRead


router = APIRouter(
    prefix="/edges",
    tags=["edges"],
)


@router.post(
    "",
    response_model=EdgeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_edge_endpoint(
    data: EdgeCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    edge = await create_edge(
        session,
        user_id=current_user.id,
        source_node_id=data.source_node_id,
        target_node_id=data.target_node_id,
        edge_type_id=data.edge_type_id,
        description=data.description,
        properties=data.properties,
    )

    if edge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source or target node not found",
        )

    return edge


@router.get(
    "/{edge_id}",
    response_model=EdgeRead,
)
async def get_edge_endpoint(
    edge_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    edge = await get_edge_by_id(
        session,
        user_id=current_user.id,
        edge_id=edge_id,
    )

    if edge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Edge not found",
        )

    return edge
