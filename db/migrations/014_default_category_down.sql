BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

-- Destructiva respecto a la configuración de categoría predeterminada:
-- elimina la marca is_default y la garantía de exactamente una por negocio.
DROP TRIGGER IF EXISTS categories_exactly_one_default_category_trigger
  ON public.categories;
DROP TRIGGER IF EXISTS businesses_exactly_one_default_category_trigger
  ON public.businesses;

DROP FUNCTION IF EXISTS public.enforce_exactly_one_default_category();

DROP INDEX IF EXISTS public.categories_one_default_per_business_index;

ALTER TABLE public.categories
  DROP COLUMN IF EXISTS is_default;

COMMIT;
