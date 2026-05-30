# Gantt Chart Interativo — Manual de Uso

**Versão v4 · Maio 2026**
Arquivo único HTML, sem instalação, sem dependências locais.

---

## Arquivos desta pasta

| Arquivo | Função |
|---|---|
| `gantt-v4.html` | Aplicação completa — versão ativa com todas as features |
| `gantt-v3.html` | Versão estável anterior (referência) |
| `gantt-template-pt.xlsx` | Modelo Excel para importação — Português |
| `gantt-template-es.xlsx` | Modelo Excel para importação — Español |
| `gantt-template-en.xlsx` | Modelo Excel para importação — English |
| `README.md` | Este manual |
| `PLANO_DE_TESTES.md` | Checklist de validação funcional |
| `CONTEXTO_SESSAO.md` | Contexto técnico de desenvolvimento |

---

## Como abrir

Abra `gantt-v4.html` diretamente no Chrome, Edge ou Firefox.
Nenhuma instalação, servidor web ou conexão com internet é necessária
(exceto import/export Excel, que carrega SheetJS via CDN).

---

## Interface — visão geral

```
┌─ Toolbar ──────────────────────────────────────────────────────────────┐
│ Zoom | Expandir/Colapsar | A▾ | 🎨 | Busca | Idioma | Gerenciar Dados │
└────────────────────────────────────────────────────────────────────────┘
┌─ Painel lateral ───────────────┬─ Timeline Gantt ─────────────────────┐
│ ID | WBS | Tarefa | Início ... │  Barras, dependências, hoje, markers │
│ (scrollável H e V)             │  (scrollável H e V, pan com drag)    │
└────────────────────────────────┴──────────────────────────────────────┘
```

O divisor entre painel e timeline é arrastável.

---

## Painel lateral — colunas disponíveis

| Coluna | Descrição | Default |
|---|---|---|
| **ID** | Identificador único estável (mono, 50px) | Visível |
| **WBS** | Código posicional computado (ex: 1.1.2) — somente leitura | Visível |
| **Tarefa** | Nome da tarefa ou fase | Visível |
| **Início** | Data de início | Visível |
| **Fim** | Data de término | Visível |
| **Dias** | Duração em dias | Visível |
| **Status** | Badge colorido de prioridade | Visível |
| **Progresso** | Barra visual + % | Visível |
| **Dependências** | IDs das tarefas predecessoras | Visível |

Colunas podem ser ocultadas/exibidas e redimensionadas via **View Manager** (botão 👁 na toolbar).

---

## Modelo de dados — todos os campos

Cada tarefa/item é um objeto com os seguintes campos:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | ✅ | Identificador único (ex: `"1"`, `"DEV"`) |
| `parent_id` | string | ✅ | ID do pai na hierarquia; `""` para raiz |
| `task` | string | ✅ | Nome da tarefa ou fase |
| `start` | string | ✅ | Data de início `YYYY-MM-DD` |
| `end` | string | ✅ | Data de término `YYYY-MM-DD` |
| `milestone` | boolean | — | `true` = marco (exibe como diamante/triângulo) |
| `completion` | number | — | Percentual concluído, 0–100 |
| `dependencies` | string | — | IDs predecessores separados por vírgula |
| `assignee` | string | — | Nome do responsável |
| `status` | string | — | Prioridade: `"Very High"`, `"High"`, `"Medium"`, `"Low"` ou `""` |
| `phase` | string | — | Campo legado (ignorado em dados com `parent_id`) |
| `marker` | string | — | Linha vertical especial: `"go-live"` ou `"decision"` |
| `baseline_start` | string | — | Data de início do plano original `YYYY-MM-DD` |
| `baseline_end` | string | — | Data de término do plano original `YYYY-MM-DD` |

---

## Campo `status` — prioridade / criticidade

Controla a **cor das barras de tarefa** na timeline (via Color Theme).

| Valor | Cor (tema padrão) | Uso sugerido |
|---|---|---|
| `"Very High"` | Vermelho | Itens críticos de caminho, go-lives, riscos altos |
| `"High"` | Laranja | Entregas importantes, desvios significativos |
| `"Medium"` | Amarelo | Execução padrão do projeto |
| `"Low"` | Verde | Tarefas de suporte, preparação |
| `""` (vazio) | Cor primária do tema | Sem classificação |

**Como editar:** modal **Gerenciar Dados** → coluna `status` → selecionar valor no dropdown.

---

