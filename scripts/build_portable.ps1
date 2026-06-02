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
if (Test-Path '.\dist\StatusReportBuilder') { Remove-Item -Recurse -Force '.\dist\StatusReportBuilder' }
if (Test-Path '.\dist\StatusReportBuilder_Portable') { Remove-Item -Recurse -Force '.\dist\StatusReportBuilder_Portable' }

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

$msPlaywright = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$embeddedMsPlaywright = Join-Path $portableDir '_internal\ms-playwright'
$embeddedLocalBrowsers = Join-Path $portableDir '_internal\playwright\driver\package\.local-browsers'
if (Test-Path $msPlaywright) {
    New-Item -ItemType Directory -Path $embeddedMsPlaywright -Force *> $null
    Copy-Item "$msPlaywright\*" $embeddedMsPlaywright -Recurse -Force
    New-Item -ItemType Directory -Path $embeddedLocalBrowsers -Force *> $null
    Copy-Item "$msPlaywright\*" $embeddedLocalBrowsers -Recurse -Force
} else {
    Write-Warning "ms-playwright não encontrado em $msPlaywright. Rode 'python -m playwright install chromium' antes do build."
}

$zipPath = Join-Path $projectRoot 'dist\StatusReportBuilder_Portable.zip'
$checksumPath = Join-Path $projectRoot 'dist\StatusReportBuilder_Portable.zip.sha256'
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
if (Test-Path $checksumPath) {
    Remove-Item $checksumPath -Force
}
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $zipPath -Force
$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path $checksumPath -Value "$hash  StatusReportBuilder_Portable.zip" -Encoding ascii

$exePath = Join-Path $portableDir 'StatusReportBuilder.exe'
Write-Host "Portable EXE: $exePath"
Write-Host "Portable ZIP: $zipPath"
Write-Host "Portable SHA256: $checksumPath"
