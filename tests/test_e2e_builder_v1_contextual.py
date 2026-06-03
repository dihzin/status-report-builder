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

        curva_snapshot = page.evaluate(
            """
            () => {
                const source = (window._lastRenderData && (window._lastRenderData.reportData || window._lastRenderData.data)) || {};
                const metrics = window.getCurvaSCurrentMetrics ? window.getCurvaSCurrentMetrics(source) : null;
                const curvaText = document.getElementById('curvaSvg')?.textContent || '';
                const hasPendenciaStatusBadge = !!document.querySelector('#pendencias .status-pill');
                const hasHeaderAlertCard = !!document.getElementById('alertBar');
                const hasRefreshButton = Array.from(document.querySelectorAll('.toolbar .tb-btn'))
                    .some((el) => (el.textContent || '').includes('Atualizar'));
                const editButtonText = (document.querySelector('[data-testid="btn-edit"]')?.textContent || '').trim();
                const exportPdfButtonText = (document.querySelector('[data-testid="btn-export-pdf"]')?.textContent || '').trim();
                const presentationButtonText = Array.from(document.querySelectorAll('.toolbar .tb-btn'))
                    .map((el) => (el.textContent || '').trim())
                    .find((text) => text.includes('Modo apresentação')) || '';
                const hasCoverPartner = !!document.getElementById('coverPartner');
                const hasCoverBottom = !!document.querySelector('.deck-cover-bottom');
                const hasCoverBottomline = !!document.querySelector('.deck-cover-bottomline');
                return { metrics, curvaText, hasPendenciaStatusBadge, hasHeaderAlertCard, hasRefreshButton, editButtonText, exportPdfButtonText, presentationButtonText, hasCoverPartner, hasCoverBottom, hasCoverBottomline };
            }
            """
        )
        metrics = curva_snapshot["metrics"]
        assert metrics is not None
        assert f"Plano: {metrics['planned']}%" in curva_snapshot["curvaText"]
        assert f"Real: {metrics['real']}%" in curva_snapshot["curvaText"]
        assert metrics["deltaLabel"] in curva_snapshot["curvaText"]
        assert "Planejado" in curva_snapshot["curvaText"]
        assert "Realizado" in curva_snapshot["curvaText"]
        assert curva_snapshot["hasPendenciaStatusBadge"] is False
        assert curva_snapshot["hasHeaderAlertCard"] is False
        assert curva_snapshot["hasRefreshButton"] is False
        assert curva_snapshot["editButtonText"] == ""
        assert curva_snapshot["exportPdfButtonText"] == ""
        assert curva_snapshot["presentationButtonText"] == ""
        assert curva_snapshot["hasCoverPartner"] is False
        assert curva_snapshot["hasCoverBottom"] is False
        assert curva_snapshot["hasCoverBottomline"] is False

        page.evaluate("setSlide(3)")
        page.wait_for_function("() => document.querySelector('#slide3')?.classList.contains('active')")
        page.reload(wait_until="domcontentloaded")
        _wait_for_app_ready(page, console_messages, page_errors)
        persisted_slide = page.evaluate(
            """
            () => ({
                activeSlideId: document.querySelector('.deck-slide.active')?.id || null,
                indicator: document.getElementById('slideIndicator')?.textContent || '',
                hasRiskBoard: !!document.getElementById('riskBoardRows'),
            })
            """
        )
        assert persisted_slide["activeSlideId"] == "slide3"
        assert "Slide 3/" in persisted_slide["indicator"]
        assert persisted_slide["hasRiskBoard"] is True
        page.evaluate("setSlide(2)")
        page.wait_for_function("() => document.querySelector('#slide2')?.classList.contains('active')")

        # Regressão: botão "Adicionar" deve sumir ao cancelar edição.
        page.get_by_test_id("btn-edit").click()
        page.wait_for_function("() => document.body?.dataset.mode === 'edit'")
        edit_surface = page.evaluate(
            """
            () => {
                const resumo = document.querySelector('#resumo .resumo-text');
                const acoes = document.querySelector('#acoes .acao-text');
                const pendencia = document.querySelector('#pendencias .risk-title');
                const marco = document.querySelector('.milestone-row .ms-name-text');
                const pendAdd = document.querySelector('.edit-add-wrap[data-for="pendencias"]');
                const updateRail = document.getElementById('updateRail');
                const pageShell = document.querySelector('.page-shell.active, .page-shell');
                return {
                    resumoEditable: resumo?.getAttribute('contenteditable'),
                    acoesEditable: acoes?.getAttribute('contenteditable'),
                    pendenciaEditable: pendencia?.getAttribute('contenteditable'),
                    marcoEditable: marco?.getAttribute('contenteditable'),
                    pendStatusBadgeCount: document.querySelectorAll('#pendencias .status-pill').length,
                    pendAddInPanel: !!pendAdd && !!pendAdd.closest('.panel') && !pendAdd.closest('.critical-table'),
                    updateOutsideShell: !!updateRail && !updateRail.closest('.page-shell'),
                    shellText: pageShell?.innerText || '',
                };
            }
            """
        )
        assert edit_surface["resumoEditable"] == "true"
        assert edit_surface["acoesEditable"] == "true"
        assert edit_surface["pendenciaEditable"] == "true"
        assert edit_surface["marcoEditable"] == "true"
        assert edit_surface["pendStatusBadgeCount"] == 0
        assert edit_surface["pendAddInPanel"] is True
        assert edit_surface["updateOutsideShell"] is True
        for forbidden in [
            "Versão atual",
            "Verificar atualizações",
            "Baixar atualização",
            "Instalar e reiniciar",
            "Atualizações",
            "Nova versão disponível",
            "GitHub",
            "v0.7.1",
        ]:
            assert forbidden not in edit_surface["shellText"]
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
            "Capa",
            "Header",
            "Timeline",
            "Rodapé",
            "Fases do Projeto (Timeline)",
            "Indicadores — KPI Cards",
            "Curva S — Dados do Gráfico",
        ]
        for txt in expect_texts:
            assert drawer.get_by_text(txt, exact=False).count() > 0
        assert drawer.get_by_text("Alerta do Header", exact=False).count() == 0

        assert drawer.get_by_text("Metadados do snapshot", exact=False).count() == 0
        assert page.locator(".drawer-input.drawer-locked[disabled]").count() >= 1

        # Header
        project_name = drawer.locator(".drawer-field").filter(has_text="Nome do Projeto").locator("input")
        project_name.fill("Projeto E2E Persist")

        # Timeline
        current_phase = drawer.locator(".drawer-field").filter(has_text="Fase Atual").locator("input")
        current_phase.fill("Fase E2E")

        milestone_alvo = drawer.locator(".drawer-field").filter(has_text="Milestone Alvo").locator("input")
        milestone_alvo.fill("Marco E2E")

        owner_pm = drawer.locator(".drawer-field").filter(has_text="Responsável (PM)").locator("input")
        owner_pm.fill("PM E2E")

        page.locator(".config-drawer-close").click()
        page.wait_for_function(
            "() => document.querySelector('[data-testid=\"config-drawer\"]')?.getAttribute('aria-hidden') === 'true'"
        )

        page.evaluate("setSlide(1)")
        page.wait_for_function("() => document.querySelector('#slide1')?.classList.contains('active')")
        cover_surface = page.evaluate(
            """
            () => {
                const ids = [
                    'coverEyebrow',
                    'coverMainTitle',
                    'coverSubtitle',
                    'coverClientLabel',
                    'coverClient',
                    'coverOwnerLabel',
                    'coverOwner',
                    'coverDateLabel',
                    'coverDurationLabel',
                    'coverDuration',
                ];
                const state = {};
                ids.forEach((id) => {
                    const el = document.getElementById(id);
                    state[id] = el?.getAttribute('contenteditable') || null;
                });
                state.coverDateClickable = document.getElementById('coverDate')?.classList.contains('edit-date-field') || false;
                return state;
            }
            """
        )
        assert cover_surface["coverEyebrow"] == "true"
        assert cover_surface["coverMainTitle"] == "true"
        assert cover_surface["coverSubtitle"] == "true"
        assert cover_surface["coverClientLabel"] == "true"
        assert cover_surface["coverClient"] == "true"
        assert cover_surface["coverOwnerLabel"] == "true"
        assert cover_surface["coverOwner"] == "true"
        assert cover_surface["coverDateLabel"] == "true"
        assert cover_surface["coverDurationLabel"] == "true"
        assert cover_surface["coverDuration"] == "true"
        assert cover_surface["coverDateClickable"] is True

        page.evaluate(
            """
            () => {
                const updates = {
                    coverEyebrow: 'STATUS REPORT E2E · FASE EXPLORE',
                    coverMainTitle: 'Implementação E2E na EDF',
                    coverSubtitle: 'Subtítulo premium E2E.',
                    coverClientLabel: 'CLIENTE CHAVE',
                    coverClient: 'Cliente E2E Inline',
                    coverDurationLabel: 'TEMPO',
                    coverDuration: '45 minutos premium',
                };
                Object.entries(updates).forEach(([id, value]) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.textContent = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                });
            }
            """
        )

        page.locator("#coverDate").evaluate("(el) => el.click()")
        page.wait_for_function("() => !!document.querySelector('.date-overlay-input')")
        page.evaluate(
            """
            () => {
                const input = document.querySelector('.date-overlay-input');
                input.value = '2026-05-29';
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            """
        )

        page.evaluate("setSlide(5)")
        page.wait_for_function("() => document.querySelector('#slide5')?.classList.contains('active')")
        closing_surface = page.evaluate(
            """
            () => {
                const ids = [
                    'closingTitle',
                    'closingThanks',
                    'closingLead',
                    'closingCardLabel',
                    'closingMilestone',
                    'closingDates',
                    'closingFooterLabel',
                    'closingFooterMeta',
                ];
                const state = {};
                ids.forEach((id) => {
                    const el = document.getElementById(id);
                    state[id] = el?.getAttribute('contenteditable') || null;
                });
                return state;
            }
            """
        )
        assert closing_surface["closingTitle"] == "true"
        assert closing_surface["closingThanks"] == "true"
        assert closing_surface["closingLead"] == "true"
        assert closing_surface["closingCardLabel"] == "true"
        assert closing_surface["closingMilestone"] == "true"
        assert closing_surface["closingDates"] == "true"
        assert closing_surface["closingFooterLabel"] == "true"
        assert closing_surface["closingFooterMeta"] == "true"

        page.evaluate(
            """
            () => {
                const updates = {
                    closingTitle: 'ENCERRAMENTO E2E',
                    closingThanks: 'Agradecemos.',
                    closingLead: 'Fechamento E2E com clareza de proximo passo.',
                    closingCardLabel: 'PRÓXIMA ENTREGA',
                    closingMilestone: 'Hypercare E2E',
                    closingDates: 'Data alvo 30/jun/26 • Go-Live 13/jul/26',
                    closingFooterLabel: 'FECHAMENTO EXECUTIVO',
                    closingFooterMeta: 'PM E2E · 28/MAI/26',
                };
                Object.entries(updates).forEach(([id, value]) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.textContent = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                });
            }
            """
        )

        page.evaluate("setSlide(2)")
        page.wait_for_function("() => document.querySelector('#slide2')?.classList.contains('active')")

        # Resumo Executivo (inline)
        resumo_inline = page.get_by_test_id("section-resumo").locator(".resumo-text").first
        resumo_inline.click()
        resumo_focus = page.evaluate(
            """
            () => {
                const el = document.querySelector('#resumo .resumo-text');
                return {
                    isActive: document.activeElement === el,
                    selection: window.getSelection()?.toString() || '',
                    contentEditable: el?.getAttribute('contenteditable') || null,
                };
            }
            """
        )
        assert resumo_focus["isActive"] is True
        assert resumo_focus["contentEditable"] == "true"
        assert resumo_focus["selection"] != ""
        page.keyboard.type("Resumo E2E Inline")

        # Pendencias Criticas (inline)
        page.get_by_test_id("section-pendencias").locator(".risk-title").first.click()
        page.keyboard.type("Pendência E2E Inline")
        pend_meta_inline = page.get_by_test_id("section-pendencias").locator('.risk-meta-val[data-edit-pend-meta="responsaveis"]').first
        pend_meta_inline.click()
        pend_meta_focus = page.evaluate(
            """
            () => {
                const el = document.querySelector('#pendencias .risk-meta-val[data-edit-pend-meta="responsaveis"]');
                return {
                    isActive: document.activeElement === el,
                    contentEditable: el?.getAttribute('contenteditable') || null,
                };
            }
            """
        )
        assert pend_meta_focus["isActive"] is True
        assert pend_meta_focus["contentEditable"] == "true"
        page.keyboard.type("Resp E2E Inline")

        pend_priority = page.get_by_test_id("section-pendencias").locator(".priority-pill").first
        pend_priority.click()
        page.locator(".badge-sel-menu.open .badge-sel-item").filter(has_text="P4").first.click()

        pend_date = page.get_by_test_id("section-pendencias").locator('[data-edit-pend-date="data_limite"]').first
        pend_date.evaluate("(el) => el.click()")
        page.wait_for_function("() => !!document.querySelector('.date-overlay-input')")
        page.evaluate(
            """
            () => {
                const input = document.querySelector('.date-overlay-input');
                input.value = '2026-06-30';
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            """
        )

        page.locator('.edit-add-wrap[data-for="pendencias"] .edit-add-btn').click()
        new_pend_detail = page.locator('#pendencias tr[data-edit-idx="2"] .risk-meta-val[data-edit-pend-meta="responsaveis"]').first
        new_pend_snapshot = page.evaluate(
            """
            () => {
                const detail = document.querySelector('#pendencias tr[data-edit-idx="2"] .risk-meta-val[data-edit-pend-meta="responsaveis"]');
                return {
                    hasMetaRow: !!document.querySelector('#pendencias tr[data-edit-idx="2"] .risk-meta'),
                    contentEditable: detail?.getAttribute('contenteditable') || null,
                };
            }
            """
        )
        assert new_pend_snapshot["hasMetaRow"] is True
        assert new_pend_snapshot["contentEditable"] == "true"
        new_pend_detail.evaluate("(el) => { el.textContent = ''; el.focus(); }")
        page.keyboard.type("Detalhe nova pendência")

        # Proximas Acoes (inline)
        page.get_by_test_id("section-acoes").locator(".acao-text").first.click()
        page.keyboard.type("Ação E2E Inline")

        # Marcos (inline)
        page.get_by_test_id("section-marcos").locator(".ms-name-text").first.click()
        page.keyboard.type("Marco E2E Inline")

        # Rodapé (inline)
        report_name_inline = page.locator('#footerStrip [data-edit-config="report_name"]')
        report_name_inline.click()
        footer_focus = page.evaluate(
            """
            () => {
                const el = document.querySelector('#footerStrip [data-edit-config="report_name"]');
                return {
                    isActive: document.activeElement === el,
                    contentEditable: el?.getAttribute('contenteditable') || null,
                    selection: window.getSelection()?.toString() || '',
                };
            }
            """
        )
        assert footer_focus["isActive"] is True
        assert footer_focus["contentEditable"] == "true"
        assert footer_focus["selection"] != ""
        page.keyboard.type("Status Report E2E Inline")

        report_date_inline = page.locator('#footerStrip [data-edit-config-date="report_date"]')
        report_date_inline.evaluate("(el) => el.click()")
        page.wait_for_function("() => !!document.querySelector('.date-overlay-input')")
        page.evaluate(
            """
            () => {
                const input = document.querySelector('.date-overlay-input');
                input.value = '2026-05-28';
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            """
        )

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
        assert cfg.get("cover_eyebrow") == "STATUS REPORT E2E · FASE EXPLORE"
        assert cfg.get("cover_main_title") == "Implementação E2E na EDF"
        assert cfg.get("cover_subtitle") == "Subtítulo premium E2E."
        assert cfg.get("cover_client_label") == "CLIENTE CHAVE"
        assert cfg.get("cover_duration_label") == "TEMPO"
        assert cfg.get("closing_eyebrow") == "ENCERRAMENTO E2E"
        assert cfg.get("closing_thanks") == "Agradecemos."
        assert cfg.get("closing_lead") == "Fechamento E2E com clareza de proximo passo."
        assert cfg.get("closing_next_step_label") == "PRÓXIMA ENTREGA"
        assert cfg.get("closing_milestone_text") == "Hypercare E2E"
        assert cfg.get("closing_dates_text") == "Data alvo 30/jun/26 • Go-Live 13/jul/26"
        assert cfg.get("closing_footer_label") == "FECHAMENTO EXECUTIVO"
        assert cfg.get("closing_footer_meta") == "PM E2E · 28/MAI/26"
        assert cfg.get("project_name") == "Projeto E2E Persist"
        assert cfg.get("sponsor") == "Cliente E2E Inline"
        assert cfg.get("current_phase") == "Fase E2E"
        assert cfg.get("owner_name") == "PM E2E"
        assert cfg.get("presentation_duration") == "45 minutos premium"
        assert cfg.get("report_name") == "Status Report E2E Inline"
        assert cfg.get("report_date") == "28/05/2026"
        assert rod.get("milestone_alvo") == "Marco E2E"
        resumo_after = status_after.get("reportData", {}).get("resumo_executivo", [])
        assert any("Resumo E2E Inline" in str((it or {}).get("texto", "")) for it in resumo_after)
        acoes_after = status_after.get("reportData", {}).get("proximas_acoes", [])
        assert any("Ação E2E Inline" in str((it or {}).get("texto", "")) for it in acoes_after)
        pendencias_after = status_after.get("reportData", {}).get("pendencias_criticas", [])
        assert any("Pendência E2E Inline" in str((it or {}).get("item", "")) for it in pendencias_after)
        assert any("Resp E2E Inline" in str((it or {}).get("responsaveis", "")) for it in pendencias_after)
        assert any("Detalhe nova pendência" in str((it or {}).get("responsaveis", "")) for it in pendencias_after)
        assert any(str((it or {}).get("prioridade", "")) == "P4" for it in pendencias_after)
        assert any(str((it or {}).get("data_limite", "")) == "30/06/2026" for it in pendencias_after)
        marcos_after = status_after.get("reportData", {}).get("marcos", [])
        assert any("Marco E2E Inline" in str((it or {}).get("nome", "")) for it in marcos_after)

        # restore baseline before closing the browser to keep the app server lifecycle stable
        _http_json("POST", "/api/save", {"reportData": baseline})
        browser.close()
