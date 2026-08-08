-- Este rollback elimina permanentemente todo el historial de movimientos.
BEGIN;
DROP TRIGGER IF EXISTS inventory_movements_immutable_trigger ON public.inventory_movements;
DROP FUNCTION IF EXISTS public.inventory_movements_immutable();
DROP TABLE IF EXISTS public.inventory_movements;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_business_id_id_key;
COMMIT;
