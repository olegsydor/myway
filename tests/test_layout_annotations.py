"""Stage 15 persistence: real PostgreSQL constraints, snapshots and rollback."""
from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Layout, LayoutAnnotation, LayoutNodePosition, Node, User
from app.dependencies.auth import get_current_user
from app.main import app
from tests.test_layouts_api import graph, create, snapshot  # noqa: F401
from tests.test_layout_models import seed


def rectangle(**changes):
    return dict(id=str(uuid4()), kind="rectangle", x=-1.234567890123, y=2,
                width=120, height=80, color="blue", fill="light", border="normal", **changes)


def label():
    return dict(id=str(uuid4()), kind="text", x=3, y=-4, text="  Hello\nСвіт 🌍  ",
                color="gray", size="medium")


@pytest.mark.asyncio
async def test_workspace_lifecycle(client, graph, db_session):
    legacy = await create(client, graph)
    assert legacy["annotations"] == []
    annotations = [label(), rectangle(), label()]
    saved = await create(client, graph, "Annotated", annotations=annotations)
    assert saved["annotations"] == annotations
    copy = await create(client, graph, "Copy", annotations=annotations)
    path = f'/layouts/{saved["id"]}'
    changed = deepcopy(annotations[::-1])
    changed[0]["text"] = "Changed"
    result = await client.put(path+'/workspace', json={**snapshot(graph, 55), "annotations": changed})
    assert result.status_code == 200, result.text
    accepted = result.json()
    assert accepted["annotations"] == changed
    assert accepted["positions"] == snapshot(graph, 55)["positions"]
    assert accepted["updated_at"] > saved["updated_at"]
    assert (await client.get(path)).json() == accepted
    assert (await client.get(f'/layouts/{copy["id"]}')).json() == copy
    response = await client.put(path+'/positions', json=snapshot(graph, 100))
    assert response.status_code == 200
    assert response.json()["annotations"] == changed
    assert (await client.patch(path, json={"name": "Renamed", "is_default": True})).status_code == 200
    assert (await client.get(path)).json()["annotations"] == changed
    # Graph deletion cascades positions only.
    await db_session.execute(delete(Node).where(Node.id == graph["node_ids"][0]))
    await db_session.commit()
    assert (await client.get(path)).json()["annotations"] == changed
    assert (await client.delete(f'/layouts/{copy["id"]}')).status_code == 204
    assert not (await db_session.execute(select(LayoutAnnotation).where(
        LayoutAnnotation.layout_id == copy["id"]))).scalars().all()
    assert (await client.put(path+'/workspace', json={"positions": [], "annotations": []})).json()["annotations"] == []


INVALID = [
    {"id": "bad"}, {"id": True}, {"kind": "ellipse"}, {"x": "2"}, {"x": True},
    {"x": float("nan")}, {"y": float("inf")}, {"width": 0}, {"height": -1},
    {"width": float("inf")}, {"color": "pink"}, {"fill": "heavy"},
    {"border": "wide"}, {"node_id": 1}, {"text": "forbidden"}, {"size": "large"},
]


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", INVALID)
async def test_strict_rectangle_validation(client, graph, changes):
    import json
    saved = await create(client, graph, annotations=[rectangle()])
    bad = rectangle()
    bad.update(changes)
    response = await client.put(f'/layouts/{saved["id"]}/workspace',
        content=json.dumps({**snapshot(graph, 99), "annotations": [bad]}),
        headers={"Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"text": ""}, {"text": " \n\t\u00a0"}, {"text": "я"*2001}, {"text": 123},
    {"size": "huge"}, {"width": 2}, {"fill": "none"}, {"border": "thin"},
])
async def test_strict_text_validation(client, graph, changes):
    bad = label()
    bad.update(changes)
    response = await client.post('/layouts', json={"name": "Bad", **snapshot(graph), "annotations": [bad]})
    assert response.status_code == 422, response.text
    assert (await client.get('/layouts')).json() == []


