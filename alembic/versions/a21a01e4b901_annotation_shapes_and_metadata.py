"""Add ellipse and optional shape metadata."""

from alembic import op
import sqlalchemy as sa

revision = "a21a01e4b901"
down_revision = "a20c02f1a901"
branch_labels = None
depends_on = None

TABLE = "layout_annotations"
CONSTRAINT = "ck_annotations_kind_fields"
BASELINE_CHECK = (
    "(kind = 'rectangle' AND width IS NOT NULL AND height IS NOT NULL "
                        "AND width > 0 AND width < 'Infinity'::float8 "
                        "AND height > 0 AND height < 'Infinity'::float8 "
                        "AND text IS NULL AND size IS NULL AND fill IS NOT NULL AND border IS NOT NULL "
                        "AND fill IN ('none','light','medium') AND border IN ('thin','normal','thick')) OR "
                        "(kind = 'text' AND width IS NULL AND height IS NULL AND fill IS NULL AND border IS NULL "
                        "AND text IS NOT NULL AND char_length(text) BETWEEN 1 AND 2000 "
                        "AND char_length(btrim(text, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0 AND size IS NOT NULL "
                        "AND size IN ('small','medium','large'))"
)
SHAPE_CHECK = (
    "(kind IN ('rectangle','ellipse') AND width IS NOT NULL AND height IS NOT NULL "
                        "AND width > 0 AND width < 'Infinity'::float8 "
                        "AND height > 0 AND height < 'Infinity'::float8 "
                        "AND text IS NULL AND size IS NULL AND fill IS NOT NULL AND border IS NOT NULL "
                        "AND fill IN ('none','light','medium') AND border IN ('thin','normal','thick') "
                        "AND (name IS NULL OR char_length(btrim(name, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0) "
                        "AND (description IS NULL OR (char_length(description) <= 2000 "
                        "AND char_length(btrim(description, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0))) OR "
                        "(kind = 'text' AND width IS NULL AND height IS NULL AND fill IS NULL AND border IS NULL "
                        "AND text IS NOT NULL AND char_length(text) BETWEEN 1 AND 2000 "
                        "AND char_length(btrim(text, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0 AND size IS NOT NULL "
                        "AND size IN ('small','medium','large') AND name IS NULL AND description IS NULL)"
)


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("name", sa.String(200)))
    op.add_column(TABLE, sa.Column("description", sa.Text()))
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, SHAPE_CHECK)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("LOCK TABLE layout_annotations IN ACCESS EXCLUSIVE MODE"))
    if bind.scalar(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM layout_annotations
            WHERE kind = 'ellipse' OR name IS NOT NULL OR description IS NOT NULL
        )
    """)):
        raise RuntimeError("Downgrade would lose ellipse annotations or shape metadata")
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, BASELINE_CHECK)
    op.drop_column(TABLE, "description")
    op.drop_column(TABLE, "name")
