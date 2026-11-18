from typing import TYPE_CHECKING

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.node import Node
    from app.models.edge import Edge

class User(Base):
    __tablename__ = "users"

    __table_args__ = (
        CheckConstraint("status IN ('active', 'blocked')", name="ck_users_status"),
        CheckConstraint("status = 'blocked' OR (blocked_until IS NULL AND blocked_reason IS NULL)", name="ck_users_block_fields"),
    )
    email_normalized: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'active'"))
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    blocked_reason: Mapped[str | None] = mapped_column(String(1000))
    # Legacy rows may only be activated by the operator bootstrap command.
    activation_allowed: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
        unique=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("clock_timestamp()"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("clock_timestamp()"),
    )

    nodes: Mapped[list["Node"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    edges: Mapped[list["Edge"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


from sqlalchemy import event

@event.listens_for(User, "before_insert")
def normalize_user_email(mapper, connection, target):
    if not target.email_normalized:
        target.email_normalized = target.email.strip().lower()
