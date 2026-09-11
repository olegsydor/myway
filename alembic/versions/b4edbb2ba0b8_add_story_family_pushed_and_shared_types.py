"""add story family pushed and shared types

Revision ID: b4edbb2ba0b8
Revises: f59f4efa694f
Create Date: 2026-09-10 18:48:46.677577

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4edbb2ba0b8'
down_revision: Union[str, Sequence[str], None] = 'f59f4efa694f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO node_types (code, name)
        VALUES ('story', 'Story');
        """
    )

    op.execute(
        """
        INSERT INTO edge_types (code, name)
        VALUES
            ('family', 'Family'),
            ('pushed', 'Pushed'),
            ('shared', 'Shared');
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM edge_types
        WHERE code IN (
            'family',
            'pushed',
            'shared'
        );
        """
    )

    op.execute(
        """
        DELETE FROM node_types
        WHERE code = 'story';
        """
    )
