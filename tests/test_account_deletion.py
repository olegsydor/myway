import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError

from app.commands.auth import run as operator
from app.core.config import get_settings
from app.core.security import db_now
from app.models import Edge, Layout, LayoutAnnotation, LayoutNodePosition, Node, User
from app.models.auth import ActionToken, AuthSession
from tests.test_auth_lifecycle import PASSWORD, clear_limits, login, real_clients, signup
from tests.test_data_import import export_graph

DELETE = "/auth/account/deletion"
CANCEL = DELETE + "/cancel"
EMAIL = "deletion@example.com"
CREDENTIALS = {"email": EMAIL, "password": PASSWORD}
CONFIRM = {"current_password": PASSWORD}


async def pre_auth(client):
    client.headers["X-CSRF-Token"] = (await client.get("/auth/csrf")).json()["csrf_token"]


async def expire(factory, user_id):
    async with factory.begin() as session:
        await session.execute(update(User).where(User.id == user_id).values(deletion_due_at=await db_now(session)))


async def purge():
    await operator(SimpleNamespace(action="purge-deleted-accounts"))


async def owner_counts(factory, user_id):
    models = (Node, Edge, Layout, LayoutNodePosition, LayoutAnnotation, AuthSession, ActionToken)
    async with factory() as session:
        counts = []
        for model in models:
            counts.append(await session.scalar(
                select(func.count()).select_from(model).where(model.user_id == user_id)
            ))
        return counts


