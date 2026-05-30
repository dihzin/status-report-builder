import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse

from backend.excel_reader import read_excel, create_template
from backend.report_data import build_report_data, to_legacy_data_shape
from backend.schema_validator import validate_schema
from backend.watcher import start_watcher
from backend.exporter import export_pdf, export_pptx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT_DIR / "status_projeto.xlsx"
FRONTEND_DIR = ROOT_DIR / "frontend"

active_connections: set[WebSocket] = set()
_watcher = None


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out.get(k) or {}, v)
        else:
            out[k] = v
    return out


async def broadcast(message: dict):
    dead = set()
    for ws in active_connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    active_connections.difference_update(dead)


async def on_excel_changed():
    logger.info("Excel alterado. Atualizando dados...")
    read_excel(str(EXCEL_PATH))  # atualiza _cache em excel_reader
    await broadcast({"type": "data_updated"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _watcher

    if not EXCEL_PATH.exists():
        logger.info("status_projeto.xlsx não encontrado. Criando template...")
        create_template(str(EXCEL_PATH))
        logger.info("Template criado: status_projeto.xlsx")

    read_excel(str(EXCEL_PATH))  # aquece o cache

    loop = asyncio.get_running_loop()
    _watcher = start_watcher(str(EXCEL_PATH), loop, on_excel_changed)
    logger.info("Watchdog iniciado. Monitorando alterações no Excel...")

    yield

    if _watcher:
        _watcher.stop()
        _watcher.join()


app = FastAPI(title="OnePage Status Project", version="1.0.0", lifespan=lifespan)

_MEDIA_TYPES = {
    ".html": "text/html",
    ".css":  "text/css",
    ".js":   "application/javascript",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".ico":  "image/x-icon",
    ".json": "application/json",
    ".woff2": "font/woff2",
}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "excel_exists": EXCEL_PATH.exists(),
        "excel_file": EXCEL_PATH.name,  # apenas nome, não caminho completo
    }


@app.get("/api/status")
async def get_status():
    raw_data, file_error = read_excel(str(EXCEL_PATH))
    report_data = build_report_data(raw_data if isinstance(raw_data, dict) else {})
    data = to_legacy_data_shape(report_data)

    validation_errors: list[str] = []
    if not EXCEL_PATH.exists():
        validation_errors = ["Arquivo Excel não encontrado"]
    elif file_error is None:
        validation_errors = validate_schema(str(EXCEL_PATH))

    return {
        "data": data,
        "reportData": report_data,
        "validation_errors": validation_errors,
        "file_error": file_error,
    }


@app.websocket("/ws/status")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info("Cliente WebSocket conectado")
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        active_connections.discard(websocket)
        logger.info("Cliente WebSocket desconectado")


@app.post("/api/save")
async def save_status(request: Request):
    try:
        payload = await request.json()
        # Aceita payload legado ou canônico e persiste no formato esperado pelo writer.
        if isinstance(payload, dict) and "reportData" in payload:
            payload = payload.get("reportData") or {}
        current_raw, _ = read_excel(str(EXCEL_PATH))
        merged = _deep_merge(current_raw if isinstance(current_raw, dict) else {}, payload if isinstance(payload, dict) else {})
        payload = to_legacy_data_shape(build_report_data(merged))
        from backend.excel_writer import write_excel
        write_excel(str(EXCEL_PATH), payload)
        await on_excel_changed()
        return {"ok": True}
    except Exception as e:
        import traceback
        logger.error("Erro ao salvar dados:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/export/pdf")
async def generate_pdf():
    try:
        path = await export_pdf("http://127.0.0.1:8000")
        return FileResponse(path, media_type="application/pdf", filename="status_report.pdf")
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("Erro ao exportar PDF:\n%s", tb)
        return JSONResponse(status_code=500, content={"error": f"Erro ao gerar PDF: {type(e).__name__}: {str(e)}", "traceback": tb})


@app.post("/api/export/pptx")
async def generate_pptx():
    try:
        path = await export_pptx("http://127.0.0.1:8000")
        return FileResponse(
            path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename="status_report.pptx",
        )
    except Exception as e:
        logger.exception("Erro ao exportar PPTX")
        return JSONResponse(status_code=500, content={"error": f"Erro ao gerar PPTX: {str(e)}"})


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    target = full_path if full_path else "index.html"
    file_path = FRONTEND_DIR / target
    if file_path.exists() and file_path.is_file():
        mt = _MEDIA_TYPES.get(file_path.suffix.lower())
        return FileResponse(str(file_path), media_type=mt)
    return FileResponse(str(FRONTEND_DIR / "index.html"), media_type="text/html")
