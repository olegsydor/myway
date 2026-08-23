"""restrict node deletion with edges

Revision ID: f15513a1e064
Revises: f0e09ca13099
Create Date: 2026-08-23 13:10:40.052507

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f15513a1e064'
down_revision: Union[str, Sequence[str], None] = 'f0e09ca13099'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_edges_source_node_owner",
        "edges",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_edges_target_node_owner",
        "edges",
        type_="foreignkey",
    )

    op.create_foreign_key(
        "fk_edges_source_node_owner",
        "edges",
        "nodes",
        ["user_id", "source_node_id"],
        ["user_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_edges_target_node_owner",
        "edges",
        "nodes",
        ["user_id", "target_node_id"],
        ["user_id", "id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_edges_source_node_owner",
        "edges",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_edges_target_node_owner",
        "edges",
        type_="foreignkey",
    )

    op.create_foreign_key(
        "fk_edges_source_node_owner",
        "edges",
        "nodes",
        ["user_id", "source_node_id"],
        ["user_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_edges_target_node_owner",
        "edges",
        "nodes",
        ["user_id", "target_node_id"],
        ["user_id", "id"],
        ondelete="CASCADE",
    )
