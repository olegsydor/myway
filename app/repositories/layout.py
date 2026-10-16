from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Layout, LayoutNodePosition, Node, User
from app.schemas.layout import LayoutCreate, LayoutDetail, LayoutRead, LayoutUpdate, Position, PositionSnapshot


class LayoutError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def get_layout(session: AsyncSession, user_id: int, layout_id: int) -> Layout:
    layout = (await session.execute(select(Layout).where(
        Layout.user_id == user_id, Layout.id == layout_id,
    ))).scalar_one_or_none()
    if layout is None:
        raise LayoutError(404, "Layout not found")
    return layout


async def list_layouts(session: AsyncSession, user_id: int) -> list[Layout]:
    return list((await session.execute(select(Layout).where(
        Layout.user_id == user_id,
    ).order_by(Layout.id))).scalars())


async def layout_detail(session: AsyncSession, user_id: int, layout_id: int) -> LayoutDetail:
    layout = await get_layout(session, user_id, layout_id)
    positions = (await session.execute(select(LayoutNodePosition).where(
        LayoutNodePosition.user_id == user_id,
        LayoutNodePosition.layout_id == layout_id,
    ).order_by(LayoutNodePosition.node_id))).scalars()
    return LayoutDetail(
        **LayoutRead.model_validate(layout).model_dump(),
        positions=[Position.model_validate(position) for position in positions],
    )


async def lock_owner(session: AsyncSession, user_id: int) -> None:
    # Serialize layout mutations, including first/default creation.
    # FOR UPDATE also conflicts with the FK key-share lock acquired by node inserts.
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def validate_snapshot(session: AsyncSession, user_id: int, data: PositionSnapshot) -> None:
    # Lock existing graph nodes against deletion until this save commits.
    node_ids = set((await session.execute(select(Node.id).where(
        Node.user_id == user_id,
    ).with_for_update(read=True))).scalars())
    if node_ids != {position.node_id for position in data.positions}:
        raise LayoutError(409, "Snapshot must contain every current graph node exactly once")


async def write_positions(session: AsyncSession, user_id: int, layout_id: int, data: PositionSnapshot) -> None:
    await session.execute(delete(LayoutNodePosition).where(
        LayoutNodePosition.user_id == user_id,
        LayoutNodePosition.layout_id == layout_id,
    ))
    if data.positions:
        await session.execute(insert(LayoutNodePosition), [
            dict(user_id=user_id, layout_id=layout_id, **position.model_dump())
            for position in data.positions
        ])


async def make_default(session: AsyncSession, user_id: int, layout: Layout) -> None:
    # Flush the previous default removal before assigning the new default.
    await session.execute(update(Layout).where(
        Layout.user_id == user_id, Layout.is_default.is_(True), Layout.id != layout.id,
    ).values(is_default=False, updated_at=func.clock_timestamp()))
    layout.is_default = True


async def create_layout(session: AsyncSession, user_id: int, data: LayoutCreate) -> LayoutDetail:
    await lock_owner(session, user_id)
    await validate_snapshot(session, user_id, data)
    existing = await list_layouts(session, user_id)
    # Insert without default first, then transfer default status if requested.
    layout = Layout(user_id=user_id, name=data.name, is_default=False)
    session.add(layout)
    await session.flush()
    if not existing or data.is_default:
        await make_default(session, user_id, layout)
    await write_positions(session, user_id, layout.id, data)
    await session.flush()
    # Materialize the accepted snapshot before commit: subsequent reads must not
    # turn an already-committed write into an apparent failed request.
    await session.refresh(layout)
    result = await layout_detail(session, user_id, layout.id)
    await session.commit()
    return result


async def replace_positions(session: AsyncSession, user_id: int, layout_id: int, data: PositionSnapshot) -> LayoutDetail:
    await lock_owner(session, user_id)
    layout = await get_layout(session, user_id, layout_id)
    await validate_snapshot(session, user_id, data)
    await write_positions(session, user_id, layout_id, data)
    layout.updated_at = func.clock_timestamp()
    await session.flush()
    await session.refresh(layout)
    result = await layout_detail(session, user_id, layout_id)
    await session.commit()
    return result


async def update_layout(session: AsyncSession, user_id: int, layout_id: int, data: LayoutUpdate) -> LayoutRead:
    await lock_owner(session, user_id)
    layout = await get_layout(session, user_id, layout_id)
    if data.name is not None:
        layout.name = data.name
    if data.is_default is True:
        await make_default(session, user_id, layout)
    layout.updated_at = func.clock_timestamp()
    await session.flush()
    await session.refresh(layout)
    result = LayoutRead.model_validate(layout)
    await session.commit()
    return result


async def delete_layout(session: AsyncSession, user_id: int, layout_id: int) -> None:
    await lock_owner(session, user_id)
    layout = await get_layout(session, user_id, layout_id)
    if layout.is_default:
        raise LayoutError(409, "Default layout cannot be deleted; set another default first")
    if len(await list_layouts(session, user_id)) == 1:
        raise LayoutError(409, "The only layout cannot be deleted")
    await session.delete(layout)
    await session.commit()
