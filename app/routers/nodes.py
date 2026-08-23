from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate


from app.repositories.node import (
    create_node,
    delete_node,
    get_node_by_id,
    get_nodes,
    update_node,
)

from app.repositories.node_type import get_node_type_by_id
from app.repositories.edge import node_has_edges

router = APIRouter(
    prefix="/nodes",
    tags=["nodes"],
)


@router.post(
    "",
    response_model=NodeRead,
    status_code=status.HTTP_201_CREATED,
)

async def create_node_endpoint(
    data: NodeCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
    ):

    node_type = await get_node_type_by_id(
    session,
    node_type_id=data.node_type_id,
    )

    if node_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Node type not found",
        )
    
    return await create_node(
        session,
        user_id=current_user.id,
        node_type_id=data.node_type_id,
        display_name=data.display_name,
        description=data.description,
        properties=data.properties,
    )

@router.get(
    "",
    response_model=list[NodeRead],
)
async def get_nodes_endpoint(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await get_nodes(
        session,
        user_id=current_user.id,
    )

@router.get(
    "/{node_id}",
    response_model=NodeRead,
)
async def get_node_endpoint(
    node_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    node = await get_node_by_id(
        session,
        user_id=current_user.id,
        node_id=node_id,
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    return node

@router.patch(
    "/{node_id}",
    response_model=NodeRead,
)
async def update_node_endpoint(
    node_id: int,
    data: NodeUpdate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
    ):
    node = await get_node_by_id(
        session,
        user_id=current_user.id,
        node_id=node_id,
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    if data.node_type_id is not None:
        node_type = await get_node_type_by_id(
            session,
            node_type_id=data.node_type_id,
        )

        if node_type is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Node type not found",
            )

    return await update_node(
        session,
        node=node,
        data=data.model_dump(exclude_unset=True),
    )

@router.delete(
    "/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_node_endpoint(
    node_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    node = await get_node_by_id(
        session,
        user_id=current_user.id,
        node_id=node_id,
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    if await node_has_edges(
        session,
        user_id=current_user.id,
        node_id=node.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Node has connected edges. Delete the edges first.",
        )

    await delete_node(
        session,
        node=node,
    )
