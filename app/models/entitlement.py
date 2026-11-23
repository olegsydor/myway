from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EntitlementGrant(Base):
    __tablename__ = "entitlement_grants"
    __table_args__ = (
        CheckConstraint("plan_code IN ('pro')", name="ck_entitlement_grants_plan"),
        CheckConstraint("source IN ('early_tester', 'manual')", name="ck_entitlement_grants_source"),
        CheckConstraint("expires_at IS NULL OR expires_at > starts_at", name="ck_entitlement_grants_expiry"),
        CheckConstraint("revoked_at IS NULL OR revoked_at >= starts_at", name="ck_entitlement_grants_revocation"),
        Index("ix_entitlement_grants_lookup", "user_id", "starts_at", "expires_at", "revoked_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_code: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(32))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("clock_timestamp()"))
    note: Mapped[str | None] = mapped_column(String(500))
