from __future__ import annotations

import importlib
from pathlib import Path


def test_db_uses_env_overrides(monkeypatch, tmp_path):
    data_dir = tmp_path / "portable-data"
    db_path = data_dir / "status_report.db"
    monkeypatch.setenv("STATUS_BUILDER_DATA_DIR", str(data_dir))
    monkeypatch.setenv("STATUS_BUILDER_DB_PATH", str(db_path))

    import backend.db as db_module
    importlib.reload(db_module)

    created = db_module.ensure_db()
    assert created == db_path
    assert db_path.exists()


def test_exporter_uses_env_overrides(monkeypatch, tmp_path):
    exports_dir = tmp_path / "portable-exports"
    monkeypatch.setenv("STATUS_BUILDER_EXPORTS_DIR", str(exports_dir))

    import backend.exporter as exporter_module
    importlib.reload(exporter_module)

    assert exporter_module.EXPORTS_DIR == exports_dir
    assert exporter_module.PDF_DIR == exports_dir / "pdf"
    assert exporter_module.PPTX_DIR == exports_dir / "pptx"
    assert exporter_module.PDF_DIR.exists()
    assert exporter_module.PPTX_DIR.exists()


def test_launcher_creates_structure_and_finds_port(tmp_path):
    import portable_launcher as launcher

    paths = launcher._ensure_dirs(tmp_path)
    assert all(path.exists() for path in paths.values())

    port = launcher._find_free_port("127.0.0.1", 0)
    assert isinstance(port, int)
    assert port > 0