## Campo `marker` — linhas verticais de evento

O campo `marker` adiciona uma **linha vertical destacada** na timeline sobre a data de início da tarefa, com o nome rotacionado ao longo da linha. Ideal para marcar eventos críticos como go-lives e gates de decisão.

### Valores disponíveis

| Valor | Linha | Forma do marco | Uso |
|---|---|---|---|
| `"go-live"` | Azul sólida | Triângulo azul ▲ | Entrada em produção, ativação de sistema |
| `"decision"` | Vermelha tracejada | Losango vermelho ◆ maior | Gate de aprovação, Go/No Go, checkpoint |
| `""` *(padrão)* | Nenhuma | Diamante cinza padrão | Comportamento normal |

### Como o texto aparece na linha

O texto exibido verticalmente é o **nome da tarefa** (`task`), truncado automaticamente em 22 caracteres. Por isso é recomendável usar nomes curtos e diretos para tarefas com marker.

```
"Go Live – Brazil"              →  exibe: "Go Live – Brazil"
"Go/No Go – Chile + Argentina"  →  exibe: "Go/No Go – Chile + Arg…"
```

### Como adicionar um marker

**Via editor (Gerenciar Dados):**
1. Abrir **Gerenciar Dados** na toolbar
2. Localizar a linha da tarefa desejada
3. No campo `marker`, digitar `go-live` ou `decision`
4. Clicar **Aplicar**

**Via CSV/Excel:**
Adicionar coluna `marker` no arquivo e preencher com `go-live` ou `decision`.

**Via JSON (Copiar/colar):**
```json
{ "id": "42", "task": "Go Live – Módulo X",
  "start": "2026-09-01", "end": "2026-09-01",
  "milestone": true, "marker": "go-live", ... }
```

**Importante:** o marker pode ser aplicado a qualquer tarefa, não apenas marcos (`milestone: true`). Porém visualmente faz mais sentido em eventos pontuais (datas únicas).

---

## Campo `baseline_start` / `baseline_end` — rastreamento de desvio

Permite comparar o **plano original** com a execução atual. Quando preenchidos, o Gantt exibe:

- **Barra cinza translúcida** por baixo da barra colorida atual — representa o plano original
- **Badge âmbar `+Nw`** no canto superior direito da barra — indica o desvio em semanas
- **Tooltip** — mostra o período baseline e o desvio calculado ao passar o mouse

### Como funciona visualmente

```
Plano original (baseline):  [====cinza====]
Execução atual:                      [====azul/colorida====]
Badge:                                                    +3w
```

### Regras de cálculo

- O desvio é calculado como: `(end atual) − (baseline_end)` em semanas
- O badge só aparece quando o desvio é **positivo** (atraso)
- Se o projeto adiantou, nenhum badge é exibido
- `baseline_start` é opcional — se omitido, usa o mesmo valor de `start`

### Como adicionar baseline

**Via editor (Gerenciar Dados):**
1. Abrir **Gerenciar Dados**
2. Preencher `baseline_start` e `baseline_end` com as datas originais do plano
3. Clicar **Aplicar**

**Via CSV/Excel:**
Adicionar colunas `baseline_start` e `baseline_end` no arquivo.

**Exemplo:**
```json
{ "id": "14", "task": "E2E",
  "start": "2026-06-29", "end": "2026-08-14",
  "baseline_start": "2026-06-29", "baseline_end": "2026-07-17" }
```
→ Exibe badge **+4w** (4 semanas de atraso)

---

## Swimlanes — cores por workstream

Cada linha da timeline recebe automaticamente a cor do seu **workstream** (pai de nível 1 na hierarquia). Isso cria faixas visuais que facilitam a leitura do cronograma.

### Onde a cor aparece

| Elemento | Visual |
|---|---|
| Faixa de fundo de cada linha (timeline) | Tint suave da cor do workstream |
| Borda esquerda 4px (painel lateral) | Cor sólida do workstream |
| Borda esquerda 4px (timeline) | Cor sólida do workstream |
| Barra de fase/summary | Cor sólida do workstream |

As cores são atribuídas **automaticamente por posição** na hierarquia — o 1º workstream recebe a 1ª cor da paleta, o 2º a 2ª, e assim por diante.

### Paleta Workstreams

Controlada na seção **"Paleta Workstreams"** dentro do botão 🎨 (Tema). Três presets disponíveis:

