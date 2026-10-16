from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.routers.nodes import router as nodes_router
from app.routers.edges import router as edges_router
from app.routers.graph import router as graph_router
from app.routers.layouts import router as layouts_router

from app.routers.node_types import router as node_types_router
from app.routers.edge_types import router as edge_types_router

from app.core.config import get_settings
from app.core.database import get_db_session


settings = get_settings()

app = FastAPI(
    title="My Way API",
    version="0.1.0",
)
app.include_router(edges_router)
app.include_router(nodes_router)
app.include_router(graph_router)
app.include_router(layouts_router)
app.include_router(node_types_router)
app.include_router(edge_types_router)

@app.get("/health")
async def health(
    session: AsyncSession = Depends(get_db_session),
):
    await session.execute(text("select 1"))

    return {
        "status": "ok",
        "environment": settings.app_env,
        "database": "ok",
    }
