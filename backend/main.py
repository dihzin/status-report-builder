import asyncio
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse

from backend.watcher import start_watcher
from backend.exporter import export_pdf, export_pptx
from backend.app_version import APP_VERSION
from backend.services.report_service import ReportService
from backend.services.update_service import UpdateService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_ROOT = Path(os.getenv("STATUS_BUILDER_APP_ROOT", str(ROOT_DIR))).resolve()
EXCEL_PATH = Path(os.getenv("STATUS_BUILDER_EXCEL_PATH", str(APP_ROOT / "status_projeto.xlsx"))).resolve()
FRONTEND_DIR = Path(os.getenv("STATUS_BUILDER_FRONTEND_DIR", str(ROOT_DIR / "frontend"))).resolve()

active_connections: set[WebSocket] = set()
_watcher = None
report_service = ReportService(APP_ROOT)
update_service = UpdateService()
WATCH_EXCEL = os.getenv("WATCH_EXCEL", "false").strip().lower() == "true"


def _local_base_url(request: Request) -> str:
    base = str(request.base_url).rstrip("/")
    forced_host = os.getenv("STATUS_BUILDER_HOST")
    if not forced_host:
        return base
    parts = urlsplit(base)
    forced_netloc = f"{forced_host}:{parts.port}" if parts.port else forced_host
    return urlunsplit((parts.scheme, forced_netloc, "", "", ""))


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
    await broadcast({"type": "data_updated"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _watcher

    report_service.initialize_storage()
    report_service.ensure_seeded()

    if WATCH_EXCEL and EXCEL_PATH.exists():
        loop = asyncio.get_running_loop()
        _watcher = start_watcher(str(EXCEL_PATH), loop, on_excel_changed)
        logger.info("Watchdog iniciado. Monitorando alterações no Excel...")
    else:
        logger.info("Watchdog de Excel desativado (WATCH_EXCEL=false ou Excel ausente).")

    yield

    if _watcher:
        _watcher.stop()
        _watcher.join()


app = FastAPI(title="OnePage Status Project", version=APP_VERSION, lifespan=lifespan)

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
        "app_version": APP_VERSION,
        "excel_exists": EXCEL_PATH.exists(),
        "excel_file": EXCEL_PATH.name,  # apenas nome, não caminho completo
    }


@app.get("/api/status")
async def get_status():
    try:
        return report_service.get_status_payload()
    except Exception as e:
        logger.exception("Erro ao carregar status")
        return {
            "data": {},
            "reportData": {},
            "validation_errors": [str(e)],
            "file_error": str(e),
        }


@app.get("/api/update/check")
async def check_update():
    result = update_service.check()
    return result.as_dict()


@app.post("/api/update/download")
async def download_update():
    payload = update_service.download()
    status = 200 if payload.get("ok") else 400
    return JSONResponse(status_code=status, content=payload)


@app.post("/api/update/apply")
async def apply_update():
    payload = update_service.apply()
    status = 200 if payload.get("ok") else 400
    if payload.get("ok"):
        def _shutdown():
            time.sleep(1.2)
            os._exit(0)
        threading.Thread(target=_shutdown, daemon=True).start()
    return JSONResponse(status_code=status, content=payload)


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
        result = report_service.save_payload(payload if isinstance(payload, dict) else {})
        await on_excel_changed()
        return result
    except Exception as e:
        import traceback
        logger.error("Erro ao salvar dados:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/export/pdf")
async def generate_pdf(request: Request):
    try:
        path = await export_pdf(_local_base_url(request))
        return FileResponse(path, media_type="application/pdf", filename="status_report.pdf")
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("Erro ao exportar PDF:\n%s", tb)
        return JSONResponse(status_code=500, content={"error": f"Erro ao gerar PDF: {type(e).__name__}: {str(e)}", "traceback": tb})


@app.post("/api/export/pptx")
async def generate_pptx(request: Request):
    try:
        path = await export_pptx(_local_base_url(request), data_provider=report_service.get_current_report_data)
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
