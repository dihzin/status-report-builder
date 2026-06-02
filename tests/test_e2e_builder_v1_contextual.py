from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.request
import importlib
from pathlib import Path

import pytest
import uvicorn

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover
    sync_playwright = None
    PlaywrightTimeoutError = Exception


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


E2E_PORT = int(os.getenv("E2E_PORT", "0")) or _pick_free_port()
BASE_URL = f"http://127.0.0.1:{E2E_PORT}"
ROOT = Path(__file__).resolve().parents[1]


def _collect_app_debug(page, console_messages: list[str], page_errors: list[str]) -> str:
    snapshot = page.evaluate(
        """
        () => ({
            dataset: document.body ? { ...document.body.dataset } : null,
            initError: window.__appInitError || null,
            renderComplete: window.__renderComplete,
            title: document.getElementById('projectTitle')?.textContent || null,
            editDisabled: document.querySelector('[data-testid="btn-edit"]')?.disabled ?? null,
            hasEditButton: !!document.querySelector('[data-testid="btn-edit"]'),
            shellHtml: document.querySelector('.page-shell')?.outerHTML?.slice(0, 2500) || null
        })
        """
    )
    return (
        f"dataset={snapshot.get('dataset')!r}\n"
        f"initError={snapshot.get('initError')!r}\n"
        f"renderComplete={snapshot.get('renderComplete')!r}\n"
        f"title={snapshot.get('title')!r}\n"
        f"editDisabled={snapshot.get('editDisabled')!r}\n"
        f"hasEditButton={snapshot.get('hasEditButton')!r}\n"
        f"console={console_messages!r}\n"
        f"pageErrors={page_errors!r}\n"
        f"shellHtml={snapshot.get('shellHtml')!r}"
    )


def _wait_for_app_ready(page, console_messages: list[str], page_errors: list[str]) -> None:
    try:
        page.wait_for_function(
            """
            () => {
                const body = document.body;
                const btn = document.querySelector('[data-testid="btn-edit"]');
                const title = document.getElementById('projectTitle');
                if (!body) return false;
                if (body.dataset.appState === 'error') return true;
                return body.dataset.appState === 'ready'
                    && body.dataset.appReady === 'true'
                    && body.dataset.loading === 'idle'
                    && body.dataset.mode === 'view'
                    && !!btn
                    && !btn.disabled
                    && !!title
                    && title.textContent
                    && title.textContent.trim() !== ''
                    && title.textContent.trim() !== 'Carregando...';
            }
            """
        )
    except PlaywrightTimeoutError as exc:
        raise AssertionError("App não atingiu estado pronto observável.\n" + _collect_app_debug(page, console_messages, page_errors)) from exc

    app_state = page.evaluate("() => document.body?.dataset.appState || null")
    if app_state != "ready":
        raise AssertionError("App terminou bootstrap em estado não pronto.\n" + _collect_app_debug(page, console_messages, page_errors))


