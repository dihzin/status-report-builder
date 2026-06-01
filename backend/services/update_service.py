from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.app_version import APP_VERSION

EXPECTED_PORTABLE_ASSET = "StatusReportBuilder_Portable.zip"


def _normalize_version(raw: str) -> tuple[int, ...]:
    text = (raw or "").strip().lower()
    if text.startswith("v"):
        text = text[1:]
    text = text.split("-", 1)[0]
    nums = [int(x) for x in re.findall(r"\d+", text)]
    return tuple(nums) if nums else (0,)


def _is_newer(latest: str, current: str) -> bool:
    a = list(_normalize_version(latest))
    b = list(_normalize_version(current))
    size = max(len(a), len(b))
    a += [0] * (size - len(a))
    b += [0] * (size - len(b))
    return tuple(a) > tuple(b)


def _runtime_mode() -> str:
    return "portable" if getattr(sys, "frozen", False) else "dev"


def _portable_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent.parent


def _updates_dir() -> Path:
    base = Path(os.getenv("STATUS_BUILDER_APP_ROOT", str(_portable_root()))).resolve()
    upd = base / "updates"
    upd.mkdir(parents=True, exist_ok=True)
    return upd


@dataclass
class UpdateCheckResult:
    ok: bool
    current_version: str
    latest_version: str | None
    has_update: bool
    release_url: str | None
    release_name: str | None
    published_at: str | None
    expected_asset_name: str
    expected_asset_found: bool
    expected_asset_url: str | None
    mode: str
    check_only: bool
    message: str | None = None
    error: str | None = None
    downloaded_file: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "current_version": self.current_version,
            "latest_version": self.latest_version,
            "has_update": self.has_update,
            "release_url": self.release_url,
            "release_name": self.release_name,
            "published_at": self.published_at,
            "expected_asset_name": self.expected_asset_name,
            "expected_asset_found": self.expected_asset_found,
            "expected_asset_url": self.expected_asset_url,
            "downloaded_file": self.downloaded_file,
            "mode": self.mode,
            "capabilities": {
                "check_only": self.check_only,
                "download_enabled": self.mode == "portable",
                "apply_enabled": self.mode == "portable",
            },
            "message": self.message,
            "error": self.error,
        }


