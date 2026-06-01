param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path '.\backend\main.py')) {
    throw 'Execute este script dentro do repositório onepage-status-project.'
}

if (-not $SkipTests) {
    python -m pytest -q tests/test_phase4_sqlite_hardening.py
    python -m pytest -q tests/test_e2e_builder_v1_contextual.py
    python -m pytest -q
}

python -m pip show pyinstaller *> $null
if ($LASTEXITCODE -ne 0) {
    python -m pip install pyinstaller
}

if (Test-Path '.\build') { Remove-Item -Recurse -Force '.\build' }
if (Test-Path '.\dist') { Remove-Item -Recurse -Force '.\dist' }

python -m PyInstaller --noconfirm .\StatusReportBuilder.spec

$portableDir = Join-Path $projectRoot 'dist\StatusReportBuilder_Portable'
New-Item -ItemType Directory -Path $portableDir -Force *> $null

$onedirPath = '.\dist\StatusReportBuilder'
$onefilePath = '.\dist\StatusReportBuilder.exe'
if (Test-Path $onedirPath) {
    Copy-Item "$onedirPath\*" $portableDir -Recurse -Force
} elseif (Test-Path $onefilePath) {
    Copy-Item $onefilePath (Join-Path $portableDir 'StatusReportBuilder.exe') -Force
} else {
    throw 'Build concluído sem artefato esperado em dist/.'
}
New-Item -ItemType Directory -Path (Join-Path $portableDir 'data') -Force *> $null
New-Item -ItemType Directory -Path (Join-Path $portableDir 'exports\pdf') -Force *> $null
New-Item -ItemType Directory -Path (Join-Path $portableDir 'exports\pptx') -Force *> $null
New-Item -ItemType Directory -Path (Join-Path $portableDir 'logs') -Force *> $null
New-Item -ItemType Directory -Path (Join-Path $portableDir 'config') -Force *> $null

$zipPath = Join-Path $projectRoot 'dist\StatusReportBuilder_Portable.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $zipPath

$exePath = Join-Path $portableDir 'StatusReportBuilder.exe'
Write-Host "Portable EXE: $exePath"
Write-Host "Portable ZIP: $zipPath"
