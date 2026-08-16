-- Este rollback no restaura EXECUTE para PUBLIC: concederlo ampliaría acceso
-- inseguro y requiere una decisión explícita de seguridad fuera de la migración.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regprocedure('public.enforce_exactly_one_active_owner()') IS NULL THEN
    RAISE EXCEPTION
      'No se puede revertir 013: falta la función public.enforce_exactly_one_active_owner().';
  END IF;
END
$$;

-- No se modifican objetos, datos ni privilegios de 012.
COMMIT;
