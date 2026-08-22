BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.items_business_barcode_unique;
ALTER TABLE public.items DROP COLUMN IF EXISTS barcode;

COMMIT;
