import pytest
import pytest_asyncio
from sqlalchemy import select

from app.dependencies.auth import get_current_user
from app.main import app
from app.models import Layout, Node, NodeType, User


@pytest_asyncio.fixture
async def graph(db_session):
    users = [User(email=f"api-layout-{i}@example.com", display_name=str(i)) for i in range(2)]
    kind = NodeType(code="person", name="Person")
    db_session.add_all([*users, kind])
    await db_session.flush()
    nodes = [Node(user_id=user.id, node_type_id=kind.id, display_name="Node") for user in users]
    db_session.add_all(nodes)
    await db_session.commit()
    # IDs survive rollbacks, which expire ORM objects in the test session.
    result = dict(user_ids=[u.id for u in users], node_ids=[n.id for n in nodes], kind_id=kind.id)
    app.dependency_overrides[get_current_user] = lambda: User(id=result["user_ids"][0])
    yield result
    app.dependency_overrides.pop(get_current_user, None)


def snapshot(graph, x=1.25):
    return {"positions": [{"node_id": graph["node_ids"][0], "x": x, "y": -2.5}]}


async def create(client, graph, name="Main", **kwargs):
    response = await client.post("/layouts", json=dict(name=name, **snapshot(graph), **kwargs))
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_first_additional_layout_and_detail(client, graph):
    first = await create(client, graph, "  Main  ")
    second = await create(client, graph, "Career")
    assert first["name"] == "Main"
    assert first["is_default"] is True
    assert second["is_default"] is False
    response = await client.get("/layouts")
    assert [row["id"] for row in response.json()] == [first["id"], second["id"]]
    assert "positions" not in response.json()[0]
    assert (await client.get(f'/layouts/{first["id"]}')).json() == first


@pytest.mark.asyncio
async def test_rename_and_default_preserve_positions(client, graph):
    first = await create(client, graph)
    second = await create(client, graph, "Career")
    response = await client.patch(f'/layouts/{second["id"]}', json={"name": "Work", "is_default": True})
    assert response.status_code == 200
    assert response.json()["name"] == "Work"
    current = (await client.get(f'/layouts/{second["id"]}')).json()
    assert current["positions"] == second["positions"]
    assert current["is_default"] is True
    assert (await client.get(f'/layouts/{first["id"]}')).json()["is_default"] is False


@pytest.mark.asyncio
async def test_create_as_default(client, graph):
    first = await create(client, graph)
    second = await create(client, graph, "Other", is_default=True)
    assert second["is_default"] is True
    assert (await client.get(f'/layouts/{first["id"]}')).json()["is_default"] is False


@pytest.mark.asyncio
async def test_name_conflicts_rollback_default_and_coordinates(client, graph):
    first = await create(client, graph)
    second = await create(client, graph, "Other")
    response = await client.post('/layouts', json={"name": " main ", "is_default": True, **snapshot(graph, 99)})
    assert response.status_code == 409
    response = await client.patch(f'/layouts/{second["id"]}', json={"name": "MAIN", "is_default": True})
    assert response.status_code == 409
    assert (await client.get(f'/layouts/{first["id"]}')).json() == first
    assert (await client.get(f'/layouts/{second["id"]}')).json() == second