def _http_json(method: str, path: str, payload: dict | None = None) -> dict:
    last_err = None
    for _ in range(3):
        try:
            data = None
            headers = {}
            if payload is not None:
                data = json.dumps(payload).encode("utf-8")
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(BASE_URL + path, data=data, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # transient reset/race from local server startup/shutdown
            last_err = exc
            time.sleep(0.5)
    raise last_err


def _wait_server(timeout_s: int = 40) -> None:
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            _http_json("GET", "/health")
            return
        except Exception:
            time.sleep(0.4)
    raise RuntimeError("Servidor nao ficou pronto em tempo habil")


@pytest.fixture(scope="module")
def app_server():
    prev_watch_excel = os.environ.get("WATCH_EXCEL")
    prev_validate_excel = os.environ.get("VALIDATE_EXCEL_SCHEMA")
    os.environ["WATCH_EXCEL"] = "false"
    os.environ["VALIDATE_EXCEL_SCHEMA"] = "false"

    backend_main = importlib.import_module("backend.main")
    backend_main = importlib.reload(backend_main)
    config = uvicorn.Config(backend_main.app, host="127.0.0.1", port=E2E_PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        _wait_server()
        yield
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        if prev_watch_excel is None:
            os.environ.pop("WATCH_EXCEL", None)
        else:
            os.environ["WATCH_EXCEL"] = prev_watch_excel
        if prev_validate_excel is None:
            os.environ.pop("VALIDATE_EXCEL_SCHEMA", None)
        else:
            os.environ["VALIDATE_EXCEL_SCHEMA"] = prev_validate_excel


@pytest.mark.skipif(sync_playwright is None, reason="playwright nao disponivel")
def test_builder_v1_contextual_e2e(app_server):
    baseline = _http_json("GET", "/api/status").get("reportData", {})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        console_messages = []
        page_errors = []
        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.goto(BASE_URL, wait_until="domcontentloaded")
        _wait_for_app_ready(page, console_messages, page_errors)

        # Regressão: botão "Adicionar" deve sumir ao cancelar edição.
        page.get_by_test_id("btn-edit").click()
        page.wait_for_function("() => document.body?.dataset.mode === 'edit'")
        assert page.locator(".edit-add-wrap").count() > 0
        page.get_by_test_id("btn-cancel-edits").click()
        page.wait_for_function("() => document.body?.dataset.mode === 'view'")
        assert page.locator(".edit-add-wrap").count() == 0
        assert page.locator("#editModeBar").evaluate("el => getComputedStyle(el).display") == "none"

        page.get_by_test_id("btn-edit").click()
        page.wait_for_function("() => document.body?.dataset.mode === 'edit'")
        page.get_by_test_id("btn-open-drawer").click()
        drawer = page.get_by_test_id("config-drawer-body")
        expect_texts = [
            "Header",
            "Timeline",
            "Alerta do Header",
            "Rodapé",
            "Fases do Projeto (Timeline)",
            "Indicadores — KPI Cards",
            "Curva S — Dados do Gráfico",
        ]
        for txt in expect_texts:
            assert drawer.get_by_text(txt, exact=False).count() > 0

        assert drawer.get_by_text("Metadados do snapshot", exact=False).count() == 0
        assert page.locator(".drawer-input.drawer-locked[disabled]").count() >= 1

        # Header
        project_name = drawer.locator(".drawer-field").filter(has_text="Nome do Projeto").locator("input")
        project_name.fill("Projeto E2E Persist")

        # Timeline
        current_phase = drawer.locator(".drawer-field").filter(has_text="Fase Atual").locator("input")
        current_phase.fill("Fase E2E")

        alert_text = drawer.locator(".drawer-field").filter(has_text="Texto").locator("input").first
        alert_text.fill("ALERTA E2E")

        milestone_alvo = drawer.locator(".drawer-field").filter(has_text="Milestone Alvo").locator("input")
        milestone_alvo.fill("Marco E2E")

        owner_pm = drawer.locator(".drawer-field").filter(has_text="Responsável (PM)").locator("input")
        owner_pm.fill("PM E2E")

        page.locator(".config-drawer-close").click()
        page.wait_for_function(
            "() => document.querySelector('[data-testid=\"config-drawer\"]')?.getAttribute('aria-hidden') === 'true'"
        )

        # Resumo Executivo (inline)
        page.get_by_test_id("section-resumo").locator(".resumo-text").first.click()
        page.keyboard.type(" [e2e]")

        # Pendencias Criticas (inline)
        page.get_by_test_id("section-pendencias").locator(".risk-title").first.click()
        page.keyboard.type(" [e2e]")

        # Proximas Acoes (inline)
        page.get_by_test_id("section-acoes").locator(".acao-text").first.click()
        page.keyboard.type(" [e2e]")

        # Marcos (inline)
        page.get_by_test_id("section-marcos").locator(".ms-name-text").first.click()
        page.keyboard.type(" [e2e]")

        assert page.evaluate("hasUnsavedChanges()") is True

        # Dirty-state protege export quando usuario cancela confirmacao
        page.evaluate("window.confirm = () => false;")
        requests_before = []
        page.on("request", lambda req: requests_before.append(req.url))
        page.get_by_test_id("btn-export-pdf").click()
        page.wait_for_load_state("networkidle")
        assert not any("/api/export/pdf" in u for u in requests_before)
        page.evaluate("window.confirm = () => true;")

        # Salvar, validar status e export
        page.get_by_test_id("btn-save-edits").click()
        _wait_for_app_ready(page, console_messages, page_errors)
        assert page.evaluate("hasUnsavedChanges()") is False

        status_after = _http_json("GET", "/api/status")
        cfg = status_after.get("reportData", {}).get("config", {})
        rod = status_after.get("reportData", {}).get("rodape", {})
        assert cfg.get("project_name") == "Projeto E2E Persist"
        assert cfg.get("current_phase") == "Fase E2E"
        assert cfg.get("alert_label") == "ALERTA E2E"
        assert cfg.get("owner_name") == "PM E2E"
        assert rod.get("milestone_alvo") == "Marco E2E"
        resumo_after = status_after.get("reportData", {}).get("resumo_executivo", [])
        assert any("[e2e]" in str((it or {}).get("texto", "")) for it in resumo_after)

        # restore baseline before closing the browser to keep the app server lifecycle stable
        _http_json("POST", "/api/save", {"reportData": baseline})
        browser.close()
