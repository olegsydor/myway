"""add default node and edge types

Revision ID: 1fad1039e79c
Revises: f15513a1e064
Create Date: 2026-08-31 08:53:20.087500

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1fad1039e79c'
down_revision: Union[str, Sequence[str], None] = 'f15513a1e064'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO node_types (code, name)
        VALUES
            ('place', 'Place'),
            ('organization', 'Organization'),
            ('skill', 'Skill'),
            ('event', 'Event'),
            ('project', 'Project');
        """
    )

    op.execute(
        """
        INSERT INTO edge_types (code, name)
        VALUES
            ('works_at', 'Works at'),
            ('lives_in', 'Lives in'),
            ('has_skill', 'Has skill'),
            ('participates_in', 'Participates in'),
            ('works_on', 'Works on'),
            ('located_in', 'Located in');
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM edge_types
        WHERE code IN (
            'works_at',
            'lives_in',
            'has_skill',
            'participates_in',
            'works_on',
            'located_in'
        );
        """
    )

    op.execute(
        """
        DELETE FROM node_types
        WHERE code IN (
            'place',
            'organization',
            'skill',
            'event',
            'project'
        );
        """
    )
