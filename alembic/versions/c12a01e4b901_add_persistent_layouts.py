"""Add persistent user-owned layouts and node positions.

Revision ID: c12a01e4b901
Revises: b4edbb2ba0b8
"""
from alembic import op
import sqlalchemy as sa

revision = "c12a01e4b901"
down_revision = "b4edbb2ba0b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "layouts",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("clock_timestamp()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("clock_timestamp()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "id", name="uq_layouts_user_id_id"),
        sa.CheckConstraint("name = btrim(name) AND char_length(name) > 0",
                           name="ck_layouts_name_trimmed_nonempty"),
    )
    op.create_index("uq_layouts_user_name", "layouts",
                    ["user_id", sa.text("lower(name)")], unique=True)
    op.create_index("uq_layouts_user_default", "layouts", ["user_id"],
                    unique=True, postgresql_where=sa.text("is_default"))
    op.create_table(
        "layout_node_positions",
        sa.Column("layout_id", sa.BigInteger(), primary_key=True),
        sa.Column("node_id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("x", sa.Double(), nullable=False),
        sa.Column("y", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id", "layout_id"], ["layouts.user_id", "layouts.id"],
            name="fk_layout_positions_layout_owner", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["user_id", "node_id"], ["nodes.user_id", "nodes.id"],
            name="fk_layout_positions_node_owner", ondelete="CASCADE"),
        sa.CheckConstraint(
            "x > '-Infinity'::double precision AND x < 'Infinity'::double precision "
            "AND y > '-Infinity'::double precision AND y < 'Infinity'::double precision",
            name="ck_layout_positions_finite"),
    )
    op.create_index("ix_layout_positions_user_node", "layout_node_positions",
                    ["user_id", "node_id"])


def downgrade() -> None:
    op.drop_table("layout_node_positions")
    op.drop_table("layouts")
