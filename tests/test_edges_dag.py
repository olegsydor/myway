import pytest
import pytest_asyncio
from sqlalchemy import select

from app.dependencies.auth import get_current_user
from app.main import app
from app.models import Edge, EdgeType, Node, NodeType, User
from app.repositories.edge import EdgeCycleError, validate_edge_dag


@pytest_asyncio.fixture
async def dag_graph(db_session):
    owner = User(
        email="dag-owner@example.com",
        display_name="DAG Owner",
    )
    other = User(
        email="dag-other@example.com",
        display_name="DAG Other",
    )
    node_type = NodeType(code="person", name="Person")
    edge_type = EdgeType(code="knows", name="Knows")

    db_session.add_all([owner, other, node_type, edge_type])
    await db_session.flush()

    nodes = [
        Node(
            user_id=owner.id,
            node_type_id=node_type.id,
            display_name=name,
        )
        for name in ["A", "B", "C", "D"]
    ]
    other_nodes = [
        Node(
            user_id=other.id,
            node_type_id=node_type.id,
            display_name=name,
        )
        for name in ["Other A", "Other B"]
    ]

    db_session.add_all(nodes + other_nodes)
    await db_session.commit()

    return owner, other, nodes, other_nodes, edge_type


@pytest_asyncio.fixture
async def dag_client(client, dag_graph):
    owner = dag_graph[0]

    async def current_owner():
        return owner

    app.dependency_overrides[get_current_user] = current_owner
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def add_edge(db_session, user_id, source_id, target_id, type_id):
    edge = Edge(
        user_id=user_id,
        source_node_id=source_id,
        target_node_id=target_id,
        edge_type_id=type_id,
    )
    db_session.add(edge)
    await db_session.commit()
    return edge


@pytest.mark.asyncio
@pytest.mark.parametrize("path_length", [1, 2])
async def test_create_cycle_is_rejected(
    dag_client, db_session, dag_graph, path_length
):
    owner, _, nodes, _, edge_type = dag_graph
    owner_id = owner.id
    node_ids = [node.id for node in nodes]

    for index in range(path_length):
        await add_edge(
            db_session,
            owner.id,
            node_ids[index],
            node_ids[index + 1],
            edge_type.id,
        )

    response = await dag_client.post(
        "/edges",
        json={
            "source_node_id": node_ids[path_length],
            "target_node_id": node_ids[0],
            "edge_type_id": edge_type.id,
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This edge would create a cycle",
    }

    result = await db_session.execute(
        select(Edge).where(Edge.user_id == owner_id)
    )
    assert len(result.scalars().all()) == path_length


@pytest.mark.asyncio
async def test_valid_acyclic_edge_is_accepted(
    dag_client, db_session, dag_graph
):
    owner, _, nodes, _, edge_type = dag_graph
    a, b, c, _ = [node.id for node in nodes]

    await add_edge(db_session, owner.id, a, b, edge_type.id)

    response = await dag_client.post(
        "/edges",
        json={
            "source_node_id": b,
            "target_node_id": c,
            "edge_type_id": edge_type.id,
        },
    )

    assert response.status_code == 201
    assert response.json()["source_node_id"] == b
    assert response.json()["target_node_id"] == c


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["source_node_id", "target_node_id"])
async def test_endpoint_update_creating_cycle_is_rejected(
    dag_client, db_session, dag_graph, field
):
    owner, _, nodes, _, edge_type = dag_graph
    a, b, c, d = [node.id for node in nodes]

    await add_edge(db_session, owner.id, a, b, edge_type.id)
    await add_edge(db_session, owner.id, b, c, edge_type.id)

    if field == "source_node_id":
        edge = await add_edge(db_session, owner.id, d, a, edge_type.id)
        proposed_id = c
        original = (d, a)
    else:
        edge = await add_edge(db_session, owner.id, c, d, edge_type.id)
        proposed_id = a
        original = (c, d)

    edge_id = edge.id
    response = await dag_client.patch(
        f"/edges/{edge_id}",
        json={field: proposed_id},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "This edge would create a cycle",
    }

    await db_session.refresh(edge)
    assert (edge.source_node_id, edge.target_node_id) == original


@pytest.mark.asyncio
async def test_update_to_self_loop_is_rejected(
    dag_client, db_session, dag_graph
):
    owner, _, nodes, _, edge_type = dag_graph
    a, b = [node.id for node in nodes[:2]]
    edge = await add_edge(db_session, owner.id, a, b, edge_type.id)

    response = await dag_client.patch(
        f"/edges/{edge.id}",
        json={"target_node_id": a},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Self-loop edges are not allowed",
    }

    await db_session.refresh(edge)
    assert edge.target_node_id == b


@pytest.mark.asyncio
async def test_update_without_endpoint_change_is_accepted(
    dag_client, db_session, dag_graph
):
    owner, _, nodes, _, edge_type = dag_graph
    a, b = [node.id for node in nodes[:2]]
    edge = await add_edge(db_session, owner.id, a, b, edge_type.id)

    response = await dag_client.patch(
        f"/edges/{edge.id}",
        json={
            "source_node_id": a,
            "target_node_id": b,
            "edge_type_id": edge_type.id,
            "description": "Updated description",
            "properties": {"note": "Updated"},
        },
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"
    assert response.json()["properties"] == {"note": "Updated"}


@pytest.mark.asyncio
async def test_updated_edge_is_excluded_from_cycle_check(
    dag_client, db_session, dag_graph
):
    owner, _, nodes, _, edge_type = dag_graph
    a, b = [node.id for node in nodes[:2]]
    edge = await add_edge(db_session, owner.id, a, b, edge_type.id)

    response = await dag_client.patch(
        f"/edges/{edge.id}",
        json={
            "source_node_id": b,
            "target_node_id": a,
        },
    )

    assert response.status_code == 200
    assert response.json()["source_node_id"] == b
    assert response.json()["target_node_id"] == a


@pytest.mark.asyncio
async def test_cycle_validation_is_scoped_to_user(
    db_session, dag_graph
):
    owner, other, _, other_nodes, edge_type = dag_graph
    a, b = [node.id for node in other_nodes]

    await add_edge(db_session, other.id, a, b, edge_type.id)

    # Direct validator call isolates the user filter from endpoint
    # ownership checks. No cross-user edge is written.
    await validate_edge_dag(
        db_session,
        user_id=owner.id,
        source_node_id=b,
        target_node_id=a,
    )

    with pytest.raises(
        EdgeCycleError,
        match="This edge would create a cycle",
    ):
        await validate_edge_dag(
            db_session,
            user_id=other.id,
            source_node_id=b,
            target_node_id=a,
        )


@pytest.mark.asyncio
async def test_other_users_path_does_not_block_valid_edge(
    dag_client, db_session, dag_graph
):
    owner, other, nodes, other_nodes, edge_type = dag_graph
    a, b = [node.id for node in nodes[:2]]
    other_a, other_b = [node.id for node in other_nodes]

    await add_edge(
        db_session, other.id, other_b, other_a, edge_type.id
    )

    response = await dag_client.post(
        "/edges",
        json={
            "source_node_id": a,
            "target_node_id": b,
            "edge_type_id": edge_type.id,
        },
    )

    assert response.status_code == 201
    assert response.json()["user_id"] == owner.id
