import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.commands.auth import run as operator
from app.models import Edge, LayoutAnnotation, LayoutNodePosition
from app.routers import data_export, nodes
from tests.test_account_deletion import CONFIRM, DELETE
from tests.test_auth_lifecycle import login, real_clients, signup
from tests.test_data_import import create_types, post

pytestmark = pytest.mark.asyncio
OWNER = "audit-owner@example.com"


async def create_node(client, type_id, name):
    return (await post(client, "/nodes", {"node_type_id": type_id, "display_name": name}))["id"]


async def test_tenant_ownership_at_api_and_database_boundaries(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        owner = await signup(a, OWNER, delivered)
        await signup(b, "audit-other@example.com", delivered)
        node_type, edge_type = await create_types(factory)
        first = await create_node(a, node_type, "First")
        second = await create_node(a, node_type, "Second")
        foreign = await create_node(b, node_type, "Foreign")
        layout = (await post(a, "/layouts", {
            "name": "Owner graph",
            "positions": [{"node_id": node, "x": 0, "y": 0} for node in (first, second)],
        }))["id"]
        other_layout = (await post(b, "/layouts", {
            "name": "Other graph", "positions": [{"node_id": foreign, "x": 0, "y": 0}],
        }))["id"]
        edge_payload = {"source_node_id": first, "target_node_id": second, "edge_type_id": edge_type}
        edge = (await post(a, "/edges", edge_payload))["id"]
        snapshot = {"positions": [{"node_id": foreign, "x": 1, "y": 2}], "annotations": []}

        original = (await a.get("/export")).json()
        for path, patch in (
            (f"/nodes/{first}", {"display_name": "Changed"}),
            (f"/edges/{edge}", {"description": "Changed"}),
            (f"/layouts/{layout}", {"name": "Changed"}),
        ):
            assert (await b.get(path)).status_code == 404
            assert (await b.patch(path, json=patch)).status_code == 404
            assert (await b.delete(path)).status_code == 404
        for suffix, payload in (("positions", {"positions": snapshot["positions"]}), ("workspace", snapshot)):
            assert (await b.put(f"/layouts/{layout}/{suffix}", json=payload)).status_code == 404
            assert (await a.put(f"/layouts/{layout}/{suffix}", json=payload)).status_code == 409
        assert (await a.post("/edges", json={**edge_payload, "source_node_id": foreign})).status_code == 404
        assert (await a.patch(f"/edges/{edge}", json={"target_node_id": foreign})).status_code == 404
        after = (await a.get("/export")).json()
        for key in ("nodes", "edges", "layouts"):
            assert after[key] == original[key]

        for row, constraint in (
            (Edge(user_id=owner, **{**edge_payload, "source_node_id": foreign}), "fk_edges_source_node_owner"),
            (Edge(user_id=owner, **{**edge_payload, "target_node_id": foreign}), "fk_edges_target_node_owner"),
            (LayoutNodePosition(user_id=owner, layout_id=layout, node_id=foreign, x=0, y=0),
             "fk_layout_positions_node_owner"),
            (LayoutNodePosition(user_id=owner, layout_id=other_layout, node_id=first, x=0, y=0),
             "fk_layout_positions_layout_owner"),
            (LayoutAnnotation(user_id=owner, layout_id=other_layout, annotation_id=uuid4(),
                              kind="text", order_index=0, x=0, y=0, text="Text", size="small", color="gray"),
             "fk_layout_annotations_owner"),
        ):
            with pytest.raises(IntegrityError, match=constraint) as failure:
                async with factory.begin() as session:
                    session.add(row)
            assert failure.value.orig.sqlstate == "23503"


@pytest.mark.parametrize("duplicate", [False, True], ids=["dag", "duplicate"])
async def test_concurrent_edge_requests_preserve_graph(test_engine, monkeypatch, duplicate):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        await signup(a, OWNER, delivered)
        assert (await login(b, OWNER)).status_code == 200
        node_type, edge_type = await create_types(factory)
        first = await create_node(a, node_type, "First")
        second = await create_node(a, node_type, "Second")
        forward = {"source_node_id": first, "target_node_id": second, "edge_type_id": edge_type}
        competing = forward if duplicate else {**forward, "source_node_id": second, "target_node_id": first}
        results = await asyncio.wait_for(asyncio.gather(
            a.post("/edges", json=forward), b.post("/edges", json=competing),
        ), timeout=10)
        assert sorted(result.status_code for result in results) == [201, 409]
        assert len((await a.get("/edges")).json()) == 1


async def test_export_snapshot_during_workspace_save(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        await signup(a, OWNER, delivered)
        assert (await login(b, OWNER)).status_code == 200
        node_type, _ = await create_types(factory)
        node = await create_node(a, node_type, "First")
        layout = (await post(a, "/layouts", {
            "name": "Main", "positions": [{"node_id": node, "x": 0, "y": 0}],
        }))["id"]
        entered, release = asyncio.Event(), asyncio.Event()
        read_export = data_export.read_data_export

        async def paused_export(*args):
            entered.set()
            await asyncio.wait_for(release.wait(), timeout=10)
            return await read_export(*args)

        path = f"/layouts/{layout}/workspace"
        payload = {"positions": [{"node_id": node, "x": 9, "y": 5}], "annotations": []}
        with monkeypatch.context() as patch:
            patch.setattr(data_export, "read_data_export", paused_export)
            export = asyncio.create_task(a.get("/export"))
            try:
                await asyncio.wait_for(entered.wait(), timeout=10)
                saved = await asyncio.wait_for(b.put(path, json=payload), timeout=10)
                assert saved.status_code == 200, saved.text
            finally:
                release.set()
                old = await export
        assert old.status_code == 200
        assert old.json()["layouts"][0]["positions"][0]["x"] == 0
        assert (await a.get("/export")).json()["layouts"][0]["positions"][0]["x"] == 9


@pytest.mark.parametrize("action", ["block", "delete"])
async def test_account_transition_serializes_with_write(test_engine, monkeypatch, action):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        owner = await signup(a, OWNER, delivered)
        assert (await login(b, OWNER)).status_code == 200
        node_type, _ = await create_types(factory)
        entered, release = asyncio.Event(), asyncio.Event()
        create = nodes.create_node

        async def paused_create(*args, **kwargs):
            entered.set()
            await asyncio.wait_for(release.wait(), timeout=10)
            return await create(*args, **kwargs)

        async def transition():
            if action == "block":
                await operator(SimpleNamespace(action="block", user_id=owner, until=None, reason=None))
            else:
                response = await b.post(DELETE, json=CONFIRM)
                assert response.status_code == 200, response.text

        payload = {"node_type_id": node_type, "display_name": "Authorized write"}
        with monkeypatch.context() as patch:
            patch.setattr(nodes, "create_node", paused_create)
            write = asyncio.create_task(a.post("/nodes", json=payload))
            change = None
            try:
                await asyncio.wait_for(entered.wait(), timeout=10)
                change = asyncio.create_task(transition())
                done, _ = await asyncio.wait({change}, timeout=0.15)
                assert not done
            finally:
                release.set()
                await asyncio.wait_for(asyncio.gather(write, *([change] if change else [])), timeout=10)
        assert write.result().status_code == 201
        assert (await a.post("/nodes", json=payload)).status_code == 401
