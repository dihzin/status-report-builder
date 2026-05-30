# Plano de Testes — Gantt Chart Interativo

**Versão consolidada · Maio 2026**
Execute os testes abrindo `gantt-v3.html` diretamente no Chrome.

---

## Como usar este plano

- Marque cada item com ✅ (passou), ❌ (falhou) ou ⚠️ (comportamento inesperado).
- Em caso de falha, anote o comportamento observado na coluna **Resultado**.
- Pré-condição padrão: dados de exemplo carregados (estado inicial ou após "Restaurar padrão").

---

## 1. Carregamento inicial

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 1.1 | Abrir `gantt-v3.html` no Chrome | App carrega sem erros no console | |
| 1.2 | Verificar dados de exemplo | Raiz "Projeto Exemplo" + 4 fases + tarefas visíveis | |
| 1.3 | Verificar coluna WBS | Códigos 1, 1.1, 1.1.1... visíveis na 2ª coluna | |
| 1.4 | Verificar tooltip de uma barra | Mostra WBS, fase, período, %, responsável | |

---

## 2. Hierarquia e colapso

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 2.1 | Clicar em uma fase (summary row) | Filhos colapsam; caret gira | |
| 2.2 | Clicar novamente na fase | Filhos expandem | |
| 2.3 | Botão "Colapsar tudo" | Todas as fases colapsam | |
| 2.4 | Botão "Expandir tudo" | Todas as fases expandem | |
| 2.5 | WBS após colapso/expansão | Códigos WBS permanecem corretos | |

---

## 3. Coluna WBS

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 3.1 | Verificar código da raiz | `1` |  |
| 3.2 | Verificar código da 1ª fase | `1.1` | |
| 3.3 | Verificar código da 1ª tarefa da 1ª fase | `1.1.1` | |
| 3.4 | Verificar código da 2ª fase | `1.2` | |
| 3.5 | Abrir Editor → verificar coluna WBS | Coluna WBS visível e somente leitura | |
| 3.6 | Reordenar uma tarefa no editor e Aplicar | WBS recalculado corretamente | |
| 3.7 | Ocultar coluna WBS via View Manager | Coluna desaparece do painel | |
| 3.8 | Exibir coluna WBS novamente | Coluna reaparece com códigos corretos | |

---

## 4. Zoom e scroll da timeline

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 4.1 | Zoom **Dias** | Timeline granular, cada dia visível | |
| 4.2 | Zoom **Semanas** | Cabeçalho com S01, S02... (PT) | |
| 4.3 | Zoom **Meses** | Cabeçalho com Jan, Fev... | |
| 4.4 | Zoom **Anos** | Visão comprimida, múltiplos anos | |
| 4.5 | Zoom **Tudo** — projeto curto (≤3 meses) | Cabe sem scroll horizontal | |
| 4.6 | Zoom **Tudo** — projeto longo (≥6 meses) | Scrollbar horizontal aparece na timeline | |
| 4.7 | Scroll horizontal na timeline | Cabeçalho acompanha o scroll | |
| 4.8 | Pan na timeline (arrastar) | Scroll suave, cursor muda para grab | |
| 4.9 | Scroll vertical na timeline | Painel lateral acompanha verticalmente | |
| 4.10 | Redimensionar janela no modo Tudo | Zoom recalculado automaticamente | |

---

## 5. Scroll horizontal do painel lateral

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 5.1 | Exibir todas as colunas | Scrollbar horizontal aparece no painel | |
| 5.2 | Rolar painel lateralmente | Cabeçalho das colunas acompanha o scroll | |
| 5.3 | Scroll vertical do painel | Timeline acompanha verticalmente | |

---

## 6. View Manager

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 6.1 | Abrir View Manager (👁) | Modal abre com todas as colunas listadas | |
| 6.2 | Ocultar coluna "Dias" | Coluna desaparece do painel | |
| 6.3 | Redimensionar coluna "Tarefa" | Largura atualiza em tempo real | |
| 6.4 | Ativar filtro "Ocultar marcos" | Marcos somem do painel e da timeline | |
| 6.5 | Ativar filtro "Ocultar 100%" | Tarefas 100% concluídas somem | |
| 6.6 | Filtro por Responsável | Apenas tarefas do responsável digitado ficam visíveis | |
| 6.7 | Salvar visualização com nome | Aparece na lista de views salvas | |
| 6.8 | Aplicar visualização salva | Estado da view restaurado corretamente | |
| 6.9 | Excluir visualização salva | Removida da lista | |
| 6.10 | Salvar view sem nome | Toast de erro "Nome inválido" | |
| 6.11 | Resetar tudo | Colunas e filtros voltam ao padrão | |

