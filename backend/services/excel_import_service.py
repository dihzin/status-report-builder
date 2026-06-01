from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from backend.excel_reader import read_excel
from backend.report_data import build_report_data, to_legacy_data_shape


class ExcelImportService:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.excel_path = self.root_dir / "status_projeto.xlsx"
        self.backup_dir = self.root_dir / "backups"

    def backup_excel_if_exists(self) -> Path | None:
        if not self.excel_path.exists():
            return None
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = self.backup_dir / f"status_projeto_{ts}.xlsx"
        shutil.copy2(self.excel_path, out)
        return out

    def import_from_excel(self) -> tuple[dict, dict, list[str], str | None]:
        raw_data, file_error = read_excel(str(self.excel_path))
        if not isinstance(raw_data, dict):
            raise RuntimeError(file_error or "Sem dados válidos no Excel para importação inicial")

        report_data = build_report_data(raw_data)
        report_data.setdefault("meta", {})["source"] = "excel_import"
        legacy_data = to_legacy_data_shape(report_data)
        return report_data, legacy_data, [], file_error
