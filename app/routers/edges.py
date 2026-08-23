from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.edge import (
    create_edge,
    delete_edge,
    get_edge_by_id,
    get_edges,
    update_edge,
)
from app.schemas.edge import EdgeCreate, EdgeRead, EdgeUpdate
from app.repositories.edge_type import get_edge_type_by_id

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

    edge_type = await get_edge_type_by_id(
        session,
        edge_type_id=data.edge_type_id,
    )

    if edge_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Edge type not found",
        )

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
    "",
    response_model=list[EdgeRead],
)
async def get_edges_endpoint(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await get_edges(
        session,
        user_id=current_user.id,
    )

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

@router.patch(
    "/{edge_id}",
    response_model=EdgeRead,
)
async def update_edge_endpoint(
    edge_id: int,
    data: EdgeUpdate,
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

    if data.edge_type_id is not None:
        edge_type = await get_edge_type_by_id(
            session,
            edge_type_id=data.edge_type_id,
        )

        if edge_type is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Edge type not found",
            )

    updated_edge = await update_edge(
        session,
        edge=edge,
        data=data.model_dump(exclude_unset=True),
    )

    if updated_edge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source or target node not found",
        )


    return updated_edge

@router.delete(
    "/{edge_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_edge_endpoint(
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

    await delete_edge(
        session,
        edge=edge,
    )