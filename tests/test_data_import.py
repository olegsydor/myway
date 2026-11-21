import asyncio
from copy import deepcopy
from uuid import uuid4

import pytest

from app.models import EdgeType, NodeType
from app.repositories import data_import
from tests.test_auth_lifecycle import real_clients, signup


async def post(client, path, payload):
    response = await client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def create_types(factory):
    async with factory.begin() as session:
        node_type = NodeType(code="person", name="Person")
        edge_type = EdgeType(code="knows", name="Knows")
        session.add_all([node_type, edge_type])
    return node_type.id, edge_type.id


async def export_graph(source, factory):
    node_type, edge_type = await create_types(factory)
    first = await post(source, "/nodes", {
        "node_type_id": node_type, "display_name": "Перший",
        "description": "Опис", "properties": {"nested": [1, None, {"key": True}]},
    })
    second = await post(source, "/nodes", {"node_type_id": node_type, "display_name": "Second"})
    positions = [
        {"node_id": first["id"], "x": -1, "y": 2.25},
        {"node_id": second["id"], "x": 0, "y": -10},
    ]
    annotations = [
        {"kind": "rectangle", "id": str(uuid4()), "x": 2, "y": 3, "color": "purple",
         "width": 20.1, "height": 30, "fill": "medium", "border": "thick"},
        {"kind": "text", "id": str(uuid4()), "x": 1, "y": -5, "color": "green",
         "text": "Примітка", "size": "large"},
    ]
    await post(source, "/layouts", {"name": "Earlier layout", "positions": positions})
    third = await post(source, "/nodes", {"node_type_id": node_type, "display_name": "Third"})
    await post(source, "/edges", {
        "edge_type_id": edge_type, "source_node_id": second["id"], "target_node_id": third["id"],
        "description": "Dependency", "properties": {"weight": 2},
    })
    await post(source, "/layouts", {
        "name": "Main", "is_default": True,
        "positions": positions + [{"node_id": third["id"], "x": 3, "y": 4}],
        "annotations": annotations,
    })
    return await source.get("/export")


async def create_initial_layout(client, **snapshot):
    return await post(client, "/layouts", {"name": "Main", "is_initial": True, "positions": [], **snapshot})


async def assert_initial_only(client, layout):
    assert (await client.get("/layouts")).json() == [
        {key: value for key, value in layout.items() if key not in ("positions", "annotations")}
    ]
    result = (await client.get("/export")).json()
    assert result["nodes"] == result["edges"] == []
    assert result["layouts"][0]["positions"] == result["layouts"][0]["annotations"] == []


