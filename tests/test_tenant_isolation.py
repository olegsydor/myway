import pytest
from sqlalchemy.exc import IntegrityError

from app.dependencies import auth
from app.models import Edge, EdgeType, Node, NodeType, User


@pytest.mark.asyncio
async def test_user_can_read_own_node(client, db_session):
    user = User(
        email="owner@example.com",
        display_name="Owner",
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
        display_name="Own Node",
    )
    db_session.add(node)
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user.id

    try:
        response = await client.get(f"/nodes/{node.id}")
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 200
    assert response.json()["id"] == node.id
    assert response.json()["user_id"] == user.id


@pytest.mark.asyncio
async def test_user_cannot_read_another_users_edge(
    client,
    db_session,
):
    user1 = User(
        email="edge-owner@example.com",
        display_name="Edge Owner",
    )
    user2 = User(
        email="edge-other@example.com",
        display_name="Other User",
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
        response = await client.get(f"/edges/{edge.id}")
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Edge not found",
    }


@pytest.mark.asyncio
async def test_api_rejects_cross_user_edge(
    client,
    db_session,
):
    user1 = User(
        email="api-user1@example.com",
        display_name="API User One",
    )
    user2 = User(
        email="api-user2@example.com",
        display_name="API User Two",
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

    user1_node = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User One Node",
    )
    user2_node = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User Two Node",
    )

    db_session.add_all([user1_node, user2_node])
    await db_session.commit()

    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user1.id

    try:
        response = await client.post(
            "/edges",
            json={
                "source_node_id": user1_node.id,
                "target_node_id": user2_node.id,
                "edge_type_id": edge_type.id,
            },
        )
    finally:
        auth.TEST_USER_ID = original_user_id

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Source or target node not found",
    }


@pytest.mark.asyncio
async def test_database_rejects_cross_user_edge(
    db_session,
):
    user1 = User(
        email="db-user1@example.com",
        display_name="DB User One",
    )
    user2 = User(
        email="db-user2@example.com",
        display_name="DB User Two",
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

    user1_node = Node(
        user_id=user1.id,
        node_type_id=node_type.id,
        display_name="User One Node",
    )
    user2_node = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User Two Node",
    )

    db_session.add_all([user1_node, user2_node])
    await db_session.flush()

    edge = Edge(
        user_id=user1.id,
        source_node_id=user1_node.id,
        target_node_id=user2_node.id,
        edge_type_id=edge_type.id,
    )

    db_session.add(edge)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()
