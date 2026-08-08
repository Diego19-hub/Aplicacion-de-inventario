-- Este rollback elimina permanentemente los metadatos de archivado de todos los productos.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.items_business_status_index;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_archive_state_check;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_archived_by_fkey;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE public.items
  DROP COLUMN IF EXISTS archive_reason,
  DROP COLUMN IF EXISTS archived_by,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS status;

COMMIT;
