from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.data_import import ImportRequiresEmptyAccount, find_replaceable_layout, restore_data
from app.schemas.data_import import parse_data_import

router = APIRouter(tags=["data import"])
MAX_IMPORT_BYTES = 64 * 1024 * 1024


async def read_import_body(request: Request) -> bytearray:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_IMPORT_BYTES:
            raise HTTPException(413, "Import file exceeds 64 MiB")
        body.extend(chunk)
    return body


@router.post("/import", status_code=201, openapi_extra={
    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
})
async def import_data(
    body: bytearray = Depends(read_import_body),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    try:
        # Authentication holds the same account row lock as other graph writers.
        initial = await find_replaceable_layout(session, current_user.id)
        data = parse_data_import(body)
        if initial is not None:
            await session.delete(initial)
            await session.flush()
        await restore_data(session, current_user.id, data)
        await session.commit()
    except ImportRequiresEmptyAccount as exc:
        raise HTTPException(409, "import_requires_empty_account") from exc
    except ValidationError as exc:
        issue = exc.errors(include_input=False, include_context=False, include_url=False)[0]
        path = ".".join(map(str, issue["loc"]))
        message = f"{path}: {issue['msg']}" if path else issue["msg"]
        raise HTTPException(422, message) from exc
    except (UnicodeError, RecursionError) as exc:
        raise HTTPException(422, "Invalid JSON text") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(422, "Import conflicts with database constraints") from exc

    return {"nodes": len(data.nodes), "edges": len(data.edges), "layouts": len(data.layouts)}