@pytest.mark.asyncio
async def test_snapshot_validation_and_limits(client, graph):
    saved = await create(client, graph, annotations=[rectangle()])
    path = f'/layouts/{saved["id"]}'
    duplicate = rectangle()
    equivalent = dict(duplicate, id=str(UUID(duplicate["id"])).upper())
    for annotations in ([duplicate, equivalent], [label() for _ in range(2001)]):
        assert (await client.put(path+'/workspace', json={**snapshot(graph), "annotations": annotations})).status_code == 422
    assert (await client.put(path+'/workspace', json=snapshot(graph))).status_code == 422
    assert (await client.put(path+'/workspace', json={"positions": [], "annotations": []})).status_code == 409
    assert (await client.get(path)).json() == saved
    boundary = label()
    boundary["text"] = "я"*2000
    assert (await client.put(path+'/workspace', json={**snapshot(graph), "annotations": [boundary]*2000})).status_code == 422
    annotations = [dict(boundary, id=str(uuid4())) for _ in range(2000)]
    response = await client.put(path+'/workspace', json={**snapshot(graph), "annotations": annotations})
    assert response.status_code == 200, response.text
    assert response.json()["annotations"] == annotations


@pytest.mark.asyncio
async def test_workspace_tenant_isolation(client, graph):
    saved = await create(client, graph, annotations=[rectangle()])
    app.dependency_overrides[get_current_user] = lambda: User(id=graph["user_ids"][1])
    response = await client.put(f'/layouts/{saved["id"]}/workspace',
        json={"positions": [], "annotations": [label()]})
    assert response.status_code == 404
    assert (await client.get(f'/layouts/{saved["id"]}')).status_code == 404
    own = await client.post('/layouts', json={"name": "Own", "positions": [
        {"node_id": graph["node_ids"][1], "x": 0, "y": 0}], "annotations": saved["annotations"]})
    assert own.status_code == 201
    app.dependency_overrides[get_current_user] = lambda: User(id=graph["user_ids"][0])
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["positions", "annotations", "detail", "constraint", "commit"])
async def test_atomic_workspace_rollback(client, graph, db_session, monkeypatch, failure):
    from app.repositories import layout as repository
    saved = await create(client, graph, annotations=[rectangle(), label()])
    path = f'/layouts/{saved["id"]}'
    target = {"positions": "write_positions", "annotations": "write_annotations",
              "detail": "layout_detail", "constraint": "write_annotations", "commit": "commit"}[failure]
    owner = db_session if failure == "commit" else repository
    original = getattr(owner, target)

    async def fail(*args, **kwargs):
        if failure != "commit":
            await original(*args, **kwargs)
        if failure == "constraint":
            await db_session.execute(text("UPDATE layout_annotations SET width = -1 WHERE kind = 'rectangle'"))
        raise RuntimeError("Injected failure")

    with monkeypatch.context() as patch:
        patch.setattr(owner, target, fail)
        if failure == "constraint":
            response = await client.put(path+'/workspace', json={**snapshot(graph, 99), "annotations": [rectangle()]})
            assert response.status_code == 409
        else:
            with pytest.raises(RuntimeError, match="Injected failure"):
                await client.put(path+'/workspace', json={**snapshot(graph, 99), "annotations": [rectangle()]})
    assert (await client.get(path)).json() == saved


