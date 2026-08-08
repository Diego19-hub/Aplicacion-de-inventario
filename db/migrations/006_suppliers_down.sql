-- Este rollback elimina permanentemente todos los proveedores.
BEGIN;
DROP TRIGGER IF EXISTS suppliers_updated_at_trigger ON public.suppliers;
DROP FUNCTION IF EXISTS public.suppliers_set_updated_at();
DROP INDEX IF EXISTS public.suppliers_business_status_index;
DROP INDEX IF EXISTS public.suppliers_business_name_lower_key;
DROP TABLE IF EXISTS public.suppliers;
COMMIT;
