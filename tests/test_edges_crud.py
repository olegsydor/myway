import pytest

from app.dependencies import auth
from app.models import Edge, EdgeType, Node, NodeType, User


@pytest.mark.asyncio
async def test_create_edge(client, db_session):
    user = User(
        email="create-edge@example.com",
        display_name="Create Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.post(
            "/edges",
            json={
                "source_node_id": node1.id,
                "target_node_id": node2.id,
                "edge_type_id": edge_type.id,
                "description": "Test edge",
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
    assert data["source_node_id"] == node1.id
    assert data["target_node_id"] == node2.id
    assert data["edge_type_id"] == edge_type.id
    assert data["description"] == "Test edge"
    assert data["properties"] == {"test": True}


@pytest.mark.asyncio
async def test_get_edges_returns_only_current_users_edges(
    client,
    db_session,
):
    user1 = User(
        email="edge-list-user1@example.com",
        display_name="Edge List User One",
    )
    user2 = User(
        email="edge-list-user2@example.com",
        display_name="Edge List User Two",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all(
        [user1, user2, node_type, edge_type]
    )
    await db_session.flush()

    user1_node1 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User1 Node1",
    )
    user1_node2 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User1 Node2",
    )
    user2_node1 = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User2 Node1",
    )
    user2_node2 = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User2 Node2",
    )

    db_session.add_all(
        [
            user1_node1,
            user1_node2,
            user2_node1,
            user2_node2,
        ]
    )
    await db_session.flush()

    user1_edge = Edge(
        user_id=user1.id,
        source_node_id=user1_node1.id,
        target_node_id=user1_node2.id,
        edge_type_id=edge_type.id,
    )
    user2_edge = Edge(
        user_id=user2.id,
        source_node_id=user2_node1.id,
        target_node_id=user2_node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add_all([user1_edge, user2_edge])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user1.id

    try:
        response = await client.get("/edges")
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200

    data = response.json()

    assert len(data) == 1
    assert data[0]["id"] == user1_edge.id
    assert data[0]["user_id"] == user1.id


@pytest.mark.asyncio
async def test_get_edge(client, db_session):
    user = User(
        email="get-edge@example.com",
        display_name="Get Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.get(
            f"/edges/{edge.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200
    assert response.json()["id"] == edge.id


@pytest.mark.asyncio
async def test_update_edge(client, db_session):
    user = User(
        email="update-edge@example.com",
        display_name="Update Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )
    node3 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Three",
    )

    db_session.add_all([node1, node2, node3])
    await db_session.flush()

    edge = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
        description="Before Update",
        properties={"original": True},
    )

    db_session.add(edge)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.patch(
            f"/edges/{edge.id}",
            json={
                "target_node_id": node3.id,
                "description": "After Update",
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200

    data = response.json()

    assert data["source_node_id"] == node1.id
    assert data["target_node_id"] == node3.id
    assert data["description"] == "After Update"

    # PATCH must preserve fields not included in request.
    assert data["edge_type_id"] == edge_type.id
    assert data["properties"] == {"original": True}


@pytest.mark.asyncio
async def test_update_edge_to_duplicate_returns_409(
    client,
    db_session,
):
    user = User(
        email="update-duplicate-edge@example.com",
        display_name="Update Duplicate Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )
    node3 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Three",
    )

    db_session.add_all([node1, node2, node3])
    await db_session.flush()

    edge1 = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )
    edge2 = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node3.id,
        edge_type_id=edge_type.id,
    )

    db_session.add_all([edge1, edge2])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.patch(
            f"/edges/{edge2.id}",
            json={
                "target_node_id": node2.id,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Edge already exists",
    }

@pytest.mark.asyncio
async def test_delete_edge(client, db_session):
    user = User(
        email="delete-edge@example.com",
        display_name="Delete Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    edge_id = edge.id

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        delete_response = await client.delete(
            f"/edges/{edge_id}",
        )
        get_response = await client.get(
            f"/edges/{edge_id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert delete_response.status_code == 204

    assert get_response.status_code == 404
    assert get_response.json() == {
        "detail": "Edge not found",
    }


@pytest.mark.asyncio
async def test_nonexistent_edge_returns_404(
    client,
    db_session,
):
    user = User(
        email="missing-edge@example.com",
        display_name="Missing Edge User",
    )

    db_session.add(user)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.get(
            "/edges/999999",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Edge not found",
    }


@pytest.mark.asyncio
async def test_user_cannot_update_edge_to_another_users_node(
    client,
    db_session,
):
    user1 = User(
        email="edge-patch-user1@example.com",
        display_name="Edge Patch User One",
    )
    user2 = User(
        email="edge-patch-user2@example.com",
        display_name="Edge Patch User Two",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all(
        [user1, user2, node_type, edge_type]
    )
    await db_session.flush()

    user1_node1 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User1 Node1",
    )
    user1_node2 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User1 Node2",
    )
    user2_node = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User2 Node",
    )

    db_session.add_all(
        [user1_node1, user1_node2, user2_node]
    )
    await db_session.flush()

    edge = Edge(
        user_id=user1.id,
        source_node_id=user1_node1.id,
        target_node_id=user1_node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    original_target_node_id = edge.target_node_id

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user1.id

    try:
        response = await client.patch(
            f"/edges/{edge.id}",
            json={
                "target_node_id": user2_node.id,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Source or target node not found",
    }

    await db_session.refresh(edge)

    assert edge.target_node_id == original_target_node_id


@pytest.mark.asyncio
async def test_self_loop_is_allowed(
    client,
    db_session,
):
    user = User(
        email="self-loop@example.com",
        display_name="Self Loop User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="references",
        name="References",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Self Loop Node",
    )

    db_session.add(node)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.post(
            "/edges",
            json={
                "source_node_id": node.id,
                "target_node_id": node.id,
                "edge_type_id": edge_type.id,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 201

    data = response.json()

    assert data["source_node_id"] == node.id
    assert data["target_node_id"] == node.id


@pytest.mark.asyncio
async def test_duplicate_edges_return_409(
    client,
    db_session,
):
    user = User(
        email="duplicate-edge@example.com",
        display_name="Duplicate Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response1 = await client.post(
            "/edges",
            json={
                "source_node_id": node1.id,
                "target_node_id": node2.id,
                "edge_type_id": edge_type.id,
            },
        )

        response2 = await client.post(
            "/edges",
            json={
                "source_node_id": node1.id,
                "target_node_id": node2.id,
                "edge_type_id": edge_type.id,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response1.status_code == 201
    assert response2.status_code == 409
    assert response2.json() == {
        "detail": "Edge already exists",
    }


@pytest.mark.asyncio
async def test_node_with_edges_cannot_be_deleted(
    client,
    db_session,
):
    user = User(
        email="restricted-delete@example.com",
        display_name="Restricted Delete User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Connected Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Connected Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.delete(
            f"/nodes/{node1.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 409
    assert response.json() == {
        "detail": (
            "Node has connected edges. "
            "Delete the edges first."
        )
    }

    await db_session.refresh(node1)
    await db_session.refresh(edge)

    assert node1.id is not None
    assert edge.id is not None


@pytest.mark.asyncio
async def test_node_can_be_deleted_after_edges_are_deleted(
    client,
    db_session,
):
    user = User(
        email="delete-after-edge@example.com",
        display_name="Delete After Edge User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all([user, node_type, edge_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    node1_id = node1.id
    edge_id = edge.id

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        delete_node_before = await client.delete(
            f"/nodes/{node1_id}",
        )

        delete_edge_response = await client.delete(
            f"/edges/{edge_id}",
        )

        delete_node_after = await client.delete(
            f"/nodes/{node1_id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert delete_node_before.status_code == 409
    assert delete_edge_response.status_code == 204
    assert delete_node_after.status_code == 204


@pytest.mark.asyncio
async def test_create_edge_with_invalid_edge_type_returns_422(
    client,
    db_session,
):
    user = User(
        email="invalid-edge-type@example.com",
        display_name="Invalid Edge Type User",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )

    db_session.add_all([user, node_type])
    await db_session.flush()

    node1 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.post(
            "/edges",
            json={
                "source_node_id": node1.id,
                "target_node_id": node2.id,
                "edge_type_id": 999999,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Edge type not found",
    }

@pytest.mark.asyncio
async def test_user_cannot_update_another_users_edge(
    client,
    db_session,
):
    user1 = User(
        email="edge-update-owner@example.com",
        display_name="Edge Update Owner",
    )
    user2 = User(
        email="edge-update-other@example.com",
        display_name="Edge Update Other",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all(
        [user1, user2, node_type, edge_type]
    )
    await db_session.flush()

    node1 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user1.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user2.id

    try:
        response = await client.patch(
            f"/edges/{edge.id}",
            json={
                "description": "Unauthorized Change",
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Edge not found",
    }

@pytest.mark.asyncio
async def test_user_cannot_delete_another_users_edge(
    client,
    db_session,
):
    user1 = User(
        email="edge-delete-owner@example.com",
        display_name="Edge Delete Owner",
    )
    user2 = User(
        email="edge-delete-other@example.com",
        display_name="Edge Delete Other",
    )
    node_type = NodeType(
        code="person",
        name="Person",
    )
    edge_type = EdgeType(
        code="knows",
        name="Knows",
    )

    db_session.add_all(
        [user1, user2, node_type, edge_type]
    )
    await db_session.flush()

    node1 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="Node One",
    )
    node2 = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="Node Two",
    )

    db_session.add_all([node1, node2])
    await db_session.flush()

    edge = Edge(
        user_id=user1.id,
        source_node_id=node1.id,
        target_node_id=node2.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user2.id

    try:
        response = await client.delete(
            f"/edges/{edge.id}",
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Edge not found",
    }