---

## 7. Busca

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 7.1 | Digitar texto existente no campo busca | Linhas correspondentes ficam amarelas pulsantes | |
| 7.2 | Barra da timeline da linha destacada | Borda laranja na barra | |
| 7.3 | Limpar campo de busca | Destaque some | |
| 7.4 | Busca por texto inexistente | Nenhuma linha destacada | |

---

## 8. Gerenciar Dados — editor

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 8.1 | Abrir modal "Gerenciar Dados" | Tabela com todas as tarefas e coluna WBS readonly | |
| 8.2 | Editar nome de uma tarefa e Aplicar | Tarefa atualizada no gráfico | |
| 8.3 | Adicionar nova tarefa | Linha criada com novo ID; WBS atualizado | |
| 8.4 | Excluir uma tarefa | Tarefa removida; WBS recalculado | |
| 8.5 | Indent (⇥) em uma tarefa | Tarefa passa a ser filha da anterior | |
| 8.6 | Outdent (⇤) em uma tarefa | Tarefa sobe um nível na hierarquia | |
| 8.7 | Drag & drop de linha | Ordem alterada na tabela | |
| 8.8 | Desfazer após edição | Estado anterior restaurado | |
| 8.9 | Cancelar (fechar modal) | Alterações descartadas | |

---

## 9. Import

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 9.1 | Importar `gantt-template-pt.xlsx` | Preview exibe dados, sem erros | |
| 9.2 | Confirmar importação (Substituir) | Dados substituídos no gráfico | |
| 9.3 | Importar CSV com separador `;` | Arquivo parseado corretamente | |
| 9.4 | Importar CSV com cabeçalhos em EN | Colunas reconhecidas corretamente | |
| 9.5 | Importar CSV com linha inválida | Erro listado, linhas válidas importadas | |

---

## 10. Export

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 10.1 | Export **CSV** | Arquivo baixado; contém coluna `wbs` | |
| 10.2 | Export **Excel** | Arquivo `.xlsx` baixado; contém coluna `wbs` | |
| 10.3 | Export **PNG** | Arquivo `gantt-chart.png` baixado; mostra painel + timeline | |
| 10.4 | PNG — painel lateral visível | Colunas ID, WBS, Tarefa, datas legíveis | |
| 10.5 | PNG — timeline visível | Barras, cores de status e linha "hoje" presentes | |
| 10.6 | Export PNG com zoom Dias | PNG mostra timeline no zoom corrente | |
| 10.7 | **Copiar JSON** | Clipboard contém JSON válido dos dados | |
| 10.8 | Botão **Salvar** | Toast "Salvo no navegador" | |
| 10.9 | Reabrir o arquivo | Dados persistidos carregados automaticamente | |

---

## 11. Idiomas

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 11.1 | Mudar para **ES** | Interface traduzida; meses da timeline em espanhol | |
| 11.2 | Mudar para **EN** | Interface traduzida; weeks header mostra W01... | |
| 11.3 | Mudar para **PT-BR** | Interface restaurada | |
| 11.4 | Reabrir arquivo após mudar idioma | Idioma persistido no localStorage | |

---

## 12. Temas

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 12.1 | Aplicar tema "Dark" | Cores de fundo escuras aplicadas | |
| 12.2 | Personalizar cor de fase | Barra de fases atualiza na timeline | |
| 12.3 | Salvar tema customizado | Aparece na lista de temas com badge "U" | |
| 12.4 | Deletar tema customizado | Removido da lista | |
| 12.5 | Reabrir arquivo | Tema persistido carregado | |

---

## 13. Dependências visuais

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 13.1 | Hover sobre uma barra com dependência | Seta de dependência fica azul em destaque | |
| 13.2 | Tarefas sem dependência no hover | Não afetadas (sem destaque extra) | |
| 13.3 | Coluna Dependências no painel | IDs listados; tooltip mostra nome da tarefa predecessora | |

---

## 14. Linha de hoje

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 14.1 | Linha vermelha tracejada na timeline | Posicionada na data de hoje | |
| 14.2 | Zoom Dias — linha hoje visível | Linha presente e alinhada com o dia correto | |

---

## Notas de teste

- Todos os testes devem ser executados em **Chrome 120+** (navegador principal).
- Testes de export PNG devem ser executados com o app aberto em `file://` (não iframe).
- Para testar projetos longos (item 4.6), edite manualmente uma tarefa para ter data de início e fim com 6+ meses de diferença.
