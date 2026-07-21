# Módulo de Conciliação Bancária Inteligente

Nova aba **Conciliação** dentro de `/financeiro`. Nenhuma ação altera dados sem confirmação explícita do usuário — essa regra é aplicada em cada botão e em cada mutação.

## Escopo desta entrega (Fase 1)

Entrego um MVP funcional e sólido, priorizando o núcleo do fluxo. Recursos avançados de auditoria detalhada e aprendizado ficam sinalizados como Fase 2 para não inflar o primeiro release.

Incluído agora:
- Upload e parsing de **OFX, CSV e XLSX** (PDF/TXT fica para Fase 2 — exigem OCR/heurísticas e alto risco de erro silencioso).
- Motor de matching com pontuação configurável.
- 5 abas: Resumo, Conciliados (sugeridos), Pendentes, Somente no Extrato, Somente no Sistema.
- Confirmação obrigatória em toda ação (conciliar, criar, editar, excluir, ignorar).
- Histórico de ações da sessão de conciliação.

Fase 2 (não nesta entrega, apenas registrado):
- Parsing de PDF e TXT.
- Aprendizado adaptativo de pesos por padrão de descrição.
- Registro de IP por ação e histórico global auditável fora da sessão.

## Estrutura de dados

Novas tabelas em `public`:

- `bank_reconciliation_sessions` — uma sessão por upload de extrato.
  - Campos-chave: `account_id` (FK `financial_accounts`), `file_name`, `period_start`, `period_end`, `statement_balance`, `imported_by`, `status` (`aberta` | `fechada`).
- `bank_statement_entries` — linhas do extrato importado.
  - Campos-chave: `session_id`, `entry_date`, `entry_time`, `type` (pix/ted/doc/boleto/tarifa/…), `amount`, `direction` (`entrada` | `saida`), `description`, `counterparty_name`, `counterparty_document`, `pix_key`, `bank`, `agency`, `account`, `document_number`, `external_id`, `raw` (jsonb), `status` (`pendente` | `conciliado` | `ignorado` | `adicionado`), `matched_transaction_id` (FK `financial_transactions`, nullable), `match_score`, `confirmed_by`, `confirmed_at`.
- `bank_reconciliation_actions` — log da sessão.
  - Campos-chave: `session_id`, `actor_id`, `action` (`import` | `confirm_match` | `unmatch` | `create_transaction` | `edit_transaction` | `delete_transaction` | `ignore` | `restore`), `statement_entry_id`, `transaction_id`, `before` (jsonb), `after` (jsonb).

Regras:
- RLS habilitada; policies para `admin` e `financeiro`.
- GRANT para `authenticated` e `service_role`.
- Trigger de `updated_at`.
- Sem CASCADE para `financial_transactions` (para não apagar lançamento real ao remover uma sessão).

## Motor de matching (client-side, TypeScript)

`src/lib/bank-reconciliation/matching.ts`:
- Entrada: lista de `bank_statement_entries` da sessão + `financial_transactions` do período (±N dias, N configurável, default 3).
- Para cada linha do extrato, calcula score contra cada transação candidata:
  - Valor igual (tolerância R$0,01): +50; diferente: descarta candidato.
  - Mesmo direction (entrada/saida): obrigatório.
  - Mesma data: +20; ±1 dia: +12; ±2: +6; além: -50.
  - Nome via fuzzy (Dice/Levenshtein normalizado em `src/lib/bank-reconciliation/fuzzy.ts`): 0..+15.
  - CPF/CNPJ igual: +100.
  - Chave PIX igual: +100.
  - Documento igual: +80.
  - Mesmo banco: +5.
  - Descrição similar (tokens PIX/TED/…): 0..+10.
  - Já usado por outra linha: -20.
- Classificação:
  - `>= 90` e melhor candidato com folga ≥ 20 → **Sugerido conciliado** (aguarda confirmação).
  - `40..89` → **Pendente** com top-3 candidatos.
  - `< 40` ou sem candidato → **Somente no Extrato**.
- Transações do período sem nenhuma linha correspondente → **Somente no Sistema**.

