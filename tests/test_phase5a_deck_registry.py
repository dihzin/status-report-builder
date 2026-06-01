from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_registry_file_exists_and_has_required_keys():
    src = _read("frontend/deckFieldRegistry.js")
    required = [
        "path",
        "label",
        "section",
        "inputType",
        "editable",
        "derived",
        "visibleInDeck",
        "visibleInPdf",
        "visibleInPptx",
        "editorMode",
        "order",
    ]
    for key in required:
        assert key in src


def test_registry_has_all_editor_modes_and_core_sections():
    src = _read("frontend/deckFieldRegistry.js")
    for mode in ['"main"', '"contextual"', '"readonly"', '"internal"']:
        assert mode in src
    for section in [
        "header",
        "header_alert",
        "timeline",
        "kpi_cards",
        "resumo_executivo",
        "pendencias_criticas",
        "proximas_acoes",
        "curva_s",
        "marcos_datas_alvo",
        "rodape",
    ]:
        assert section in src


def test_registry_is_loaded_before_app_script():
    html = _read("frontend/index.html")
    assert '<script src="deckFieldRegistry.js"></script>' in html
    assert html.index('deckFieldRegistry.js') < html.index('app.js')


def test_app_drawer_uses_registry_filters_and_readonly_block():
    app = _read("frontend/app.js")
    assert "DECK_FIELD_REGISTRY" in app
    assert "_hasRegistryFields('header', 'main')" in app
    assert "_hasRegistryFields('timeline', 'contextual')" in app
    assert "editorMode === 'readonly'" in app
    assert "Campo derivado (somente leitura)" in app
