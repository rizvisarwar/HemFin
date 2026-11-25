from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from hemfin.core.db import Base


class User(Base):
    """App user. `id` is the Supabase auth user id (the token `sub`)."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