@pytest.mark.asyncio
async def test_replace_isolated_snapshot(client, graph):
    first = await create(client, graph)
    second = await create(client, graph, "Other")
    response = await client.put(f'/layouts/{first["id"]}/positions', json=snapshot(graph, 999.123456))
    assert response.status_code == 200
    assert response.json()["positions"] == snapshot(graph, 999.123456)["positions"]
    assert response.json()["updated_at"] >= first["updated_at"]
    assert (await client.get(f'/layouts/{second["id"]}')).json() == second


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["missing", "unknown", "foreign", "duplicate", "string_id", "bool_id", "string_x", "bool_x", "huge_id"])
async def test_invalid_save_preserves_snapshot(client, graph, bad):
    saved = await create(client, graph)
    payload = snapshot(graph)
    if bad == "missing":
        payload["positions"] = []
    elif bad == "duplicate":
        payload["positions"] *= 2
    else:
        field, value = {
            "unknown": ("node_id", 9999999),
            "foreign": ("node_id", graph["node_ids"][1]),
            "string_id": ("node_id", "1"), "bool_id": ("node_id", True),
            "string_x": ("x", "1.5"), "bool_x": ("x", True),
            "huge_id": ("node_id", 2**63),
        }[bad]
        payload["positions"][0][field] = value
    response = await client.put(f'/layouts/{saved["id"]}/positions', json=payload)
    assert response.status_code == (409 if bad in {"missing", "unknown", "foreign"} else 422)
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity"])
async def test_nonfinite_coordinates_rejected(client, graph, number):
    saved = await create(client, graph)
    response = await client.put(
        f'/layouts/{saved["id"]}/positions',
        content='{"positions":[{"node_id":%s,"x":%s,"y":0}]}' % (graph["node_ids"][0], number),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
async def test_stale_snapshot_and_new_node(client, graph, db_session):
    saved = await create(client, graph)
    node = Node(user_id=graph["user_ids"][0], node_type_id=graph["kind_id"], display_name="New")
    db_session.add(node)
    await db_session.commit()
    node_id = node.id
    response = await client.put(f'/layouts/{saved["id"]}/positions', json=snapshot(graph))
    assert response.status_code == 409
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved
    payload = snapshot(graph)
    payload["positions"].append({"node_id": node_id, "x": 30, "y": 40})
    assert (await client.put(f'/layouts/{saved["id"]}/positions', json=payload)).status_code == 200


@pytest.mark.asyncio
async def test_delete_constraints_and_graph_survival(client, graph, db_session):
    first = await create(client, graph)
    assert (await client.delete(f'/layouts/{first["id"]}')).status_code == 409
    second = await create(client, graph, "Other")
    assert (await client.delete(f'/layouts/{first["id"]}')).status_code == 409
    assert (await client.delete(f'/layouts/{second["id"]}')).status_code == 204
    assert (await client.get(f'/layouts/{second["id"]}')).status_code == 404
    assert (await db_session.execute(select(Node.id).where(Node.user_id == graph["user_ids"][0]))).scalar_one() == graph["node_ids"][0]
    # Recovery case: legacy single non-default layout still cannot be deleted.
    layout = await db_session.get(Layout, first["id"])
    layout.is_default = False
    await db_session.commit()
    assert (await client.delete(f'/layouts/{first["id"]}')).status_code == 409


@pytest.mark.asyncio
async def test_user_isolation_all_operations(client, graph):
    saved = await create(client, graph)
    app.dependency_overrides[get_current_user] = lambda: User(id=graph["user_ids"][1])
    assert (await client.get('/layouts')).json() == []
    path = f'/layouts/{saved["id"]}'
    assert (await client.get(path)).status_code == 404
    assert (await client.patch(path, json={"name": "Hack"})).status_code == 404
    assert (await client.put(path+'/positions', json={"positions": []})).status_code == 404
    assert (await client.delete(path)).status_code == 404
    response = await client.post('/layouts', json={"name": "Foreign", **snapshot(graph)})
    assert response.status_code == 409
    payload = {"name": "Main", "positions": [{"node_id": graph["node_ids"][1], "x": 0, "y": 0}]}
    response = await client.post('/layouts', json=payload)
    assert response.status_code == 201
    assert response.json()["is_default"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{}, {"name": None}, {"name": "   "}, {"name": "a"*101}, {"is_default": False}, {"is_default": None}, {"positions": []}])
async def test_invalid_metadata(client, graph, change):
    saved = await create(client, graph)
    assert (await client.patch(f'/layouts/{saved["id"]}', json=change)).status_code == 422
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
async def test_error_after_replacement_rolls_back(client, graph, monkeypatch):
    from app.repositories import layout as repository

    saved = await create(client, graph)
    original = repository.write_positions

    async def fail_after_write(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("Simulated failure after deleting/inserting positions")

    with monkeypatch.context() as patch:
        patch.setattr(repository, "write_positions", fail_after_write)
        with pytest.raises(RuntimeError, match="Simulated failure"):
            await client.put(f'/layouts/{saved["id"]}/positions', json=snapshot(graph, 99))
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
async def test_failed_create_leaves_no_layout(client, graph):
    response = await client.post('/layouts', json={"name": "Main", "positions": []})
    assert response.status_code == 409
    assert (await client.get('/layouts')).json() == []
    saved = await create(client, graph)
    assert saved["is_default"] is True


@pytest.mark.asyncio
async def test_empty_graph_layout(client, graph, db_session):
    from sqlalchemy import delete

    await db_session.execute(delete(Node).where(Node.user_id == graph["user_ids"][0]))
    await db_session.commit()
    response = await client.post('/layouts', json={"name": "Main", "positions": []})
    assert response.status_code == 201
    assert response.json()["positions"] == []
    assert response.json()["is_default"] is True
