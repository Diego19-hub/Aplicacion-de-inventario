-- RELAJACIÓN DE SEGURIDAD: este rollback deshabilita RLS solo en las tablas
-- donde 010 lo añadió. No restaura privilegios ni EXECUTE público de forma
-- automática, porque hacerlo ampliaría acceso sin una revisión explícita.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL
    OR to_regclass('public.items') IS NULL THEN
    RAISE EXCEPTION 'No se puede relajar RLS: faltan categories o items.';
  END IF;
END
$$;

ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.items DISABLE ROW LEVEL SECURITY;

-- No se conceden privilegios de tabla ni EXECUTE a PUBLIC, anon o
-- authenticated durante el rollback: deben restaurarse solo tras una decisión
-- de seguridad explícita.

COMMIT;
