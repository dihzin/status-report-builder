# Gantt Chart Interativo

Gráfico de Gantt em HTML puro (single-file, sem frameworks), inspirado no trabalho de [David Bacci](https://github.com/PBI-David/Deneb-Showcase/tree/main/Gantt%20Chart).

## Arquivos

| Arquivo | Função |
|---|---|
| `gantt.html` | Aplicação completa. Abre em qualquer navegador moderno. |
| `gantt-template-pt.xlsx` | Modelo Excel — português |
| `gantt-template-es.xlsx` | Modelo Excel — español |
| `gantt-template-en.xlsx` | Modelo Excel — english |
| `_build_template.py` | Script que gera os 3 .xlsx (rode se quiser regenerar) |

## Idiomas

A interface tem seletor PT-BR / ES / EN no canto superior direito. A escolha é salva no `localStorage`.
Tudo é traduzido: botões, modais, tooltips, headers da timeline (meses/dias da semana), validação, toasts e mensagens.

O importador aceita cabeçalhos nos 3 idiomas (case-insensitive, ignora acentos):
- **phase** = phase / fase
- **task** = task / tarefa / tarea
- **milestone** = milestone / marco / hito
- **start** = start / início / inicio / comienzo
- **end** = end / fim / fin / término
- **completion** = completion / conclusão / progreso / progresso / %
- **dependencies** = dependencies / dependências / dependencias
- **assignee** = assignee / responsável / responsable
- **status** = status / estado / prioridade / prioridad / priority

## Zoom

| Visão | Quando usar | Pixels/dia |
|---|---|---|
| **Dias** | Detalhe operacional, 1-4 semanas | 32 |
| **Semanas** (novo) | Cronograma tático, 1-6 meses, eixo com nº de semana ISO | 14 |
| **Meses** | Visão de portfólio, 6-24 meses | 4 |
| **Anos** | Roadmap multi-ano | 0.6 |
| **Tudo** | Autoscale ao container (fit) | dinâmico |

Na visão Semanas, o cabeçalho mostra `S40`, `S41`... (PT/ES) ou `W40`, `W41`... (EN) — número ISO 8601 (segunda-feira como primeiro dia).

## Estrutura do Excel (4 abas)

1. **Dados** / Datos / Data — tabela com 10 colunas, 20 linhas de exemplo, validações ativas
2. **Instruções** / Instrucciones / Instructions — descrição de cada coluna + 10 regras gerais
3. **Glossário Status** — referência visual das 5 prioridades
4. **% Completion** — lógica detalhada do campo (6 seções: renderização, marcos, agregação de fases, rubrica, pegadinhas, resumo)

## Recursos do app

- Zoom Dias/Semanas/Meses/Anos/Tudo (autoscale ao redimensionar)
- Pan na timeline (arrastar)
- Fases colapsáveis individualmente + botões expandir/colapsar tudo
- Dependências como setas (hover destaca a cadeia)
- Linha de "hoje" tracejada
- Splitter ajustável entre painel e timeline
- Edição inline com desfazer, drag & drop de linhas, validação
- Import com preview e validação por linha (cabeçalhos multi-idioma)
- Export CSV, Excel, PNG, JSON
- Persistência em `localStorage`

## Dependências

Zero, exceto **SheetJS** carregado via CDN apenas quando você importa/exporta `.xlsx`. CSV, edição, gráfico e PNG funcionam 100% offline.
