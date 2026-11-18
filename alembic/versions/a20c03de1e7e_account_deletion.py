"""Store the account deletion deadline."""

from alembic import op
import sqlalchemy as sa

revision = "a20c03de1e7e"
down_revision = "e19a01e4b901"


def upgrade():
    op.add_column("users", sa.Column("deletion_due_at", sa.DateTime(timezone=True)))
    op.create_index("ix_users_deletion_due_at", "users", ["deletion_due_at"],
                    postgresql_where=sa.text("deletion_due_at IS NOT NULL"))


def downgrade():
    # Older authentication code would allow pending accounts to sign in.
    op.execute("""
        DO $$ BEGIN
            LOCK TABLE users IN ACCESS EXCLUSIVE MODE;
            IF EXISTS (SELECT 1 FROM users WHERE deletion_due_at IS NOT NULL) THEN
                RAISE EXCEPTION 'Resolve pending account deletions before downgrading';
            END IF;
        END $$;
    """)
    op.drop_index("ix_users_deletion_due_at", table_name="users")
    op.drop_column("users", "deletion_due_at")
