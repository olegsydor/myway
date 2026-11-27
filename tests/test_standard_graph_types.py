"""Check dictionary migrations and portability across independent PostgreSQL databases."""

from contextlib import asynccontextmanager
from copy import deepcopy
import os
import subprocess
import sys
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from tests.test_auth_lifecycle import real_clients, signup

PREVIOUS_HEAD = "a22a01e4b901"
HEAD = "a24a01e4b901"

# The product dictionary in README and the original Stage 2 documentation.
STANDARD_NODES = {
    "person": "Person", "place": "Place", "organization": "Organization",
    "skill": "Skill", "event": "Event", "project": "Project", "hobby": "Hobby",
    "story": "Story",
}
STANDARD_EDGES = {
    "knows": "Knows", "works_at": "Works at", "lives_in": "Lives in",
    "has_skill": "Has skill", "participates_in": "Participates in",
    "works_on": "Works on", "located_in": "Located in", "leads_to": "Leads to",
    "family": "Family", "pushed": "Pushed", "shared": "Shared",
}


@asynccontextmanager
async def migrated_database(revision):
    url = get_settings().database_url
    admin = create_async_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    database = f"myway_test_dictionary_{uuid4().hex}"
    try:
        async with admin.connect() as connection:
            await connection.execute(text(f"CREATE DATABASE {database}"))
        engine = create_async_engine(url.set(database=database))
        try:
            migrate(engine, "upgrade", revision)
            yield engine
        finally:
            await engine.dispose()
            async with admin.connect() as connection:
                await connection.execute(text(f"DROP DATABASE {database} WITH (FORCE)"))
    finally:
        await admin.dispose()


def migrate(engine, action, revision):
    result = subprocess.run(
        [sys.executable, "-m", "alembic", action, revision],
        env={**os.environ, "POSTGRES_DB": engine.url.database},
        capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, result.stderr


async def dictionary_ids(client, endpoint, expected):
    response = await client.get(endpoint)
    assert response.status_code == 200
    entries = response.json()
    assert [(row["code"], row["name"]) for row in entries] == list(expected.items())
    return {row["code"]: row["id"] for row in entries}


async def export_snapshot(client):
    response = await client.get("/export")
    assert response.status_code == 200
    return response.json()


def contents(snapshot):
    return {key: value for key, value in snapshot.items() if key != "exported_at"}


async def create_graph(client, person_id, knows_id):
    nodes = []
    for name in ("Alice", "Bob"):
        response = await client.post("/nodes", json={"node_type_id": person_id, "display_name": name})
        assert response.status_code == 201, response.text
        nodes.append(response.json()["id"])
    response = await client.post("/edges", json={
        "edge_type_id": knows_id, "source_node_id": nodes[0], "target_node_id": nodes[1],
    })
    assert response.status_code == 201, response.text
    response = await client.post("/layouts", json={
        "name": "Portability",
        "positions": [{"node_id": nodes[0], "x": 7, "y": 9}, {"node_id": nodes[1], "x": 11, "y": 13}],
        "annotations": [{"id": str(uuid4()), "kind": "text", "x": 1, "y": 2,
                         "text": "Keep me", "color": "gray", "size": "medium"}],
    })
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_standard_types_migrate_and_exports_are_portable(monkeypatch):
    async with migrated_database(PREVIOUS_HEAD) as source, migrated_database(HEAD) as target:
        async with source.begin() as connection:
            assert await connection.scalar(text("SELECT id FROM node_types WHERE code='person'")) is None
            assert await connection.scalar(text("SELECT id FROM edge_types WHERE code='knows'")) is None
            # Model the development ID order, distinct from the fresh database
            # where Person and Knows receive the last IDs.
            await connection.execute(text("UPDATE node_types SET id = id + 1000"))
            await connection.execute(text("UPDATE edge_types SET id = id + 1000"))
            await connection.execute(text("INSERT INTO node_types (id, code, name) VALUES (101, 'person', 'Person')"))
            await connection.execute(text("INSERT INTO edge_types (id, code, name) VALUES (201, 'knows', 'Knows')"))
        with monkeypatch.context() as patch:
            async with real_clients(source, patch) as (client, _, _, delivered):
                await signup(client, "dictionary-source@example.com", delivered)
                source_nodes = await dictionary_ids(client, "/node-types", STANDARD_NODES)
                source_edges = await dictionary_ids(client, "/edge-types", STANDARD_EDGES)
                await create_graph(client, source_nodes["person"], source_edges["knows"])
                snapshot = await export_snapshot(client)
                assert {node["type"] for node in snapshot["nodes"]} == {"person"}
                assert {edge["type"] for edge in snapshot["edges"]} == {"knows"}
                migrate(source, "upgrade", "head")
                assert await dictionary_ids(client, "/node-types", STANDARD_NODES) == source_nodes
                assert await dictionary_ids(client, "/edge-types", STANDARD_EDGES) == source_edges
                assert contents(await export_snapshot(client)) == contents(snapshot)
                migrate(source, "downgrade", PREVIOUS_HEAD)
                assert contents(await export_snapshot(client)) == contents(snapshot)
                migrate(source, "upgrade", "head")

        with monkeypatch.context() as patch:
            async with real_clients(target, patch) as (importer, restorer, _, delivered):
                target_nodes = await dictionary_ids(importer, "/node-types", STANDARD_NODES)
                target_edges = await dictionary_ids(importer, "/edge-types", STANDARD_EDGES)
                assert source_nodes["person"] == min(source_nodes.values())
                assert source_edges["knows"] == min(source_edges.values())
                assert target_nodes["person"] == max(target_nodes.values())
                assert target_edges["knows"] == max(target_edges.values())
                await signup(importer, "dictionary-import@example.com", delivered)
                await signup(restorer, "dictionary-restore@example.com", delivered)
                await create_graph(restorer, target_nodes["person"], target_edges["knows"])
                before = await export_snapshot(restorer)

                for collection, detail in (("nodes", "Unknown node type"), ("edges", "Unknown edge type")):
                    invalid = deepcopy(snapshot)
                    invalid[collection][0]["type"] = "unrecognized_cp2_type"
                    for path in ("/restore/preview", "/restore?confirmed=true"):
                        response = await restorer.post(path, json=invalid)
                        assert response.status_code == 422
                        assert response.json() == {"detail": detail}
                    assert contents(await export_snapshot(restorer)) == contents(before)

                assert (await importer.post("/import", json=snapshot)).status_code == 201
                assert (await restorer.post("/restore/preview", json=snapshot)).status_code == 200
                assert (await restorer.post("/restore?confirmed=true", json=snapshot)).status_code == 200
                for client in (importer, restorer):
                    restored = await export_snapshot(client)
                    by_id = {node["id"]: (node["display_name"], node["type"]) for node in restored["nodes"]}
                    edge, = restored["edges"]
                    assert edge["type"] == "knows"
                    assert by_id[edge["source_node_id"]] == ("Alice", "person")
                    assert by_id[edge["target_node_id"]] == ("Bob", "person")
                    layout, = restored["layouts"]
                    annotation, = layout["annotations"]
                    original, = snapshot["layouts"][0]["annotations"]
                    assert {key: value for key, value in annotation.items() if key != "id"} == {
                        key: value for key, value in original.items() if key != "id"
                    }
                    assert {
                        by_id[position["node_id"]][0]: (position["x"], position["y"])
                        for position in layout["positions"]
                    } == {"Alice": (7, 9), "Bob": (11, 13)}