@pytest.mark.asyncio
async def test_export_import_export_preserves_contents_with_new_ids(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        assert (await target.post("/import", json={})).status_code == 401
        source_id = await signup(source, "source@example.com", delivered)
        await signup(target, "destination@example.com", delivered)
        exported = await export_graph(source, factory)
        original = exported.json()
        node = await post(target, "/nodes", {
            "node_type_id": (await source.get("/node-types")).json()[0]["id"],
            "display_name": "Removed before import",
        })
        initial = await create_initial_layout(target, positions=[{"node_id": node["id"], "x": 1, "y": 2}])
        assert (await target.post("/import", content=exported.content)).status_code == 409
        assert (await target.delete(f"/nodes/{node['id']}")).status_code == 204
        assert (await target.post("/import", content=exported.content,
                                  headers={"X-CSRF-Token": "wrong"})).status_code == 403
        response = await target.post("/import", params={"user_id": source_id}, content=exported.content)
        assert response.status_code == 201, response.text
        assert response.json() == {"nodes": 3, "edges": 1, "layouts": 2}
        assert (await target.get(f"/layouts/{initial['id']}")).status_code == 404
        restored = (await target.get("/export")).json()
        assert restored["schema_version"] == original["schema_version"]

        mapping = {}
        for key in ("nodes", "edges", "layouts"):
            assert {row["id"] for row in original[key]}.isdisjoint(row["id"] for row in restored[key])
            for before, after in zip(original[key], restored[key], strict=True):
                expected = {**before, "id": after["id"]}
                if key == "nodes":
                    mapping[before["id"]] = after["id"]
                    assert (await source.get(f"/nodes/{after['id']}")).status_code == 404
                elif key == "edges":
                    expected["source_node_id"] = mapping[before["source_node_id"]]
                    expected["target_node_id"] = mapping[before["target_node_id"]]
                else:
                    expected["positions"] = [
                        {**position, "node_id": mapping[position["node_id"]]}
                        for position in before["positions"]
                    ]
                    for annotation, restored_annotation in zip(
                        expected["annotations"], after["annotations"], strict=True,
                    ):
                        assert annotation["id"] != restored_annotation["id"]
                    expected["annotations"] = [
                        {**annotation, "id": restored_annotation["id"]}
                        for annotation, restored_annotation in zip(before["annotations"], after["annotations"])
                    ]
                assert after == expected

        for client, expected in ((source, original), (target, restored)):
            assert (await client.post("/import", content=exported.content)).status_code == 409
            latest = (await client.get("/export")).json()
            assert {**latest, "exported_at": expected["exported_at"]} == expected


@pytest.mark.asyncio
async def test_validates_payload_before_writing_and_rolls_back_failed_restore(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "source@example.com", delivered)
        await signup(target, "destination@example.com", delivered)
        original = (await export_graph(source, factory)).json()
        initial = await create_initial_layout(target)

        for invalid_json in (b"{", b'{"schema_version":1,"schema_version":1}', b"[]"):
            assert (await target.post("/import", content=invalid_json)).status_code == 422

        def add_cycle(data):
            edge = data["edges"][0]
            data["edges"].append({
                **edge, "id": edge["id"] + 1, "source_node_id": edge["target_node_id"],
                "target_node_id": edge["source_node_id"],
            })

        def duplicate_edge(data):
            edge = data["edges"][0]
            data["edges"].append({**edge, "id": edge["id"] + 1})

        invalid_documents = (
            lambda data: data.update(schema_version=3),
            lambda data: data.update(schema_version=True),
            lambda data: data.pop("schema_version"),
            lambda data: data["nodes"][0].update(id="1"),
            lambda data: data["nodes"][0].update(user_id=1),
            lambda data: data["nodes"][0].update(type="unrecognized"),
            lambda data: data["nodes"][0].update(properties={"nested": ["\x00"]}),
            lambda data: data["nodes"].append(data["nodes"][0]),
            lambda data: data["edges"][0].update(type="unrecognized"),
            lambda data: data["edges"][0].update(target_node_id=98765),
            duplicate_edge,
            add_cycle,
            lambda data: data["layouts"][0].update(name="MAIN"),
            lambda data: data["layouts"][0].update(is_default=True),
            lambda data: data["layouts"][0]["positions"][0].update(node_id=98765),
            lambda data: data["layouts"][0]["positions"].append(data["layouts"][0]["positions"][0]),
            lambda data: data["layouts"][1]["annotations"][0].update(width=0),
            lambda data: data["layouts"][1]["annotations"][1].update(text=" "),
            lambda data: data["layouts"][1]["annotations"].append(data["layouts"][1]["annotations"][0]),
        )
        for invalidate in invalid_documents:
            invalid = deepcopy(original)
            invalidate(invalid)
            response = await target.post("/import", json=invalid)
            assert response.status_code == 422, response.text
            await assert_initial_only(target, initial)

        write_annotations = data_import.write_annotations

        async def fail_after_write(*args):
            await write_annotations(*args)
            if args[-1].annotations:
                raise ValueError("Simulated late failure")

        with monkeypatch.context() as patch:
            patch.setattr(data_import, "write_annotations", fail_after_write)
            assert (await target.post("/import", json=original)).status_code == 422
        await assert_initial_only(target, initial)
        assert (await target.post("/import", json=original)).status_code == 201


@pytest.mark.asyncio
async def test_concurrent_import_export_and_writes_are_serialized(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "source@example.com", delivered)
        await signup(target, "destination@example.com", delivered)
        exported = await export_graph(source, factory)
        initial = await create_initial_layout(target)
        entered = asyncio.Event()
        release = asyncio.Event()
        restore = data_import.write_annotations

        async def paused_restore(*args):
            entered.set()
            await release.wait()
            await restore(*args)

        with monkeypatch.context() as patch:
            patch.setattr(data_import, "write_annotations", paused_restore)
            first = asyncio.create_task(target.post("/import", content=exported.content))
            await asyncio.wait_for(entered.wait(), timeout=5)
            second = asyncio.create_task(target.post("/import", content=exported.content))
            node_type = (await source.get("/node-types")).json()[0]["id"]
            node = asyncio.create_task(target.post("/nodes", json={
                "node_type_id": node_type, "display_name": "Created concurrently",
            }))
            save = asyncio.create_task(target.put(
                f"/layouts/{initial['id']}/workspace", json={"positions": [], "annotations": []},
            ))
            export = asyncio.create_task(target.get("/export"))
            try:
                done, _ = await asyncio.wait({second, node, save, export}, timeout=0.1)
                assert not done
            finally:
                release.set()
            results = await asyncio.wait_for(asyncio.gather(first, second, node, save, export), timeout=10)

        assert [result.status_code for result in results] == [201, 409, 201, 404, 200]
        concurrent_export = results[-1].json()
        assert len(concurrent_export["nodes"]) in (3, 4)
        assert (len(concurrent_export["edges"]), len(concurrent_export["layouts"])) == (1, 2)
        restored = (await target.get("/export")).json()
        assert (len(restored["nodes"]), len(restored["edges"]), len(restored["layouts"])) == (4, 1, 2)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["custom_main", "additional", "annotation", "renamed", "empty_account"])
