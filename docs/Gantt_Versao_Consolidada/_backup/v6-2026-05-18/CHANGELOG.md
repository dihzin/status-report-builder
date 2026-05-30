# Backup v6 — 2026-05-18

Snapshot estável capturado APÓS coluna Dependências, ANTES da coluna ID.

## Diferenças vs. v5-2026-05-18

### Novidade no gantt-v3.html
- **Coluna Dependências no painel lateral** — mostra IDs predecessores (ex: `4, 5`), tooltip com nomes ao hover. Default visível. Ocultável via View Manager. Vazia em linhas de resumo.

## Próxima onda

Após este backup, adicionar:
1. **Coluna ID** como primeira coluna do painel, largura 50px, mostra id estável (100, 2, 18, etc.). Ocultável via View Manager.

Depois: discussão sobre coluna WBS (id posicional hierárquico tipo "1.2.3").

## Restauração

Copiar arquivos desta pasta de volta para a raiz. Para limpar localStorage, usar URL `?reset=1`.
