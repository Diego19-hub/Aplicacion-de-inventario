BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.business_members') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses y business_members para garantizar un owner activo.';
  END IF;

  IF to_regclass('public.business_members_one_active_owner_per_business') IS NULL THEN
    RAISE EXCEPTION 'Falta el índice parcial de máximo un owner activo por negocio.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.businesses AS business
    LEFT JOIN public.business_members AS member
      ON member.business_id = business.id
     AND member.role = 'owner'
     AND member.status = 'active'
    GROUP BY business.id
    HAVING count(member.id) <> 1
  ) THEN
    RAISE EXCEPTION 'No se puede aplicar 012: cada negocio actual debe tener exactamente un owner activo.';
  END IF;

  IF to_regprocedure('public.enforce_exactly_one_active_owner()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgname IN (
        'business_members_exactly_one_active_owner_trigger',
        'businesses_exactly_one_active_owner_trigger'
      )
    ) THEN
    RAISE EXCEPTION 'La garantía de owner activo de 012 ya parece estar instalada.';
  END IF;
END $$;

CREATE FUNCTION public.enforce_exactly_one_active_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  checked_business_id integer;
  active_owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'businesses' THEN
    checked_business_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END;
  ELSE
    checked_business_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.business_id
      ELSE NEW.business_id
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = checked_business_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::integer
  INTO active_owner_count
  FROM public.business_members
  WHERE business_id = checked_business_id
    AND role = 'owner'
    AND status = 'active';

  IF active_owner_count <> 1 THEN
    RAISE EXCEPTION
      'El negocio % debe tener exactamente un owner activo al confirmar la transacción.',
      checked_business_id;
  END IF;

  IF TG_TABLE_NAME = 'business_members' THEN
    IF TG_OP = 'UPDATE' AND OLD.business_id <> NEW.business_id THEN
      IF EXISTS (SELECT 1 FROM public.businesses WHERE id = OLD.business_id) THEN
        SELECT count(*)::integer
        INTO active_owner_count
        FROM public.business_members
        WHERE business_id = OLD.business_id
          AND role = 'owner'
          AND status = 'active';

        IF active_owner_count <> 1 THEN
          RAISE EXCEPTION
            'El negocio % debe tener exactamente un owner activo al confirmar la transacción.',
            OLD.business_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER business_members_exactly_one_active_owner_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.business_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_exactly_one_active_owner();

CREATE CONSTRAINT TRIGGER businesses_exactly_one_active_owner_trigger
AFTER INSERT OR DELETE ON public.businesses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_exactly_one_active_owner();

COMMIT;
