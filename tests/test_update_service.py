from backend.services.update_service import _is_newer, _normalize_version, UpdateService


def test_normalize_version_basic():
    assert _normalize_version("v0.6.0") == (0, 6, 0)
    assert _normalize_version("0.6.1-beta") == (0, 6, 1)
    assert _normalize_version("") == (0,)


def test_is_newer_semver():
    assert _is_newer("v0.6.1", "0.6.0")
    assert not _is_newer("v0.6.0", "0.6.0")
    assert not _is_newer("v0.5.9", "0.6.0")


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

