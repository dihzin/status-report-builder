from __future__ import annotations

from pathlib import Path


def get_app_version() -> str:
    version_file = Path(__file__).with_name("VERSION")
    try:
        value = version_file.read_text(encoding="utf-8").strip()
        if value:
            return value
    except OSError:
        pass
    return "0.0.0"


APP_VERSION = get_app_version()
