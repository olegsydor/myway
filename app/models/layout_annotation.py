from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Double, ForeignKeyConstraint, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LayoutAnnotation(Base):
    __tablename__ = "layout_annotations"
    # Text whitespace below mirrors Python str.strip(), including Unicode spaces.
    __table_args__ = (
        ForeignKeyConstraint(["user_id", "layout_id"], ["layouts.user_id", "layouts.id"],
                             name="fk_layout_annotations_owner", ondelete="CASCADE"),
        UniqueConstraint("layout_id", "order_index", name="uq_layout_annotations_order"),
        CheckConstraint("order_index >= 0 AND order_index < 2000", name="ck_annotations_order"),
        CheckConstraint("x > '-Infinity'::float8 AND x < 'Infinity'::float8 AND "
                        "y > '-Infinity'::float8 AND y < 'Infinity'::float8", name="ck_annotations_finite"),
        CheckConstraint("color IN ('gray','blue','green','yellow','red','purple')", name="ck_annotations_color"),
        CheckConstraint("(kind = 'rectangle' AND width IS NOT NULL AND height IS NOT NULL "
                        "AND width > 0 AND width < 'Infinity'::float8 "
                        "AND height > 0 AND height < 'Infinity'::float8 "
                        "AND text IS NULL AND size IS NULL AND fill IS NOT NULL AND border IS NOT NULL "
                        "AND fill IN ('none','light','medium') AND border IN ('thin','normal','thick')) OR "
                        "(kind = 'text' AND width IS NULL AND height IS NULL AND fill IS NULL AND border IS NULL "
                        "AND text IS NOT NULL AND char_length(text) BETWEEN 1 AND 2000 "
                        "AND char_length(btrim(text, U&'\\0009\\000A\\000B\\000C\\000D\\001C\\001D\\001E\\001F\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000')) > 0 AND size IS NOT NULL "
                        "AND size IN ('small','medium','large'))", name="ck_annotations_kind_fields"),
    )

    layout_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    annotation_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    x: Mapped[float] = mapped_column(Double, nullable=False)
    y: Mapped[float] = mapped_column(Double, nullable=False)
    width: Mapped[float | None] = mapped_column(Double)
    height: Mapped[float | None] = mapped_column(Double)
    text: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    fill: Mapped[str | None] = mapped_column(String(16))
    border: Mapped[str | None] = mapped_column(String(16))
    size: Mapped[str | None] = mapped_column(String(16))
