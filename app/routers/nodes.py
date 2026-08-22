from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.node import create_node, get_node_by_id
from app.schemas.node import NodeCreate, NodeRead


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
    return await create_node(
        session,
        user_id=current_user.id,
        node_type_id=data.node_type_id,
        display_name=data.display_name,
        description=data.description,
        properties=data.properties,
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
