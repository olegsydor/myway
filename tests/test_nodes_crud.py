import pytest

from app.dependencies import auth
from app.models import Node, NodeType, User


@pytest.mark.asyncio
async def test_create_node(client, db_session):
    user = User(
        email="create-node@example.com",
        display_name="Create Node User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user, node_type])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.post(
            "/nodes",
            json={
                "node_type_id": node_type.id,
                "display_name": "Created Node",
                "description": "Created through API",
                "properties": {
                    "test": True,
                },
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 201

    data = response.json()

    assert data["user_id"] == user.id
    assert data["node_type_id"] == node_type.id
    assert data["display_name"] == "Created Node"
    assert data["description"] == "Created through API"
    assert data["properties"] == {"test": True}


@pytest.mark.asyncio
async def test_get_nodes_returns_only_current_users_nodes(
    client,
    db_session,
):
    user1 = User(
        email="list-user1@example.com",
        display_name="List User One",
    )
    user2 = User(
        email="list-user2@example.com",
        display_name="List User Two",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user1, user2, node_type])
    await db_session.flush()

    user1_node1 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User One Node One",
    )
    user1_node2 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User One Node Two",
    )
    user2_node = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User Two Node",
    )

    db_session.add_all(
        [
            user1_node1,
            user1_node2,
            user2_node,
        ]
    )
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user1.id

    try:
        response = await client.get("/nodes")
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 2
    assert {node["id"] for node in data} == {
        user1_node1.id,
        user1_node2.id,
    }

    assert all(
        node["user_id"] == user1.id
        for node in data
    )


@pytest.mark.asyncio
async def test_get_node(client, db_session):
    user = User(
        email="get-node@example.com",
        display_name="Get Node User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user, node_type])
    await db_session.flush()

    node = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Readable Node",
    )

    db_session.add(node)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.get(
            f"/nodes/{node.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200
    assert response.json()["id"] == node.id
    assert response.json()["display_name"] == "Readable Node"


@pytest.mark.asyncio
async def test_update_node(client, db_session):
    user = User(
        email="update-node@example.com",
        display_name="Update Node User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user, node_type])
    await db_session.flush()

    node = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Before Update",
        description="Original description",
        properties={
            "original": True,
        },
    )

    db_session.add(node)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.patch(
            f"/nodes/{node.id}",
            json={
                "display_name": "After Update",
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200

    data = response.json()

    assert data["display_name"] == "After Update"

    # PATCH must not change fields that were not sent.
    assert data["description"] == "Original description"
    assert data["properties"] == {
        "original": True,
    }


@pytest.mark.asyncio
async def test_delete_node(client, db_session):
    user = User(
        email="delete-node@example.com",
        display_name="Delete Node User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user, node_type])
    await db_session.flush()

    node = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Delete Me",
    )

    db_session.add(node)
    await db_session.commit()

    node_id = node.id

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        delete_response = await client.delete(
            f"/nodes/{node_id}",
        )

        get_response = await client.get(
            f"/nodes/{node_id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert delete_response.status_code == 204

    assert get_response.status_code == 404
    assert get_response.json() == {
        "detail": "Node not found",
    }


@pytest.mark.asyncio
async def test_nonexistent_node_returns_404(
    client,
    db_session,
):
    user = User(
        email="missing-node@example.com",
        display_name="Missing Node User",
    )

    db_session.add(user)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.get(
            "/nodes/999999",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Node not found",
    }


@pytest.mark.asyncio
async def test_user_cannot_update_another_users_node(
    client,
    db_session,
):
    user1 = User(
        email="update-owner@example.com",
        display_name="Update Owner",
    )
    user2 = User(
        email="update-other@example.com",
        display_name="Update Other",
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

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user2.id

    try:
        response = await client.patch(
            f"/nodes/{node.id}",
            json={
                "display_name": "Unauthorized Change",
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Node not found",
    }


@pytest.mark.asyncio
async def test_user_cannot_delete_another_users_node(
    client,
    db_session,
):
    user1 = User(
        email="delete-owner@example.com",
        display_name="Delete Owner",
    )
    user2 = User(
        email="delete-other@example.com",
        display_name="Delete Other",
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

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user2.id

    try:
        response = await client.delete(
            f"/nodes/{node.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Node not found",
    }

@pytest.mark.asyncio
async def test_create_node_with_invalid_node_type_returns_422(
    client,
    db_session,
):
    user = User(
        email="invalid-node-type@example.com",
        display_name="Invalid Node Type User",
    )

    db_session.add(user)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.post(
            "/nodes",
            json={
                "node_type_id": 999999,
                "display_name": "Invalid Node",
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Node type not found",
    }