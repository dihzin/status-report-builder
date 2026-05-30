# Backup v4 — 2026-05-18

Snapshot estável capturado APÓS implementação dos 3 recursos Tier 3 de baixa complexidade.

## Diferenças vs. v3-2026-05-18

### Novidades no gantt-v3.html (versão de trabalho)

**Modal de Visualização ganhou 3 controles:**

1. **Ajuste de largura por coluna** — input numérico (40–500 px) ao lado de cada checkbox na seção Colunas. Aplicação em tempo real.
2. **Filtro por % conclusão (intervalo)** — dois inputs numéricos Min/Max na seção Filtros. Auto-corrige se min > max. Não afeta marcos (que não têm noção de % feito).
3. **Filtro por responsável** — campo de texto livre na seção Filtros. Match case-insensitive como substring. Dispara a cada tecla (oninput).

**Persistência expandida:**
- `state.columnWidths` é serializado em `gantt-view-prefs-v1`
- `state.filters.completionMin/Max` e `state.filters.assignee` também
- Tudo é capturado quando o usuário salva uma Visualização nomeada
- Botões "Resetar" (Colunas) e "↺ Resetar tudo" limpam também os novos campos

### Estrutura de chaves localStorage (estado atual)

| Chave | Conteúdo |
|---|---|
| `gantt-data-v2` | Array de tasks com `parent_id` (estratégia B) |
| `gantt-lang` | Idioma ativo (pt-BR/es/en) |
| `gantt-theme` + `gantt-theme-custom` | Tema atual |
| `gantt-user-themes` | Temas customizados nomeados |
| `gantt-bar-labels` | Toggle labels nas barras |
| `gantt-view-prefs-v1` | Colunas visíveis + larguras + filtros + densidade |
| `gantt-saved-views-v1` | Visualizações nomeadas (Executivo, Operacional, etc.) |

## Arquivos

| Arquivo | Estado neste backup |
|---|---|
| gantt-v3.html | **Versão de trabalho atual** — inclui as 3 features de baixa complexidade |
| gantt-v2.html | Versão pré-baixa-complexidade (cópia do backup v3) |
| gantt.html | Versão original (legado) |
| gantt-template-pt.xlsx / -es / -en | Templates Excel inalterados desde v3 |
| _build_template.py | Gerador dos Excel inalterado |
| README.md | Documentação inalterada |

## Próxima onda (Tier 3 — média complexidade)

A serem implementados após este backup:
1. **Filtro por janela de datas** — 2 date pickers, leaf passa se task intervalo intercepta janela. ~60 linhas. Decisão: overlap parcial conta.
2. **Busca destacada** — campo de busca no toolbar, destaca linhas correspondentes (animação CSS), ESC para limpar. ~80 linhas.

NÃO incluído nesta onda (decisão consciente): reordenar colunas por drag-and-drop — baixo retorno por valor segundo análise prós/contras.

## Restauração

Para reverter ao estado deste backup, copie os arquivos desta pasta de volta para a raiz do projeto. Se quiser limpar também o `localStorage`, abra o app com `?reset=1` na URL.
