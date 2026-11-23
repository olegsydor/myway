from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.data_import import (
    ImportRequiresEmptyAccount, replace_workspace, resolve_types, restore_data,
)
from app.schemas.data_import import DataImport, parse_data_import
from app.schemas.entitlement import Eligibility
from app.services.entitlements import snapshot_eligibility

router = APIRouter(tags=["data import"])
MAX_IMPORT_BYTES = 64 * 1024 * 1024


async def read_import_body(request: Request) -> bytearray:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_IMPORT_BYTES:
            raise HTTPException(413, "Import file exceeds 64 MiB")
        body.extend(chunk)
    return body


def validated_export(body: bytearray) -> DataImport:
    try:
        return parse_data_import(body)
    except ValidationError as exc:
        issue = exc.errors(include_input=False, include_context=False, include_url=False)[0]
        path = ".".join(map(str, issue["loc"]))
        message = f"{path}: {issue['msg']}" if path else issue["msg"]
        raise HTTPException(422, message) from exc
    except (UnicodeError, RecursionError) as exc:
        raise HTTPException(422, "Invalid JSON text") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def restore_counts(data: DataImport) -> dict[str, int]:
    return {
        "nodes": len(data.nodes),
        "edges": len(data.edges),
        "layouts": len(data.layouts),
        "positions": sum(len(layout.positions) for layout in data.layouts),
        "annotations": sum(len(layout.annotations) for layout in data.layouts),
    }


@router.post("/import", status_code=201, openapi_extra={
    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
})
async def import_data(
    body: bytearray = Depends(read_import_body),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    try:
        data = validated_export(body)
        await restore_data(session, current_user.id, data)
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except ImportRequiresEmptyAccount as exc:
        raise HTTPException(409, "import_requires_empty_account") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(422, "Import conflicts with database constraints") from exc

    return {"nodes": len(data.nodes), "edges": len(data.edges), "layouts": len(data.layouts)}


@router.post("/restore/preview")
async def preview_restore(
    body: bytearray = Depends(read_import_body),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int | Eligibility]:
    data = validated_export(body)
    try:
        await resolve_types(session, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    eligibility = await snapshot_eligibility(session, current_user.id, data)
    return {**restore_counts(data), "eligibility": eligibility}


@router.post("/restore")
async def restore_workspace(
    confirmed: bool = Query(),
    body: bytearray = Depends(read_import_body),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    if not confirmed:
        raise HTTPException(400, "restore_confirmation_required")
    # Authentication holds the owner lock through revalidation, replacement and commit.
    data = validated_export(body)
    try:
        await replace_workspace(session, current_user.id, data)
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(422, str(exc)) from exc
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(422, "Restore conflicts with database constraints") from exc
    return restore_counts(data)
