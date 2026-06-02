from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import zipfile

from backend.app_version import APP_VERSION

EXPECTED_PORTABLE_ASSET = "StatusReportBuilder_Portable.zip"
EXPECTED_PORTABLE_CHECKSUM_ASSET = f"{EXPECTED_PORTABLE_ASSET}.sha256"
SHA256_HEX_RE = re.compile(r"^[a-fA-F0-9]{64}$")


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


def _state_file() -> Path:
    return _updates_dir() / "update_state.json"


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
    expected_checksum_asset_name: str
    expected_checksum_asset_found: bool
    expected_checksum_asset_url: str | None
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
            "expected_checksum_asset_name": self.expected_checksum_asset_name,
            "expected_checksum_asset_found": self.expected_checksum_asset_found,
            "expected_checksum_asset_url": self.expected_checksum_asset_url,
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
        self._last_download_path, self._last_download_sha256 = self._load_download_state()

    def _load_download_state(self) -> tuple[Path | None, str | None]:
        sf = _state_file()
        if not sf.exists():
            return None, None
        try:
            payload = json.loads(sf.read_text(encoding="utf-8"))
            path = payload.get("downloaded_file")
            checksum = payload.get("expected_sha256")
            if checksum is not None:
                checksum = str(checksum).strip().lower()
                if not SHA256_HEX_RE.fullmatch(checksum):
                    checksum = None
            if not path:
                return None, checksum
            p = Path(path)
            return (p if p.exists() else None), checksum
        except Exception:
            return None, None

    def _persist_download_state(self, path: Path | None, checksum: str | None) -> None:
        payload = {
            "downloaded_file": str(path) if path else None,
            "expected_sha256": checksum if checksum else None,
            "updated_at": int(time.time()),
        }
        _state_file().write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _reset_download_state(self) -> None:
        self._last_download_path = None
        self._last_download_sha256 = None
        self._persist_download_state(None, None)

    def _download_bytes(self, url: str, timeout: int) -> bytes:
        req = Request(url, headers={"User-Agent": "StatusReportBuilder-Updater/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()

    def _download_to_file(self, url: str, target: Path, timeout: int) -> None:
        req = Request(url, headers={"User-Agent": "StatusReportBuilder-Updater/1.0"})
        with urlopen(req, timeout=timeout) as resp, open(target, "wb") as out:
            while True:
                chunk = resp.read(1024 * 256)
                if not chunk:
                    break
                out.write(chunk)

    def _parse_checksum(self, raw_text: str, expected_name: str = EXPECTED_PORTABLE_ASSET) -> str | None:
        text = (raw_text or "").strip()
        if not text:
            return None
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            match = re.fullmatch(r"([A-Fa-f0-9]{64})(?:\s+\*?(.+))?", stripped)
            if not match:
                return None
            digest = match.group(1).lower()
            file_name = (match.group(2) or "").strip()
            if file_name and Path(file_name).name != expected_name:
                return None
            return digest
        return None

    def _calculate_sha256(self, path: Path) -> str:
        hasher = hashlib.sha256()
        with open(path, "rb") as fh:
            while True:
                chunk = fh.read(1024 * 1024)
                if not chunk:
                    break
                hasher.update(chunk)
        return hasher.hexdigest()

    def _validate_download_checksum(self, zip_path: Path, expected_hash: str | None) -> tuple[bool, str | None]:
        digest = (expected_hash or "").strip().lower()
        if not digest:
            return False, "Checksum SHA-256 ausente para o pacote baixado."
        if not SHA256_HEX_RE.fullmatch(digest):
            return False, "Checksum SHA-256 inválido para o pacote baixado."
        actual = self._calculate_sha256(zip_path)
        if actual != digest:
            return False, "Checksum SHA-256 divergente. O pacote foi bloqueado por segurança."
        return True, None

    def _validate_zip_payload(self, zip_path: Path) -> tuple[bool, str | None]:
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                names = zf.namelist()
                if not names:
                    return False, "Pacote de atualização vazio."
                found_exe = False
                for raw in names:
                    normalized = raw.replace("\\", "/")
                    if normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized:
                        return False, "Pacote inválido (path traversal detectado)."
                    parts = [p for p in normalized.split("/") if p not in ("", ".")]
                    if any(p == ".." for p in parts):
                        return False, "Pacote inválido (path traversal detectado)."
                    if parts and parts[-1].lower() == "statusreportbuilder.exe":
                        found_exe = True
                if not found_exe:
                    return False, "Pacote inválido: StatusReportBuilder.exe não encontrado."
                return True, None
        except zipfile.BadZipFile:
            return False, "Pacote inválido (zip corrompido)."
        except Exception:
            return False, "Não foi possível validar o pacote baixado."

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
                expected_checksum_asset_name=EXPECTED_PORTABLE_CHECKSUM_ASSET,
                expected_checksum_asset_found=False,
                expected_checksum_asset_url=None,
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
                expected_checksum_asset_name=EXPECTED_PORTABLE_CHECKSUM_ASSET,
                expected_checksum_asset_found=False,
                expected_checksum_asset_url=None,
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
                expected_checksum_asset_name=EXPECTED_PORTABLE_CHECKSUM_ASSET,
                expected_checksum_asset_found=False,
                expected_checksum_asset_url=None,
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
        expected_checksum_asset_url = None
        assets = payload.get("assets") or []
        for asset in assets:
            if asset.get("name") == EXPECTED_PORTABLE_ASSET:
                expected_asset_url = asset.get("browser_download_url")
            elif asset.get("name") == EXPECTED_PORTABLE_CHECKSUM_ASSET:
                expected_checksum_asset_url = asset.get("browser_download_url")

        found_asset = bool(expected_asset_url)
        found_checksum_asset = bool(expected_checksum_asset_url)
        if has_update and found_asset and found_checksum_asset:
            message = f"Nova versão disponível: {latest_version}"
        elif has_update and not found_asset:
            message = "Nova versão encontrada, mas sem pacote portable esperado."
        elif has_update and not found_checksum_asset:
            message = "Nova versão encontrada, mas sem checksum SHA-256 esperado."
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
            expected_checksum_asset_name=EXPECTED_PORTABLE_CHECKSUM_ASSET,
            expected_checksum_asset_found=found_checksum_asset,
            expected_checksum_asset_url=expected_checksum_asset_url,
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
        if not checked.expected_checksum_asset_url:
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Release sem checksum SHA-256 esperado.",
            }

        updates_dir = _updates_dir()
        file_name = f"StatusReportBuilder_Portable_{(checked.latest_version or 'latest').replace('/', '_')}.zip"
        target = updates_dir / file_name

        try:
            self._download_to_file(checked.expected_asset_url, target, timeout=20)
        except Exception:
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Falha ao baixar pacote de atualização.",
            }

        try:
            checksum_text = self._download_bytes(checked.expected_checksum_asset_url, timeout=8).decode("utf-8")
        except Exception:
            if target.exists():
                target.unlink()
            self._reset_download_state()
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Falha ao obter checksum SHA-256 da atualização.",
            }

        expected_hash = self._parse_checksum(checksum_text)
        if not expected_hash:
            if target.exists():
                target.unlink()
            self._reset_download_state()
            return {
                **checked.as_dict(),
                "ok": False,
                "error": "Checksum SHA-256 ausente ou inválido para o pacote de atualização.",
            }

        valid_checksum, checksum_err = self._validate_download_checksum(target, expected_hash)
        if not valid_checksum:
            if target.exists():
                target.unlink()
            self._reset_download_state()
            return {
                **checked.as_dict(),
                "ok": False,
                "error": checksum_err or "Falha na validação SHA-256 do pacote baixado.",
            }

        valid_zip, zip_err = self._validate_zip_payload(target)
        if not valid_zip:
            if target.exists():
                target.unlink()
            self._reset_download_state()
            return {
                **checked.as_dict(),
                "ok": False,
                "error": zip_err or "Pacote inválido para instalação.",
            }

        self._last_download_path = target
        self._last_download_sha256 = expected_hash
        self._persist_download_state(target, expected_hash)
        checked.downloaded_file = str(target)
        return checked.as_dict()

    def _build_apply_script(self, zip_path: Path) -> Path:
        install_dir = Path(os.getenv("STATUS_BUILDER_APP_ROOT", str(_portable_root()))).resolve()
        exe_name = Path(sys.executable).name if getattr(sys, "frozen", False) else "StatusReportBuilder.exe"
        script_path = _updates_dir() / "apply_update.ps1"
        stage_name = f"_stage_{int(time.time())}"
        backup_name = f"_backup_{int(time.time())}"
        script = f"""$ErrorActionPreference = 'Stop'
$InstallDir = '{install_dir}'
$ZipPath = '{zip_path}'
$ExeName = '{exe_name}'
$StageDir = Join-Path $InstallDir '{stage_name}'
$BackupDir = Join-Path $InstallDir '{backup_name}'
$LogFile = Join-Path $InstallDir 'updates\\apply_update.log'
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'updates') -Force *> $null
Start-Sleep -Seconds 3
Add-Content -Path $LogFile -Value "$(Get-Date -Format o) [INFO] Iniciando apply."
if (Test-Path $StageDir) {{ Remove-Item -Recurse -Force $StageDir }}
New-Item -ItemType Directory -Path $StageDir -Force *> $null
if (Test-Path $BackupDir) {{ Remove-Item -Recurse -Force $BackupDir }}
New-Item -ItemType Directory -Path $BackupDir -Force *> $null
Expand-Archive -Path $ZipPath -DestinationPath $StageDir -Force
$exeCandidate = Get-ChildItem -Path $StageDir -Recurse -Filter 'StatusReportBuilder.exe' | Select-Object -First 1
if (-not $exeCandidate) {{ throw 'StatusReportBuilder.exe não encontrado no pacote.' }}
$exclude = @('data','exports','logs','config','updates','app.lock')
$toCopy = @()
Get-ChildItem -Path $StageDir | ForEach-Object {{
  if ($exclude -contains $_.Name) {{ return }}
  $toCopy += $_
}}
foreach ($item in $toCopy) {{
  $dest = Join-Path $InstallDir $item.Name
  if (Test-Path $dest) {{
    Copy-Item -Path $dest -Destination (Join-Path $BackupDir $item.Name) -Recurse -Force
  }}
}}
try {{
  foreach ($item in $toCopy) {{
    Copy-Item -Path $item.FullName -Destination (Join-Path $InstallDir $item.Name) -Recurse -Force
  }}
  Add-Content -Path $LogFile -Value "$(Get-Date -Format o) [INFO] Apply concluído."
}} catch {{
  Add-Content -Path $LogFile -Value "$(Get-Date -Format o) [ERROR] Falha no apply, iniciando rollback: $($_.Exception.Message)"
  foreach ($item in Get-ChildItem -Path $BackupDir) {{
    Copy-Item -Path $item.FullName -Destination (Join-Path $InstallDir $item.Name) -Recurse -Force
  }}
  throw
}}
Remove-Item -Recurse -Force $StageDir
Remove-Item -Recurse -Force $BackupDir
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

        valid_checksum, checksum_err = self._validate_download_checksum(zip_path, self._last_download_sha256)
        if not valid_checksum:
            return {
                "ok": False,
                "error": checksum_err or "Falha na validação SHA-256 do pacote baixado.",
                "mode": _runtime_mode(),
            }

        valid, err = self._validate_zip_payload(zip_path)
        if not valid:
            return {
                "ok": False,
                "error": err or "Pacote inválido para instalação.",
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
