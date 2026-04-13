
-- Rename enum value
ALTER TYPE public.work_order_status RENAME VALUE 'concluido' TO 'aguardando_instalacao';

-- Update production records
UPDATE public.production SET status = 'Aguardando Instalação' WHERE status = 'Finalizado';

-- Update trigger to use new name
CREATE OR REPLACE FUNCTION public.set_production_data_conclusao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'Aguardando Instalação' AND (OLD.status IS DISTINCT FROM 'Aguardando Instalação') THEN
    NEW.data_conclusao = now();
  END IF;
  IF OLD.status = 'Aguardando Instalação' AND NEW.status <> 'Aguardando Instalação' THEN
    NEW.data_conclusao = NULL;
  END IF;
  RETURN NEW;
END;
$function$;
