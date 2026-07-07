from __future__ import annotations

import hashlib
import io
import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from backend.services.update_service import (
    EXPECTED_PORTABLE_ASSET,
    EXPECTED_PORTABLE_CHECKSUM_ASSET,
    UpdateService,
    _is_newer,
    _normalize_version,
    _ps_single_quote,
)


class _FakeResponse:
    def __init__(self, payload: bytes):
        self._payload = payload
        self._buffer = io.BytesIO(payload)

    def read(self, size: int = -1) -> bytes:
        return self._buffer.read(size)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.fixture
def portable_env(tmp_path, monkeypatch):
    monkeypatch.setenv("STATUS_BUILDER_APP_ROOT", str(tmp_path))
    monkeypatch.setattr("backend.services.update_service._runtime_mode", lambda: "portable")
    monkeypatch.setattr("backend.services.update_service._portable_root", lambda: tmp_path)
    return tmp_path


def _make_zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("StatusReportBuilder.exe", b"fake exe payload")
        zf.writestr("frontend/index.html", "<html></html>")
    return buffer.getvalue()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _release_payload(*, include_zip: bool = True, include_checksum: bool = True) -> dict:
    assets = []
    if include_zip:
        assets.append(
            {
                "name": EXPECTED_PORTABLE_ASSET,
                "browser_download_url": "https://example.test/portable.zip",
            }
        )
    if include_checksum:
        assets.append(
            {
                "name": EXPECTED_PORTABLE_CHECKSUM_ASSET,
                "browser_download_url": "https://example.test/portable.zip.sha256",
            }
        )
    return {
        "tag_name": "v9.9.9",
        "html_url": "https://example.test/release",
        "name": "Release 9.9.9",
        "published_at": "2026-06-02T00:00:00Z",
        "assets": assets,
    }


def _install_urlopen(monkeypatch, mapping: dict[str, bytes], failures: set[str] | None = None):
    failures = failures or set()

    def _fake_urlopen(req, timeout=0):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if url in failures:
            raise OSError(f"boom: {url}")
        if url not in mapping:
            raise AssertionError(f"url inesperada: {url}")
        return _FakeResponse(mapping[url])

    monkeypatch.setattr("backend.services.update_service.urlopen", _fake_urlopen)


def test_normalize_version_basic():
    assert _normalize_version("v0.6.0") == (0, 6, 0)
    assert _normalize_version("0.6.1-beta") == (0, 6, 1)
    assert _normalize_version("") == (0,)


def test_is_newer_semver():
    assert _is_newer("v0.6.1", "0.6.0")
    assert not _is_newer("v0.6.0", "0.6.0")
    assert not _is_newer("v0.5.9", "0.6.0")


def test_ps_single_quote_escapes_apostrophes():
    assert _ps_single_quote(r"C:\Apps\Salva's App") == r"'C:\Apps\Salva''s App'"


def test_download_blocked_in_dev_mode(monkeypatch):
    monkeypatch.setattr("backend.services.update_service._runtime_mode", lambda: "dev")
    svc = UpdateService()
    payload = svc.download()
    assert payload["ok"] is False
    assert "versão portátil" in payload["error"]


def test_apply_blocked_in_dev_mode(monkeypatch):
    monkeypatch.setattr("backend.services.update_service._runtime_mode", lambda: "dev")
    svc = UpdateService()
    payload = svc.apply()
    assert payload["ok"] is False
    assert "versão portátil" in payload["error"]


def test_check_detects_checksum_asset(monkeypatch, portable_env):
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload(include_zip=True, include_checksum=True)
            ).encode("utf-8")
        },
    )
    svc = UpdateService()

    payload = svc.check().as_dict()

    assert payload["ok"] is True
    assert payload["expected_asset_found"] is True
    assert payload["expected_checksum_asset_found"] is True
    assert payload["expected_checksum_asset_name"] == EXPECTED_PORTABLE_CHECKSUM_ASSET


def test_download_succeeds_with_valid_checksum(monkeypatch, portable_env):
    zip_bytes = _make_zip_bytes()
    checksum = _sha256(zip_bytes)
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload()
            ).encode("utf-8"),
            "https://example.test/portable.zip": zip_bytes,
            "https://example.test/portable.zip.sha256": f"{checksum}  {EXPECTED_PORTABLE_ASSET}\n".encode("utf-8"),
        },
    )
    svc = UpdateService()

    payload = svc.download()

    assert payload["ok"] is True
    download_path = Path(payload["downloaded_file"])
    assert download_path.exists()
    state = json.loads((portable_env / "updates" / "update_state.json").read_text(encoding="utf-8"))
    assert state["downloaded_file"] == str(download_path)
    assert state["expected_sha256"] == checksum


def test_download_fails_when_checksum_asset_is_missing(monkeypatch, portable_env):
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload(include_zip=True, include_checksum=False)
            ).encode("utf-8")
        },
    )
    svc = UpdateService()

    payload = svc.download()

    assert payload["ok"] is False
    assert "checksum SHA-256 esperado" in payload["error"]


