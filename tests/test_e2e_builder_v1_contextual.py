from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

try:
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover
    sync_playwright = None


BASE_URL = "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parents[1]


def _http_json(method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE_URL + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


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
    env = os.environ.copy()
    env["WATCH_EXCEL"] = "false"
    env["VALIDATE_EXCEL_SCHEMA"] = "false"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_server()
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.mark.skipif(sync_playwright is None, reason="playwright nao disponivel")
def test_builder_v1_contextual_e2e(app_server):
    baseline = _http_json("GET", "/api/status").get("reportData", {})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, wait_until="networkidle")

        page.get_by_test_id("btn-edit").click()
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
        old_name = project_name.input_value()
        project_name.fill(old_name + " [E2E]")

        # Timeline
        current_day = drawer.locator(".drawer-field").filter(has_text="Dia Atual").locator("input")
        cur_val = current_day.input_value() or "1"
        current_day.fill(str(int(cur_val) + 1))

        # KPI contextual
        kpi_editable = drawer.locator(".drawer-table-wrap").nth(1).locator("input:not([disabled])").first
        kpi_old = kpi_editable.input_value()
        kpi_editable.fill(kpi_old + " e2e")

        # Curva S contextual
        curva_input = drawer.locator(".drawer-table-wrap").nth(2).locator("input[type='number']").first
        curva_old = curva_input.input_value() or "1"
        curva_input.fill(str(int(float(curva_old)) + 1))

        page.locator(".config-drawer-close").click()
        page.wait_for_timeout(250)

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

        # Rodape (inline)
        page.get_by_test_id("section-rodape").locator("[data-edit-rodape='milestone_alvo']").first.click()
        page.keyboard.type(" [e2e]")

        assert page.evaluate("hasUnsavedChanges()") is True

        # Dirty-state protege export quando usuario cancela confirmacao
        page.evaluate("window.confirm = () => false;")
        requests_before = []
        page.on("request", lambda req: requests_before.append(req.url))
        page.get_by_test_id("btn-export-pdf").click()
        page.wait_for_timeout(600)
        assert not any("/api/export/pdf" in u for u in requests_before)

        # Salvar, validar status e export
        page.get_by_test_id("btn-save-edits").click()
        page.wait_for_timeout(1200)
        assert page.evaluate("hasUnsavedChanges()") is False

        status_after = _http_json("GET", "/api/status")
        resumo_after = status_after.get("reportData", {}).get("resumo_executivo", [])
        assert any("[e2e]" in str((it or {}).get("texto", "")) for it in resumo_after)

        pdf_req = urllib.request.Request(BASE_URL + "/api/export/pdf", method="POST")
        with urllib.request.urlopen(pdf_req, timeout=60) as resp:
            assert resp.status == 200
            assert "application/pdf" in (resp.headers.get("Content-Type") or "")

        pptx_req = urllib.request.Request(BASE_URL + "/api/export/pptx", method="POST")
        with urllib.request.urlopen(pptx_req, timeout=60) as resp:
            assert resp.status == 200
            ct = resp.headers.get("Content-Type") or ""
            assert "presentation" in ct or "octet-stream" in ct

        browser.close()

    # restore baseline
    _http_json("POST", "/api/save", {"reportData": baseline})