class UpdateService:
    def __init__(self) -> None:
        self.current_version = APP_VERSION
        self.repo = os.getenv("STATUS_BUILDER_GITHUB_REPO", "dihzin/status-report-builder")
        self.api_url = os.getenv(
            "STATUS_BUILDER_GITHUB_RELEASES_API",
            f"https://api.github.com/repos/{self.repo}/releases/latest",
        )
        self._last_download_path: Path | None = None

    def check(self) -> UpdateCheckResult:
        mode = _runtime_mode()
        req = Request(
            self.api_url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "StatusReportBuilder-Updater/1.0",
            },
        )
        try:
            with urlopen(req, timeout=8) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except HTTPError:
            return UpdateCheckResult(
                ok=False,
                current_version=self.current_version,
                latest_version=None,
                has_update=False,
                release_url=None,
                release_name=None,
                published_at=None,
                expected_asset_name=EXPECTED_PORTABLE_ASSET,
                expected_asset_found=False,
                expected_asset_url=None,
                mode=mode,
                check_only=False,
                error="GitHub indisponível no momento. Tente novamente em instantes.",
            )
        except URLError:
            return UpdateCheckResult(
                ok=False,
                current_version=self.current_version,
                latest_version=None,
                has_update=False,
                release_url=None,
                release_name=None,
                published_at=None,
                expected_asset_name=EXPECTED_PORTABLE_ASSET,
                expected_asset_found=False,
                expected_asset_url=None,
                mode=mode,
                check_only=False,
                error="Sem conexão com a internet para verificar atualizações.",
            )
        except Exception:
            return UpdateCheckResult(
                ok=False,
                current_version=self.current_version,
                latest_version=None,
                has_update=False,
                release_url=None,
                release_name=None,
                published_at=None,
                expected_asset_name=EXPECTED_PORTABLE_ASSET,
                expected_asset_found=False,
                expected_asset_url=None,
                mode=mode,
                check_only=False,
                error="Não foi possível verificar atualizações agora.",
            )

        latest_version = str(payload.get("tag_name") or "").strip() or None
        release_url = payload.get("html_url")
        release_name = payload.get("name")
        published_at = payload.get("published_at")
        has_update = bool(latest_version and _is_newer(latest_version, self.current_version))

        expected_asset_url = None
        assets = payload.get("assets") or []
        for asset in assets:
            if asset.get("name") == EXPECTED_PORTABLE_ASSET:
                expected_asset_url = asset.get("browser_download_url")
                break

        found_asset = bool(expected_asset_url)
        if has_update and found_asset:
            message = f"Nova versão disponível: {latest_version}"
        elif has_update and not found_asset:
            message = "Nova versão encontrada, mas sem pacote portable esperado."
        else:
            message = "Você está usando a versão mais recente."

        return UpdateCheckResult(
            ok=True,
            current_version=self.current_version,
            latest_version=latest_version,
            has_update=has_update,
            release_url=release_url,
            release_name=release_name,
            published_at=published_at,
            expected_asset_name=EXPECTED_PORTABLE_ASSET,
            expected_asset_found=found_asset,
            expected_asset_url=expected_asset_url,
            mode=mode,
            check_only=False,
            message=message,
            downloaded_file=str(self._last_download_path) if self._last_download_path and self._last_download_path.exists() else None,
        )

    def download(self) -> dict[str, Any]:
        if _runtime_mode() != "portable":
            return {
                "ok": False,
                "error": "Atualização automática disponível apenas na versão portátil.",
                "mode": _runtime_mode(),
            }

        checked = self.check()
        if not checked.ok:
            return checked.as_dict()
        if not checked.has_update:
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Não há atualização disponível para download.",
            }
        if not checked.expected_asset_url:
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Release sem pacote portable esperado.",
            }

        updates_dir = _updates_dir()
        file_name = f"StatusReportBuilder_Portable_{(checked.latest_version or 'latest').replace('/', '_')}.zip"
        target = updates_dir / file_name

        try:
            req = Request(
                checked.expected_asset_url,
                headers={"User-Agent": "StatusReportBuilder-Updater/1.0"},
            )
            with urlopen(req, timeout=20) as resp, open(target, "wb") as out:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    out.write(chunk)
        except Exception:
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Falha ao baixar pacote de atualização.",
            }

        self._last_download_path = target
        checked.downloaded_file = str(target)
        return checked.as_dict()

    def _build_apply_script(self, zip_path: Path) -> Path:
        install_dir = Path(os.getenv("STATUS_BUILDER_APP_ROOT", str(_portable_root()))).resolve()
        exe_name = Path(sys.executable).name if getattr(sys, "frozen", False) else "StatusReportBuilder.exe"
        script_path = _updates_dir() / "apply_update.ps1"
        stage_name = f"_stage_{int(time.time())}"
        script = f"""$ErrorActionPreference = 'Stop'
$InstallDir = '{install_dir}'
$ZipPath = '{zip_path}'
$ExeName = '{exe_name}'
$StageDir = Join-Path $InstallDir '{stage_name}'
Start-Sleep -Seconds 2
if (Test-Path $StageDir) {{ Remove-Item -Recurse -Force $StageDir }}
New-Item -ItemType Directory -Path $StageDir -Force *> $null
Expand-Archive -Path $ZipPath -DestinationPath $StageDir -Force
$exclude = @('data','exports','logs','config','updates','app.lock')
Get-ChildItem -Path $StageDir | ForEach-Object {{
  if ($exclude -contains $_.Name) {{ return }}
  Copy-Item -Path $_.FullName -Destination (Join-Path $InstallDir $_.Name) -Recurse -Force
}}
Remove-Item -Recurse -Force $StageDir
Start-Process -FilePath (Join-Path $InstallDir $ExeName) -WindowStyle Hidden
"""
        script_path.write_text(script, encoding="utf-8")
        return script_path

    def apply(self) -> dict[str, Any]:
        if _runtime_mode() != "portable":
            return {
                "ok": False,
                "error": "Atualização automática disponível apenas na versão portátil.",
                "mode": _runtime_mode(),
            }

        zip_path = self._last_download_path
        if not zip_path or not zip_path.exists():
            return {
                "ok": False,
                "error": "Nenhum pacote baixado. Faça o download da atualização primeiro.",
                "mode": _runtime_mode(),
            }

        try:
            script_path = self._build_apply_script(zip_path)
            creation_flags = 0
            if os.name == "nt":
                creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
            subprocess.Popen(
                [
                    "powershell",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(script_path),
                ],
                cwd=str(_portable_root()),
                creationflags=creation_flags,
            )
        except Exception:
            return {
                "ok": False,
                "error": "Falha ao iniciar instalação da atualização.",
                "mode": _runtime_mode(),
            }

        return {
            "ok": True,
            "mode": _runtime_mode(),
            "message": "Instalação iniciada. O app será reiniciado.",
        }

