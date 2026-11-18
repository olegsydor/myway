import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.database import get_db_session
from app.main import app
from app.models.base import Base


TEST_DATABASE_URL = (
    "postgresql+asyncpg://"
    f"{os.environ['POSTGRES_USER']}:"
    f"{os.environ['POSTGRES_PASSWORD']}@"
    f"{os.environ['POSTGRES_HOST']}:"
    f"{os.environ.get('POSTGRES_PORT', '5432')}/"
    "myway_test"
)

if not TEST_DATABASE_URL.endswith("/myway_test"):
    raise RuntimeError(
        "Tests must run only against myway_test database"
    )


@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        pool_pre_ping=True,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session, test_engine, monkeypatch):
    from app.core import auth_middleware
    monkeypatch.setattr(auth_middleware, "AsyncSessionFactory", async_sessionmaker(test_engine, expire_on_commit=False))
    async def override_get_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = (
        override_get_db_session
    )

    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": "http://localhost:5173", "Content-Type": "application/json"},
    ) as test_client:
        csrf = (await test_client.get("/auth/csrf")).json()["csrf_token"]
        test_client.headers["X-CSRF-Token"] = csrf
        yield test_client

    app.dependency_overrides.clear()
