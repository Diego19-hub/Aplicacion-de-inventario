BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regprocedure('public.enforce_exactly_one_active_owner()') IS NULL THEN
    RAISE EXCEPTION
      'No se puede aplicar 013: falta la función public.enforce_exactly_one_active_owner().';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_exactly_one_active_owner() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'public.enforce_exactly_one_active_owner()'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'No se pudo revocar EXECUTE de PUBLIC sobre enforce_exactly_one_active_owner().';
  END IF;
END
$$;

COMMIT;
