"""add hobby and leads to types

Revision ID: 1934c101cf4c
Revises: 1fad1039e79c
Create Date: 2026-08-31 15:21:40.486644

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1934c101cf4c'
down_revision: Union[str, Sequence[str], None] = '1fad1039e79c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO node_types (code, name)
        VALUES ('hobby', 'Hobby');
        """
    )

    op.execute(
        """
        INSERT INTO edge_types (code, name)
        VALUES ('leads_to', 'Leads to');
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM edge_types
        WHERE code = 'leads_to';
        """
    )

    op.execute(
        """
        DELETE FROM node_types
        WHERE code = 'hobby';
        """
    )