-- 1. Atualizar a OS principal para 15.000
UPDATE public.work_orders 
SET total = 15000 
WHERE id = '2e812d77-241b-42cb-8846-575dae3822f4';

-- 2. Atualizar o Orçamento vinculado para 15.000
UPDATE public.quotes 
SET total = 15000 
WHERE id = '697560ce-ddc8-4b31-9a90-c663f56e0eb7';

-- 3. Ajustar a transação financeira pendente (Saldo) para 3.500 (15.000 total - 11.500 já pagos)
UPDATE public.financial_transactions 
SET amount = 3500, 
    description = 'Saldo Restante - Pavicon Construções Ltda (Total 15.000)'
WHERE id = 'db4c33bc-dbd4-46ee-a510-6c69dec591e9';