"""
Worker executado como subprocess pelo exporter.py para rodar Playwright
sem conflito com o event loop do uvicorn (SelectorEventLoop no Windows).
"""
import json
import sys


def _pdf(url: str, path: str) -> None:
    """
    Gera PDF multi-página via Playwright: 1 página por slide (totalSlides ao todo).

    Sequência:
      1. wait_until="load" + document.fonts.ready + window.__renderComplete
         → página completamente renderizada antes de qualquer captura
      2. export-clean aplicado uma única vez em TODOS os page-shells
         → remove toolbar, editModeBar, configDrawer, updateModal, bordas e sombras
      3. Para cada slide n de 1 a totalSlides:
         a. setSlide(n)        → ativa o slide sem usar a toolbar
         b. re-render SVGs     → Curva S (slide 2) e Gantt (slide 4) recalculam
                                 dimensões com o container agora visível
         c. wait_for_timeout   → reflow + repaint + composição final
         d. screenshot retina  → clip 1920×1080 CSS px → 3840×2160 físicos
      4. PIL combina todos os screenshots em PDF multi-página (192 dpi)
    """
    import io
    from PIL import Image
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=['--hide-scrollbars'],
        )
        page = browser.new_page(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
        )

        # Passo 1: carrega a página e aguarda render completo
        page.goto(url, wait_until="load")
        page.evaluate("document.fonts.ready")
        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        # Passo 2: export-clean em todos os slides de uma só vez
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
            var um = document.getElementById('updateModal');
            if (um) um.style.display = 'none';
            var dr = document.getElementById('configDrawer');
            if (dr) dr.classList.remove('open');
            var bd = document.getElementById('configDrawerBackdrop');
            if (bd) bd.style.display = 'none';

            // Remove bordas/sombras de TODOS os page-shells
            document.querySelectorAll('.page-shell').forEach(function(sh) {
                sh.style.borderRadius = '0';
                sh.style.boxShadow    = 'none';
                sh.style.border       = 'none';
                sh.style.margin       = '0';
            });
        """)

        # Passo 3: captura um screenshot por slide
        total = int(page.evaluate("window.totalSlides || 5"))
        images = []

        for n in range(1, total + 1):
            # Ativa o slide sem passar pela toolbar
            page.evaluate(f"setSlide({n})")

            # Re-renderiza SVGs que dependem das dimensões do container visível
            if n == 2:
                # Curva S: SVG inline recalcula width/height quando o slide fica visível
                page.evaluate("""
                    if (window._lastRenderData) {
                        try { renderCurvaS(window._lastRenderData.data || {}); } catch(e) {}
                    }
                """)
            elif n == 4:
                # Gantt: mesmo padrão
                page.evaluate("""
                    if (window._lastRenderData) {
                        try { renderGantt(window._lastRenderData.data || {}); } catch(e) {}
                    }
                """)

            # Aguarda reflow + repaint + composição (SVGs precisam de um ciclo completo)
            page.wait_for_timeout(900)

            raw = page.screenshot(
                clip={"x": 0, "y": 0, "width": 1920, "height": 1080},
            )
            images.append(Image.open(io.BytesIO(raw)).convert("RGB"))

        browser.close()

    # Passo 4: combina em PDF multi-página
    # 3840×2160 @ 192 dpi → equivale a 1920×1080 @ 96 dpi em tela
    if images:
        images[0].save(
            path,
            "PDF",
            resolution=192,
            save_all=True,
            append_images=images[1:],
        )


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
