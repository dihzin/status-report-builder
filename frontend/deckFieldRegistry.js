/* Registry central do deck para o Builder V1 */
(function () {
  var sections = {
    header: "Header",
    header_alert: "Alerta do Header",
    timeline: "Timeline",
    kpi_cards: "KPI Cards",
    resumo_executivo: "Resumo Executivo",
    pendencias_criticas: "Pendências Críticas",
    proximas_acoes: "Próximas Ações",
    curva_s: "Curva S",
    marcos_datas_alvo: "Marcos e Datas-Alvo",
    rodape: "Rodapé",
    internal: "Configurações técnicas/internas",
  };

  window.DECK_FIELD_REGISTRY = {
    sections: sections,
    fields: [
      { path: "config.project_name", label: "Nome do Projeto", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 10 },
      { path: "config.project_subtitle", label: "Subtítulo", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 20 },
      { path: "config.sponsor", label: "Sponsor / Cliente", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 30 },
      { path: "config.partner_name", label: "Parceiro", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 40 },
      { path: "config.owner_name", label: "Responsável (PM)", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 50 },
      { path: "config.report_date", label: "Data do Relatório", section: "header", inputType: "date", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 60 },
      { path: "config.report_name", label: "Nome do Relatório", section: "header", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 70 },

      { path: "config.alert_label", label: "Texto do Alerta", section: "header_alert", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: false, editorMode: "main", order: 80 },
      { path: "config.alert_level", label: "Nível do Alerta", section: "header_alert", inputType: "select", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: false, editorMode: "main", order: 90 },

      { path: "config.current_phase", label: "Fase Atual", section: "timeline", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 100 },
      { path: "config.current_day", label: "Dia Atual", section: "timeline", inputType: "number", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 110 },
      { path: "config.total_days", label: "Total de Dias", section: "timeline", inputType: "number", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 120 },
      { path: "fases", label: "Fases (lista)", section: "timeline", inputType: "table", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 130 },

      { path: "kpis", label: "Indicadores (lista)", section: "kpi_cards", inputType: "table", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 200 },
      { path: "derived.spi", label: "SPI (derivado)", section: "kpi_cards", inputType: "number", editable: false, derived: true, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "readonly", order: 210 },
      { path: "derived.planned_percent", label: "% Planejado (derivado)", section: "kpi_cards", inputType: "number", editable: false, derived: true, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "readonly", order: 220 },
      { path: "derived.real_percent", label: "% Realizado (derivado)", section: "kpi_cards", inputType: "number", editable: false, derived: true, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "readonly", order: 230 },

      { path: "resumo_executivo", label: "Resumo Executivo (lista)", section: "resumo_executivo", inputType: "list", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 300 },
      { path: "pendencias_criticas", label: "Pendências Críticas (lista)", section: "pendencias_criticas", inputType: "table", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 400 },
      { path: "proximas_acoes", label: "Próximas Ações (lista)", section: "proximas_acoes", inputType: "list", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 500 },
      { path: "curva_s", label: "Curva S (lista)", section: "curva_s", inputType: "table", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 600 },
      { path: "marcos", label: "Marcos (lista)", section: "marcos_datas_alvo", inputType: "list", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "contextual", order: 700 },

      { path: "rodape.milestone_alvo", label: "Milestone Alvo", section: "rodape", inputType: "text", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 800 },
      { path: "rodape.data_alvo", label: "Data Alvo", section: "rodape", inputType: "date", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 810 },
      { path: "rodape.go_live_previsto", label: "Go-Live", section: "rodape", inputType: "date", editable: true, derived: false, visibleInDeck: true, visibleInPdf: true, visibleInPptx: true, editorMode: "main", order: 820 },

      { path: "meta", label: "Metadados do snapshot", section: "internal", inputType: "json", editable: false, derived: false, visibleInDeck: false, visibleInPdf: false, visibleInPptx: false, editorMode: "internal", order: 900 },
      { path: "derived.timeline_progress", label: "Timeline progress (interno)", section: "internal", inputType: "json", editable: false, derived: true, visibleInDeck: false, visibleInPdf: false, visibleInPptx: false, editorMode: "internal", order: 910 },
      { path: "derived.raid_indicators", label: "RAID indicators (interno)", section: "internal", inputType: "json", editable: false, derived: true, visibleInDeck: false, visibleInPdf: false, visibleInPptx: false, editorMode: "internal", order: 920 },
      { path: "config.pmar_source", label: "Fonte PMAR (legado)", section: "internal", inputType: "text", editable: false, derived: false, visibleInDeck: false, visibleInPdf: false, visibleInPptx: false, editorMode: "internal", order: 930 },
    ],
  };
})();
