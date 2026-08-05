-- Este rollback elimina permanentemente los SKU creados o editados desde la migración 003.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.items_business_sku_lower_key;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_sku_format_check;
ALTER TABLE public.items DROP COLUMN IF EXISTS sku;

COMMIT;
