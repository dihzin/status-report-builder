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

## Como receber atualizações

O app verifica atualizações automaticamente ao iniciar. Quando uma nova versão
estiver disponível, um indicador aparece discretamente na barra superior.

**Passo a passo:**

1. Clique no ícone de informações (ⓘ) na barra superior.
2. Clique em **"Verificar atualizações"**.
3. Se houver nova versão, clique **"Baixar atualização"** e aguarde.
4. Após o download e validação do pacote, clique **"Instalar e reiniciar"**.
5. Confirme a instalação na tela de confirmação.
6. O app fecha, instala a atualização e reabre automaticamente.

**Seus dados são preservados:** os arquivos em `data/`, `exports/` e `config/`
não são tocados durante o update. Nenhuma ação manual de backup é necessária.

> A atualização automática funciona apenas na versão portable (`.exe`).
> Em caso de falha, o app mantém a versão anterior automaticamente (rollback).

## Atualização manual sem perder dados

1. Feche o app.
2. Substitua os arquivos da aplicação.
3. Preserve as pastas `data/`, `exports/` e `config/`.

## Limitações conhecidas

- O Windows SmartScreen/antivírus pode alertar executáveis não assinados.
- Aplicação local (sem servidor externo).
- Esta versão abre no navegador padrão (não usa WebView).
- Excel continua legado/importador opcional; SQLite é a fonte principal.