Pesos ficam num objeto exportado para futuro ajuste.

## Parsers

`src/lib/bank-reconciliation/parsers/`:
- `ofx.ts`: parser leve de SGML OFX (`<STMTTRN>` → data, valor, tipo, memo, fitid, checknum).
- `csv.ts`: usa PapaParse com detecção de cabeçalho e mapeamento inteligente (Data, Valor, Descrição, Documento, Tipo). Permite ao usuário confirmar o mapeamento de colunas antes de importar.
- `xlsx.ts`: usa `xlsx` (SheetJS) já disponível no projeto; mesmo mapeamento assistido.

Cada parser devolve `BankStatementEntry[]` normalizado.

Dependências novas: `papaparse` (+ types). `xlsx` já é usado no projeto; se não, adicionar.

## UI

Nova aba **Conciliação** em `src/pages/Financial.tsx` (ícone `Repeat`).

Componentes em `src/components/financial/reconciliation/`:
- `ReconciliationTab.tsx` — container: seletor de conta + botão "Nova conciliação".
- `ImportDialog.tsx` — wizard: escolher conta → upload → (para CSV/XLSX) mapear colunas → preview → confirmar importação.
- `SessionView.tsx` — sessão aberta com sub-abas:
  - **Resumo**: cards com totais (entradas, saídas, conciliado, pendente, saldo extrato, saldo sistema, diferença).
  - **Sugeridos**: pares extrato↔lançamento com badge de score, botões `Confirmar` / `Rejeitar` / `Trocar correspondência`.
  - **Pendentes**: linha do extrato + top-3 candidatos, botão `Escolher` por candidato.
  - **Somente no Extrato**: linha + botão `Adicionar ao financeiro` (abre `NewTransactionFromEntryDialog` pré-preenchido) e `Ignorar`.
  - **Somente no Sistema**: transação + botões `Marcar conciliado manualmente`, `Editar`, `Excluir`, `Ignorar`.
  - **Histórico**: ações da sessão.
- `ConfirmActionDialog.tsx` — modal genérico exibindo antes/depois. Todo botão destrutivo ou de criação passa por aqui.

Estados visuais: 🟢 conciliado, 🟡 pendente, 🔴 divergência de valor destacada, 🔵 novo no extrato, cinza para ignorados.

## Fluxo de confirmação (regra invariante)

Toda mutação (`confirm_match`, `create_transaction`, `edit_transaction`, `delete_transaction`, `ignore`, `restore`) passa por `ConfirmActionDialog` que:
1. Mostra resumo humano da ação.
2. Mostra diff antes/depois quando aplicável.
3. Só ao clicar "Confirmar" chama a mutação (React Query) e grava em `bank_reconciliation_actions`.

## Permissões

- Rota `/financeiro` já restrita a `admin` e `financeiro` — a nova aba herda.
- Policies das novas tabelas: `SELECT/INSERT/UPDATE/DELETE` para usuários com `has_role(auth.uid(), 'admin')` ou `has_role(auth.uid(), 'financeiro')`.

## Detalhes técnicos

- Migração única com as 3 tabelas + GRANTs + RLS + policies + trigger `updated_at`.
- `src/lib/bank-reconciliation/` concentra parsing, fuzzy match e scoring, sem dependência de Supabase (facilita teste).
- Testes Vitest em `src/lib/__tests__/bank-reconciliation.test.ts`: casos de score (valor exato, CPF igual, nome fuzzy, data ±2 dias, sem match).
- Nenhum trigger no Supabase para conciliação — todas as mutações vêm de ações confirmadas na UI.
- Datas tratadas via `parseLocalDate`/`localDateString` (regra do projeto).
- Nada é criado/alterado em `financial_transactions` sem clique explícito na UI.

## Fora de escopo (para não confundir)

- Não altera o módulo de Saídas/Entradas existentes.
- Não mexe em HR, Compras, DRE.
- Não altera nada em `financial_transactions` até o usuário confirmar dentro do módulo novo.

Confirma para eu implementar?
