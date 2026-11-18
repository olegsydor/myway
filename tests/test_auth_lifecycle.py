import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.main import app
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core import auth_middleware, mail
from app.core.security import db_now, digest, hash_password, issue_action
from app.dependencies.auth import get_current_user
from app.models import User, NodeType, Node, EdgeType
from app.models.auth import ActionToken, AuthRateLimit, AuthSession
from app.commands.auth import run as operator

PASSWORD = "A long test password 19"
NEW = "A different password 19"

@asynccontextmanager
async def real_clients(engine, monkeypatch):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async def database():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except BaseException:
                await session.rollback()
                raise
    old = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db_session] = database
    monkeypatch.setattr(auth_middleware, "AsyncSessionFactory", factory)
    from app.commands import auth as command
    monkeypatch.setattr(command, "AsyncSessionFactory", factory)
    delivered = []
    async def deliver(email, purpose, token):
        delivered.append((email, purpose, token))
    from app.routers import auth
    monkeypatch.setattr(auth, "send_action", deliver)
    monkeypatch.setattr(command, "send_action", deliver)
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test", headers={"Origin": "http://localhost:5173", "Content-Type": "application/json"}) as a, AsyncClient(transport=ASGITransport(app), base_url="http://test", headers={"Origin": "http://localhost:5173", "Content-Type": "application/json"}) as b:
        try:
            for client in (a,b):
                client.headers["X-CSRF-Token"] = (await client.get("/auth/csrf")).json()["csrf_token"]
            yield a, b, factory, delivered
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(old)

async def clear_limits(factory):
    from sqlalchemy import delete
    async with factory() as session:
        await session.execute(delete(AuthRateLimit))
        await session.commit()

async def register(client, email):
    return await client.post("/auth/register", json={"email": email, "password": PASSWORD, "display_name": "Person"})

async def login(client, email, password=PASSWORD):
    client.headers["X-CSRF-Token"] = (await client.get("/auth/csrf")).json()["csrf_token"]
    response = await client.post("/auth/login", json={"email": email, "password": password})
    if response.status_code == 200:
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response

async def signup(client, email, delivered):
    assert (await register(client,email)).status_code == 202
    token = delivered[-1][2]
    assert (await client.post("/auth/email/verify", json={"token":token,"password":PASSWORD})).status_code == 204
    response = await login(client,email)
    assert response.status_code == 200, response.text
    return response.json()["user"]["id"]

@pytest.mark.asyncio
async def test_full_lifecycle_and_two_user_isolation(test_engine, monkeypatch):
    async with real_clients(test_engine, monkeypatch) as (a,b,factory,delivered):
        assert (await a.get("/graph")).status_code == 401
        assert (await register(a," A@EXAMPLE.COM ")).status_code == 202
        verification = delivered[-1][2]
        assert (await login(a,"a@example.com")).json()["detail"] == "email_verification_required"
        assert (await a.get("/auth/email/verify", params={"token":verification})).status_code == 405
        assert (await a.post("/auth/email/verify",json={"token":verification,"password":PASSWORD})).status_code == 204
        assert (await a.post("/auth/email/verify",json={"token":verification,"password":PASSWORD})).status_code == 400
        uid = (await login(a,"a@example.com")).json()["user"]["id"]
        other = await signup(b,"b@example.com",delivered)
        assert uid != other
        assert (await a.get("/auth/me")).json()["user"]["id"] == uid
        assert (await a.get("/graph")).json()["nodes"] == []
        assert (await a.get("/layouts")).json() == []
        async with factory() as session:
            node_type=NodeType(code="person",name="Person");edge_type=EdgeType(code="knows",name="Knows")
            session.add_all([node_type,edge_type]);await session.commit()
            nt, et = node_type.id, edge_type.id
        node=(await a.post("/nodes",json={"node_type_id":nt,"display_name":"Private"})).json()
        for method, body in [("GET",None),("PATCH",{"display_name":"Hacked"}),("DELETE",None)]:
            result=await b.request(method,f"/nodes/{node['id']}",json=body)
            assert result.status_code == 404
        bnode=(await b.post("/nodes",json={"node_type_id":nt,"display_name":"B"})).json()
        assert (await a.post("/edges",json={"source_node_id":node['id'],"target_node_id":bnode['id'],"edge_type_id":et})).status_code == 404
        layout=(await a.post("/layouts",json={"name":"Main","positions":[{"node_id":node['id'],"x":1,"y":2}],"annotations":[]})).json()
        lid=layout['id']
        for method, path, body in [("GET",f"/layouts/{lid}",None),("PATCH",f"/layouts/{lid}",{"name":"Hack"}),("DELETE",f"/layouts/{lid}",None),("PUT",f"/layouts/{lid}/positions",{"positions":[]}),("PUT",f"/layouts/{lid}/workspace",{"positions":[],"annotations":[]})]:
            assert (await b.request(method,path,json=body)).status_code == 404
        assert len((await b.get('/graph')).json()['nodes'])==1
        # CSRF ties a stale tab to its session; changing the cookie is insufficient.
        old_csrf=a.headers['X-CSRF-Token']
        old_cookie=a.cookies.get(get_settings().session_cookie)
        a.cookies.set(get_settings().session_cookie,b.cookies.get(get_settings().session_cookie),domain='test.local',path='/')
        assert (await a.post('/nodes',json={"node_type_id":nt,"display_name":"Stale tab"})).status_code == 403
        a.cookies.set(get_settings().session_cookie,old_cookie,domain='test.local',path='/')
        assert (await a.post('/auth/logout',json={})).status_code == 204
        a.cookies.set(get_settings().session_cookie,old_cookie,domain='test.local',path='/')
        assert (await a.get('/graph')).status_code == 401
        assert (await b.get('/graph')).status_code == 200

