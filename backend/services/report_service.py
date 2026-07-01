from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from backend.db import ensure_db
from backend.excel_reader import create_template
from backend.excel_writer import write_excel
from backend.report_data import build_report_data, to_legacy_data_shape
from backend.repositories.report_repository import ReportRepository
from backend.schema_validator import validate_schema
from backend.services.excel_import_service import ExcelImportService

PROJECT_KEY = "default"
SYNC_SAVE_TO_EXCEL = os.getenv("SYNC_SAVE_TO_EXCEL", "false").strip().lower() == "true"
VALIDATE_EXCEL_SCHEMA = os.getenv("VALIDATE_EXCEL_SCHEMA", "false").strip().lower() == "true"


class ReportService:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.excel_path = self.root_dir / "status_projeto.xlsx"
        self.repo = ReportRepository()
        self.excel_import = ExcelImportService(root_dir)

    @staticmethod
    def _deep_merge(base: dict, patch: dict) -> dict:
        out = dict(base or {})
        for k, v in (patch or {}).items():
            if isinstance(v, dict) and isinstance(out.get(k), dict):
                out[k] = ReportService._deep_merge(out.get(k) or {}, v)
            else:
                out[k] = v
        return out

    def initialize_storage(self) -> None:
        ensure_db()

    def ensure_seeded(self) -> None:
        current = self.repo.get_current_snapshot(PROJECT_KEY)
        if current:
            return

        if not self.excel_path.exists():
            self.excel_path.parent.mkdir(parents=True, exist_ok=True)
            create_template(str(self.excel_path))

        self.excel_import.backup_excel_if_exists()
        report_data, legacy_data, _, _ = self.excel_import.import_from_excel()
        cfg = report_data.get("config", {}) if isinstance(report_data, dict) else {}
        self.repo.upsert_project(PROJECT_KEY, cfg.get("project_name"), cfg.get("sponsor"))
        self.repo.create_snapshot(
            project_key=PROJECT_KEY,
            report_name=(cfg or {}).get("report_name"),
            report_date=(cfg or {}).get("report_date"),
            source="excel_import",
            report_data=report_data,
            legacy_data=legacy_data,
        )

    def get_status_payload(self) -> dict[str, Any]:
        self.initialize_storage()
        self.ensure_seeded()

        current = self.repo.decode_snapshot(self.repo.get_current_snapshot(PROJECT_KEY))
        if not current:
            raise RuntimeError("Não foi possível carregar snapshot atual do SQLite")

        report_data = current.get("report_data") or {}
        legacy_data = current.get("legacy_data") or to_legacy_data_shape(report_data)
        validation_errors: list[str] = []
        file_error = None

        if VALIDATE_EXCEL_SCHEMA and self.excel_path.exists():
            try:
                validation_errors = validate_schema(str(self.excel_path))
            except Exception:
                validation_errors = []

        return {
            "data": legacy_data,
            "reportData": report_data,
            "validation_errors": validation_errors,
            "file_error": file_error,
        }

    def save_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.initialize_storage()
        self.ensure_seeded()

        if isinstance(payload, dict) and "reportData" in payload:
            incoming = payload.get("reportData") or {}
            source = "api_save_canonical"
        else:
            incoming = payload if isinstance(payload, dict) else {}
            source = "api_save_legacy"

        current = self.repo.decode_snapshot(self.repo.get_current_snapshot(PROJECT_KEY)) or {}
        current_report = current.get("report_data") or build_report_data(current.get("legacy_data") or {})

        merged = self._deep_merge(current_report, incoming)
        report_data = build_report_data(merged)
        report_data.setdefault("meta", {})["source"] = "sqlite"
        legacy_data = to_legacy_data_shape(report_data)

        cfg = report_data.get("config", {}) if isinstance(report_data, dict) else {}
        self.repo.upsert_project(PROJECT_KEY, cfg.get("project_name"), cfg.get("sponsor"))
        snapshot = self.repo.create_snapshot(
            project_key=PROJECT_KEY,
            report_name=(cfg or {}).get("report_name"),
            report_date=(cfg or {}).get("report_date"),
            source=source,
            report_data=report_data,
            legacy_data=legacy_data,
        )
        if SYNC_SAVE_TO_EXCEL and self.excel_path.exists():
            write_excel(str(self.excel_path), legacy_data)

        return {
            "ok": True,
            "source": "sqlite",
            "project_key": PROJECT_KEY,
            "version": snapshot.get("version_number"),
            "updated_at": snapshot.get("updated_at"),
        }

    def get_current_report_data(self) -> dict[str, Any]:
        self.initialize_storage()
        self.ensure_seeded()
        current = self.repo.decode_snapshot(self.repo.get_current_snapshot(PROJECT_KEY))
        if not current:
            return {}
        return current.get("report_data") or {}
