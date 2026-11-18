"""Add authentication without changing existing ownership or workspace data.

Revision ID: e19a01e4b901
Revises: d15a01e4b901
"""
from alembic import op
import sqlalchemy as sa

revision = "e19a01e4b901"
down_revision = "d15a01e4b901"
branch_labels = None
depends_on = None


def upgrade():
    # Fail before any change rather than silently merging user identities.
    connection = op.get_bind()
    identities = connection.execute(sa.text("SELECT id, email FROM users ORDER BY id")).all()
    normalized = [(row.id, row.email.strip().lower()) for row in identities]
    if len({email for _, email in normalized}) != len(normalized):
        raise RuntimeError("Normalized email collision. Resolve identities before upgrading; no accounts were merged.")
    op.add_column("users", sa.Column("email_normalized", sa.String(320), nullable=True))
    for user_id, email in normalized:
        connection.execute(sa.text("UPDATE users SET email_normalized=:email WHERE id=:id"), {"id": user_id, "email": email})
    op.alter_column("users", "email_normalized", nullable=False)
    op.create_unique_constraint("uq_users_email_normalized", "users", ["email_normalized"])
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("status", sa.String(16), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_reason", sa.String(1000), nullable=True))
    op.add_column("users", sa.Column("activation_allowed", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_check_constraint("ck_users_status", "users", "status IN ('active', 'blocked')")
    op.create_check_constraint("ck_users_block_fields", "users", "status = 'blocked' OR (blocked_until IS NULL AND blocked_reason IS NULL)")
    op.create_table("auth_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table("auth_action_tokens",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(24), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_auth_action_tokens_user_id", "auth_action_tokens", ["user_id"])
    op.create_table("auth_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window_start", sa.BigInteger(), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    # Never move an existing sequence backwards (even if rows were deleted).
    op.execute("""SELECT setval(pg_get_serial_sequence('users','id'),
        GREATEST(COALESCE((SELECT max(id) FROM users), 1),
        nextval(pg_get_serial_sequence('users','id'))), true)""")


def downgrade():
    raise RuntimeError("Auth downgrade is intentionally disabled: restore a verified backup in maintenance mode or forward-fix.")
