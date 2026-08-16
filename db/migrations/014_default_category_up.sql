BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.categories') IS NULL
    OR to_regclass('public.items') IS NULL THEN
    RAISE EXCEPTION 'No se puede aplicar 014: se requieren businesses, categories e items.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'categories_business_id_id_key'
      AND conrelid = 'public.categories'::regclass
  ) THEN
    RAISE EXCEPTION 'No se puede aplicar 014: falta categories_business_id_id_key.';
  END IF;

  IF to_regprocedure('public.enforce_exactly_one_default_category()') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger
      WHERE tgname IN (
        'categories_exactly_one_default_category_trigger',
        'businesses_exactly_one_default_category_trigger'
      )
    ) THEN
    RAISE EXCEPTION 'La migración 014 ya parece estar instalada.';
  END IF;
END
$$;

ALTER TABLE public.categories
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

UPDATE public.categories
SET is_default = true
WHERE lower(name) = lower('Sin categoría');

INSERT INTO public.categories (business_id, name, description, is_default)
SELECT business.id, 'Sin categoría', '', true
FROM public.businesses AS business
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories AS category
  WHERE category.business_id = business.id
    AND category.is_default
);

CREATE UNIQUE INDEX categories_one_default_per_business_index
  ON public.categories (business_id)
  WHERE is_default;

CREATE FUNCTION public.enforce_exactly_one_default_category()
RETURNS trigger
LANGUAGE plpgsql
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

  IF TG_TABLE_NAME = 'categories'
    AND TG_OP = 'UPDATE'
    AND OLD.business_id <> NEW.business_id
    AND EXISTS (SELECT 1 FROM public.businesses WHERE id = OLD.business_id) THEN
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

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER categories_exactly_one_default_category_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_exactly_one_default_category();

CREATE CONSTRAINT TRIGGER businesses_exactly_one_default_category_trigger
AFTER INSERT OR DELETE ON public.businesses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_exactly_one_default_category();

REVOKE ALL ON FUNCTION public.enforce_exactly_one_default_category() FROM PUBLIC;

COMMIT;
