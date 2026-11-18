"""Record which layouts come from the initial workspace save."""

from alembic import context, op
import sqlalchemy as sa

revision = "a20c02f1a901"
down_revision = "a20c03de1e7e"


def upgrade():
    op.add_column(
        "layouts",
        sa.Column("is_initial", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


    # Existing layouts lack provenance. The operator may attest to one known
    # initial layout in this database when applying the migration.
    verified = context.get_x_argument(as_dictionary=True).get("verified_initial_layout")
    if verified is None:
        return
    user_id, layout_id = map(int, verified.split(":"))
    result = op.get_bind().execute(sa.text("""
        UPDATE layouts AS initial
        SET is_initial = true
        WHERE initial.id = :layout_id AND initial.user_id = :user_id
          AND initial.name = 'Main' AND initial.is_default
          AND NOT EXISTS (
              SELECT 1 FROM layouts
              WHERE user_id = :user_id AND id <> :layout_id
          )
          AND NOT EXISTS (SELECT 1 FROM nodes WHERE user_id = :user_id)
          AND NOT EXISTS (SELECT 1 FROM edges WHERE user_id = :user_id)
          AND NOT EXISTS (SELECT 1 FROM layout_annotations WHERE user_id = :user_id)
          AND NOT EXISTS (SELECT 1 FROM layout_node_positions WHERE user_id = :user_id)
    """), {"user_id": user_id, "layout_id": layout_id})
    if result.rowcount != 1:
        raise RuntimeError("Verified initial layout is missing or the workspace is not empty")


def downgrade():
    op.drop_column("layouts", "is_initial")
