from collections.abc import Generator
from datetime import UTC
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import DateTime, MetaData, TypeDecorator, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class UTCDateTime(TypeDecorator):
    """SQLite drops timezone information; normalize loaded values to the API's UTC contract."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def make_engine(url):
    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args=(
            {"check_same_thread": False, "timeout": 20} if url.startswith("sqlite") else {}
        ),
    )
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, record):
            connection.execute("PRAGMA foreign_keys=ON")

    return engine


def get_db(request: Request) -> Generator[Session, None, None]:
    with request.app.state.session_factory() as db:
        try:
            yield db
        except Exception:
            db.rollback()
            raise


Db = Annotated[Session, Depends(get_db)]
