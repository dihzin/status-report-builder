import asyncio
import base64
import sqlite3
from pathlib import Path

from pptx import Presentation

from backend.db import ensure_db
from backend.excel_reader import create_template
from backend.exporter import export_pdf, export_pptx
from backend.services.report_service import ReportService


def _root(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _db_path(root: Path) -> Path:
    return root / "data" / "status_builder.db"


def _excel_path(root: Path) -> Path:
    return root / "status_projeto.xlsx"


def _service(root: Path) -> ReportService:
    return ReportService(root)


def _patch_db(monkeypatch, root: Path):
    import backend.db as db_module
    monkeypatch.setattr(db_module, "ROOT_DIR", root)
    monkeypatch.setattr(db_module, "DATA_DIR", root / "data")
    monkeypatch.setattr(db_module, "DB_PATH", root / "data" / "status_builder.db")


def _current_snapshot_meta(db_path: Path):
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("SELECT source, version_number FROM report_snapshots WHERE project_key='default' AND is_current=1")
    row = cur.fetchone()
    conn.close()
    return row


def test_first_run_without_db_with_excel_seeds_sqlite(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    create_template(str(_excel_path(root)))

    svc = _service(root)
    payload = svc.get_status_payload()

    assert payload["reportData"]
    assert _db_path(root).exists()
    src, version = _current_snapshot_meta(_db_path(root))
    assert src == "excel_import"
    assert version == 1


def test_existing_db_without_excel_still_runs(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    excel = _excel_path(root)
    create_template(str(excel))

    svc = _service(root)
    svc.get_status_payload()
    excel.unlink()

    payload = svc.get_status_payload()
    assert payload["reportData"]


def test_empty_db_without_excel_returns_friendly_error(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    ensure_db()

    svc = _service(root)
    try:
        svc.get_status_payload()
        assert False, "Era esperado erro quando SQLite está vazio e Excel ausente"
    except RuntimeError as exc:
        assert "SQLite vazio" in str(exc)


def test_save_legacy_and_canonical_with_unique_versions_and_single_current(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    create_template(str(_excel_path(root)))
    svc = _service(root)
    svc.get_status_payload()

    svc.save_payload({"config": {"project_subtitle": "LEGACY_SUB"}})
    svc.save_payload({"reportData": {"config": {"project_name": "CANON_NAME"}}})

    data = svc.get_status_payload()
    assert data["reportData"]["config"]["project_name"] == "CANON_NAME"
    assert data["reportData"]["config"]["project_subtitle"] == "LEGACY_SUB"

    conn = sqlite3.connect(str(_db_path(root)))
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM report_snapshots WHERE project_key='default' AND is_current=1")
    current_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM (SELECT version_number, COUNT(*) c FROM report_snapshots WHERE project_key='default' GROUP BY version_number HAVING c > 1)")
    duplicated_versions = cur.fetchone()[0]
    conn.close()

    assert current_count == 1
    assert duplicated_versions == 0


def test_excel_manual_change_does_not_override_sqlite(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    excel = _excel_path(root)
    create_template(str(excel))
    svc = _service(root)
    svc.get_status_payload()
    svc.save_payload({"reportData": {"config": {"project_name": "SQLITE_PRIORITY"}}})

    # altera Excel manualmente
    import openpyxl
    wb = openpyxl.load_workbook(str(excel))
    ws = wb["CONFIG"]
    for row in ws.iter_rows(min_row=1):
        if row[0].value == "project_name":
            row[1].value = "EXCEL_OVERRIDE_ATTEMPT"
            break
    wb.save(str(excel))
    wb.close()

    payload = svc.get_status_payload()
    assert payload["reportData"]["config"]["project_name"] == "SQLITE_PRIORITY"


def test_export_pdf_and_pptx_use_sqlite_data(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    create_template(str(_excel_path(root)))
    svc = _service(root)
    svc.get_status_payload()
    svc.save_payload({"reportData": {"config": {"project_name": "PPTX_SQLITE_NAME"}}})

    import backend.exporter as exporter_module
    monkeypatch.setattr(exporter_module, "ROOT_DIR", root)
    monkeypatch.setattr(exporter_module, "PDF_DIR", root / "exports" / "pdf")
    monkeypatch.setattr(exporter_module, "PPTX_DIR", root / "exports" / "pptx")
    exporter_module.PDF_DIR.mkdir(parents=True, exist_ok=True)
    exporter_module.PPTX_DIR.mkdir(parents=True, exist_ok=True)

    def fake_worker(cmd: dict, timeout: int = 60):
        p = Path(cmd["path"])
        p.parent.mkdir(parents=True, exist_ok=True)
        action = cmd.get("action")
        if action == "pdf":
            p.write_bytes(b"%PDF-FAKE")
        elif action == "screenshot":
            # 1x1 PNG branco
            png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zl9sAAAAASUVORK5CYII="
            p.write_bytes(base64.b64decode(png_b64))

    monkeypatch.setattr(exporter_module, "_run_worker", fake_worker)

    pdf_path = asyncio.run(export_pdf("http://127.0.0.1:8000"))
    pptx_path = asyncio.run(export_pptx("http://127.0.0.1:8000", data_provider=svc.get_current_report_data))

    assert Path(pdf_path).exists()
    assert Path(pptx_path).exists()

    prs = Presentation(pptx_path)
    slide1_text = []
    for shape in prs.slides[0].shapes:
        if hasattr(shape, "text"):
            slide1_text.append(shape.text)
    assert any("PPTX_SQLITE_NAME" in t for t in slide1_text)


def test_hardening_indexes_are_created(tmp_path, monkeypatch):
    root = _root(tmp_path)
    _patch_db(monkeypatch, root)
    ensure_db()

    conn = sqlite3.connect(str(root / "data" / "status_builder.db"))
    cur = conn.cursor()
    cur.execute("PRAGMA index_list('report_snapshots')")
    indexes = {r[1] for r in cur.fetchall()}
    conn.close()

    assert "uq_report_snapshots_project_version" in indexes
    assert "uq_report_snapshots_single_current" in indexes
