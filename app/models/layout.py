from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
    Index, String, UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Layout(Base):
    __tablename__ = "layouts"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_layouts_user_id_id"),
        CheckConstraint(
            "name = btrim(name) AND char_length(name) > 0",
            name="ck_layouts_name_trimmed_nonempty",
        ),
        Index("uq_layouts_user_name", "user_id", func.lower(text("name")), unique=True),
        Index(
            "uq_layouts_user_default", "user_id", unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("clock_timestamp()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("clock_timestamp()"), onupdate=text("clock_timestamp()"),
    )
