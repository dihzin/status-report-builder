# Backup v5 — 2026-05-18

Snapshot estável capturado APÓS implementação dos 2 recursos Tier 3 de média complexidade.

## Diferenças vs. v4-2026-05-18

### Novidades no gantt-v3.html

**Modal de Visualização ganhou 1 nova seção em Filtros:**
- **Janela de datas** — dois date pickers (De / Até). Folha passa se interval [start,end] tem sobreposição parcial com a janela. Resumos aparecem se ao menos 1 descendente passa.

**Toolbar ganhou 1 novo campo:**
- **🔍 Buscar** — input de busca entre Idioma e Visualização. Destaca (não filtra) tarefas correspondentes com fundo amarelo pulsante + borda laranja nas barras. ESC limpa.

**Persistência expandida:**
- `state.filters.dateStart/dateEnd` em `gantt-view-prefs-v1`
- Janela de datas incluída em saved views
- Busca NÃO persiste (estado transitório por design)

### CSS adicionado
- `.search-input` no toolbar
- `@keyframes search-pulse` para animação amarela
- `.row.search-match` e `.bar-task.search-match`

### NÃO implementado (decisão consciente)
- Reordenar colunas por drag-and-drop — análise prós/contras indicou baixo retorno por valor

## Próxima onda

Após este backup:
1. **Coluna Dependências no painel lateral** — mostrar IDs predecessores, ocultável via View Manager. ~20 linhas. Reusa infraestrutura de colunas existente.

Depois disso: discussão sobre adição de coluna WBS (ID hierárquico).

## Restauração

Copiar arquivos desta pasta de volta para a raiz. Para limpar localStorage também, usar URL `?reset=1`.
