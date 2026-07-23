from __future__ import annotations

from copy import deepcopy
from typing import Any


FIELD_CATEGORIES = {
    "manual": "manual",
    "importado": "importado",
    "calculado": "calculado",
    "derivado": "derivado",
    "sistema": "sistema",
    "visual_layout": "visual/layout",
}


def _clone(value: Any) -> Any:
    return deepcopy(value) if value is not None else None


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def build_report_data(raw_data: dict | None) -> dict:
    """
    Converte o payload bruto do Excel em um modelo canônico único (reportData).
    Mantém chaves legadas para compatibilidade com frontend e endpoints atuais.
    """
    raw = raw_data or {}
    # Snapshots anteriores não possuíam uma lista própria para decisões e o
    # slide de riscos reutilizava as próximas ações. Preserve o conteúdo atual
    # uma única vez como ponto de partida, mantendo as listas independentes
    # depois que a nova chave passar a existir.
    raw_decisions = raw.get("decisoes_necessarias")
    if not isinstance(raw_decisions, list):
        raw_decisions = _as_list(_clone(raw.get("proximas_acoes")))[:3]

    report_data = {
        "meta": {
            "version": 1,
            "source": "excel",
            "field_categories": FIELD_CATEGORIES,
            "locked_fields": [
                "derived.spi",
                "derived.real_percent",
                "derived.timeline_progress",
                "lists.ordem",
                "derived.raid_indicators",
            ],
        },
        "branding": _as_dict(_clone(raw.get("branding"))),
        "presentation_config": _as_dict(_clone(raw.get("presentation_config"))),
        "config": _as_dict(_clone(raw.get("config"))),
        "rodape": _as_dict(_clone(raw.get("rodape"))),
        "fases": _as_list(_clone(raw.get("fases"))),
        "kpis": _as_list(_clone(raw.get("kpis"))),
        "resumo_executivo": _as_list(_clone(raw.get("resumo_executivo"))),
        "pendencias_criticas": _as_list(_clone(raw.get("pendencias_criticas"))),
        "proximas_acoes": _as_list(_clone(raw.get("proximas_acoes"))),
        "decisoes_necessarias": _as_list(_clone(raw_decisions)),
        "curva_s": _as_list(_clone(raw.get("curva_s"))),
        "marcos": _as_list(_clone(raw.get("marcos"))),
        "gantt_tarefas": _as_list(_clone(raw.get("gantt_tarefas"))),
        "gantt_marcos": _as_list(_clone(raw.get("gantt_marcos"))),
        "gantt_config": _as_dict(_clone(raw.get("gantt_config"))),
    }

    # Normaliza "ordem" como campo de sistema (sempre sequencial)
    for key in ("fases", "kpis", "resumo_executivo", "proximas_acoes", "decisoes_necessarias", "marcos"):
        report_data[key] = [
            {**item, "ordem": idx + 1} if isinstance(item, dict) else item
            for idx, item in enumerate(report_data.get(key, []))
        ]

    # Campos derivados para visualização (não editáveis)
    planned = 0
    real = 0
    curva = report_data.get("curva_s") or []
    if curva:
        filled_real = [p for p in curva if isinstance(p, dict) and p.get("realizado") not in (None, "")]
        if filled_real:
            last_real = filled_real[-1]
            try:
                real = int(float(last_real.get("realizado") or 0))
            except Exception:
                real = 0
            try:
                planned = int(float(last_real.get("planejado") or 0))
            except Exception:
                planned = 0
    if not planned:
        try:
            planned = int(float(report_data["config"].get("progress_percent") or 0))
        except Exception:
            planned = 0
    spi = round(real / planned, 2) if planned > 0 else 0

    report_data["derived"] = {
        "planned_percent": planned,
        "real_percent": real,
        "spi": spi,
        "timeline_progress": {
            "total": len(report_data.get("fases", [])),
            "done": len([f for f in report_data.get("fases", []) if "conclu" in str((f or {}).get("status", "")).lower()]),
        },
        "raid_indicators": {
            "has_pmar_source": bool(str(report_data.get("config", {}).get("pmar_source", "")).strip()),
        },
    }

    return report_data


def to_legacy_data_shape(report_data: dict | None) -> dict:
    """
    Mantém o formato legado esperado pelo frontend atual em /api/status.data.
    """
    rd = report_data or {}
    return {
        "branding": _as_dict(_clone(rd.get("branding"))),
        "presentation_config": _as_dict(_clone(rd.get("presentation_config"))),
        "config": _as_dict(_clone(rd.get("config"))),
        "rodape": _as_dict(_clone(rd.get("rodape"))),
        "fases": _as_list(_clone(rd.get("fases"))),
        "kpis": _as_list(_clone(rd.get("kpis"))),
        "resumo_executivo": _as_list(_clone(rd.get("resumo_executivo"))),
        "pendencias_criticas": _as_list(_clone(rd.get("pendencias_criticas"))),
        "proximas_acoes": _as_list(_clone(rd.get("proximas_acoes"))),
        "decisoes_necessarias": _as_list(_clone(rd.get("decisoes_necessarias"))),
        "curva_s": _as_list(_clone(rd.get("curva_s"))),
        "marcos": _as_list(_clone(rd.get("marcos"))),
        "gantt_tarefas": _as_list(_clone(rd.get("gantt_tarefas"))),
        "gantt_marcos": _as_list(_clone(rd.get("gantt_marcos"))),
        "gantt_config": _as_dict(_clone(rd.get("gantt_config"))),
    }
