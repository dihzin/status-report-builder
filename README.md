# OnePage Status Project

Gera um OnePage executivo de status de projeto com persistência principal em SQLite e contrato canônico `reportData`.

## Requisitos

- Python 3.10+
- Navegador Chromium (instalado automaticamente na primeira execução)

## Como usar

### 1. Instalar dependências

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

Ou execute `start.bat` que faz tudo automaticamente.

### 2. Iniciar

```bash
start.bat
```

Ou manualmente:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Acesse: http://127.0.0.1:8000

### 3. Editar os dados

Edite os dados pela interface (modo edição) e salve. As APIs persistem snapshots no SQLite e o OnePage reflete o `reportData` salvo.

## Abas do Excel (legado/importação opcional)

| Aba | Descrição |
|-----|-----------|
| `CONFIG` | Configurações gerais (nome projeto, fases, datas) |
| `FASES` | Timeline horizontal de fases do projeto |
| `KPIS` | Indicadores-chave (6 cards superiores) |
| `RESUMO_EXECUTIVO` | Lista de itens concluídos/em andamento |
| `PENDENCIAS_CRITICAS` | Tabela de pendências com prioridade |
| `PROXIMAS_ACOES` | Lista numerada de próximas ações |
| `CURVA_S` | Pontos da curva S (dia, planejado, realizado) |
| `MARCOS` | Cards de marcos importantes |
| `RODAPE` | Informações do rodapé executivo |


## Importar dados PMAR RAID Log

Esta versão já vem com o arquivo `docs/PMAR.45_RAID_Log.xlsm` incorporado ao `status_projeto.xlsx`.

Para reimportar a PMAR depois de receber uma nova versão do RAID Log:

```bash
python -m backend.import_pmar_raid
```

Ou informe caminhos específicos:

```bash
python -m backend.import_pmar_raid --pmar docs/PMAR.45_RAID_Log.xlsm --status status_projeto.xlsx
```

A importação aplica as seguintes regras:

- `Config` da PMAR atualiza `CONFIG` e `RODAPE`.
- `Risks` gera `PENDENCIAS_CRITICAS`, `PROXIMAS_ACOES`, `RESUMO_EXECUTIVO`, `KPIS` e a aba completa `RAID_RISCOS`.
- `Actions`, `Issues` e `Decisions` são importadas somente quando há descrição/decisão preenchida, evitando linhas de template e fórmulas vazias.
- Campos extras como `ID`, `CATEGORY`, `PROBABILITY`, `IMPACT`, `RISK SCORE`, `STRATEGY` e `COMMENTS` são preservados nas abas RAID opcionais e também em colunas extras de `PENDENCIAS_CRITICAS`.

### Abas adicionais desta versão

| Aba | Descrição |
|-----|-----------|
| `RAID_RISCOS` | Espelho completo dos riscos reais da PMAR |
| `RAID_ACOES` | Ações reais preenchidas na PMAR |
| `RAID_ISSUES` | Issues reais preenchidas na PMAR |
| `RAID_DECISOES` | Decisões reais preenchidas na PMAR |
| `EQUIPE` | Time listado na aba `Config` da PMAR |
| `HISTORICO_IMPORTACAO` | Resumo da última importação executada |

## Exportar PDF

Clique em **Exportar PDF** no menu superior, ou chame:

```bash
curl -X POST http://127.0.0.1:8000/api/export/pdf -o status_report.pdf
```

O arquivo será salvo em `exports/pdf/`.

## Exportar PPTX

Clique em **Exportar PPTX** no menu superior. O arquivo será salvo em `exports/pptx/`.

## Estrutura

```
onepage-status-project/
├── status_projeto.xlsx     # Entrada legada opcional para seed/import
├── start.bat               # Inicialização
├── requirements.txt
├── backend/
│   ├── main.py             # FastAPI + WebSocket
│   ├── excel_reader.py     # Leitura do Excel
│   ├── import_pmar_raid.py # Importação do RAID Log PMAR
│   ├── schema_validator.py # Validação de schema
│   ├── watcher.py          # Monitoramento watchdog
│   └── exporter.py         # PDF e PPTX
├── frontend/
│   ├── index.html          # OnePage renderizado
│   ├── styles.css          # Estilos premium
│   ├── app.js              # Lógica frontend
│   └── assets/
│       ├── logo.svg        # Logo placeholder
│       └── icons/          # Ícones adicionais
└── exports/
    ├── pdf/                # PDFs gerados
    └── pptx/               # PPTXs gerados
```

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/api/status` | Retorna o snapshot atual salvo no SQLite (`reportData` + `data` legado) |
| POST | `/api/save` | Salva snapshot no SQLite (fonte oficial) |
| WS | `/ws/status` | WebSocket para atualizações automáticas |
| POST | `/api/export/pdf` | Exporta OnePage como PDF (landscape) |
| POST | `/api/export/pptx` | Exporta OnePage como PPTX |

## Limitações conhecidas

- Exportação PDF/PPTX requer Playwright com Chromium instalado.
- Se o Excel estiver aberto no Microsoft Excel, a leitura pode falhar (cache mantém último dado válido).
- Não há autenticação — uso local recomendado.
- Curva S usa SVG simples sem interatividade.

## Changelog

### Fase 4.1 (Aprovada)

- Hotfix defensivo de migração SQLite para snapshots legados com duplicidade de `version_number` por `project_key`, executado antes da criação do índice único.
- Mantidos os índices `uq_report_snapshots_project_version` e `uq_report_snapshots_single_current`.
- `VALIDATE_EXCEL_SCHEMA=false` por padrão para evitar dependência operacional do Excel em `/api/status`.
- Auditoria técnica: PASS.
- Testes executados:
  - `python -m pytest -q tests/test_phase4_sqlite_hardening.py`
  - `python -m pytest -q tests/test_excel_reader.py tests/test_schema_validator.py`
  - `python -m pytest -q tests/test_import_pmar.py`

## Fonte de dados oficial (Fase 4+)

- A fonte principal de dados do app e das APIs (`/api/status`, `/api/save`) é o SQLite com `reportData` canônico.
- O Excel (`status_projeto.xlsx`) permanece apenas como legado/importação opcional e não é a fonte operacional principal.
- A edição oficial ocorre pela interface/API, persistindo snapshots no SQLite.
- Exportações PDF/PPTX são geradas a partir do `reportData` salvo no SQLite.
- `WATCH_EXCEL=false` por padrão (watcher desligado por padrão; só inicia se habilitado e Excel existir).
- `VALIDATE_EXCEL_SCHEMA=false` por padrão (sem dependência operacional de schema Excel para `/api/status`).
