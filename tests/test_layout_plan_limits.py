import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.commands.auth import manage_entitlements
from tests.test_auth_lifecycle import login, real_clients, signup
from tests.test_data_import import export_graph


def layout(name):
    return {"name": name, "positions": [], "annotations": []}


async def grant(factory, user):
    async with factory() as session:
        await manage_entitlements(SimpleNamespace(
            action="grant-pro", user_id=user, source="manual", until=None,
        ), session)


@pytest.mark.asyncio
@pytest.mark.parametrize(("plan", "limit"), [("free", 3), ("pro", 15)])
async def test_layout_limit_serializes_concurrent_creation(test_engine, monkeypatch, plan, limit):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        address = f"qa-{plan}@example.com"
        user = await signup(a, address, delivered)
        assert (await login(b, address)).status_code == 200
        if plan == "pro":
            await grant(factory, user)
        assert (await a.post("/layouts", json={**layout("Main"), "is_initial": True})).status_code == 201
        for index in range(1, limit - 1):
            assert (await a.post("/layouts", json=layout(f"Layout {index}"))).status_code == 201
        responses = await asyncio.wait_for(asyncio.gather(
            a.post("/layouts", json=layout("First contender")),
            b.post("/layouts", json=layout("Second contender")),
        ), timeout=10)
        assert sorted(response.status_code for response in responses) == [201, 409]
        failure = next(response for response in responses if response.status_code == 409)
        assert failure.json()["detail"] == {
            "resource": "layouts", "code": "plan_limit_exceeded", "plan": plan,
            "limit": limit, "current": limit, "attempted": limit + 1,
        }
        entitlements = (await a.get("/auth/entitlements")).json()
        assert entitlements["limits"]["layouts"] == entitlements["usage"]["layouts"] == limit


@pytest.mark.asyncio
async def test_grandfathered_layouts_remain_editable_and_exportable(test_engine, monkeypatch, capsys):
    import json

    async with real_clients(test_engine, monkeypatch) as (client, _, factory, delivered):
        user = await signup(client, "qa-lifecycle@example.com", delivered)
        await grant(factory, user)
        grant_id = json.loads(capsys.readouterr().out)["grant_id"]
        saved = []
        for i in range(12):
            response = await client.post("/layouts", json=layout(f"Layout {i}"))
            assert response.status_code == 201
            saved.append(response.json())
        async with factory() as session:
            await manage_entitlements(SimpleNamespace(action="revoke-pro", grant_id=grant_id), session)
        assert len((await client.get("/layouts")).json()) == 12
        path = f'/layouts/{saved[1]["id"]}'
        assert (await client.put(f"{path}/positions", json={"positions": []})).status_code == 200
        assert (await client.put(f"{path}/workspace", json={"positions": [], "annotations": []})).status_code == 200
        assert (await client.patch(path, json={"name": "Edited", "is_default": True})).status_code == 200
        snapshot = (await client.get("/export")).json()
        assert len(snapshot["layouts"]) == 12
        assert (await client.post("/restore?confirmed=true", json={
            **snapshot, "layouts": snapshot["layouts"][:4],
        })).status_code == 409
        remaining = 12
        for item in saved:
            if item["id"] == saved[1]["id"]:
                continue
            if remaining == 2:
                break
            if remaining in (12, 4, 3):
                assert (await client.post("/layouts", json=layout("Still limited"))).status_code == 409
            assert (await client.delete(f'/layouts/{item["id"]}')).status_code == 204
            remaining -= 1
        assert (await client.post("/layouts", json=layout("Third layout"))).status_code == 201
        await grant(factory, user)
        assert (await client.post("/layouts", json=layout("Fourth layout"))).status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize(("plan", "limit"), [("free", 3), ("pro", 15)])
async def test_layout_snapshot_boundary_is_atomic(test_engine, monkeypatch, plan, limit):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "source@example.com", delivered)
        user = await signup(target, f"qa-{plan}@example.com", delivered)
        if plan == "pro":
            await grant(factory, user)
        snapshot = (await export_graph(source, factory)).json()
        template = snapshot["layouts"][0]
        snapshot["layouts"] = [
            {**deepcopy(template), "id": i + 1, "name": f"Layout {i}", "is_default": i == 0}
            for i in range(limit + 1)
        ]
        preview = (await target.post("/restore/preview", json=snapshot)).json()
        assert preview["layouts"] == limit + 1
        assert not preview["eligibility"]["allowed"]
        violation = preview["eligibility"]["violations"][0]
        assert (violation["resource"], violation["limit"], violation["attempted"]) == ("layouts", limit, limit + 1)
        assert (await target.post("/import", json=snapshot)).status_code == 409
        assert (await target.get("/export")).json()["layouts"] == []
        allowed = {**snapshot, "layouts": snapshot["layouts"][:limit]}
        assert (await target.post("/import", json=allowed)).status_code == 201
        before = (await target.get("/export")).json()["layouts"]
        assert (await target.post("/restore?confirmed=true", json=snapshot)).status_code == 409
        assert (await target.get("/export")).json()["layouts"] == before
        assert (await target.post("/restore?confirmed=true", json=allowed)).status_code == 200