| Paleta | Cores | Uso sugerido |
|---|---|---|
| **Colorido** | Azul, Violeta, Ciano, Verde, Âmbar, Vermelho, Rosa, Laranja, Índigo, Teal | Apresentações, roadmaps vibrantes |
| **Pastel** | Versões suaves das mesmas cores | Ambientes sóbrios, fundo claro |
| **Neutro** | Tons de cinza | Documentos formais, impressão |

A paleta selecionada é salva automaticamente entre sessões.

---

## Cores — dois sistemas independentes

O botão 🎨 controla **dois sistemas de cor separados** que podem ser combinados livremente:

### 1. Color Theme

Controla a cor das **barras de tarefa** (via campo `status`) e elementos de interface.

| Variável | Onde aparece |
|---|---|
| Very High | Barra de tarefas com status Very High |
| High | Barra de tarefas com status High |
| Medium | Barra de tarefas com status Medium |
| Low | Barra de tarefas com status Low |
| Fase | Cor de referência para barras de fase |
| Primária | Botões, links, destaques de UI |

Temas pré-definidos: **Padrão, Vibrante, Pastel, Oceano, Floresta, Mono Cinza**.
É possível personalizar as 6 cores e salvar como tema próprio (botão **💾 Salvar como...**).

### 2. Paleta Workstreams

Controla as **faixas de fundo e bordas laterais** de cada workstream.
Independente do tema — você pode combinar qualquer tema com qualquer paleta.

### Combinações sugeridas

| Color Theme | Paleta Workstreams | Resultado |
|---|---|---|
| Padrão | Colorido | Padrão vibrante (ideal para apresentações) |
| Mono Cinza | Neutro | Minimalista, preto e branco |
| Oceano | Pastel | Tons frios e suaves |
| Floresta | Colorido | Interface verde, workstreams coloridos |

---

## WBS — código posicional

- Calculado automaticamente a cada renderização (não armazenado nos dados).
- Recalculado ao reordenar tarefas ou alterar a hierarquia.
- Exibido no painel lateral, no tooltip da barra e no editor (somente leitura).
- Incluído nos exports CSV e Excel.
- Exemplos: `1`, `1.1`, `1.1.1`, `1.2`, `2`, `2.1`.

---

## Hierarquia (até N níveis)

- Cada tarefa pode ter um `parent_id` apontando para outra tarefa.
- Nós com filhos são **summary** (fase): dados agregados, clicáveis para colapsar/expandir.
- Nós sem filhos são **folhas** (tarefas e marcos).
- Botões **Expandir tudo / Colapsar tudo** na toolbar para controle global.

---

## Reordenar linhas — Drag & Drop

É possível reordenar qualquer linha diretamente na **view principal** do Gantt, sem abrir o modal Gerenciar Dados.

### Como usar

1. Passe o mouse sobre a linha desejada — aparece o ícone **⠿** à esquerda da linha.
2. Clique e segure o **⠿** (drag handle).
3. Arraste para cima ou para baixo — uma **linha azul** indica onde a linha será inserida.
4. Solte. A linha é reposicionada e o WBS se recalcula automaticamente.

### Comportamentos

| Ação | Resultado |
|---|---|
| Arrastar tarefa para dentro do mesmo pai | Reordena entre irmãos |
| Arrastar tarefa para outro pai (outra fase) | Move a tarefa para o novo pai (reparenting automático) |
| Arrastar tarefa e soltar sobre uma fase | A tarefa vira filho direto da fase |
| Arrastar uma fase (linha summary) | Move a fase **com todos os seus filhos** juntos |
| Tentar mover uma fase para dentro de um descendente seu | Bloqueado com mensagem de erro |

A nova posição é **salva automaticamente** no localStorage após o drop.

### Por que o ID não muda ao reordenar?

O campo `id` é uma **chave primária estável** — ele não muda quando uma tarefa é movida ou reordenada. Isso é intencional e necessário por três razões:

1. **Referências cruzadas:** o `id` é referenciado em `parent_id` (hierarquia) e no campo `dependencies` de outras tarefas. Alterar o `id` exigiria reescrever em cascata todos esses vínculos, com risco de quebrar dependências silenciosamente.
2. **O WBS já faz o papel visual:** o código WBS (`1.1`, `1.2.1`, etc.) é recalculado automaticamente a cada reordenação e reflete a posição hierárquica atualizada. É o WBS que o usuário lê para entender onde a tarefa está, não o ID.
3. **Estabilidade para export/import:** IDs estáveis permitem que dados exportados (CSV/Excel) possam ser reimportados ou cruzados com referências externas sem perda de rastreabilidade.

