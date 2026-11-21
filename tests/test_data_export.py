from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import update

from app.models import EdgeType, Layout, NodeType
from app.repositories import data_export
from tests.test_auth_lifecycle import real_clients, signup


@pytest.mark.asyncio
async def test_export_is_complete_and_scoped_to_signed_in_account(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        assert (await a.get("/export")).status_code == 401
        await signup(a, "export-a@example.com", delivered)
        other_id = await signup(b, "export-b@example.com", delivered)

        empty = (await a.get("/export")).json()
        assert set(empty) == {"schema_version", "exported_at", "nodes", "edges", "layouts"}
        assert empty["schema_version"] == 2
        exported_at = datetime.fromisoformat(empty["exported_at"].replace("Z", "+00:00"))
        assert exported_at.utcoffset().total_seconds() == 0
        assert empty["nodes"] == empty["edges"] == empty["layouts"] == []
        assert (await a.get("/export", headers={"X-CSRF-Token": "invalid"})).status_code == 403

        async with factory() as session:
            node_type = NodeType(code="person", name="Person")
            edge_type = EdgeType(code="knows", name="Knows")
            session.add_all([node_type, edge_type])
            await session.commit()

        async def populate(client, label):
            async def post(path, body):
                response = await client.post(path, json=body)
                assert response.status_code == 201, response.text
                return response.json()

            start, end = [
                await post("/nodes", {
                    "node_type_id": node_type.id, "display_name": f"{label} {suffix}",
                    "description": "опис", "properties": {"nested": [1, None]},
                })
                for suffix in ("start", "end")
            ]
            edge = await post("/edges", {
                "source_node_id": start["id"], "target_node_id": end["id"],
                "edge_type_id": edge_type.id, "properties": {"weight": 2},
            })
            annotations = [
                {"id": str(uuid4()), "kind": "text", "x": 3, "y": -4,
                 "color": "blue", "text": label, "size": "large"},
                {"id": str(uuid4()), "kind": "rectangle", "x": 0, "y": 9,
                 "color": "gray", "width": 50, "height": 20, "fill": "none", "border": "thin"},
            ]
            positions = [
                {"node_id": start["id"], "x": 1, "y": 2},
                {"node_id": end["id"], "x": -2.5, "y": 0},
            ]
            layout = await post("/layouts", {
                "name": f"{label} layout", "positions": positions,
                "annotations": annotations,
            })
            blank = await post("/layouts", {"name": f"{label} blank", "positions": positions})
            return start, end, edge, layout, blank

        own = await populate(a, "Мій граф")
        other = await populate(b, "Other tenant")

        # Commit a layout change after the export has read its graph. Both reads
        # must still reflect the state from the start of that snapshot.
        original_graph = data_export.get_graph_data

        async def graph_then_update(session, *, user_id):
            result = await original_graph(session, user_id=user_id)
            async with factory.begin() as writer:
                await writer.execute(update(Layout).where(Layout.id == own[3]["id"]).values(name="Changed"))
            return result

        with monkeypatch.context() as patch:
            patch.setattr(data_export, "get_graph_data", graph_then_update)
            response = await a.get("/export", params={"user_id": other_id})

        assert response.status_code == 200, response.text
        assert response.headers["content-type"] == "application/json"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["content-disposition"].startswith('attachment; filename="my-way-export-')
        result = response.json()
        assert [node["id"] for node in result["nodes"]] == [own[0]["id"], own[1]["id"]]
        assert result["nodes"][0]["type"] == "person"
        assert result["nodes"][0]["description"] == "опис"
        assert result["nodes"][0]["properties"] == {"nested": [1, None]}
        assert len(result["edges"]) == 1
        edge = result["edges"][0]
        assert (edge["id"], edge["type"], edge["source_node_id"], edge["target_node_id"]) == (
            own[2]["id"], "knows", own[0]["id"], own[1]["id"],
        )
        assert edge["properties"] == {"weight": 2}
        assert result["layouts"] == [own[3], own[4]]
        assert result["layouts"][0]["name"] == "Мій граф layout"
        assert "user_id" not in result["nodes"][0]
        assert "user_id" not in edge
        assert "Other tenant" not in response.text
        assert (await a.get("/export")).json()["layouts"][0]["name"] == "Changed"
        assert [row["id"] for row in (await b.get("/export")).json()["layouts"]] == [
            other[3]["id"], other[4]["id"],
        ]
