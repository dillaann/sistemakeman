# Módulo de Pintura — Ficha de Controle Epóxi

Novo módulo para gerenciar fichas de pintura vinculadas a OS, com leitura por IA de fichas físicas (PDF/foto), geração de PDF e indicadores no Kanban de Produção.

## 1. Banco de dados (migration)

**Tabela `paint_sheets`** (ficha de pintura)
- `sheet_number` (auto, ex: PT-2026-0001, via counter table `paint_sheet_counters`)
- `sheet_date` (date)
- `work_order_id` (FK opcional)
- `client_name` (texto — Cliente/Obra, para casos sem OS)
- `responsible` (texto)
- `status` ('aguardando' | 'em_pintura' | 'finalizado')
- `completed_at` (timestamp, preenchido ao finalizar)
- `attachment_url` (foto/PDF original)
- `notes`
- created_at / updated_at / created_by

**Tabela `paint_sheet_items`**
- `sheet_id` (FK cascade)
- `item_number` (int)
- `part_name`, `quantity`, `width`, `height`, `color`

**Tabela `paint_sheet_counters`** (year, last_number) + função `next_paint_sheet_number()`.

**Bucket storage** `paint-sheets` (privado) para uploads.

**RLS**: admin e producao podem SELECT/INSERT/UPDATE/DELETE via `has_role`. Grants para authenticated + service_role.

**Trigger**: setar `completed_at = now()` quando status vira `finalizado`, limpar se sair.

## 2. Menu lateral

Adicionar em `AppSidebar.tsx` grupo "Operacional", entre Produção e Compras:
- `{ title: "Pintura", url: "/pintura", icon: PaintBucket, roles: ["admin", "producao"] }`

Em `App.tsx`: rota `/pintura` com `RoleGuard allowed={["admin", "producao"]}`.

## 3. Página `src/pages/Painting.tsx`

- Lista todas as fichas (número, data, cliente/obra, OS, responsável, status como badge colorido).
- Filtros: MonthFilter (padrão do projeto), select de status, select de responsável, busca por cliente/número.
- Botões: **Nova Ficha de Pintura**, **Upload de Ficha** (IA).
- Ações por linha: Ver/Editar, Mudar Status (Aguardando → Em Pintura → Finalizado), Gerar PDF, Excluir (admin).

Sem valores financeiros em nenhum ponto (não há campos financeiros no módulo).

## 4. Componentes

`src/components/painting/PaintSheetDialog.tsx` — criar/editar ficha:
- Cabeçalho: data, número (readonly na criação), select de OS aberta, cliente/obra (auto-preenche do cliente da OS), responsável.
- Tabela de itens: 15 linhas por padrão, botões "+ Adicionar linha" e "− Remover linha", numeração automática. Colunas: Nome da Peça, Quantidade, Largura, Altura, Cor.

`src/components/painting/PaintSheetUploadDialog.tsx` — upload PDF/foto:
- Upload para bucket `paint-sheets`.
- Chama edge function `extract-paint-sheet` (IA).
- Pré-visualiza dados extraídos em `PaintSheetDialog` para revisão/edição antes de salvar.

`src/components/painting/PaintSheetStatusButton.tsx` — alterna status.

## 5. Edge Function `extract-paint-sheet`

- Recebe URL/base64 do arquivo.
- Usa Lovable AI Gateway (`google/gemini-3-flash-preview`) com multimodal (image_url ou PDF file) e `Output.object` para extrair: header (data, cliente, responsável) + items[] (part_name, quantity, width, height, color).
- Retorna JSON. Sem `Anthropic` — usar Lovable AI (default do projeto). Deixarei nota no chat.

## 6. Geração de PDF

`src/lib/generatePaintSheetPDF.ts` usando jsPDF + autoTable, layout igual à ficha física:
- Cabeçalho com `logo-keman-brand.png`, título "FICHA DE CONTROLE DE PINTURA EPÓXI", número e data.
- Bloco Cliente/Obra, Responsável, OS.
- Tabela: Item | Nome da Peça | Qtd | Largura | Altura | Cor.
- Rodapé: data e linha de assinatura do responsável.

## 7. Integração com Produção (Kanban)

Em `src/pages/Production.tsx` (card da OS):
- Query adicional buscando fichas de pintura por `work_order_id`.
- Se existir ficha `em_pintura` ou `aguardando` → badge "Pintura em andamento" (âmbar).
- Se todas as fichas da OS estão `finalizado` → badge "Pintura concluída" (verde).

## Detalhes técnicos

- Tipos do Supabase (`src/integrations/supabase/types.ts`) serão regenerados após a migration.
- Todas as datas via `parseLocalDate`/`formatDateBR`/`localDateString`.
- Tokens semânticos (bg-primary, bg-muted etc.), dark mode ok.
- Nomenclatura pt-BR em UI.
- IA: por padrão do projeto usamos **Lovable AI (Gemini)**, não Anthropic direto — mesmo resultado (leitura multimodal), sem exigir API key do usuário. Se preferir Anthropic, precisamos configurar o secret `ANTHROPIC_API_KEY`.

## Ordem de execução

1. Migration (tabelas, counter, função, trigger, RLS, bucket).
2. Edge function `extract-paint-sheet`.
3. `generatePaintSheetPDF.ts`.
4. Componentes de dialog + upload.
5. Página `Painting.tsx` + rota + item do menu.
6. Badges no Kanban de Produção.
