# Builder Roadmap (Post V1)

## Status atual

- Builder V1 aprovado com SQLite/reportData como fonte principal.
- Excel permanece apenas como legado/importador opcional.

## Warnings conhecidos do legado Excel

- Durante leitura de planilhas legadas, `openpyxl` pode emitir warning de `Data Validation extension is not supported and will be removed`.
- Este warning é limitação conhecida de parsing e nao afeta o funcionamento do Builder V1 (tela/save/export em SQLite/reportData).

## Visao futura (sem implementacao nesta fase)

- Evoluir de Status Report Builder para um Document/Executive Report Studio.
- Tratar Status Report como primeiro template, evitando acoplamento excessivo.

### Templates futuros

- Status Report
- Steering Committee
- Project Charter
- Executive Briefing
- Business Case
- Plano de Acao
- RAID executivo

### Element Library futura

- Graficos
- Icones
- Botoes/CTAs
- Cards
- Tabelas
- Timelines
- Matriz de risco
- Blocos executivos reutilizaveis

### Diretriz arquitetural futura

- Nomes alvo para expansao gradual: `documentTemplate`, `documentData`, `sectionRegistry`, `blockRegistry`, `fieldRegistry`, `elementRegistry`, `exportProfile`.

