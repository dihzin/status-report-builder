# Contexto da Sessão — Gantt Chart H2R
**Data última atualização:** 2026-05-19
**Arquivo de trabalho atual:** `gantt-v4.html`
**Pasta base:** `C:\Users\dirce\Pessoal\Projetos\GANTT-CHART\Gantt_Versao_Consolidada\`

---

## Estrutura da pasta

```
Gantt_Versao_Consolidada\
├── gantt-v3.html              ← versão estável (não mexer)
├── gantt-v4.html              ← versão de trabalho ATIVA
├── gantt-template-pt/es/en.xlsx
├── README.md                  ← manual de uso atualizado
├── PLANO_DE_TESTES.md         ← 14 seções, 80+ casos
├── CONTEXTO_SESSAO.md         ← este arquivo
├── _build_template.py
└── _backup\
    ├── gantt-v1.html
    ├── gantt-v2.html
    ├── gantt-v7.html
    ├── v3 a v6 (snapshots por data)
    └── v8-2026-05-19\gantt-v3.html  ← snapshot antes de v4
```

---

## Stack

HTML/CSS/JS puro, single-file, sem framework.
Persistência via `localStorage`. Export CSV/Excel/PNG/JSON. i18n PT/ES/EN.

---

## Funcionalidades implementadas e validadas (gantt-v3 → base do v4)

- Hierarquia N níveis (colapsar/expandir)
- View Manager (colunas, filtros, densidade, visualizações salvas)
- Filtros: marcos, 100%, fins de semana, % nas barras, status
- Filtros avançados: % range, responsável, janela de datas
- Busca destacada (amarelo pulsante + borda laranja)
- Coluna **ID** (50px, mono, ocultável)
- Coluna **WBS** — código posicional computado (ex: 1.1.2), não armazenado
  - Mostrado no tooltip da barra
  - Mostrado no editor (readonly)
  - Incluído no export CSV e Excel
- Scroll horizontal no painel lateral (header acompanha)
- Zoom "Tudo" com mínimo 6px/dia (cronogramas longos ativam scrollbar)
- Export PNG corrigido — substituído `foreignObject` por SVG nativo (eliminado canvas taint)
- Persistência, i18n PT/ES/EN, temas

---

## Novidades implementadas no gantt-v4.html

### 1. Dataset H2R Program Roadmap (Apr–Dec 2026)
DEFAULT_DATA substituído com 37 itens reais extraídos da imagem do roadmap:
- 9 workstreams como fases pai
- Todas as tarefas com datas alinhadas às semanas ISO (W14–W53)
- Dependências mapeadas conforme setas da imagem
- Hierarquia: Programa → Workstream → Tarefa

**Mapeamento de semanas ISO → datas:**
- W14 = 2026-03-30 | W19 = 2026-05-04 | W23 = 2026-06-01
- W27 = 2026-06-29 | W36 = 2026-08-31 | W44 = 2026-10-26
- W46 = 2026-11-09 | W53 = 2026-12-28

### 2. Campo `marker` no modelo de dados
- `marker: "go-live"` → linha vertical azul sólida + triângulo azul ▲
- `marker: "decision"` → linha vertical vermelha tracejada + losango vermelho maior
- `marker: ""` (default) → comportamento normal sem alteração

**Itens com marker no DEFAULT_DATA:**
- id "34" Go Live – H2R LATAM → `go-live`
- id "35" Go Live – Brazil → `go-live`
- id "36" Go Live – Chile + Argentina → `go-live`
- id "37" Go/No Go – Chile + Argentina → `decision`

### 3. Linhas verticais de marcadores na timeline
- Linhas com label rotacionado (vertical) ao longo da linha
- CSS: `.golive-line`, `.decision-line`, `.marker-label`
- inlineStyles atualizado para export PNG

### 4. Shapes distintos de marco
- Normal: diamante cinza (padrão existente)
- `go-live`: triângulo azul ▲ (#2563eb)
- `decision`: losango vermelho maior (#dc2626)

### 5. Baseline tracking + badge `+N w` ✅ IMPLEMENTADO
Campos `baseline_start` e `baseline_end` no modelo de dados.
- Barra cinza translúcida (#94a3b8, opacity 0.30) desenhada **antes** da barra atual
- Contorno tracejado na barra baseline (stroke #64748b, dasharray 3,2)
- Badge âmbar `+Nw` no canto superior direito da barra quando há desvio positivo
- Tooltip mostra baseline (período original) + desvio em semanas
- i18n: `tt_baseline` / `tt_delay` nos 3 idiomas
- inlineStyles() atualizado para PNG export
- CSS classes: `.baseline-bar`, `.baseline-bar-outline`, `.badge-delay-bg`, `.badge-delay-txt`

**8 tarefas com baseline no DEFAULT_DATA (da imagem — nota de rodapé):**

| ID | Tarefa | baseline_end | end atual | Desvio |
|----|--------|-------------|-----------|--------|
| 4  | Devices | 2026-04-10 | 2026-07-31 | +16w |
| 3  | R2 Interfaces | 2026-05-22 | 2026-06-12 | +3w |
| 10 | SIT 2 | 2026-05-08 | 2026-05-29 | +3w |
| 12 | MVP | 2026-05-15 | 2026-05-22 | +1w |
| 14 | E2E | 2026-07-17 | 2026-08-14 | +4w |
| 20 | TTT LATAM | 2026-07-10 | 2026-07-17 | +1w |
| 27 | Cutover Execution LATAM | 2026-09-04 | 2026-09-18 | +2w |
| 29 | Hypercare Preparation | 2026-06-05 | 2026-06-12 | +1w |

---

## Objetivos pendentes (próxima sessão)

### Prioridade 1 — Swimlanes com cor por workstream
Banda de cor de fundo + borda colorida por workstream (nível 1 da hierarquia).
Cada workstream teria uma cor associada visível no painel lateral e na timeline.

**Design sugerido:**
- Definir paleta de até 10 cores para workstreams (mapeadas por ordem de aparição)
- Row band na timeline: fill com a cor do workstream pai (opacity muito baixa ~0.06)
- Borda esquerda no painel lateral colorida por workstream
- Cabeçalho do workstream (summary row) com cor mais saturada

### Prioridade 2 — Cor da barra por categoria
Atualmente a cor vem do status/prioridade.
Adicionar opção de colorir por workstream/fase pai (toggle no View Manager).

### Prioridade 3 — Legenda visual
Mini-legenda no canto da timeline mostrando:
- Símbolos dos marcadores (▲ Go Live, ◆ Decision, ◆ Marco)
- Significado das barras baseline vs. atual

---

## Como retomar

1. Abrir `gantt-v4.html` no browser
2. Confirmar o baseline tracking funcionando (8 tarefas com barra cinza + badges +Nw)
3. Decidir próxima prioridade: swimlanes ou cor por categoria

**Contexto rápido para nova sessão:**
> "Estou desenvolvendo o gantt-v4.html em C:\Users\dirce\Pessoal\Projetos\GANTT-CHART\Gantt_Versao_Consolidada\. Implementado: WBS, scroll horizontal, PNG corrigido, marker field (go-live/decision), linhas verticais, shapes distintos, baseline tracking (barra cinza + badge +Nw). Dataset é H2R Program Roadmap (Apr-Dec 2026). Próximo passo: swimlanes com cor por workstream. Veja CONTEXTO_SESSAO.md para detalhes completos."