@pytest.mark.asyncio
async def test_pending_revokes_devices_and_tokens_and_requires_reauthentication(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        await signup(a, EMAIL, delivered)
        assert (await login(b, EMAIL)).status_code == 200
        await clear_limits(factory)
        assert (await a.post("/auth/password/forgot", json={"email": EMAIL})).status_code == 202
        token = delivered[-1][2]
        assert (await a.post(DELETE, json=CONFIRM, headers={"Origin": "https://invalid.example"})).status_code == 403
        assert (await a.post(DELETE, json=CONFIRM, headers={"X-CSRF-Token": "wrong"})).status_code == 403
        assert (await a.post(DELETE, json={"current_password": "wrong"})).status_code == 400
        bad_password = "secret" * 30
        invalid = await a.post(DELETE, json={"current_password": bad_password})
        assert invalid.status_code == 422 and bad_password not in invalid.text
        cookie_name = get_settings().session_cookie
        old_cookie = b.cookies.get(cookie_name)
        old_csrf = b.headers["X-CSRF-Token"]

        before = await db_now_in(factory)
        result = await a.post(DELETE, json=CONFIRM)
        after = await db_now_in(factory)
        assert result.status_code == 200
        due = datetime.fromisoformat(result.json()["deletion_due_at"])
        assert before + timedelta(days=30) <= due <= after + timedelta(days=30)
        assert a.cookies.get(cookie_name) is None
        for path in ("/auth/me", "/graph", "/layouts", "/export"):
            assert (await b.get(path)).status_code == 401
        assert (await b.post("/import", json={})).status_code == 401
        assert (await b.post(DELETE, json=CONFIRM)).status_code == 401
        assert (await b.post(CANCEL, json=CREDENTIALS)).status_code == 403

        invalid_login = await login(a, EMAIL, "wrong")
        assert invalid_login.json() == {"detail": "invalid_credentials"}
        pending = await login(a, EMAIL)
        assert pending.status_code == 403 and "set-cookie" not in pending.headers
        assert pending.json()["detail"] == {
            "code": "account_pending_deletion", "deletion_due_at": due.isoformat(), "can_cancel": True,
        }
        await clear_limits(factory)
        assert (await a.post("/auth/password/forgot", json={"email": EMAIL})).status_code == 202
        assert delivered[-1][2] == token
        assert (await a.post("/auth/password/reset", json={"token": token, "password": PASSWORD})).status_code == 400
        assert (await a.post(CANCEL, json={**CREDENTIALS, "password": "wrong"})).status_code == 401
        invalid_cancel = await a.post(CANCEL, json={**CREDENTIALS, "password": bad_password})
        assert invalid_cancel.status_code == 422 and bad_password not in invalid_cancel.text
        canceled = await a.post(CANCEL, json=CREDENTIALS)
        assert canceled.status_code == 204 and "set-cookie" not in canceled.headers
        assert (await a.get("/graph")).status_code == 401
        assert (await a.post(CANCEL, json=CREDENTIALS)).status_code == 409
        assert (await login(a, EMAIL)).status_code == 200
        assert a.cookies.get(cookie_name) != old_cookie
        assert (await b.get("/export", headers={"X-CSRF-Token": old_csrf})).status_code == 401


async def db_now_in(factory):
    async with factory() as session:
        return await db_now(session)


@pytest.mark.asyncio
async def test_purge_is_atomic_idempotent_and_isolated(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        user_id = await signup(a, EMAIL, delivered)
        other_id = await signup(b, "other@example.com", delivered)
        exported = await export_graph(a, factory)
        assert exported.status_code == 200
        assert (await b.post("/import", content=exported.content)).status_code == 201
        other_before = await owner_counts(factory, other_id)
        assert all(other_before)
        assert (await a.post(DELETE, json=CONFIRM)).status_code == 200
        before = await owner_counts(factory, user_id)
        assert all(before)
        await purge()
        assert await owner_counts(factory, user_id) == before
        await expire(factory, user_id)
        await pre_auth(a)
        assert (await a.post(CANCEL, json=CREDENTIALS)).json()["detail"] == "deletion_window_closed"
        assert (await login(a, EMAIL)).json()["detail"]["can_cancel"] is False

        # A foreign key blocks owner deletion after the command removes edges.
        async with factory.begin() as session:
            await session.execute(text("CREATE TABLE test_purge_guard (user_id bigint REFERENCES users(id))"))
            await session.execute(text("INSERT INTO test_purge_guard (user_id) VALUES (:id)"), {"id": user_id})
        try:
            with pytest.raises(DBAPIError):
                await purge()
        finally:
            async with factory.begin() as session:
                await session.execute(text("DROP TABLE test_purge_guard"))
        assert await owner_counts(factory, user_id) == before

        await asyncio.wait_for(asyncio.gather(purge(), purge()), timeout=5)
        await purge()
        assert await owner_counts(factory, user_id) == [0] * len(before)
        async with factory() as session:
            assert await session.get(User, user_id) is None
        assert await owner_counts(factory, other_id) == other_before
        assert (await b.get("/export")).json()["nodes"]
        assert (await login(a, EMAIL)).status_code == 401


@pytest.mark.asyncio
async def test_concurrent_delete_and_cancel_apply_once(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        user_id = await signup(a, EMAIL, delivered)
        assert (await login(b, EMAIL)).status_code == 200
        deletes = await asyncio.wait_for(asyncio.gather(
            a.post(DELETE, json=CONFIRM), b.post(DELETE, json=CONFIRM),
        ), timeout=5)
        assert sorted(result.status_code for result in deletes) == [200, 401]
        async with factory() as session:
            user = await session.get(User, user_id)
            assert user.deletion_due_at.isoformat() == next(
                result.json()["deletion_due_at"] for result in deletes if result.status_code == 200
            )

        await pre_auth(a)
        await pre_auth(b)
        cancels = await asyncio.wait_for(asyncio.gather(
            a.post(CANCEL, json=CREDENTIALS), b.post(CANCEL, json=CREDENTIALS),
        ), timeout=5)
        assert sorted(result.status_code for result in cancels) == [204, 409]
        assert (await a.get("/graph")).status_code == 401
        assert (await b.get("/graph")).status_code == 401
        assert (await login(a, EMAIL)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["deletion", "absolute_expiry", "idle_expiry"])
async def test_export_rechecks_access_after_authentication_transaction(test_engine, monkeypatch, change):
    from sqlalchemy.ext.asyncio import AsyncSession

    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        user_id = await signup(a, EMAIL, delivered)
        assert (await login(b, EMAIL)).status_code == 200
        original_commit = AsyncSession.commit
        export_committed = False

        async def commit(session):
            nonlocal export_committed
            await original_commit(session)
            if not export_committed:
                export_committed = True
                if change == "deletion":
                    assert (await b.post(DELETE, json=CONFIRM)).status_code == 200
                else:
                    async with factory.begin() as clock:
                        now = await db_now(clock)
                        expiry = (
                            {"absolute_expires_at": now} if change == "absolute_expiry" else
                            {"last_seen_at": now - timedelta(days=get_settings().session_idle_days)}
                        )
                        await clock.execute(update(AuthSession).where(
                            AuthSession.user_id == user_id,
                        ).values(**expiry))

        # Move the test session across its eligibility boundary before the export snapshot.
        with monkeypatch.context() as patch:
            patch.setattr(AsyncSession, "commit", commit)
            exported = await asyncio.wait_for(a.get("/export"), timeout=5)
        assert export_committed
        assert exported.status_code == 401
        assert "content-disposition" not in exported.headers


@pytest.mark.asyncio
async def test_cancellation_cannot_restore_an_account_due_for_purge(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a, b, factory, delivered):
        user_id = await signup(a, EMAIL, delivered)
        assert (await a.post(DELETE, json=CONFIRM)).status_code == 200
        await expire(factory, user_id)
        await pre_auth(b)
        result, _ = await asyncio.wait_for(asyncio.gather(
            b.post(CANCEL, json=CREDENTIALS), purge(),
        ), timeout=5)
        assert result.status_code in (401, 409)
        async with factory() as session:
            assert await session.get(User, user_id) is None
