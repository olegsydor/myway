from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edge_type import EdgeType


# Established dictionary order, keyed by stable type code.
STANDARD_ORDER = (
    "knows",
    "works_at",
    "lives_in",
    "has_skill",
    "participates_in",
    "works_on",
    "located_in",
    "leads_to",
    "family",
    "pushed",
    "shared",
)


async def get_edge_type_by_id(
    session: AsyncSession,
    *,
    edge_type_id: int,
) -> EdgeType | None:
    result = await session.execute(
        select(EdgeType).where(
            EdgeType.id == edge_type_id,
        )
    )

    return result.scalar_one_or_none()


async def get_edge_types(
    session: AsyncSession,
) -> list[EdgeType]:
    rank = case(
        {code: index for index, code in enumerate(STANDARD_ORDER)},
        value=EdgeType.code,
        else_=len(STANDARD_ORDER),
    )
    result = await session.execute(select(EdgeType).order_by(rank, EdgeType.code))

    return list(result.scalars().all())
