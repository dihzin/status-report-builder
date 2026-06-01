from __future__ import annotations

import json
from typing import Any

from backend.db import transaction


class ReportRepository:
    def get_current_snapshot(self, project_key: str) -> dict[str, Any] | None:
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT * FROM report_snapshots
                WHERE project_key = ? AND is_current = 1
                ORDER BY id DESC
                LIMIT 1
                """,
                (project_key,),
            ).fetchone()
        return row

    def upsert_project(self, project_key: str, project_name: str | None, sponsor: str | None) -> None:
        with transaction() as conn:
            existing = conn.execute(
                "SELECT id FROM projects WHERE project_key = ?",
                (project_key,),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE projects
                    SET project_name = ?, sponsor = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE project_key = ?
                    """,
                    (project_name, sponsor, project_key),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO projects(project_key, project_name, sponsor)
                    VALUES (?, ?, ?)
                    """,
                    (project_key, project_name, sponsor),
                )

    def create_snapshot(
        self,
        project_key: str,
        report_name: str | None,
        report_date: str | None,
        source: str,
        report_data: dict[str, Any],
        legacy_data: dict[str, Any],
    ) -> dict[str, Any]:
        with transaction(immediate=True) as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(version_number), 0) AS max_version FROM report_snapshots WHERE project_key = ?",
                (project_key,),
            ).fetchone()
            version = int((row or {}).get("max_version") or 0) + 1
            conn.execute(
                "UPDATE report_snapshots SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE project_key = ? AND is_current = 1",
                (project_key,),
            )
            conn.execute(
                """
                INSERT INTO report_snapshots(
                    project_key, report_name, report_date, version_number,
                    is_current, source, report_data_json, legacy_data_json
                ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    project_key,
                    report_name,
                    report_date,
                    version,
                    source,
                    json.dumps(report_data, ensure_ascii=False),
                    json.dumps(legacy_data, ensure_ascii=False),
                ),
            )
            row = conn.execute(
                """
                SELECT * FROM report_snapshots
                WHERE project_key = ? AND is_current = 1
                ORDER BY id DESC
                LIMIT 1
                """,
                (project_key,),
            ).fetchone()
        return row or {}

    @staticmethod
    def decode_snapshot(snapshot: dict[str, Any] | None) -> dict[str, Any] | None:
        if not snapshot:
            return None
        out = dict(snapshot)
        out["report_data"] = json.loads(out.get("report_data_json") or "{}")
        out["legacy_data"] = json.loads(out.get("legacy_data_json") or "{}")
        return out
