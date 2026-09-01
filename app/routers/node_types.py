from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.repositories.node_type import get_node_types
from app.schemas.node_type import NodeTypeRead

router = APIRouter(
    prefix="/node-types",
    tags=["node-types"],
)


@router.get(
    "",
    response_model=list[NodeTypeRead],
)
async def get_node_types_endpoint(
    session: AsyncSession = Depends(get_db_session),
):
    return await get_node_types(session)
