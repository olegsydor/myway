import pytest

from app.models import Node, NodeType, User


@pytest.mark.asyncio
async def test_user_cannot_read_another_users_node(
    client,
    db_session,
):
    user1 = User(
        email="test-user1@example.com",
        display_name="Test User One",
    )
    user2 = User(
        email="test-user2@example.com",
        display_name="Test User Two",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user1, user2, node_type])
    await db_session.flush()

    node = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="Private Node",
    )

    db_session.add(node)
    await db_session.commit()
    await db_session.refresh(node)

    # Temporary Stage 2 auth uses TEST_USER_ID.
    # For this test we want the API to act as user2.
    from app.dependencies import auth

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user2.id

    try:
        response = await client.get(
            f"/nodes/{node.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Node not found",
    }
