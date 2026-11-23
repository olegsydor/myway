"""Add effective-plan grants."""

from alembic import op
import sqlalchemy as sa

revision = "a22a01e4b901"
down_revision = "a21a01e4b901"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "entitlement_grants",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_code", sa.String(16), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("note", sa.String(500)),
        sa.CheckConstraint("plan_code IN ('pro')", name="ck_entitlement_grants_plan"),
        sa.CheckConstraint("source IN ('early_tester', 'manual')", name="ck_entitlement_grants_source"),
        sa.CheckConstraint("expires_at IS NULL OR expires_at > starts_at", name="ck_entitlement_grants_expiry"),
        sa.CheckConstraint("revoked_at IS NULL OR revoked_at >= starts_at", name="ck_entitlement_grants_revocation"),
    )
    op.create_index("ix_entitlement_grants_user_id", "entitlement_grants", ["user_id"])
    op.create_index("ix_entitlement_grants_lookup", "entitlement_grants",
                    ["user_id", "starts_at", "expires_at", "revoked_at"])


def downgrade():
    op.drop_table("entitlement_grants")
