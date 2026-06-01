# README Portable - Status Report Builder

## Execução

1. Extraia `StatusReportBuilder_Portable.zip`.
2. Abra `StatusReportBuilder.exe`.
3. O app inicia localmente e abre no navegador padrão.

## Estrutura local

- `data/status_report.db`: banco SQLite persistente.
- `exports/pdf` e `exports/pptx`: arquivos exportados.
- `logs/launcher.log`: logs do launcher portable.
- `config/settings.json`: configuração local (`host`, `preferred_port`, `open_browser`).

## Backup

Para backup dos dados, copie a pasta `data/`.

## Atualização sem perder dados

1. Feche o app.
2. Substitua os arquivos da aplicação.
3. Preserve as pastas `data/`, `exports/` e `config/`.

## Limitações conhecidas

- O Windows SmartScreen/antivírus pode alertar executáveis não assinados.
- Aplicação local (sem servidor externo).
- Esta versão abre no navegador padrão (não usa WebView).
- Excel continua legado/importador opcional; SQLite é a fonte principal.
