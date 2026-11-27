from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from app.routers.nodes import router as nodes_router
from app.routers.edges import router as edges_router
from app.routers.data_export import router as data_export_router
from app.routers.data_import import router as data_import_router
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
    openapi_url=None if settings.is_production else "/openapi.json",
)
app.include_router(edges_router)
app.include_router(nodes_router)
app.include_router(graph_router)
app.include_router(data_export_router)
app.include_router(data_import_router)
app.include_router(layouts_router)
app.include_router(node_types_router)
app.include_router(edge_types_router)

@app.get("/health")
async def health(
    session: AsyncSession = Depends(get_db_session),
):
    if settings.is_production:
        try:
            revision = await session.scalar(text("select version_num from alembic_version limit 1"))
        except (SQLAlchemyError, OSError, TimeoutError):
            await session.rollback()
            revision = None
        if revision is None:
            return JSONResponse({"status": "unavailable"}, status_code=503)
    else:
        await session.execute(text("select 1"))

    return {
        "status": "ok",
        "environment": settings.app_env,
        "database": "ok",
    }


from app.routers.auth import router as auth_router
from app.core.auth_middleware import auth_boundary
app.include_router(auth_router)
app.middleware("http")(auth_boundary)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    if request.url.path in {"/auth/account/deletion", "/auth/account/deletion/cancel"}:
        # Default validation responses can include the submitted password.
        return JSONResponse({"detail": "invalid_deletion_input"}, status_code=422)
    return await request_validation_exception_handler(request, exc)
