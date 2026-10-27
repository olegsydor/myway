"""Add layout-owned annotations without changing existing positions.

Revision ID: d15a01e4b901
Revises: c12a01e4b901
"""
from alembic import op
import sqlalchemy as sa

revision = "d15a01e4b901"
down_revision = "c12a01e4b901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "layout_annotations",
        sa.Column("layout_id", sa.BigInteger(), primary_key=True),
        sa.Column("annotation_id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("x", sa.Double(), nullable=False),
        sa.Column("y", sa.Double(), nullable=False),
        sa.Column("width", sa.Double()),
        sa.Column("height", sa.Double()),
        sa.Column("text", sa.Text()),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("fill", sa.String(16)),
        sa.Column("border", sa.String(16)),
        sa.Column("size", sa.String(16)),
        sa.ForeignKeyConstraint(["user_id", "layout_id"], ["layouts.user_id", "layouts.id"],
                             name="fk_layout_annotations_owner", ondelete="CASCADE"),
        sa.UniqueConstraint("layout_id", "order_index", name="uq_layout_annotations_order"),
        sa.CheckConstraint("order_index >= 0 AND order_index < 2000", name="ck_annotations_order"),
        sa.CheckConstraint("x > '-Infinity'::float8 AND x < 'Infinity'::float8 AND "
                        "y > '-Infinity'::float8 AND y < 'Infinity'::float8", name="ck_annotations_finite"),
        sa.CheckConstraint("color IN ('gray','blue','green','yellow','red','purple')", name="ck_annotations_color"),
        sa.CheckConstraint("(kind = 'rectangle' AND width IS NOT NULL AND height IS NOT NULL "
                        "AND width > 0 AND width < 'Infinity'::float8 "
                        "AND height > 0 AND height < 'Infinity'::float8 "
                        "AND text IS NULL AND size IS NULL AND fill IS NOT NULL AND border IS NOT NULL "
                        "AND fill IN ('none','light','medium') AND border IN ('thin','normal','thick')) OR "
                        "(kind = 'text' AND width IS NULL AND height IS NULL AND fill IS NULL AND border IS NULL "
                        "AND text IS NOT NULL AND char_length(text) BETWEEN 1 AND 2000 "
                        "AND char_length(btrim(text, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0 AND size IS NOT NULL "
                        "AND size IN ('small','medium','large'))", name="ck_annotations_kind_fields"),
    )


def downgrade() -> None:
    op.drop_table("layout_annotations")
