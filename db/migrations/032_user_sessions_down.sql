BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

-- No se elimina user_sessions: puede haber sido creada por connect-pg-simple
-- y contener sesiones activas, incluso si esta migración se revierte.
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    PERFORM 1;
  END IF;
END
$$;

COMMIT;
