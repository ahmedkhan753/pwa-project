"""
Database Configuration
======================
SQLAlchemy setup for the inspectors table.
Uses SQLite for simplicity (file-based, no external DB needed).
For production with Docker, uses PostgreSQL via DATABASE_URL env var.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./inspectors.db")

# SQLite needs check_same_thread=False
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_db(engine_instance) -> None:
    """
    Run lightweight column-level migrations that create_all() can't handle
    (adding columns to existing tables). Safe to call on every startup.
    """
    import logging
    from sqlalchemy import text, inspect as sa_inspect

    log = logging.getLogger("database.migrate")

    try:
        inspector = sa_inspect(engine_instance)
        existing_cols = {col["name"] for col in inspector.get_columns("inspectors")}

        pending = {
            "bitrix_list_id": "VARCHAR(20)",
        }

        with engine_instance.connect() as conn:
            for col_name, col_type in pending.items():
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE inspectors ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                    log.info(f"Migration: added column inspectors.{col_name}")
                else:
                    log.debug(f"Migration: inspectors.{col_name} already exists — skip")

    except Exception as e:
        log.error(f"Migration error: {e}")
