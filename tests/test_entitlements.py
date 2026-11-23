from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import EntitlementGrant
from app.schemas.entitlement import Violation
from app.services.entitlements import active_grants, deny


def test_active_grant_boundaries():
    now = datetime.now(timezone.utc)
    earlier = now - timedelta(days=1)
    later = now + timedelta(days=1)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("""
            CREATE TABLE entitlement_grants (
                id INTEGER PRIMARY KEY, user_id INTEGER, plan_code TEXT, source TEXT,
                starts_at DATETIME, expires_at DATETIME, revoked_at DATETIME,
                created_at DATETIME, note TEXT
            )
        """)
    with Session(engine) as session:
        cases = [
            (1, 1, later, None, None),
            (2, 1, earlier, now, None),
            (3, 1, earlier, later, now),
            (4, 1, now, None, None),
            (5, 1, earlier, later, None),
            (6, 2, earlier, None, None),
        ]
        session.add_all([
            EntitlementGrant(id=i, user_id=user, plan_code="pro", source="manual",
                             starts_at=start, expires_at=end, revoked_at=revoked, created_at=now)
            for i, user, start, end, revoked in cases
        ])
        assert {grant.id for grant in session.scalars(active_grants(1, now))} == {4, 5}
        assert session.scalar(active_grants(3, now)) is None


def test_structured_plan_error():
    violation = Violation(resource="nodes", limit=300, attempted=301)
    with pytest.raises(HTTPException) as error:
        deny(violation, 300)
    assert error.value.status_code == 409
    assert error.value.detail == {
        "code": "plan_limit_exceeded", "plan": "free", "resource": "nodes",
        "limit": 300, "current": 300, "attempted": 301,
    }
