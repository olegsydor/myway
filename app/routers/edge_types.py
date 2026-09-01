from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.repositories.edge_type import get_edge_types
from app.schemas.edge_type import EdgeTypeRead

router = APIRouter(
    prefix="/edge-types",
    tags=["edge-types"],
)


@router.get(
    "",
    response_model=list[EdgeTypeRead],
)
async def get_edge_types_endpoint(
    session: AsyncSession = Depends(get_db_session),
):
    return await get_edge_types(session)
