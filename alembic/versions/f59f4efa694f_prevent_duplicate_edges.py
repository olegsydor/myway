"""prevent duplicate edges

Revision ID: f59f4efa694f
Revises: 1934c101cf4c
Create Date: 2026-08-31 18:00:49.968708

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f59f4efa694f'
down_revision: Union[str, Sequence[str], None] = '1934c101cf4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        "uq_edges_user_source_target_type",
        "edges",
        ["user_id", "source_node_id", "target_node_id", "edge_type_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "uq_edges_user_source_target_type",
        "edges",
        type_="unique",
    )
