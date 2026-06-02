from __future__ import annotations

from backend.app_version import APP_VERSION


def test_app_version_matches_version_file():
    with open("backend/VERSION", "r", encoding="utf-8") as fh:
        expected = fh.read().strip()
    assert APP_VERSION == expected
