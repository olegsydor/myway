from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import db_now
from app.models import EntitlementGrant, Layout, LayoutAnnotation, Node, User
from app.schemas.data_import import DataImport
from app.schemas.entitlement import Eligibility, Entitlements, Limits, Plan, PlanLimitError, Usage, Violation

FREE_NODE_LIMIT = 300
FREE_ANNOTATIONS_PER_LAYOUT = 15
FREE_LAYOUT_LIMIT = 3
PRO_LAYOUT_LIMIT = 15


async def lock_owner(session: AsyncSession, user_id: int) -> bool:
    return await session.scalar(select(User.id).where(User.id == user_id).with_for_update()) is not None


def active_grants(user_id: int, now: datetime):
    grant = EntitlementGrant
    return select(grant).where(
        grant.user_id == user_id,
        grant.plan_code == "pro",
        grant.starts_at <= now,
        grant.revoked_at.is_(None),
        or_(grant.expires_at.is_(None), grant.expires_at > now),
    )


async def effective_grant(session: AsyncSession, user_id: int) -> EntitlementGrant | None:
    grant = EntitlementGrant
    return await session.scalar(active_grants(user_id, await db_now(session)).order_by(
        grant.expires_at.desc().nulls_first(), grant.id.asc(),
    ).limit(1))


async def node_count(session: AsyncSession, user_id: int) -> int:
    return await session.scalar(select(func.count()).select_from(Node).where(Node.user_id == user_id))


def layout_limit(plan: Plan) -> int:
    return PRO_LAYOUT_LIMIT if plan == "pro" else FREE_LAYOUT_LIMIT


async def layout_count(session: AsyncSession, user_id: int) -> int:
    return await session.scalar(select(func.count()).select_from(Layout).where(Layout.user_id == user_id))


async def check_layout_creation(session: AsyncSession, user_id: int, annotations: int) -> None:
    """Check both quotas under the layout repository's owner lock."""
    plan = "pro" if await effective_grant(session, user_id) else "free"
    current = await layout_count(session, user_id)
    limit = layout_limit(plan)
    if current >= limit:
        deny(Violation(resource="layouts", limit=limit, attempted=current + 1), current, plan)
    if plan == "free" and annotations > FREE_ANNOTATIONS_PER_LAYOUT:
        deny(Violation(resource="annotations_per_layout", limit=FREE_ANNOTATIONS_PER_LAYOUT,
                       attempted=annotations), 0)


async def public_entitlements(session: AsyncSession, user_id: int) -> Entitlements:
    grant = await effective_grant(session, user_id)
    plan = "pro" if grant else "free"
    return Entitlements(
        plan=plan,
        source=grant.source if grant else "default",
        starts_at=grant.starts_at if grant else None,
        expires_at=grant.expires_at if grant else None,
        limits=Limits(
            nodes=None if grant else FREE_NODE_LIMIT,
            annotations_per_layout=None if grant else FREE_ANNOTATIONS_PER_LAYOUT,
            layouts=layout_limit(plan),
        ),
        usage=Usage(nodes=await node_count(session, user_id), layouts=await layout_count(session, user_id)),
    )


def deny(violation: Violation, current: int, plan: Plan = "free") -> None:
    detail = PlanLimitError(**violation.model_dump(), current=current, plan=plan)
    raise HTTPException(409, detail.model_dump(exclude_none=True))


async def check_node_growth(session: AsyncSession, user_id: int) -> None:
    await lock_owner(session, user_id)
    if await effective_grant(session, user_id):
        return
    current = await node_count(session, user_id)
    if current >= FREE_NODE_LIMIT:
        deny(Violation(resource="nodes", limit=FREE_NODE_LIMIT, attempted=current + 1), current)


async def check_annotation_growth(
    session: AsyncSession, user_id: int, incoming: int, layout_id: int | None = None,
) -> None:
    await lock_owner(session, user_id)
    if await effective_grant(session, user_id):
        return
    current = 0
    if layout_id is not None:
        current = await session.scalar(select(func.count()).select_from(LayoutAnnotation).where(
            LayoutAnnotation.user_id == user_id, LayoutAnnotation.layout_id == layout_id,
        ))
    limit = max(current, FREE_ANNOTATIONS_PER_LAYOUT)
    if incoming > limit:
        deny(Violation(resource="annotations_per_layout", limit=limit, attempted=incoming,
                       layout_id=layout_id), current)


def snapshot_violations(plan: Plan, data: DataImport) -> list[Violation]:
    violations = []
    limit = layout_limit(plan)
    if len(data.layouts) > limit:
        violations.append(Violation(resource="layouts", limit=limit, attempted=len(data.layouts)))
    if plan == "free":
        if len(data.nodes) > FREE_NODE_LIMIT:
            violations.append(Violation(resource="nodes", limit=FREE_NODE_LIMIT, attempted=len(data.nodes)))
        for layout in data.layouts:
            if len(layout.annotations) > FREE_ANNOTATIONS_PER_LAYOUT:
                violations.append(Violation(resource="annotations_per_layout",
                                            limit=FREE_ANNOTATIONS_PER_LAYOUT,
                                            attempted=len(layout.annotations), layout_name=layout.name))
    return violations


async def snapshot_eligibility(session: AsyncSession, user_id: int, data: DataImport) -> Eligibility:
    plan = "pro" if await effective_grant(session, user_id) else "free"
    violations = snapshot_violations(plan, data)
    return Eligibility(allowed=not violations, violations=violations)


async def check_snapshot(session: AsyncSession, user_id: int, data: DataImport) -> None:
    plan = "pro" if await effective_grant(session, user_id) else "free"
    violations = snapshot_violations(plan, data)
    if violations:
        violation = violations[0]
        current = 0
        if violation.resource == "layouts":
            current = await layout_count(session, user_id)
        elif violation.resource == "nodes":
            current = await node_count(session, user_id)
        deny(violation, current, plan)
