BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.items') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'No se puede archivar productos: se requieren las tablas items y users.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'No se puede archivar productos: items.status ya existe.';
  END IF;
END $$;

ALTER TABLE public.items
  ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active',
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by INTEGER,
  ADD COLUMN archive_reason VARCHAR(500);

ALTER TABLE public.items
  ADD CONSTRAINT items_status_check CHECK (status IN ('active', 'archived')),
  ADD CONSTRAINT items_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT items_archive_state_check CHECK (
    (status = 'active'
      AND archived_at IS NULL
      AND archived_by IS NULL
      AND archive_reason IS NULL)
    OR
    (status = 'archived'
      AND archived_at IS NOT NULL
      AND archived_by IS NOT NULL
      AND archive_reason IS NOT NULL
      AND archive_reason = btrim(archive_reason)
      AND char_length(archive_reason) BETWEEN 5 AND 500)
  );

CREATE INDEX items_business_status_index ON public.items (business_id, status);

COMMIT;
