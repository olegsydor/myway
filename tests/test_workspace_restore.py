import asyncio
from copy import deepcopy

import pytest

from app.repositories import data_import
from tests.test_auth_lifecycle import real_clients, signup
from tests.test_data_import import export_graph, post


def workspace(response):
    result = response.json()
    result.pop("exported_at")
    return result


@pytest.mark.asyncio
async def test_restore_preview_replace_repeat_rollback_and_isolation(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        assert (await target.post("/restore/preview", json={})).status_code == 401
        source_id = await signup(source, "restore-source@example.com", delivered)
        target_id = await signup(target, "restore-target@example.com", delivered)
        original = (await export_graph(source, factory)).json()
        node_type = (await source.get("/node-types")).json()[0]["id"]
        old_node = await post(target, "/nodes", {"node_type_id": node_type, "display_name": "Old"})
        await post(target, "/layouts", {"name": "Main", "is_default": True, "positions": [
            {"node_id": old_node["id"], "x": 1, "y": 2},
        ]})
        before = workspace(await target.get("/export"))
        account = (await target.get("/auth/me")).json()
        counts = {"nodes": 3, "edges": 1, "layouts": 2, "positions": 5, "annotations": 2}
        assert (await target.post("/restore/preview", json=original)).json() == {**counts, "eligibility": {"allowed": True, "violations": []}}
        assert (await target.post("/restore?confirmed=false", json=original)).status_code == 400
        assert (await target.post("/restore?confirmed=true", json=original,
                                  headers={"X-CSRF-Token": "wrong"})).status_code == 403
        bad = deepcopy(original)
        bad["nodes"][0]["type"] = "unknown"
        for path in ("/restore/preview", "/restore?confirmed=true"):
            assert (await target.post(path, json=bad)).status_code == 422
        assert workspace(await target.get("/export")) == before

        insert = data_import.insert_workspace

        async def fail_after_insert(*args):
            await insert(*args)
            raise ValueError("Injected write failure")

        with monkeypatch.context() as patch:
            patch.setattr(data_import, "insert_workspace", fail_after_insert)
            assert (await target.post("/restore?confirmed=true", json=original)).status_code == 422
        assert workspace(await target.get("/export")) == before

        previous = before
        for _ in range(2):
            result = await target.post("/restore", params={"confirmed": "true", "user_id": source_id},
                                       json=original)
            assert result.json() == counts
            restored = workspace(await target.get("/export"))
            for key in ("nodes", "edges", "layouts"):
                assert len(restored[key]) == counts[key]
                old_ids = {row["id"] for row in original[key] + previous[key]}
                assert old_ids.isdisjoint(row["id"] for row in restored[key])
            node_map = dict(zip(
                [row["id"] for row in original["nodes"]],
                [row["id"] for row in restored["nodes"]], strict=True,
            ))
            for old, new in zip(original["edges"], restored["edges"], strict=True):
                assert new == {**old, "id": new["id"], "source_node_id": node_map[old["source_node_id"]],
                               "target_node_id": node_map[old["target_node_id"]]}
            for old, new in zip(original["layouts"], restored["layouts"], strict=True):
                assert new["positions"] == [{**p, "node_id": node_map[p["node_id"]]} for p in old["positions"]]
                assert new["annotations"] == [
                    {**a, "id": b["id"]} for a, b in zip(old["annotations"], new["annotations"], strict=True)
                ]
            previous = restored
        assert (await target.get("/auth/me")).json() == account
        assert (await target.get("/graph")).json()["user_id"] == target_id
        assert workspace(await source.get("/export")) == {k: v for k, v in original.items() if k != "exported_at"}
        empty = {**original, "nodes": [], "edges": [], "layouts": []}
        assert (await target.post("/restore?confirmed=true", json=empty)).json() == dict.fromkeys(counts, 0)
        assert workspace(await target.get("/export")) == {k: v for k, v in empty.items() if k != "exported_at"}


@pytest.mark.asyncio
async def test_concurrent_restore_export_and_writer_are_serialized(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "restore-source@example.com", delivered)
        await signup(target, "restore-target@example.com", delivered)
        original = (await export_graph(source, factory)).json()
        node_type = (await source.get("/node-types")).json()[0]["id"]
        old_node = await post(target, "/nodes", {"node_type_id": node_type, "display_name": "Old"})
        insert = data_import.insert_workspace
        deleted = asyncio.Event()
        release = asyncio.Event()

        async def pause_insert(*args):
            deleted.set()
            await release.wait()
            await insert(*args)

        monkeypatch.setattr(data_import, "insert_workspace", pause_insert)
        restore = asyncio.create_task(target.post("/restore?confirmed=true", json=original))
        await asyncio.wait_for(deleted.wait(), timeout=5)
        export = asyncio.create_task(target.get("/export"))
        stale_write = asyncio.create_task(target.patch(f"/nodes/{old_node['id']}", json={"display_name": "Stale"}))
        second_restore = asyncio.create_task(target.post("/restore?confirmed=true", json=original))
        try:
            await asyncio.sleep(0.1)
            assert not any(task.done() for task in (export, stale_write, second_restore))
            assert workspace(await source.get("/export")) == {k: v for k, v in original.items() if k != "exported_at"}
        finally:
            release.set()
            results = await asyncio.wait_for(asyncio.gather(restore, export, stale_write, second_restore), timeout=10)
        assert [r.status_code for r in results] == [200, 200, 404, 200]
        assert len(workspace(results[1])["nodes"]) == 3