**Resumo:** o `id` é a chave interna; o `WBS` é o número de posição. Apenas o WBS muda ao reordenar.

---

## Zoom da timeline

| Modo | Pixels/dia | Ideal para |
|---|---|---|
| **Dias** | 32 | Detalhe operacional, 1–4 semanas |
| **Semanas** | 14 | Tático, 1–6 meses |
| **Meses** | 4 | Portfólio, 6–24 meses |
| **Anos** | 0.6 | Roadmap multi-ano |
| **Tudo** | mín. 6, dinâmico | Fit ao container |

**Modo "Tudo":** cronogramas com mais de ~3 meses ativam a barra de rolagem horizontal.

---

## Filtros

Acessados via **View Manager → Filtros**:

| Filtro | Efeito |
|---|---|
| Ocultar marcos | Esconde tarefas com `milestone: true` |
| Ocultar 100% concluídos | Esconde tarefas completas |
| Ocultar fins de semana | Remove colunas de sáb/dom da timeline |
| Ocultar % nas barras | Remove label de % sobre as barras |
| Status (multi-select) | Exibe apenas os status selecionados |
| Faixa de % | Intervalo mín/máx de conclusão |
| Responsável | Filtro por substring (case-insensitive) |
| Janela de datas | Exibe apenas tarefas que interceptam o período |

---

## Busca

Campo na toolbar. Destaca linhas com o texto buscado (fundo amarelo pulsante + borda laranja na barra). Limpa ao apagar o campo.

---

## Gerenciar Dados (modal)

Aberto pelo botão **Gerenciar Dados** na toolbar.

### Editor inline

- Drag & drop de linhas para reordenar (dentro do modal).
- **Indent (⇥)** / **Outdent (⇤)**: altera o `parent_id`.
- **Desfazer**: histórico de até 50 estados.
- **Duplicar** / **Excluir** por linha.
- **Aplicar**: aplica ao gráfico e salva no `localStorage`.

> **Dica:** para reordenar tarefas sem abrir este modal, use o **drag handle ⠿** diretamente na view principal do Gantt. Ver seção [Reordenar linhas](#reordenar-linhas--drag--drop).

### Import CSV/Excel

1. Clique em **Importar CSV/Excel**.
2. Selecione o arquivo (`.csv` ou `.xlsx`).
3. Revise o preview e os erros de validação.
4. Escolha **Substituir** ou **Adicionar**.
5. Clique **Confirmar**.

Cabeçalhos aceitos nos 3 idiomas (case-insensitive):

| Campo | PT | ES | EN |
|---|---|---|---|
| `task` | tarefa | tarea | task |
| `start` | início | inicio | start |
| `end` | fim | fin | end |
| `milestone` | marco | hito | milestone |
| `completion` | conclusão / % | progreso / % | completion / % |
| `dependencies` | dependências | dependencias | dependencies |
| `assignee` | responsável | responsable | assignee |
| `status` | status / prioridade | estado / prioridad | status / priority |
| `marker` | marker | marker | marker |
| `baseline_start` | baseline_start | baseline_start | baseline_start |
| `baseline_end` | baseline_end | baseline_end | baseline_end |

### Export

| Botão | Saída |
|---|---|
| **CSV** | `gantt-data.csv` com coluna WBS incluída |
| **Excel** | `gantt-data.xlsx` com coluna WBS incluída |
| **PNG** | `gantt-chart.png` — imagem completa (painel + timeline) |
| **Copiar JSON** | JSON dos dados para clipboard |
| **Salvar** | Força gravação no `localStorage` |

---

## Persistência

Dados, configurações de coluna, tema, paleta de workstreams, idioma e visualizações salvas ficam no `localStorage` sob a chave `gantt-data-v3`.

**Atenção:** limpar dados do navegador apaga o projeto. Use Export CSV/Excel para backup regular.

---

## Idiomas

Seletor no canto direito da toolbar: **PT-BR / ES / EN**.
Traduz botões, modais, tooltips, headers da timeline, toasts e mensagens de erro.
A preferência é salva no `localStorage`.

---

## Dependências técnicas

- **Zero dependências locais.** Funciona 100% offline exceto para import/export `.xlsx`.
- **SheetJS**: carregado via CDN (`cdn.sheetjs.com`) apenas ao usar import/export Excel.
- Compatível com Chrome 90+, Edge 90+, Firefox 88+.
