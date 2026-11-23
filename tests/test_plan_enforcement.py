import asyncio
import json
from types import SimpleNamespace

import pytest

from app.commands import auth
from app.models import Node
from tests.test_auth_lifecycle import login, real_clients, signup
from tests.test_data_import import create_types, export_graph
from tests.test_layout_annotations import label

pytestmark = pytest.mark.asyncio


async def test_qa_free_concurrent_node_boundary(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        email = "qa-free@example.com"
        user = await signup(a, email, delivered)
        assert (await login(b, email)).status_code == 200
        node_type, _ = await create_types(factory)
        async with factory.begin() as session:
            session.add_all([Node(user_id=user, node_type_id=node_type, display_name=f"Node {i}") for i in range(299)])
        data = {"node_type_id": node_type, "display_name": "Boundary"}
        results = await asyncio.wait_for(asyncio.gather(a.post("/nodes", json=data), b.post("/nodes", json=data)), 10)
        assert sorted(r.status_code for r in results) == [201, 409]
        created = next(r.json() for r in results if r.status_code == 201)
        denied = next(r.json()["detail"] for r in results if r.status_code == 409)
        assert denied["code"] == "plan_limit_exceeded"
        assert (denied["current"], denied["attempted"]) == (300, 301)
        assert (await a.get("/auth/entitlements")).json()["usage"] == {"nodes": 300, "layouts": 0}
        path = f'/nodes/{created["id"]}'
        assert (await a.patch(path, json={"display_name": "Edited"})).status_code == 200
        assert (await a.delete(path)).status_code == 204
        assert (await a.post("/nodes", json=data)).status_code == 201


async def test_qa_lifecycle_operator_and_grandfathering(test_engine, monkeypatch, capsys):
    async with real_clients(test_engine, monkeypatch) as (client, _, factory, delivered):
        user = await signup(client, "qa-lifecycle@example.com", delivered)
        monkeypatch.setattr(auth, "AsyncSessionFactory", factory)
        args = SimpleNamespace(action="grant-pro", user_id=user, source="early_tester", until=None)
        await auth.run(args)
        grant = json.loads(capsys.readouterr().out)["grant_id"]
        await auth.run(args)
        assert json.loads(capsys.readouterr().out)["grant_id"] == grant
        await auth.run(SimpleNamespace(action="list-entitlements", user_id=user))
        assert len(json.loads(capsys.readouterr().out)["grants"]) == 1
        plan = (await client.get("/auth/entitlements")).json()
        assert (plan["plan"], plan["source"], plan["expires_at"]) == ("pro", "early_tester", None)
        annotations = [label() for _ in range(19)]
        created = await client.post("/layouts", json={"name": "Main", "positions": [], "annotations": annotations[:18]})
        assert created.status_code == 201
        await auth.run(SimpleNamespace(action="revoke-pro", grant_id=grant))
        assert (await client.get("/auth/entitlements")).json()["plan"] == "free"
        path = f'/layouts/{created.json()["id"]}/workspace'
        for count, status in [(19, 409), (18, 200), (17, 200), (18, 409)]:
            result = await client.put(path, json={"positions": [], "annotations": annotations[:count]})
            assert result.status_code == status
        assert (await client.post("/layouts", json={
            "name": "Copy", "positions": [], "annotations": annotations[:16],
        })).status_code == 409
        assert len((await client.get("/export")).json()["layouts"][0]["annotations"]) == 17


async def test_qa_pro_portability_and_free_atomic_refusal(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "qa-free@example.com", delivered)
        user = await signup(target, "qa-pro@example.com", delivered)
        snapshot = (await export_graph(source, factory)).json()
        snapshot["layouts"][0]["annotations"] = [label() for _ in range(16)]
        preview = (await target.post("/restore/preview", json=snapshot)).json()
        assert preview["eligibility"]["allowed"] is False
        assert preview["eligibility"]["violations"][0]["resource"] == "annotations_per_layout"
        for url in ("/import", "/restore?confirmed=true"):
            assert (await target.post(url, json=snapshot)).status_code == 409
        assert (await target.get("/export")).json()["nodes"] == []
        async with factory.begin() as session:
            await auth.manage_entitlements(SimpleNamespace(
                action="grant-pro", user_id=user, source="manual", until=None,
            ), session)
        assert (await target.post("/import", json=snapshot)).status_code == 201
        assert (await target.post("/restore?confirmed=true", json=snapshot)).status_code == 200
