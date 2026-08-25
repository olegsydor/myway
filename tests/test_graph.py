import pytest

from app.dependencies import auth
from app.models import Edge, EdgeType, Node, NodeType, User


async def get_graph_as_user(client, user_id: int):
    original_user_id = auth.TEST_USER_ID
    auth.TEST_USER_ID = user_id

    try:
        return await client.get("/graph")
    finally:
        auth.TEST_USER_ID = original_user_id


@pytest.mark.asyncio
async def test_get_empty_graph(client, db_session):
    user = User(
        email="empty-graph@example.com",
        display_name="Empty Graph User",
    )

    db_session.add(user)
    await db_session.commit()

    response = await get_graph_as_user(
        client,
        user.id,
    )

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [],
        "edges": [],
        "meta": {
            "nodes_count": 0,
            "edges_count": 0,
        },
    }


@pytest.mark.asyncio
async def test_get_graph_with_one_node(client, db_session):
    user = User(
        email="one-node@example.com",
        display_name="One Node User",
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
        display_name="John Smith",
        description="Test person",
        properties={
            "age": 35,
        },
    )

    db_session.add(node)
    await db_session.commit()

    response = await get_graph_as_user(
        client,
        user.id,
    )

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [
            {
                "id": node.id,
                "type": "person",
                "label": "John Smith",
                "description": "Test person",
                "attributes": {
                    "age": 35,
                },
            }
        ],
        "edges": [],
        "meta": {
            "nodes_count": 1,
            "edges_count": 0,
        },
    }


@pytest.mark.asyncio
async def test_get_graph_with_nodes_and_edges(
    client,
    db_session,
):
    user = User(
        email="full-graph@example.com",
        display_name="Full Graph User",
    )
    person_type = NodeType(
        code="person",
        name="Person",
    )
    company_type = NodeType(
        code="company",
        name="Company",
    )
    works_at_type = EdgeType(
        code="works_at",
        name="Works At",
    )

    db_session.add_all(
        [
            user,
            person_type,
            company_type,
            works_at_type,
        ]
    )
    await db_session.flush()

    person = Node(
        id=20,
        user_id=user.id,
        node_type_id=person_type.id,
        display_name="John Smith",
        description="Employee",
        properties={
            "age": 35,
        },
    )
    company = Node(
        id=10,
        user_id=user.id,
        node_type_id=company_type.id,
        display_name="ACME",
        description=None,
        properties={},
    )

    db_session.add_all([person, company])
    await db_session.flush()

    second_edge = Edge(
        id=200,
        user_id=user.id,
        source_node_id=company.id,
        target_node_id=person.id,
        edge_type_id=works_at_type.id,
        description="Reverse test edge",
        properties={},
    )
    first_edge = Edge(
        id=100,
        user_id=user.id,
        source_node_id=person.id,
        target_node_id=company.id,
        edge_type_id=works_at_type.id,
        description="Current employment",
        properties={
            "role": "developer",
        },
    )

    db_session.add_all([second_edge, first_edge])
    await db_session.commit()

    response = await get_graph_as_user(
        client,
        user.id,
    )

    assert response.status_code == 200

    data = response.json()

    assert data["nodes"] == [
        {
            "id": 10,
            "type": "company",
            "label": "ACME",
            "description": None,
            "attributes": {},
        },
        {
            "id": 20,
            "type": "person",
            "label": "John Smith",
            "description": "Employee",
            "attributes": {
                "age": 35,
            },
        },
    ]

    assert data["edges"] == [
        {
            "id": 100,
            "type": "works_at",
            "source": 20,
            "target": 10,
            "description": "Current employment",
            "attributes": {
                "role": "developer",
            },
        },
        {
            "id": 200,
            "type": "works_at",
            "source": 10,
            "target": 20,
            "description": "Reverse test edge",
            "attributes": {},
        },
    ]

    assert data["meta"] == {
        "nodes_count": 2,
        "edges_count": 2,
    }

    node_ids = {
        node_data["id"]
        for node_data in data["nodes"]
    }

    for edge_data in data["edges"]:
        assert edge_data["source"] in node_ids
        assert edge_data["target"] in node_ids


@pytest.mark.asyncio
async def test_graph_returns_only_current_users_data(
    client,
    db_session,
):
    user1 = User(
        email="graph-user1@example.com",
        display_name="Graph User One",
    )
    user2 = User(
        email="graph-user2@example.com",
        display_name="Graph User Two",
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
        [
            user1,
            user2,
            node_type,
            edge_type,
        ]
    )
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
    user2_node1 = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User Two Node One",
    )
    user2_node2 = Node(
        user_id=user2.id,
        node_type_id=node_type.id,
        display_name="User Two Node Two",
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

    response = await get_graph_as_user(
        client,
        user1.id,
    )

    assert response.status_code == 200

    data = response.json()

    assert {
        node_data["id"]
        for node_data in data["nodes"]
    } == {
        user1_node1.id,
        user1_node2.id,
    }

    assert [
        edge_data["id"]
        for edge_data in data["edges"]
    ] == [
        user1_edge.id,
    ]

    assert data["meta"] == {
        "nodes_count": 2,
        "edges_count": 1,
    }