@pytest.mark.asyncio
async def test_atomic_create_rollback(client, graph, monkeypatch):
    from app.repositories import layout as repository
    saved = await create(client, graph, annotations=[rectangle()])
    original = repository.write_annotations

    async def fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("Injected failure")

    with monkeypatch.context() as patch:
        patch.setattr(repository, 'write_annotations', fail)
        with pytest.raises(RuntimeError):
            await create(client, graph, "Fail", is_default=True, annotations=[label()])
    assert len((await client.get('/layouts')).json()) == 1
    assert (await client.get(f'/layouts/{saved["id"]}')).json() == saved


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"x": float("nan")}, {"y": float("-inf")}, {"width": float("inf")},
    {"width": 0}, {"height": -1}, {"width": None}, {"kind": "ellipse"},
    {"text": "forbidden"}, {"size": "large"}, {"fill": None}, {"border": "wide"},
    {"color": "pink"}, {"order_index": -1}, {"order_index": 2000},
    {"kind": "text", "width": None, "height": None, "fill": None, "border": None, "size": "small", "text": " \n\t"},
    {"kind": "text", "width": None, "height": None, "fill": None, "border": None, "size": "small", "text": "я"*2001},
])
async def test_database_constraints(db_session, changes):
    users, node, layout = await seed(db_session)
    values = rectangle()
    values["annotation_id"] = UUID(values.pop("id"))
    values.update(user_id=users[0].id, layout_id=layout.id, order_index=0)
    values.update(changes)
    db_session.add(LayoutAnnotation(**values))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
@pytest.mark.parametrize("violation", ["owner", "duplicate_id", "duplicate_order"])
async def test_database_owner_and_unique_constraints(db_session, violation):
    users, _, layout = await seed(db_session)
    values = rectangle()
    values["annotation_id"] = UUID(values.pop("id"))
    values.update(user_id=users[0].id, layout_id=layout.id, order_index=0)
    if violation == "owner":
        values["user_id"] = users[1].id
    else:
        db_session.add(LayoutAnnotation(**values))
        await db_session.commit()
        values["order_index" if violation == "duplicate_id" else "annotation_id"] = 1 if violation == "duplicate_id" else uuid4()
    db_session.add(LayoutAnnotation(**values))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_migration_upgrade_downgrade_preserves_positions(db_session, test_engine):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    spec = importlib.util.spec_from_file_location('annotations_migration', Path(
        'alembic/versions/d15a01e4b901_add_layout_annotations.py'))
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    users, node, layout = await seed(db_session)
    owner_id, node_id, layout_id = users[0].id, node.id, layout.id
    db_session.add(LayoutNodePosition(user_id=owner_id, layout_id=layout_id, node_id=node_id, x=1.25, y=-2.5))
    await db_session.commit()

    async def migrate(action):
        async with test_engine.begin() as connection:
            def run(sync_connection):
                with Operations.context(MigrationContext.configure(sync_connection)):
                    action()
            await connection.run_sync(run)

    # Remove only the new table to represent the c12 baseline schema.
    await migrate(migration.downgrade)
    for _ in range(2):
        await migrate(migration.upgrade)
        assert (await db_session.execute(select(LayoutAnnotation))).scalars().all() == []
        values = rectangle()
        values['annotation_id'] = UUID(values.pop('id'))
        db_session.add(LayoutAnnotation(user_id=owner_id, layout_id=layout_id, order_index=0, **values))
        await db_session.commit()
        await migrate(migration.downgrade)
        rows = (await db_session.execute(select(LayoutNodePosition))).scalars().all()
        assert [(p.layout_id, p.node_id, p.x, p.y) for p in rows] == [(layout_id, node_id, 1.25, -2.5)]
        await db_session.commit()
    # Leave the metadata-backed fixture schema intact for teardown.
    await migrate(migration.upgrade)


@pytest.mark.asyncio
async def test_workspace_validates_node_set_once(client, graph, monkeypatch):
    from app.repositories import layout as repository
    saved = await create(client, graph)
    original = repository.validate_snapshot
    calls = []

    async def track(*args, **kwargs):
        calls.append(1)
        await original(*args, **kwargs)

    monkeypatch.setattr(repository, 'validate_snapshot', track)
    response = await client.put(f'/layouts/{saved["id"]}/workspace',
        json={**snapshot(graph), "annotations": [rectangle(), label()]})
    assert response.status_code == 200
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_database_unicode_whitespace_rejected(db_session):
    users, _, layout = await seed(db_session)
    values = label()
    values['annotation_id'] = UUID(values.pop('id'))
    values['text'] = '\u00a0\u2003\u202f\u3000'
    db_session.add(LayoutAnnotation(user_id=users[0].id, layout_id=layout.id, order_index=0, **values))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
