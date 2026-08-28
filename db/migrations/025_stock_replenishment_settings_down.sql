BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
DROP INDEX IF EXISTS public.inventory_stock_thresholds_supplier_index;
ALTER TABLE public.inventory_stock_thresholds DROP CONSTRAINT IF EXISTS inventory_stock_thresholds_reviewed_by_business_fkey, DROP CONSTRAINT IF EXISTS inventory_stock_thresholds_supplier_business_fkey, DROP CONSTRAINT IF EXISTS inventory_stock_thresholds_maximum_stock_check, DROP CONSTRAINT IF EXISTS inventory_stock_thresholds_suggested_check, DROP COLUMN IF EXISTS maximum_stock, DROP COLUMN IF EXISTS suggested_replenishment, DROP COLUMN IF EXISTS preferred_supplier_id, DROP COLUMN IF EXISTS alert_enabled, DROP COLUMN IF EXISTS reviewed_at, DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_business_id_id_key;
COMMIT;
