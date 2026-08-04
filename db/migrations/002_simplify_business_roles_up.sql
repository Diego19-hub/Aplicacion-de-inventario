BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.business_members') IS NULL
    OR to_regclass('public.business_invitations') IS NULL THEN
    RAISE EXCEPTION
      'No se puede simplificar roles: faltan business_members o business_invitations.';
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
      'No se puede simplificar roles: faltan las restricciones de roles esperadas.';
  END IF;
END $$;

UPDATE public.business_members
SET role = 'manager'
WHERE role = 'admin';

UPDATE public.business_members
SET role = 'viewer'
WHERE role = 'employee';

UPDATE public.business_invitations
SET offered_role = 'manager'
WHERE offered_role = 'admin';

UPDATE public.business_invitations
SET offered_role = 'viewer'
WHERE offered_role = 'employee';

ALTER TABLE public.business_members
  DROP CONSTRAINT business_members_role_check;

ALTER TABLE public.business_invitations
  DROP CONSTRAINT business_invitations_offered_role_check;

ALTER TABLE public.business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'manager', 'viewer'));

ALTER TABLE public.business_invitations
  ADD CONSTRAINT business_invitations_offered_role_check
  CHECK (offered_role IN ('manager', 'viewer'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.business_members
    WHERE role NOT IN ('owner', 'manager', 'viewer')
  ) OR EXISTS (
    SELECT 1
    FROM public.business_invitations
    WHERE offered_role NOT IN ('manager', 'viewer')
  ) THEN
    RAISE EXCEPTION
      'La simplificación de roles dejó valores empresariales inválidos.';
  END IF;
END $$;

COMMIT;
