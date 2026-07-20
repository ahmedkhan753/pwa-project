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

        # ── inspectors table ──
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

        # ── inspection_records table ──
        try:
            ir_cols = {col["name"] for col in inspector.get_columns("inspection_records")}
        except Exception:
            ir_cols = set()  # table not yet created (create_all will handle it fresh)

        ir_pending = {
            "paint_json": "TEXT",
        }
        with engine_instance.connect() as conn:
            for col_name, col_type in ir_pending.items():
                if ir_cols and col_name not in ir_cols:
                    conn.execute(text(f"ALTER TABLE inspection_records ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                    log.info(f"Migration: added column inspection_records.{col_name}")

        # ── valuation_deliveries table ──
        # The public documents token was added after the table's first cut, so
        # a dev DB created from the initial version needs the column. On a fresh
        # DB the table doesn't exist yet → create_all builds it with the column
        # and this block is a no-op (guarded by the truthiness of vd_cols).
        try:
            vd_cols = {col["name"] for col in inspector.get_columns("valuation_deliveries")}
        except Exception:
            vd_cols = set()

        vd_pending = {
            "token": "VARCHAR(64)",
        }
        with engine_instance.connect() as conn:
            for col_name, col_type in vd_pending.items():
                if vd_cols and col_name not in vd_cols:
                    conn.execute(text(f"ALTER TABLE valuation_deliveries ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                    log.info(f"Migration: added column valuation_deliveries.{col_name}")

    except Exception as e:
        log.error(f"Migration error: {e}")
