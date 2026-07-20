# Módulo de Almoxarifado

Novo módulo completo de gestão de estoque com perfil de acesso próprio, integrações com Compras/Produção e alertas.

## 1. Novo perfil de acesso

- Adicionar `almoxarifado` ao enum `app_role` no Postgres.
- Atualizar tipos TS (`AppRole`) em `AuthContext.tsx`, `AppSidebar.tsx`, `RoleGuard` e página de Usuários (`UserManagement.tsx`) — incluir opção "Almoxarifado" no seletor de cargos.
- Conta nova continua pendente (fluxo já existente); admin atribui o cargo.
- Escopo de acesso: apenas `/almoxarifado` e `/pintura`. Sem financeiro/RH/vendas/DRE.

## 2. Banco de dados (migration única)

**Tabelas novas (todas em `public` com RLS + GRANTs):**

- `inventory_items`
  - code (texto, único — gerado auto `ALM-0001` via counter se vazio)
  - name, category (enum textual com CHECK), unit, current_qty (numeric), min_qty (numeric), location, notes
  - unit_price (numeric, atualizado por compras)
  - active (bool)
- `inventory_item_counters` (year int PK, last_number int) + função `next_inventory_code()`.
- `inventory_movements`
  - item_id (FK cascade), type ('entrada'|'saida'|'devolucao'|'ajuste'), quantity, movement_date
  - reason (texto), work_order_id (FK opcional), client_name, responsible, notes
  - purchase_id (FK opcional para vincular a compras)
  - created_by
- `inventory_receipts` (recebimento de compras)
  - purchase_id (FK), item_id (FK), expected_qty, received_qty, status ('aguardando'|'parcial'|'recebido'), received_at, received_by
- `inventory_requests` (pedidos da Produção → Almoxarifado)
  - work_order_id, item_id, requested_qty, delivered_qty, status ('pendente'|'atendido'|'faltando'|'compra_solicitada'), requested_by, fulfilled_by, notes
- `inventory_counts` (inventário físico)
  - count_date, responsible, notes, status ('em_andamento'|'finalizado')
- `inventory_count_items`
  - count_id (FK cascade), item_id, system_qty, physical_qty, difference, adjustment_reason ('quebra'|'perda'|'erro'|'furto'|'outro')

**Triggers:**
- Atualizar `current_qty` em `inventory_items` após INSERT/UPDATE/DELETE em `inventory_movements` (entrada/devolução soma, saída subtrai, ajuste define diferença conforme sinal).
- Ao finalizar um `inventory_count`, gerar movimentações de ajuste automaticamente.

**RLS:** admin e almoxarifado com acesso total (via `has_role`). Produção pode SELECT em itens e criar `inventory_requests`. Compras pode SELECT em itens.

## 3. Menu lateral e rotas

`AppSidebar.tsx`: adicionar em Operacional:
- `{ title: "Almoxarifado", url: "/almoxarifado", icon: Warehouse, roles: ["admin","almoxarifado"] }`

`App.tsx`: rota `/almoxarifado` com `RoleGuard allowed={["admin","almoxarifado"]}`.

Para almoxarifado, também liberar Pintura (`roles: [...,"almoxarifado"]` no item Pintura). Nenhuma outra aba.

## 4. Página `src/pages/Warehouse.tsx`

Tabs:
1. **Painel** — cards: total de itens, itens abaixo do mínimo (vermelho), zerados (vermelho escuro), entradas/saídas do mês, tabela "Últimas movimentações do dia".
2. **Itens** — lista com filtros (categoria, busca, status estoque), botão "Novo Item", editar/excluir.
3. **Movimentações** — lista filtrável por período/tipo/item, botão "Nova Movimentação".
4. **Recebimentos** — lista de `inventory_receipts` pendentes vindos de compras, com botão "Confirmar recebimento" (parcial/total).
5. **Solicitações** — pedidos da produção pendentes; botão "Atender" (gera saída) ou "Solicitar compra".
6. **Inventário** — lista de inventários; iniciar novo, contar itens, finalizar (gera ajustes).
7. **Relatórios** — extrato por item/período, consumo por OS, top itens do mês, exportar PDF/Excel (xlsx + jspdf).

Componentes em `src/components/warehouse/`:
- `ItemDialog.tsx`, `MovementDialog.tsx`, `ReceiveDialog.tsx`, `RequestDialog.tsx`, `CountDialog.tsx`, `WarehouseReportDialog.tsx`.

## 5. Integração com Compras

- No fluxo de marcar compra como paga/recebida em `PurchaseOrders`/`purchases`, criar linhas `inventory_receipts` (status `aguardando`) para cada item comprado (via trigger ou lógica no componente que já muda o status).
- Ao confirmar recebimento no Almoxarifado, criar `inventory_movements` de entrada com `purchase_id` e atualizar `unit_price` do item pelo preço da compra. Status vira `parcial` ou `recebido`.
- Sincronização com catálogo de Materiais: se o item da compra não existir em `inventory_items`, cria automaticamente; se existir, atualiza `unit_price`.

## 6. Integração com Produção

- Botão "Solicitar Materiais" no card do Kanban (`Production.tsx`) para role `producao`/`admin` — abre dialog que cria `inventory_requests` vinculadas à OS.
- Badge no card da OS:
  - "Materiais pendentes" (âmbar) se houver `inventory_requests` `pendente`/`faltando`
  - "Materiais entregues" (verde) se todas `atendido`
- Se saldo insuficiente ao atender, marcar `faltando` + criar `purchase_requests` (usa tabela existente) automaticamente.

## 7. Alertas no menu

- Badge numérica no item "Almoxarifado" do sidebar (admin e almoxarifado): soma de itens abaixo do mínimo + zerados + recebimentos aguardando + solicitações pendentes. Query em `AppSidebar.tsx` similar ao badge de pending users.

## 8. Relatórios

- Extrato de movimentações (filtro período + item) → PDF (jspdf-autotable) e Excel (xlsx).
- Consumo por OS: agrupa saídas por `work_order_id`.
- Top itens do mês: agrupa saídas por item.

## Detalhes técnicos

- Ordem de execução:
  1. Migration (enum role, tabelas, counter, funções, triggers, RLS, grants)
  2. Atualizar tipos e AuthContext/Sidebar/RoleGuard/UserManagement para o novo cargo
  3. Página `Warehouse.tsx` + subcomponentes + rota
  4. Integração de Compras (hook no fluxo de recebimento)
  5. Integração de Produção (botão + badges no Kanban)
  6. Alertas no sidebar + Relatórios

- Sem alteração em módulos financeiros/RH/vendas/DRE.
- Datas via `parseLocalDate`/`formatDateBR`/`localDateString`.
- Tokens semânticos, dark mode, pt-BR.

## Observação

Escopo é grande — vou executar tudo em sequência sem parar para perguntar, salvo se aparecer decisão de produto (ex: se você quiser habilitar geração automática de `purchase_requests` quando faltar estoque, ou deixar apenas sinalizado). Padrão: gerar automaticamente.

Confirma para eu começar?