@pytest.mark.asyncio
async def test_password_reset_revokes_all_sessions_and_tokens(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        uid=await signup(a,'reset@example.com',delivered)
        await clear_limits(factory)
        assert (await login(b,'reset@example.com')).status_code==200
        assert (await a.post('/auth/password/forgot',json={'email':'reset@example.com'})).status_code==202
        token=delivered[-1][2]
        async with factory() as s:
            row=await s.scalar(select(ActionToken).where(ActionToken.token_hash==digest(token)))
            assert row.purpose=='reset_password' and row.token_hash != token
        assert (await a.post('/auth/email/verify',json={'token':token,'password':NEW})).status_code==400
        assert (await a.post('/auth/password/reset',json={'token':token,'password':NEW})).status_code==204
        assert (await b.get('/auth/me')).status_code==401
        a.headers['X-CSRF-Token']=(await a.get('/auth/csrf')).json()['csrf_token']
        assert (await a.post('/auth/password/reset',json={'token':token,'password':NEW})).status_code==400
        assert (await login(a,'reset@example.com',NEW)).status_code==200
        assert (await a.post('/auth/password/change',json={'current_password':'wrong','password':PASSWORD})).status_code==400
        assert (await a.post('/auth/password/change',json={'current_password':NEW,'password':PASSWORD})).status_code==204
        assert (await a.get('/graph')).status_code==401

@pytest.mark.asyncio
async def test_blocking_legacy_and_expiry(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        async with factory() as s:
            legacy=User(email='legacy@example.com',display_name='Legacy');s.add(legacy);await s.flush()
            await s.commit();legacy_id=legacy.id
        assert (await a.post('/auth/email/resend',json={'email':'legacy@example.com'})).status_code==202
        assert not delivered
        await operator(SimpleNamespace(action='bootstrap',user_id=legacy_id,email='owner@example.com'))
        token=delivered[-1][2]
        assert (await a.post('/auth/email/verify',json={'token':token,'password':PASSWORD})).status_code==204
        assert (await login(a,'owner@example.com')).json()['user']['id']==legacy_id
        await operator(SimpleNamespace(action='block',user_id=legacy_id,until=None,reason='internal private reason'))
        assert (await a.get('/graph')).status_code==401
        result=await login(a,'owner@example.com')
        assert result.status_code==403 and 'internal' not in result.text
        assert (await a.post('/auth/password/forgot',json={'email':'owner@example.com'})).status_code==202
        assert len(delivered)==1
        await operator(SimpleNamespace(action='unblock',user_id=legacy_id))
        assert (await login(a,'owner@example.com')).status_code==200
        async with factory() as s:
            user=await s.get(User,legacy_id);user.status='blocked';user.blocked_until=await db_now(s)-timedelta(seconds=1);await s.commit()
        assert (await login(a,'owner@example.com')).status_code==200
        async with factory() as s:
            await s.execute(update(AuthSession).values(absolute_expires_at=await db_now(s)-timedelta(seconds=1)));await s.commit()
        assert (await a.get('/graph')).status_code==401

@pytest.mark.asyncio
async def test_csrf_limits_mail_and_registration_disabled(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        payload={'email':'nobody@example.com','password':PASSWORD}
        assert (await a.post('/auth/login',json=payload,headers={'Origin':'https://evil.example'})).status_code==403
        assert (await a.post('/auth/login',json=payload,headers={'X-CSRF-Token':'wrong'})).status_code==403
        assert (await a.post('/auth/login',content='{}',headers={'Content-Type':'text/plain'})).status_code==415
        assert (await a.post('/auth/login',content='x'*17000)).status_code==413
        for i in range(5):
            assert (await login(a,'nobody@example.com')).status_code==401
        limited=await login(a,'nobody@example.com')
        assert limited.status_code==429 and 'retry-after' in limited.headers
        settings=get_settings();monkeypatch.setattr(settings,'registration_enabled',False)
        assert (await register(a,'closed@example.com')).json()['detail']=='registration_disabled'
        monkeypatch.setattr(settings,'registration_enabled',True)
        # Internal delivery failures must not roll back the account.
        from app.routers import auth
        async def fail_safe(*args):
            return None
        monkeypatch.setattr(auth,'send_action',fail_safe)
        assert (await register(b,'mailfail@example.com')).status_code==202
        async with factory() as s:
            assert await s.scalar(select(User.id).where(User.email_normalized=='mailfail@example.com'))

@pytest.mark.asyncio
async def test_concurrent_single_use_and_pending_account_takeover(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        assert (await register(a,'pending@example.com')).status_code==202
        token=delivered[-1][2]
        await clear_limits(factory)
        # Duplicate registration cannot replace credentials, and verification sets the mailbox owner's password.
        assert (await b.post('/auth/register',json={'email':'pending@example.com','password':NEW,'display_name':'attacker'})).status_code==202
        results=await asyncio.gather(*[client.post('/auth/email/verify',json={'token':token,'password':NEW}) for client in (a,b)])
        assert sorted(result.status_code for result in results)==[204,400]
        assert (await login(a,'pending@example.com',PASSWORD)).status_code==401
        assert (await login(a,'pending@example.com',NEW)).status_code==200

@pytest.mark.asyncio
async def test_expired_tokens_idle_timeout_resend_and_closed_registration(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        assert (await register(a,'expiry@example.com')).status_code==202
        old=delivered[-1][2]
        async with factory() as s:
            await s.execute(update(ActionToken).values(expires_at=await db_now(s)-timedelta(seconds=1)));await s.commit()
        assert (await a.post('/auth/email/verify',json={'token':old,'password':PASSWORD})).status_code==400
        await clear_limits(factory)
        assert (await a.post('/auth/email/resend',json={'email':'expiry@example.com'})).status_code==202
        fresh=delivered[-1][2]
        assert fresh!=old
        assert (await a.post('/auth/email/verify',json={'token':old,'password':PASSWORD})).status_code==400
        assert (await a.post('/auth/email/verify',json={'token':fresh,'password':PASSWORD})).status_code==204
        settings=get_settings();monkeypatch.setattr(settings,'registration_enabled',False)
        result=await login(a,'expiry@example.com');assert result.status_code==200
        cookie=result.headers['set-cookie']
        assert 'HttpOnly' in cookie and 'SameSite=lax' in cookie and 'Path=/' in cookie
        assert result.headers['cache-control']=='no-store'
        async with factory() as s:
            await s.execute(update(AuthSession).values(last_seen_at=await db_now(s)-timedelta(days=8)));await s.commit()
        assert (await a.get('/graph')).status_code==401

@pytest.mark.asyncio
async def test_block_serializes_with_already_authorized_mutations(test_engine,monkeypatch):
    async with real_clients(test_engine,monkeypatch) as (a,b,factory,delivered):
        uid=await signup(a,'race@example.com',delivered)
        # Simulate a mutation holding the same owner lock as the auth dependency.
        async with factory() as mutation:
            await mutation.scalar(select(User).where(User.id==uid).with_for_update())
            ban=asyncio.create_task(operator(SimpleNamespace(action='block',user_id=uid,until=None,reason=None)))
            await asyncio.sleep(.05)
            assert not ban.done()
            await mutation.commit()
            await asyncio.wait_for(ban,3)
        assert (await a.get('/graph')).status_code==401

@pytest.mark.asyncio
async def test_mail_adapter_failure_is_safe_and_file_mode_private(monkeypatch,tmp_path):
    settings=get_settings()
    monkeypatch.setattr(settings,'mail_mode','file');monkeypatch.setattr(settings,'mail_sink_path',str(tmp_path))
    await mail.send_action('person@example.com','reset_password','not-a-real-token')
    files=list(tmp_path.glob('*.eml'));assert len(files)==1
    assert 'reset-password/not-a-real-token' in files[0].read_text()
    assert files[0].stat().st_mode & 0o777==0o600
    monkeypatch.setattr(mail,'send_sync',lambda *args: (_ for _ in ()).throw(RuntimeError('secret should not be logged')))
    await mail.send_action('person@example.com','reset_password','never-log-me')
