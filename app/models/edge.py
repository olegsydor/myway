from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.edge_type import EdgeType
    from app.models.node import Node
    from app.models.user import User


class Edge(Base):
    __tablename__ = "edges"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "id",
            name="uq_edges_user_id_id",
        ),
        UniqueConstraint(
            "user_id",
            "source_node_id",
            "target_node_id",
            "edge_type_id",
            name="uq_edges_user_source_target_type",
        ),
        ForeignKeyConstraint(
            ["user_id", "source_node_id"],
            ["nodes.user_id", "nodes.id"],
            name="fk_edges_source_node_owner",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "target_node_id"],
            ["nodes.user_id", "nodes.id"],
            name="fk_edges_target_node_owner",
            ondelete="CASCADE",
        ),
        Index(
            "ix_edges_user_id_source_node_id",
            "user_id",
            "source_node_id",
        ),
        Index(
            "ix_edges_user_id_target_node_id",
            "user_id",
            "target_node_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_node_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    target_node_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    edge_type_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("edge_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    properties: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("clock_timestamp()"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("clock_timestamp()"),
        onupdate=text("clock_timestamp()"),
    )

    user: Mapped["User"] = relationship(
        back_populates="edges",
    )

    edge_type: Mapped["EdgeType"] = relationship(
        back_populates="edges",
    )

    source_node: Mapped["Node"] = relationship(
        foreign_keys=[source_node_id],
    )

    target_node: Mapped["Node"] = relationship(
        foreign_keys=[target_node_id],
    )
