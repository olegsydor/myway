"""Permanently delete accounts whose deletion window has closed."""

from sqlalchemy import delete, select

from app.core.security import db_now
from app.models import Edge, User


async def purge_due_accounts(session_factory) -> int:
    """Commit each account independently. Failed accounts can be retried."""
    async with session_factory() as session:
        cutoff = await db_now(session)
        candidates = (await session.scalars(
            select(User.id).where(User.deletion_due_at <= cutoff)
        )).all()

    deleted = 0
    for user_id in candidates:
        async with session_factory.begin() as session:
            # Recheck eligibility under the same lock used by cancellation.
            owner = await session.scalar(
                select(User.id)
                .where(User.id == user_id, User.deletion_due_at <= cutoff)
                .with_for_update()
            )
            if owner is None:
                continue
            # Edge endpoint foreign keys restrict node deletion. Remove edges first.
            await session.execute(delete(Edge).where(Edge.user_id == owner))
            # PostgreSQL cascades to nodes, layouts, positions, annotations and auth rows.
            await session.execute(delete(User).where(User.id == owner))
        deleted += 1
    return deleted
