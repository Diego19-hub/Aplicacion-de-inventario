-- El rollback vuelve a permitir los roles anteriores, pero no puede reconstruir
-- cuáles filas eran admin o employee antes de la conversión a manager o viewer.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.business_members') IS NULL
    OR to_regclass('public.business_invitations') IS NULL THEN
    RAISE EXCEPTION
      'No se puede revertir roles: faltan business_members o business_invitations.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.business_members'::regclass
      AND conname = 'business_members_role_check'
      AND contype = 'c'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.business_invitations'::regclass
      AND conname = 'business_invitations_offered_role_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION
      'No se puede revertir roles: faltan las restricciones de roles esperadas.';
  END IF;
END $$;

ALTER TABLE public.business_members
  DROP CONSTRAINT business_members_role_check;

ALTER TABLE public.business_invitations
  DROP CONSTRAINT business_invitations_offered_role_check;

ALTER TABLE public.business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'employee', 'viewer'));

ALTER TABLE public.business_invitations
  ADD CONSTRAINT business_invitations_offered_role_check
  CHECK (offered_role IN ('admin', 'manager', 'employee', 'viewer'));

COMMIT;
