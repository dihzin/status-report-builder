from __future__ import annotations

import contextlib
import json
import logging
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from backend.main import app as fastapi_app


def _portable_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _ensure_dirs(base: Path) -> dict[str, Path]:
    paths = {
        "data": base / "data",
        "exports": base / "exports",
        "pdf": base / "exports" / "pdf",
        "pptx": base / "exports" / "pptx",
        "logs": base / "logs",
        "config": base / "config",
    }
    for p in paths.values():
        p.mkdir(parents=True, exist_ok=True)
    return paths


def _load_settings(config_dir: Path) -> dict:
    settings_path = config_dir / "settings.json"
    default = {"host": "127.0.0.1", "preferred_port": 0, "open_browser": True}
    if settings_path.exists():
        with contextlib.suppress(Exception):
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                default.update(payload)
    settings_path.write_text(json.dumps(default, ensure_ascii=False, indent=2), encoding="utf-8")
    return default


def _find_free_port(host: str, preferred: int = 0) -> int:
    if preferred:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex((host, preferred)) != 0:
                return preferred
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _acquire_lock(root: Path) -> tuple[Path, int]:
    lock_path = root / "app.lock"
    pid = os.getpid()
    if lock_path.exists():
        with contextlib.suppress(Exception):
            old_pid = int(lock_path.read_text(encoding="utf-8").strip() or "0")
            if old_pid > 0:
                os.kill(old_pid, 0)
                raise RuntimeError("Outra instância já está em execução.")
    lock_path.write_text(str(pid), encoding="utf-8")
    return lock_path, pid


def main() -> int:
    base = _portable_root()
    paths = _ensure_dirs(base)
    settings = _load_settings(paths["config"])

    log_path = paths["logs"] / "launcher.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.FileHandler(log_path, encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )

    lock_path = None
    try:
        lock_path, _ = _acquire_lock(base)
        host = str(settings.get("host") or "127.0.0.1")
        port = _find_free_port(host, int(settings.get("preferred_port") or 0))

        os.environ["STATUS_BUILDER_APP_ROOT"] = str(base)
        os.environ["STATUS_BUILDER_DATA_DIR"] = str(paths["data"])
        os.environ["STATUS_BUILDER_DB_PATH"] = str(paths["data"] / "status_report.db")
        os.environ["STATUS_BUILDER_EXPORTS_DIR"] = str(paths["exports"])
        os.environ["STATUS_BUILDER_LOGS_DIR"] = str(paths["logs"])
        os.environ["STATUS_BUILDER_CONFIG_DIR"] = str(paths["config"])
        os.environ["WATCH_EXCEL"] = os.getenv("WATCH_EXCEL", "false")
        os.environ["VALIDATE_EXCEL_SCHEMA"] = os.getenv("VALIDATE_EXCEL_SCHEMA", "false")

        url = f"http://{host}:{port}"
        if bool(settings.get("open_browser", True)):
            threading.Timer(1.2, lambda: webbrowser.open(url)).start()

        logging.info("Iniciando Status Report Builder em %s", url)
        uvicorn.run(fastapi_app, host=host, port=port, log_level="info")
        return 0
    except Exception as exc:
        logging.exception("Falha ao iniciar launcher portable: %s", exc)
        print(f"Falha ao iniciar: {exc}")
        print(f"Detalhes em: {log_path}")
        if getattr(sys, "frozen", False):
            os.system("pause")
        return 1
    finally:
        if lock_path and lock_path.exists():
            with contextlib.suppress(Exception):
                lock_path.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
