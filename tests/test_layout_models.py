import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.models import Layout, LayoutNodePosition, Node, NodeType, User


async def seed(session):
    users = [User(email=f"layout{i}@example.com", display_name=f"User {i}") for i in range(2)]
    node_type = NodeType(code="person", name="Person")
    session.add_all([*users, node_type])
    await session.flush()
    node = Node(user_id=users[0].id, node_type_id=node_type.id, display_name="Node")
    layout = Layout(user_id=users[0].id, name="Main", is_default=True)
    session.add_all([node, layout])
    await session.commit()
    return users, node, layout


@pytest.mark.asyncio
@pytest.mark.parametrize("violation", ["name", "default", "owner", "duplicate", "nan", "infinity", "empty"])
async def test_layout_constraints(db_session, violation):
    users, node, layout = await seed(db_session)
    if violation == "name":
        item = Layout(user_id=users[0].id, name="main")
    elif violation == "default":
        item = Layout(user_id=users[0].id, name="Other", is_default=True)
    elif violation == "empty":
        item = Layout(user_id=users[0].id, name="   ")
    else:
        if violation == "duplicate":
            db_session.add(LayoutNodePosition(
                user_id=users[0].id, layout_id=layout.id, node_id=node.id, x=1, y=2))
            await db_session.commit()
        item = LayoutNodePosition(
            user_id=users[1].id if violation == "owner" else users[0].id,
            layout_id=layout.id, node_id=node.id,
            x=float("nan") if violation == "nan" else float("inf") if violation == "infinity" else 1,
            y=2,
        )
    db_session.add(item)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_layout_name_can_repeat_for_another_user(db_session):
    users, _, _ = await seed(db_session)
    db_session.add(Layout(user_id=users[1].id, name="Main", is_default=True))
    await db_session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("delete_node", [False, True])
async def test_layout_position_cleanup_and_precision(db_session, delete_node):
    users, node, layout = await seed(db_session)
    position = LayoutNodePosition(
        user_id=users[0].id, layout_id=layout.id, node_id=node.id,
        x=-123456.123456789, y=987654.987654321,
    )
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)
    assert position.x == -123456.123456789
    assert position.y == 987654.987654321
    await db_session.execute(delete(Node if delete_node else Layout))
    await db_session.commit()
    assert (await db_session.execute(select(LayoutNodePosition))).scalars().all() == []
    remaining = (await db_session.execute(select(Layout if delete_node else Node))).scalars().all()
    assert len(remaining) == 1
