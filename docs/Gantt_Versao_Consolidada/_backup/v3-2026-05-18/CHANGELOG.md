# Backup v3 — 2026-05-18

Snapshot estável capturado antes da implementação dos recursos Tier 3 de baixa complexidade.

## Estado funcional neste backup

### Aplicação (gantt-v3.html)
- Renderização SVG do gráfico com hierarquia N níveis (parent_id)
- Zoom: Dias / Semanas / Meses / Anos / Tudo
- Pan da timeline; expand/collapse por nó
- Dependências como setas com destaque ao hover
- Linha de "hoje" tracejada
- Splitter ajustável
- Labels (% interno + nome + duração) com toggle na toolbar
- 3 idiomas: PT-BR / ES / EN (com tradução de meses, dias da semana, status)
- Sistema de temas: 7 presets + temas customizados nomeados
- Modal de Visualização: colunas show/hide, filtros (marcos / 100% / weekends / % sobre barras / status), densidade, visualizações nomeadas salvas

### Editor de dados
- Tabela inline editável com 11 colunas (incluindo parent_id)
- Drag-and-drop para reordenar
- Indent/Outdent (⇤⇥) para promover/rebaixar na hierarquia
- Detecção de ciclos
- Validação de campos obrigatórios e ranges

### Import/Export
- CSV (auto-detecção de delimitador, cabeçalhos PT/ES/EN)
- Excel (.xlsx via SheetJS lazy-load)
- PNG (Canvas + foreignObject)
- JSON (clipboard)
- Template CSV gerado on-demand

### Templates Excel (3 idiomas)
Cada arquivo tem 4 abas:
- **Dados/Datos/Data**: 11 colunas com validações ativas e dados de exemplo hierárquicos
- **Instruções/Instrucciones/Instructions**: descrição de cada coluna + 10 regras gerais
- **Glossário Status**: referência visual de prioridades
- **% Completion**: lógica detalhada com 6 seções (quem preenche, fórmula recursiva, exemplo de 3 níveis com 13 folhas e cálculo bottom-up, alerta de média de folhas vs fases, rubrica 0/25/50/75/100, pegadinhas)

### Persistência (localStorage)
- `gantt-data-v2`: dados do projeto
- `gantt-lang`: idioma escolhido
- `gantt-theme` + `gantt-theme-custom`: tema atual
- `gantt-user-themes`: temas personalizados salvos
- `gantt-bar-labels`: toggle de labels nas barras
- `gantt-view-prefs-v1`: preferências de visualização
- `gantt-saved-views-v1`: visualizações nomeadas salvas

## Arquivos

| Arquivo | Versão | Função |
|---|---|---|
| gantt.html | v1 (legado) | Versão original sem refatoração hierárquica completa |
| gantt-v2.html | v2 | Refatoração para parent_id + View Manager completo |
| gantt-v3.html | v3 | Cópia de v2 para bypass de cache (idêntico a v2) |
| gantt-template-pt.xlsx | — | Template Excel português |
| gantt-template-es.xlsx | — | Template Excel español |
| gantt-template-en.xlsx | — | Template Excel english |
| _build_template.py | — | Gerador dos 3 templates Excel |
| README.md | — | Documentação do projeto |

## Próxima onda (Tier 3 — baixa complexidade)

Recursos a serem implementados após este backup:
1. **Filtro por % conclusão** (range numérico min/max) — ~30 linhas
2. **Filtro por responsável** (campo de texto substring) — ~30 linhas
3. **Ajuste de largura por coluna** (input numérico ao lado de cada checkbox de coluna) — ~40 linhas

Todas as 3 entram no modal de Visualização, na seção Filtros (1 e 2) e Colunas (3). Persistência em `gantt-view-prefs-v1`.

## Restauração

Para reverter ao estado deste backup, copie qualquer arquivo desta pasta de volta para a raiz do projeto. A aplicação detectará o `localStorage` existente e usará a versão dos dados que estiver na chave `gantt-data-v2`.
