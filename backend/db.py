from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "status_builder.db"


def _dict_factory(cursor: sqlite3.Cursor, row: tuple):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def ensure_db() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_key TEXT NOT NULL UNIQUE,
                project_name TEXT,
                sponsor TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS report_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_key TEXT NOT NULL,
                report_name TEXT,
                report_date TEXT,
                version_number INTEGER NOT NULL DEFAULT 1,
                is_current INTEGER NOT NULL DEFAULT 1,
                source TEXT NOT NULL,
                report_data_json TEXT NOT NULL,
                legacy_data_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_report_snapshots_project_current
            ON report_snapshots(project_key, is_current)
            """
        )
        # Migração idempotente de hardening:
        # 1) Apenas um snapshot atual por projeto.
        conn.execute(
            """
            UPDATE report_snapshots
            SET is_current = CASE
                WHEN id = (
                    SELECT id FROM report_snapshots rs2
                    WHERE rs2.project_key = report_snapshots.project_key
                    ORDER BY rs2.id DESC
                    LIMIT 1
                ) THEN 1 ELSE 0
            END
            WHERE project_key IN (SELECT DISTINCT project_key FROM report_snapshots)
            """
        )
        # 2) Evita duplicidade de version_number por project_key sem quebrar DB existente.
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_report_snapshots_project_version
            ON report_snapshots(project_key, version_number)
            """
        )
        # 3) Garante no máximo um current=1 por project_key.
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_report_snapshots_single_current
            ON report_snapshots(project_key)
            WHERE is_current = 1
            """
        )
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = _dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


@contextmanager
def transaction(immediate: bool = False):
    conn = get_connection()
    try:
        if immediate:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
