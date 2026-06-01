# Relatório de Atualizações — PMAR RAID Log

Esta versão incorpora as informações da planilha `docs/PMAR.45_RAID_Log.xlsm` ao modelo oficial `status_projeto.xlsx`, mantendo o fluxo existente de geração de HTML/PDF.

## O que foi atualizado no Excel

### `CONFIG`
- Projeto atualizado para `HORSE Procurement Implementation Program (SAP Ariba Full Suite)`.
- Sponsor incorporado em `project_subtitle` e no novo campo `sponsor`.
- Owner atualizado para `A definir (Project Manager Stratesys)`.
- Datas recalculadas com base no período `11/05/2026` a `07/08/2026`.
- Fonte PMAR registrada em `pmar_source`.
- Data/hora da importação registrada em `last_pmar_import`.

### `KPIS`
- Data do relatório atualizada.
- Prazo atualizado para `Dia 16 de 88`.
- Risco atual atualizado para `3 abertos / 1 crítico`.
- Saúde geral atualizada para `Atenção`.
- Progresso foi mantido do modelo atual, pois a PMAR não contém avanço físico confiável.

### `PENDENCIAS_CRITICAS`
- Incluídos os 3 riscos em aberto da PMAR:
  - `R001` — Prazo sem buffer.
  - `R002` — UAT do S/4HANA não concluído antes do início Ariba.
  - `R005` — Tempo de resposta acima de 2 dias úteis.
- Preservadas colunas extras: `id_origem`, `categoria`, `score`, `probabilidade`, `impacto`, `estrategia` e `comentarios`.

### `PROXIMAS_ACOES`
- Adicionadas as respostas aos riscos em aberto:
  - `R001`: Daily + Status semanal + Change Request formal.
  - `R002`: Decisão conjunta até 15/05 + plano B definido juntos.
  - `R005`: Escalação automática ao Steering Committee.

### `RESUMO_EXECUTIVO`
- Adicionado resumo consolidado dos riscos abertos e resolvidos.

### Abas novas
- `RAID_RISCOS`: preserva os 5 riscos reais da PMAR.
- `RAID_ACOES`: preparada para ações reais preenchidas.
- `RAID_ISSUES`: preparada para issues reais preenchidas.
- `RAID_DECISOES`: preparada para decisões reais preenchidas.
- `EQUIPE`: preserva a equipe listada na PMAR.
- `HISTORICO_IMPORTACAO`: registra o resumo da importação.

## O que mudou no código

### `backend/import_pmar_raid.py`
Novo importador para consolidar a PMAR no `status_projeto.xlsx`.

Comando padrão:

```bash
python -m backend.import_pmar_raid
```

Comando com caminhos personalizados:

```bash
python -m backend.import_pmar_raid --pmar docs/PMAR.45_RAID_Log.xlsm --status status_projeto.xlsx
```

### `backend/excel_reader.py`
- Agora lê as abas opcionais RAID e disponibiliza esses dados via `/api/status`.
- Template criado automaticamente já vem preparado para campos PMAR/RAID.

### `backend/schema_validator.py`
- Continua validando o modelo obrigatório atual.
- Passou a validar as abas opcionais RAID quando existirem.

### `frontend/app.js` e `frontend/styles.css`
- A seção de pendências críticas agora exibe metadados dos riscos importados, como ID, score, categoria e estratégia.

## Validações executadas

- `validate_schema(status_projeto.xlsx)` retornou sem erros.
- `read_excel(status_projeto.xlsx)` retornou dados corretamente.
- `node --check frontend/app.js` executou sem erros de sintaxe.
- Busca por erros de planilha (`#REF!`, `#N/A`, `#VALUE!`, etc.) no `status_projeto.xlsx` não encontrou ocorrências.

## Atualização de Governança (Fase 4.1)

- Fase 4.1 aprovada.
- Auditoria consolidada: **PASS COM RESSALVAS**.
- Ressalvas classificadas como baixas e concentradas em documentação/curadoria de artefatos.
- Projeto liberado para iniciar a Fase 5 — Builder Visual V1.
- Estado operacional oficial: SQLite + `reportData` como fonte principal; Excel apenas legado/importador opcional.
