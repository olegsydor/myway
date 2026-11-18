"""Synthetic data and real API checks used only by the isolated recovery drill."""

import asyncio
from email import policy
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import sys
import traceback
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.database import engine
from app.main import app
from tests.test_auth_lifecycle import PASSWORD, login, register
from tests.test_data_import import post


OWNER = "backup-owner@example.com"
OTHER = "backup-other@example.com"


async def signup(client, email):
    assert (await register(client, email)).status_code == 202
    mail = next(
        message for message in Path(get_settings().mail_sink_path).glob("*.eml")
        if f"To: {email}" in message.read_text()
    )
    message = BytesParser(policy=policy.default).parsebytes(mail.read_bytes())
    token = message.get_body().get_content().split("/#verify-email/")[1].split()[0]
    assert (await client.post("/auth/email/verify", json={
        "token": token, "password": PASSWORD,
    })).status_code == 204
    assert (await login(client, email)).status_code == 200


def client():
    return AsyncClient(transport=ASGITransport(app), base_url="http://test",
                       headers={"Origin": "http://localhost:5173"})


async def export(client):
    response = await client.get("/export")
    assert response.status_code == 200
    payload = response.json()
    del payload["exported_at"]
    return payload


async def seed():
    async with engine.connect() as conn:
        node_type = (await conn.execute(text("SELECT min(id) FROM node_types"))).scalar_one()
        edge_type = (await conn.execute(text("SELECT min(id) FROM edge_types"))).scalar_one()
    async with client() as owner, client() as other:
        for user, email in ((owner, OWNER), (other, OTHER)):
            user.headers["X-CSRF-Token"] = (await user.get("/auth/csrf")).json()["csrf_token"]
            await signup(user, email)
        nodes = [
            await post(owner, "/nodes", {"node_type_id": node_type, "display_name": name})
            for name in ("Перший", "Second")
        ]
        await post(other, "/nodes", {"node_type_id": node_type, "display_name": "Other tenant"})
        await post(owner, "/edges", {
            "source_node_id": nodes[0]["id"], "target_node_id": nodes[1]["id"],
            "edge_type_id": edge_type, "properties": {"weight": 2},
        })
        layout = await post(owner, "/layouts", {
            "name": "Recovered workspace", "positions": [
                {"node_id": node["id"], "x": -2.25, "y": 8} for node in nodes
            ],
            "annotations": [
                {"kind": "text", "id": str(uuid4()), "x": 1, "y": 2,
                 "color": "green", "text": "Примітка", "size": "large"},
                {"kind": "rectangle", "id": str(uuid4()), "x": 2, "y": 3, "color": "purple",
                 "width": 20.1, "height": 30, "fill": "medium", "border": "thick"},
            ],
        })
        return {
            "exports": [await export(owner), await export(other)],
            "cookies": dict(owner.cookies),
            "node_type": node_type,
            "layout": layout["id"],
            "node": nodes[0]["id"],
            "users": [(await account.get("/auth/me")).json()["user"]["id"] for account in (owner, other)],
        }


async def verify_constraints():
    # PostgreSQL can rewrite array casts in CHECK definitions on dump/restore.
    # Exercise the restored checks and a cross-tenant foreign key directly.
    for statement, constraint in (
        ("UPDATE users SET status = 'invalid'", "ck_users_status"),
        ("UPDATE layout_annotations SET color = 'invalid'", "ck_annotations_color"),
        ("UPDATE layout_annotations SET size = 'invalid' WHERE kind = 'text'", "ck_annotations_kind_fields"),
        ("UPDATE edges SET target_node_id = (SELECT max(id) FROM nodes)", "fk_edges_target_node_owner"),
    ):
        try:
            async with engine.begin() as conn:
                await conn.execute(text(statement))
                raise AssertionError(f"{constraint} accepted an invalid row")
        except IntegrityError as error:
            assert error.orig.__cause__.constraint_name == constraint


async def verify(expected):
    await verify_constraints()
    async with client() as owner, client() as other, client() as prior_session:
        assert (await owner.get("/health")).json()["database"] == "ok"
        assert (await owner.get("/graph")).status_code == 401
        prior_session.cookies.update(expected["cookies"])
        assert (await prior_session.get("/auth/me")).json()["user"]["id"] == expected["users"][0]
        for index, (account, email) in enumerate(((owner, OWNER), (other, OTHER))):
            assert (await login(account, email, "wrong password")).status_code == 401
            assert (await login(account, email)).status_code == 200
            assert (await account.get("/auth/me")).json()["user"]["id"] == expected["users"][index]
            assert await export(account) == expected["exports"][index]
        layout_path = f"/layouts/{expected['layout']}"
        assert (await other.get(layout_path)).status_code == 404
        assert (await other.get(f"/nodes/{expected['node']}")).status_code == 404
        graph = (await owner.get("/graph")).json()
        assert len(graph["nodes"]) == 2 and len(graph["edges"]) == 1
        layout = (await owner.get(layout_path)).json()
        assert len(layout["positions"]) == len(layout["annotations"]) == 2
        node = await post(owner, "/nodes", {"node_type_id": expected["node_type"], "display_name": "After restore"})
        assert node["id"] not in {previous["id"] for previous in graph["nodes"]}
        layout["positions"].append({"node_id": node["id"], "x": 42, "y": 19})
        saved = await owner.put(f"{layout_path}/workspace", json={
            "positions": layout["positions"], "annotations": layout["annotations"],
        })
        assert saved.status_code == 200
        reloaded = (await owner.get(layout_path)).json()
        assert reloaded["positions"] == saved.json()["positions"]
        assert reloaded["annotations"] == layout["annotations"]


async def fingerprint():
    """Compare SQL data and schema before the test API changes either database."""
    state = {}
    async with engine.connect() as conn:
        tables = await conn.execute(text("""
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
        """))
        quote = conn.dialect.identifier_preparer.quote_identifier
        for name in tables.scalars():
            rows = await conn.execute(text(
                f'SELECT to_jsonb(t)::text FROM public.{quote(name)} t '
                'ORDER BY to_jsonb(t)::text COLLATE "C"'
            ))
            encoded = json.dumps(list(rows.scalars())).encode()
            state[name] = hashlib.sha256(encoded).hexdigest()
        for name, query in {
            "constraints": """SELECT conrelid::regclass::text, conname, contype::text, convalidated,
                                     CASE WHEN contype <> 'c' THEN pg_get_constraintdef(oid) END
                              FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2""",
            "indexes": """SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexdef""",
            "sequences": """SELECT * FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename""",
        }.items():
            state[name] = [list(row) for row in await conn.execute(text(query))]
    return state


async def main(action):
    try:
        if action == "verify":
            await verify(json.load(sys.stdin))
        else:
            print(json.dumps(await (seed() if action == "seed" else fingerprint())), flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main(sys.argv[1]))
    except Exception as error:
        # Only synthetic fixture diagnostics are emitted, without request or row contents.
        frames = traceback.extract_tb(error.__traceback__)
        frame = next((entry for entry in reversed(frames) if entry.filename == __file__), None)
        line = frame.lineno if frame else 0
        sys.exit(f"Fixture failure on line {line} ({type(error).__name__}).")
