# AGENTS.md — onepage-status-project

## Architecture

FastAPI backend + pure HTML/CSS/JS frontend. Fonte principal é SQLite (`data/status_builder.db`) com contrato canônico `reportData`.
`status_projeto.xlsx` é legado/importador opcional para seed inicial.

**Stack**: Python (FastAPI, openpyxl, watchdog, Playwright, python-pptx)

## Project structure

```
backend/
  main.py              # FastAPI app, routes, WebSocket, lifespan startup
  excel_reader.py      # reads Excel → dict; creates template XLSX
  schema_validator.py  # validates required sheets & columns
  watcher.py           # watchdog observer, calls broadcast via asyncio loop
  exporter.py          # PDF (Playwright) and PPTX (Playwright + python-pptx)
frontend/
  index.html           # single-page layout, 1780px shell, 16:9
  styles.css           # CSS custom properties, candy palette, print styles, responsive
  app.js               # fetch /api/status, WebSocket, SVG S-curve, all renderers
  assets/logo.svg      # placeholder logo (replace as needed)
exports/pdf/           # generated PDFs land here
exports/pptx/          # generated PPTXs land here
```

## Commands

```bash
pip install -r requirements.txt
python -m playwright install chromium
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Or just run `start.bat`.

## Excel auto-creation

If `status_projeto.xlsx` is missing at startup, `backend/excel_reader.py:create_template()` generates a fully-populated workbook with all 9 sheets. No manual setup needed.

## Key behaviors

- **SQLite source of truth**: `/api/status` lê snapshot atual do SQLite e `/api/save` persiste novos snapshots SQLite por `project_key`.
- **Excel legado opcional**: em banco vazio, se `status_projeto.xlsx` existir, ocorre import/seed inicial via `ExcelImportService`.
- **Watcher por flag**: `WATCH_EXCEL=false` por padrão; watcher só inicia se habilitado e se o Excel existir.
- **Schema Excel por flag**: `VALIDATE_EXCEL_SCHEMA=false` por padrão; `/api/status` não depende operacionalmente da validação do Excel.
- **No hardcoded business text**: labels e valores do relatório vêm de `reportData` persistido, mantendo compatibilidade com dados legados.
- **Layout**: `.page-shell` at `width: min(1780px, 100%)`, content at 16:9 proportion. Print `@page` set to A4 landscape.
- **S-Curve**: SVG rendered in `app.js:renderCurvaS()` with dashed planned line, solid realized line, and a green dot for current day/percentage. Coordinates calculated dynamically from CURVA_S data.

## Design conventions

- **Color palette**: Candy/soft colors via `--green-*`, `--blue-*`, `--red-*`, `--orange-*`, `--gray-*` variables. Header gradient `#143e2a → #1a4f35`.
- **Cards**: No borders (`border` removed from timeline, KPI, panel, milestone-row, footer-strip). Separation via `box-shadow` and subtle `--gray-100` backgrounds on alternating rows.
- **Panels (middle-grid)**: Three columns (`0.95fr 1.15fr 1.05fr`). All three (Resumo, Pendências, Ações) use identical row metrics: `margin: 6px 22px 14px`, `gap: 4px`, `min-height: 40px`, `font-size: 15px`.
- **Table (Pendências)**: `thead` hidden. Rows rendered as flex containers with `background: var(--gray-100)`, `border-radius: 8px`, no borders.
- **Timeline**: Lines positioned at `top: 34px` (dot center). Solid line via `::before` with `width: var(--tl-solid)`, dashed remainder via `::after` starting at `calc(7.4% + var(--tl-solid))`. No gap between them.
- **KPI icons**: 28×28px SVGs with `stroke-width: 1.6`, `shape-rendering: geometricPrecision`. Progress KPI uses conic-gradient ring without inner text.
- **Status-driven classes**: `.danger` (gradient `#d96a6a/#c94a4a`), `.warning` (`#e0a060/#d48a4a`), `.success` (`#4a9a63/#388654`), `.gray` (`#8a909a`).

## Export notes

- **PDF** (`POST /api/export/pdf`): Playwright renders at 1920×1080, A4 landscape PDF with zero margins.
- **PPTX** (`POST /api/export/pptx`): Playwright takes full-page screenshot, inserted as full-slide image in 13.333″×7.5″ blank slide via python-pptx.
- Both require Playwright Chromium installed (`python -m playwright install chromium`).
- Button handlers use `onclick="exportPDF(event)"` pattern (not `window.event`).

## Validation

`schema_validator.py` valida schema Excel legado quando habilitado. Com `VALIDATE_EXCEL_SCHEMA=false` (padrão), `/api/status` segue operacional com dados do SQLite.
