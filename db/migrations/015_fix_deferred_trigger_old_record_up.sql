BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.enforce_exactly_one_active_owner()
RETURNS trigger LANGUAGE plpgsql
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
    IF TG_OP = 'UPDATE' THEN
      IF OLD.business_id <> NEW.business_id THEN
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
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_exactly_one_default_category()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  checked_business_id integer;
  default_category_count integer;
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
  INTO default_category_count
  FROM public.categories
  WHERE business_id = checked_business_id
    AND is_default;

  IF default_category_count <> 1 THEN
    RAISE EXCEPTION
      'El negocio % debe tener exactamente una categoría predeterminada.',
      checked_business_id;
  END IF;

  IF TG_TABLE_NAME = 'categories' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.business_id <> NEW.business_id THEN
        IF EXISTS (SELECT 1 FROM public.businesses WHERE id = OLD.business_id) THEN
          SELECT count(*)::integer
          INTO default_category_count
          FROM public.categories
          WHERE business_id = OLD.business_id
            AND is_default;

          IF default_category_count <> 1 THEN
            RAISE EXCEPTION
              'El negocio % debe tener exactamente una categoría predeterminada.',
              OLD.business_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
COMMIT;
