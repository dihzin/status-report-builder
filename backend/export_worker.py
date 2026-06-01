"""
Worker executado como subprocess pelo exporter.py para rodar Playwright
sem conflito com o event loop do uvicorn (SelectorEventLoop no Windows).
"""
import json
import sys


def _pdf(url: str, path: str) -> None:
    """
    Gera PDF via screenshot 2× (3840×2160) do page-shell 1920×1080 nativo.

    Sequência de espera deliberada:
      1. wait_until="load"          → garante CSS, JS, imagens e fontes externas
      2. document.fonts.ready       → resolve FontFaceSet (Inter do Google Fonts)
      3. window.__renderComplete    → app.js sinalizou renderização completa
      4. evaluate de limpeza        → anula transição de fade-in, oculta toolbar,
                                      garante opacity=1 e re-renderiza Curva S
      5. wait_for_timeout(1000ms)   → reflow + repaint + composição final
    """
    import io
    from PIL import Image
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=['--hide-scrollbars'],          # evita que scrollbar reduza largura
        )
        page = browser.new_page(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,               # → screenshot 3840×2160 "retina"
        )

        # Passo 1-2: carrega tudo (incluindo fontes externas)
        page.goto(url, wait_until="load")
        page.evaluate("document.fonts.ready")   # Promise → bloqueia até Inter carregar

        # Passo 3: espera sinalização do app.js
        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        # Passo 4: oculta chrome de UI, anula fade-in, ajusta page-shell
        page.evaluate("""
            // Anula transição de fade-in (opacity ainda pode estar < 1)
            document.body.style.transition = 'none';
            document.body.style.opacity    = '1';
            document.body.classList.add('export-clean');

            var tb = document.querySelector('.toolbar');
            if (tb) tb.style.display = 'none';

            var vb = document.getElementById('validationBanner');
            if (vb) vb.style.display = 'none';
            var eb = document.getElementById('editModeBar');
            if (eb) eb.style.display = 'none';
            var dr = document.getElementById('configDrawer');
            if (dr) dr.classList.remove('open');
            var bd = document.getElementById('configDrawerBackdrop');
            if (bd) bd.style.display = 'none';

            var sh = document.querySelector('.page-shell');
            if (sh) {
                sh.style.borderRadius = '0';
                sh.style.boxShadow    = 'none';
                sh.style.border       = 'none';
                sh.style.margin       = '0';
            }

            // Re-renderiza Curva S para usar as dimensões finais do container
            if (window._lastRenderData) {
                try { renderCurvaS(window._lastRenderData.data || {}); } catch(e) {}
            }
        """)

        # Passo 5: aguarda reflow do layout + repaint + composição final
        page.wait_for_timeout(1000)

        # Captura 1920×1080 CSS px → 3840×2160 físicos (device_scale_factor=2)
        screenshot_bytes = page.screenshot(
            clip={"x": 0, "y": 0, "width": 1920, "height": 1080},
        )
        browser.close()

    img = Image.open(io.BytesIO(screenshot_bytes)).convert("RGB")
    # 3840×2160 @ 192 dpi → PDF de 20" × 11,25" (equivale a 1920×1080 @ 96 dpi)
    img.save(path, "PDF", resolution=192)


def _screenshot(url: str, path: str) -> None:
    """
    Captura PNG 1920×1080 para uso no slide PPTX.
    Aplica a mesma sequência de espera do _pdf para garantir fidelidade visual.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--hide-scrollbars'])
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        page.goto(url, wait_until="load")
        page.evaluate("document.fonts.ready")
        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        page.evaluate("""
            document.body.style.transition = 'none';
            document.body.style.opacity    = '1';
            document.body.classList.add('export-clean');
            var tb = document.querySelector('.toolbar');
            if (tb) tb.style.display = 'none';
            var vb = document.getElementById('validationBanner');
            if (vb) vb.style.display = 'none';
            var eb = document.getElementById('editModeBar');
            if (eb) eb.style.display = 'none';
            var dr = document.getElementById('configDrawer');
            if (dr) dr.classList.remove('open');
            var bd = document.getElementById('configDrawerBackdrop');
            if (bd) bd.style.display = 'none';
        """)

        page.wait_for_timeout(600)

        page.screenshot(
            path=path,
            clip={"x": 0, "y": 0, "width": 1920, "height": 1080},
        )
        browser.close()


def run_command(cmd: dict) -> int:
    action = cmd["action"]
    if action == "pdf":
        _pdf(cmd["url"], cmd["path"])
    elif action == "screenshot":
        _screenshot(cmd["url"], cmd["path"])
    else:
        raise RuntimeError(f"Unknown action: {action}")
    return 0


if __name__ == "__main__":
    cmd = json.loads(sys.argv[1])
    sys.exit(run_command(cmd))