async def test_import_destination_regressions(test_engine, monkeypatch, kind):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "source@example.com", delivered)
        await signup(target, "destination@example.com", delivered)
        exported = await export_graph(source, factory)
        if kind == "empty_account":
            assert (await target.post("/import", content=exported.content)).status_code == 201
            return

        if kind == "custom_main":
            await post(target, "/layouts", {"name": "Main", "positions": []})
        elif kind == "annotation":
            await create_initial_layout(target, annotations=[{
                "kind": "text", "id": str(uuid4()), "x": 1, "y": 2, "color": "green",
                "text": "Keep this", "size": "small",
            }])
        else:
            layout = await create_initial_layout(target)
            if kind == "additional":
                await post(target, "/layouts", {"name": "Empty layout", "positions": []})
            else:
                for name in ("Custom", "Main"):
                    assert (await target.patch(f"/layouts/{layout['id']}", json={"name": name})).status_code == 200

        before = (await target.get("/export")).json()
        response = await target.post("/import", content=exported.content)
        assert response.status_code == 409
        assert response.json()["detail"] == "import_requires_empty_account"
        after = (await target.get("/export")).json()
        assert {**after, "exported_at": before["exported_at"]} == before


@pytest.mark.asyncio
async def test_legacy_import_and_shape_metadata_restore(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (source, target, factory, delivered):
        await signup(source, "shape-source@example.com", delivered)
        await signup(target, "shape-target@example.com", delivered)
        legacy = (await export_graph(source, factory)).json()
        assert legacy["schema_version"] == 2
        legacy["schema_version"] = 1
        assert (await target.post("/import", json=legacy)).status_code == 201

        layout = legacy["layouts"][1]
        rectangle, text = layout["annotations"]
        rectangle = {**rectangle, "name": "  Роки ", "description": "First\nSecond"}
        ellipse = {**rectangle, "id": str(uuid4()), "kind": "ellipse", "name": None}
        response = await source.put(f"/layouts/{layout['id']}/workspace", json={
            "positions": layout["positions"], "annotations": [ellipse, rectangle, text],
        })
        assert response.status_code == 200, response.text
        shapes = response.json()["annotations"]
        assert "name" not in shapes[0] and shapes[1]["name"] == "Роки"
        exported = (await source.get("/export")).json()
        assert exported["layouts"][1]["annotations"] == shapes
        preview = await target.post("/restore/preview", json=exported)
        assert preview.status_code == 200 and preview.json()["annotations"] == 3
        assert sum(len(item["annotations"]) for item in (await target.get("/export")).json()["layouts"]) == 2
        response = await target.post("/restore?confirmed=true", json=exported)
        assert response.status_code == 200, response.text
        restored = (await target.get("/export")).json()["layouts"][1]["annotations"]
        assert len(restored) == 3
        for before, after in zip(shapes, restored, strict=True):
            assert after["id"] != before["id"]
            assert after == {**before, "id": after["id"]}
