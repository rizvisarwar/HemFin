from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import APP_SCHEMA, Base


class Category(Base):
    """A contract/expense/income category. `space_id` NULL means a system (seeded) category."""

    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("kind IN ('expense', 'income')", name="ck_categories_kind"),
        # Keys are unique per scope: one system namespace, plus one per space.
        Index(
            "uq_categories_system_key",
            "key",
            unique=True,
            postgresql_where=text("space_id IS NULL"),
        ),
        Index(
            "uq_categories_space_key",
            "space_id",
            "key",
            unique=True,
            postgresql_where=text("space_id IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    key: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    parent_key: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    space_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(f"{APP_SCHEMA}.spaces.id", ondelete="CASCADE")
    )
