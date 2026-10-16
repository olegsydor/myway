from collections.abc import Awaitable
import math
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models import User
from app.repositories import layout as repository
from app.schemas.layout import LayoutCreate, LayoutDetail, LayoutRead, LayoutUpdate, PositionSnapshot

class LayoutRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def validated_handler(request):
            try:
                return await handler(request)
            except RequestValidationError as error:
                # Python JSON parsing accepts NaN/Infinity; preserve a 422 rather
                # than failing while serializing the invalid input in the error.
                return JSONResponse(status_code=422, content=jsonable_encoder(
                    {"detail": error.errors()},
                    custom_encoder={float: lambda value: value if math.isfinite(value) else str(value)},
                ))

        return validated_handler


router = APIRouter(prefix="/layouts", tags=["layouts"], route_class=LayoutRoute)
T = TypeVar("T")


async def run(session: AsyncSession, operation: Awaitable[T]) -> T:
    try:
        return await operation
    except repository.LayoutError as error:
        await session.rollback()
        raise HTTPException(error.status_code, error.detail) from error
    except IntegrityError as error:
        await session.rollback()
        # DB uniqueness remains authoritative, including concurrent requests.
        constraint = getattr(getattr(error.orig, "__cause__", None), "constraint_name", None)
        if constraint == "uq_layouts_user_name":
            detail = "A layout with this name already exists"
        else:
            detail = "Layout conflicts with current graph or layout state; reload and retry"
        raise HTTPException(409, detail) from error
    except Exception:
        await session.rollback()
        raise


@router.get("", response_model=list[LayoutRead])
async def list_layouts(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await run(session, repository.list_layouts(session, current_user.id))


@router.get("/{layout_id}", response_model=LayoutDetail)
async def get_layout(
    layout_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await run(session, repository.layout_detail(session, current_user.id, layout_id))


@router.post("", response_model=LayoutDetail, status_code=201)
async def create_layout(
    data: LayoutCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await run(session, repository.create_layout(session, current_user.id, data))


@router.patch("/{layout_id}", response_model=LayoutRead)
async def update_layout(
    layout_id: int, data: LayoutUpdate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await run(session, repository.update_layout(session, current_user.id, layout_id, data))


@router.put("/{layout_id}/positions", response_model=LayoutDetail)
async def replace_positions(
    layout_id: int, data: PositionSnapshot,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await run(session, repository.replace_positions(session, current_user.id, layout_id, data))


@router.delete("/{layout_id}", status_code=204)
async def delete_layout(
    layout_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    await run(session, repository.delete_layout(session, current_user.id, layout_id))
    return Response(status_code=204)