@pytest.mark.parametrize(
    "checksum_text",
    [
        "",
        "   \n",
        "not-a-hash",
        "1234  StatusReportBuilder_Portable.zip",
    ],
)
def test_download_fails_when_checksum_is_invalid(monkeypatch, portable_env, checksum_text):
    zip_bytes = _make_zip_bytes()
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload()
            ).encode("utf-8"),
            "https://example.test/portable.zip": zip_bytes,
            "https://example.test/portable.zip.sha256": checksum_text.encode("utf-8"),
        },
    )
    svc = UpdateService()

    payload = svc.download()

    assert payload["ok"] is False
    assert "ausente ou inválido" in payload["error"]
    assert not list((portable_env / "updates").glob("*.zip"))


def test_download_fails_when_checksum_fetch_has_network_error(monkeypatch, portable_env):
    zip_bytes = _make_zip_bytes()
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload()
            ).encode("utf-8"),
            "https://example.test/portable.zip": zip_bytes,
        },
        failures={"https://example.test/portable.zip.sha256"},
    )
    svc = UpdateService()

    payload = svc.download()

    assert payload["ok"] is False
    assert "Falha ao obter checksum SHA-256" in payload["error"]
    assert not list((portable_env / "updates").glob("*.zip"))


def test_download_fails_when_checksum_diverges_even_with_valid_zip(monkeypatch, portable_env):
    zip_bytes = _make_zip_bytes()
    wrong_checksum = "0" * 64
    _install_urlopen(
        monkeypatch,
        {
            "https://api.github.com/repos/dihzin/status-report-builder/releases/latest": json.dumps(
                _release_payload()
            ).encode("utf-8"),
            "https://example.test/portable.zip": zip_bytes,
            "https://example.test/portable.zip.sha256": f"{wrong_checksum}  {EXPECTED_PORTABLE_ASSET}\n".encode("utf-8"),
        },
    )
    svc = UpdateService()

    payload = svc.download()

    assert payload["ok"] is False
    assert "Checksum SHA-256 divergente" in payload["error"]
    assert not list((portable_env / "updates").glob("*.zip"))


def test_apply_fails_when_persisted_checksum_is_missing(portable_env):
    zip_path = portable_env / "updates" / "pkg.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_path.write_bytes(_make_zip_bytes())

    svc = UpdateService()
    svc._last_download_path = zip_path
    svc._last_download_sha256 = None

    payload = svc.apply()

    assert payload["ok"] is False
    assert "Checksum SHA-256 ausente" in payload["error"]


def test_apply_fails_when_zip_is_valid_but_checksum_diverges(monkeypatch, portable_env):
    zip_path = portable_env / "updates" / "pkg.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_bytes = _make_zip_bytes()
    zip_path.write_bytes(zip_bytes)

    popen_calls = []
    monkeypatch.setattr("backend.services.update_service.subprocess.Popen", lambda *args, **kwargs: popen_calls.append((args, kwargs)))

    svc = UpdateService()
    svc._last_download_path = zip_path
    svc._last_download_sha256 = "f" * 64

    payload = svc.apply()

    assert payload["ok"] is False
    assert "Checksum SHA-256 divergente" in payload["error"]
    assert popen_calls == []


def test_apply_happy_path_preserved_after_checksum_validation(monkeypatch, portable_env):
    zip_path = portable_env / "updates" / "pkg.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_bytes = _make_zip_bytes()
    zip_path.write_bytes(zip_bytes)
    checksum = _sha256(zip_bytes)

    script_path = portable_env / "updates" / "apply_update.ps1"
    script_path.write_text("Write-Host ok", encoding="utf-8")
    monkeypatch.setattr("backend.services.update_service.UpdateService._build_apply_script", lambda self, path, pid: script_path)

    popen_calls = []

    def _fake_popen(*args, **kwargs):
        popen_calls.append((args, kwargs))
        return object()

    monkeypatch.setattr("backend.services.update_service.subprocess.Popen", _fake_popen)
    monkeypatch.setattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0, raising=False)
    monkeypatch.setattr(subprocess, "DETACHED_PROCESS", 0, raising=False)

    svc = UpdateService()
    svc._last_download_path = zip_path
    svc._last_download_sha256 = checksum

    payload = svc.apply()

    assert payload["ok"] is True
    assert "Instalação iniciada" in payload["message"]
    assert len(popen_calls) == 1


def test_build_apply_script_waits_for_old_process_and_logs_restart(monkeypatch, portable_env):
    monkeypatch.setattr("backend.services.update_service.sys.executable", str(portable_env / "StatusReportBuilder.exe"))
    monkeypatch.setattr("backend.services.update_service.time.time", lambda: 1717333200)

    svc = UpdateService()
    script_path = svc._build_apply_script(portable_env / "updates" / "pkg.zip", 4242)
    content = script_path.read_text(encoding="utf-8")

    assert "$CurrentPid = 4242" in content
    assert "Stop-Process -Id $CurrentPid -Force" in content
    assert "-WorkingDirectory $InstallDir" in content
    assert "Aguardando encerramento do processo antigo" in content
    assert "Rollback concluído." in content
    assert "Relançando executável" in content
