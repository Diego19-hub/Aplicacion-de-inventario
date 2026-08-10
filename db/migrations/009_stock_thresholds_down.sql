-- Este rollback elimina permanentemente las configuraciones de umbral de stock.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;
DROP TRIGGER IF EXISTS inventory_stock_thresholds_updated_at_trigger ON public.inventory_stock_thresholds;
DROP FUNCTION IF EXISTS public.inventory_stock_thresholds_set_updated_at();
DROP TABLE IF EXISTS public.inventory_stock_thresholds;
COMMIT;
