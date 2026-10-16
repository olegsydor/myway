from sqlalchemy import (
    BigInteger, CheckConstraint, Double, ForeignKeyConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LayoutNodePosition(Base):
    __tablename__ = "layout_node_positions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "layout_id"], ["layouts.user_id", "layouts.id"],
            name="fk_layout_positions_layout_owner", ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "node_id"], ["nodes.user_id", "nodes.id"],
            name="fk_layout_positions_node_owner", ondelete="CASCADE",
        ),
        CheckConstraint(
            "x > '-Infinity'::double precision AND x < 'Infinity'::double precision "
            "AND y > '-Infinity'::double precision AND y < 'Infinity'::double precision",
            name="ck_layout_positions_finite",
        ),
        Index("ix_layout_positions_user_node", "user_id", "node_id"),
    )

    layout_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    node_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    x: Mapped[float] = mapped_column(Double, nullable=False)
    y: Mapped[float] = mapped_column(Double, nullable=False)
