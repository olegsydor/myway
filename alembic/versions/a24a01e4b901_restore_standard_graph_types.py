"""Restore the original Person and Knows dictionary entries."""

from alembic import op

revision = "a24a01e4b901"
down_revision = "a22a01e4b901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO node_types (code, name)
        SELECT 'person', 'Person'
        WHERE NOT EXISTS (SELECT 1 FROM node_types WHERE code = 'person')
        ON CONFLICT (code) DO NOTHING
    """)
    op.execute("""
        INSERT INTO edge_types (code, name)
        SELECT 'knows', 'Knows'
        WHERE NOT EXISTS (SELECT 1 FROM edge_types WHERE code = 'knows')
        ON CONFLICT (code) DO NOTHING
    """)


def downgrade() -> None:
    # These standard entries may predate this migration or have graph references.
    # Retain them when rolling back the revision.
    pass
